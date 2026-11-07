const ZaloConfig = require('../models/zaloConfig.model');
const zaloOAService = require('../services/zaloOA.service');
const User = require('../models/user.model');

/**
 * Lấy cấu hình Zalo OA & Group Bot (Chỉ Admin)
 */
const getZaloConfig = async (req, res) => {
  try {
    const config = await zaloOAService.getConfig();
    // Ẩn bớt secretKey và tokens khi trả về client để bảo mật
    const safeConfig = {
      _id: config._id,
      oaId: config.oaId,
      appId: config.appId,
      isActive: config.isActive,
      tokenExpiresAt: config.tokenExpiresAt,
      hasSecretKey: !!config.secretKey,
      hasAccessToken: !!config.accessToken,
      hasRefreshToken: !!config.refreshToken,
      botToken: config.botToken || '',
      botName: config.botName || 'Bot NSG-Office',
      botInviteLink: config.botInviteLink || 'https://bot.zaloplatforms.com/groups/invite/bot.jrRZbwgC',
      groupWebhookUrl: config.groupWebhookUrl || '',
      groupChatId: config.groupChatId || '',
      groupNotificationsEnabled: !!config.groupNotificationsEnabled,
      detectedChats: config.detectedChats || [],
      notificationEvents: config.notificationEvents || {},
      templateIds: config.templateIds || {},
      updatedAt: config.updatedAt,
    };
    return res.json({ success: true, data: safeConfig });
  } catch (error) {
    console.error('Lỗi getZaloConfig:', error);
    return res.status(500).json({ success: false, message: 'Lỗi khi lấy cấu hình Zalo OA' });
  }
};

/**
 * Cập nhật cấu hình Zalo OA & Group Bot (Chỉ Admin)
 */
const updateZaloConfig = async (req, res) => {
  try {
    const { 
      oaId, 
      appId, 
      secretKey, 
      refreshToken, 
      isActive, 
      templateIds,
      botToken,
      botName,
      botInviteLink,
      groupWebhookUrl,
      groupChatId,
      groupNotificationsEnabled,
      notificationEvents
    } = req.body;

    let config = await ZaloConfig.findOne();
    if (!config) {
      config = new ZaloConfig();
    }

    if (oaId !== undefined) config.oaId = oaId;
    if (appId !== undefined) config.appId = appId;
    if (secretKey) config.secretKey = secretKey;
    if (refreshToken) config.refreshToken = refreshToken;
    if (isActive !== undefined) config.isActive = isActive;
    if (templateIds) config.templateIds = { ...config.templateIds, ...templateIds };
    if (botToken !== undefined) {
      config.botToken = botToken.trim();
      if (config.botToken && !groupWebhookUrl) {
        config.groupWebhookUrl = `https://bot-api.zaloplatforms.com/bot${config.botToken}/sendMessage`;
      }
    }
    if (botName !== undefined) config.botName = botName;
    if (botInviteLink !== undefined) config.botInviteLink = botInviteLink;
    if (groupWebhookUrl !== undefined) config.groupWebhookUrl = groupWebhookUrl;
    if (groupChatId !== undefined) config.groupChatId = groupChatId;
    if (groupNotificationsEnabled !== undefined) config.groupNotificationsEnabled = groupNotificationsEnabled;
    if (notificationEvents) config.notificationEvents = { ...config.notificationEvents, ...notificationEvents };

    // Nếu người dùng nhập refresh token mới, thử refresh ngay để lấy access token
    if (refreshToken && config.appId && config.secretKey) {
      try {
        await zaloOAService.refreshAccessToken(config);
      } catch (err) {
        console.warn('Không thể refresh token Zalo ngay:', err.message);
      }
    }

    await config.save();

    return res.json({
      success: true,
      message: 'Cập nhật cấu hình Zalo OA & Nhóm Zalo thành công',
      data: {
        oaId: config.oaId,
        appId: config.appId,
        isActive: config.isActive,
        tokenExpiresAt: config.tokenExpiresAt,
        groupNotificationsEnabled: config.groupNotificationsEnabled,
      }
    });
  } catch (error) {
    console.error('Lỗi updateZaloConfig:', error);
    return res.status(500).json({ success: false, message: 'Lỗi khi cập nhật cấu hình Zalo' });
  }
};

/**
 * Test gửi tin nhắn Zalo OA tới 1 cán bộ
 */
