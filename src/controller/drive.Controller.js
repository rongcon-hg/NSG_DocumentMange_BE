const { google } = require("googleapis");
const DriveConfig = require("../models/driveConfig.model");
const dotenv = require("dotenv");

dotenv.config();

let cachedMonthFolder = {
    folderName: null,
    folderId: null,
    fetchedAt: 0,
};

exports.getDriveToken = async (req, res) => {
    try {
        const config = await DriveConfig.findOne().lean();
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

        // Get or Create Month Folder
        const date = new Date();
        const folderName = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        let monthFolderId = rootFolderId;
        const now = Date.now();
        // Caching folder ID trong 1 giờ để tránh query Drive API mỗi lần người dùng bấm nút
        if (rootFolderId) {
            if (cachedMonthFolder.folderName === folderName && cachedMonthFolder.folderId && (now - cachedMonthFolder.fetchedAt < 3600000)) {
                monthFolderId = cachedMonthFolder.folderId;
            } else {
                const drive = google.drive({ version: 'v3', auth });
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

                cachedMonthFolder = {
                    folderName,
                    folderId: monthFolderId,
                    fetchedAt: now,
                };
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

exports.publicStreamFile = async (req, res) => {
    try {
        const { fileId } = req.params;
        if (!fileId) {
            return res.status(400).json({ message: "Thiếu fileId" });
        }

        const config = await DriveConfig.findOne();
        if (!config || !config.clientEmail || !config.privateKey) {
            return res.status(400).json({ message: "Chưa cấu hình Service Account cho Google Drive." });
        }

        const auth = new google.auth.JWT({
            email: config.clientEmail,
            key: config.privateKey.replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/drive'],
        });

        const drive = google.drive({ version: 'v3', auth });

        // Lấy metadata file
        const meta = await drive.files.get({
            fileId,
            fields: "id, name, mimeType, size",
            supportsAllDrives: true,
        });

        const mimeType = meta.data.mimeType || "application/pdf";
        const fileSize = meta.data.size ? parseInt(meta.data.size) : null;
        
        res.removeHeader("X-Frame-Options");
        res.setHeader("Content-Type", mimeType);
        res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(meta.data.name || 'document.pdf')}"`);
        res.setHeader("X-Frame-Options", "ALLOWALL");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Accept-Ranges", "bytes");

        // Hỗ trợ HTTP Range Request cho Audio / Video player
        const range = req.headers.range;
        if (range && fileSize) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;

            res.status(206);
            res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
            res.setHeader("Content-Length", chunksize);

            const stream = await drive.files.get(
                { fileId, alt: "media", supportsAllDrives: true },
                { responseType: "stream", headers: { Range: `bytes=${start}-${end}` } }
            );
            stream.data.pipe(res);
        } else {
            if (fileSize) {
                res.setHeader("Content-Length", fileSize);
            }
            const stream = await drive.files.get(
                { fileId, alt: "media", supportsAllDrives: true },
                { responseType: "stream" }
            );
            stream.data.pipe(res);
        }
    } catch (error) {
        console.error("Lỗi publicStreamFile:", error);
        res.status(500).json({ message: "Lỗi tải file xem trước", error: error.message });
    }
};

/**
 * Liệt kê danh sách tệp con trong một thư mục Google Drive (cho tính năng xem trước thư mục phòng họp)
 */
exports.listFolderContents = async (req, res) => {
    try {
        const { folderId } = req.params;
        if (!folderId) {
            return res.status(400).json({ success: false, message: "Thiếu folderId" });
        }

        const config = await DriveConfig.findOne();
        if (!config || !config.clientEmail || !config.privateKey) {
            return res.status(400).json({ success: false, message: "Chưa cấu hình Service Account cho Google Drive." });
        }

        const auth = new google.auth.JWT({
            email: config.clientEmail,
            key: config.privateKey.replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/drive'],
        });

        const drive = google.drive({ version: 'v3', auth });

        // Lấy thông tin thư mục cha
        let folderName = "Thư mục Google Drive";
        try {
            const folderMeta = await drive.files.get({
                fileId: folderId,
                fields: "id, name, mimeType",
                supportsAllDrives: true,
            });
            if (folderMeta.data && folderMeta.data.name) {
                folderName = folderMeta.data.name;
            }
        } catch (e) {
            console.warn("Không lấy được metadata folder:", e.message);
        }

        // Lấy danh sách các tệp & thư mục con bên trong
        const query = `'${folderId}' in parents and trashed=false`;
        const response = await drive.files.list({
            q: query,
            fields: "files(id, name, mimeType, size, modifiedTime, webViewLink, iconLink, thumbnailLink)",
            orderBy: "folder,name",
            pageSize: 100,
            spaces: "drive",
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
        });

        return res.status(200).json({
            success: true,
            folder: {
                id: folderId,
                name: folderName,
            },
            files: response.data.files || [],
        });
    } catch (error) {
        console.error("Lỗi listFolderContents:", error);
        return res.status(500).json({
            success: false,
            message: "Lỗi khi đọc danh sách tệp trong thư mục Drive",
            error: error.message,
        });
    }
};

