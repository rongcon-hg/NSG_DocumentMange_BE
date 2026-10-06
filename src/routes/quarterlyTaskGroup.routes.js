const express = require("express");
const router = express.Router();
const { verifyToken, verifyManager } = require("../middleware/authMiddleware");
const quarterlyTaskGroupController = require("../controller/quarterlyTaskGroup.controller");

// Lấy danh sách Trục công việc / Nhóm nhiệm vụ (Mọi người dùng đã đăng nhập đều xem được để chọn)
router.get("/", verifyToken, quarterlyTaskGroupController.getAllQuarterlyTaskGroups);

// Quản lý Trục công việc (Chỉ Manager hoặc Admin)
router.post("/", verifyToken, verifyManager, quarterlyTaskGroupController.createQuarterlyTaskGroup);
router.put("/:id", verifyToken, verifyManager, quarterlyTaskGroupController.updateQuarterlyTaskGroup);
router.delete("/:id", verifyToken, verifyManager, quarterlyTaskGroupController.deleteQuarterlyTaskGroup);
router.post("/reset-default", verifyToken, verifyManager, quarterlyTaskGroupController.resetDefaultQuarterlyTaskGroups);

module.exports = router;
