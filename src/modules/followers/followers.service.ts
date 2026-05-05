import { FriendStatus } from "../../prisma/generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import { decodeCursor, encodeCursor } from "../../utils/cursor";
import { AppError } from "../../utils/app-error";

// ─── Follow ───────────────────────────────────────────────
export const follow = async (myId: string, targetId: string) => {
  if (myId === targetId)
    throw new AppError(400, "Không thể tự follow bản thân");

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target || !target.isActive)
    throw new AppError(404, "Người dùng không tồn tại");

  const existing = await prisma.follower.findUnique({
    where: {
      followerId_followingId: { followerId: myId, followingId: targetId },
    },
  });
  if (existing) throw new AppError(409, "Đã theo dõi người này rồi");

  const blocked = await prisma.friendship.findFirst({
    where: {
      OR: [
        { senderId: myId, receiverId: targetId },
        { senderId: targetId, receiverId: myId },
      ],
      status: FriendStatus.BLOCKED,
    },
  });
  if (blocked) throw new AppError(403, "Không thể theo dõi người này");

  const [follower] = await prisma.$transaction([
    prisma.follower.create({
      data: { followerId: myId, followingId: targetId },
    }),
    prisma.user.update({
      where: { id: targetId },
      data: { followersCount: { increment: 1 } },
    }),
    prisma.user.update({
      where: { id: myId },
      data: { followingCount: { increment: 1 } },
    }),
  ]);

  const [followerUser, followingUser] = await Promise.all([
    prisma.user.findUnique({
      where: { id: myId },
      select: { id: true, username: true, avatar: true, followersCount: true },
    }),
    prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, username: true, avatar: true, followersCount: true },
    }),
  ]);

  return { message: "Đã theo dõi", follower };
};

// ─── Unfollow ─────────────────────────────────────────────
export const unfollow = async (myId: string, targetId: string) => {
  const existing = await prisma.follower.findUnique({
    where: {
      followerId_followingId: { followerId: myId, followingId: targetId },
    },
  });
  if (!existing) throw new AppError(404, "Bạn chưa theo dõi người này");

  await prisma.$transaction([
    prisma.follower.delete({ where: { id: existing.id } }),
    prisma.user.update({
      where: { id: targetId },
      data: { followersCount: { decrement: 1 } },
    }),
    prisma.user.update({
      where: { id: myId },
      data: { followingCount: { decrement: 1 } },
    }),
  ]);

  return { message: "Đã bỏ theo dõi" };
};

// ─── Get followers of :id ─────────────────────────────────
export const getFollowers = async (
  targetId: string,
  myId: string,
  cursor?: string,
  limit = 20,
) => {
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target || !target.isActive)
    throw new AppError(404, "Người dùng không tồn tại");

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

  const rows = await prisma.follower.findMany({
    where: {
      followingId: targetId,
      ...cursorCondition,
      follower: { isActive: true },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: {
      follower: {
        select: {
          id: true,
          username: true,
          avatar: true,
          followersCount: true,
        },
      },
    },
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  // Batch: check if myId is following each of these followers
  const followerIds = items.map((r) => r.followerId);
  const myFollowings = await prisma.follower.findMany({
    where: { followerId: myId, followingId: { in: followerIds } },
    select: { followingId: true },
  });
  const followingSet = new Set(myFollowings.map((f) => f.followingId));

  const data = items.map((r) => ({
    ...r.follower,
    isFollowing: followingSet.has(r.follower.id),
  }));

  const lastItem = items[items.length - 1];
  const nextCursor =
    hasMore && lastItem
      ? encodeCursor({
          field: lastItem.createdAt.toISOString(),
          id: lastItem.id,
        })
      : null;

  return { data, nextCursor, hasMore };
};

// ─── Get following of :id ─────────────────────────────────
export const getFollowing = async (
  targetId: string,
  myId: string,
  cursor?: string,
  limit = 20,
) => {
  const target = await prisma.user.findUnique({
    where: { id: targetId, isActive: true },
  });
  if (!target || !target.isActive)
    throw new AppError(404, "Người dùng không tồn tại");

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

  const rows = await prisma.follower.findMany({
    where: {
      followerId: targetId,
      ...cursorCondition,
      following: { isActive: true },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: {
      following: {
        select: {
          id: true,
          username: true,
          avatar: true,
          followersCount: true,
        },
      },
    },
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const data = items.map((r) => r.following);

  const lastItem = items[items.length - 1];
  const nextCursor =
    hasMore && lastItem
      ? encodeCursor({
          field: lastItem.createdAt.toISOString(),
          id: lastItem.id,
        })
      : null;

  return { data, nextCursor, hasMore };
};

// ─── Follow status ────────────────────────────────────────
export const getFollowStatus = async (myId: string, targetId: string) => {
  const record = await prisma.follower.findUnique({
    where: {
      followerId_followingId: { followerId: myId, followingId: targetId },
    },
  });
  return { isFollowing: !!record };
};
