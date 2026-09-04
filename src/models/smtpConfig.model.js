const mongoose = require('mongoose');

const smtpConfigSchema = new mongoose.Schema({
  host: { type: String, default: 'smtp.gmail.com' },
  port: { type: Number, default: 465 },
  senderName: { type: String, default: 'Hệ thống Quản lý Văn bản NSG' },
  user: { type: String, default: '' },
  pass: { type: String, default: '' },
  secure: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('SmtpConfig', smtpConfigSchema);
