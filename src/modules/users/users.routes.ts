import { Router } from "express";
import * as usersController from "./users.controller";
import { verifyJWT } from "../../middlewares/auth.middleware";
import { uploadAvatar, uploadCover } from "../../middlewares/upload.middleware";
import { rateLimitMiddleware } from "../../middlewares/rate-limit.middleware";
import { uploadRateLimit } from "../../utils/redis";

const router = Router();
const rl = rateLimitMiddleware(uploadRateLimit);

router.get("/me", verifyJWT, usersController.getMe);
router.put("/me", verifyJWT, usersController.updateMe);
router.put(
  "/me/avatar",
  verifyJWT,
  rl,
  uploadAvatar,
  usersController.updateAvatar,
);
router.put(
  "/me/cover",
  verifyJWT,
  rl,
  uploadCover,
  usersController.updateCover,
);
router.put("/me/deactivate", verifyJWT, usersController.deactivate);
router.delete("/me", verifyJWT, usersController.deleteAccount);
router.get("/search", verifyJWT, usersController.searchUsers);
router.get(
  "/by-username/:username",
  verifyJWT,
  usersController.getUserByUsername,
);
router.get("/:id", verifyJWT, usersController.getUserProfile);

export default router;
