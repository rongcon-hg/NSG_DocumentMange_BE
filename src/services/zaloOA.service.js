const ZaloConfig = require('../models/zaloConfig.model');
const User = require('../models/user.model');

// In-memory cache để giảm số lượng truy vấn DB và ngăn chặn request bão khi gửi thông báo hàng loạt
let cachedConfig = null;
let cachedConfigExpiry = 0;
let lastOARefreshFailTime = 0;

/**
 * Service tích hợp tương tác với Zalo Official Account (OA) & Zalo Notification Service (ZNS)
 */
class ZaloOAService {
  /**
   * Lấy cấu hình Zalo OA hiện tại (có cache 30s)
   */
  async getConfig(forceRefresh = false) {
    if (!forceRefresh && cachedConfig && Date.now() < cachedConfigExpiry) {
      return cachedConfig;
    }
    const connectDB = require('../config/db');
    await connectDB();
    let config = await ZaloConfig.findOne();
    const defaultToken = '4045703669582412985:XsqkbXxIySfPqICvghIIFSSAPvFhlrTsahrkuxMZIJdTwtAjwSnAizZvWXvZdSns';
    const defaultWebhook = `https://bot-api.zaloplatforms.com/bot${defaultToken}/sendMessage`;
    if (!config) {
      config = await ZaloConfig.create({
        oaId: process.env.ZALO_OA_ID || '785749141891313000',
        isActive: false,
        botToken: defaultToken,
        botName: 'Bot NSG-Office',
        botInviteLink: 'https://bot.zaloplatforms.com/groups/invite/bot.jrRZbwgC',
        groupWebhookUrl: defaultWebhook,
        groupNotificationsEnabled: true,
      });
    } else if (!config.botToken && !config.groupWebhookUrl) {
      config.botToken = defaultToken;
      config.botName = 'Bot NSG-Office';
      config.botInviteLink = 'https://bot.zaloplatforms.com/groups/invite/bot.jrRZbwgC';
      config.groupWebhookUrl = defaultWebhook;
      config.groupNotificationsEnabled = true;
      await config.save();
    }

    cachedConfig = config;
    cachedConfigExpiry = Date.now() + 30000;
    return config;
  }

