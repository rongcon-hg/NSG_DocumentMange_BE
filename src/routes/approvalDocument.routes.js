const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const upload = require("../middleware/multer");
const approvalDocController = require("../controller/approvalDocument.Controller");

// Lấy danh sách hồ sơ trình ký (pending_my_action, my_submitted, all)
router.get("/", verifyToken, approvalDocController.getApprovalDocuments);

// Tạo hồ sơ trình ký mới (kèm file)
router.post("/create", verifyToken, upload.single("file"), approvalDocController.createApprovalDocument);

// Lấy chi tiết hồ sơ trình ký theo ID
router.get("/:id", verifyToken, approvalDocController.getApprovalDocumentById);

// Ký duyệt / Thẩm định một bước
router.post("/:id/sign", verifyToken, approvalDocController.signAndApproveStep);

// Từ chối hồ sơ
router.post("/:id/reject", verifyToken, approvalDocController.rejectApprovalDocument);

module.exports = router;
