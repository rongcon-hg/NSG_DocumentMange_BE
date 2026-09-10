const express = require("express");
const router = express.Router();
const controller = require("../controller/emulationDocumentType.controller");
const { verifyToken, verifyManager } = require("../middleware/authMiddleware");

router.get("/", verifyToken, controller.getAllDocumentTypes);
router.post("/", verifyManager, controller.createDocumentType);
router.put("/:id", verifyManager, controller.updateDocumentType);
router.delete("/:id", verifyManager, controller.deleteDocumentType);
router.post("/init-default", verifyManager, controller.initDefaultDocumentTypes);

module.exports = router;
