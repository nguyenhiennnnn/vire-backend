import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import passport from "./lib/passport";

// ─── Routers ──────────────────────────────────────────────
import authRouter from "./modules/auth/auth.routes";
import usersRouter from "./modules/users/users.routes";
import postsRouter from "./modules/posts/posts.routes";
import {
  commentsOnPostsRouter,
  commentsRouter,
} from "./modules/comments/comments.routes";
import reactionsRouter from "./modules/reactions/reactions.routes";
import friendshipsRouter from "./modules/friendships/friendships.routes";
import followersRouter from "./modules/followers/followers.routes";
import notificationsRouter from "./modules/notifications/notifications.routes";
import storiesRouter from "./modules/stories/stories.routes";
import aiRouter from "./modules/ai/ai.routes";

// ─── Individual controllers for nested /users/:id/... ─────
import { getUserPosts } from "./modules/posts/posts.controller";
import {
  getFollowers,
  getFollowing,
} from "./modules/followers/followers.controller";
import { getActiveStories } from "./modules/stories/stories.controller";
import { verifyJWT } from "./middlewares/auth.middleware";

// ─── Error middleware ─────────────────────────────────────
import { errorMiddleware } from "./middlewares/error.middleware";

const app = express();

// ─── Core middleware ──────────────────────────────────────
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(passport.initialize());

// ─── API Routes ───────────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/posts", postsRouter);
app.use("/api/posts", commentsOnPostsRouter);
app.use("/api/comments", commentsRouter);
app.use("/api/posts", reactionsRouter);
app.use("/api/friendships", friendshipsRouter);
app.use("/api/followers", followersRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/stories", storiesRouter);

app.get("/api/users/:id/posts", verifyJWT, getUserPosts);
app.get("/api/users/:id/followers", verifyJWT, getFollowers);
app.get("/api/users/:id/following", verifyJWT, getFollowing);
app.get("/api/users/:id/stories/active", verifyJWT, getActiveStories);

app.use("/api/ai", aiRouter);

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "OK" });
});

// ─── 404 ──────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res
    .status(404)
    .json({ error: { code: "NOT_FOUND", message: "Route không tồn tại" } });
});

// ─── Global error handler (MUST be last) ──────────────────
app.use(errorMiddleware);

export default app;
