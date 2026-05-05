import { AuthRequest } from "../../middlewares/auth.middleware";
import { NextFunction, Response } from "express";
import * as friendshipsService from "./friendships.service";
import { cursorDto, cursorWithUserDto } from "./friendships.dto";
import z from "zod";

export const sendRequest = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await friendshipsService.sendRequest(
      req.user!.id,
      req.params.userId as string,
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

export const acceptRequest = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await friendshipsService.acceptRequest(
      req.user!.id,
      req.params.userId as string,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const rejectRequest = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await friendshipsService.rejectRequest(
      req.user!.id,
      req.params.userId as string,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const cancelRequest = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await friendshipsService.cancelRequest(
      req.user!.id,
      req.params.userId as string,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const unfriend = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await friendshipsService.unfriend(
      req.user!.id,
      req.params.userId as string,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const blockUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await friendshipsService.blockUser(
      req.user!.id,
      req.params.userId as string,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const unblockUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await friendshipsService.unblockUser(
      req.user!.id,
      req.params.userId as string,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const getRequests = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { cursor, limit } = cursorDto.parse(req.query);
    const result = await friendshipsService.getRequests(
      req.user!.id,
      cursor,
      limit,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const getFriendRequestCount = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await friendshipsService.getFriendRequestCount(req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const getSentRequests = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { cursor, limit } = cursorDto.parse(req.query);
    const result = await friendshipsService.getSentRequests(
      req.user!.id,
      cursor,
      limit,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const getFriends = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { cursor, limit } = cursorWithUserDto.parse(req.query);
    const targetId = (req.query.userId as string) || req.user!.id;
    const result = await friendshipsService.getFriends(
      targetId,
      req.user!.id,
      cursor,
      limit,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const getStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await friendshipsService.getStatus(
      req.user!.id,
      req.params.userId as string,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const getSuggestions = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { limit } = z
      .object({ limit: z.coerce.number().int().min(1).max(20).default(10) })
      .parse(req.query);
    const result = await friendshipsService.getSuggestions(req.user!.id, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
};
