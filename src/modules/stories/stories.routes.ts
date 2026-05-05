import { Router } from "express";
import { verifyJWT } from "../../middlewares/auth.middleware";
import { uploadStory } from "../../middlewares/upload.middleware";
import { createStory, getFeedStories, getMyStories, recordView, getViewers, deleteStory } from "./stories.controller";
import { rateLimitMiddleware } from "../../middlewares/rate-limit.middleware";
import { uploadRateLimit } from "../../utils/redis";

const router = Router();

router.post("/", verifyJWT, rateLimitMiddleware(uploadRateLimit), uploadStory, createStory);
router.get("/feed", verifyJWT, getFeedStories);
router.get("/me", verifyJWT, getMyStories);
router.post("/:id/view", verifyJWT, recordView);
router.get("/:id/viewers", verifyJWT, getViewers);
router.delete("/:id", verifyJWT, deleteStory);

export default router;