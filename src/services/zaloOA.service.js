const ZaloConfig = require('../models/zaloConfig.model');
const User = require('../models/user.model');

/**
 * Service tích hợp tương tác với Zalo Official Account (OA) & Zalo Notification Service (ZNS)
 */
class ZaloOAService {
  /**
   * Lấy cấu hình Zalo OA hiện tại
   */
  async getConfig() {
    let config = await ZaloConfig.findOne();
    if (!config) {
      config = await ZaloConfig.create({
        oaId: process.env.ZALO_OA_ID || '785749141891313000',
        isActive: false
      });
    }
    return config;
  }

  /**
   * Làm mới Access Token của Zalo OA khi sắp hết hạn sử dụng refresh_token
   */
  async refreshAccessToken(config) {
    if (!config.appId || !config.secretKey || !config.refreshToken) {
      throw new Error('Chưa cấu hình đầy đủ appId, secretKey hoặc refreshToken của Zalo OA');
    }

    try {
      const body = new URLSearchParams({
        app_id: config.appId,
        grant_type: 'refresh_token',
        refresh_token: config.refreshToken,
      }).toString();

      const response = await fetch('https://oauth.zaloapp.com/v4/oa/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          secret_key: config.secretKey,
        },
        body,
      });

      const resData = await response.json();

      if (resData && resData.access_token) {
        config.accessToken = resData.access_token;
        if (resData.refresh_token) {
          config.refreshToken = resData.refresh_token;
        }
        config.tokenExpiresAt = new Date(Date.now() + (resData.expires_in || 90000) * 1000);
        await config.save();
        return config.accessToken;
      } else {
        throw new Error(resData?.message || 'Không thể gia hạn token Zalo OA');
      }
    } catch (error) {
      console.error('Lỗi khi làm mới access token Zalo OA:', error.message);
      throw error;
    }
  }

  /**
   * Lấy access token hợp lệ
   */
  async getValidToken() {
    const config = await this.getConfig();
    if (!config.isActive) return null;

    // Kiểm tra thời hạn token (dự phòng hết hạn trước 5 phút)
    const isExpired = !config.tokenExpiresAt || new Date(config.tokenExpiresAt).getTime() - Date.now() < 5 * 60 * 1000;
    if (isExpired && config.refreshToken) {
      return await this.refreshAccessToken(config);
    }
    return config.accessToken;
  }

  /**
   * Gửi tin nhắn trực tiếp qua Zalo OA đến người dùng (qua user_id trên Zalo OA)
   * @param {string} zaloUserId ID người dùng trên Zalo OA
   * @param {string} text Nội dung tin nhắn văn bản
   */
  async sendMessageToUser(zaloUserId, text) {
    try {
      const token = await this.getValidToken();
      if (!token) return { success: false, reason: 'Zalo OA chưa được kích hoạt hoặc token không khả dụng' };

      const response = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
        method: 'POST',
        headers: {
          access_token: token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: {
            user_id: zaloUserId,
          },
          message: {
            text: text,
          },
        }),
      });

      const resData = await response.json();
      return { success: resData?.error === 0, data: resData };
    } catch (error) {
      console.error('Lỗi gửi tin nhắn Zalo OA:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Gửi thông báo khi người dùng được nhắc tên (@mention) trong thảo luận
   */
  async notifyMention({ senderName, recipientUser, targetType, targetTitle, contentPreview }) {
    if (!recipientUser) return;
    
    // Kiểm tra cấu hình nhận thông báo của user
    if (recipientUser.zaloNotifications && !recipientUser.zaloNotifications.enabled) return;
    if (recipientUser.zaloNotifications && recipientUser.zaloNotifications.mention === false) return;

    if (!recipientUser.zaloId) return;

    const message = `[HỆ THỐNG QLVB - THÔNG BÁO THẢO LUẬN]\n` +
      `Đồng chí ${senderName} đã nhắc tên bạn trong thảo luận ${targetType === 'Task' ? 'công việc' : 'văn bản'}:\n` +
      `📌 "${targetTitle || 'Tài liệu'}"\n` +
      `💬 Nội dung: "${contentPreview}"\n\n` +
      `Vui lòng truy cập hệ thống QLVB Nam Sài Gòn để xem chi tiết và phản hồi.`;

    return await this.sendMessageToUser(recipientUser.zaloId, message);
  }

  /**
   * Gửi thông báo công việc khẩn hoặc văn bản khẩn
   */
  async notifyUrgentItem({ recipientUser, title, senderName, type = 'task' }) {
    if (!recipientUser || !recipientUser.zaloId) return;
    if (recipientUser.zaloNotifications && !recipientUser.zaloNotifications.enabled) return;

    const typeStr = type === 'task' ? 'GIAO VIỆC KHẨN' : 'VĂN BẢN ĐẾN KHẨN CẦN XỬ LÝ';
    const message = `[HỆ THỐNG QLVB - ${typeStr}]\n` +
      `Người gửi / giao việc: ${senderName}\n` +
      `Tiêu đề: "${title}"\n\n` +
      `Vui lòng đăng nhập hệ thống để tiếp nhận và giải quyết theo đúng hạn.`;

    return await this.sendMessageToUser(recipientUser.zaloId, message);
  }
}

module.exports = new ZaloOAService();
