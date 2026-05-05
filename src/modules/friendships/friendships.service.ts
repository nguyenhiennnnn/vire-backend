import { FriendStatus } from "../../prisma/generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import { createAndEmitNotification } from "../../services/notification.service";
import { getSocketInstance } from "../../socket";
import { decodeCursor, encodeCursor } from "../../utils/cursor";
import { AppError } from "../../utils/app-error";

// ─── Helper: get friend ids ───────────────────────────────
export const getMyFriendIds = async (userId: string): Promise<string[]> => {
  const rows = await prisma.friendship.findMany({
    where: {
      status: FriendStatus.ACCEPTED,
      OR: [
        { senderId: userId, receiver: { isActive: true } },
        { receiverId: userId, sender: { isActive: true } },
      ],
    },
    select: { senderId: true, receiverId: true },
  });
  return rows.map((r) => (r.senderId === userId ? r.receiverId : r.senderId));
};

// ─── Helper: get blocked ids ──────────────────────────────
const getBlockedIds = async (userId: string): Promise<string[]> => {
  const rows = await prisma.friendship.findMany({
    where: {
      OR: [
        { senderId: userId, receiver: { isActive: true } },
        { receiverId: userId, sender: { isActive: true } },
      ],
      status: FriendStatus.BLOCKED,
    },
    select: { senderId: true, receiverId: true },
  });
  return rows.map((r) => (r.senderId === userId ? r.receiverId : r.senderId));
};

// ─── Send friend request ──────────────────────────────────
export const sendRequest = async (myId: string, targetId: string) => {
  if (myId === targetId)
    throw new AppError(400, "Không thể gửi lời mời cho chính mình");

  const target = await prisma.user.findUnique({
    where: { id: targetId, isActive: true },
  });
  if (!target || !target.isActive)
    throw new AppError(404, "Người dùng không tồn tại");

  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { senderId: myId, receiverId: targetId },
        { senderId: targetId, receiverId: myId },
      ],
    },
  });

  if (existing) {
    if (existing.status === FriendStatus.ACCEPTED)
      throw new AppError(409, "Đã là bạn bè");
    if (existing.status === FriendStatus.PENDING && existing.senderId === myId)
      throw new AppError(409, "Đã gửi lời mời rồi");
    if (
      existing.status === FriendStatus.PENDING &&
      existing.receiverId === myId
    )
      throw new AppError(
        409,
        "Người này đã gửi lời mời cho bạn, hãy chấp nhận",
      );
    if (existing.status === FriendStatus.BLOCKED)
      throw new AppError(403, "Không thể gửi lời mời");
  }

  const friendship = await prisma.friendship.create({
    data: {
      senderId: myId,
      receiverId: targetId,
      status: FriendStatus.PENDING,
    },
  });

  await createAndEmitNotification({
    userId: targetId,
    fromUserId: myId,
    type: "FRIEND_REQUEST",
    friendshipId: friendship.id,
    targetType: "friendship",
  });

  const me = await prisma.user.findUnique({
    where: { id: myId },
    select: { id: true, username: true, avatar: true },
  });

  try {
    getSocketInstance()
      .to(`user:${targetId}`)
      .to(`user:${myId}`)
      .emit("friend_request_sent", { friendship, sender: me });
  } catch {
    /* socket not ready */
  }

  return { ok: true };
};

// ─── Accept ───────────────────────────────────────────────
export const acceptRequest = async (myId: string, senderId: string) => {
  const friendship = await prisma.friendship.findFirst({
    where: { senderId, receiverId: myId, status: FriendStatus.PENDING },
  });
  if (!friendship) throw new AppError(404, "Không tìm thấy lời mời kết bạn");

  const [updated] = await prisma.$transaction([
    prisma.friendship.update({
      where: { id: friendship.id },
      data: { status: FriendStatus.ACCEPTED },
    }),
    prisma.user.update({
      where: { id: myId },
      data: { friendsCount: { increment: 1 } },
    }),
    prisma.user.update({
      where: { id: senderId },
      data: { friendsCount: { increment: 1 } },
    }),
  ]);

  await createAndEmitNotification({
    userId: senderId,
    fromUserId: myId,
    type: "FRIEND_ACCEPTED",
    friendshipId: friendship.id,
    targetType: "friendship",
  });

  const [me, senderUser] = await Promise.all([
    prisma.user.findUnique({
      where: { id: myId },
      select: { id: true, username: true, avatar: true, friendsCount: true },
    }),
    prisma.user.findUnique({
      where: { id: senderId },
      select: { id: true, username: true, avatar: true, friendsCount: true },
    }),
  ]);

  try {
    // Emit đến cả hai: sender biết được chấp nhận, accepter (actor) tự update UI
    getSocketInstance()
      .to(`user:${senderId}`)
      .to(`user:${myId}`)
      .emit("friend_accepted", {
        friendship: updated,
        // Đủ data để cả hai phía setQueryData mà không cần refetch
        accepter: me,
        requester: senderUser,
      });
  } catch {
    /* socket not ready */
  }

  return { ok: true };
};

