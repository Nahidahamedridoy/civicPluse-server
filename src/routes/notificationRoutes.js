import { Router } from "express";
import {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from "../controllers/notificationController.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

// Protect all notification routes with authentication
router.use(authenticate);

router.get("/", getMyNotifications);
router.get("/unread-count", getUnreadCount);
router.patch("/mark-all-read", markAllAsRead);
router.patch("/:id/read", markAsRead);
router.delete("/:id", deleteNotification);

export default router;
