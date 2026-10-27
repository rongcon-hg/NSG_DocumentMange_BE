const mongoose = require("mongoose");

const signedDocumentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  originalFileName: { type: String, required: true },
  signedFileName: { type: String, required: true },
  fileId: { type: String, required: true }, // ID trên Google Drive của file đã ký
  fileHashSha256: { type: String, index: true }, // Mã băm SHA-256 để đối soát tính toàn vẹn
  mimeType: { type: String, required: true },
  signDate: { type: Date, default: Date.now },
  status: { type: String, enum: ["draft", "issued", "replied"], default: "draft" },
  signatureType: { type: String, default: "DIGITAL_SIGNATURE" },
  certificateInfo: {
    subject: { type: String },
    issuer: { type: String },
    serialNumber: { type: String },
    validTo: { type: String },
  },
  linkedDocumentId: { type: mongoose.Schema.Types.ObjectId, ref: "Document" }
}, { timestamps: true });

module.exports = mongoose.model("SignedDocument", signedDocumentSchema);
