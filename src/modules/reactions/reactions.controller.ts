import { AuthRequest } from "../../middlewares/auth.middleware";
import { NextFunction, Response } from "express";
import { reactionBodyDto, reactionQueryDto } from "./reactions.dto";
import * as reactionsService from "./reactions.service";

export const toggleReaction = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { type } = reactionBodyDto.parse(req.body);
    const result = await reactionsService.toggleReaction(
      req.params.postId as string,
      req.user!.id,
      type,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const getReactions = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { cursor, limit, type } = reactionQueryDto.parse(req.query);
    const result = await reactionsService.getReactions(
      req.params.postId as string,
      req.user!.id,
      cursor,
      limit,
      type,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const getReactionSummary = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await reactionsService.getReactionSummary(
      req.params.postId as string,
      req.user!.id,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const getMyReaction = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await reactionsService.getMyReaction(
      req.params.postId as string,
      req.user!.id,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};
