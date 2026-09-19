const express = require('express');
const router = express.Router();
const docVaiantController = require("../controller/docVariant.Controller")

const {verifyManager,verifyToken} = require('../middleware/authMiddleware');

router.post('/create',verifyManager,docVaiantController.createDocVariant)
router.get('/getAll', verifyToken,docVaiantController.getAllDocVariant)
router.post('/toggle-status',verifyManager,docVaiantController.toggleDocVariantStatus)
router.post('/delete',verifyManager,docVaiantController.deleteDocVariant)
router.post('/update',verifyManager,docVaiantController.updateDocVariant)
router.get('/:year',verifyManager,docVaiantController.getTotalDocumentsByVariant)
module.exports = router