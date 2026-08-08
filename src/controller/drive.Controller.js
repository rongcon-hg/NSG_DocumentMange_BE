const { google } = require("googleapis");
const DriveConfig = require("../models/driveConfig.model");
const dotenv = require("dotenv");

dotenv.config();

exports.getDriveToken = async (req, res) => {
    try {
        const config = await DriveConfig.findOne();
        if (!config || !config.clientEmail || !config.privateKey) {
            return res.status(400).json({ message: "Chưa cấu hình Service Account cho Google Drive." });
        }

        const auth = new google.auth.JWT({
            email: config.clientEmail,
            key: config.privateKey.replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/drive'],
        });

        const token = await auth.getAccessToken();
        const folderId = config.folderId || process.env.DRIVE_FOLDER_ID;

        res.status(200).json({
            success: true,
            accessToken: token.token,
            folderId: folderId
        });
    } catch (error) {
        console.error("Lỗi khi lấy Drive Token:", error);
        res.status(500).json({ message: "Lỗi hệ thống khi lấy token Google Drive." });
    }
};
