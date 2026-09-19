const mongoose = require("mongoose");

const workScheduleSchema = new mongoose.Schema(
  {
    startDate: {
      type: Date,
      required: [true, "Ngày bắt đầu là bắt buộc"],
      index: true,
    },
    endDate: {
      type: Date,
      required: [true, "Ngày kết thúc là bắt buộc"],
      index: true,
    },
    startTime: {
      type: String, // format "HH:mm" e.g. "08:00"
      default: "",
    },
    endTime: {
      type: String, // format "HH:mm" e.g. "10:30"
      default: "",
    },
    content: {
      type: String,
      required: [true, "Nội dung công tác là bắt buộc"],
      trim: true,
    },
    participants: {
      type: String, // Thành phần tham dự
      default: "",
      trim: true,
    },
    location: {
      type: String, // Địa điểm
      default: "",
      trim: true,
    },
    notes: {
      type: String, // Ghi chú
      default: "",
      trim: true,
    },
    host: {
      type: String, // Người chủ trì (ví dụ: Ban Giám Hiệu, Thầy Hiệu trưởng...)
      default: "",
      trim: true,
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
      index: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    targetApprover: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    approvedAt: {
      type: Date,
    },
    rejectionReason: {
      type: String,
      default: "",
    },
    attachments: [
      {
        fileName: String,
        fileUrl: String,
        fileId: String,
        mimeType: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

workScheduleSchema.index({ startDate: 1, startTime: 1 });
workScheduleSchema.index({ status: 1, startDate: 1 });

const WorkSchedule = mongoose.model("WorkSchedule", workScheduleSchema);

module.exports = WorkSchedule;
