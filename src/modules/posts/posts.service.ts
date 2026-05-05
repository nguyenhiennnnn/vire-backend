import { AppError } from "../../utils/app-error";
import { prisma } from "../../lib/prisma";
import { decodeCursor, encodeCursor } from "../../utils/cursor";
import { deleteManyResources } from "../../services/cloudinary.service";
import { FriendStatus, Privacy } from "../../prisma/generated/prisma/enums";

const POST_INCLUDE = (myId: string) => ({
  user: { select: { id: true, username: true, avatar: true } },
  _count: { select: { reactions: true, comments: true } },
  reactions: {
    where: { userId: myId },
    select: { type: true },
    take: 1,
  },
});

// ─── Check post view permission ───────────────────────────
export const checkPostPermission = async (
  postId: string,
  myId: string,
): Promise<{
  id: string;
  userId: string;
  privacy: Privacy;
  commentsCount: number;
}> => {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw new AppError(404, "Bài viết không tồn tại");

  if (post.userId === myId) return post;

  // Check blocked
  const blocked = await prisma.friendship.findFirst({
    where: {
      OR: [
        { senderId: myId, receiverId: post.userId },
        { senderId: post.userId, receiverId: myId },
      ],
      status: FriendStatus.BLOCKED,
    },
  });
  if (blocked) throw new AppError(403, "Không có quyền xem bài viết này");

  if (post.privacy === Privacy.ONLY_ME)
    throw new AppError(403, "Không có quyền xem bài viết này");

  if (post.privacy === Privacy.FRIENDS) {
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { senderId: myId, receiverId: post.userId },
          { senderId: post.userId, receiverId: myId },
        ],
        status: FriendStatus.ACCEPTED,
      },
    });
    if (!friendship) throw new AppError(403, "Không có quyền xem bài viết này");
  }

  return post;
};

// ─── Create post ──────────────────────────────────────────
export const createPost = async (
  userId: string,
  data: { content?: string; mediaUrls?: string[]; privacy: Privacy },
) => {
  const post = await prisma.post.create({
    data: {
      userId,
      content: data.content,
      mediaUrls: data.mediaUrls ?? [],
      privacy: data.privacy,
    },
    include: POST_INCLUDE(userId),
  });

  const postPayload = {
    post: {
      id: post.id,
      userId: post.userId,
      content: post.content,
      mediaUrls: post.mediaUrls,
      privacy: post.privacy,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      user: post.user,
      _count: post._count,
      reactions: post.reactions,
      commentsCount: post.commentsCount,
      likesCount: post.likesCount,
    },
  };

  if (post.privacy !== "ONLY_ME") {
    try {
      const friendships = await prisma.friendship.findMany({
        where: {
          OR: [{ senderId: userId }, { receiverId: userId }],
          status: FriendStatus.ACCEPTED,
        },
        select: { senderId: true, receiverId: true },
      });
      const friendIds = friendships.map((f) =>
        f.senderId === userId ? f.receiverId : f.senderId,
      );

      let targetIds = [...friendIds];
      if (post.privacy === "PUBLIC") {
        const followings = await prisma.follower.findMany({
          where: { followingId: userId },
          select: { followerId: true },
        });
        const followerIds = followings
          .map((f) => f.followerId)
          .filter((id) => !friendIds.includes(id) && id !== userId);
        targetIds = [...friendIds, ...followerIds];
      }
    } catch {
      /* socket not init */
    }
  }

  return { ok: true };
};

