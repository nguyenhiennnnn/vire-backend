import { Response, NextFunction } from "express";
import { z } from "zod";
import { AuthRequest } from "../../middlewares/auth.middleware";
import * as storiesService from "./stories.service";

const cursorDto = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const createStory = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.file) {
      res
        .status(400)
        .json({ error: { code: "NO_FILE", message: "Không có file media" } });
      return;
    }
    const caption = req.body.caption as string | undefined;
    const result = await storiesService.createStory(
      req.user!.id,
      req.file,
      caption,
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

export const getFeedStories = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await storiesService.getFeedStories(req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const getMyStories = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { cursor, limit } = cursorDto.parse(req.query);
    const result = await storiesService.getMyStories(
      req.user!.id,
      cursor,
      limit,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const recordView = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await storiesService.recordView(
      req.params.id as string,
      req.user!.id,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const getViewers = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await storiesService.getViewers(
      req.params.id as string,
      req.user!.id,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const deleteStory = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await storiesService.deleteStory(
      req.params.id as string,
      req.user!.id,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const getActiveStories = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await storiesService.getActiveStories(
      req.params.id as string,
      req.user!.id,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};
