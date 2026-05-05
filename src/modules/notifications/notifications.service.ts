import { AppError } from "../../utils/app-error";
import { prisma } from "../../lib/prisma";
import { decodeCursor, encodeCursor } from "../../utils/cursor";

const NOTIF_INCLUDE = {
  fromUser: { select: { id: true, username: true, avatar: true } },
};

// ─── Get notifications ────────────────────────────────────
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

// ─── Unread count ─────────────────────────────────────────
export const getUnreadCount = async (userId: string) => {
  const count = await prisma.notification.count({
    where: { userId, isRead: false },
  });
  return { count };
};

// ─── Mark one read ────────────────────────────────────────
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
  return { notification };
};

// ─── Mark all read ────────────────────────────────────────
export const markAllRead = async (userId: string) => {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
  return { updatedCount: result.count };
};

// ─── Delete one ───────────────────────────────────────────
export const deleteNotification = async (notifId: string, userId: string) => {
  const notif = await prisma.notification.findUnique({
    where: { id: notifId },
  });
  if (!notif) throw new AppError(404, "Thông báo không tồn tại");
  if (notif.userId !== userId) throw new AppError(403, "Không có quyền");

  await prisma.notification.delete({ where: { id: notifId } });
  return { message: "Đã xoá thông báo" };
};
