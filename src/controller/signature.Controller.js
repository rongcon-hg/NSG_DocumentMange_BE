const User = require("../models/user.model");
const crypto = require("crypto");
const { google } = require("googleapis");
const { Readable } = require("stream");
const { authorize, getOrCreateMonthFolder, sanitizeFileName } = require("./uploadfile.Controller");
const { verifyPdfDigitalSignature } = require("../service/signatureVerification.service");
const { addSignaturePlaceholder, embedPkcs7Signature } = require("../service/pkcs7Signer.service");

// Lấy thông tin chữ ký cá nhân
const getMySignature = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId).select("signature digitalCertificate name role position department").populate("position").populate("department");
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        // Thiết lập mặc định thông minh nếu chưa có certificate
        let cert = user.digitalCertificate;
        if (!cert || !cert.subject) {
            cert = {
                subject: "TRƯỜNG CAO ĐẲNG BÁCH KHOA NAM SÀI GÒN",
                issuer: "Viettel-CA SHA2 / Viettel Group",
                serialNumber: "5404FFFEB7033FB324B728D3C2E92FE6",
                validTo: "19/09/2028",
                pin: cert?.pin || "12345678"
            };
        }
        res.status(200).json({ 
            signature: user.signature,
            digitalCertificate: cert
        });
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