// ─── Get feed ─────────────────────────────────────────────
export const getFeed = async (myId: string, cursor?: string, limit = 10) => {
  // IDs bạn bè
  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [
        { senderId: myId, receiver: { isActive: true } },
        { receiverId: myId, sender: { isActive: true } },
      ],
      status: FriendStatus.ACCEPTED,
    },
  });
  const friendIds = friendships.map((f) =>
    f.senderId === myId ? f.receiverId : f.senderId,
  );

  // IDs đang follow
  const followings = await prisma.follower.findMany({
    where: { followerId: myId, following: { isActive: true } },
    select: { followingId: true },
  });
  const followingIds = followings.map((f) => f.followingId);

  // IDs bị block
  const blocks = await prisma.friendship.findMany({
    where: {
      OR: [
        { senderId: myId, sender: { isActive: true } },
        { receiverId: myId, receiver: { isActive: true } },
      ],
      status: FriendStatus.BLOCKED,
    },
  });
  const blockedIds = blocks.map((b) =>
    b.senderId === myId ? b.receiverId : b.senderId,
  );

  const friendSet = new Set(friendIds);
  // following không là bạn bè (chỉ xem PUBLIC)
  const followOnlyIds = followingIds.filter((id) => !friendSet.has(id));

  // Decode cursor
  let cursorCondition = {};
  if (cursor) {
    const { field, id } = decodeCursor(cursor);
    cursorCondition = {
      OR: [
        { createdAt: { lt: new Date(field) } },
        { createdAt: new Date(field), id: { lt: id } },
      ],
    };
  }

  const posts = await prisma.post.findMany({
    where: {
      AND: [
        cursorCondition,
        { userId: { notIn: blockedIds } },
        {
          OR: [
            // Bài của mình — tất cả privacy
            { userId: myId },
            // Bài của bạn bè — PUBLIC + FRIENDS
            {
              userId: { in: friendIds },
              privacy: { in: [Privacy.PUBLIC, Privacy.FRIENDS] },
            },
            // Bài của following only — chỉ PUBLIC
            { userId: { in: followOnlyIds }, privacy: Privacy.PUBLIC },
          ],
        },
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: POST_INCLUDE(myId),
  });

  const hasMore = posts.length > limit;
  const data = hasMore ? posts.slice(0, limit) : posts;
  const lastItem = data[data.length - 1];
  const nextCursor =
    hasMore && lastItem
      ? encodeCursor({
          field: lastItem.createdAt.toISOString(),
          id: lastItem.id,
        })
      : null;

  return { data, nextCursor, hasMore };
};

// ─── Get post by id ───────────────────────────────────────
export const getPostById = async (postId: string, myId: string) => {
  await checkPostPermission(postId, myId);
  const post = await prisma.post.findUnique({
    where: { id: postId, user: { isActive: true } },
    include: POST_INCLUDE(myId),
  });
  return { post };
};

// ─── Update post ──────────────────────────────────────────
export const updatePost = async (
  postId: string,
  myId: string,
  data: { content?: string; privacy?: Privacy },
) => {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw new AppError(404, "Bài viết không tồn tại");
  if (post.userId !== myId)
    throw new AppError(403, "Bạn không có quyền chỉnh sửa bài viết này");

  await prisma.post.update({
    where: { id: postId },
    data,
    include: POST_INCLUDE(myId),
  });

  return { ok: true };
};

// ─── Delete post ──────────────────────────────────────────
export const deletePost = async (postId: string, myId: string) => {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw new AppError(404, "Bài viết không tồn tại");
  if (post.userId !== myId)
    throw new AppError(403, "Bạn không có quyền xoá bài viết này");

  if (post.mediaUrls.length)
    await deleteManyResources(post.mediaUrls).catch(() => null);

  await prisma.post.delete({ where: { id: postId } });

  return { ok: true };
};

// ─── Get user posts ───────────────────────────────────────
export const getUserPosts = async (
  targetId: string,
  myId: string,
  cursor?: string,
  limit = 10,
) => {
  const target = await prisma.user.findUnique({
    where: { id: targetId, isActive: true },
  });
  if (!target || !target.isActive)
    throw new AppError(404, "Người dùng không tồn tại");

  // Check blocked
  const blocked = await prisma.friendship.findFirst({
    where: {
      OR: [
        {
          senderId: myId,
          receiverId: targetId,
          receiver: { isActive: true },
        },
        {
          senderId: targetId,
          receiverId: myId,
          sender: { isActive: true },
        },
      ],
      status: FriendStatus.BLOCKED,
    },
  });
  if (blocked) throw new AppError(403, "Không có quyền xem");

  let privacyFilter: Privacy[];
  if (myId === targetId) {
    privacyFilter = [Privacy.PUBLIC, Privacy.FRIENDS, Privacy.ONLY_ME];
  } else {
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          {
            senderId: myId,
            receiverId: targetId,
            receiver: { isActive: true },
          },
          {
            senderId: targetId,
            receiverId: myId,
            sender: { isActive: true },
          },
        ],
        status: FriendStatus.ACCEPTED,
      },
    });
    privacyFilter = friendship
      ? [Privacy.PUBLIC, Privacy.FRIENDS]
      : [Privacy.PUBLIC];
  }

  let cursorCondition = {};
  if (cursor) {
    const { field, id } = decodeCursor(cursor);
    cursorCondition = {
      OR: [
        { createdAt: { lt: new Date(field) } },
        { createdAt: new Date(field), id: { lt: id } },
      ],
    };
  }

  const posts = await prisma.post.findMany({
    where: {
      userId: targetId,
      privacy: { in: privacyFilter },
      ...cursorCondition,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: POST_INCLUDE(myId),
  });

  const hasMore = posts.length > limit;
  const data = hasMore ? posts.slice(0, limit) : posts;
  const lastItem = data[data.length - 1];
  const nextCursor =
    hasMore && lastItem
      ? encodeCursor({
          field: lastItem.createdAt.toISOString(),
          id: lastItem.id,
        })
      : null;

  return { data, nextCursor, hasMore };
};
