import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import jwt from "jsonwebtoken";
import { Prisma } from "../prisma/generated/prisma/client";
import { isAppError } from "../utils/app-error";

export const errorMiddleware = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  if (isAppError(err)) {
    res
      .status(err.status)
      .json({ error: { code: "APP_ERROR", message: err.message } });
    return;
  }

  if (err instanceof ZodError) {
    res.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Dữ liệu không hợp lệ",
        details: err.issues.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        })),
      },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      res
        .status(409)
        .json({ error: { code: "CONFLICT", message: "Dữ liệu đã tồn tại" } });
      return;
    }
    if (err.code === "P2025") {
      res.status(404).json({
        error: { code: "NOT_FOUND", message: "Không tìm thấy dữ liệu" },
      });
      return;
    }
  }

  if (err instanceof jwt.TokenExpiredError) {
    res
      .status(401)
      .json({ error: { code: "TOKEN_EXPIRED", message: "Token đã hết hạn" } });
    return;
  }
  if (err instanceof jwt.JsonWebTokenError) {
    res.status(401).json({
      error: { code: "TOKEN_INVALID", message: "Token không hợp lệ" },
    });
    return;
  }

  if (err instanceof Error && /file|upload/i.test(err.message)) {
    res
      .status(400)
      .json({ error: { code: "UPLOAD_ERROR", message: err.message } });
    return;
  }

  if (process.env.NODE_ENV !== "production") {
    console.error("[UnhandledError]", err);
  }
  res
    .status(500)
    .json({ error: { code: "INTERNAL_ERROR", message: "Lỗi máy chủ nội bộ" } });
};
