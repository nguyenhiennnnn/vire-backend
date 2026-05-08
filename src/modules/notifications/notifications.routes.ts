import { Router } from "express";
import { verifyJWT } from "../../middlewares/auth.middleware";
import * as notificationsController from "./notifications.controller";

const router = Router();

router.get("/", verifyJWT, notificationsController.getNotifications);
router.get("/unread-count", verifyJWT, notificationsController.getUnreadCount);
router.put("/read-all", verifyJWT, notificationsController.markAllRead);
router.put("/:id/read", verifyJWT, notificationsController.markRead);
router.delete("/:id", verifyJWT, notificationsController.deleteNotification);

export default router;
