const express = require("express");
const router = express.Router();
const legalBasisController = require("../controller/legalBasis.controller");
const { verifyToken, verifyManager } = require("../middleware/authMiddleware");

router.use(verifyToken);

router.get("/", legalBasisController.getLegalBases);
router.post("/check-status", legalBasisController.checkLegalBasesStatus);
router.get("/:id", legalBasisController.getLegalBasisById);
router.post("/", verifyManager, legalBasisController.createLegalBasis);
router.put("/:id", verifyManager, legalBasisController.updateLegalBasis);
router.delete("/:id", verifyManager, legalBasisController.deleteLegalBasis);

module.exports = router;
