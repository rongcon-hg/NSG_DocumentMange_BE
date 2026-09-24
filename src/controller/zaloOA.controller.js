const ZaloConfig = require('../models/zaloConfig.model');
const zaloOAService = require('../services/zaloOA.service');
const User = require('../models/user.model');

/**
 * Lấy cấu hình Zalo OA (Chỉ Admin)
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
      templateIds: config.templateIds,
      updatedAt: config.updatedAt,
    };
    return res.json({ success: true, data: safeConfig });
  } catch (error) {
    console.error('Lỗi getZaloConfig:', error);
    return res.status(500).json({ success: false, message: 'Lỗi khi lấy cấu hình Zalo OA' });
  }
};

/**
 * Cập nhật cấu hình Zalo OA (Chỉ Admin)
 */
const updateZaloConfig = async (req, res) => {
  try {
    const { oaId, appId, secretKey, refreshToken, isActive, templateIds } = req.body;
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
      message: 'Cập nhật cấu hình Zalo OA thành công',
      data: {
        oaId: config.oaId,
        appId: config.appId,
        isActive: config.isActive,
        tokenExpiresAt: config.tokenExpiresAt,
      }
    });
  } catch (error) {
    console.error('Lỗi updateZaloConfig:', error);
    return res.status(500).json({ success: false, message: 'Lỗi khi cập nhật cấu hình Zalo OA' });
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

    if (!user.zaloId) {
      return res.status(400).json({ success: false, message: 'Cán bộ này chưa liên kết Zalo ID (User ID trên Zalo OA)' });
    }

    const result = await zaloOAService.sendMessageToUser(
      user.zaloId,
      testMessage || `[QLVB] Xin chào ${user.name}, đây là tin nhắn kiểm tra kết nối từ hệ thống QLVB Nam Sài Gòn.`
    );

    if (result.success) {
      return res.json({ success: true, message: 'Gửi tin nhắn Zalo thành công', data: result.data });
    } else {
      return res.status(400).json({ success: false, message: 'Gửi tin nhắn Zalo thất bại', error: result });
    }
  } catch (error) {
    console.error('Lỗi testSendMessage Zalo:', error);
    return res.status(500).json({ success: false, message: 'Lỗi xử lý gửi tin Zalo', error: error.message });
  }
};

/**
 * Webhook tiếp nhận sự kiện từ Zalo OA (Follow, gửi tin nhắn, lấy Zalo User ID)
 */
const handleZaloWebhook = async (req, res) => {
  try {
    const event = req.body;
    console.log('[Zalo OA Webhook Event]:', JSON.stringify(event));

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
  handleZaloWebhook,
};
