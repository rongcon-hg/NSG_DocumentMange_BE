const ApprovalDocument = require("../models/approvalDocument.model");
const User = require("../models/user.model");
const { google } = require("googleapis");
const { Readable } = require("stream");
const { authorize, getOrCreateMonthFolder, sanitizeFileName } = require("./uploadfile.Controller");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const libre = require("libreoffice-convert");
const { promisify } = require("util");
const libreConvert = promisify(libre.convert);
const QRCode = require("qrcode");

// Helper: Tải file từ Google Drive về Buffer
const getDriveFileBuffer = async (drive, fileId) => {
    const response = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
    return Buffer.from(response.data);
};

// 1. Tạo hồ sơ trình ký mới
const createApprovalDocument = async (req, res) => {
    try {
        const userId = req.user._id;
        const file = req.file;
        const { title, description, docVariant, urgency, signSteps } = req.body;

        if (!file) {
            return res.status(400).json({ success: false, message: "Vui lòng đính kèm file văn bản cần trình ký" });
        }
        if (!title) {
            return res.status(400).json({ success: false, message: "Vui lòng nhập trích yếu/tiêu đề hồ sơ" });
        }

        let parsedSteps = [];
        if (signSteps) {
            try {
                parsedSteps = typeof signSteps === "string" ? JSON.parse(signSteps) : signSteps;
            } catch (err) {
                return res.status(400).json({ success: false, message: "Định dạng các bước duyệt không hợp lệ" });
            }
        }

        if (!Array.isArray(parsedSteps) || parsedSteps.length === 0) {
            return res.status(400).json({ success: false, message: "Vui lòng chỉ định ít nhất một người duyệt/ký" });
        }

        // Định dạng lại các bước duyệt
        const formattedSteps = parsedSteps.map((step, idx) => ({
            stepIndex: idx + 1,
            stepName: step.stepName || `Bước ${idx + 1}`,
            assignee: step.assignee,
            actionType: step.actionType || "SIGN",
            action: "PENDING"
        }));

        const auth = await authorize();
        const drive = google.drive({ version: "v3", auth });
        const folderId = await getOrCreateMonthFolder(drive);

        // Upload file gốc lên Drive
        const fileMetadata = {
            name: `${Date.now()}_${sanitizeFileName(file.originalname)}`,
            parents: [folderId],
        };
        const media = {
            mimeType: file.mimetype,
            body: Readable.from(file.buffer),
        };
        const driveUploadRes = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: "id, name, mimeType",
            supportsAllDrives: true
        });

        // Nếu file là Word (.docx, .doc), chuyển sang PDF để làm currentFile cho việc ký
        let currentFile = {
            fileName: driveUploadRes.data.name,
            fileId: driveUploadRes.data.id,
            mimeType: driveUploadRes.data.mimeType
        };

        if (file.mimetype.includes("word") || file.originalname.endsWith(".docx") || file.originalname.endsWith(".doc")) {
            try {
                const pdfBuffer = await libreConvert(file.buffer, ".pdf", undefined);
                const pdfName = `${sanitizeFileName(file.originalname.replace(/\.[^/.]+$/, ""))}_preview.pdf`;
                const pdfUploadRes = await drive.files.create({
                    requestBody: { name: pdfName, parents: [folderId] },
                    media: { mimeType: "application/pdf", body: Readable.from(pdfBuffer) },
                    fields: "id, name, mimeType",
                    supportsAllDrives: true
                });
                currentFile = {
                    fileName: pdfUploadRes.data.name,
                    fileId: pdfUploadRes.data.id,
                    mimeType: "application/pdf"
                };
            } catch (convErr) {
                console.warn("Could not auto-convert Word to PDF upon creation:", convErr.message);
            }
        }

        const user = await User.findById(userId).select("department");

        const newDoc = new ApprovalDocument({
            title,
            description: description || "",
            creator: userId,
            department: user?.department,
            docVariant: docVariant || null,
            urgency: urgency || "NORMAL",
            originalFile: {
                fileName: file.originalname,
                fileId: driveUploadRes.data.id,
                mimeType: driveUploadRes.data.mimeType,
                fileSize: file.size
            },
            currentFile: currentFile,
            status: "IN_PROGRESS",
            currentStepIndex: 1,
            signSteps: formattedSteps
        });

        await newDoc.save();

        const populated = await ApprovalDocument.findById(newDoc._id)
            .populate("creator", "name email avatar")
            .populate("department", "departmentName departmentCode")
            .populate("signSteps.assignee", "name email avatar position");

        res.status(201).json({
            success: true,
            message: "Tạo hồ sơ trình ký thành công",
            data: populated
        });

    } catch (error) {
        console.error("Error creating approval document:", error);
        res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
    }
};

