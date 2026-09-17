const express = require("express");
const router = express.Router();
const { verifyToken, verifyManager } = require("../middleware/authMiddleware");
const focusAxisController = require("../controller/focusAxis.controller");

// Lấy danh sách Trục kết quả (tất cả người dùng đã đăng nhập đều xem được để chọn)
router.get("/", verifyToken, focusAxisController.getAllFocusAxes);

// Quản lý Trục kết quả (Chỉ Manager hoặc Admin được phép thêm / sửa / xóa / reset)
router.post("/", verifyToken, verifyManager, focusAxisController.createFocusAxis);
router.put("/:id", verifyToken, verifyManager, focusAxisController.updateFocusAxis);
router.delete("/:id", verifyToken, verifyManager, focusAxisController.deleteFocusAxis);
router.post("/reset-default", verifyToken, verifyManager, focusAxisController.resetDefaultFocusAxes);

module.exports = router;
