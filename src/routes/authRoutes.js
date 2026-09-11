const express = require('express');
const router = express.Router();
const authController = require('../controller/auth.Controller');
const { verifyAdmin, verifyManager, verifyToken } = require('../middleware/authMiddleware');
const upload = require('../middleware/multer');
const rateLimit = require('express-rate-limit');

// Rate limiter chuyên biệt chống brute-force / spam cho endpoints xác thực
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 30, // Tối đa 30 requests/15 phút trên mỗi IP
  message: {
    success: false,
    message: "Quá nhiều yêu cầu đăng nhập hoặc xác thực từ IP này. Vui lòng thử lại sau 15 phút.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

// Avatar routes
router.post('/avatar', verifyToken, upload.single('avatar'), authController.uploadAvatar);
router.get('/avatar/:fileId', authController.getAvatarImage);
router.delete('/avatar', verifyToken, authController.deleteAvatar);

router.post('/createUser', verifyManager, authController.createUser);
router.post('/importUsers', verifyManager, authController.importUsers);
router.post('/signin', authLimiter, authController.signin);
router.post('/reqResetPass', authLimiter, authController.reqResetPass);
router.post('/verifyCode', authLimiter, authController.verrifyCode);
router.post('/resetPassword', authLimiter, authController.resetPassword);
router.get('/users', verifyToken, authController.getAllUser);
router.get('/:userId', verifyToken, authController.getUserInfo);
router.post('/update/:userId', verifyToken, authController.upadteInfo);
router.put('/disableUser/:userId', verifyManager, authController.disableUser);
router.put('/restore/:userId', verifyManager, authController.restoreUser);
router.delete('/delete/:userId', verifyManager, authController.deleteUser);

module.exports = router;