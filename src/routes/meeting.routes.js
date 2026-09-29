const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const meetingController = require("../controller/meeting.controller");

router.use(verifyToken);

// Danh sách & chi tiết cuộc họp
router.get("/", meetingController.getMeetings);
router.get("/:id", meetingController.getMeetingById);

// Tạo mới & cập nhật cuộc họp
router.post("/", meetingController.createMeeting);
router.put("/:id", meetingController.updateMeeting);
router.patch("/:id/status", meetingController.updateMeetingStatus);
router.delete("/:id", meetingController.deleteMeeting);

// Điểm danh & Đăng ký phát biểu
router.post("/:id/check-in", meetingController.checkInMeeting);
router.post("/:id/speak-request", meetingController.toggleSpeakRequest);

// Biểu quyết & Bỏ phiếu
router.post("/:id/votes", meetingController.createOrOpenVote);
router.post("/:id/votes/:voteId/submit", meetingController.submitVote);
router.patch("/:id/votes/:voteId/close", meetingController.closeVote);

// Biên bản cuộc họp & Giao việc
router.post("/:id/minutes", meetingController.saveMinutesAndActionItems);

module.exports = router;
