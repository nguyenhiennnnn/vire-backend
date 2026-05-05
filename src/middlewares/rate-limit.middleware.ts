import { Request, Response, NextFunction } from "express";
import { Ratelimit } from "@upstash/ratelimit";

export const rateLimitMiddleware =
  (limiter: Ratelimit) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).user?.id ?? req.ip ?? "anonymous";
    const { success } = await limiter.limit(userId);
    if (!success) {
      res.status(429).json({
        error: {
          code: "RATE_LIMIT",
          message: "Quá nhiều yêu cầu, vui lòng thử lại sau",
        },
      });
      return;
    }
    next();
  };
