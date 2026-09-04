const express = require('express');
const router = express.Router();
const { verifyAdmin } = require('../middleware/authMiddleware');
const googleLoginController = require('../controller/googleLoginConfig.controller');

// Public endpoint để trang Login kiểm tra trạng thái kích hoạt
router.get('/status', googleLoginController.getPublicStatus);

// Các endpoint quản trị
router.get('/', verifyAdmin, googleLoginController.getGoogleLoginConfig);
router.post('/', verifyAdmin, googleLoginController.saveGoogleLoginConfig);

module.exports = router;
