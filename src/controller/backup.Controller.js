const BackupConfig = require('../models/backupConfig.model');
const BackupHistory = require('../models/backupHistory.model');
const User = require('../models/user.model');
const { performBackup, restoreDatabaseFromDrive, cleanOldBackups } = require('../service/backup.service');
const { sendRestoreOtpEmail } = require('../service/NodeMailer.service/email');
const crypto = require('crypto');

// Lấy cấu hình
const getConfig = async (req, res) => {
    try {
        let config = await BackupConfig.findOne();
        if (!config) {
            config = new BackupConfig();
            await config.save();
        }
        const data = config.toObject();
        if (!data.maxBackups) data.maxBackups = 10;
        res.status(200).json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Cập nhật cấu hình
const updateConfig = async (req, res) => {
    try {
        const { folderId, schedule, maxBackups } = req.body;
        let config = await BackupConfig.findOne();
        if (!config) {
            config = new BackupConfig();
        }
        config.folderId = folderId || config.folderId;
        config.schedule = schedule || config.schedule;
        if (maxBackups !== undefined) {
            config.maxBackups = Math.max(1, Number(maxBackups) || 10);
        }
        
        await config.save();

        // Tự động dọn dẹp các bản backup cũ nếu vượt quá giới hạn mới
        cleanOldBackups(config.maxBackups || 10).catch(err => console.error(err));

        res.status(200).json({ success: true, message: 'Cập nhật cấu hình sao lưu thành công', data: config });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Lấy lịch sử sao lưu
const getHistory = async (req, res) => {
    try {
        const histories = await BackupHistory.find().populate('createdBy', 'name').sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: histories });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Kích hoạt sao lưu thủ công
const triggerBackup = async (req, res) => {
    try {
        const history = await performBackup(req.user.id);
        res.status(200).json({ success: true, message: 'Sao lưu thành công', data: history });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Yêu cầu OTP khôi phục
const requestRestoreOtp = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Chỉ Admin mới có quyền khôi phục.' });
        }

        // Generate 6 digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        user.restoreOtp = otp;
        user.restoreOtpExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
        await user.save();

        await sendRestoreOtpEmail(user.email, otp);

        res.status(200).json({ success: true, message: 'Mã xác nhận đã được gửi đến email của bạn.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Xác nhận OTP và thực hiện Khôi phục
const verifyRestore = async (req, res) => {
    try {
        const { otp, fileId } = req.body;
        if (!otp || !fileId) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin OTP hoặc File ID.' });
        }

        const user = await User.findById(req.user.id);
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Không có quyền.' });
        }

        if (user.restoreOtp !== otp || user.restoreOtpExpire < Date.now()) {
            return res.status(400).json({ success: false, message: 'Mã xác nhận không đúng hoặc đã hết hạn.' });
        }

        // Xóa OTP
        user.restoreOtp = undefined;
        user.restoreOtpExpire = undefined;
        await user.save();

        // Thực hiện Restore
        await restoreDatabaseFromDrive(fileId);

        res.status(200).json({ success: true, message: 'Khôi phục dữ liệu thành công. Vui lòng đăng nhập lại.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getConfig,
    updateConfig,
    getHistory,
    triggerBackup,
    requestRestoreOtp,
    verifyRestore
};
