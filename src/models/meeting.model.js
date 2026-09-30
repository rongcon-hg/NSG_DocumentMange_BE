const mongoose = require("mongoose");

// Schema tài liệu đính kèm phiên họp
const meetingDocumentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    fileId: { type: String, default: "" }, // Google Drive file ID
    fileUrl: { type: String, default: "" },
    fileName: { type: String, default: "" },
    fileSize: { type: String, default: "" },
    mimeType: { type: String, default: "application/pdf" },
    isConfidential: { type: Boolean, default: false }, // Tài liệu Mật (chỉ BGH/Chủ tọa xem hoặc không cho tải)
    allowDownload: { type: Boolean, default: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

// Schema chương trình họp (Agenda Item)
const meetingAgendaSchema = new mongoose.Schema(
  {
    order: { type: Number, default: 1 },
    title: { type: String, required: true, trim: true },
    presenter: { type: String, default: "" }, // Người trình bày
    durationMinutes: { type: Number, default: 15 }, // Thời lượng dự kiến (phút)
    description: { type: String, default: "" },
    status: {
      type: String,
      enum: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"],
      default: "NOT_STARTED",
    },
    attachedDocuments: [meetingDocumentSchema], // Tài liệu riêng cho mục này
  },
  { _id: true }
);

// Schema biểu quyết / lấy ý kiến trong phòng họp
const meetingVoteOptionSchema = new mongoose.Schema(
  {
    optionText: { type: String, required: true },
    voteCount: { type: Number, default: 0 },
    voters: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Danh sách người bỏ phiếu (nếu không ẩn danh)
  },
  { _id: true }
);

const meetingVoteSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    isSecret: { type: Boolean, default: false }, // Bỏ phiếu kín (ẩn danh người bỏ)
    isMultipleChoice: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["DRAFT", "OPEN", "CLOSED"],
      default: "DRAFT",
    },
    options: [meetingVoteOptionSchema],
    totalVotes: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    closedAt: { type: Date },
  },
  { _id: true }
);

// Schema thành viên tham dự & Điểm danh
const meetingAttendeeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
    guestId: { type: String, default: "" }, // Mã định danh khách (nếu tham gia qua quét QR công khai không có tài khoản)
    name: { type: String, default: "" },
    email: { type: String, default: "" },
    positionName: { type: String, default: "" },
    departmentName: { type: String, default: "" },
    roleInMeeting: {
      type: String,
      enum: ["HOST", "SECRETARY", "MEMBER", "GUEST"],
      default: "MEMBER", // HOST: Chủ tọa, SECRETARY: Thư ký, MEMBER: Đại biểu, GUEST: Khách mời
    },
    seatNumber: { type: String, default: "" }, // Vị trí ngồi (ví dụ: A-01, B-02)
    attendanceStatus: {
      type: String,
      enum: ["ABSENT", "ATTENDED", "LATE", "EXCUSED"],
      default: "ABSENT",
    },
    checkInTime: { type: Date },
    checkOutTime: { type: Date }, // Thời gian rời phòng họp gần nhất
    checkInMethod: {
      type: String,
      enum: ["QR_SCAN", "MANUAL", "AUTO_JOIN"],
      default: "MANUAL",
    },
    checkInLocation: { type: String, default: "" }, // Tên địa điểm / Tọa độ GPS / Trình duyệt vị trí
    checkInCoords: {
      latitude: { type: Number },
      longitude: { type: Number },
      accuracy: { type: Number },
    },
    checkInIp: { type: String, default: "" },
    totalAttendanceMinutes: { type: Number, default: 0 }, // Tổng thời gian tham gia cuộc họp (tính theo phút)
    // Nhật ký lịch sử các lần ra - vào phòng họp
    accessLogs: [
      {
        action: {
          type: String,
          enum: ["JOIN", "LEAVE", "CHECK_IN"],
          default: "JOIN",
        },
        time: { type: Date, default: Date.now },
        location: { type: String, default: "" },
        coords: {
          latitude: { type: Number },
          longitude: { type: Number },
        },
        ip: { type: String, default: "" },
        device: { type: String, default: "" },
      },
    ],
    isSpeakingRequested: { type: Boolean, default: false }, // Đang bấm nút đăng ký phát biểu
    speakRequestTime: { type: Date },
    hasSpoken: { type: Boolean, default: false },
  },
  { _id: true }
);

