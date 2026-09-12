const express = require("express");
const router = express.Router();
const upload = require("../middleware/multer");
const { verifyToken, verifyManager } = require("../middleware/authMiddleware");

const recordController = require("../controller/onlineRecord.controller");
const categoryController = require("../controller/onlineRecordCategory.controller");
const attachmentTypeController = require("../controller/onlineRecordAttachmentType.controller");

// ==========================================
// 1. ROUTE DANH MỤC HỒ SƠ (OnlineRecordCategory)
// ==========================================
router.get("/categories", verifyToken, categoryController.getAllCategories);
router.post("/categories", verifyToken, verifyManager, categoryController.createCategory);
router.put("/categories/:id", verifyToken, verifyManager, categoryController.updateCategory);
router.delete("/categories/:id", verifyToken, verifyManager, categoryController.deleteCategory);
router.post("/categories/init-default", verifyToken, verifyManager, categoryController.initDefaultCategories);

// ==========================================
// 2. ROUTE DANH MỤC FILE ĐÍNH KÈM (OnlineRecordAttachmentType)
// ==========================================
router.get("/attachment-types", verifyToken, attachmentTypeController.getAllAttachmentTypes);
router.post("/attachment-types", verifyToken, verifyManager, attachmentTypeController.createAttachmentType);
router.put("/attachment-types/:id", verifyToken, verifyManager, attachmentTypeController.updateAttachmentType);
router.delete("/attachment-types/:id", verifyToken, verifyManager, attachmentTypeController.deleteAttachmentType);
router.post("/attachment-types/init-default", verifyToken, verifyManager, attachmentTypeController.initDefaultAttachmentTypes);

// ==========================================
// 3. ROUTE HỒ SƠ TRỰC TUYẾN (OnlineRecord)
// ==========================================
// Upload file minh chứng lên Google Drive
router.post("/upload", verifyToken, upload.array("files", 10), recordController.uploadRecordFile);

// Số lượng hồ sơ chờ duyệt (thông báo)
router.get("/pending-count", verifyToken, recordController.getPendingRecordCount);

// Lấy danh sách hồ sơ (hồ sơ tôi gửi / gửi đến tôi / tất cả)
router.get("/", verifyToken, recordController.getRecords);

// Lấy chi tiết hồ sơ
router.get("/:id", verifyToken, recordController.getRecordById);

// Nộp hồ sơ mới
router.post("/", verifyToken, recordController.createRecord);

// Cập nhật hồ sơ (khi đang PENDING hoặc REJECTED)
router.put("/:id", verifyToken, recordController.updateRecord);

// Phê duyệt / Trả lời hồ sơ (Dành cho Người nhận hoặc Manager/Admin)
router.patch("/:id/review", verifyToken, recordController.reviewRecord);

// Xóa hồ sơ
router.delete("/:id", verifyToken, recordController.deleteRecord);

module.exports = router;
