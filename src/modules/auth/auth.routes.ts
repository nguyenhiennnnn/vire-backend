import { Router } from "express";
import * as authController from "./auth.controller";
import { verifyJWT } from "../../middlewares/auth.middleware";
import { rateLimitMiddleware } from "../../middlewares/rate-limit.middleware";
import { authRateLimit } from "../../utils/redis";

const router = Router();
const rl = rateLimitMiddleware(authRateLimit);

router.post("/register", rl, authController.register);
router.get("/verify-email", authController.verifyEmail);
router.post("/resend-verify", rl, authController.resendVerify);
router.post("/login", rl, authController.login);
router.post("/logout", verifyJWT, authController.logout);
router.post("/refresh", authController.refresh);
router.post("/forgot-password", rl, authController.forgotPassword);
router.post("/verify-otp", rl, authController.verifyOtp);
router.post("/reset-password", rl, authController.resetPassword);
router.put("/change-password", verifyJWT, rl, authController.changePassword);
router.get("/google", authController.googleAuth);
router.get("/google/callback", authController.googleCallback);

export default router;
