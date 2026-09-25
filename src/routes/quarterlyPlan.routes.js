const express = require("express");
const router = express.Router();
const quarterlyPlanController = require("../controller/quarterlyPlan.controller");
const { verifyToken } = require("../middleware/authMiddleware");

router.use(verifyToken);

// Lấy metadata (danh sách Đơn vị & Ban Giám hiệu)
router.get("/metadata", quarterlyPlanController.getPlanMetadata);

// Lấy danh sách & Tạo kế hoạch quý
router.get("/", quarterlyPlanController.getQuarterlyPlans);
router.post("/", quarterlyPlanController.createQuarterlyPlan);

// Chi tiết kế hoạch quý
router.get("/:id", quarterlyPlanController.getQuarterlyPlanDetail);

// Nhiệm vụ con trong kế hoạch quý
router.post("/items", quarterlyPlanController.createPlanItem);
router.put("/items/:itemId", quarterlyPlanController.updatePlanItem);
router.delete("/items/:itemId", quarterlyPlanController.deletePlanItem);

module.exports = router;
