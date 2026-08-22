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

const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const libre = require("libreoffice-convert");
const { promisify } = require("util");
const libreConvert = promisify(libre.convert);
const SignedDocument = require("../models/signedDocument.model");

// Helper: Tải file từ Google Drive về Buffer
const getDriveFileBuffer = async (drive, fileId) => {
    const response = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
    return Buffer.from(response.data);
};

// Helper: Xóa dấu Tiếng Việt (do StandardFonts không hỗ trợ Unicode)
const removeVietnameseTones = (str) => {
    if (!str) return "";
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
    str = str.replace(/đ/g, "d");
    str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
    str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
    str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
    str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
    str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
    str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
    str = str.replace(/Đ/g, "D");
    return str;
};

const signPdf = async (req, res) => {
    try {
        const userId = req.user._id;
        const file = req.file;
        let signatures = req.body.signatures; // Dạng JSON string từ frontend

        if (!file) return res.status(400).json({ message: "No document provided" });
        if (!signatures) return res.status(400).json({ message: "Missing signatures data" });
        
        try {
            signatures = JSON.parse(signatures);
        } catch (e) {
            return res.status(400).json({ message: "Invalid signatures format" });
        }

        if (!Array.isArray(signatures) || signatures.length === 0) {
            return res.status(400).json({ message: "No signature coordinates provided" });
        }

        const user = await User.findById(userId);
        if (!user || !user.signature || !user.signature.fileId) {
            return res.status(400).json({ message: "User has no configured signature" });
        }

        let pdfBuffer = file.buffer;
        
        // Chuyển đổi Word sang PDF nếu cần
        if (file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || 
            file.mimetype === "application/msword") {
            pdfBuffer = await libreConvert(file.buffer, ".pdf", undefined);
        }

        const auth = await authorize();
        const drive = google.drive({ version: "v3", auth });

        // Tải ảnh chữ ký từ Drive
        const signatureImageBuffer = await getDriveFileBuffer(drive, user.signature.fileId);

        // Load PDF
        const pdfDoc = await PDFDocument.load(pdfBuffer);
        const pages = pdfDoc.getPages();

        // Nhúng hình ảnh (chỉ cần nhúng 1 lần)
        let image;
        if (user.signature.mimeType === "image/png") {
            image = await pdfDoc.embedPng(signatureImageBuffer);
        } else if (user.signature.mimeType === "image/jpeg" || user.signature.mimeType === "image/jpg") {
            image = await pdfDoc.embedJpg(signatureImageBuffer);
        } else {
            try { image = await pdfDoc.embedPng(signatureImageBuffer); }
            catch(e) { image = await pdfDoc.embedJpg(signatureImageBuffer); }
        }
        
        const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const now = new Date();
        const timeString = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth()+1).toString().padStart(2, '0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        const stampText = `Ky boi: ${removeVietnameseTones(user.name)}\nThoi gian: ${timeString}`;

        // Lặp qua từng vị trí chữ ký
        for (const sig of signatures) {
            const targetPage = pages[parseInt(sig.pageNum) - 1]; // pageNum 1-indexed
            if (!targetPage) continue; // Bỏ qua nếu trang không hợp lệ

            // Đóng dấu hình ảnh
            targetPage.drawImage(image, {
                x: parseFloat(sig.x),
                y: parseFloat(sig.y),
                width: parseFloat(sig.width),
                height: parseFloat(sig.height),
            });

            // Đóng dấu Text
            targetPage.drawText(stampText, {
                x: parseFloat(sig.x),
                y: parseFloat(sig.y) - 25, 
                size: 10,
                font,
                color: rgb(0, 0, 0.8),
                lineHeight: 12
            });
        }

        const signedPdfBytes = await pdfDoc.save();

        // Lưu file PDF đã ký lên Google Drive
        const folderId = await getOrCreateMonthFolder(drive);
        const originalBaseName = file.originalname.replace(/\.[^/.]+$/, "");
        const signedFileName = `${sanitizeFileName(originalBaseName)}_signed.pdf`;

        const fileMetadata = { name: signedFileName, parents: [folderId] };
        const media = { mimeType: "application/pdf", body: Readable.from(Buffer.from(signedPdfBytes)) };

        const uploadRes = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: "id, name, mimeType",
            supportsAllDrives: true
        });

        // Lưu vào cơ sở dữ liệu
        const signedDoc = new SignedDocument({
            user: userId,
            originalFileName: file.originalname,
            signedFileName: uploadRes.data.name,
            fileId: uploadRes.data.id,
            mimeType: uploadRes.data.mimeType
        });
        await signedDoc.save();

        res.status(200).json({ message: "Document signed successfully", signedDocument: signedDoc });
    } catch (error) {
        console.error("Error signing PDF:", error);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
};

const getMyArchive = async (req, res) => {
    try {
        const userId = req.user._id;
        const docs = await SignedDocument.find({ user: userId }).sort({ signDate: -1 });
        res.status(200).json({ data: docs });
    } catch (error) {
        console.error("Error fetching archive:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

const convertPreview = async (req, res) => {
    try {
        const file = req.file;
        if (!file) return res.status(400).json({ message: "No file provided" });

        let pdfBuffer = file.buffer;
        if (file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || 
            file.mimetype === "application/msword") {
            pdfBuffer = await libreConvert(file.buffer, ".pdf", undefined);
        }

        res.set({
            "Content-Type": "application/pdf",
            "Content-Disposition": "inline; filename=preview.pdf",
        });
        res.send(pdfBuffer);
    } catch (error) {
        console.error("Error converting for preview:", error);
        res.status(500).json({ message: "Server Error during conversion" });
    }
};

const getSignatureImage = async (req, res) => {
    try {
        const fileId = req.params.fileId;
        const auth = await authorize();
        const drive = google.drive({ version: "v3", auth });
        const buffer = await getDriveFileBuffer(drive, fileId);
        
        // Cố gắng lấy mimeType, hoặc mặc định image/png
        res.set({
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=86400"
        });
        res.send(buffer);
    } catch (error) {
        console.error("Error fetching signature image:", error);
        res.status(500).json({ message: "Error fetching image" });
    }
};

module.exports = {
    getMySignature,
    uploadSignature,
    signPdf,
    getMyArchive,
    convertPreview,
    getSignatureImage
};
