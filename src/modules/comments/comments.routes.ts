import { Router } from "express";
import * as commentsController from "./comments.controller";
import { verifyJWT } from "../../middlewares/auth.middleware";
import { rateLimitMiddleware } from "../../middlewares/rate-limit.middleware";
import { commentRateLimit } from "../../utils/redis";

const postsRouter = Router({ mergeParams: true });
const commentsRouter = Router({ mergeParams: true });
const rl = rateLimitMiddleware(commentRateLimit);

postsRouter.post(
  "/:postId/comments",
  verifyJWT,
  rl,
  commentsController.createComment,
);
postsRouter.get("/:postId/comments", verifyJWT, commentsController.getComments);

commentsRouter.post(
  "/:commentId/replies",
  verifyJWT,
  rl,
  commentsController.createReply,
);
commentsRouter.get(
  "/:commentId/replies",
  verifyJWT,
  commentsController.getReplies,
);
commentsRouter.put("/:id", verifyJWT, commentsController.updateComment);
commentsRouter.delete("/:id", verifyJWT, commentsController.deleteComment);

export { postsRouter as commentsOnPostsRouter, commentsRouter };
