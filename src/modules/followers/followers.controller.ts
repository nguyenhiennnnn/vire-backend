import { Response, NextFunction } from "express";
import { z } from "zod";
import { AuthRequest } from "../../middlewares/auth.middleware";
import * as followersService from "./followers.service";

const cursorDto = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const follow = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await followersService.follow(
      req.user!.id,
      req.params.userId as string,
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

export const unfollow = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await followersService.unfollow(
      req.user!.id,
      req.params.userId as string,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const getFollowStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await followersService.getFollowStatus(
      req.user!.id,
      req.params.userId as string,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

// Used by /api/users/:id/followers (mounted in app.ts)
export const getFollowers = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { cursor, limit } = cursorDto.parse(req.query);
    const result = await followersService.getFollowers(
      req.params.id as string,
      req.user!.id,
      cursor,
      limit,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

// Used by /api/users/:id/following (mounted in app.ts)
export const getFollowing = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { cursor, limit } = cursorDto.parse(req.query);
    const result = await followersService.getFollowing(
      req.params.id as string,
      req.user!.id,
      cursor,
      limit,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};
