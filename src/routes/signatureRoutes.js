const express = require("express");
const router = express.Router();
const { verifyToken, optionalVerifyToken } = require("../middleware/authMiddleware");
const upload = require("../middleware/multer");
const signatureController = require("../controller/signature.Controller");

// Lấy thông tin chữ ký cá nhân
router.get("/me", verifyToken, signatureController.getMySignature);

// Tải lên chữ ký cá nhân
router.post("/upload", verifyToken, upload.single("signatureImage"), signatureController.uploadSignature);

// Lấy danh sách văn bản đã ký
router.get("/archive", verifyToken, signatureController.getMyArchive);

// Đóng dấu tài liệu
router.post("/sign-pdf", verifyToken, upload.single("pdfFile"), signatureController.signPdf);

// Chuyển đổi DOCX sang PDF để Preview
router.post("/convert-preview", verifyToken, upload.single("file"), signatureController.convertPreview);

// Proxy ảnh chữ ký
router.get("/image/:fileId", signatureController.getSignatureImage);

// Cập nhật cấu hình chứng thư số cá nhân
router.post("/update-certificate", verifyToken, signatureController.updateCertificate);

// Kiểm tra tính hợp lệ của chữ ký số (tải lên tệp PDF)
router.post("/verify", optionalVerifyToken, upload.single("pdfFile"), signatureController.verifyPdfSignatureController);

// Kiểm tra chữ ký số của tài liệu trong kho
router.get("/verify-archive/:id", verifyToken, signatureController.verifyArchiveDocSignature);

// Xóa văn bản đã ký
router.delete("/archive/:id", verifyToken, signatureController.deleteArchiveDoc);

module.exports = router;
