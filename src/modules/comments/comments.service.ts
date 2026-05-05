import { AppError } from "../../utils/app-error";
import { prisma } from "../../lib/prisma";
import { checkPostPermission } from "../posts/posts.service";
import { decodeCursor, encodeCursor } from "../../utils/cursor";

const COMMENT_INCLUDE = {
  user: { select: { id: true, username: true, avatar: true } },
  _count: { select: { replies: true } },
};

// ─── Create root comment ──────────────────────────────────
export const createComment = async (
  postId: string,
  userId: string,
  content: string,
) => {
  const post = await checkPostPermission(postId, userId);

  const [comment] = await prisma.$transaction([
    prisma.comment.create({
      data: { postId, userId, content, parentId: null },
      include: COMMENT_INCLUDE,
    }),
    prisma.post.update({
      where: { id: postId },
      data: { commentsCount: { increment: 1 } },
    }),
  ]);

  return { comment };
};

// ─── Create reply ─────────────────────────────────────────
export const createReply = async (
  commentId: string,
  userId: string,
  content: string,
) => {
  const parentComment = await prisma.comment.findUnique({
    where: { id: commentId },
    include: { post: true },
  });
  if (!parentComment) throw new AppError(404, "Bình luận không tồn tại");
  if (parentComment.parentId !== null)
    throw new AppError(
      400,
      "Chỉ hỗ trợ reply 1 cấp, không thể reply vào reply",
    );

  await checkPostPermission(parentComment.postId, userId);

  const [reply] = await prisma.$transaction([
    prisma.comment.create({
      data: {
        postId: parentComment.postId,
        userId,
        content,
        parentId: commentId,
      },
      include: { user: { select: { id: true, username: true, avatar: true } } },
    }),
    prisma.post.update({
      where: { id: parentComment.postId },
      data: { commentsCount: { increment: 1 } },
    }),
  ]);

  return { comment: reply };
};

// ─── Get comments (root, ASC cursor) ─────────────────────
export const getComments = async (
  postId: string,
  myId: string,
  cursor?: string,
  limit = 10,
) => {
  await checkPostPermission(postId, myId);

  let cursorCondition = {};
  if (cursor) {
    const { field, id } = decodeCursor(cursor);
    cursorCondition = {
      OR: [
        { createdAt: { gt: new Date(field) } },
        { createdAt: new Date(field), id: { gt: id } },
      ],
    };
  }

  const comments = await prisma.comment.findMany({
    where: { postId, parentId: null, ...cursorCondition },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit + 1,
    include: COMMENT_INCLUDE,
  });

  const hasMore = comments.length > limit;
  const data = hasMore ? comments.slice(0, limit) : comments;
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

// ─── Get replies ──────────────────────────────────────────
export const getReplies = async (commentId: string, myId: string) => {
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) throw new AppError(404, "Bình luận không tồn tại");
  if (comment.parentId !== null)
    throw new AppError(400, "Chỉ comment gốc mới có replies");

  await checkPostPermission(comment.postId, myId);

  const replies = await prisma.comment.findMany({
    where: { parentId: commentId },
    orderBy: [{ createdAt: "asc" }],
    include: { user: { select: { id: true, username: true, avatar: true } } },
  });

  return { replies };
};

// ─── Update comment ───────────────────────────────────────
export const updateComment = async (
  commentId: string,
  userId: string,
  content: string,
) => {
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) throw new AppError(404, "Bình luận không tồn tại");
  if (comment.userId !== userId)
    throw new AppError(403, "Bạn không có quyền sửa bình luận này");

  const updated = await prisma.comment.update({
    where: { id: commentId },
    data: { content },
    include: { user: { select: { id: true, username: true, avatar: true } } },
  });

  return { comment: updated };
};

// ─── Delete comment ───────────────────────────────────────
export const deleteComment = async (commentId: string, userId: string) => {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    include: { _count: { select: { replies: true } } },
  });
  if (!comment) throw new AppError(404, "Bình luận không tồn tại");
  if (comment.userId !== userId)
    throw new AppError(403, "Bạn không có quyền xoá bình luận này");

  const decrementBy =
    comment.parentId === null ? 1 + comment._count.replies : 1;

  await prisma.$transaction([
    prisma.comment.delete({ where: { id: commentId } }),
    prisma.post.update({
      where: { id: comment.postId },
      data: { commentsCount: { decrement: decrementBy } },
    }),
  ]);

  return { message: "Đã xoá bình luận" };
};
