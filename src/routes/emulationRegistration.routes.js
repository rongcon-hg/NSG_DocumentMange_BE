const express = require("express");
const router = express.Router();
const controller = require("../controller/emulationRegistration.controller");
const upload = require("../middleware/multer");
const { verifyToken } = require("../middleware/authMiddleware");

// Upload file minh chứng lên Google Drive
router.post("/upload", verifyToken, upload.array("files", 10), controller.uploadEmulationFile);

// Thống kê số liệu
router.get("/stats", verifyToken, controller.getEmulationStats);

// Lấy đơn của user hiện tại theo năm học
router.get("/my-active", verifyToken, controller.getMyRegistration);

// Lấy danh sách đăng ký
router.get("/", verifyToken, controller.getAllRegistrations);

// Lấy chi tiết đơn đăng ký
router.get("/:id", verifyToken, controller.getRegistrationById);

// Tạo mới đơn đăng ký
router.post("/", verifyToken, controller.createRegistration);

// Cập nhật đơn đăng ký
router.put("/:id", verifyToken, controller.updateRegistration);

// Xóa đơn đăng ký
router.delete("/:id", verifyToken, controller.deleteRegistration);

// Xét duyệt (Quản lý đơn vị chuyển BGH / BGH phê duyệt hoặc từ chối)
router.patch("/:id/review", verifyToken, controller.reviewRegistration);

module.exports = router;
