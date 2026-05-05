import { NotifType } from "../prisma/generated/prisma/enums";
import { prisma } from "../lib/prisma";
import { getSocketInstance } from "../socket";

type CreateNotificationInput = {
  userId: string;
  fromUserId: string;
  type: NotifType;
  postId?: string | null;
  commentId?: string | null;
  friendshipId?: string | null;
  targetType?: string | null;
};

export const createAndEmitNotification = async (
  input: CreateNotificationInput,
): Promise<void> => {
  if (input.userId === input.fromUserId) return;

  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      fromUserId: input.fromUserId,
      type: input.type,
      postId: input.postId ?? null,
      commentId: input.commentId ?? null,
      friendshipId: input.friendshipId ?? null,
      targetType: input.targetType ?? null,
    },
    include: {
      fromUser: { select: { id: true, username: true, avatar: true } },
    },
  });

  try {
    const io = getSocketInstance();
    io.to(`user:${input.userId}`).emit("new_notification", {
      id: notification.id,
      type: notification.type,
      fromUser: notification.fromUser,
      postId: notification.postId,
      commentId: notification.commentId,
      friendshipId: notification.friendshipId,
      targetType: notification.targetType,
      isRead: false,
      createdAt: notification.createdAt,
    });
  } catch {
    // Socket chưa init (test env) — bỏ qua
  }
};