  /**
   * Làm mới Access Token của Zalo OA khi sắp hết hạn sử dụng refresh_token
   */
  async refreshAccessToken(config) {
    if (!config.appId || !config.secretKey || !config.refreshToken) {
      throw new Error('Chưa cấu hình đầy đủ appId, secretKey hoặc refreshToken của Zalo OA');
    }

    // Nếu vừa mới bị lỗi refresh trong vòng 15 phút, tạm ngưng gọi Zalo OAuth để tránh bão lỗi
    if (lastOARefreshFailTime && (Date.now() - lastOARefreshFailTime < 15 * 60 * 1000)) {
      throw new Error('Refresh token Zalo OA đang tạm dừng thử lại do lỗi trước đó (chờ 15 phút)');
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
        cachedConfig = config;
        lastOARefreshFailTime = 0;
        return config.accessToken;
      } else {
        lastOARefreshFailTime = Date.now();
        throw new Error(resData?.message || 'Không thể gia hạn token Zalo OA');
      }
    } catch (error) {
      lastOARefreshFailTime = Date.now();
      console.error('Lỗi khi làm mới access token Zalo OA:', error.message);
      throw error;
    }
  }

  /**
   * Lấy access token hợp lệ (trả về null nếu chưa có token hoặc không thể làm mới, không quăng lỗi làm gián đoạn luồng Bot)
   */
  async getValidToken() {
    const config = await this.getConfig();
    if (!config.isActive) return null;

    // Kiểm tra thời hạn token (dự phòng hết hạn trước 5 phút)
    const isExpired = !config.tokenExpiresAt || new Date(config.tokenExpiresAt).getTime() - Date.now() < 5 * 60 * 1000;
    if (isExpired && config.refreshToken) {
      if (lastOARefreshFailTime && (Date.now() - lastOARefreshFailTime < 15 * 60 * 1000)) {
        return null;
      }
      try {
        return await this.refreshAccessToken(config);
      } catch (err) {
        console.warn('Bỏ qua Zalo OA token không hợp lệ, ưu tiên dùng Bot NSG-Office:', err.message);
        return null;
      }
    }
    return config.accessToken || null;
  }

  /**
   * Chuẩn hóa số điện thoại sang định dạng 84xxx
   */
  normalizePhone(phone) {
    if (!phone) return '';
    let cleaned = String(phone).replace(/[^0-9]/g, '');
    if (cleaned.startsWith('0')) {
      cleaned = '84' + cleaned.slice(1);
    }
    return cleaned;
  }

  /**
   * Chuẩn hóa số điện thoại sang định dạng 09xxx (10 số) để đối chiếu DB
   */
  normalizeLocalPhone(phone) {
    if (!phone) return '';
    let cleaned = String(phone).replace(/[^0-9]/g, '');
    if (cleaned.startsWith('84') && cleaned.length >= 11) {
      cleaned = '0' + cleaned.slice(2);
    }
    return cleaned;
  }

  /**
   * Gửi tin nhắn trực tiếp qua Zalo Bot (Bot NSG-Office) hoặc Zalo OA đến người dùng
   * @param {string|object} target zaloUserId hoặc user object { zaloId, mobile, name }
   * @param {string} text Nội dung tin nhắn văn bản
   * @param {object} options { skipSync: boolean } - Nếu skipSync=true (gửi hàng loạt) thì không gọi detectBotGroupChats tránh làm chậm
   */
  async sendMessageToUser(target, text, options = {}) {
    try {
      const config = await this.getConfig();
      const zaloId = typeof target === 'object' ? (target.zaloId || '').trim() : String(target || '').trim();
      const mobile = typeof target === 'object' ? (target.mobile || '').trim() : '';

      // Kiểm tra xem zaloId có phải là mã Zalo Chat ID thực sự hay đang lưu nhầm SĐT (09xxx) hoặc Email (@)
      const isPhoneInZaloId = /^(0[35789][0-9]{8}|84[35789][0-9]{8})$/.test(zaloId);
      const isEmailInZaloId = zaloId.includes('@');
      let realZaloChatId = (zaloId && !isPhoneInZaloId && !isEmailInZaloId) ? zaloId : '';
      const phoneToUse = mobile || (isPhoneInZaloId ? zaloId : '');

      // Nếu cán bộ chưa có realZaloChatId và không phải đang gửi hàng loạt (skipSync !== true),
      // tự động quét nhanh tin nhắn mới nhất từ Bot NSG-Office xem cán bộ vừa nhắn SĐT hoặc nhắn tin chưa
      if (!realZaloChatId && !options.skipSync && config.botToken && typeof target === 'object' && target._id) {
        try {
          await this.detectBotGroupChats(config.botToken);
          const refreshedUser = await User.findById(target._id).lean();
          const newZId = String(refreshedUser?.zaloId || '').trim();
          if (newZId && !/^(0[35789][0-9]{8}|84[35789][0-9]{8})$/.test(newZId) && !newZId.includes('@')) {
            realZaloChatId = newZId;
          }
        } catch (_) {
          // Ignore sync error
        }
      }

      // 1. ƯU TIÊN SỐ 1: Gửi qua Zalo Bot (Bot NSG-Office) bằng realZaloChatId (Miễn phí 100%, không cần OA Secret/Refresh Token)
      // Lưu ý: Zalo Bot Platform giới hạn tối đa 2000 ký tự mỗi tin nhắn
      const safeBotText = String(text || '').length > 1900
        ? String(text).slice(0, 1890) + '...\n(Xem chi tiết trên hệ thống)'
        : String(text || '');

      if (realZaloChatId && config.botToken) {
        try {
          const botRes = await fetch(`https://bot-api.zaloplatforms.com/bot${config.botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: realZaloChatId,
              text: safeBotText,
            }),
          });
          const botData = await botRes.json();
          const targetName = typeof target === 'object' ? (target.name || target.mobile) : target;
          if (botRes.ok && botData?.ok !== false) {
            console.log(`[Zalo Bot] Gửi thành công tới "${targetName}" (chat_id: ${realZaloChatId}, msg_id: ${botData?.result?.message_id})`);
            return { success: true, channel: 'ZALO_BOT', data: botData };
          } else {
            const failReason = botData?.description || (typeof botData === 'object' ? JSON.stringify(botData) : 'Lỗi không xác định');
            console.warn(`[Zalo Bot] Gửi thất bại tới "${targetName}" (chat_id: ${realZaloChatId}): ${failReason}`);
            return {
              success: false,
              reason: botData?.description || `Cán bộ đã liên kết Zalo ID (${realZaloChatId}) nhưng chưa mở khung chat riêng với Bot NSG-Office. Hướng dẫn: Cán bộ bấm vào Bot NSG-Office trong nhóm Zalo (hoặc mở https://bot.zaloplatforms.com/bots/1371050577415650488) và nhắn 1 tin bất kỳ trực tiếp cho Bot để nhận tin nhắn riêng!`,
            };
          }
        } catch (botErr) {
          console.warn('[Zalo Bot] Lỗi kết nối khi gửi qua Bot NSG-Office, thử tiếp qua Zalo OA:', botErr.message);
        }
      }

      // 2. ƯU TIÊN SỐ 2: Gửi qua Zalo Official Account (OA) nếu có cấu hình Token OA
      const token = await this.getValidToken();
      if (token) {
        if (realZaloChatId) {
          const response = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
            method: 'POST',
            headers: {
              access_token: token,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              recipient: { user_id: realZaloChatId },
              message: { text },
            }),
          });
          const resData = await response.json();
          if (resData?.error === 0) {
            return { success: true, channel: 'ZALO_OA', data: resData };
          }
        }

        if (phoneToUse) {
          const formattedPhone = this.normalizePhone(phoneToUse);
          const response = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
            method: 'POST',
            headers: {
              access_token: token,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              recipient: { user_id: formattedPhone, phone: formattedPhone },
              message: { text },
            }),
          });
          const resData = await response.json();
          if (resData?.error === 0) {
            return { success: true, channel: 'ZALO_OA_PHONE', data: resData };
          }
        }
      }

      // 3. Nếu cán bộ chỉ mới có SĐT (hoặc ô Zalo ID đang điền SĐT) mà chưa nhắn SĐT cho Bot NSG-Office
      return {
        success: false,
        reason: `Cán bộ chưa liên kết Zalo với Bot NSG-Office. Hướng dẫn: Cán bộ mở Zalo nhắn số điện thoại "${this.normalizeLocalPhone(phoneToUse) || '09xxxxxxxx'}" gửi cho Bot NSG-Office (hoặc vào nhóm có Bot) để hệ thống tự động liên kết 100%!`,
      };
    } catch (error) {
      console.error('Lỗi gửi tin nhắn Zalo cá nhân:', error.message);
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
      const targetUrl = config.groupWebhookUrl || (config.botToken ? `https://bot-api.zaloplatforms.com/bot${config.botToken}/sendMessage` : '');
      if (!config.groupNotificationsEnabled || !targetUrl) {
        return { success: false, reason: 'Thông báo nhóm Zalo chưa được bật hoặc chưa cấu hình Webhook URL / Bot Token' };
      }

      if (targetUrl.includes('bot-api.zaloplatforms.com') && !config.groupChatId) {
        return { success: false, reason: 'Chưa có Group Chat ID. Vui lòng mời Bot vào nhóm Zalo, gõ 1 tin nhắn trong nhóm rồi bấm "Tự động dò tìm Group Chat ID"!' };
      }

      // Hỗ trợ cả Zalo Bot Platform chuẩn, Chat Bot URL hoặc webhook chuyển tiếp (giới hạn 2000 ký tự của Zalo Bot API)
      const safeGroupText = String(text || '').length > 1900
        ? String(text).slice(0, 1890) + '...\n(Xem chi tiết trên hệ thống)'
        : String(text || '');

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: safeGroupText,
          content: safeGroupText,
          message: safeGroupText,
          chat_id: config.groupChatId || undefined,
        }),
      });

      const resText = await response.text();
      let resJson = null;
      try { resJson = JSON.parse(resText); } catch (_) { resJson = resText; }

      const isOk = response.ok && (resJson?.ok !== false);
      return { success: isOk, data: resJson, reason: resJson?.description || undefined };
    } catch (error) {
      console.error('Lỗi gửi tin nhắn vào nhóm Zalo:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Xử lý 1 tin nhắn từ Zalo Bot (cả từ Webhook hoặc getUpdates) để:
   * 1. Tự động lưu Group Chat ID nếu là tin nhắn trong nhóm
   * 2. Tự động khớp Số điện thoại (09xxx) hoặc Email trong tin nhắn với tài khoản cán bộ để gắn Zalo User ID (chat_id)
   */
  async processBotUpdateItem(item, config) {
    if (!item) return null;
    const msg = item.message || item.channel_post || item.my_chat_member || item.result?.message || item;
    const chatObj = msg?.chat || item?.chat;
    const fromUser = msg?.from || item?.from;
    const contactObj = msg?.contact || item?.contact || msg?.attachment?.payload || {};
    const rawText = String(msg?.text || msg?.content || contactObj?.phone || contactObj?.phone_number || JSON.stringify(msg) || '').trim();
    const textContent = String(msg?.text || msg?.content || '').trim();

    let linkedUser = null;
    // Nếu có title nhóm thì mới là GROUP, còn chat 1-1 với Bot thì là PRIVATE
    const chatType = String(chatObj?.chat_type || chatObj?.type || (chatObj?.title ? 'GROUP' : 'PRIVATE')).toUpperCase();
    const isGroupChat = chatType.includes('GROUP');

    // A. Lưu thông tin Chat / Group vào danh sách phát hiện
    if (chatObj && chatObj.id && isGroupChat) {
      const cId = String(chatObj.id);
      const title = chatObj.title || chatObj.display_name || `Nhóm Zalo (${cId})`;
      const foundChats = [...(config.detectedChats || [])];
      const idx = foundChats.findIndex((c) => c.chatId === cId);
      if (idx >= 0) {
        foundChats[idx].title = title;
        foundChats[idx].updatedAt = new Date();
      } else {
        foundChats.unshift({ chatId: cId, title, type: 'GROUP', updatedAt: new Date() });
      }
      config.detectedChats = foundChats.slice(0, 20);
      if (!config.groupChatId) {
        config.groupChatId = cId;
      }
    }

    // B. Tự động nhận diện Số điện thoại (gõ chữ hoặc gửi Danh thiếp Zalo) hoặc Họ tên hiển thị Zalo để gắn Zalo User ID cho Cán bộ
    // Khi chat 1-1 với Bot (!isGroupChat), chatObj.id chính là chat_id cá nhân để gửi tin nhắn cho người dùng
    const senderZaloId = String(
      (!isGroupChat && chatObj?.id)
        ? chatObj.id
        : (fromUser?.id || (!isGroupChat ? chatObj?.id : '') || '')
    );
    const senderName = fromUser?.display_name || fromUser?.name || contactObj?.name || contactObj?.display_name || (!isGroupChat ? chatObj?.display_name : '') || '';

    // Nếu trước đó người dùng đã gắn nhầm ID cá nhân của mình vào ô Group Chat ID thì khi họ nhắn riêng (PRIVATE), tự động giải phóng groupChatId
    if (!isGroupChat && senderZaloId && String(config.groupChatId) === senderZaloId) {
      const realGroup = (config.detectedChats || []).find(c => c.type === 'GROUP' && c.chatId !== senderZaloId);
      config.groupChatId = realGroup ? realGroup.chatId : '';
    }

    if (senderZaloId && (!isGroupChat || senderZaloId !== String(config.groupChatId))) {
      // Chuẩn hóa chuỗi để bắt số điện thoại dù gõ văn bản hay gửi Danh thiếp (091 791 9522)
      const cleanedDigits = rawText.replace(/[\s.\-()]/g, '');
      const phoneMatch = cleanedDigits.match(/(?:0|\+84|84)([35789][0-9]{8})/);
      let matchedUser = null;

      if (phoneMatch) {
        const localPhone = '0' + phoneMatch[1]; // Ví dụ: 0917919522
        const intlPhone = '84' + phoneMatch[1]; // Ví dụ: 84917919522

        // Tìm TẤT CẢ các tài khoản trong DB có số điện thoại này (ví dụ cả NSG Office và Nguyễn Văn Luyến dùng chung SĐT)
        const matchedUsers = await User.find({
          $or: [
            { mobile: { $regex: new RegExp(phoneMatch[1] + '$') } },
            { zaloId: localPhone },
            { zaloId: intlPhone },
          ],
        });

        for (const u of matchedUsers) {
          u.zaloId = senderZaloId;
          if (!u.mobile) u.mobile = localPhone;
          await u.save();
        }
        // Ưu tiên hiển thị tên cán bộ thực (không phải tài khoản hệ thống NSG Office)
        matchedUser = matchedUsers.find(u => u.email !== 'qlvb@nsgpc.edu.vn') || matchedUsers[0] || null;
      }

      // Nếu không có SĐT nhưng Họ tên hiển thị Zalo trùng khớp với Họ tên cán bộ trong hệ thống
      if (!matchedUser && senderName) {
        const cleanSenderName = senderName.trim();
        const nameMatches = await User.find({
          name: { $regex: new RegExp(`^${cleanSenderName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        });
        if (nameMatches.length >= 1) {
          for (const u of nameMatches) {
            u.zaloId = senderZaloId;
            await u.save();
          }
          matchedUser = nameMatches.find(u => u.email !== 'qlvb@nsgpc.edu.vn') || nameMatches[0];
          // Nếu cán bộ này có SĐT trùng với tài khoản khác (như NSG Office), gắn luôn cho đồng bộ
          if (matchedUser.mobile) {
            const digits = String(matchedUser.mobile).replace(/\D/g, '').slice(-9);
            if (digits.length === 9) {
              await User.updateMany(
                { mobile: { $regex: new RegExp(digits + '$') } },
                { $set: { zaloId: senderZaloId } }
              );
            }
          }
        }
      }

      if (matchedUser) {
        linkedUser = matchedUser;

        // Gửi tin nhắn phản hồi xác nhận ngay trên Zalo (gửi cả vào chatObj.id và senderZaloId nếu khác nhau)
        if (config.botToken) {
          const replyChatId = String(chatObj?.id || senderZaloId);
          const confirmText = `✅ [HỆ THỐNG VĂN PHÒNG SỐ - NSG]\nĐã liên kết thành công tài khoản Zalo "${senderName || matchedUser.name}" (Zalo ID: ${senderZaloId}) với cán bộ:\n👤 Họ và tên: ${matchedUser.name}\n📱 SĐT: ${matchedUser.mobile || 'Đã cập nhật'}\nTừ bây giờ Thầy/Cô sẽ nhận được thông báo tự động từ hệ thống!`;
          fetch(`https://bot-api.zaloplatforms.com/bot${config.botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: replyChatId,
              text: confirmText,
            }),
          }).catch(() => {});
        }
      } else if (!isGroupChat && config.botToken) {
        // Nếu người dùng nhắn riêng cho Bot nhưng chưa tìm thấy SĐT khớp, phản hồi hướng dẫn kèm Zalo ID của họ
        const replyChatId = String(chatObj?.id || senderZaloId);
        fetch(`https://bot-api.zaloplatforms.com/bot${config.botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: replyChatId,
            text: `👋 [HỆ THỐNG VĂN PHÒNG SỐ - NSG]\nXin chào ${senderName || 'Thầy/Cô'} (Mã Zalo ID của bạn: ${senderZaloId}).\nVui lòng gõ trực tiếp 10 chữ số điện thoại của bạn bằng bàn phím (ví dụ: 0917919522) và gửi vào đây để hệ thống tự động liên kết tài khoản!`,
          }),
        }).catch(() => {});
      }
    }

    return linkedUser;
  }

  /**
   * Tự động dò tìm Group Chat ID & Liên kết Zalo ID cán bộ từ Zalo Bot API (getUpdates)
   */
  async detectBotGroupChats(customBotToken = null) {
    try {
      const config = await this.getConfig();
      const token = (customBotToken || config.botToken || '').trim();
      if (!token) {
        return { success: false, message: 'Chưa có Bot Token để dò tìm nhóm' };
      }

      // 1. Kiểm tra thông tin Bot qua getMe
      const meRes = await fetch(`https://bot-api.zaloplatforms.com/bot${token}/getMe`);
      const meJson = await meRes.json();
      if (meJson?.ok && meJson?.result) {
        config.botToken = token;
        config.botName = meJson.result.display_name || meJson.result.account_name || 'Bot NSG-Office';
        config.groupWebhookUrl = `https://bot-api.zaloplatforms.com/bot${token}/sendMessage`;
      }

      // 2. Gọi getUpdates với timeout ngắn (3 giây) để lấy tin nhắn gần nhất
      const upRes = await fetch(`https://bot-api.zaloplatforms.com/bot${token}/getUpdates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeout: 3 }),
      });
      const upJson = await upRes.json();

      const linkedUsers = [];
      if (upJson?.ok && upJson?.result) {
        const results = Array.isArray(upJson.result) ? upJson.result : [upJson.result];
        for (const item of results) {
          const linked = await this.processBotUpdateItem(item, config);
          if (linked) linkedUsers.push({ _id: linked._id, name: linked.name, mobile: linked.mobile, zaloId: linked.zaloId });
        }
      }

      await config.save();

      return {
        success: true,
        botInfo: meJson?.result || null,
        detectedChats: config.detectedChats,
        groupChatId: config.groupChatId,
        groupWebhookUrl: config.groupWebhookUrl,
        linkedUsers,
        rawUpdate: upJson,
      };
    } catch (error) {
      console.error('Lỗi detectBotGroupChats:', error.message);
      return { success: false, message: error.message };
    }
  }

  /**
   * Vòng lặp ngầm (Background Polling) tự động lắng nghe tin nhắn gửi tới Bot NSG-Office trên VPS
   * để tự động lấy Group Chat ID và tự động liên kết Số điện thoại -> Zalo User ID
   */
  startBotPolling() {
    if (this._pollingStarted) return;
    this._pollingStarted = true;

    const pollLoop = async () => {
      try {
        const config = await this.getConfig();
        const token = (config?.botToken || '').trim();
        if (token) {
          const upRes = await fetch(`https://bot-api.zaloplatforms.com/bot${token}/getUpdates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeout: 10 }),
          });
          const upJson = await upRes.json();
          if (upJson?.ok && upJson?.result) {
            console.log('[ZaloBot Poll Update]:', JSON.stringify(upJson.result));
            const results = Array.isArray(upJson.result) ? upJson.result : [upJson.result];
            let changed = false;
            for (const item of results) {
              await this.processBotUpdateItem(item, config);
              changed = true;
            }
            if (changed) {
              await config.save();
            }
          }
        }
      } catch (_) {
        // Ignore network/timeout errors in background polling
      } finally {
        setTimeout(pollLoop, 1500);
      }
    };

    setTimeout(pollLoop, 3000);
  }

  /**
   * Helper: Gửi song song tin nhắn đến cá nhân (Zalo OA / Bot) và nhóm Zalo (Zalo Group)
   * Đảm bảo mỗi chat_id chỉ nhận đúng 1 tin nhắn duy nhất (chống trùng lặp 100%)
   */
  async dispatchNotification({ recipients = [], message, eventType = 'general', groupMessage = null }) {
    try {
      const config = await this.getConfig();
      
      // 1. Kiểm tra sự kiện này có được bật trong cấu hình Zalo không
      if (config.notificationEvents && config.notificationEvents[eventType] === false) {
        return;
      }

      const sentChatIds = new Set();
      const groupChatIdStr = String(config.groupChatId || '').trim();
      if (groupChatIdStr) {
        sentChatIds.add(groupChatIdStr);
      }

      // 2. Gửi vào Nhóm Zalo chung của cơ quan nếu được bật (Chỉ gửi 1 lần duy nhất)
      if (config.groupNotificationsEnabled && (config.groupWebhookUrl || config.botToken)) {
        const msgToSend = groupMessage || message;
        await this.sendMessageToGroup(msgToSend);
      }

      // 3. Gửi tin nhắn cá nhân đến từng cán bộ (loại bỏ trùng lặp và không gửi lại vào Group Chat ID)
      if ((config.isActive || config.botToken) && Array.isArray(recipients) && recipients.length > 0) {
        // Kiểm tra xem Zalo OA có token hợp lệ hay không trước khi gửi
        const validOaToken = config.isActive ? await this.getValidToken() : null;

        const tasksToRun = [];
        for (const user of recipients) {
          if (!user || (!user.zaloId && !user.mobile)) continue;
          if (user.zaloNotifications && user.zaloNotifications.enabled === false) continue;
          if (user.zaloNotifications && user.zaloNotifications[eventType] === false) continue;

          const uZaloId = String(user.zaloId || '').trim();
          const isPhoneInZaloId = /^(0[35789][0-9]{8}|84[35789][0-9]{8})$/.test(uZaloId);
          const isEmailInZaloId = uZaloId.includes('@');
          const realZaloChatId = (uZaloId && !isPhoneInZaloId && !isEmailInZaloId) ? uZaloId : '';

          // Nếu người dùng không có realZaloChatId và hệ thống không có token Zalo OA hợp lệ -> bỏ qua để tránh spam request lỗi
          if (!realZaloChatId && !validOaToken) {
            continue;
          }

          const uKey = realZaloChatId || String(user.mobile || '').trim();
          if (!uKey || sentChatIds.has(uKey)) continue;

          sentChatIds.add(uKey);
          tasksToRun.push(() => this.sendMessageToUser(user, message, { skipSync: true }));
        }

        if (tasksToRun.length > 0) {
          let successCount = 0;
          let failCount = 0;
          for (const sendFn of tasksToRun) {
            try {
              const res = await sendFn();
              if (res && res.success) {
                successCount++;
              } else {
                failCount++;
              }
            } catch (err) {
              failCount++;
              console.warn('[Zalo Dispatch] Lỗi gửi tin cá nhân:', err?.message);
            }
            // Giãn cách 60ms giữa các tin nhắn để bảo đảm Zalo Bot API không bị quá tải / rate-limit
            if (tasksToRun.length > 1) {
              await new Promise((r) => setTimeout(r, 60));
            }
          }
          console.log(`[Zalo Dispatch] Kết thúc gửi tin sự kiện "${eventType}": Thành công ${successCount}/${tasksToRun.length}, Thất bại/bỏ qua ${failCount}`);
        }
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

    // Tra cứu tên Người ký (User), Chức vụ (Position) và Cơ quan ban hành (Unit / Department) thay vì hiển thị ObjectId
    let signerDisplay = '';
    try {
      const Position = require('../models/position.model');
      let posTitle = '';
      if (docData.position && typeof docData.position === 'object' && docData.position.positionName) {
        posTitle = docData.position.positionName;
      } else if (docData.position && /^[0-9a-fA-F]{24}$/.test(String(docData.position))) {
        const posDoc = await Position.findById(docData.position).select('positionName').lean();
        if (posDoc?.positionName) posTitle = posDoc.positionName;
      }

      if (docData.signer && typeof docData.signer === 'object' && docData.signer.name) {
        signerDisplay = posTitle ? `${posTitle} - ${docData.signer.name}` : docData.signer.name;
      } else if (docData.signer && /^[0-9a-fA-F]{24}$/.test(String(docData.signer))) {
        const signerUser = await User.findById(docData.signer).populate('position', 'positionName').select('name position').lean();
        if (signerUser) {
          const finalPos = posTitle || signerUser.position?.positionName || '';
          signerDisplay = finalPos ? `${finalPos} - ${signerUser.name}` : signerUser.name;
        }
      } else if (docData.signer) {
        signerDisplay = String(docData.signer);
      }

      if (docData.unit) {
        if (typeof docData.unit === 'object' && docData.unit.unitName) {
          signerDisplay = signerDisplay ? `${docData.unit.unitName} (${signerDisplay})` : docData.unit.unitName;
        } else if (/^[0-9a-fA-F]{24}$/.test(String(docData.unit))) {
          const Unit = require('../models/unit.model');
          const unitDoc = await Unit.findById(docData.unit).select('unitName').lean();
          if (unitDoc?.unitName) {
            signerDisplay = signerDisplay ? `${unitDoc.unitName} (${signerDisplay})` : unitDoc.unitName;
          }
        }
      }
    } catch (lookupErr) {
      console.warn('Lỗi tra cứu tên người ký/đơn vị cho thông báo Zalo:', lookupErr.message);
    }
    if (!signerDisplay) {
      signerDisplay = 'Nhà trường / Cơ quan ban hành';
    }

    // Việt hóa mức độ khẩn (normal / high / immediately)
    const rawUrgency = String(docData.urgency || 'normal').toLowerCase();
    const urgencyMap = {
      normal: 'Bình thường',
      high: 'Khẩn',
      immediately: 'Hỏa tốc',
      'thường': 'Bình thường',
      'bình thường': 'Bình thường',
    };
    const urgencyLabel = urgencyMap[rawUrgency] || docData.urgency || 'Bình thường';
    const isUrgent = rawUrgency === 'high' || rawUrgency === 'immediately' || urgencyLabel.toLowerCase().includes('khẩn') || urgencyLabel.toLowerCase().includes('hỏa tốc');

    const deadlineStr = docData.deadlineDay
      ? `\n⏰ Hạn xử lý: ${new Date(docData.deadlineDay).toLocaleDateString('vi-VN')}`
      : '';

    const docTypeHeader = docData.docType === 'received' ? 'VĂN BẢN ĐẾN MỚI' : 'VĂN BẢN MỚI BAN HÀNH';

    const msg = `[HỆ THỐNG VĂN PHÒNG SỐ - ${docTypeHeader}]\n` +
      `📌 Số/Ký hiệu: ${docCode}\n` +
      `📝 Trích yếu: ${title}\n` +
      `🏢 Cơ quan/Người ký: ${signerDisplay}\n` +
      `⚡ Mức độ: ${urgencyLabel}${isUrgent ? ' 🚨' : ''}${deadlineStr}\n` +
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
   * 7. Thông báo Căn cứ pháp luật Bắt đầu có hiệu lực hoặc Hết hiệu lực
   */
  async notifyLegalBasisStatus({ legalDoc, statusType = 'ACTIVE', actorName = 'Hệ thống', recipientUsers = [] }) {
    if (!legalDoc) return;
    const docTypeMap = {
      LUAT: 'Luật',
      NGHI_DINH: 'Nghị định',
      THONG_TU: 'Thông tư',
      QUYET_DINH: 'Quyết định',
      CHI_THI: 'Chỉ thị',
      KHAC: 'Văn bản quy phạm',
    };
    const typeLabel = docTypeMap[legalDoc.docType] || legalDoc.docType || 'Văn bản pháp luật';
    const effDateStr = legalDoc.effectiveDate
      ? new Date(legalDoc.effectiveDate).toLocaleDateString('vi-VN')
      : 'Theo quy định';

    const isExpired = statusType === 'EXPIRED' || statusType === 'PARTIALLY_EXPIRED' || legalDoc.status === 'EXPIRED' || legalDoc.status === 'PARTIALLY_EXPIRED';
    const headerTitle = isExpired
      ? (legalDoc.status === 'PARTIALLY_EXPIRED' ? '⚠️ CẢNH BÁO CĂN CỨ PHÁP LUẬT HẾT HIỆU LỰC MỘT PHẦN' : '🚨 CẢNH BÁO CĂN CỨ PHÁP LUẬT ĐÃ HẾT HIỆU LỰC')
      : '✅ THÔNG BÁO CĂN CỨ PHÁP LUẬT BẮT ĐẦU CÓ HIỆU LỰC';

    const statusBadge = isExpired
      ? (legalDoc.status === 'PARTIALLY_EXPIRED' ? 'Hết hiệu lực một phần' : 'Đã hết hiệu lực')
      : 'Bắt đầu có hiệu lực (Còn hiệu lực)';

    const cleanNotes = String(legalDoc.notes || '').trim();
    const shortNotes = cleanNotes.length > 700
      ? cleanNotes.slice(0, 700).trim() + '... (xem đầy đủ trên hệ thống)'
      : cleanNotes;

    const msg = `[HỆ THỐNG VĂN PHÒNG SỐ - CĂN CỨ PHÁP LUẬT]\n` +
      `${headerTitle}\n` +
      `📌 Số/Ký hiệu: ${legalDoc.code} (${typeLabel})\n` +
      `📝 Tên văn bản: ${legalDoc.title}\n` +
      (legalDoc.issuingAuthority ? `🏢 Cơ quan ban hành: ${legalDoc.issuingAuthority}\n` : '') +
      `📅 Ngày hiệu lực: ${effDateStr}\n` +
      `📋 Tình trạng: ${statusBadge}\n` +
      (legalDoc.replacedBy ? `👉 Văn bản thay thế: ${legalDoc.replacedBy}\n` : '') +
      (shortNotes ? `💡 Ghi chú áp dụng: ${shortNotes}\n` : '') +
      `🔗 Tra cứu tại: https://qlvb.namsaigon.edu.vn/legal-bases`;

    return await this.dispatchNotification({
      recipients: recipientUsers,
      message: msg,
      eventType: 'legalBasis',
    });
  }

  /**
   * 8. Thông báo Xe công tác: Khi có đơn đăng ký xe mới gửi Ban Giám Hiệu
   */
  async notifyVehicleBookingCreated(booking, creatorUser, approverUser) {
    if (!approverUser) return;
    const depDateStr = booking.departureDate ? new Date(booking.departureDate).toLocaleDateString('vi-VN') : new Date(booking.departureTime).toLocaleDateString('vi-VN');
    const retDateStr = booking.returnDate ? new Date(booking.returnDate).toLocaleDateString('vi-VN') : new Date(booking.estimatedReturnTime).toLocaleDateString('vi-VN');
    const depHourStr = booking.departureHour ? `${booking.departureHour}, ` : '';
    const vehicleTypeStr = booking.vehicleType === 'SCHOOL_VEHICLE' ? 'Xe trường' : 'Xe công nghệ';

    const msg = `[HỆ THỐNG VĂN PHÒNG SỐ - ĐƠN ĐĂNG KÝ XE MỚI]\n` +
      `🚗 Mã phiếu: ${booking.bookingCode || 'Chờ cấp mã'}\n` +
      `👤 Người đăng ký: ${creatorUser?.name || booking.requesterName} (${booking.departmentName || 'NSG'})\n` +
      `📞 SĐT liên hệ: ${booking.contactPhone}\n` +
      `📌 Mục đích: ${booking.purpose}\n` +
      `📍 Lộ trình: ${booking.route}\n` +
      `⏰ Xuất phát: ${depHourStr}ngày ${depDateStr}\n` +
      `📅 Dự kiến về: ngày ${retDateStr}\n` +
      `👥 Số người đi: ${booking.passengersCount || 1} người\n` +
      `🚘 Loại xe: ${vehicleTypeStr} (Cần xe ${booking.requiredSeats || 7} chỗ)\n` +
      `Kính trình Thầy/Cô Ban Giám Hiệu xem xét và phê duyệt theo quy định.\n` +
      `🔗 Xem và phê duyệt: https://qlvb.namsaigon.edu.vn/vehicles`;

    return await this.dispatchNotification({
      recipients: [approverUser],
      message: msg,
      eventType: 'vehicle',
    });
  }

  /**
   * 9. Thông báo Xe công tác: Kết quả duyệt đơn xe cho Người đăng ký và Giao việc cho Người phân bổ xe
   */
  async notifyVehicleBookingStatus(booking, requesterUser, approverUser, isApproved, rejectionReason = '', assignedDispatcher = null) {
    const statusLabel = isApproved ? 'ĐỒNG Ý PHÊ DUYỆT ✅' : 'TỪ CHỐI DUYỆT ❌';
    const approverName = approverUser?.name || 'Ban Giám Hiệu';

    // A. Gửi cho Người đăng ký xe
    if (requesterUser) {
      const msgRequester = `[HỆ THỐNG VĂN PHÒNG SỐ - KẾT QUẢ DUYỆT ĐƠN XE]\n` +
        `🚗 Mã phiếu: ${booking.bookingCode}\n` +
        `📋 Trạng thái: ${statusLabel}\n` +
        `👤 Người duyệt: ${approverName} (Ban Giám Hiệu)\n` +
        `📌 Mục đích: ${booking.purpose}\n` +
        `📍 Lộ trình: ${booking.route}\n` +
        (isApproved && booking.vehicleType === 'SCHOOL_VEHICLE' ? `ℹ️ BGH đã chuyển tiếp cho bộ phận quản lý xe bố trí phương tiện và tài xế.\n` : '') +
        (isApproved && booking.vehicleType === 'RIDE_HAILING' ? `ℹ️ Phương tiện là Xe công nghệ: Đơn vị chủ động đặt xe và thực hiện theo đúng lộ trình.\n` : '') +
        (booking.approvalNotes ? `💬 Ý kiến BGH: "${booking.approvalNotes}"\n` : '') +
        (!isApproved && rejectionReason ? `⚠️ Lý do từ chối: "${rejectionReason}"\n` : '') +
        `🔗 Xem chi tiết: https://qlvb.namsaigon.edu.vn/vehicles`;

      await this.dispatchNotification({
        recipients: [requesterUser],
        message: msgRequester,
        eventType: 'vehicle',
      });
    }

    // B. Gửi cho Người phân bổ xe (Lãnh đạo được BGH giao nhiệm vụ xếp xe & tài xế)
    if (isApproved && booking.vehicleType === 'SCHOOL_VEHICLE' && assignedDispatcher) {
      const depDateStr = booking.departureDate ? new Date(booking.departureDate).toLocaleDateString('vi-VN') : new Date(booking.departureTime).toLocaleDateString('vi-VN');
      const retDateStr = booking.returnDate ? new Date(booking.returnDate).toLocaleDateString('vi-VN') : new Date(booking.estimatedReturnTime).toLocaleDateString('vi-VN');
      const depHourStr = booking.departureHour ? `${booking.departureHour}, ` : '';

      const msgDispatcher = `[HỆ THỐNG VĂN PHÒNG SỐ - GIAO NHIỆM VỤ PHÂN BỔ XE]\n` +
        `🚗 Mã phiếu: ${booking.bookingCode}\n` +
        `Ban Giám Hiệu vừa phê duyệt đơn đăng ký xe và giao Thầy/Cô bố trí phương tiện, tài xế phục vụ chuyến đi:\n` +
        `📌 Mục đích: ${booking.purpose}\n` +
        `📍 Lộ trình: ${booking.route}\n` +
        `⏰ Xuất phát: ${depHourStr}ngày ${depDateStr}\n` +
        `📅 Dự kiến về: ngày ${retDateStr}\n` +
        `👤 Người đăng ký: ${requesterUser?.name || booking.requesterName} (${booking.departmentName || 'NSG'}) - SĐT: ${booking.contactPhone}\n` +
        `👥 Số người: ${booking.passengersCount || 1} người (Cần xe ${booking.requiredSeats || 7} chỗ)\n` +
        (booking.approvalNotes ? `💬 Ý kiến BGH: "${booking.approvalNotes}"\n` : '') +
        `🔗 Vào phân bổ xe & tài xế: https://qlvb.namsaigon.edu.vn/vehicles`;

      await this.dispatchNotification({
        recipients: [assignedDispatcher],
        message: msgDispatcher,
        eventType: 'vehicle',
      });
    }
  }

  /**
   * 10. Thông báo Xe công tác: Đã phân bổ xe & tài xế (Gửi cho Người đăng ký và Tài xế)
   */
  async notifyVehicleDispatched(booking) {
    const vehicleName = booking.assignedVehicle?.name || "Xe trường";
    const licensePlate = booking.assignedVehicle?.licensePlate || "";
    const driverName = booking.assignedDriver?.fullName || "Tài xế phân công";
    const driverPhone = booking.assignedDriver?.phone || "";
    const depDateStr = booking.departureDate ? new Date(booking.departureDate).toLocaleDateString('vi-VN') : new Date(booking.departureTime).toLocaleDateString('vi-VN');
    const depHourStr = booking.departureHour ? `${booking.departureHour}, ` : '';

    // A. Gửi cho Người đăng ký xe
    if (booking.requester) {
      const msgRequester = `[HỆ THỐNG VĂN PHÒNG SỐ - XE ĐÃ ĐƯỢC PHÂN BỔ]\n` +
        `🚗 Mã phiếu: ${booking.bookingCode}\n` +
        `Chuyến đi công tác của bạn đã được bố trí phương tiện và tài xế sẵn sàng:\n` +
        `🚘 Phương tiện: ${vehicleName} - Biển số: ${licensePlate}\n` +
        `👨‍✈️ Tài xế: ${driverName}\n` +
        `📞 SĐT tài xế: ${driverPhone}\n` +
        `⏰ Xuất phát: ${depHourStr}ngày ${depDateStr}\n` +
        `📍 Lộ trình: ${booking.route}\n` +
        (booking.dispatchNotes ? `📝 Ghi chú điều phối: "${booking.dispatchNotes}"\n` : '') +
        `🔗 Xem chi tiết & in phiếu: https://qlvb.namsaigon.edu.vn/vehicles`;

      await this.dispatchNotification({
        recipients: [booking.requester],
        message: msgRequester,
        eventType: 'vehicle',
      });
    }

    // B. Gửi cho Tài xế phụ trách
    let driverRecipient = booking.assignedDriver?.userAccount;
    if (!driverRecipient && booking.assignedDriver?.phone) {
      try {
        const User = require('../models/user.model');
        driverRecipient = await User.findOne({ mobile: booking.assignedDriver.phone });
      } catch (_) {}
    }
    // Nếu không tìm thấy User account, tạo đối tượng giả lập để dispatchNotification vẫn gửi theo SĐT/zalo
    if (!driverRecipient && booking.assignedDriver?.phone) {
      driverRecipient = {
        name: driverName,
        mobile: booking.assignedDriver.phone,
        zaloId: booking.assignedDriver.phone,
      };
    }

    if (driverRecipient) {
      const msgDriver = `[HỆ THỐNG VĂN PHÒNG SỐ - LỊCH CHẠY XE CÔNG TÁC]\n` +
        `🚗 Mã phiếu: ${booking.bookingCode}\n` +
        `Bạn vừa được phân công lái xe phục vụ đoàn công tác:\n` +
        `🚘 Phương tiện: ${vehicleName} (Biển số: ${licensePlate})\n` +
        `⏰ Xuất phát: ${depHourStr}ngày ${depDateStr}\n` +
        `📍 Lộ trình: ${booking.route}\n` +
        `👤 Người liên hệ/Trưởng đoàn: ${booking.requester?.name || booking.requesterName} - SĐT: ${booking.contactPhone}\n` +
        `👥 Số người: ${booking.passengersCount || 1} người\n` +
        (booking.dispatchNotes ? `📝 Ghi chú: "${booking.dispatchNotes}"\n` : '') +
        `💡 Lưu ý: Khi xuất phát và khi về an toàn, vui lòng truy cập hệ thống để bấm "Bắt đầu đi" và "Đã về".\n` +
        `🔗 Xác nhận chuyến đi: https://qlvb.namsaigon.edu.vn/vehicles`;

      await this.dispatchNotification({
        recipients: [driverRecipient],
        message: msgDriver,
        eventType: 'vehicle',
      });
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
