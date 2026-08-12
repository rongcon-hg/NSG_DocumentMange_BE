const express = require('express');
const router = express.Router();
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');
const backupController = require('../controller/backup.Controller');

// All backup routes require Admin privileges
router.use(verifyToken, verifyAdmin);

router.get('/config', backupController.getConfig);
router.put('/config', backupController.updateConfig);
router.get('/history', backupController.getHistory);
router.post('/manual', backupController.triggerBackup);
router.post('/restore/request-otp', backupController.requestRestoreOtp);
router.post('/restore/verify', backupController.verifyRestore);

module.exports = router;
