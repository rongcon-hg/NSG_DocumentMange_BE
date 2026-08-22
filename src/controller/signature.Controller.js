const User = require("../models/user.model");
const { google } = require("googleapis");
const { Readable } = require("stream");
const { authorize, getOrCreateMonthFolder, sanitizeFileName } = require("./uploadfile.Controller");

// Lấy thông tin chữ ký cá nhân
const getMySignature = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId).select("signature");
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        res.status(200).json({ signature: user.signature });
    } catch (error) {
        console.error("Error fetching signature:", error);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
};

// Upload chữ ký cá nhân (Lưu vào Google Drive, cập nhật DB)
const uploadSignature = async (req, res) => {
    try {
        const userId = req.user._id;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ message: "No file uploaded" });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const auth = await authorize();
        const drive = google.drive({ version: "v3", auth });
        
        // Ta dùng chung Month Folder hoặc tạo 1 folder Signature riêng. Dùng chung cho tiện.
        const folderId = await getOrCreateMonthFolder(drive);

        const fileMetadata = {
            name: `signature_${userId}_${sanitizeFileName(file.originalname)}`,
            parents: [folderId],
        };

        const media = {
            mimeType: file.mimetype,
            body: Readable.from(file.buffer),
        };

        const response = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: "id, name, mimeType",
            supportsAllDrives: true
        });

        // Cập nhật URL / fileId vào User
        user.signature = {
            fileId: response.data.id,
            fileName: response.data.name,
            mimeType: response.data.mimeType
        };

        await user.save();

        res.status(200).json({ 
            message: "Signature uploaded successfully", 
            signature: user.signature 
        });

    } catch (error) {
        console.error("Error uploading signature:", error);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
};

const signPdf = async (req, res) => {
    res.status(501).json({ message: "Not implemented yet" });
};

module.exports = {
    getMySignature,
    uploadSignature,
    signPdf
};