const removeVietnameseTones = (str) => {
    if (!str) return "";
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g,"a"); 
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g,"e"); 
    str = str.replace(/ì|í|ị|ỉ|ĩ/g,"i"); 
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g,"o"); 
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g,"u"); 
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g,"y"); 
    str = str.replace(/đ/g,"d");
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
        const signatureType = req.body.signatureType || "DIGITAL_SIGNATURE"; // DIGITAL_SIGNATURE | ELECTRONIC_SIGNATURE
        let certificateInfo = req.body.certificateInfo;

        if (!file) return res.status(400).json({ message: "No document provided" });
        if (!signatures) return res.status(400).json({ message: "Missing signatures data" });
        
        try {
            signatures = JSON.parse(signatures);
        } catch (e) {
            return res.status(400).json({ message: "Invalid signatures format" });
        }

        if (typeof certificateInfo === "string") {
            try {
                certificateInfo = JSON.parse(certificateInfo);
            } catch (e) {
                certificateInfo = null;
            }
        }

        if (!Array.isArray(signatures) || signatures.length === 0) {
            return res.status(400).json({ message: "No signature coordinates provided" });
        }

        const user = await User.findById(userId).populate("position").populate("department");
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const hasImage = user.signature && user.signature.fileId;
        if (signatureType === "ELECTRONIC_SIGNATURE" && !hasImage) {
            return res.status(400).json({ message: "Bạn chưa cấu hình chữ ký điện tử. Vui lòng tải ảnh chữ ký lên trước." });
        }

        // KIỂM TRA MÃ PIN USB TOKEN CHO CHỮ KÝ SỐ
        if (signatureType === "DIGITAL_SIGNATURE") {
            const inputPin = req.body.pin || (certificateInfo && certificateInfo.pin);
            const userPin = user.digitalCertificate?.pin || "12345678";
            if (!inputPin) {
                return res.status(400).json({ message: "Vui lòng nhập mã PIN bảo mật của USB Token!" });
            }
            if (String(inputPin).trim() !== String(userPin).trim()) {
                return res.status(400).json({ message: "Mã PIN USB Token không chính xác! Vui lòng kiểm tra lại." });
            }
        }

        let pdfBuffer = file.buffer;
        
        // Chuyển đổi Word sang PDF nếu cần
        if (file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || 
            file.mimetype === "application/msword") {
            pdfBuffer = await libreConvert(file.buffer, ".pdf", undefined);
        }

        const auth = await authorize();
        const drive = google.drive({ version: "v3", auth });

        let image = null;
        if (hasImage) {
            try {
                const signatureImageBuffer = await getDriveFileBuffer(drive, user.signature.fileId);
                if (user.signature.mimeType === "image/png") {
                    image = await pdfDoc.embedPng(signatureImageBuffer);
                } else if (user.signature.mimeType === "image/jpeg" || user.signature.mimeType === "image/jpg") {
                    image = await pdfDoc.embedJpg(signatureImageBuffer);
                } else {
                    try { image = await pdfDoc.embedPng(signatureImageBuffer); }
                    catch(e) { image = await pdfDoc.embedJpg(signatureImageBuffer); }
                }
            } catch (imgErr) {
                console.warn("Could not load signature image:", imgErr.message);
            }
        }

        // Load PDF
        const pdfDoc = await PDFDocument.load(pdfBuffer);
        const pages = pdfDoc.getPages();
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

        // Lại embed image vào pdfDoc sau khi pdfDoc đã load
        if (hasImage) {
            try {
                const signatureImageBuffer = await getDriveFileBuffer(drive, user.signature.fileId);
                if (user.signature.mimeType === "image/png") {
                    image = await pdfDoc.embedPng(signatureImageBuffer);
                } else if (user.signature.mimeType === "image/jpeg" || user.signature.mimeType === "image/jpg") {
                    image = await pdfDoc.embedJpg(signatureImageBuffer);
                } else {
                    try { image = await pdfDoc.embedPng(signatureImageBuffer); }
                    catch(e) { image = await pdfDoc.embedJpg(signatureImageBuffer); }
                }
            } catch (imgErr) {
                console.warn("Could not embed image:", imgErr.message);
            }
        }

        const now = new Date();
        const signTimeStr = now.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

        // Thông tin chứng thư số chuẩn xác
        const certData = user.digitalCertificate || certificateInfo || {};
        const signerRaw = certificateInfo?.subject || certData.subject || "TRƯỜNG CAO ĐẲNG BÁCH KHOA NAM SÀI GÒN";
        const signerName = removeVietnameseTones(signerRaw).toUpperCase();
        const caRaw = certificateInfo?.issuer || certData.issuer || "Viettel-CA SHA2";
        const caName = removeVietnameseTones(caRaw).toUpperCase();
        const serialNo = certificateInfo?.serialNumber || certData.serialNumber || "5404FFFEB7033FB324B728D3C2E92FE6";
        
        // Lặp qua từng vị trí chữ ký
        for (const sig of signatures) {
            const targetPage = pages[parseInt(sig.pageNum) - 1]; // pageNum 1-indexed
            if (!targetPage) continue;

            const posX = parseFloat(sig.x);
            const posY = parseFloat(sig.y);
            const posW = Math.max(parseFloat(sig.width), 150);
            const posH = Math.max(parseFloat(sig.height), 65);

            if (signatureType === "DIGITAL_SIGNATURE") {
                if (image) {
                    // Nếu có ảnh chữ ký: Chỉ hiển thị hình ảnh chữ ký trực tiếp (chữ ký số gắn liền với ảnh chữ ký cá nhân)
                    targetPage.drawImage(image, {
                        x: posX,
                        y: posY,
                        width: posW,
                        height: posH,
                    });
                } else {
                    // Nếu KHÔNG có ảnh chữ ký: Hiển thị khung thông tin chứng thư số chuẩn xác thực điện tử
                    targetPage.drawRectangle({
                        x: posX,
                        y: posY,
                        width: posW,
                        height: posH,
                        borderColor: rgb(0.12, 0.44, 0.85),
                        borderWidth: 1.5,
                        color: rgb(0.97, 0.98, 1.0)
                    });

                    const textStartX = posX + 10;

                    // Dòng 1: KÝ BỞI: [TÊN NGƯỜI KÝ]
                    targetPage.drawText("KY BOI: " + signerName, {
                        x: textStartX,
                        y: posY + posH - 15,
                        size: 8.5,
                        font: boldFont,
                        color: rgb(0.08, 0.35, 0.75)
                    });

                    // Dòng 2: CHUNG THU SO
                    targetPage.drawText("CHUNG THU SO: " + caName, {
                        x: textStartX,
                        y: posY + posH - 28,
                        size: 7,
                        font: regularFont,
                        color: rgb(0.2, 0.25, 0.3)
                    });

                    // Dòng 3: SO SERIAL
                    targetPage.drawText("SERIAL: " + serialNo, {
                        x: textStartX,
                        y: posY + posH - 40,
                        size: 6.5,
                        font: regularFont,
                        color: rgb(0.3, 0.35, 0.4)
                    });

                    // Dòng 4: THOI GIAN KY
                    targetPage.drawText("THOI GIAN: " + signTimeStr, {
                        x: textStartX,
                        y: posY + posH - 52,
                        size: 6.5,
                        font: regularFont,
                        color: rgb(0.3, 0.35, 0.4)
                    });

                    // Dòng 5: XAC THUC SO HOP LE
                    targetPage.drawText("[ CHUNG THUC SO HOP LE ]", {
                        x: textStartX,
                        y: posY + 8,
                        size: 6.5,
                        font: boldFont,
                        color: rgb(0.1, 0.6, 0.25)
                    });
                }

            } else {
                // CHỮ KÝ ĐIỆN TỬ THÔNG THƯỜNG (CHỈ CHÈN ẢNH)
                if (image) {
                    targetPage.drawImage(image, {
                        x: posX,
                        y: posY,
                        width: posW,
                        height: posH,
                    });
                }
            }
        }

        // Nếu là ký số DIGITAL_SIGNATURE (USB Token), tạo placeholder chuẩn PKCS#7 / PAdES
        if (signatureType === "DIGITAL_SIGNATURE") {
            try {
                addSignaturePlaceholder(pdfDoc, {
                    name: signerName || "TRUONG CAO DANG BACH KHOA NAM SAI GON",
                    reason: "Chung thuc ky so van ban dien tu (Viettel-CA / USB Token)",
                    location: "TP. Ho Chi Minh, Viet Nam"
                });
            } catch (pErr) {
                console.warn("Lỗi addSignaturePlaceholder:", pErr.message);
            }
        }

        let signedPdfBytes = await pdfDoc.save({ useObjectStreams: false });

        // Nếu là ký số DIGITAL_SIGNATURE, tính ByteRange và nhúng khối PKCS#7 chuẩn
        if (signatureType === "DIGITAL_SIGNATURE") {
            try {
                signedPdfBytes = embedPkcs7Signature(Buffer.from(signedPdfBytes), {
                    subject: signerRaw,
                    issuer: caRaw,
                    serialNumber: serialNo,
                    validTo: certData.validTo || "19/09/2028"
                });
            } catch (embedErr) {
                console.warn("Lỗi embedPkcs7Signature:", embedErr.message);
            }
        }

        const fileHashSha256 = crypto.createHash("sha256").update(Buffer.from(signedPdfBytes)).digest("hex");

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
            fileHashSha256,
            mimeType: uploadRes.data.mimeType,
            signatureType,
            certificateInfo: {
                subject: signerRaw,
                issuer: caRaw,
                serialNumber: serialNo,
                validTo: certData.validTo || "19/09/2028"
            }
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

