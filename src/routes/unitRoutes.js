const express = require('express');
const router = express.Router();
const unitController = require('../controller/unit.Controller')
const {verifyManager,verifyToken} = require('../middleware/authMiddleware');
router.post('/create',verifyManager,unitController.createUnit)
router.get('/getAll',verifyToken,unitController.getAllUnit)
router.delete('/delete',verifyManager,unitController.deleteUnit)
router.put('/update',verifyManager,unitController.updateUnit)
router.post('/toggle-status',verifyManager,unitController.toggleUnitStatus)
module.exports = router;