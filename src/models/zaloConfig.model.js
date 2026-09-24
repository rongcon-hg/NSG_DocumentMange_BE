const mongoose = require('mongoose');

const zaloConfigSchema = new mongoose.Schema({
  oaId: { type: String, default: '' },
  appId: { type: String, default: '' },
  secretKey: { type: String, default: '' },
  accessToken: { type: String, default: '' },
  refreshToken: { type: String, default: '' },
  tokenExpiresAt: { type: Date },
  isActive: { type: Boolean, default: false },
  webhookSecret: { type: String, default: '' },
  templateIds: {
    mention: { type: String, default: '' },      // Mã template ZNS thông báo khi có @mention
    urgentTask: { type: String, default: '' },   // Mã template ZNS giao việc gấp
    urgentDoc: { type: String, default: '' },    // Mã template ZNS văn bản khẩn
  }
}, { timestamps: true });

module.exports = mongoose.model('ZaloConfig', zaloConfigSchema);
