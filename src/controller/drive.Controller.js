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
        const rootFolderId = config.folderId || process.env.DRIVE_FOLDER_ID;

        // Create Google Drive client
        const drive = google.drive({ version: 'v3', auth });

        // Get or Create Month Folder
        const date = new Date();
        const folderName = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        let monthFolderId = rootFolderId;
        if (rootFolderId) {
            const query = `name='${folderName}' and '${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
            const response = await drive.files.list({
                q: query,
                fields: 'files(id, name)',
                spaces: 'drive',
                supportsAllDrives: true,
                includeItemsFromAllDrives: true
            });

            if (response.data.files && response.data.files.length > 0) {
                monthFolderId = response.data.files[0].id;
            } else {
                const folderMetadata = {
                    name: folderName,
                    mimeType: 'application/vnd.google-apps.folder',
                    parents: [rootFolderId],
                };
                const createResponse = await drive.files.create({
                    requestBody: folderMetadata,
                    fields: 'id',
                    supportsAllDrives: true
                });
                monthFolderId = createResponse.data.id;
            }
        }

        res.status(200).json({
            success: true,
            accessToken: token.token,
            folderId: monthFolderId
        });
    } catch (error) {
        console.error("Lỗi khi lấy Drive Token:", error);
        res.status(500).json({ message: "Lỗi hệ thống khi lấy token Google Drive." });
    }
};