const testSendMessage = async (req, res) => {
  try {
    const { userId, testMessage } = req.body;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    }

    if (!user.mobile && !user.zaloId) {
      return res.status(400).json({ success: false, message: 'Cán bộ này chưa cập nhật Số điện thoại hoặc Zalo ID trên hệ thống' });
    }

    const result = await zaloOAService.sendMessageToUser(
      user,
      testMessage || `[QLVB] Xin chào ${user.name}, đây là tin nhắn kiểm tra kết nối từ hệ thống QLVB Nam Sài Gòn.`
    );

    if (result.success) {
      return res.json({ success: true, message: `Đã gửi tin nhắn Zalo tới ${user.name} (${user.mobile || user.zaloId}) thành công!`, data: result.data });
    } else {
      return res.status(400).json({
        success: false,
        message: result.reason || result.error || 'Gửi tin nhắn Zalo cá nhân thất bại',
        error: result,
      });
    }
  } catch (error) {
    console.error('Lỗi testSendMessage Zalo:', error);
    return res.status(500).json({ success: false, message: 'Lỗi xử lý gửi tin Zalo', error: error.message });
  }
};

/**
 * Test gửi tin nhắn vào Nhóm Zalo (Group Webhook)
 */
const testSendGroupMessage = async (req, res) => {
  try {
    const { testMessage } = req.body;
    const msg = testMessage || `[HỆ THỐNG VĂN PHÒNG SỐ]\n✅ Đây là tin nhắn kiểm tra kết nối tự động tới Nhóm Zalo từ hệ thống QLVB Nam Sài Gòn.`;
    const result = await zaloOAService.sendMessageToGroup(msg);

    if (result.success) {
      return res.json({ success: true, message: 'Gửi tin nhắn vào Nhóm Zalo thành công!', data: result.data });
    } else {
      return res.status(400).json({ success: false, message: 'Gửi tin nhắn vào Nhóm Zalo thất bại: ' + (result.reason || result.error || 'Kiểm tra lại Webhook URL') });
    }
  } catch (error) {
    console.error('Lỗi testSendGroupMessage:', error);
    return res.status(500).json({ success: false, message: 'Lỗi gửi tin nhắn vào nhóm Zalo', error: error.message });
  }
};

/**
 * Tự động dò tìm Group Chat ID từ Zalo Bot API (getUpdates)
 */
const detectBotGroupChats = async (req, res) => {
  try {
    const { botToken } = req.body || {};
    const result = await zaloOAService.detectBotGroupChats(botToken);
    if (result.success) {
      const linkedCount = result.linkedUsers?.length || 0;
      const groupCount = result.detectedChats?.length || 0;
      let msg = 'Đã đồng bộ dữ liệu từ Bot NSG-Office!';
      if (linkedCount > 0 && groupCount > 0) {
        msg = `Đã tự động liên kết Zalo ID cho ${linkedCount} cán bộ và tìm thấy ${groupCount} nhóm Zalo!`;
      } else if (linkedCount > 0) {
        msg = `Đã tự động liên kết Zalo ID thành công cho ${linkedCount} cán bộ (${result.linkedUsers.map(u => u.name).join(', ')})!`;
      } else if (groupCount > 0) {
        msg = `Đã tìm thấy ${groupCount} nhóm/cuộc trò chuyện Zalo!`;
      } else {
        msg = 'Bot NSG-Office đang hoạt động! Cán bộ chỉ cần nhắn Số điện thoại vào nhóm Zalo có Bot là hệ thống sẽ tự động gắn Zalo ID.';
      }
      return res.json({
        success: true,
        message: msg,
        data: result,
      });
    } else {
      return res.status(400).json({ success: false, message: result.message || 'Không thể dò tìm nhóm' });
    }
  } catch (error) {
    console.error('Lỗi detectBotGroupChats:', error);
    return res.status(500).json({ success: false, message: 'Lỗi khi dò tìm Group Chat ID', error: error.message });
  }
};

/**
 * Webhook tiếp nhận sự kiện từ Zalo OA / Zalo Bot
 */
const handleZaloWebhook = async (req, res) => {
  try {
    const event = req.body;
    console.log('[Zalo Webhook Event]:', JSON.stringify(event));

    const config = await zaloOAService.getConfig();
    await zaloOAService.processBotUpdateItem(event, config);
    await config.save();

    // Phản hồi ngay 200 OK cho Zalo Platform
    res.status(200).json({ error: 0, message: 'Success' });
  } catch (error) {
    console.error('Lỗi xử lý webhook Zalo:', error);
    res.status(200).json({ error: 0 });
  }
};

module.exports = {
  getZaloConfig,
  updateZaloConfig,
  testSendMessage,
  testSendGroupMessage,
  detectBotGroupChats,
  handleZaloWebhook,
};
