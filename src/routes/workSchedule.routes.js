const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const workScheduleController = require("../controller/workSchedule.controller");

const upload = require("../middleware/multer");

// Lấy danh sách lịch công tác (Tất cả người dùng đều có thể xem theo phân quyền)
router.get("/", verifyToken, workScheduleController.getWorkSchedules);

// Lấy số lượng lịch chờ duyệt
router.get("/pending-count", verifyToken, workScheduleController.getPendingCount);

// Lấy danh sách thành viên Ban Giám Hiệu để chọn người duyệt
router.get("/bgh-list", verifyToken, workScheduleController.getBghUsers);

// Thêm / Đăng ký lịch công tác (BGH/Manager thêm trực tiếp, Cấp trưởng đăng ký gửi duyệt)
router.post("/", verifyToken, workScheduleController.createWorkSchedule);

// Import lịch công tác từ Excel (Hiệu trưởng / Manager / Admin)
router.post("/import", verifyToken, upload.single("file"), workScheduleController.importWorkSchedules);

// Cập nhật lịch công tác
router.put("/:id", verifyToken, workScheduleController.updateWorkSchedule);

// Xóa lịch công tác
router.delete("/:id", verifyToken, workScheduleController.deleteWorkSchedule);

// Phê duyệt lịch công tác (Ban Giám Hiệu / Manager)
router.patch("/:id/approve", verifyToken, workScheduleController.approveWorkSchedule);

// Từ chối lịch công tác (Ban Giám Hiệu / Manager)
router.patch("/:id/reject", verifyToken, workScheduleController.rejectWorkSchedule);

module.exports = router;

