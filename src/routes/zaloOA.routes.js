const express = require('express');
const router = express.Router();
const zaloController = require('../controller/zaloOA.controller');
const { verifyToken, verifyManager } = require('../middleware/authMiddleware');

// Routes cấu hình Zalo OA & Nhóm Zalo (Admin & Manager)
router.get('/config', verifyToken, verifyManager, zaloController.getZaloConfig);
router.put('/config', verifyToken, verifyManager, zaloController.updateZaloConfig);
router.post('/test-send', verifyToken, verifyManager, zaloController.testSendMessage);
router.post('/test-send-group', verifyToken, verifyManager, zaloController.testSendGroupMessage);
router.post('/detect-group', verifyToken, verifyManager, zaloController.detectBotGroupChats);

// Routes dành cho mọi Cán bộ tự kiểm tra liên kết và gửi thử Zalo cá nhân của mình
router.post('/sync-my-zalo', verifyToken, zaloController.syncMyZaloAccount);

// Webhook từ Zalo Platform
router.post('/webhook', zaloController.handleZaloWebhook);

module.exports = router;