// ─── Reject ───────────────────────────────────────────────
export const rejectRequest = async (myId: string, senderId: string) => {
  const friendship = await prisma.friendship.findFirst({
    where: { senderId, receiverId: myId, status: FriendStatus.PENDING },
    include: {
      receiver: { select: { id: true, username: true, avatar: true } },
    },
  });
  if (!friendship) throw new AppError(404, "Không tìm thấy lời mời kết bạn");

  await prisma.friendship.delete({ where: { id: friendship.id } });

  try {
    getSocketInstance()
      .to(`user:${senderId}`)
      .to(`user:${myId}`)
      .emit("friend_request_rejected", { receiver: friendship.receiver });
  } catch {
    /* socket not ready */
  }

  return { ok: true };
};

// ─── Cancel sent ──────────────────────────────────────────
export const cancelRequest = async (myId: string, receiverId: string) => {
  const friendship = await prisma.friendship.findFirst({
    where: { senderId: myId, receiverId, status: FriendStatus.PENDING },
    include: {
      sender: { select: { id: true, username: true, avatar: true } },
    },
  });
  if (!friendship) throw new AppError(404, "Không tìm thấy lời mời đã gửi");

  await prisma.friendship.delete({ where: { id: friendship.id } });

  try {
    getSocketInstance()
      .to(`user:${receiverId}`)
      .to(`user:${myId}`)
      .emit("friend_request_cancelled", { sender: friendship.sender });
  } catch {
    /* socket not ready */
  }

  return { ok: true };
};

// ─── Unfriend ─────────────────────────────────────────────
export const unfriend = async (myId: string, targetId: string) => {
  const friendship = await prisma.friendship.findFirst({
    where: {
      OR: [
        { senderId: myId, receiverId: targetId },
        { senderId: targetId, receiverId: myId },
      ],
      status: FriendStatus.ACCEPTED,
    },
  });
  if (!friendship) throw new AppError(404, "Không tìm thấy quan hệ bạn bè");

  await prisma.$transaction([
    prisma.friendship.delete({ where: { id: friendship.id } }),
    prisma.user.update({
      where: { id: myId },
      data: { friendsCount: { decrement: 1 } },
    }),
    prisma.user.update({
      where: { id: targetId },
      data: { friendsCount: { decrement: 1 } },
    }),
  ]);

  try {
    getSocketInstance()
      .to(`user:${myId}`)
      .to(`user:${targetId}`)
      .emit("friend_unfriended", { userId: myId, targetId });
  } catch {
    /* socket not ready */
  }

  return { ok: true };
};

// ─── Block ────────────────────────────────────────────────
export const blockUser = async (myId: string, targetId: string) => {
  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { senderId: myId, receiverId: targetId },
        { senderId: targetId, receiverId: myId },
      ],
    },
  });

  const wasFriends = existing?.status === FriendStatus.ACCEPTED;

  await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.friendship.update({
        where: { id: existing.id },
        data: {
          senderId: myId,
          receiverId: targetId,
          status: FriendStatus.BLOCKED,
        },
      });
    } else {
      await tx.friendship.create({
        data: {
          senderId: myId,
          receiverId: targetId,
          status: FriendStatus.BLOCKED,
        },
      });
    }

    if (wasFriends) {
      await tx.user.update({
        where: { id: myId },
        data: { friendsCount: { decrement: 1 } },
      });
      await tx.user.update({
        where: { id: targetId },
        data: { friendsCount: { decrement: 1 } },
      });
    }
  });

  try {
    // wasFriends cần để client biết có cần xoá bạn khỏi list không
    getSocketInstance()
      .to(`user:${myId}`)
      .to(`user:${targetId}`)
      .emit("friend_blocked", {
        blockerId: myId,
        blockedId: targetId,
        wasFriends,
      });
  } catch {
    /* socket not ready */
  }

  return { ok: true };
};

