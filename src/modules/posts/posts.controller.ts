import { Response, NextFunction } from "express";
import { AuthRequest } from "../../middlewares/auth.middleware";
import * as postsService from "./posts.service";
import { createPostDto, updatePostDto, feedQueryDto } from "./posts.dto";

export const createPost = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = createPostDto.parse(req.body);
    const result = await postsService.createPost(req.user!.id, data);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

export const getFeed = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { cursor, limit } = feedQueryDto.parse(req.query);
    const result = await postsService.getFeed(req.user!.id, cursor, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const getPostById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await postsService.getPostById(
      req.params.id as string,
      req.user!.id,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const updatePost = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = updatePostDto.parse(req.body);
    const result = await postsService.updatePost(
      req.params.id as string,
      req.user!.id,
      data,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const deletePost = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await postsService.deletePost(
      req.params.id as string,
      req.user!.id,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const getUserPosts = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { cursor, limit } = feedQueryDto.parse(req.query);
    const result = await postsService.getUserPosts(
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
