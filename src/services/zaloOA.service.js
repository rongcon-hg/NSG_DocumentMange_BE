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
   * Gửi tin nhắn tự động vào Nhóm Zalo (Zalo Group Bot / Webhook)
   * @param {string} text Nội dung tin nhắn cần gửi vào nhóm
   */
  async sendMessageToGroup(text) {
    try {
      const config = await this.getConfig();
      if (!config.groupNotificationsEnabled || !config.groupWebhookUrl) {
        return { success: false, reason: 'Thông báo nhóm Zalo chưa được bật hoặc chưa cấu hình Webhook URL' };
      }

      // Hỗ trợ cả Zalo Webhook chuẩn, Chat Bot URL hoặc webhook chuyển tiếp
      const response = await fetch(config.groupWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          content: text,
          message: text,
          chat_id: config.groupChatId || undefined,
        }),
      });

      const resText = await response.text();
      let resJson = null;
      try { resJson = JSON.parse(resText); } catch (_) { resJson = resText; }

      return { success: response.ok, data: resJson };
    } catch (error) {
      console.error('Lỗi gửi tin nhắn vào nhóm Zalo:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Helper: Gửi song song tin nhắn đến cá nhân (Zalo OA) và nhóm Zalo (Zalo Group)
   */
  async dispatchNotification({ recipients = [], message, eventType = 'general', groupMessage = null }) {
    try {
      const config = await this.getConfig();
      
      // 1. Kiểm tra sự kiện này có được bật trong cấu hình Zalo không
      if (config.notificationEvents && config.notificationEvents[eventType] === false) {
        return;
      }

      // 2. Gửi tin nhắn cá nhân đến từng cán bộ có liên kết Zalo ID
      if (config.isActive && Array.isArray(recipients) && recipients.length > 0) {
        for (const user of recipients) {
          if (!user || !user.zaloId) continue;
          if (user.zaloNotifications && user.zaloNotifications.enabled === false) continue;
          if (user.zaloNotifications && user.zaloNotifications[eventType] === false) continue;

          await this.sendMessageToUser(user.zaloId, message);
        }
      }

      // 3. Gửi vào Nhóm Zalo chung của cơ quan nếu được bật
      if (config.groupNotificationsEnabled && config.groupWebhookUrl) {
        const msgToSend = groupMessage || message;
        await this.sendMessageToGroup(msgToSend);
      }
    } catch (error) {
      console.error('Lỗi trong dispatchNotification Zalo:', error.message);
    }
  }

  /**
   * 1. Thông báo khi có Văn bản đến mới ban hành
   */
  async notifyNewDocument(docData, recipientUsers = []) {
    const docCode = (docData.docNum && docData.docCode) ? `${docData.docNum}/${docData.docCode}` : (docData.docCode || 'Chưa có số');
    const title = docData.shortDescription || 'Không có trích yếu';
    const signer = docData.signer || docData.author || 'Cơ quan ban hành';
    const urgency = docData.urgency || 'Thường';
    const isUrgent = urgency.toLowerCase().includes('khẩn') || urgency.toLowerCase().includes('hỏa tốc');

    const msg = `[HỆ THỐNG VĂN PHÒNG SỐ - VĂN BẢN ĐẾN MỚI]\n` +
      `📌 Số/Ký hiệu: ${docCode}\n` +
      `📝 Trích yếu: ${title}\n` +
      `🏢 Cơ quan/Người ký: ${signer}\n` +
      `⚡ Mức độ: ${urgency} ${isUrgent ? '🚨' : ''}\n` +
      `🔗 Xem văn bản: https://qlvb.namsaigon.edu.vn/documents/ReceivedDocumentList`;

    return await this.dispatchNotification({
      recipients: recipientUsers,
      message: msg,
      eventType: 'docNew',
    });
  }

  /**
   * 2. Thông báo Văn bản trình ký / Xét duyệt văn bản
   */
  async notifyDocReview({ docTitle, docCode, drafterName, status, notes = '', recipientUsers = [] }) {
    const msg = `[HỆ THỐNG VĂN PHÒNG SỐ - TRÌNH KÝ & XÉT DUYỆT]\n` +
      `📄 Văn bản: "${docTitle}" (${docCode || 'Văn bản trình ký'})\n` +
      `👤 Người trình ký: ${drafterName || 'Cán bộ'}\n` +
      `📋 Trạng thái: ${status}\n` +
      (notes ? `💬 Ý kiến / Nhận xét: "${notes}"\n` : '') +
      `🔗 Xem chi tiết: https://qlvb.namsaigon.edu.vn/getAllRepliedDoc`;

    return await this.dispatchNotification({
      recipients: recipientUsers,
      message: msg,
      eventType: 'docReview',
    });
  }

  /**
   * 3. Thông báo Giao việc mới
   */
  async notifyTaskAssigned(taskData, recipientUsers = []) {
    const title = taskData.title || 'Công việc mới';
    const assignerName = taskData.createdByName || taskData.createdBy?.name || 'Lãnh đạo';
    const deadline = taskData.endDate ? new Date(taskData.endDate).toLocaleDateString('vi-VN') : 'Không quy định';
    const priority = taskData.priority || 'Bình thường';

    const msg = `[HỆ THỐNG VĂN PHÒNG SỐ - GIAO VIỆC MỚI]\n` +
      `📌 Công việc: "${title}"\n` +
      `👤 Người giao: ${assignerName}\n` +
      `⏰ Hạn hoàn thành: ${deadline}\n` +
      `⭐ Mức độ ưu tiên: ${priority}\n` +
      `🔗 Vào xử lý: https://qlvb.namsaigon.edu.vn/schedule/todo`;

    return await this.dispatchNotification({
      recipients: recipientUsers,
      message: msg,
      eventType: 'taskAssign',
    });
  }

  /**
   * 4. Cảnh báo hạn công việc (Sắp đến hạn / Quá hạn)
   */
  async notifyTaskDeadline({ taskTitle, deadline, recipientUsers = [], isOverdue = false }) {
    const statusText = isOverdue ? '⚠️ ĐÃ QUÁ HẠN' : '⏰ SẮP ĐẾN HẠN';
    const msg = `[HỆ THỐNG VĂN PHÒNG SỐ - ${statusText}]\n` +
      `📌 Công việc: "${taskTitle}"\n` +
      `📅 Thời hạn: ${deadline}\n` +
      `Đồng chí vui lòng khẩn trương hoàn thành và báo cáo tiến độ trên phần mềm.\n` +
      `🔗 Xem công việc: https://qlvb.namsaigon.edu.vn/schedule/inprogress`;

    return await this.dispatchNotification({
      recipients: recipientUsers,
      message: msg,
      eventType: 'taskDeadline',
    });
  }

  /**
   * 5. Ban hành Lịch công tác tuần mới
   */
  async notifyWorkSchedulePublished({ weekTitle, recipientUsers = [] }) {
    const msg = `[HỆ THỐNG VĂN PHÒNG SỐ - LỊCH CÔNG TÁC NHÀ TRƯỜNG]\n` +
      `📅 Ban Giám hiệu vừa ban hành: ${weekTitle || 'Lịch công tác tuần mới'}\n` +
      `Kính mời Quý Thầy/Cô, Cán bộ giảng viên truy cập hệ thống để theo dõi lịch và chủ động công tác.\n` +
      `🔗 Xem lịch tuần: https://qlvb.namsaigon.edu.vn/work-schedule`;

    return await this.dispatchNotification({
      recipients: recipientUsers,
      message: msg,
      eventType: 'workSchedule',
    });
  }

  /**
   * 6. Thông báo Xét duyệt Thi đua - Khen thưởng
   */
  async notifyEmulationStatus({ targetName, schoolYear, statusText, actorName, notes = '', recipientUsers = [] }) {
    const msg = `[HỆ THỐNG VĂN PHÒNG SỐ - THI ĐUA KHEN THƯỞNG]\n` +
      `🏆 Hồ sơ: ${targetName} (Năm học ${schoolYear || ''})\n` +
      `📋 Trạng thái: ${statusText}\n` +
      `👤 Người duyệt: ${actorName}\n` +
      (notes ? `💬 Ý kiến / Nhận xét: "${notes}"\n` : '') +
      `🔗 Xem hồ sơ: https://qlvb.namsaigon.edu.vn/emulation/list`;

    return await this.dispatchNotification({
      recipients: recipientUsers,
      message: msg,
      eventType: 'emulation',
    });
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
