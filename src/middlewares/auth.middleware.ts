import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { verifyAccessToken } from "../utils/generate-token";
import { prisma } from "../lib/prisma";

const { JsonWebTokenError, TokenExpiredError } = jwt;

export interface AuthRequest extends Request {
  user?: Express.User;
  file?: Express.Multer.File;
}

export const verifyJWT = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res
      .status(401)
      .json({ error: { code: "UNAUTHORIZED", message: "Không có token" } });
    return;
  }

  const token = authHeader.split(" ")[1];
  if (!token) return;

  try {
    const payload = verifyAccessToken(token);

    const stored = await prisma.userToken.findUnique({
      where: { userId: payload.id },
    });
    if (!stored || stored.accessToken !== token) {
      res.status(401).json({
        error: { code: "TOKEN_REVOKED", message: "Token đã bị thu hồi" },
      });
      return;
    }

    req.user = {
      id: payload.id,
      email: payload.email,
      username: payload.username,
    };
    next();
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      res.status(401).json({
        error: { code: "TOKEN_EXPIRED", message: "Token đã hết hạn" },
      });
    } else if (err instanceof JsonWebTokenError) {
      res.status(401).json({
        error: { code: "TOKEN_INVALID", message: "Token không hợp lệ" },
      });
    } else {
      next(err);
    }
  }
};
