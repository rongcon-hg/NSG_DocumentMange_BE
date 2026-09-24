const express = require('express');
const router = express.Router();
const archiveController = require('../controller/archive.controller');
const { verifyToken } = require('../middleware/authMiddleware');

router.use(verifyToken);

router.get('/', archiveController.getArchiveFolders);
router.get('/:id', archiveController.getArchiveFolderById);
router.post('/', archiveController.createArchiveFolder);
router.post('/:id/items', archiveController.addItemToFolder);
router.put('/:id/status', archiveController.updateFolderStatus);
router.delete('/:id', archiveController.deleteArchiveFolder);

module.exports = router;
