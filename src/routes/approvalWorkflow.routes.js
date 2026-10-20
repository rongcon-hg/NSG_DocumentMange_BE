const express = require("express");
const router = express.Router();
const { verifyToken, verifyManager } = require("../middleware/authMiddleware");
const workflowController = require("../controller/approvalWorkflow.Controller");

// Lấy danh sách quy trình tuyến ký duyệt
router.get("/", verifyToken, workflowController.getWorkflows);

// Sinh các bước luân chuyển tự động cho người tạo dựa theo vai trò, đơn vị
router.get("/generate-steps", verifyToken, workflowController.generateStepsForUser);

// Tạo mới tuyến ký duyệt (Chỉ Admin / Manager)
router.post("/", verifyToken, verifyManager, workflowController.createWorkflow);

// Cập nhật tuyến ký duyệt (Chỉ Admin / Manager)
router.put("/:id", verifyToken, verifyManager, workflowController.updateWorkflow);

// Xóa tuyến ký duyệt (Chỉ Admin / Manager)
router.delete("/:id", verifyToken, verifyManager, workflowController.deleteWorkflow);

module.exports = router;
