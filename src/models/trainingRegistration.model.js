const mongoose = require("mongoose");

const attachedProofSchema = new mongoose.Schema(
  {
    fileId: {
      type: String,
      required: true,
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
      default: "",
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const historySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    actorName: {
      type: String,
      default: "",
    },
    actorRole: {
      type: String,
      default: "",
    },
    details: {
      type: String,
      default: "",
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const trainingRegistrationSchema = new mongoose.Schema(
  {
    // Nhân sự được đăng ký (có thể null nếu nhân sự chưa có tài khoản trong hệ thống)
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      default: null,
      index: true,
    },
    userName: {
      type: String,
      required: true,
      trim: true,
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      index: true,
    },
    departmentName: {
      type: String,
      default: "",
    },
    position: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Position",
    },
    positionName: {
      type: String,
      default: "",
    },
    // Năm học / Năm đào tạo (ví dụ: "2026" hoặc "2025-2026")
    year: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    // Thông tin khóa bồi dưỡng
    trainingContent: {
      type: String,
      required: true,
      trim: true,
    },
    estimatedCost: {
      type: Number,
      default: 0,
    },
    trainingLocation: {
      type: String,
      default: "",
      trim: true,
    },
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    trainingDuration: {
      type: String,
      default: "",
      trim: true,
    },
    trainingForm: {
      type: String,
      enum: ["Chứng chỉ", "Chứng nhận", "Văn bằng", "Khác"],
      default: "Chứng chỉ",
      index: true,
    },
    // Người lập hồ sơ (Cấp trưởng đơn vị)
    createdByUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    createdByUserName: {
      type: String,
      default: "",
    },
    notes: {
      type: String,
      default: "",
    },
    // Trạng thái phê duyệt của Manager
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
      index: true,
    },
    managerReview: {
      status: {
        type: String,
        enum: ["PENDING", "APPROVED", "REJECTED"],
        default: "PENDING",
      },
      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      reviewedByName: {
        type: String,
        default: "",
      },
      reviewedAt: {
        type: Date,
      },
      note: {
        type: String,
        default: "",
      },
    },
    // Báo cáo kết quả bồi dưỡng sau khi học xong
    reportResult: {
      status: {
        type: String,
        enum: ["NOT_REPORTED", "REPORTED"],
        default: "NOT_REPORTED",
        index: true,
      },
      attended: {
        type: Boolean,
        default: null, // null: chưa báo cáo, true: có học, false: không học
      },
      notAttendedReason: {
        type: String,
        default: "",
      },
      resultDetails: {
        type: String,
        default: "",
      },
      hasFundingSupport: {
        type: Boolean,
        default: false,
      },
      actualFundAmount: {
        type: Number,
        default: 0,
      },
      // Thông tin văn bằng / chứng chỉ sau khi học xong
      certificateNumber: {
        type: String,
        default: "",
        trim: true,
      },
      issueDate: {
        type: Date,
      },
      issuePlace: {
        type: String,
        default: "",
        trim: true,
      },
      actualTrainingDuration: {
        type: String,
        default: "",
        trim: true,
      },
      proofFiles: [attachedProofSchema],
      reportedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      reportedByName: {
        type: String,
        default: "",
      },
      reportedAt: {
        type: Date,
      },
      managerConfirmed: {
        type: Boolean,
        default: false,
      },
      managerConfirmNote: {
        type: String,
        default: "",
      },
    },
    history: [historySchema],
  },
  {
    timestamps: true,
  }
);

trainingRegistrationSchema.index({ user: 1, year: 1 });
trainingRegistrationSchema.index({ department: 1, year: 1 });
trainingRegistrationSchema.index({ status: 1, year: 1 });

const TrainingRegistration = mongoose.model(
  "TrainingRegistration",
  trainingRegistrationSchema
);

module.exports = TrainingRegistration;
