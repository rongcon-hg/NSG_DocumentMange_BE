const SmtpConfig = require('../models/smtpConfig.model');
const nodemailer = require('nodemailer');

// Lấy cấu hình SMTP
const getSmtpConfig = async (req, res) => {
  try {
    let config = await SmtpConfig.findOne();
    if (!config) {
      config = {
        host: 'smtp.gmail.com',
        port: 465,
        senderName: 'Hệ thống Quản lý Văn bản NSG',
        user: process.env.EMAIL_USERNAME || '',
        pass: process.env.EMAIL_PASSWORD || '',
        secure: true,
      };
    }
    return res.status(200).json({ success: true, data: config });
  } catch (error) {
    console.error('Error fetching SMTP config:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ', error: error.message });
  }
};

// Lưu cấu hình SMTP
const saveSmtpConfig = async (req, res) => {
  try {
    const { host, port, senderName, user, pass } = req.body;

    let config = await SmtpConfig.findOne();
    if (!config) {
      config = new SmtpConfig();
    }

    if (host !== undefined) config.host = host.trim();
    if (port !== undefined) config.port = Number(port) || 465;
    if (senderName !== undefined) config.senderName = senderName.trim();
    if (user !== undefined) config.user = user.trim();
    if (pass !== undefined) config.pass = pass.trim();
    config.secure = (config.port === 465);

    await config.save();

    return res.status(200).json({
      success: true,
      message: 'Lưu cấu hình SMTP thành công',
      data: config
    });
  } catch (error) {
    console.error('Error saving SMTP config:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ', error: error.message });
  }
};

// Gửi email thử nghiệm
const testSmtpConfig = async (req, res) => {
  try {
    const { host, port, senderName, user, pass, toEmail } = req.body;

    const targetEmail = toEmail || req.user?.email || user;
    if (!targetEmail) {
      return res.status(400).json({ success: false, message: 'Thiếu email nhận thử nghiệm' });
    }

    const portNum = Number(port) || 465;
    const isSecure = (portNum === 465);

    const transporter = nodemailer.createTransport({
      host: host || 'smtp.gmail.com',
      port: portNum,
      secure: isSecure,
      auth: {
        user: user,
        pass: pass,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
    });

    const info = await transporter.sendMail({
      from: `"${senderName || 'Hệ thống Quản lý Văn bản NSG'}" <${user}>`,
      to: targetEmail,
      subject: 'Kiểm tra cấu hình SMTP Gmail - Quản lý Văn bản NSG',
      text: 'Xin chào! Đây là email kiểm tra tính năng gửi thư SMTP từ hệ thống Quản lý Văn bản NSG. Cấu hình của bạn đang hoạt động rất tốt!',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; color: #333;">
          <h2 style="color: #00805a;">✓ Kiểm tra cấu hình SMTP thành công!</h2>
          <p>Xin chào <strong>${req.user?.name || 'Quản trị viên'}</strong>,</p>
          <p>Đây là email thử nghiệm được gửi từ hệ thống <strong>Quản lý Văn bản NSG</strong>.</p>
          <p>Các thông số SMTP hiện tại đã kết nối thành công với máy chủ gửi thư.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 12px; color: #888;">Thời gian kiểm tra: ${new Date().toLocaleString('vi-VN')}</p>
        </div>
      `,
    });

    return res.status(200).json({
      success: true,
      message: `Gửi email kiểm tra thành công đến ${targetEmail}!`,
      messageId: info.messageId,
    });
  } catch (error) {
    console.error('Error testing SMTP config:', error);
    return res.status(500).json({
      success: false,
      message: `Gửi email kiểm tra thất bại: ${error.message}`,
      error: error.message,
    });
  }
};

module.exports = {
  getSmtpConfig,
  saveSmtpConfig,
  testSmtpConfig,
};
