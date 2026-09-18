const express = require('express');
const router = express.Router();
const staffScorecardController = require('../controller/staffScorecard.Controller');
const { verifyToken } = require('../middleware/authMiddleware');

router.get('/', verifyToken, staffScorecardController.getScorecard);
router.get('/export-excel', verifyToken, staffScorecardController.exportScorecardExcel);

module.exports = router;
