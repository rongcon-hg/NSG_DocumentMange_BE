const mongoose = require("mongoose");

const documentTemplateSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Tiêu đề mẫu văn bản là bắt buộc"],
      trim: true,
    },
    code: {
      type: String,
      unique: true,
      trim: true,
      uppercase: true,
    },
    category: {
      type: String,
      enum: ["HANH_CHINH", "DAO_TAO", "TAI_CHINH", "CONG_TAC_HSSV", "TO_CHUC_CAN_BO", "KHAC"],
      default: "HANH_CHINH",
    },
    docType: {
      type: String,
      enum: ["TO_TRINH", "THONG_BAO", "QUYET_DINH", "KE_HOACH", "CONG_VAN", "BAO_CAO", "GIAY_MOI", "GIAY_DI_DUONG", "BIEN_BAN", "KHAC"],
      default: "TO_TRINH",
    },
    description: {
      type: String,
      default: "",
    },
    // Nội dung HTML hoặc Text mẫu chuẩn hóa có chứa các placeholders như {{TEN_CAN_BO}}, {{DON_VI}}, {{NGAY_HIEN_TAI}}
    content: {
      type: String,
      default: "",
    },
    // File đính kèm (.docx hoặc .pdf) mẫu
    file: {
      fileId: { type: String, default: "" },
      fileName: { type: String, default: "" },
      fileUrl: { type: String, default: "" },
      mimeType: { type: String, default: "" },
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    downloadCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DocumentTemplate", documentTemplateSchema);
