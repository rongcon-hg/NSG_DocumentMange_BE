const express = require("express");
const router = express.Router();
const systemConfigController = require("../controller/systemConfig.controller");
const { verifyAdmin } = require("../middleware/authMiddleware");
const upload = require("../middleware/multer");

// Lấy thông tin cấu hình công khai (cho trang login, header, favicon, v.v.)
router.get("/", systemConfigController.getSystemConfig);

// Cập nhật thông tin cấu hình (chỉ Admin)
router.put("/", verifyAdmin, systemConfigController.updateSystemConfig);

// Upload ảnh (loginBackground, logo, favicon) và đồng bộ Google Drive (chỉ Admin)
router.post(
  "/upload-image",
  verifyAdmin,
  upload.single("image"),
  systemConfigController.uploadSystemImage
);

// Stream ảnh công khai từ Google Drive
router.get("/image/:fileId", systemConfigController.getSystemImage);

// Đặt lại ảnh về mặc định (chỉ Admin)
router.post("/reset-image", verifyAdmin, systemConfigController.resetSystemImage);

module.exports = router;
