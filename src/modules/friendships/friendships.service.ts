import { FriendStatus, NotifType } from "../../prisma/generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import { decodeCursor, encodeCursor } from "../../utils/cursor";
import { AppError } from "../../utils/app-error";
import { getOnlineUsers, safeEmit } from "../../socket";
import { createAndEmitNotification } from "../notifications/notifications.service";

const onlineUsers = getOnlineUsers();

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

  const sender = await prisma.user.findUnique({
    where: { id: myId },
    select: { id: true, username: true, avatar: true, friendsCount: true },
  });

  const friendship = await prisma.friendship.create({
    data: {
      senderId: myId,
      receiverId: targetId,
      status: FriendStatus.PENDING,
    },
    include: {
      sender: {
        select: { id: true, username: true, avatar: true, friendsCount: true },
      },
      receiver: {
        select: { id: true, username: true, avatar: true },
      },
    },
  });

  safeEmit(`user:${targetId}`, "friend:request_received", {
    friendship,
    sender,
  });
  safeEmit(`user:${myId}`, "friend:request_sent", { friendship });

  await createAndEmitNotification({
    userId: targetId,
    fromUserId: myId,
    type: NotifType.FRIEND_REQUEST,
    friendshipId: friendship.id,
  });

  return { ok: true, friendship };
};

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

  const [meUser, senderUser] = await Promise.all([
    prisma.user.findUnique({
      where: { id: myId },
      select: { id: true, username: true, avatar: true, friendsCount: true },
    }),
    prisma.user.findUnique({
      where: { id: senderId },
      select: { id: true, username: true, avatar: true, friendsCount: true },
    }),
  ]);

  const users = { [myId]: meUser, [senderId]: senderUser };

  const acceptedPayload = {
    friendship: {
      ...updated,
      status: FriendStatus.ACCEPTED,
      sender: senderUser,
      receiver: meUser,
    },
    users,
  };

  safeEmit(`user:${senderId}`, "friend:request_accepted", acceptedPayload);
  safeEmit(`user:${myId}`, "friend:you_accepted_request", acceptedPayload);

  if (onlineUsers.has(senderId)) {
    safeEmit(`user:${senderId}`, "friend:online", {
      userId: myId,
      timestamp: new Date().toISOString(),
    });
  }
  if (onlineUsers.has(myId)) {
    safeEmit(`user:${myId}`, "friend:online", {
      userId: senderId,
      timestamp: new Date().toISOString(),
    });
  }

  await createAndEmitNotification({
    userId: senderId,
    fromUserId: myId,
    type: NotifType.FRIEND_ACCEPTED,
    friendshipId: friendship.id,
  });

  return { ok: true };
};

export const rejectRequest = async (myId: string, senderId: string) => {
  const friendship = await prisma.friendship.findFirst({
    where: { senderId, receiverId: myId, status: FriendStatus.PENDING },
  });
  if (!friendship) throw new AppError(404, "Không tìm thấy lời mời kết bạn");

  await prisma.friendship.delete({ where: { id: friendship.id } });

  safeEmit(`user:${senderId}`, "friend:request_rejected", {
    friendshipId: friendship.id,
    rejectedBy: myId,
  });
  safeEmit(`user:${myId}`, "friend:you_rejected_request", {
    friendshipId: friendship.id,
    requestFrom: senderId,
  });

  return { ok: true };
};

export const cancelRequest = async (myId: string, receiverId: string) => {
  const friendship = await prisma.friendship.findFirst({
    where: { senderId: myId, receiverId, status: FriendStatus.PENDING },
  });
  if (!friendship) throw new AppError(404, "Không tìm thấy lời mời đã gửi");

  await prisma.friendship.delete({ where: { id: friendship.id } });

  safeEmit(`user:${receiverId}`, "friend:request_cancelled", {
    friendshipId: friendship.id,
    cancelledBy: myId,
  });
  safeEmit(`user:${myId}`, "friend:you_cancelled_request", {
    friendshipId: friendship.id,
    cancelledFor: receiverId,
  });

  return { ok: true };
};

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

  const [meUser, targetUser] = await Promise.all([
    prisma.user.findUnique({
      where: { id: myId },
      select: { id: true, friendsCount: true },
    }),
    prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, friendsCount: true },
    }),
  ]);

  const payload = {
    friendshipId: friendship.id,
    users: { [myId]: meUser, [targetId]: targetUser },
  };

  safeEmit(`user:${myId}`, "friend:you_unfriended", payload);
  safeEmit(`user:${targetId}`, "friend:unfriended_by", payload);

  const onlineUsers = getOnlineUsers();
  if (onlineUsers.has(targetId)) {
    safeEmit(`user:${targetId}`, "friend:offline", {
      userId: myId,
      lastSeen: new Date().toISOString(),
    });
  }
  if (onlineUsers.has(myId)) {
    safeEmit(`user:${myId}`, "friend:offline", {
      userId: targetId,
      lastSeen: new Date().toISOString(),
    });
  }

  return { ok: true };
};

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
  const hadPendingFromTarget =
    existing?.status === FriendStatus.PENDING && existing.senderId === targetId;
  const hadPendingSentByMe =
    existing?.status === FriendStatus.PENDING && existing.senderId === myId;

  let blockRecord: { id: string } = { id: "" };

  await prisma.$transaction(async (tx) => {
    if (existing) {
      blockRecord = await tx.friendship.update({
        where: { id: existing.id },
        data: {
          senderId: myId,
          receiverId: targetId,
          status: FriendStatus.BLOCKED,
        },
        select: { id: true },
      });
    } else {
      blockRecord = await tx.friendship.create({
        data: {
          senderId: myId,
          receiverId: targetId,
          status: FriendStatus.BLOCKED,
        },
        select: { id: true },
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

  const [meUser, targetUser] = await Promise.all([
    prisma.user.findUnique({
      where: { id: myId },
      select: { id: true, friendsCount: true },
    }),
    prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, friendsCount: true },
    }),
  ]);

  const users = { [myId]: meUser, [targetId]: targetUser };

  safeEmit(`user:${myId}`, "friend:you_blocked", {
    targetId,
    wasFriends,
    hadPendingFromThem: hadPendingFromTarget,
    hadPendingToThem: hadPendingSentByMe,
    friendshipId: blockRecord.id,
    users,
  });
  safeEmit(`user:${targetId}`, "friend:blocked_by", {
    actorId: myId,
    wasFriends,
    iHadSentRequest: hadPendingFromTarget,
    theyHadSentRequest: hadPendingSentByMe,
    friendshipId: blockRecord.id,
    users,
  });

  return { ok: true };
};

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

  safeEmit(`user:${myId}`, "friend:you_unblocked", {
    targetId,
    friendshipId: friendship.id,
  });
  safeEmit(`user:${targetId}`, "friend:unblocked_by", {
    actorId: myId,
    friendshipId: friendship.id,
  });

  return { ok: true };
};

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
    if (friendship.status === FriendStatus.ACCEPTED) {
      friendshipStatus = "accepted";
    } else if (friendship.status === FriendStatus.PENDING) {
      friendshipStatus =
        friendship.senderId === myId ? "pending_sent" : "pending_received";
    } else if (friendship.status === FriendStatus.BLOCKED) {
      friendshipStatus =
        friendship.senderId === myId ? "blocked" : "blocked_by";
    }
  }

  return { friendshipStatus, isFollowing: !!follower };
};

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
