const DriveConfig = require('../models/driveConfig.model');
const { google } = require('googleapis');

// Lấy cấu hình Drive hiện tại
exports.getConfig = async (req, res) => {
  try {
    const config = await DriveConfig.findOne();
    if (!config) {
      return res.status(200).json({ success: true, data: null });
    }
    
    // Ẩn bớt một phần privateKey để bảo mật khi trả về FE
    const maskedPrivateKey = config.privateKey ? config.privateKey.substring(0, 40) + '...' : '';

    return res.status(200).json({
      success: true,
      data: {
        _id: config._id,
        clientEmail: config.clientEmail,
        privateKey: maskedPrivateKey,
        folderId: config.folderId
      }
    });
  } catch (error) {
    console.error('Lỗi khi lấy cấu hình Drive:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server khi lấy cấu hình' });
  }
};

// Cập nhật cấu hình Drive
exports.updateConfig = async (req, res) => {
  try {
    const { clientEmail, privateKey, folderId } = req.body;

    if (!clientEmail || !privateKey || !folderId) {
      return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ các trường bắt buộc.' });
    }

    let config = await DriveConfig.findOne();
    
    // Xử lý privateKey nếu FE truyền lên đoạn maskedPrivateKey thì giữ nguyên key cũ
    let finalPrivateKey = privateKey;
    if (config && privateKey.includes('...')) {
        finalPrivateKey = config.privateKey;
    }

    // Xử lý format privateKey nếu bị lỗi dấu \n
    finalPrivateKey = finalPrivateKey.replace(/\\n/g, '\n');

    if (config) {
      config.clientEmail = clientEmail;
      config.privateKey = finalPrivateKey;
      config.folderId = folderId;
      await config.save();
    } else {
      config = await DriveConfig.create({
        clientEmail,
        privateKey: finalPrivateKey,
        folderId
      });
    }

    return res.status(200).json({ success: true, message: 'Lưu cấu hình thành công!' });
  } catch (error) {
    console.error('Lỗi khi lưu cấu hình Drive:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server khi lưu cấu hình' });
  }
};

// Kiểm tra kết nối
exports.testConnection = async (req, res) => {
  try {
    let { clientEmail, privateKey, folderId } = req.body;

    if (!clientEmail || !privateKey || !folderId) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp đủ clientEmail, privateKey và folderId' });
    }

    // Nếu privateKey có chứa dấu "..." (tức là chưa thay đổi từ UI), lấy từ DB
    if (privateKey.includes('...')) {
      const config = await DriveConfig.findOne();
      if (config) {
        privateKey = config.privateKey;
      } else {
        return res.status(400).json({ success: false, message: 'Private Key không hợp lệ.' });
      }
    }

    // Replace literal \n with newline characters
    privateKey = privateKey.replace(/\\n/g, '\n');

    // Khởi tạo JWT Client
    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    const drive = google.drive({ version: 'v3', auth });

    // Gọi thử lấy metadata của folderId
    let folderName = '';
    try {
      const response = await drive.files.get({
        fileId: folderId,
        fields: 'id, name',
        supportsAllDrives: true
      });
      folderName = response.data.name;
    } catch (err) {
      if (err.code === 404) {
        // Có thể folderId là ID của một Shared Drive (Team Drive)
        const driveRes = await drive.drives.get({
          driveId: folderId,
          fields: 'id, name'
        });
        folderName = driveRes.data.name;
      } else {
        throw err;
      }
    }

    return res.status(200).json({
      success: true,
      message: `Kết nối thành công! Nơi lưu trữ: ${folderName}`,
    });

  } catch (error) {
    console.error('Lỗi khi kiểm tra kết nối Drive:', error);
    return res.status(400).json({
      success: false,
      message: 'Kết nối thất bại. Vui lòng kiểm tra lại thông tin.',
      error: error.message
    });
  }
};
