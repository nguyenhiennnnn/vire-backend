import { prisma } from "../../lib/prisma";
import { checkPostPermission } from "../posts/posts.service";
import { decodeCursor, encodeCursor } from "../../utils/cursor";
import { ReactionType, NotifType } from "../../prisma/generated/prisma/enums";
import { safeEmit } from "../../socket";
import { createAndEmitNotification } from "../notifications/notifications.service";

// ─── Helper: build full reaction breakdown ────────────────
const buildReactionBreakdown = async (postId: string) => {
  const grouped = await prisma.reaction.groupBy({
    by: ["type"],
    where: { postId, user: { isActive: true } },
    _count: { type: true },
  });

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

  return { byType, total };
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

  let action: "created" | "deleted" | "updated";
  let newType: ReactionType | null;

  // Case 1: no reaction → create
  if (!existing) {
    await prisma.$transaction([
      prisma.reaction.create({ data: { userId, postId, type } }),
      prisma.post.update({
        where: { id: postId },
        data: { likesCount: { increment: 1 } },
      }),
    ]);
    action = "created";
    newType = type;

    // Notify post owner (not self)
    if (post.userId !== userId) {
      await createAndEmitNotification({
        userId: post.userId,
        fromUserId: userId,
        type: NotifType.POST_REACT,
        postId,
      });
    }
  }
  // Case 2: same type → delete (toggle off)
  else if (existing.type === type) {
    await prisma.$transaction([
      prisma.reaction.delete({ where: { id: existing.id } }),
      prisma.post.update({
        where: { id: postId },
        data: { likesCount: { decrement: 1 } },
      }),
    ]);
    action = "deleted";
    newType = null;
  }
  // Case 3: different type → update (likesCount unchanged)
  else {
    await prisma.reaction.update({
      where: { id: existing.id },
      data: { type },
    });
    action = "updated";
    newType = type;
  }

  // Fetch updated state
  const [updatedPost, breakdown] = await Promise.all([
    prisma.post.findUnique({
      where: { id: postId },
      select: { likesCount: true },
    }),
    buildReactionBreakdown(postId),
  ]);

  const emitPayload = {
    postId,
    userId,
    reactionType: newType, // null = removed
    likesCount: updatedPost!.likesCount,
    breakdown: breakdown.byType,
    total: breakdown.total,
  };

  safeEmit(`post:${postId}`, "reaction:updated", emitPayload);

  return { action, ...emitPayload, reactionType: newType };
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

  const [breakdown, myReactionRow] = await Promise.all([
    buildReactionBreakdown(postId),
    prisma.reaction.findUnique({
      where: {
        userId_postId: { userId: myId, postId },
        user: { isActive: true },
      },
      select: { type: true },
    }),
  ]);

  return {
    total: breakdown.total,
    byType: breakdown.byType,
    myReaction: myReactionRow?.type ?? null,
  };
};

// ─── My reaction ──────────────────────────────────────────
export const getMyReaction = async (postId: string, myId: string) => {
  const reaction = await prisma.reaction.findUnique({
    where: { userId_postId: { userId: myId, postId } },
    select: { type: true },
  });
  return { myReaction: reaction?.type ?? null };
};
