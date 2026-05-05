import { prisma } from "../../lib/prisma";
import { checkPostPermission } from "../posts/posts.service";
import { createAndEmitNotification } from "../../services/notification.service";
import { decodeCursor, encodeCursor } from "../../utils/cursor";
import { getSocketInstance } from "../../socket";
import { ReactionType } from "../../prisma/generated/prisma/enums";

const emitToPost = (postId: string, event: string, payload: unknown) => {
  try {
    getSocketInstance().to(`post:${postId}`).emit(event, payload);
  } catch {}
};

// ─── Toggle reaction ──────────────────────────────────────
export const toggleReaction = async (
  postId: string,
  userId: string,
  type: ReactionType,
) => {
  const post = await checkPostPermission(postId, userId);

  const existing = await prisma.reaction.findUnique({
    where: { userId_postId: { userId, postId } },
  });

  const [reacterUser] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, avatar: true },
    }),
  ]);

  // Case 1: no reaction → create
  if (!existing) {
    const [reaction] = await prisma.$transaction([
      prisma.reaction.create({ data: { userId, postId, type } }),
      prisma.post.update({
        where: { id: postId },
        data: { likesCount: { increment: 1 } },
      }),
    ]);

    await createAndEmitNotification({
      userId: post.userId,
      fromUserId: userId,
      type: "POST_REACT",
      postId: postId,
      targetType: "post",
    });

    const updatedPost = await prisma.post.findUnique({
      where: { id: postId },
      select: { likesCount: true },
    });

    emitToPost(postId, "post:reaction", {
      postId,
      userId,
      action: "created",
      reactionType: type,
      previousType: null,
      likesCount: updatedPost?.likesCount ?? 0,
      user: reacterUser,
    });

    return { action: "created" as const, reaction, post: updatedPost };
  }

  // Case 2: same type → delete (toggle off)
  if (existing.type === type) {
    await prisma.$transaction([
      prisma.reaction.delete({ where: { id: existing.id } }),
      prisma.post.update({
        where: { id: postId },
        data: { likesCount: { decrement: 1 } },
      }),
    ]);

    const updatedPost = await prisma.post.findUnique({
      where: { id: postId },
      select: { likesCount: true },
    });

    emitToPost(postId, "post:reaction", {
      postId,
      userId,
      action: "deleted",
      reactionType: null,
      previousType: existing.type,
      likesCount: updatedPost?.likesCount ?? 0,
      user: null,
    });

    return { action: "deleted" as const, reaction: null, post: updatedPost };
  }

  // Case 3: different type → update (likesCount unchanged)
  const reaction = await prisma.reaction.update({
    where: { id: existing.id },
    data: { type },
  });

  const updatedPost = await prisma.post.findUnique({
    where: { id: postId },
    select: { likesCount: true },
  });

  emitToPost(postId, "post:reaction", {
    postId,
    userId,
    action: "updated",
    reactionType: type,
    previousType: existing.type,
    likesCount: updatedPost?.likesCount ?? 0,
    user: reacterUser,
  });

  return { action: "updated" as const, reaction, post: updatedPost };
};

// ─── List reactions ───────────────────────────────────────
export const getReactions = async (
  postId: string,
  myId: string,
  cursor?: string,
  limit = 20,
  type?: ReactionType,
) => {
  await checkPostPermission(postId, myId);

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

  const reactions = await prisma.reaction.findMany({
    where: {
      postId,
      ...(type ? { type } : {}),
      ...cursorCondition,
      user: { isActive: true },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: { user: { select: { id: true, username: true, avatar: true } } },
  });

  const hasMore = reactions.length > limit;
  const data = hasMore ? reactions.slice(0, limit) : reactions;
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

// ─── Summary ──────────────────────────────────────────────
export const getReactionSummary = async (postId: string, myId: string) => {
  await checkPostPermission(postId, myId);

  const [grouped, myReactionRow] = await Promise.all([
    prisma.reaction.groupBy({
      by: ["type"],
      where: { postId, user: { isActive: true } },
      _count: { type: true },
    }),
    prisma.reaction.findUnique({
      where: {
        userId_postId: { userId: myId, postId },
        user: { isActive: true },
      },
      select: { type: true },
    }),
  ]);

  const byType: Record<ReactionType, number> = {
    LIKE: 0,
    LOVE: 0,
    HAHA: 0,
    WOW: 0,
    SAD: 0,
    ANGRY: 0,
  };
  let total = 0;
  for (const g of grouped) {
    byType[g.type] = g._count.type;
    total += g._count.type;
  }

  return { total, byType, myReaction: myReactionRow?.type ?? null };
};

// ─── My reaction ──────────────────────────────────────────
export const getMyReaction = async (postId: string, myId: string) => {
  const reaction = await prisma.reaction.findUnique({
    where: { userId_postId: { userId: myId, postId } },
    select: { type: true },
  });
  return { myReaction: reaction?.type ?? null };
};
