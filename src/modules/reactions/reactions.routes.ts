import { Router } from "express";
import { verifyJWT } from "../../middlewares/auth.middleware";
import * as reactionsController from "./reactions.controller";

const router = Router({ mergeParams: true });

router.get(
  "/:postId/reactions/summary",
  verifyJWT,
  reactionsController.getReactionSummary,
);
router.get(
  "/:postId/reactions/me",
  verifyJWT,
  reactionsController.getMyReaction,
);
router.post(
  "/:postId/reactions",
  verifyJWT,
  reactionsController.toggleReaction,
);
router.get("/:postId/reactions", verifyJWT, reactionsController.getReactions);

export default router;
