const express = require('express');
const router = express.Router();
const archiveController = require('../controller/archive.controller');
const { verifyToken } = require('../middleware/authMiddleware');

router.use(verifyToken);

router.get('/', archiveController.getArchiveFolders);
router.post('/batch-import', archiveController.batchImportArchiveFolders);
router.get('/:id', archiveController.getArchiveFolderById);
router.post('/', archiveController.createArchiveFolder);
router.put('/:id', archiveController.updateArchiveFolder);
router.post('/:id/items', archiveController.addItemToFolder);
router.post('/:id/items/batch-import', archiveController.batchImportItemsToFolder);
router.put('/:id/items/:itemId', archiveController.updateItemInFolder);
router.delete('/:id/items/:itemId', archiveController.removeItemFromFolder);
router.put('/:id/status', archiveController.updateFolderStatus);
router.delete('/:id', archiveController.deleteArchiveFolder);

module.exports = router;
