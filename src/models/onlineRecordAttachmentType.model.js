const mongoose = require("mongoose");

const onlineRecordAttachmentTypeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, "Mã danh mục file là bắt buộc"],
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: [true, "Tên danh mục file đính kèm là bắt buộc"],
      trim: true,
    },
    // Áp dụng cho các loại hồ sơ nào (nếu để rỗng thì áp dụng cho tất cả loại hồ sơ)
    applicableCategories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "OnlineRecordCategory",
      },
    ],
    isRequired: {
      type: Boolean,
      default: false,
    },
    allowedExtensions: {
      type: String,
      default: ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg",
    },
    description: {
      type: String,
      default: "",
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Tạo index duy nhất cho cặp code và danh mục (hoặc mã riêng biệt)
onlineRecordAttachmentTypeSchema.index({ code: 1 }, { unique: true });

const OnlineRecordAttachmentType = mongoose.model(
  "OnlineRecordAttachmentType",
  onlineRecordAttachmentTypeSchema
);

module.exports = OnlineRecordAttachmentType;
