const express = require("express");
const router = express.Router();
const directMessageController = require("../controller/directMessage.controller");
const { verifyToken } = require("../middleware/authMiddleware");

// Tất cả API tin nhắn đều cần đăng nhập
router.post("/", verifyToken, directMessageController.sendMessage);
router.get("/conversation/:partnerId", verifyToken, directMessageController.getConversation);
router.get("/unread-summary", verifyToken, directMessageController.getUnreadSummary);

module.exports = router;
