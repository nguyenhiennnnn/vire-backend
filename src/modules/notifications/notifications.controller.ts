import { AuthRequest } from "../../middlewares/auth.middleware";
import { NextFunction, Response } from "express";
import { queryDto } from "./notifications.dto";

import * as notificationsService from "./notifications.service";

export const getNotifications = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { cursor, limit, unread } = queryDto.parse(req.query);
    const result = await notificationsService.getNotifications(
      req.user!.id,
      cursor,
      limit,
      unread as boolean | undefined,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const getUnreadCount = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await notificationsService.getUnreadCount(req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const markRead = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await notificationsService.markRead(
      req.params.id as string,
      req.user!.id,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const markAllRead = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await notificationsService.markAllRead(req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const deleteNotification = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await notificationsService.deleteNotification(
      req.params.id as string,
      req.user!.id,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};