// Schema chính của Cuộc họp không giấy tờ
const meetingSchema = new mongoose.Schema(
  {
    meetingCode: {
      type: String,
      unique: true,
      trim: true,
      uppercase: true,
    }, // Mã cuộc họp tự động (VD: PH-2026-0001)
    title: {
      type: String,
      required: [true, "Tiêu đề cuộc họp là bắt buộc"],
      trim: true,
    },
    meetingType: {
      type: String,
      enum: ["INTERNAL", "BGH", "STAFF", "ACADEMIC", "PARTY", "UNION", "OTHER"],
      default: "INTERNAL", // BGH: Họp Ban Giám Hiệu, STAFF: Họp Hội đồng Sư phạm, ACADEMIC: Họp Chuyên môn...
    },
    location: {
      type: String,
      default: "Phòng họp số 1 - Nhà A",
      trim: true,
    },
    roomType: {
      type: String,
      enum: ["PHYSICAL", "ONLINE", "HYBRID"],
      default: "PHYSICAL",
    },
    onlineMeetingUrl: { type: String, default: "" }, // Link Zoom / Google Meet nếu hybrid/online
    pinCode: { type: String, default: "" }, // Mã PIN 4-6 số để đại biểu vào phòng họp nhanh trên màn hình cảm ứng/tablet

    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },

    host: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    }, // Chủ tọa phiên họp
    hostName: { type: String, default: "" },

    secretary: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    }, // Thư ký phiên họp
    secretaryName: { type: String, default: "" },

    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
    }, // Đơn vị chủ trì

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    status: {
      type: String,
      enum: ["PREPARING", "IN_PROGRESS", "CONCLUDED", "CANCELLED"],
      default: "PREPARING", // Chuẩn bị -> Đang diễn ra -> Đã bế mạc / Kết luận -> Hủy
      index: true,
    },

    // Tài liệu chung của cuộc họp
    documents: [meetingDocumentSchema],

    // Chương trình họp (Agenda)
    agendas: [meetingAgendaSchema],
    currentAgendaIndex: { type: Number, default: 0 },

    // Danh sách đại biểu tham gia
    attendees: [meetingAttendeeSchema],

    // Các phiên biểu quyết / Bỏ phiếu
    votes: [meetingVoteSchema],

    // Biên bản cuộc họp
    minutes: {
      content: { type: String, default: "" }, // Nội dung biên bản (Rich-text)
      conclusions: { type: String, default: "" }, // Kết luận của Chủ tọa
      actionItems: [
        {
          taskTitle: { type: String, required: true },
          assignee: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          assigneeName: { type: String, default: "" },
          deadline: { type: Date },
          status: { type: String, default: "PENDING" },
          createdTaskId: { type: mongoose.Schema.Types.ObjectId, ref: "Task" }, // Liên kết sang module Quản lý công việc
        },
      ],
      aiSummary: { type: String, default: "" }, // Trợ lý AI tóm tắt biên bản
      signedDocumentUrl: { type: String, default: "" }, // File PDF biên bản đã ký
      updatedAt: { type: Date },
    },

    // Liên kết với Lịch công tác nếu cuộc họp được sinh từ Lịch tuần trường
    workScheduleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkSchedule",
    },
  },
  {
    timestamps: true,
  }
);

// Tự động sinh meetingCode nếu chưa có
meetingSchema.pre("save", async function (next) {
  if (!this.meetingCode) {
    const year = new Date().getFullYear();
    const prefix = `PH-${year}-`;
    const lastMeeting = await mongoose
      .model("Meeting")
      .findOne({ meetingCode: { $regex: `^${prefix}` } })
      .sort({ meetingCode: -1 })
      .select("meetingCode")
      .lean();

    let nextNum = 1;
    if (lastMeeting && lastMeeting.meetingCode) {
      const parts = lastMeeting.meetingCode.split("-");
      const lastNum = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastNum)) {
        nextNum = lastNum + 1;
      }
    }

    let candidateCode = `${prefix}${String(nextNum).padStart(4, "0")}`;
    while (await mongoose.model("Meeting").exists({ meetingCode: candidateCode })) {
      nextNum += 1;
      candidateCode = `${prefix}${String(nextNum).padStart(4, "0")}`;
    }

    this.meetingCode = candidateCode;
  }
  next();
});

const Meeting = mongoose.model("Meeting", meetingSchema);

module.exports = Meeting;
