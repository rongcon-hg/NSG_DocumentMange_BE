const express = require("express");
const router = express.Router();
const handoverController = require("../controller/handover.controller");
const { verifyToken, verifyManager } = require("../middleware/authMiddleware");

router.get("/preview", verifyToken, handoverController.previewHandover);
router.post("/execute", verifyToken, handoverController.executeHandover);
router.get("/logs", verifyToken, handoverController.getHandoverLogs);

module.exports = router;
