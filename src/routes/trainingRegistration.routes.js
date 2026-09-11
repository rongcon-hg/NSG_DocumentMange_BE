const express = require("express");
const router = express.Router();
const controller = require("../controller/trainingRegistration.controller");
const upload = require("../middleware/multer");
const { verifyToken } = require("../middleware/authMiddleware");

// 1. Tải file mẫu và Xuất/Nhập Excel (Đặt trước :id để tránh conflict)
router.get("/template", verifyToken, controller.getTemplateExcel);
router.get("/export", verifyToken, controller.exportExcel);
router.post("/import", verifyToken, upload.single("file"), controller.importExcel);

// 2. Thống kê tổng hợp
router.get("/stats", verifyToken, controller.getStats);

// 3. Upload file minh chứng kết quả bồi dưỡng lên Google Drive
router.post("/upload-proof", verifyToken, upload.array("files", 10), controller.uploadProofFiles);

// 4. CRUD hồ sơ đăng ký
router.post("/", verifyToken, controller.createRegistrations);
router.get("/", verifyToken, controller.getRegistrations);
router.get("/:id", verifyToken, controller.getRegistrationById);
router.put("/:id", verifyToken, controller.updateRegistration);
router.delete("/:id", verifyToken, controller.deleteRegistration);

// 5. Manager xét duyệt
router.patch("/:id/review", verifyToken, controller.reviewRegistration);

// 6. Báo cáo kết quả bồi dưỡng sau khi học xong
router.patch("/:id/report", verifyToken, controller.reportResult);
router.patch("/:id/confirm-result", verifyToken, controller.confirmReportResult);

module.exports = router;
