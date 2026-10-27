const express = require("express");
const router = express.Router();
const { verifyToken, optionalVerifyToken } = require("../middleware/authMiddleware");
const meetingController = require("../controller/meeting.controller");

// Các endpoint cho phép cả đại biểu đăng nhập và khách mời (quét mã QR)
router.get("/public/:id", meetingController.getPublicMeeting);
router.post("/public/:id/guest-join", meetingController.guestJoinMeeting);
router.post("/public/:id/access-log", optionalVerifyToken, meetingController.logMeetingAccess);
router.post("/:id/access-log", optionalVerifyToken, meetingController.logMeetingAccess);
router.post("/public/:id/speak-request", optionalVerifyToken, meetingController.toggleSpeakRequest);
router.post("/:id/speak-request", optionalVerifyToken, meetingController.toggleSpeakRequest);
router.post("/public/:id/votes/:voteId/submit", optionalVerifyToken, meetingController.submitVote);
router.post("/:id/votes/:voteId/submit", optionalVerifyToken, meetingController.submitVote);

router.use(verifyToken);

// Danh sách & chi tiết cuộc họp
router.get("/", meetingController.getMeetings);
router.get("/:id", meetingController.getMeetingById);

// Tạo mới & cập nhật cuộc họp
router.post("/", meetingController.createMeeting);
router.put("/:id", meetingController.updateMeeting);
router.patch("/:id/status", meetingController.updateMeetingStatus);
router.delete("/:id", meetingController.deleteMeeting);
router.post("/:id/documents", meetingController.addMeetingDocument);
router.put("/:id/documents/:docId", meetingController.updateMeetingDocument);
router.delete("/:id/documents/:docId", meetingController.deleteMeetingDocument);

// Điểm danh & Nhật ký Ra/Vào
router.post("/:id/check-in", meetingController.checkInMeeting);

// Biểu quyết & Bỏ phiếu (Tạo, Sửa, Đóng, Xóa dành cho Admin/Chủ tọa/Thư ký có tài khoản)
router.post("/:id/votes", meetingController.createOrOpenVote);
router.put("/:id/votes/:voteId", meetingController.updateVote);
router.patch("/:id/votes/:voteId/close", meetingController.closeVote);
router.delete("/:id/votes/:voteId", meetingController.deleteVote);

// Biên bản cuộc họp & Giao việc
router.post("/:id/minutes", meetingController.saveMinutesAndActionItems);

module.exports = router;
