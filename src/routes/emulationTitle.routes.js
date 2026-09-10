const express = require("express");
const router = express.Router();
const controller = require("../controller/emulationTitle.controller");
const { verifyToken, verifyManager } = require("../middleware/authMiddleware");

router.get("/", verifyToken, controller.getAllTitles);
router.post("/", verifyManager, controller.createTitle);
router.put("/:id", verifyManager, controller.updateTitle);
router.delete("/:id", verifyManager, controller.deleteTitle);
router.post("/init-default", verifyManager, controller.initDefaultTitles);

module.exports = router;
