import { Router } from "express";
import { verifyJWT } from "../../middlewares/auth.middleware";
import * as followersController from "./followers.controller";

const router = Router();

router.post("/follow/:userId", verifyJWT, followersController.follow);
router.delete("/unfollow/:userId", verifyJWT, followersController.unfollow);
router.get("/status/:userId", verifyJWT, followersController.getFollowStatus);

export default router;
