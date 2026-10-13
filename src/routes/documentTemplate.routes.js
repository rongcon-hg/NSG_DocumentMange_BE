const express = require("express");
const router = express.Router();
const templateController = require("../controller/documentTemplate.controller");
const { verifyToken, optionalVerifyToken } = require("../middleware/authMiddleware");

// Lấy danh sách & chi tiết biểu mẫu
router.get("/", optionalVerifyToken, templateController.getTemplates);
router.get("/:id", optionalVerifyToken, templateController.getTemplateById);

// Thêm, sửa, xóa biểu mẫu (Yêu cầu đăng nhập)
router.post("/", verifyToken, templateController.createTemplate);
router.put("/:id", verifyToken, templateController.updateTemplate);
router.delete("/:id", verifyToken, templateController.deleteTemplate);

module.exports = router;
