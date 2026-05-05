import { Router } from "express";
import * as postsController from "./posts.controller";
import { verifyJWT } from "../../middlewares/auth.middleware";
import { rateLimitMiddleware } from "../../middlewares/rate-limit.middleware";
import { postRateLimit } from "../../utils/redis";

const router = Router();

router.post(
  "/",
  verifyJWT,
  rateLimitMiddleware(postRateLimit),
  postsController.createPost,
);
router.get("/feed", verifyJWT, postsController.getFeed);
router.get("/:id", verifyJWT, postsController.getPostById);
router.put("/:id", verifyJWT, postsController.updatePost);
router.delete("/:id", verifyJWT, postsController.deletePost);

export default router;
