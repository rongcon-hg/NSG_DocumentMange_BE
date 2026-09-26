const mongoose = require("mongoose");

const legalBasisSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    }, // Số / Ký hiệu văn bản: ví dụ "30/2020/NĐ-CP", "45/2019/QH14"
    title: {
      type: String,
      required: true,
      trim: true,
    }, // Trích yếu / Tên văn bản pháp luật: ví dụ "Nghị định về công tác văn thư"
    docType: {
      type: String,
      enum: ["LUAT", "NGHI_DINH", "THONG_TU", "QUYET_DINH", "CHI_THI", "KHAC"],
      default: "NGHI_DINH",
    },
    issuingAuthority: {
      type: String,
      default: "",
    }, // Cơ quan ban hành: Chính phủ, Quốc hội, Bộ GD&ĐT, Bộ LĐ-TB&XH, UBND TP.HCM...
    issuedDate: {
      type: Date,
    }, // Ngày ban hành
    effectiveDate: {
      type: Date,
    }, // Ngày có hiệu lực
    status: {
      type: String,
      enum: ["ACTIVE", "EXPIRED", "PARTIALLY_EXPIRED"],
      default: "ACTIVE",
      index: true,
    }, // Trạng thái hiệu lực: Còn hiệu lực (ACTIVE), Hết hiệu lực (EXPIRED), Hết hiệu lực một phần (PARTIALLY_EXPIRED)
    replacedBy: {
      type: String,
      default: "",
      trim: true,
    }, // Văn bản thay thế (nếu đã hết hiệu lực): ví dụ "Nghị định 30/2020/NĐ-CP"
    documentUrl: {
      type: String,
      default: "",
    }, // Đường dẫn tra cứu toàn văn / Thư viện pháp luật
    notes: {
      type: String,
      default: "",
    }, // Ghi chú chi tiết, phạm vi áp dụng
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

legalBasisSchema.index(
  { code: "text", title: "text", issuingAuthority: "text", replacedBy: "text" },
  { name: "LegalBasisTextIndex", default_language: "none" }
);

module.exports = mongoose.model("LegalBasis", legalBasisSchema);
