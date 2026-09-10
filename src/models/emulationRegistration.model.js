const mongoose = require("mongoose");

const attachedFileSchema = new mongoose.Schema(
  {
    documentType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EmulationDocumentType",
    },
    documentTypeName: {
      type: String,
      default: "",
    },
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

const emulationRegistrationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
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
    schoolYear: {
      type: String,
      required: true,
      trim: true,
    },
    titles: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "EmulationTitle",
        required: true,
      },
    ],
    attachedFiles: [attachedFileSchema],
    notes: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["PENDING", "SUBMITTED_TO_BGH", "SCHOOL_APPROVED", "REJECTED"],
      default: "PENDING",
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
    bghReview: {
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
    history: [historySchema],
  },
  {
    timestamps: true,
  }
);

// Chỉ mục tìm kiếm nhanh
emulationRegistrationSchema.index({ user: 1, schoolYear: 1 });
emulationRegistrationSchema.index({ department: 1, schoolYear: 1 });
emulationRegistrationSchema.index({ status: 1 });

const EmulationRegistration = mongoose.model(
  "EmulationRegistration",
  emulationRegistrationSchema
);
module.exports = EmulationRegistration;
