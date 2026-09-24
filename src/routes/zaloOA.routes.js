const express = require('express');
const router = express.Router();
const zaloController = require('../controller/zaloOA.controller');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');

// Routes cấu hình Zalo OA (Chỉ Admin)
router.get('/config', verifyToken, verifyAdmin, zaloController.getZaloConfig);
router.put('/config', verifyToken, verifyAdmin, zaloController.updateZaloConfig);
router.post('/test-send', verifyToken, verifyAdmin, zaloController.testSendMessage);

// Webhook từ Zalo Platform
router.post('/webhook', zaloController.handleZaloWebhook);

module.exports = router;
