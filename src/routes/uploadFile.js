const express = require("express");
const router = express.Router();
const upload = require("../middleware/multer");
const uploadFile = require("../controller/uploadfile.Controller");
const {verifyManager,verifyToken} = require('../middleware/authMiddleware');

router.post("/upload",verifyToken, upload.array("files",10), uploadFile.uploadToDrive);
router.get("/",verifyToken,uploadFile.getAllDocuments)
router.get("/search",verifyToken, uploadFile.searchDocuments);
router.get("/nextdocnum/:docType/:docVariantId/:year",verifyToken, uploadFile.getNextDocNum);
router.get("/by-sentby/:userId",verifyToken,uploadFile.getDocumentsBySentBy);
router.get("/by-assignedto/:userId",verifyToken, uploadFile.getDocumentsByAssignedTo);
router.get("/unread-count/:userId", verifyToken, uploadFile.getUnreadDocCount);
router.get("/:userId/:docType", verifyToken,uploadFile.getDocumentsByUserAndType);
router.get("/fillter",verifyToken,uploadFile.getFilteredDocuments );
router.get("/deadline-notifications", verifyToken, uploadFile.getDeadlineStatusCounts);
router.delete("/:documentId/:userID",verifyManager,uploadFile.deleteDocument);
router.put("/:documentId", verifyToken,upload.array("files"), uploadFile.updateDocument);
router.get("/:documentId",verifyToken,uploadFile.getDocumentById);
router.get("/totalDocNum/:docVariantId/:year",verifyToken, uploadFile.getTotalDocNum);
router.post("/isRead",verifyToken,uploadFile.isRead);

module.exports = router;    
