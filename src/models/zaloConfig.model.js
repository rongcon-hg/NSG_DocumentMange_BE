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

  // Cấu hình gửi thông báo vào Nhóm Zalo (Group Bot / Webhook)
  groupWebhookUrl: { type: String, default: '' },      // Webhook URL hoặc Bot Chat URL của Nhóm Zalo
  groupChatId: { type: String, default: '' },          // Group Chat ID / Thread ID Zalo
  groupNotificationsEnabled: { type: Boolean, default: false },

  // Bật/tắt các loại thông báo gửi qua Zalo
  notificationEvents: {
    docNew: { type: Boolean, default: true },          // Có văn bản đến mới
    docReview: { type: Boolean, default: true },       // Có văn bản trình ký / BGH duyệt
    taskAssign: { type: Boolean, default: true },      // Giao công việc mới
    taskDeadline: { type: Boolean, default: true },    // Cảnh báo công việc sắp hết hạn / quá hạn
    workSchedule: { type: Boolean, default: true },    // Ban hành lịch công tác tuần mới
    emulation: { type: Boolean, default: true },       // Đề nghị & xét duyệt thi đua khen thưởng
    mention: { type: Boolean, default: true },         // Nhắc tên @mention trong thảo luận
  },

  templateIds: {
    mention: { type: String, default: '' },      // Mã template ZNS thông báo khi có @mention
    urgentTask: { type: String, default: '' },   // Mã template ZNS giao việc gấp
    urgentDoc: { type: String, default: '' },    // Mã template ZNS văn bản khẩn
    docNew: { type: String, default: '' },       // Mã template văn bản mới
    taskAssign: { type: String, default: '' },   // Mã template giao việc
  }
}, { timestamps: true });

module.exports = mongoose.model('ZaloConfig', zaloConfigSchema);
