const express = require("express");
const router = express.Router();
const commentController = require("../controller/comment.controller");
const upload = require("../middleware/multer");
const { verifyToken } = require("../middleware/authMiddleware");

// Tất cả các route trao đổi thảo luận đều yêu cầu đăng nhập
router.use(verifyToken);

router.get("/", commentController.getComments);
router.post("/", upload.array("files", 10), commentController.createComment);
router.delete("/:id", commentController.deleteComment);

module.exports = router;
