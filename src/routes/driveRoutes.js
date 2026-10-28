const express = require('express');
const router = express.Router();
const driveController = require('../controller/drive.Controller');
const { verifyToken } = require('../middleware/authMiddleware');

router.get('/token', verifyToken, driveController.getDriveToken);
router.get('/public-stream/:fileId', driveController.publicStreamFile);
router.get('/folder/:folderId', driveController.listFolderContents);

module.exports = router;
