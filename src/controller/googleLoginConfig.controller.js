const GoogleLoginConfig = require('../models/googleLoginConfig.model');

// Lấy cấu hình Google Login (Admin)
const getGoogleLoginConfig = async (req, res) => {
  try {
    let config = await GoogleLoginConfig.findOne();
    if (!config) {
      config = {
        isEnabled: true,
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      };
    }

    // Xác định Redirect URI chuẩn
    const host = req.get('host');
    const protocol = req.protocol;
    const defaultRedirectUri = process.env.GOOGLE_REDIRECT_URI || `${protocol}://${host}/google/callback`;

    return res.status(200).json({
      success: true,
      data: {
        isEnabled: config.isEnabled !== false,
        clientId: config.clientId || '',
        clientSecret: config.clientSecret || '',
        redirectUri: defaultRedirectUri,
      },
    });
  } catch (error) {
    console.error('Error fetching Google Login config:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ', error: error.message });
  }
};

// Lưu cấu hình Google Login (Admin)
const saveGoogleLoginConfig = async (req, res) => {
  try {
    const { isEnabled, clientId, clientSecret } = req.body;

    let config = await GoogleLoginConfig.findOne();
    if (!config) {
      config = new GoogleLoginConfig();
    }

    if (isEnabled !== undefined) config.isEnabled = isEnabled;
    if (clientId !== undefined) config.clientId = clientId.trim();
    if (clientSecret !== undefined) config.clientSecret = clientSecret.trim();

    await config.save();

    return res.status(200).json({
      success: true,
      message: 'Lưu cấu hình Đăng nhập bằng Google thành công',
      data: config,
    });
  } catch (error) {
    console.error('Error saving Google Login config:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ', error: error.message });
  }
};

// Lấy trạng thái kích hoạt (Public API cho trang Login)
const getPublicStatus = async (req, res) => {
  try {
    const config = await GoogleLoginConfig.findOne();
    const isEnabled = config ? config.isEnabled !== false : true;
    return res.status(200).json({ success: true, isEnabled });
  } catch (error) {
    return res.status(200).json({ success: true, isEnabled: true });
  }
};

module.exports = {
  getGoogleLoginConfig,
  saveGoogleLoginConfig,
  getPublicStatus,
};