// 2. Lấy danh sách hồ sơ trình ký
// query: type = 'pending_my_action' (Cần tôi duyệt/ký) | 'my_submitted' (Tôi đã gửi) | 'all' (Tất cả nếu là admin/manager)
const getApprovalDocuments = async (req, res) => {
    try {
        const userId = req.user._id;
        const userRole = req.user.role;
        const { type = "pending_my_action", status, search, page = 1, limit = 20 } = req.query;

        let query = {};

        if (type === "pending_my_action") {
            // Đang ở trạng thái IN_PROGRESS và người dùng hiện tại là assignee của currentStepIndex
            query = {
                status: "IN_PROGRESS",
                signSteps: {
                    $elemMatch: {
                        assignee: userId,
                        action: "PENDING"
                    }
                }
            };
        } else if (type === "my_submitted") {
            // Do chính người dùng tạo
            query = { creator: userId };
        } else if (type === "all") {
            // Cho phép xem nếu là admin hoặc manager hoặc xem các văn bản mà mình tham gia
            if (!["admin", "manager"].includes(userRole)) {
                query = {
                    $or: [
                        { creator: userId },
                        { "signSteps.assignee": userId }
                    ]
                };
            }
        }

        if (status) {
            query.status = status;
        }

        if (search) {
            query.$or = [
                { title: { $regex: search, $options: "i" } },
                { documentCode: { $regex: search, $options: "i" } }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [docs, total] = await Promise.all([
            ApprovalDocument.find(query)
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .populate("creator", "name email avatar")
                .populate("department", "departmentName departmentCode")
                .populate("signSteps.assignee", "name email avatar position")
                .lean(),
            ApprovalDocument.countDocuments(query)
        ]);

        res.status(200).json({
            success: true,
            data: docs,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error("Error fetching approval documents:", error);
        res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
    }
};

// 3. Lấy chi tiết một hồ sơ trình ký
const getApprovalDocumentById = async (req, res) => {
    try {
        const { id } = req.params;
        const doc = await ApprovalDocument.findById(id)
            .populate("creator", "name email avatar mobile position department")
            .populate("department", "departmentName departmentCode")
            .populate("signSteps.assignee", "name email avatar position department signature")
            .populate("docVariant", "variantName");

        if (!doc) {
            return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ trình ký" });
        }

        res.status(200).json({ success: true, data: doc });
    } catch (error) {
        console.error("Error fetching approval document detail:", error);
        res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
    }
};

// 4. Ký số hoặc Thẩm định hồ sơ (Approve / Sign)
const signAndApproveStep = async (req, res) => {
    try {
        const userId = req.user._id;
        const { id } = req.params;
        const { comment = "", signaturePositions = [], signatureMethod = "INTERNAL_IMAGE", certificateInfo } = req.body;

        const doc = await ApprovalDocument.findById(id);
        if (!doc) {
            return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ trình ký" });
        }

        if (doc.status !== "IN_PROGRESS") {
            return res.status(400).json({ success: false, message: "Hồ sơ không ở trạng thái chờ ký duyệt" });
        }

        // Tìm bước hiện tại của user
        const currentStep = doc.signSteps.find(s => s.stepIndex === doc.currentStepIndex);
        if (!currentStep || String(currentStep.assignee) !== String(userId)) {
            return res.status(403).json({ success: false, message: "Bạn không có quyền duyệt ở bước này" });
        }

        const user = await User.findById(userId);
        const auth = await authorize();
        const drive = google.drive({ version: "v3", auth });

        // Nếu bước này yêu cầu ký (actionType === 'SIGN') và có vị trí chữ ký
        if (currentStep.actionType === "SIGN" && Array.isArray(signaturePositions) && signaturePositions.length > 0) {
            // Lấy buffer file hiện tại
            const targetFileId = doc.currentFile?.fileId || doc.originalFile?.fileId;
            const currentPdfBuffer = await getDriveFileBuffer(drive, targetFileId);

            // Xử lý đóng dấu chữ ký vào PDF bằng pdf-lib
            const pdfDoc = await PDFDocument.load(currentPdfBuffer);
            const pages = pdfDoc.getPages();
            const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
            const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

            let image = null;

            // 1. Ký bằng ảnh cá nhân hoặc Token kèm ảnh
            if (user.signature && user.signature.fileId) {
                const signatureImageBuffer = await getDriveFileBuffer(drive, user.signature.fileId);
                if (user.signature.mimeType === "image/png") {
                    image = await pdfDoc.embedPng(signatureImageBuffer);
                } else {
                    try {
                        image = await pdfDoc.embedPng(signatureImageBuffer);
                    } catch (e) {
                        image = await pdfDoc.embedJpg(signatureImageBuffer);
                    }
                }
            }

            for (const sig of signaturePositions) {
                const targetPage = pages[parseInt(sig.pageNum) - 1];
                if (!targetPage) continue;

                const posX = parseFloat(sig.x);
                const posY = parseFloat(sig.y);
                const posW = parseFloat(sig.width);
                const posH = parseFloat(sig.height);

                if (signatureMethod === "USB_TOKEN") {
                    // Nếu là ký USB Token: Đóng dấu khung chứng thư số chuẩn điện tử
                    const signerName = certificateInfo?.subject || user.name;
                    const caName = certificateInfo?.issuer || "VNPT-CA";
                    const signTimeStr = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

                    // Vẽ khung viền xanh / đỏ chứng thực
                    targetPage.drawRectangle({
                        x: posX,
                        y: posY,
                        width: posW,
                        height: posH,
                        borderColor: rgb(0.1, 0.45, 0.85),
                        borderWidth: 1.5,
                        color: rgb(0.96, 0.98, 1.0)
                    });

                    // Nếu có ảnh chữ ký, vẽ một góc
                    if (image) {
                        targetPage.drawImage(image, {
                            x: posX + 6,
                            y: posY + (posH - 45) / 2,
                            width: 50,
                            height: 45
                        });
                    }

                    // Chèn văn bản chứng thực số
                    const textOffsetX = image ? posX + 62 : posX + 8;
                    targetPage.drawText("KY BOI: " + signerName.toUpperCase(), {
                        x: textOffsetX,
                        y: posY + posH - 16,
                        size: 9,
                        font: font,
                        color: rgb(0.1, 0.35, 0.8)
                    });
                    targetPage.drawText("CHUNG THU SO: " + caName, {
                        x: textOffsetX,
                        y: posY + posH - 28,
                        size: 7.5,
                        font: regularFont,
                        color: rgb(0.2, 0.2, 0.2)
                    });
                    targetPage.drawText("THOI GIAN: " + signTimeStr, {
                        x: textOffsetX,
                        y: posY + posH - 40,
                        size: 7.5,
                        font: regularFont,
                        color: rgb(0.2, 0.2, 0.2)
                    });
                } else {
                    // Ký điện tử nội bộ thông thường
                    if (!image) {
                        return res.status(400).json({ success: false, message: "Bạn chưa cấu hình chữ ký cá nhân" });
                    }
                    targetPage.drawImage(image, {
                        x: posX,
                        y: posY,
                        width: posW,
                        height: posH
                    });
                }
            }

            const signedBytes = await pdfDoc.save();
            const folderId = await getOrCreateMonthFolder(drive);

            // Upload PDF mới lên Drive
            const newSignedFileName = `signed_${signatureMethod.toLowerCase()}_step${doc.currentStepIndex}_${sanitizeFileName(doc.title)}.pdf`;
            const uploadRes = await drive.files.create({
                requestBody: { name: newSignedFileName, parents: [folderId] },
                media: { mimeType: "application/pdf", body: Readable.from(Buffer.from(signedBytes)) },
                fields: "id, name, mimeType",
                supportsAllDrives: true
            });

            // Cập nhật currentFile
            doc.currentFile = {
                fileName: uploadRes.data.name,
                fileId: uploadRes.data.id,
                mimeType: "application/pdf"
            };

            currentStep.signaturePositions = signaturePositions;
            currentStep.signatureMethod = signatureMethod;
            if (certificateInfo) {
                currentStep.certificateInfo = certificateInfo;
            }
        }

        // Cập nhật trạng thái bước hiện tại
        currentStep.action = "APPROVED";
        currentStep.comment = comment;
        currentStep.actionAt = new Date();

        // Kiểm tra xem đã hoàn tất tất cả các bước chưa
        if (doc.currentStepIndex >= doc.signSteps.length) {
            doc.status = "APPROVED";
        } else {
            doc.currentStepIndex += 1;
        }

        await doc.save();

        const updated = await ApprovalDocument.findById(doc._id)
            .populate("creator", "name email avatar")
            .populate("signSteps.assignee", "name email avatar position");

        res.status(200).json({
            success: true,
            message: doc.status === "APPROVED" ? "Hồ sơ đã được phê duyệt và ký hoàn tất!" : "Đã duyệt và chuyển tiếp bước tiếp theo",
            data: updated
        });

    } catch (error) {
        console.error("Error approving step:", error);
        res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
    }
};

// 5. Từ chối hồ sơ (Reject)
const rejectApprovalDocument = async (req, res) => {
    try {
        const userId = req.user._id;
        const { id } = req.params;
        const { reason } = req.body;

        if (!reason) {
            return res.status(400).json({ success: false, message: "Vui lòng nhập lý do từ chối" });
        }

        const doc = await ApprovalDocument.findById(id);
        if (!doc) {
            return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ trình ký" });
        }

        const currentStep = doc.signSteps.find(s => s.stepIndex === doc.currentStepIndex);
        if (!currentStep || String(currentStep.assignee) !== String(userId)) {
            return res.status(403).json({ success: false, message: "Bạn không có quyền từ chối ở bước này" });
        }

        currentStep.action = "REJECTED";
        currentStep.comment = reason;
        currentStep.actionAt = new Date();

        doc.status = "REJECTED";
        doc.rejectionReason = reason;
        doc.rejectedBy = userId;

        await doc.save();

        res.status(200).json({
            success: true,
            message: "Đã từ chối hồ sơ trình ký",
            data: doc
        });

    } catch (error) {
        console.error("Error rejecting approval document:", error);
        res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
    }
};

// 6. Lấy stream PDF xem trước (Tự động convert nếu file gốc là Word chưa convert sang PDF)
const getPreviewPdfStream = async (req, res) => {
    try {
        const { id } = req.params;
        const doc = await ApprovalDocument.findById(id);
        if (!doc) {
            return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ trình ký" });
        }

        const auth = await authorize();
        const drive = google.drive({ version: "v3", auth });

        // Nếu currentFile là PDF hợp lệ, stream về
        if (doc.currentFile?.fileId && doc.currentFile.mimeType === "application/pdf") {
            const pdfBuffer = await getDriveFileBuffer(drive, doc.currentFile.fileId);
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(doc.currentFile.fileName || "preview.pdf")}"`);
            return res.send(pdfBuffer);
        }

        // Nếu file gốc là PDF
        if (doc.originalFile?.mimeType === "application/pdf" || doc.originalFile?.fileName?.toLowerCase().endsWith(".pdf")) {
            const pdfBuffer = await getDriveFileBuffer(drive, doc.originalFile.fileId);
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(doc.originalFile.fileName || "preview.pdf")}"`);
            return res.send(pdfBuffer);
        }

        // Trường hợp file gốc là Word (.doc, .docx) nhưng chưa được convert sang PDF
        const wordBuffer = await getDriveFileBuffer(drive, doc.originalFile.fileId);
        let pdfBuffer;
        try {
            pdfBuffer = await libreConvert(wordBuffer, ".pdf", undefined);
        } catch (convErr) {
            console.error("Lỗi convert Word sang PDF:", convErr.message);
            return res.status(500).json({
                success: false,
                message: "Không thể chuyển đổi file văn bản Word sang PDF để xem trước. " + convErr.message
            });
        }

        // Lưu PDF này vào Drive và cập nhật doc.currentFile để các lần sau không cần convert lại
        try {
            const folderId = await getOrCreateMonthFolder(drive);
            const pdfName = `${sanitizeFileName(doc.originalFile.fileName.replace(/\.[^/.]+$/, ""))}_preview.pdf`;
            const pdfUploadRes = await drive.files.create({
                requestBody: { name: pdfName, parents: [folderId] },
                media: { mimeType: "application/pdf", body: Readable.from(pdfBuffer) },
                fields: "id, name, mimeType",
                supportsAllDrives: true
            });

            doc.currentFile = {
                fileName: pdfUploadRes.data.name,
                fileId: pdfUploadRes.data.id,
                mimeType: "application/pdf"
            };
            await doc.save();
        } catch (saveErr) {
            console.warn("Không thể lưu cache PDF lên Drive:", saveErr.message);
        }

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(doc.currentFile?.fileName || "preview.pdf")}"`);
        return res.send(pdfBuffer);

    } catch (error) {
        console.error("Error streaming preview PDF:", error);
        res.status(500).json({ success: false, message: "Lỗi tải bản xem trước PDF", error: error.message });
    }
};

// 7. Xóa hồ sơ trình ký (Chỉ Admin hoặc người tạo nếu hồ sơ chưa qua bước 1)
const deleteApprovalDocument = async (req, res) => {
    try {
        const userId = req.user._id;
        const userRole = req.user.role;
        const { id } = req.params;

        const doc = await ApprovalDocument.findById(id);
        if (!doc) {
            return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ trình ký" });
        }

        // Quyền xóa: Admin được xóa mọi hồ sơ; Người tạo chỉ được xóa nếu chưa ai duyệt (currentStepIndex === 1 và chưa APPROVED)
        const isAdmin = userRole === "admin" || userRole === "manager";
        const isOwner = String(doc.creator) === String(userId);

        if (!isAdmin) {
            if (!isOwner) {
                return res.status(403).json({ success: false, message: "Bạn không có quyền xóa hồ sơ này" });
            }
            if (doc.status === "APPROVED") {
                return res.status(400).json({ success: false, message: "Hồ sơ đã được phê duyệt hoàn tất, không thể xóa" });
            }
        }

        // Xóa file trên Google Drive (nếu có)
        try {
            const auth = await authorize();
            const drive = google.drive({ version: "v3", auth });
            if (doc.originalFile?.fileId) {
                await drive.files.delete({ fileId: doc.originalFile.fileId, supportsAllDrives: true }).catch(() => {});
            }
            if (doc.currentFile?.fileId && doc.currentFile.fileId !== doc.originalFile?.fileId) {
                await drive.files.delete({ fileId: doc.currentFile.fileId, supportsAllDrives: true }).catch(() => {});
            }
        } catch (e) {
            console.warn("Không thể xóa file drive liên kết:", e.message);
        }

        await ApprovalDocument.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: "Đã xóa hồ sơ trình ký thành công"
        });
    } catch (error) {
        console.error("Error deleting approval document:", error);
        res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
    }
};


