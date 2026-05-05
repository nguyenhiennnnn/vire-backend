import { Response, NextFunction } from "express";
import { AuthRequest } from "../../middlewares/auth.middleware";
import * as commentsService from "./comments.service";
import { z } from "zod";

const contentDto = z.object({ content: z.string().min(1).max(1000) });
const cursorDto = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const createComment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { content } = contentDto.parse(req.body);
    const result = await commentsService.createComment(
      req.params.postId as string,
      req.user!.id,
      content,
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

export const createReply = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { content } = contentDto.parse(req.body);
    const result = await commentsService.createReply(
      req.params.commentId as string,
      req.user!.id,
      content,
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

export const getComments = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { cursor, limit } = cursorDto.parse(req.query);
    const result = await commentsService.getComments(
      req.params.postId as string,
      req.user!.id,
      cursor,
      limit,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const getReplies = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await commentsService.getReplies(
      req.params.commentId as string,
      req.user!.id,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const updateComment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { content } = contentDto.parse(req.body);
    const result = await commentsService.updateComment(
      req.params.id as string,
      req.user!.id,
      content,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const deleteComment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await commentsService.deleteComment(
      req.params.id as string,
      req.user!.id,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};
