const mongoose = require("mongoose");

const attachedFileSchema = new mongoose.Schema(
  {
    attachmentType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OnlineRecordAttachmentType",
    },
    attachmentTypeName: {
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

const recordHistorySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true, // "CREATED", "PROCESSING", "APPROVED", "REJECTED", "UPDATED", "CANCELLED"
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

// Trạng thái phê duyệt riêng lẻ theo từng người nhận
const recipientReviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    userName: {
      type: String,
      default: "",
    },
    userRole: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["PENDING", "PROCESSING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },
    reviewOpinion: {
      type: String,
      default: "",
    },
    reviewedAt: {
      type: Date,
    },
  },
  { _id: true }
);

const onlineRecordSchema = new mongoose.Schema(
  {
    // Mã hồ sơ tự sinh (ví dụ: HS-2026-0001)
    recordCode: {
      type: String,
      unique: true,
      trim: true,
      uppercase: true,
    },
    // Người gửi
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    position: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Position",
    },
    positionName: {
      type: String,
      default: "",
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
    },
    departmentName: {
      type: String,
      default: "",
    },
    phoneNumber: {
      type: String,
      default: "",
    },
    email: {
      type: String,
      default: "",
    },

    // Loại hồ sơ
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OnlineRecordCategory",
      required: true,
    },
    categoryName: {
      type: String,
      default: "",
    },

    // Tiêu đề & Nội dung
    title: {
      type: String,
      required: [true, "Tiêu đề hồ sơ là bắt buộc"],
      trim: true,
    },
    note: {
      type: String,
      default: "",
    },

    // Người nhận (mảng User ref)
    recipients: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    recipientNames: [{ type: String }],

    // Trạng thái phê duyệt/xử lý theo từng người nhận riêng lẻ
    recipientReviews: [recipientReviewSchema],

    // Danh sách file đính kèm theo danh mục
    attachedFiles: [attachedFileSchema],

    // Trạng thái tổng quát của hồ sơ:
    // PENDING: Chưa ai duyệt hoặc đang chờ
    // PROCESSING: Có ít nhất 1 người đang tiếp nhận
    // APPROVED: Tất cả người nhận đã phê duyệt (hoặc Manager/Admin duyệt)
    // REJECTED: Bị từ chối bởi ít nhất 1 người nhận (hoặc Manager/Admin)
    status: {
      type: String,
      enum: ["PENDING", "PROCESSING", "APPROVED", "REJECTED", "CANCELLED"],
      default: "PENDING",
    },

    // Ý kiến xử lý / phản hồi gần nhất
    reviewOpinion: {
      type: String,
      default: "",
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

    // Lịch sử xử lý tiến trình hồ sơ
    history: [recordHistorySchema],

    // Đánh dấu hồ sơ đã được ban hành văn bản chính thức
    isIssued: {
      type: Boolean,
      default: false,
    },
    issuedDocumentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
    },
  },
  {
    timestamps: true,
  }
);

// Tự động sinh recordCode nếu chưa có
onlineRecordSchema.pre("save", async function (next) {
  if (!this.recordCode) {
    const year = new Date().getFullYear();
    const prefix = `HS-${year}-`;
    // Tìm record có recordCode lớn nhất trong năm hiện tại
    const lastRecord = await mongoose
      .model("OnlineRecord")
      .findOne({ recordCode: { $regex: `^${prefix}` } })
      .sort({ recordCode: -1 })
      .select("recordCode")
      .lean();

    let nextNum = 1;
    if (lastRecord && lastRecord.recordCode) {
      const parts = lastRecord.recordCode.split("-");
      const lastNum = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastNum)) {
        nextNum = lastNum + 1;
      }
    }

    // Đảm bảo không trùng với bất kỳ record nào đã có
    let candidateCode = `${prefix}${String(nextNum).padStart(4, "0")}`;
    while (await mongoose.model("OnlineRecord").exists({ recordCode: candidateCode })) {
      nextNum += 1;
      candidateCode = `${prefix}${String(nextNum).padStart(4, "0")}`;
    }

    this.recordCode = candidateCode;
  }
  next();
});

const OnlineRecord = mongoose.model("OnlineRecord", onlineRecordSchema);

module.exports = OnlineRecord;