// 6. Manager vào số và phát hành hồ sơ ban hành
const issueApprovalDocument = async (req, res) => {
    try {
        const userId = req.user._id;
        const userRole = req.user.role;
        const { id } = req.params;
        const { issuedNumber, note } = req.body;

        if (!issuedNumber) {
            return res.status(400).json({ success: false, message: "Vui lòng nhập số văn bản ban hành" });
        }

        const doc = await ApprovalDocument.findById(id);
        if (!doc) {
            return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ trình ký" });
        }

        const currentStep = doc.signSteps.find(s => s.stepIndex === doc.currentStepIndex);
        const isManagerOrAdmin = userRole === "admin" || userRole === "manager";
        const isAssignee = currentStep && String(currentStep.assignee) === String(userId);

        if (!isManagerOrAdmin && !isAssignee) {
            return res.status(403).json({ success: false, message: "Chỉ Manager/Quản trị viên hoặc người được phân công mới có quyền vào số ban hành hồ sơ" });
        }

        if (currentStep) {
            currentStep.action = "APPROVED";
            currentStep.comment = note || `Đã vào số ban hành: ${issuedNumber}`;
            currentStep.actionAt = new Date();
        }

        doc.issuedNumber = issuedNumber;
        doc.issuedAt = new Date();
        doc.status = "APPROVED"; // Hoặc APPROVED hoàn tất

        // Kiểm tra xem đã qua hết các bước chưa
        if (doc.currentStepIndex >= doc.signSteps.length) {
            doc.status = "APPROVED";
        } else {
            doc.currentStepIndex += 1;
        }

        await doc.save();

        const updated = await ApprovalDocument.findById(doc._id)
            .populate("creator", "name email avatar")
            .populate("signSteps.assignee", "name email avatar position");

        res.status(200).json({
            success: true,
            message: "Đã vào số và ban hành hồ sơ thành công!",
            data: updated
        });

    } catch (error) {
        console.error("Error issuing approval document:", error);
        res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
    }
};

module.exports = {
    createApprovalDocument,
    getApprovalDocuments,
    getApprovalDocumentById,
    signAndApproveStep,
    rejectApprovalDocument,
    getPreviewPdfStream,
    deleteApprovalDocument,
    issueApprovalDocument
};

