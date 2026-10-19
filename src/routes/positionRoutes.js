const express = require('express');
const router = express.Router();
const positionController = require('../controller/position.controller')
const {verifyManager,verifyToken} = require('../middleware/authMiddleware');

router.post('/create',verifyManager,positionController.createPosition)
router.get('/getAll', verifyToken,positionController.getAllPosition)
router.post('/delete',verifyManager,positionController.deletePosition)
router.post('/update',verifyManager,positionController.updatePosition)
router.post('/toggle-status',verifyManager,positionController.togglePositionStatus)
module.exports = router