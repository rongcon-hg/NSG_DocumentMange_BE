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

// Vào số ban hành hồ sơ
router.post("/:id/issue", verifyToken, approvalDocController.issueApprovalDocument);

// Xem trước stream PDF (hỗ trợ tự động convert doc/docx sang PDF nếu chưa convert)
router.get("/:id/preview-pdf", verifyToken, approvalDocController.getPreviewPdfStream);

// Xóa hồ sơ trình ký (Chỉ Admin hoặc người tạo khi đang ở bước 1)
router.delete("/:id", verifyToken, approvalDocController.deleteApprovalDocument);

module.exports = router;

