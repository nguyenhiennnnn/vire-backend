import { Router } from "express";
import { verifyJWT } from "../../middlewares/auth.middleware";
import * as friendshipsController from "./friendships.controller";
import { rateLimitMiddleware } from "../../middlewares/rate-limit.middleware";
import { friendRequestRateLimit } from "../../utils/redis";

const router = Router();

router.post(
  "/request/:userId",
  verifyJWT,
  rateLimitMiddleware(friendRequestRateLimit),
  friendshipsController.sendRequest,
);
router.put("/accept/:userId", verifyJWT, friendshipsController.acceptRequest);
router.put("/reject/:userId", verifyJWT, friendshipsController.rejectRequest);
router.put("/block/:userId", verifyJWT, friendshipsController.blockUser);
router.put("/unblock/:userId", verifyJWT, friendshipsController.unblockUser);
router.delete("/unfriend/:userId", verifyJWT, friendshipsController.unfriend);
router.delete(
  "/cancel/:userId",
  verifyJWT,
  friendshipsController.cancelRequest,
);
router.get("/requests", verifyJWT, friendshipsController.getRequests);
router.get("/requests/count", verifyJWT, friendshipsController.getFriendRequestCount);
router.get("/sent", verifyJWT, friendshipsController.getSentRequests);
router.get("/friends", verifyJWT, friendshipsController.getFriends);
router.get("/suggestions", verifyJWT, friendshipsController.getSuggestions);
router.get("/status/:userId", verifyJWT, friendshipsController.getStatus);

export default router;
