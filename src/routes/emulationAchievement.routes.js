const express = require("express");
const router = express.Router();
const controller = require("../controller/emulationAchievement.controller");
const upload = require("../middleware/multer");
const { verifyToken } = require("../middleware/authMiddleware");

// Upload tệp minh chứng lên Google Drive
router.post("/upload", verifyToken, upload.array("files", 10), controller.uploadAchievementFiles);

// Nhập danh sách từ Excel hàng loạt
router.post("/batch-import", verifyToken, controller.batchImportAchievements);

// Xóa danh sách hàng loạt (Admin)
router.post("/batch-delete", verifyToken, controller.deleteBatchAchievements);

// Tra cứu danh sách thành tích
router.get("/", verifyToken, controller.getAchievements);

// Lấy chi tiết 1 thành tích
router.get("/:id", verifyToken, controller.getAchievementById);

// Thêm mới 1 thành tích
router.post("/", verifyToken, controller.createAchievement);

// Chỉnh sửa thành tích
router.put("/:id", verifyToken, controller.updateAchievement);

// Xóa thành tích
router.delete("/:id", verifyToken, controller.deleteAchievement);

module.exports = router;
