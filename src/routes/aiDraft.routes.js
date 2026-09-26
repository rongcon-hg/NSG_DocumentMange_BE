const express = require('express');
const router = express.Router();
const aiDraftController = require('../controller/aiDraft.controller');
const { verifyToken } = require('../middleware/authMiddleware');
const upload = require('../middleware/multer');

router.use(verifyToken);

router.post('/generate', aiDraftController.generateAIDraft);
router.post('/audit', aiDraftController.auditDocumentCompliance);
router.post('/fix-compliance', aiDraftController.fixDocumentCompliance);
router.post('/upload-word', upload.single('file'), aiDraftController.uploadAndParseWord);
router.get('/history', aiDraftController.getDraftHistory);

module.exports = router;

