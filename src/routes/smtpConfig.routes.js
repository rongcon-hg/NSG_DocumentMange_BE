const express = require('express');
const router = express.Router();
const { verifyAdmin } = require('../middleware/authMiddleware');
const smtpController = require('../controller/smtpConfig.controller');

router.get('/', verifyAdmin, smtpController.getSmtpConfig);
router.post('/', verifyAdmin, smtpController.saveSmtpConfig);
router.post('/test', verifyAdmin, smtpController.testSmtpConfig);

module.exports = router;
