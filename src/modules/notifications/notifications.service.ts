import { AppError } from "../../utils/app-error";
import { prisma } from "../../lib/prisma";
import { decodeCursor, encodeCursor } from "../../utils/cursor";
import { NotifType } from "../../prisma/generated/prisma/enums";
import { safeEmit } from "../../socket";

const NOTIF_INCLUDE = {
  fromUser: { select: { id: true, username: true, avatar: true } },
};

export const createAndEmitNotification = async (params: {
  userId: string; // recipient
  fromUserId: string; // actor
  type: NotifType;
  postId?: string;
  commentId?: string;
  friendshipId?: string;
  targetType?: string;
}) => {
  if (params.userId === params.fromUserId) return null;

  const notification = await prisma.notification.create({
    data: {
      userId: params.userId,
      fromUserId: params.fromUserId,
      type: params.type,
      postId: params.postId,
      commentId: params.commentId,
      friendshipId: params.friendshipId,
      targetType: params.targetType,
    },
    include: NOTIF_INCLUDE,
  });

  const unreadCount = await prisma.notification.count({
    where: { userId: params.userId, isRead: false },
  });

  safeEmit(`user:${params.userId}`, "notification:new", {
    notification,
    unreadCount,
  });

  return notification;
};

export const getNotifications = async (
  userId: string,
  cursor?: string,
  limit = 20,
  unread?: boolean,
) => {
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

  const notifications = await prisma.notification.findMany({
    where: {
      userId,
      ...(unread === true ? { isRead: false } : {}),
      ...cursorCondition,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: NOTIF_INCLUDE,
  });

  const hasMore = notifications.length > limit;
  const data = hasMore ? notifications.slice(0, limit) : notifications;
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

export const getUnreadCount = async (userId: string) => {
  const count = await prisma.notification.count({
    where: { userId, isRead: false },
  });
  return { count };
};

export const markRead = async (notifId: string, userId: string) => {
  const notif = await prisma.notification.findUnique({
    where: { id: notifId },
  });
  if (!notif) throw new AppError(404, "Thông báo không tồn tại");
  if (notif.userId !== userId) throw new AppError(403, "Không có quyền");

  const notification = await prisma.notification.update({
    where: { id: notifId },
    data: { isRead: true },
    include: NOTIF_INCLUDE,
  });

  const unreadCount = await prisma.notification.count({
    where: { userId, isRead: false },
  });

  safeEmit(`user:${userId}`, "notification:read", {
    notificationIds: [notifId],
    unreadCount,
  });

  return { notification };
};

export const markAllRead = async (userId: string) => {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });

  safeEmit(`user:${userId}`, "notification:read_all", {
    notificationIds: [], // empty = all
    unreadCount: 0,
  });

  return { updatedCount: result.count };
};

export const deleteNotification = async (notifId: string, userId: string) => {
  const notif = await prisma.notification.findUnique({
    where: { id: notifId },
  });
  if (!notif) throw new AppError(404, "Thông báo không tồn tại");
  if (notif.userId !== userId) throw new AppError(403, "Không có quyền");

  await prisma.notification.delete({ where: { id: notifId } });

  const unreadCount = await prisma.notification.count({
    where: { userId, isRead: false },
  });

  safeEmit(`user:${userId}`, "notification:deleted", {
    notificationId: notifId,
    unreadCount,
  });

  return { message: "Đã xoá thông báo" };
};