// ─── Unblock ──────────────────────────────────────────────
export const unblockUser = async (myId: string, targetId: string) => {
  const friendship = await prisma.friendship.findFirst({
    where: {
      senderId: myId,
      receiverId: targetId,
      status: FriendStatus.BLOCKED,
    },
  });
  if (!friendship) throw new AppError(404, "Không tìm thấy người bị chặn");

  await prisma.friendship.delete({ where: { id: friendship.id } });

  try {
    getSocketInstance()
      .to(`user:${myId}`)
      .to(`user:${targetId}`)
      .emit("friend_unblocked", { unblockerId: myId, unblockedId: targetId });
  } catch {
    /* socket not ready */
  }

  return { ok: true };
};

// ─── Get pending requests ─────────────────────────────────
export const getRequests = async (
  myId: string,
  cursor?: string,
  limit = 10,
) => {
  let cursorCondition = {};
  if (cursor) {
    const { field, id } = decodeCursor(cursor);
    cursorCondition = {
      OR: [
        { updatedAt: { lt: new Date(field) } },
        { updatedAt: new Date(field), id: { lt: id } },
      ],
    };
  }

  const friendships = await prisma.friendship.findMany({
    where: {
      receiverId: myId,
      status: FriendStatus.PENDING,
      ...cursorCondition,
      sender: { isActive: true },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: {
      sender: {
        select: { id: true, username: true, avatar: true, friendsCount: true },
      },
    },
  });

  const hasMore = friendships.length > limit;
  const data = hasMore ? friendships.slice(0, limit) : friendships;
  const lastItem = data[data.length - 1];
  const nextCursor =
    hasMore && lastItem
      ? encodeCursor({
          field: lastItem.updatedAt.toISOString(),
          id: lastItem.id,
        })
      : null;

  return { data, nextCursor, hasMore };
};

export const getFriendRequestCount = async (myId: string) => {
  const count = await prisma.friendship.count({
    where: {
      receiverId: myId,
      status: FriendStatus.PENDING,
      sender: { isActive: true },
    },
  });
  return { count };
};

// ─── Get sent requests ────────────────────────────────────
export const getSentRequests = async (
  myId: string,
  cursor?: string,
  limit = 10,
) => {
  let cursorCondition = {};
  if (cursor) {
    const { field, id } = decodeCursor(cursor);
    cursorCondition = {
      OR: [
        { updatedAt: { lt: new Date(field) } },
        { updatedAt: new Date(field), id: { lt: id } },
      ],
    };
  }

  const friendships = await prisma.friendship.findMany({
    where: {
      senderId: myId,
      status: FriendStatus.PENDING,
      ...cursorCondition,
      receiver: { isActive: true },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: {
      receiver: { select: { id: true, username: true, avatar: true } },
    },
  });

  const hasMore = friendships.length > limit;
  const data = hasMore ? friendships.slice(0, limit) : friendships;
  const lastItem = data[data.length - 1];
  const nextCursor =
    hasMore && lastItem
      ? encodeCursor({
          field: lastItem.updatedAt.toISOString(),
          id: lastItem.id,
        })
      : null;

  return { data, nextCursor, hasMore };
};

// ─── Get friends list ─────────────────────────────────────
export const getFriends = async (
  targetId: string,
  myId: string,
  cursor?: string,
  limit = 20,
) => {
  if (targetId !== myId) {
    const target = await prisma.user.findUnique({ where: { id: targetId } });
    if (!target || !target.isActive)
      throw new AppError(404, "Người dùng không tồn tại");
    const blocked = await prisma.friendship.findFirst({
      where: {
        OR: [
          { senderId: myId, receiverId: targetId },
          { senderId: targetId, receiverId: myId },
        ],
        status: FriendStatus.BLOCKED,
      },
    });
    if (blocked) throw new AppError(403, "Không có quyền xem");
  }

  let cursorCondition = {};
  if (cursor) {
    const { field, id } = decodeCursor(cursor);
    cursorCondition = {
      OR: [
        { updatedAt: { lt: new Date(field) } },
        { updatedAt: new Date(field), id: { lt: id } },
      ],
    };
  }

  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [
        { senderId: targetId, receiver: { isActive: true } },
        { receiverId: targetId, sender: { isActive: true } },
      ],
      status: FriendStatus.ACCEPTED,
      ...cursorCondition,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: {
      sender: {
        select: { id: true, username: true, avatar: true, friendsCount: true },
      },
      receiver: {
        select: { id: true, username: true, avatar: true, friendsCount: true },
      },
    },
  });

  const hasMore = friendships.length > limit;
  const items = hasMore ? friendships.slice(0, limit) : friendships;
  const data = items.map((f) =>
    f.senderId === targetId ? f.receiver : f.sender,
  );

  const lastFriendship = items[items.length - 1];
  const nextCursor =
    hasMore && lastFriendship
      ? encodeCursor({
          field: lastFriendship.updatedAt.toISOString(),
          id: lastFriendship.id,
        })
      : null;

  return { data, nextCursor, hasMore };
};

