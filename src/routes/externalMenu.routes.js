const express = require("express");
const router = express.Router();
const { verifyToken, verifyManager } = require("../middleware/authMiddleware");
const externalMenuController = require("../controller/externalMenu.controller");

// Lấy danh sách menu (Tất cả người dùng đã đăng nhập)
router.get("/", verifyToken, externalMenuController.getExternalMenus);

// Quản trị viên thêm, sửa, đổi trạng thái, xóa menu
router.post("/", verifyToken, verifyManager, externalMenuController.createExternalMenu);
router.put("/:id", verifyToken, verifyManager, externalMenuController.updateExternalMenu);
router.patch("/:id/toggle-status", verifyToken, verifyManager, externalMenuController.toggleExternalMenuStatus);
router.delete("/:id", verifyToken, verifyManager, externalMenuController.deleteExternalMenu);

module.exports = router;
