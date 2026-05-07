import { AppError } from "../../utils/app-error";
import { prisma } from "../../lib/prisma";
import { decodeCursor, encodeCursor } from "../../utils/cursor";
import { deleteManyResources } from "../../services/cloudinary.service";
import {
  FriendStatus,
  Privacy,
  NotifType,
} from "../../prisma/generated/prisma/enums";
import { safeEmit } from "../../socket";
import { createAndEmitNotification } from "../notifications/notifications.service";

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

// ─── Helper: resolve audience ids for a post ─────────────
const resolveAudienceIds = async (
  userId: string,
  privacy: Privacy,
): Promise<string[]> => {
  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [
        { senderId: userId, receiver: { isActive: true } },
        { receiverId: userId, sender: { isActive: true } },
      ],
      status: FriendStatus.ACCEPTED,
    },
    select: { senderId: true, receiverId: true },
  });
  const friendIds = friendships.map((f) =>
    f.senderId === userId ? f.receiverId : f.senderId,
  );

  if (privacy === Privacy.FRIENDS) return friendIds;

  if (privacy === Privacy.PUBLIC) {
    const followings = await prisma.follower.findMany({
      where: { followingId: userId, follower: { isActive: true } },
      select: { followerId: true },
    });
    const followerIds = followings
      .map((f) => f.followerId)
      .filter((id) => !friendIds.includes(id) && id !== userId);
    return [...new Set([...friendIds, ...followerIds])];
  }

  return []; // ONLY_ME → no one else
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
    id: post.id,
    userId: post.userId,
    content: post.content,
    mediaUrls: post.mediaUrls,
    privacy: post.privacy,
    likesCount: post.likesCount,
    commentsCount: post.commentsCount,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    user: post.user,
    _count: post._count,
    reactions: post.reactions,
  };

  safeEmit(`user:${userId}`, "post:created", { post: postPayload });

  if (data.privacy !== Privacy.ONLY_ME) {
    const audienceIds = await resolveAudienceIds(userId, data.privacy);

    for (const recipientId of audienceIds) {
      safeEmit(`user:${recipientId}`, "feed:new_post", { post: postPayload });
    }

    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { senderId: userId, receiver: { isActive: true } },
          { receiverId: userId, sender: { isActive: true } },
        ],
        status: FriendStatus.ACCEPTED,
      },
      select: { senderId: true, receiverId: true },
    });
    const friendIds = friendships.map((f) =>
      f.senderId === userId ? f.receiverId : f.senderId,
    );

    for (const friendId of friendIds) {
      await createAndEmitNotification({
        userId: friendId,
        fromUserId: userId,
        type: NotifType.NEW_POST,
        postId: post.id,
      });
    }
  }

  return { ok: true, post: postPayload };
};

// ─── Get feed ─────────────────────────────────────────────
export const getFeed = async (myId: string, cursor?: string, limit = 10) => {
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

  const followings = await prisma.follower.findMany({
    where: { followerId: myId, following: { isActive: true } },
    select: { followingId: true },
  });
  const followingIds = followings.map((f) => f.followingId);

  const blocks = await prisma.friendship.findMany({
    where: {
      OR: [{ senderId: myId }, { receiverId: myId }],
      status: FriendStatus.BLOCKED,
    },
  });
  const blockedIds = blocks.map((b) =>
    b.senderId === myId ? b.receiverId : b.senderId,
  );

  const friendSet = new Set(friendIds);
  const followOnlyIds = followingIds.filter((id) => !friendSet.has(id));

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
            { userId: myId },
            {
              userId: { in: friendIds },
              privacy: { in: [Privacy.PUBLIC, Privacy.FRIENDS] },
            },
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

  const updated = await prisma.post.update({
    where: { id: postId },
    data,
    include: POST_INCLUDE(myId),
  });

  const privacyChanged =
    data.privacy !== undefined && data.privacy !== post.privacy;

  const updatedPayload = { post: updated, privacyChanged };

  safeEmit(`user:${myId}`, "post:updated", updatedPayload);
  safeEmit(`post:${postId}`, "post:updated", updatedPayload);

  if (privacyChanged) {
    const [prevIds, nextIds] = await Promise.all([
      resolveAudienceIds(myId, post.privacy as Privacy),
      resolveAudienceIds(myId, data.privacy!),
    ]);
    const allAffectedIds = [...new Set([...prevIds, ...nextIds])].filter(
      (id) => id !== myId,
    );
    for (const recipientId of allAffectedIds) {
      safeEmit(`user:${recipientId}`, "post:updated", updatedPayload);
    }
  } else {
    const audienceIds = await resolveAudienceIds(
      myId,
      updated.privacy as Privacy,
    );
    for (const recipientId of audienceIds) {
      safeEmit(`user:${recipientId}`, "post:updated", updatedPayload);
    }
  }

  return { ok: true, post: updated };
};

// ─── Delete post ──────────────────────────────────────────
export const deletePost = async (postId: string, myId: string) => {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw new AppError(404, "Bài viết không tồn tại");
  if (post.userId !== myId)
    throw new AppError(403, "Bạn không có quyền xoá bài viết này");

  // Resolve audience trước khi xoá để emit sau
  const audienceIds =
    post.privacy !== Privacy.ONLY_ME
      ? await resolveAudienceIds(myId, post.privacy as Privacy)
      : [];

  if (post.mediaUrls.length)
    await deleteManyResources(post.mediaUrls).catch(() => null);

  await prisma.post.delete({ where: { id: postId } });

  const deletedPayload = { postId, userId: myId };

  safeEmit(`user:${myId}`, "post:deleted", deletedPayload);

  safeEmit(`post:${postId}`, "post:deleted", deletedPayload);

  for (const recipientId of audienceIds) {
    safeEmit(`user:${recipientId}`, "post:deleted", deletedPayload);
  }

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

  const blocked = await prisma.friendship.findFirst({
    where: {
      OR: [
        { senderId: myId, receiverId: targetId, receiver: { isActive: true } },
        { senderId: targetId, receiverId: myId, sender: { isActive: true } },
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
          { senderId: targetId, receiverId: myId, sender: { isActive: true } },
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
