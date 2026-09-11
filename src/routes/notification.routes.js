const express = require("express");
const router = express.Router();
const notificationController = require("../controller/notification.controller");
const { verifyToken } = require("../middleware/authMiddleware");

router.get("/my", verifyToken, notificationController.getMyNotifications);
router.get("/unread-count", verifyToken, notificationController.getUnreadCount);
router.patch("/mark-all-read", verifyToken, notificationController.markAllAsRead);
router.patch("/popup-shown", verifyToken, notificationController.markPopupShown);
router.patch("/:id/read", verifyToken, notificationController.markAsRead);

module.exports = router;
