const mongoose = require('mongoose');

const documentDraftSchema = new mongoose.Schema({
  title: { type: String, required: true },
  docType: { 
    type: String, 
    enum: ['TO_TRINH', 'THONG_BAO', 'QUYET_DINH', 'KE_HOACH', 'CONG_VAN', 'BAO_CAO', 'BIEN_BAN', 'KHAC'],
    default: 'TO_TRINH' 
  },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  prompt: { type: String, required: true },
  content: { type: String, required: true }, // HTML / Markdown nội dung đã soạn thảo
  metadata: {
    signerPosition: { type: String, default: 'HIỆU TRƯỞNG' },
    recipient: { type: String, default: 'Như điều 3; Lưu: VT.' },
    urgency: { type: String, default: 'Bình thường' },
    legalBases: [{ type: String }],
  },
  complianceCheck: {
    score: { type: Number, default: 100 },
    issues: [{ type: String }],
    suggestions: [{ type: String }],
  },
  status: {
    type: String,
    enum: ['DRAFT', 'SUBMITTED_TO_REPLY', 'EXPORTED'],
    default: 'DRAFT',
  },
}, { timestamps: true });

module.exports = mongoose.model('DocumentDraft', documentDraftSchema);
