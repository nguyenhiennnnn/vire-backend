import { Response, NextFunction } from "express";
import { AuthRequest } from "../../middlewares/auth.middleware";
import * as usersService from "./users.service";
import { updateUserDto, searchUserDto } from "./users.dto";

export const getMe = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await usersService.getMe(req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const updateMe = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = updateUserDto.parse(req.body);
    const result = await usersService.updateMe(req.user!.id, data);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const updateAvatar = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.file) {
      res
        .status(400)
        .json({ error: { code: "NO_FILE", message: "Không có file ảnh" } });
      return;
    }
    const result = await usersService.updateAvatar(req.user!.id, req.file);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const updateCover = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.file) {
      res
        .status(400)
        .json({ error: { code: "NO_FILE", message: "Không có file ảnh" } });
      return;
    }
    const result = await usersService.updateCover(req.user!.id, req.file);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const deactivate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await usersService.deactivate(req.user!.id);
    res.clearCookie("refreshToken");
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const deleteAccount = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await usersService.deleteAccount(req.user!.id);
    res.clearCookie("refreshToken");
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const getUserProfile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await usersService.getUserProfile(
      req.params.id as string,
      req.user!.id,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const searchUsers = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { q } = searchUserDto.parse(req.query);
    const result = await usersService.searchUsers(q, req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const getUserByUsername = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await usersService.getUserByUsername(
      req.params.username as string,
      req.user!.id,
    );

    res.json(result)
  } catch (err) {
    next(err);
  }
};
