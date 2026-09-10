const mongoose = require("mongoose");

const attachedFileSchema = new mongoose.Schema(
  {
    fileId: {
      type: String,
      default: "",
    },
    fileName: {
      type: String,
      required: true,
    },
    mimeType: {
      type: String,
      default: "",
    },
    size: {
      type: String,
      default: "",
    },
    fileUrl: {
      type: String,
      required: true,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const emulationAchievementSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, "Họ và tên là bắt buộc"],
      trim: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
    },
    departmentName: {
      type: String,
      required: [true, "Đơn vị công tác là bắt buộc"],
      trim: true,
    },
    // Danh hiệu thi đua (tham chiếu từ Danh mục danh hiệu)
    title: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EmulationTitle",
      default: null,
    },
    titleName: {
      type: String,
      default: "",
      trim: true,
    },
    // Nội dung thành tích / chi tiết khen thưởng
    achievementContent: {
      type: String,
      required: [true, "Nội dung thành tích là bắt buộc"],
      trim: true,
    },
    decisionNumber: {
      type: String,
      default: "",
      trim: true,
    },
    decisionDate: {
      type: Date,
      default: null,
    },
    decisionAgency: {
      type: String,
      default: "",
      trim: true,
    },
    schoolYear: {
      type: String,
      default: "",
      trim: true,
    },
    attachedFiles: [attachedFileSchema],
    driveLink: {
      type: String,
      default: "",
      trim: true,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    source: {
      type: String,
      enum: ["MANUAL", "IMPORT_EXCEL", "SYSTEM_PROMOTED"],
      default: "MANUAL",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    createdByName: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

emulationAchievementSchema.index({ fullName: 1, departmentName: 1, schoolYear: 1 });

const EmulationAchievement = mongoose.model("EmulationAchievement", emulationAchievementSchema);
module.exports = EmulationAchievement;
