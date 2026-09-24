const express = require('express');
const { getConfig, updateConfig } = require('../controller/chatbotConfig.controller');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');
const router = express.Router();

// Lấy cấu hình (người dùng đã đăng nhập hoặc widget nội bộ)
router.get('/', verifyToken, getConfig);

// Cập nhật cấu hình Chatbot (chỉ dành riêng cho Admin)
router.put('/', verifyToken, verifyAdmin, updateConfig);

module.exports = router;