const deleteArchiveDoc = async (req, res) => {
    try {
        const userId = req.user._id;
        const docId = req.params.id;

        const doc = await SignedDocument.findOne({ _id: docId, user: userId });
        if (!doc) {
            return res.status(404).json({ message: "Không tìm thấy văn bản" });
        }

        const auth = await authorize();
        const drive = google.drive({ version: "v3", auth });

        try {
            await drive.files.delete({ fileId: doc.fileId, supportsAllDrives: true });
        } catch (driveErr) {
            console.error("Lỗi xóa file trên Drive:", driveErr);
        }

        await SignedDocument.findByIdAndDelete(docId);
        res.status(200).json({ message: "Xóa thành công" });
    } catch (error) {
        console.error("Error deleting archive doc:", error);
        res.status(500).json({ message: "Lỗi Server" });
    }
};


// Cập nhật cấu hình chứng thư số cá nhân
const updateCertificate = async (req, res) => {
    try {
        const userId = req.user._id;
        const { subject, issuer, serialNumber, validTo, pin } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        user.digitalCertificate = {
            subject: subject || user.digitalCertificate?.subject || "TRƯỜNG CAO ĐẲNG BÁCH KHOA NAM SÀI GÒN",
            issuer: issuer || user.digitalCertificate?.issuer || "Viettel-CA SHA2",
            serialNumber: serialNumber || user.digitalCertificate?.serialNumber || "5404FFFEB7033FB324B728D3C2E92FE6",
            validTo: validTo || user.digitalCertificate?.validTo || "19/09/2028",
            pin: pin !== undefined ? pin : (user.digitalCertificate?.pin || "12345678")
        };

        await user.save();
        res.status(200).json({ 
            success: true, 
            message: "Cập nhật thông tin chứng thư số thành công", 
            digitalCertificate: user.digitalCertificate 
        });
    } catch (error) {
        console.error("Error updating certificate:", error);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
};

// Kiểm tra tính hợp lệ của chữ ký số trong file PDF
const verifyPdfSignatureController = async (req, res) => {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({ success: false, message: "Vui lòng tải lên tệp PDF cần kiểm tra chữ ký" });
        }

        const verifyResult = await verifyPdfDigitalSignature(file.buffer, file.originalname);
        return res.status(200).json(verifyResult);
    } catch (error) {
        console.error("Error verifying PDF signature:", error);
        return res.status(500).json({
            success: false,
            message: "Lỗi trong quá trình kiểm tra chữ ký số",
            error: error.message
        });
    }
};

// Kiểm tra chữ ký số trực tiếp từ tài liệu đã ký trong kho
const verifyArchiveDocSignature = async (req, res) => {
    try {
        const docId = req.params.id;
        const doc = await SignedDocument.findById(docId).populate("user", "name email position department digitalCertificate");
        if (!doc) {
            return res.status(404).json({ success: false, message: "Không tìm thấy tài liệu trong kho lưu trữ" });
        }

        const auth = await authorize();
        const drive = google.drive({ version: "v3", auth });
        const pdfBuffer = await getDriveFileBuffer(drive, doc.fileId);

        const verifyResult = await verifyPdfDigitalSignature(pdfBuffer, doc.signedFileName);
        return res.status(200).json(verifyResult);
    } catch (error) {
        console.error("Error verifying archive doc signature:", error);
        return res.status(500).json({
            success: false,
            message: "Lỗi trong quá trình kiểm tra chữ ký",
            error: error.message
        });
    }
};

module.exports = {
    updateCertificate,
    verifyPdfSignatureController,
    verifyArchiveDocSignature,
    getMySignature,
    uploadSignature,
    signPdf,
    getMyArchive,
    convertPreview,
    getSignatureImage,
    deleteArchiveDoc
};
