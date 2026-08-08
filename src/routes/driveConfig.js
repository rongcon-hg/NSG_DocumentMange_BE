const express = require('express');
const router = express.Router();
const driveConfigController = require('../controller/driveConfig.Controller');
const { verifyManager } = require('../middleware/authMiddleware');

router.get('/', verifyManager, driveConfigController.getConfig);
router.put('/', verifyManager, driveConfigController.updateConfig);
router.post('/test', verifyManager, driveConfigController.testConnection);

module.exports = router;
