const express = require('express');
const router = express.Router();
const staffScorecardController = require('../controller/staffScorecard.Controller');
const { verifyManager } = require('../middleware/authMiddleware');

router.get('/', verifyManager, staffScorecardController.getScorecard);
router.get('/export-excel', verifyManager, staffScorecardController.exportScorecardExcel);

module.exports = router;