// ─── Get status ───────────────────────────────────────────
export const getStatus = async (myId: string, targetId: string) => {
  const [friendship, follower] = await Promise.all([
    prisma.friendship.findFirst({
      where: {
        OR: [
          { senderId: myId, receiverId: targetId },
          { senderId: targetId, receiverId: myId },
        ],
      },
    }),
    prisma.follower.findUnique({
      where: {
        followerId_followingId: { followerId: myId, followingId: targetId },
      },
    }),
  ]);

  let friendshipStatus = "none";
  if (friendship) {
    if (friendship.status === FriendStatus.ACCEPTED)
      friendshipStatus = "accepted";
    else if (friendship.status === FriendStatus.PENDING) {
      friendshipStatus =
        friendship.senderId === myId ? "pending_sent" : "pending_received";
    } else if (friendship.status === FriendStatus.BLOCKED) {
      friendshipStatus =
        friendship.senderId === myId ? "blocked" : "blocked_by";
    }
  }

  return { friendshipStatus, isFollowing: !!follower };
};

// ─── Suggestions (raw SQL → Prisma $queryRawUnsafe) ───────
type SuggestionRow = {
  id: string;
  username: string;
  avatar: string | null;
  friendsCount: number;
  mutualCount: bigint;
};

export const getSuggestions = async (myId: string, limit = 10) => {
  const [friendIds, blockedIds, pendingIds] = await Promise.all([
    getMyFriendIds(myId),
    getBlockedIds(myId),
    (async () => {
      const rows = await prisma.friendship.findMany({
        where: {
          OR: [
            { senderId: myId, receiver: { isActive: true } },
            { receiverId: myId, sender: { isActive: true } },
          ],
          status: FriendStatus.PENDING,
        },
        select: { senderId: true, receiverId: true },
      });
      return rows.map((r) => (r.senderId === myId ? r.receiverId : r.senderId));
    })(),
  ]);

  const excludeIds = [
    ...new Set([myId, ...friendIds, ...blockedIds, ...pendingIds]),
  ];

  if (friendIds.length === 0) {
    const users = await prisma.user.findMany({
      where: { id: { notIn: excludeIds }, isActive: true },
      take: limit,
      select: { id: true, username: true, avatar: true, friendsCount: true },
    });
    return { suggestions: users.map((u) => ({ user: u, mutualCount: 0 })) };
  }

  const rows = await prisma.$queryRaw<SuggestionRow[]>`
    SELECT
      u.id::text,
      u.username,
      u.avatar,
      u."friendsCount",
      COUNT(DISTINCT mutual.id) AS "mutualCount"
    FROM "User" u
    JOIN "Friendship" f ON (
      (f."senderId"::text = u.id::text OR f."receiverId"::text = u.id::text)
      AND f.status = 'ACCEPTED'
    )
    JOIN "User" mutual ON (
      mutual.id::text = CASE
        WHEN f."senderId"::text = u.id::text THEN f."receiverId"::text
        ELSE f."senderId"::text
      END
      AND mutual.id::text = ANY(${friendIds}::text[])
    )
    WHERE u.id::text != ALL(${excludeIds}::text[])
      AND u."isActive" = true
    GROUP BY u.id, u.username, u.avatar, u."friendsCount"
    ORDER BY "mutualCount" DESC
    LIMIT ${limit}
  `;

  return {
    suggestions: rows.map((r) => ({
      user: {
        id: r.id,
        username: r.username,
        avatar: r.avatar,
        friendsCount: r.friendsCount,
      },
      mutualCount: Number(r.mutualCount),
    })),
  };
};
