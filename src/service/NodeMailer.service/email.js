const {
    TEMPPASSWORD_EMAIL_TEMPLATE,
    NEW_DOCUMENT_EMAIL_TEMPLATE,
    TASK_NOTIFICATION_EMAIL_TEMPLATE,
    REVIEW_NOTIFICATION_EMAIL_TEMPLATE,
    EMULATION_REGISTRATION_EMAIL_TEMPLATE,
    EMULATION_STATUS_EMAIL_TEMPLATE,
    TRAINING_REGISTRATION_EMAIL_TEMPLATE,
    TRAINING_STATUS_EMAIL_TEMPLATE,
    ONLINE_RECORD_SUBMIT_EMAIL_TEMPLATE,
    ONLINE_RECORD_STATUS_EMAIL_TEMPLATE,
    QUARTERLY_PLAN_REMINDER_EMAIL_TEMPLATE,
    MEETING_REMINDER_EMAIL_TEMPLATE,
    WORK_SCHEDULE_REGISTRATION_EMAIL_TEMPLATE,
    WORK_SCHEDULE_STATUS_EMAIL_TEMPLATE,
} = require("./emailTemplate");
const nodemailer = require("nodemailer");
const dotenv = require("dotenv");
const SmtpConfig = require("../../models/smtpConfig.model");
const SystemConfig = require("../../models/systemConfig.model");
dotenv.config();

/**
 * Lấy Tên trang Website (Title tab trình duyệt) từ Cấu hình đơn vị (systemconfigs)
 */
const getSystemBrandName = async () => {
    try {
        const config = await SystemConfig.findOne().lean();
        if (config && config.siteName && config.siteName.trim()) {
            return config.siteName.trim();
        }
    } catch (e) {
        console.error("Error fetching SystemConfig siteName:", e);
    }
    return "Hệ thống Văn phòng số - NSG-Office";
};

/**
 * Áp dụng tên thương hiệu phần mềm vào nội dung email HTML
 */
const applySystemBranding = (html, brandName) => {
    if (!html) return html;
    return html
        .replace(/{systemName}/g, brandName)
        .replace(/{brandName}/g, brandName)
        .replace(/{siteName}/g, brandName)
        .replace(/Hệ thống Quản lý văn bản NSG/gi, brandName)
        .replace(/Hệ thống quản lý văn bản NSG/gi, brandName)
        .replace(/Phần mềm quản lý văn bản NSG/gi, brandName)
        .replace(/Phần mềm Quản lý Văn bản NSG/gi, brandName)
        .replace(/Quản lý Văn bản NSG/gi, brandName)
        .replace(/Quản lý văn bản NSG/gi, brandName);
};

const getTransporterAndSender = async () => {
    let host = "smtp.gmail.com";
    let port = 465;
    let secure = true;
    let user = process.env.EMAIL_USERNAME;
    let pass = process.env.EMAIL_PASSWORD;
    const brandName = await getSystemBrandName();
    let senderName = brandName;

    try {
        const config = await SmtpConfig.findOne();
        if (config && config.user && config.pass) {
            host = config.host || host;
            port = config.port || port;
            secure = (port === 465);
            user = config.user;
            pass = config.pass;
            if (config.senderName && 
                config.senderName !== "Hệ thống Quản lý Văn bản NSG" && 
                config.senderName !== "Hệ thống quản lý văn bản NSG") {
                senderName = config.senderName;
            }
        }
    } catch (e) {
        console.error("Error fetching SMTP config for email service:", e);
    }

    const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 30000,
    });

    const sender = `"${senderName}" <${user || 'qlvb@nsgpc.edu.vn'}>`;

    return { transporter, sender, brandName };
};

/**
 * Định dạng ngày giờ chuẩn Múi giờ Việt Nam (Asia/Ho_Chi_Minh - UTC+7)
 */
const formatVietnamDateTime = (date = new Date()) => {
    try {
        const d = date ? new Date(date) : new Date();
        if (isNaN(d.getTime())) return "--";
        return d.toLocaleString("vi-VN", {
            timeZone: "Asia/Ho_Chi_Minh",
            hour12: false,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
    } catch (e) {
        return new Date(date || Date.now()).toLocaleString("vi-VN");
    }
};

const formatVietnamDate = (date = new Date()) => {
    try {
        const d = date ? new Date(date) : new Date();
        if (isNaN(d.getTime())) return "--";
        return d.toLocaleDateString("vi-VN", {
            timeZone: "Asia/Ho_Chi_Minh",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        });
    } catch (e) {
        return new Date(date || Date.now()).toLocaleDateString("vi-VN");
    }
};

const sentTempPassword = async (email,tempPass) => {
    try {
        const { transporter, sender, brandName } = await getTransporterAndSender();

        const mailOptions = {
            from: sender, // sender address
            to: email, // list of receivers
            subject: `[${brandName}] Mã xác nhận khôi phục tài khoản (OTP)`, // Subject line
            text: "Mã khôi phục mật khẩu", // plain text body
            html: applySystemBranding(TEMPPASSWORD_EMAIL_TEMPLATE.replace("{tempPass}",tempPass), brandName),
        }
        const info = await transporter.sendMail(mailOptions);
        return info;
    } catch (error) {
        console.error("Error sending temp password to email:", error);

    }
}

const sendRestoreOtpEmail = async (email, otp) => {
    try {
        const { transporter, sender, brandName } = await getTransporterAndSender();
        const mailOptions = {
            from: sender,
            to: email,
            subject: `[${brandName}] Mã xác nhận Khôi phục Cơ sở dữ liệu`,
            text: `Mã xác nhận của bạn là: ${otp}. Mã có hiệu lực trong 10 phút.`,
            html: applySystemBranding(`
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2>Cảnh báo Bảo mật</h2>
                    <p>Bạn vừa yêu cầu khôi phục toàn bộ Cơ sở dữ liệu của hệ thống.</p>
                    <p>Mã xác nhận (OTP) của bạn là: <strong>${otp}</strong></p>
                    <p style="color: red;">Mã có hiệu lực trong 10 phút. <strong>LƯU Ý:</strong> Việc khôi phục sẽ ghi đè toàn bộ dữ liệu hiện tại.</p>
                </div>
            `, brandName),
        }
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error("Error sending restore OTP to email:", error);
    }
}

const sendNewDocumentEmail = async (uniqueUsers, docData, senderName = "Hệ thống") => {
    try {
        if (!uniqueUsers || uniqueUsers.length === 0) return;
        const { transporter, sender, brandName } = await getTransporterAndSender();
        
        let linksHtml = "";
        if (docData.files && docData.files.length > 0) {
            linksHtml = docData.files.map(f => 
                `<li><a href="https://drive.google.com/file/d/${f.fileId}/view" target="_blank">${f.fileName || 'Xem file'}</a></li>`
            ).join('');
        } else {
            linksHtml = "<li>Không có file đính kèm</li>";
        }

        const dateValue = docData.receivedAt ? 
            formatVietnamDate(docData.receivedAt) : 
            (docData.createAt ? formatVietnamDate(docData.createAt) : "N/A");
            
        const deadlineValue = docData.deadlineDay ? 
            formatVietnamDate(docData.deadlineDay) : "Không có";

        const fullDocCode = (docData.docNum && docData.docCode) 
            ? `${docData.docNum}/${docData.docCode}` 
            : (docData.docNum || docData.docCode || "N/A");

        const subject = `[${brandName} - Văn bản mới] ${fullDocCode} - ${docData.shortDescription || "N/A"}`;

        const allowedUsers = uniqueUsers.filter(u => !u.emailNotifications || u.emailNotifications.docNew !== false);
        const bccList = allowedUsers.map(u => u.email).filter(e => !!e);
        if (bccList.length === 0) return;
        
        let htmlContent = NEW_DOCUMENT_EMAIL_TEMPLATE
            .replace("{senderName}", senderName)
            .replace("{docCode}", fullDocCode)
            .replace("{shortDescription}", docData.shortDescription || "N/A")
            .replace("{docType}", docData.docType === "received" ? "Văn bản đến" : "Văn bản đi")
            .replace("{urgency}", docData.urgency || "Bình thường")
            .replace("{dateValue}", dateValue)
            .replace("{principalIdea}", docData.principalIdea || "N/A")
            .replace("{deadlineDay}", deadlineValue)
            .replace("{linksHtml}", linksHtml);

        const recipientEmails = Array.from(new Set(bccList));
        const mailOptions = {
            from: sender,
            to: recipientEmails.join(', '),
            subject: subject,
            html: applySystemBranding(htmlContent, brandName),
        };
        const info = await transporter.sendMail(mailOptions);
        console.log(`[Email] Đã gửi thông báo văn bản "${fullDocCode}" tới:`, recipientEmails.join(', '), info?.messageId);
        return true;
    } catch (error) {
        console.error("Error sending document notification to email:", error);
    }
}

const sendTaskReminderEmail = async (emails, taskData, reminderType) => {
    try {
        if (!emails || emails.length === 0) return;
        const bccList = Array.isArray(emails) ? emails : [emails];
        if (bccList.length === 0) return;

        const { transporter, sender, brandName } = await getTransporterAndSender();
        
        let subject = "";
        let headerTitle = "";
        let color = "#333";
        
        if (reminderType === "near_deadline") {
            subject = `[${brandName} - Nhắc nhở] Công việc sắp đến hạn: ${taskData.title}`;
            headerTitle = "Công việc của bạn sắp đến hạn";
            color = "#f39c12"; // Orange
        } else if (reminderType === "due_today") {
            subject = `[${brandName} - Khẩn cấp] Công việc đến hạn hôm nay: ${taskData.title}`;
            headerTitle = "Công việc của bạn ĐẾN HẠN TRONG HÔM NAY";
            color = "#e74c3c"; // Red
        } else if (reminderType === "overdue") {
            subject = `[${brandName} - Quá hạn] Công việc đã quá hạn: ${taskData.title}`;
            headerTitle = "Công việc của bạn ĐÃ QUÁ HẠN";
            color = "#c0392b"; // Dark Red
        }

        const endDateStr = formatVietnamDate(taskData.endDate);

        const htmlContent = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
            <h2 style="color: ${color}; text-align: center; border-bottom: 2px solid ${color}; padding-bottom: 10px;">${headerTitle}</h2>
            <p>Xin chào,</p>
            <p>Hệ thống xin thông báo về tình trạng công việc được giao cho bạn:</p>
            <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid ${color}; margin-top: 20px;">
                <p><strong>Tên công việc:</strong> ${taskData.title}</p>
                <p><strong>Nội dung:</strong> ${taskData.description || "Không có"}</p>
                <p><strong>Hạn hoàn thành:</strong> <span style="color: ${color}; font-weight: bold;">${endDateStr}</span></p>
            </div>
            <p style="margin-top: 20px;">Vui lòng truy cập ${brandName} để cập nhật tiến độ công việc.</p>
            <p style="color: #888; font-size: 12px; margin-top: 30px; text-align: center;">Đây là email tự động từ hệ thống, vui lòng không trả lời email này.</p>
        </div>`;

        const recipientEmails = Array.from(new Set(bccList));
        const mailOptions = {
            from: sender,
            to: recipientEmails.join(', '),
            subject: subject,
            html: applySystemBranding(htmlContent, brandName),
        };
        const info = await transporter.sendMail(mailOptions);
        console.log(`[Email] Đã gửi nhắc nhở công việc "${taskData.title}" tới:`, recipientEmails.join(', '), info?.messageId);
        return true;
    } catch (error) {
        console.error("Error sending task reminder email:", error);
    }
}

const sendTaskNotificationEmail = async (uniqueUsers, taskData, actionType) => {
    try {
        if (!uniqueUsers || uniqueUsers.length === 0) return;
        const { transporter, sender, brandName } = await getTransporterAndSender();
        
        let actionName = "Cập nhật công việc";
        if (actionType === 'create') actionName = "Tạo công việc mới";
        if (actionType === 'status_change') actionName = "Thay đổi trạng thái công việc";
        if (actionType === 'evaluated') actionName = "Đánh giá kết quả công việc";

        let linksHtml = "";
        if (taskData.files && taskData.files.length > 0) {
            linksHtml = taskData.files.map(f => 
                `<li><a href="https://drive.google.com/file/d/${f.fileId}/view" target="_blank">${f.fileName}</a></li>`
            ).join('');
        } else {
            linksHtml = "<li>Không có file đính kèm</li>";
        }

        const dateValue = taskData.startDate && taskData.endDate ? 
            `${formatVietnamDate(taskData.startDate)} - ${formatVietnamDate(taskData.endDate)}` : "N/A";

        let priorityLabel = "Bình thường";
        let priorityHighlightBlock = "";
        
        if (taskData.priority === 'FLASH') {
            priorityLabel = "Hỏa tốc";
            priorityHighlightBlock = `<div style="background-color: #ffebee; border-left: 4px solid #f44336; padding: 15px; margin: 20px 0;">
                <strong style="color: #f44336; font-size: 16px;">🚨 Khẩn cấp: Công việc Hỏa tốc!</strong>
                <p style="margin: 5px 0 0 0; color: #d32f2f;">Công việc này mang tính chất Hỏa tốc, yêu cầu sự ưu tiên xử lý ngay lập tức.</p>
            </div>`;
        } else if (taskData.priority === 'URGENT') {
            priorityLabel = "Khẩn";
            priorityHighlightBlock = `<div style="background-color: #fff3e0; border-left: 4px solid #ff9800; padding: 15px; margin: 20px 0;">
                <strong style="color: #f57c00; font-size: 16px;">⚠️ Chú ý: Công việc Khẩn!</strong>
                <p style="margin: 5px 0 0 0; color: #e65100;">Công việc này mang tính chất Khẩn, vui lòng ưu tiên xử lý sớm.</p>
            </div>`;
        }

        let statusLabel = '<span style="color: #f44336; font-weight: bold;">Chưa làm</span>';
        let headerColorStart = "#f44336";
        let headerColorEnd = "#ef5350";
        let headerBorderColor = "#f44336";

        if (taskData.status === 'IN_PROGRESS') {
            statusLabel = '<span style="color: #2196F3; font-weight: bold;">Đang làm</span>';
            headerColorStart = "#2196F3";
            headerColorEnd = "#42a5f5";
            headerBorderColor = "#2196F3";
        } else if (taskData.status === 'DONE') {
            statusLabel = '<span style="color: #4CAF50; font-weight: bold;">Hoàn thành</span>';
            headerColorStart = "#4CAF50";
            headerColorEnd = "#66bb6a";
            headerBorderColor = "#4CAF50";
        }

        const assigneesList = (taskData.assignees || []).map(u => u.name).join(', ') || "N/A";
        const collaboratorsList = (taskData.collaborators || []).map(u => u.name).join(', ') || "N/A";

        const subject = `[${brandName} - ${actionName}] ${taskData.title}`;

        const allowedUsers = uniqueUsers.filter(u => !u.emailNotifications || u.emailNotifications.taskAssign !== false);
        const bccList = allowedUsers.map(u => u.email).filter(e => !!e);
        if (bccList.length === 0) return;

        let htmlContent = TASK_NOTIFICATION_EMAIL_TEMPLATE
            .replace(/{actionName}/g, actionName)
            .replace(/{priorityHighlightBlock}/g, priorityHighlightBlock)
            .replace(/{taskTitle}/g, taskData.title || "N/A")
            .replace(/{taskDescription}/g, taskData.description || "Không có")
            .replace(/{taskTime}/g, dateValue)
            .replace(/{priorityLabel}/g, priorityLabel)
            .replace(/{statusLabel}/g, statusLabel)
            .replace(/{assigneesList}/g, assigneesList)
            .replace(/{collaboratorsList}/g, collaboratorsList)
            .replace(/{linksHtml}/g, linksHtml)
            .replace(/{headerColorStart}/g, headerColorStart)
            .replace(/{headerColorEnd}/g, headerColorEnd)
            .replace(/{headerBorderColor}/g, headerBorderColor);

        const recipientEmails = Array.from(new Set(bccList));
        const mailOptions = {
            from: sender,
            to: recipientEmails.join(', '),
            subject: subject,
            html: applySystemBranding(htmlContent, brandName),
        };
        const info = await transporter.sendMail(mailOptions);
        console.log(`[Email] Đã gửi thông báo công việc "${taskData.title}" (${actionName}) tới:`, recipientEmails.join(', '), info?.messageId);
        return true;
    } catch (error) {
        console.error("Error sending task notification to email:", error);
    }
}

const sendReviewNotificationEmail = async (uniqueUsers, docData, actionType, notes = "", actorName = "") => {
    try {
        if (!uniqueUsers || uniqueUsers.length === 0) return;
        const allowedUsers = uniqueUsers.filter(u => {
            if (!u.emailNotifications) return true;
            if (actionType === 'submitToBGH') {
                if (u.emailNotifications.replyDocSubmit !== undefined) {
                    return u.emailNotifications.replyDocSubmit !== false;
                }
                return u.emailNotifications.docReview !== false;
            } else {
                if (u.emailNotifications.replyDocStatus !== undefined) {
                    return u.emailNotifications.replyDocStatus !== false;
                }
                return u.emailNotifications.docReview !== false;
            }
        });
        const bccList = allowedUsers.map(u => u.email).filter(e => !!e);
        if (bccList.length === 0) return;

        const { transporter, sender, brandName } = await getTransporterAndSender();
        
        let actionName = "Cập nhật xét duyệt";
        let statusLabel = '<span style="color: #2196F3; font-weight: bold;">Chuyển BGH duyệt</span>';
        let headerColorStart = "#2196F3";
        let headerColorEnd = "#42a5f5";
        let headerBorderColor = "#2196F3";

        if (actionType === 'submitToBGH') {
            actionName = actorName ? `${actorName} yêu cầu BGH xét duyệt` : "Yêu cầu BGH xét duyệt";
            statusLabel = '<span style="color: #ff9800; font-weight: bold;">Chuyển BGH duyệt</span>';
            headerColorStart = "#ff9800";
            headerColorEnd = "#ffb74d";
            headerBorderColor = "#ff9800";
        } else if (actionType === 'bghReject') {
            actionName = actorName ? `${actorName} từ chối phê duyệt` : "BGH từ chối phê duyệt";
            statusLabel = '<span style="color: #f44336; font-weight: bold;">BGH Từ chối</span>';
            headerColorStart = "#f44336";
            headerColorEnd = "#ef5350";
            headerBorderColor = "#f44336";
        } else if (actionType === 'bghApprove') {
            actionName = actorName ? `${actorName} đã phê duyệt` : "BGH đã phê duyệt";
            statusLabel = '<span style="color: #4CAF50; font-weight: bold;">BGH Đã duyệt</span>';
            headerColorStart = "#4CAF50";
            headerColorEnd = "#81c784";
            headerBorderColor = "#4CAF50";
        } else if (actionType === 'managerAccept') {
            actionName = actorName ? `${actorName} đã xác nhận` : "Manager đã xác nhận";
            statusLabel = '<span style="color: #4CAF50; font-weight: bold;">Đã xác nhận</span>';
            headerColorStart = "#4CAF50";
            headerColorEnd = "#66bb6a";
            headerBorderColor = "#4CAF50";
        } else if (actionType === 'managerReject') {
            actionName = actorName ? `${actorName} từ chối phê duyệt` : "Manager từ chối phê duyệt";
            statusLabel = '<span style="color: #f44336; font-weight: bold;">Từ chối</span>';
            headerColorStart = "#f44336";
            headerColorEnd = "#ef5350";
            headerBorderColor = "#f44336";
        }

        let linksHtml = "";
        if (docData.files && docData.files.length > 0) {
            linksHtml = docData.files.map(f => 
                `<li><a href="https://drive.google.com/file/d/${f.fileId}/view" target="_blank">${f.fileName || f.name || 'Xem file'}</a></li>`
            ).join('');
        } else {
            linksHtml = "<li>Không có file đính kèm</li>";
        }

        const fullDocCode = docData.repliedDoc ? 
            ((docData.repliedDoc.docNum && docData.repliedDoc.docCode) ? `${docData.repliedDoc.docNum}/${docData.repliedDoc.docCode}` : "N/A") 
            : "N/A";
            
        const docTitle = docData.shortDescription || "Không có";
        const docType = docData.docVariant ? (docData.docVariant.docVariantName || "N/A") : "N/A";
        const submitter = docData.replyBy ? (docData.replyBy.name || "N/A") : "N/A";
        let drafter = submitter; // Normally, drafter and submitter are the same
        if (docData.repliedDoc && docData.repliedDoc.sentBy && docData.repliedDoc.sentBy.name) {
            drafter = docData.repliedDoc.sentBy.name;
        }

        let htmlContent = REVIEW_NOTIFICATION_EMAIL_TEMPLATE
            .replace(/{actionName}/g, actionName)
            .replace(/{docTitle}/g, docTitle)
            .replace(/{docCode}/g, fullDocCode)
            .replace(/{docType}/g, docType)
            .replace(/{drafter}/g, drafter)
            .replace(/{submitter}/g, submitter)
            .replace(/{statusLabel}/g, statusLabel)
            .replace(/{notes}/g, notes || "Không có")
            .replace(/{linksHtml}/g, linksHtml)
            .replace(/{headerColorStart}/g, headerColorStart)
            .replace(/{headerColorEnd}/g, headerColorEnd)
            .replace(/{headerBorderColor}/g, headerBorderColor);

        const subject = `[${brandName} - ${actionName}] ${docTitle}`;

        const recipientEmails = Array.from(new Set(bccList));
        const mailOptions = {
            from: sender,
            to: recipientEmails.join(', '),
            subject: subject,
            html: applySystemBranding(htmlContent, brandName),
        };
        const info = await transporter.sendMail(mailOptions);
        console.log(`[Email] Đã gửi thông báo trình ký "${docTitle}" (${actionName}) tới:`, recipientEmails.join(', '), info?.messageId);
        return true;
    } catch (error) {
        console.error("Error sending review notification to email:", error);
    }
}

const sendEmulationRegistrationEmail = async (uniqueUsers, regData, creatorName = "Cán bộ") => {
    try {
        if (!uniqueUsers || uniqueUsers.length === 0) return;
        const allowedUsers = uniqueUsers.filter(u => !u.emailNotifications || u.emailNotifications.emulationRegister !== false);
        const bccList = allowedUsers.map(u => u.email).filter(e => !!e);
        if (bccList.length === 0) return;

        const { transporter, sender, brandName } = await getTransporterAndSender();

        // Danh hiệu HTML
        let titlesHtml = "";
        if (regData.titles && regData.titles.length > 0) {
            titlesHtml = regData.titles.map(t => {
                const name = typeof t === "object" ? t.name : t;
                return `<div style="margin: 3px 0; color: #b78103; font-weight: 600;">🏆 ${name}</div>`;
            }).join('');
        } else {
            titlesHtml = "<i>Chưa chọn danh hiệu</i>";
        }

        // Thành viên HTML (nếu có)
        let membersBlockHtml = "";
        if (regData.members && regData.members.length > 0) {
            const rows = regData.members.map((m, idx) => {
                const memTitles = (m.titles || []).map(t => typeof t === "object" ? t.name : t).join(', ') || "--";
                return `
                    <tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 6px 8px; text-align: center;">${idx + 1}</td>
                        <td style="padding: 6px 8px; font-weight: 600;">${m.name}</td>
                        <td style="padding: 6px 8px;">${m.positionName || "--"}</td>
                        <td style="padding: 6px 8px;">${m.departmentName || "--"}</td>
                        <td style="padding: 6px 8px; color: #b78103;">${memTitles}</td>
                    </tr>
                `;
            }).join('');

            membersBlockHtml = `
                <div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed #e1e8ed;">
                    <p style="margin: 6px 0;"><strong>Danh sách cá nhân đề nghị (${regData.members.length} người):</strong></p>
                    <div style="overflow-x: auto;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 6px;">
                            <thead>
                                <tr style="background-color: #f0f4f8; text-align: left;">
                                    <th style="padding: 6px 8px; text-align: center;">STT</th>
                                    <th style="padding: 6px 8px;">Họ và tên</th>
                                    <th style="padding: 6px 8px;">Chức vụ</th>
                                    <th style="padding: 6px 8px;">Đơn vị</th>
                                    <th style="padding: 6px 8px;">Danh hiệu</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rows}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        // Files đính kèm HTML
        let linksHtml = "";
        if (regData.attachedFiles && regData.attachedFiles.length > 0) {
            linksHtml = regData.attachedFiles.map(f => {
                const url = f.fileUrl || `https://drive.google.com/file/d/${f.fileId}/view`;
                const typeName = f.documentTypeName || "Tài liệu minh chứng";
                return `<li><a href="${url}" target="_blank" style="color: #1890ff; text-decoration: none;">📄 ${typeName}: ${f.fileName || 'Xem file'}</a></li>`;
            }).join('');
        } else {
            linksHtml = "<li>Không có tệp đính kèm</li>";
        }

        const targetName = regData.name || regData.departmentName || "Đơn vị";
        const schoolYear = regData.schoolYear || "N/A";
        const subject = `[${brandName} - Đề nghị thi đua] ${targetName} - Năm học ${schoolYear}`;
        const createdAtStr = formatVietnamDateTime(regData.createdAt || Date.now());

        let htmlContent = EMULATION_REGISTRATION_EMAIL_TEMPLATE
            .replace(/{schoolYear}/g, schoolYear)
            .replace(/{departmentName}/g, regData.departmentName || "Ban Giám hiệu / Nhà trường")
            .replace(/{targetName}/g, targetName)
            .replace(/{positionName}/g, regData.positionName || "Cán bộ")
            .replace(/{creatorName}/g, creatorName)
            .replace(/{createdAt}/g, createdAtStr)
            .replace(/{titlesHtml}/g, titlesHtml)
            .replace(/{membersBlockHtml}/g, membersBlockHtml)
            .replace(/{notes}/g, regData.notes || "Không có")
            .replace(/{linksHtml}/g, linksHtml);

        const recipientEmails = Array.from(new Set(bccList));
        const mailOptions = {
            from: sender,
            to: recipientEmails.join(', '),
            subject: subject,
            html: applySystemBranding(htmlContent, brandName),
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`[Email] Đã gửi thông báo đề nghị thi đua "${targetName}" tới:`, recipientEmails.join(', '), info?.messageId);
        return true;
    } catch (error) {
        console.error("Error in sendEmulationRegistrationEmail:", error);
    }
};

const sendEmulationStatusEmail = async (uniqueUsers, regData, actionType, note = "", actorName = "Quản lý", actorRole = "Manager") => {
    try {
        if (!uniqueUsers || uniqueUsers.length === 0) return;
        const allowedUsers = uniqueUsers.filter(u => !u.emailNotifications || u.emailNotifications.emulationRegister !== false);
        const bccList = allowedUsers.map(u => u.email).filter(e => !!e);
        if (bccList.length === 0) return;

        const { transporter, sender, brandName } = await getTransporterAndSender();

        let actionName = "Cập nhật xét duyệt";
        let statusLabel = '<span style="color: #1890ff; font-weight: bold;">Đang xử lý</span>';
        let headerColorStart = "#1890ff";
        let headerColorEnd = "#096dd9";
        let headerBorderColor = "#1890ff";

        if (actionType === 'MANAGER_SUBMIT_BGH' || actionType === 'MANAGER_APPROVE') {
            actionName = "Quản lý đã duyệt hồ sơ và chuyển Ban Giám hiệu";
            statusLabel = '<span style="color: #fa8c16; font-weight: bold;">Đã chuyển Ban Giám hiệu phê duyệt</span>';
            headerColorStart = "#fa8c16";
            headerColorEnd = "#d46b08";
            headerBorderColor = "#fa8c16";
        } else if (actionType === 'MANAGER_REJECT') {
            actionName = "Quản lý từ chối hồ sơ đề nghị thi đua";
            statusLabel = '<span style="color: #f5222d; font-weight: bold;">Quản lý Từ chối / Cần chỉnh sửa</span>';
            headerColorStart = "#f5222d";
            headerColorEnd = "#cf1322";
            headerBorderColor = "#f5222d";
        } else if (actionType === 'BGH_APPROVE') {
            actionName = "Ban Giám hiệu đã phê duyệt đề nghị thi đua";
            statusLabel = '<span style="color: #52c41a; font-weight: bold;">Ban Giám hiệu Phê duyệt</span>';
            headerColorStart = "#52c41a";
            headerColorEnd = "#389e0d";
            headerBorderColor = "#52c41a";
        } else if (actionType === 'BGH_REJECT') {
            actionName = "Ban Giám hiệu từ chối đề nghị thi đua";
            statusLabel = '<span style="color: #f5222d; font-weight: bold;">Ban Giám hiệu Từ chối</span>';
            headerColorStart = "#f5222d";
            headerColorEnd = "#cf1322";
            headerBorderColor = "#f5222d";
        }

        const targetName = regData.name || regData.departmentName || "Đơn vị";
        const subject = `[${brandName} - Thi đua: ${actionName}] ${targetName}`;
        const actionTimeStr = formatVietnamDateTime();

        let titlesHtml = "";
        if (regData.titles && regData.titles.length > 0) {
            titlesHtml = regData.titles.map(t => `<li style="margin: 4px 0; font-weight: 500;">🏆 ${t.titleName || t}</li>`).join('');
        } else {
            titlesHtml = "<li>Không có danh hiệu cụ thể</li>";
        }

        let htmlContent = EMULATION_STATUS_EMAIL_TEMPLATE
            .replace(/{actionName}/g, actionName)
            .replace(/{statusLabel}/g, statusLabel)
            .replace(/{targetName}/g, targetName)
            .replace(/{schoolYear}/g, regData.schoolYear || "N/A")
            .replace(/{actorName}/g, actorName)
            .replace(/{actorRole}/g, actorRole)
            .replace(/{actionTime}/g, actionTimeStr)
            .replace(/{notes}/g, note || "Không có ý kiến bổ sung")
            .replace(/{titlesHtml}/g, titlesHtml)
            .replace(/{headerColorStart}/g, headerColorStart)
            .replace(/{headerColorEnd}/g, headerColorEnd)
            .replace(/{headerBorderColor}/g, headerBorderColor);

        const recipientEmails = Array.from(new Set(bccList));
        const mailOptions = {
            from: sender,
            to: recipientEmails.join(', '),
            subject: subject,
            html: applySystemBranding(htmlContent, brandName),
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`[Email] Đã gửi thông báo trạng thái thi đua "${targetName}" (${actionName}) tới:`, recipientEmails.join(', '), info?.messageId);
        return true;
    } catch (error) {
        console.error("Error in sendEmulationStatusEmail:", error);
    }
};

const sendTrainingRegistrationEmail = async (uniqueUsers, records, creatorName = "Cán bộ") => {
    try {
        if (!uniqueUsers || uniqueUsers.length === 0 || !records || records.length === 0) return;
        const allowedUsers = uniqueUsers.filter(u => !u.emailNotifications || u.emailNotifications.trainingRegister !== false);
        const bccList = allowedUsers.map(u => u.email).filter(e => !!e);
        if (bccList.length === 0) return;

        const { transporter, sender, brandName } = await getTransporterAndSender();

        const year = records[0]?.year || new Date().getFullYear().toString();
        const createdAtStr = formatVietnamDateTime();

        const rows = records.map((r, idx) => {
            const costFormatted = (Number(r.estimatedCost) || 0).toLocaleString('vi-VN') + ' đ';
            return `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 8px; text-align: center;">${idx + 1}</td>
                    <td style="padding: 8px; font-weight: 600;">${r.userName || "--"}</td>
                    <td style="padding: 8px;">${r.departmentName || "--"}</td>
                    <td style="padding: 8px; color: #1d4ed8; font-weight: 600;">${r.trainingContent || "--"}</td>
                    <td style="padding: 8px;">${r.trainingForm || "Khác"}</td>
                    <td style="padding: 8px; text-align: right; font-weight: 600; color: #059669;">${costFormatted}</td>
                </tr>
            `;
        }).join('');

        let notesBlock = "";
        const allNotes = records.map(r => r.notes).filter(n => !!n);
        if (allNotes.length > 0) {
            notesBlock = `
                <div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed #e1e8ed;">
                    <p style="margin: 6px 0;"><strong>Ghi chú:</strong></p>
                    <div style="background-color: #f8fafc; padding: 10px 14px; border-radius: 4px; font-size: 13px; color: #475569;">
                        ${allNotes.join('; ')}
                    </div>
                </div>
            `;
        }

        const subject = `[${brandName} - Đăng ký bồi dưỡng] ${creatorName} vừa gửi ${records.length} hồ sơ đăng ký mới - Năm ${year}`;

        let htmlContent = TRAINING_REGISTRATION_EMAIL_TEMPLATE
            .replace(/{year}/g, year)
            .replace(/{creatorName}/g, creatorName)
            .replace(/{createdAt}/g, createdAtStr)
            .replace(/{itemsCount}/g, records.length)
            .replace(/{recordsTableRows}/g, rows)
            .replace(/{notesBlock}/g, notesBlock);

        const recipientEmails = Array.from(new Set(bccList));
        const mailOptions = {
            from: sender,
            to: recipientEmails.join(', '),
            subject: subject,
            html: applySystemBranding(htmlContent, brandName),
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`[Email] Đã gửi thông báo đăng ký bồi dưỡng (${records.length} hồ sơ) tới:`, recipientEmails.join(', '), info?.messageId);
        return true;
    } catch (error) {
        console.error("Error in sendTrainingRegistrationEmail:", error);
    }
};

const sendTrainingStatusEmail = async (uniqueUsers, record, actionType, note = "", actorName = "Quản lý", actorRole = "Manager") => {
    try {
        if (!uniqueUsers || uniqueUsers.length === 0 || !record) return;
        const allowedUsers = uniqueUsers.filter(u => !u.emailNotifications || u.emailNotifications.trainingRegister !== false);
        const bccList = allowedUsers.map(u => u.email).filter(e => !!e);
        if (bccList.length === 0) return;

        const { transporter, sender, brandName } = await getTransporterAndSender();

        let actionName = "Cập nhật hồ sơ bồi dưỡng";
        let statusLabel = '<span style="color: #2563eb; font-weight: bold;">Đang xử lý</span>';
        let headerColorStart = "#1d4ed8";
        let headerColorEnd = "#3b82f6";
        let headerBorderColor = "#2563eb";
        let actionUrl = "https://qlvb.namsaigon.edu.vn/training/list";
        let extraDetailsHtml = "";

        if (actionType === 'REVIEW_APPROVED') {
            actionName = "Hồ sơ bồi dưỡng đã được phê duyệt";
            statusLabel = '<span style="color: #10b981; font-weight: bold;">✓ Đã phê duyệt</span>';
            headerColorStart = "#059669";
            headerColorEnd = "#10b981";
            headerBorderColor = "#10b981";
            actionUrl = "https://qlvb.namsaigon.edu.vn/training/list";
        } else if (actionType === 'REVIEW_REJECTED') {
            actionName = "Hồ sơ bồi dưỡng bị từ chối";
            statusLabel = '<span style="color: #ef4444; font-weight: bold;">✕ Từ chối</span>';
            headerColorStart = "#dc2626";
            headerColorEnd = "#f87171";
            headerBorderColor = "#ef4444";
            actionUrl = "https://qlvb.namsaigon.edu.vn/training/list";
        } else if (actionType === 'REPORT_SUBMITTED') {
            actionName = "Đã nộp báo cáo kết quả bồi dưỡng";
            const attended = record.reportResult?.attended !== false;
            statusLabel = attended 
                ? '<span style="color: #0284c7; font-weight: bold;">✓ Đã hoàn thành khóa học & nộp báo cáo</span>' 
                : '<span style="color: #e11d48; font-weight: bold;">Không tham gia học</span>';
            headerColorStart = "#0284c7";
            headerColorEnd = "#38bdf8";
            headerBorderColor = "#0284c7";
            actionUrl = "https://qlvb.namsaigon.edu.vn/training/result-report";

            let proofFilesHtml = "";
            if (Array.isArray(record.reportResult?.proofFiles) && record.reportResult.proofFiles.length > 0) {
                proofFilesHtml = record.reportResult.proofFiles.map(f => {
                    return `<li><a href="${f.fileUrl}" target="_blank" style="color: #2563eb; text-decoration: none;">📄 ${f.fileName || "Xem minh chứng"}</a></li>`;
                }).join('');
            } else {
                proofFilesHtml = "<li>Không có tệp minh chứng đính kèm</li>";
            }

            extraDetailsHtml = `
                <div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed #e1e8ed;">
                    <p style="margin: 6px 0;"><strong>Tình trạng tham gia:</strong> ${attended ? "Đã tham gia bồi dưỡng" : "Không tham gia học"}</p>
                    <p style="margin: 6px 0;"><strong>Kết quả đạt được:</strong> ${record.reportResult?.resultDetails || (attended ? "Đạt" : "Không có")}</p>
                    ${record.reportResult?.hasFundingSupport ? `<p style="margin: 6px 0;"><strong>Kinh phí hỗ trợ:</strong> ${(Number(record.reportResult.actualFundAmount) || 0).toLocaleString('vi-VN')} đ</p>` : ''}
                    <p style="margin: 6px 0;"><strong>Hồ sơ minh chứng đính kèm:</strong></p>
                    <ul style="padding-left: 20px; margin: 4px 0;">
                        ${proofFilesHtml}
                    </ul>
                </div>
            `;
        } else if (actionType === 'REPORT_CONFIRMED') {
            actionName = "Quản lý đã xác nhận kết quả bồi dưỡng";
            statusLabel = '<span style="color: #16a34a; font-weight: bold;">✓ Đã xác nhận hoàn thành</span>';
            headerColorStart = "#16a34a";
            headerColorEnd = "#4ade80";
            headerBorderColor = "#16a34a";
            actionUrl = "https://qlvb.namsaigon.edu.vn/training/result-report";
        }

        const subject = `[${brandName} - Bồi dưỡng: ${actionName}] ${record.userName} - ${record.trainingContent}`;
        const actionTime = formatVietnamDateTime();

        let htmlContent = TRAINING_STATUS_EMAIL_TEMPLATE
            .replace(/{actionName}/g, actionName)
            .replace(/{headerColorStart}/g, headerColorStart)
            .replace(/{headerColorEnd}/g, headerColorEnd)
            .replace(/{headerBorderColor}/g, headerBorderColor)
            .replace(/{actionUrl}/g, actionUrl)
            .replace(/{userName}/g, record.userName || "--")
            .replace(/{positionName}/g, record.positionName || "Cán bộ")
            .replace(/{departmentName}/g, record.departmentName || "Đơn vị")
            .replace(/{trainingContent}/g, record.trainingContent || "--")
            .replace(/{trainingForm}/g, record.trainingForm || "Khác")
            .replace(/{year}/g, record.year || "--")
            .replace(/{statusLabel}/g, statusLabel)
            .replace(/{actorName}/g, actorName)
            .replace(/{actorRole}/g, actorRole)
            .replace(/{actionTime}/g, actionTime)
            .replace(/{extraDetailsHtml}/g, extraDetailsHtml)
            .replace(/{notes}/g, note || "Không có ghi chú thêm.");

        const recipientEmails = Array.from(new Set(bccList));
        const mailOptions = {
            from: sender,
            to: recipientEmails.join(', '),
            subject: subject,
            html: applySystemBranding(htmlContent, brandName),
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`[Email] Đã gửi thông báo trạng thái bồi dưỡng "${record.userName}" (${actionName}) tới:`, recipientEmails.join(', '), info?.messageId);
        return true;
    } catch (error) {
        console.error("Error in sendTrainingStatusEmail:", error);
    }
};

const sendOnlineRecordSubmitEmail = async (uniqueUsers, recordData, senderName = "Cán bộ") => {
    try {
        if (!uniqueUsers || uniqueUsers.length === 0 || !recordData) return;
        const allowedUsers = uniqueUsers.filter(u => {
            if (!u.emailNotifications) return true;
            if (u.emailNotifications.onlineRecordSubmit !== undefined) {
                return u.emailNotifications.onlineRecordSubmit !== false;
            }
            if (u.emailNotifications.onlineRecord !== undefined) {
                return u.emailNotifications.onlineRecord !== false;
            }
            return true;
        });
        const bccList = allowedUsers.map(u => u.email).filter(e => !!e);
        if (bccList.length === 0) return;

        const { transporter, sender, brandName } = await getTransporterAndSender();

        const createdAtStr = formatVietnamDateTime(recordData.createdAt || Date.now());

        // Files đính kèm HTML
        let linksHtml = "";
        const files = recordData.attachedFiles || [];
        if (files.length > 0) {
            linksHtml = files.map(f => {
                const url = f.fileUrl || `https://drive.google.com/file/d/${f.fileId}/view`;
                const typeName = f.attachmentTypeName || "Tài liệu";
                return `<li style="margin: 4px 0;"><a href="${url}" target="_blank" style="color: #0d9488; text-decoration: none; font-weight: 500;">📎 ${typeName}: ${f.fileName || 'Xem file'}</a> ${f.size ? `<span style="color: #94a3b8; font-size: 11px;">(${f.size})</span>` : ''}</li>`;
            }).join('');
        } else {
            linksHtml = "<li>Không có tệp đính kèm</li>";
        }

        const recipientsList = (recordData.recipientNames && recordData.recipientNames.length > 0)
            ? recordData.recipientNames.join(', ')
            : (recordData.recipients && recordData.recipients.map(r => r.name || r).join(', ')) || "Ban Giám hiệu / Quản lý";

        const subject = `[${brandName} - Hồ sơ trực tuyến] ${senderName} vừa gửi hồ sơ: ${recordData.title || "Hồ sơ mới"}`;

        const phoneVal = recordData.phoneNumber || recordData.mobile || "";
        const emailVal = recordData.email || "";
        let senderContactInfo = "";

        if (phoneVal && emailVal) {
            senderContactInfo = `<p style="margin: 6px 0;"><strong>Số điện thoại:</strong> ${phoneVal} | <strong>Email:</strong> ${emailVal}</p>`;
        } else if (phoneVal) {
            senderContactInfo = `<p style="margin: 6px 0;"><strong>Số điện thoại:</strong> ${phoneVal}</p>`;
        } else if (emailVal) {
            senderContactInfo = `<p style="margin: 6px 0;"><strong>Email:</strong> ${emailVal}</p>`;
        }

        let htmlContent = ONLINE_RECORD_SUBMIT_EMAIL_TEMPLATE
            .replace(/{senderName}/g, senderName)
            .replace(/{senderPosition}/g, recordData.positionName || "Cán bộ")
            .replace(/{senderDepartment}/g, recordData.departmentName || "Đơn vị")
            .replace(/{senderContactInfo}/g, senderContactInfo)
            .replace(/{categoryName}/g, recordData.categoryName || recordData.category?.name || "Hồ sơ trực tuyến")
            .replace(/{recordTitle}/g, recordData.title || "--")
            .replace(/{createdAt}/g, createdAtStr)
            .replace(/{recipientsList}/g, recipientsList)
            .replace(/{notes}/g, recordData.note || "Không có ghi chú thêm.")
            .replace(/{filesCount}/g, files.length)
            .replace(/{linksHtml}/g, linksHtml);

        const recipientEmails = Array.from(new Set(bccList));
        const mailOptions = {
            from: sender,
            to: recipientEmails.join(', '),
            subject: subject,
            html: applySystemBranding(htmlContent, brandName),
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`[Email] Đã gửi thông báo nộp hồ sơ trực tuyến "${recordData.title}" tới:`, recipientEmails.join(', '), info?.messageId);
        return true;
    } catch (error) {
        console.error("Error in sendOnlineRecordSubmitEmail:", error);
    }
};

const sendOnlineRecordStatusEmail = async (uniqueUsers, recordData, status, opinion = "", reviewerName = "Người duyệt", reviewerRole = "Quản lý hệ thống") => {
    try {
        if (!uniqueUsers || uniqueUsers.length === 0 || !recordData) return;
        const allowedUsers = uniqueUsers.filter(u => {
            if (!u.emailNotifications) return true;
            if (u.emailNotifications.onlineRecordStatus !== undefined) {
                return u.emailNotifications.onlineRecordStatus !== false;
            }
            if (u.emailNotifications.onlineRecord !== undefined) {
                return u.emailNotifications.onlineRecord !== false;
            }
            return true;
        });
        const bccList = allowedUsers.map(u => u.email).filter(e => !!e);
        if (bccList.length === 0) return;

        const { transporter, sender, brandName } = await getTransporterAndSender();

        let actionName = "Cập nhật xử lý hồ sơ";
        let statusLabel = '<span style="color: #0284c7; font-weight: bold;">Đang tiếp nhận xử lý</span>';
        let headerColorStart = "#0284c7";
        let headerColorEnd = "#38bdf8";
        let headerBorderColor = "#0284c7";

        if (status === "APPROVED") {
            actionName = "Hồ sơ đã được phê duyệt";
            statusLabel = '<span style="color: #059669; font-weight: bold;">✓ Đã phê duyệt</span>';
            headerColorStart = "#059669";
            headerColorEnd = "#10b981";
            headerBorderColor = "#059669";
        } else if (status === "REJECTED") {
            actionName = "Hồ sơ bị từ chối / Cần bổ sung";
            statusLabel = '<span style="color: #dc2626; font-weight: bold;">✕ Từ chối / Yêu cầu bổ sung</span>';
            headerColorStart = "#dc2626";
            headerColorEnd = "#f87171";
            headerBorderColor = "#dc2626";
        } else if (status === "PROCESSING") {
            actionName = "Hồ sơ đang được xử lý";
            statusLabel = '<span style="color: #2563eb; font-weight: bold;">Đang tiếp nhận xử lý</span>';
            headerColorStart = "#1d4ed8";
            headerColorEnd = "#3b82f6";
            headerBorderColor = "#1d4ed8";
        }

        const actionTime = formatVietnamDateTime();
        const subject = `[${brandName} - Hồ sơ trực tuyến: ${actionName}] ${recordData.title || "Hồ sơ"}`;

        let htmlContent = ONLINE_RECORD_STATUS_EMAIL_TEMPLATE
            .replace(/{actionName}/g, actionName)
            .replace(/{headerColorStart}/g, headerColorStart)
            .replace(/{headerColorEnd}/g, headerColorEnd)
            .replace(/{headerBorderColor}/g, headerBorderColor)
            .replace(/{recordTitle}/g, recordData.title || "--")
            .replace(/{categoryName}/g, recordData.categoryName || recordData.category?.name || "Hồ sơ trực tuyến")
            .replace(/{senderName}/g, recordData.fullName || recordData.sender?.name || "--")
            .replace(/{senderDepartment}/g, recordData.departmentName || recordData.sender?.department?.departmentName || "--")
            .replace(/{statusLabel}/g, statusLabel)
            .replace(/{reviewerName}/g, reviewerName)
            .replace(/{reviewerRole}/g, reviewerRole)
            .replace(/{actionTime}/g, actionTime)
            .replace(/{opinion}/g, opinion || "Không có ý kiến bổ sung.");

        const recipientEmails = Array.from(new Set(bccList));
        const mailOptions = {
            from: sender,
            to: recipientEmails.join(', '),
            subject: subject,
            html: applySystemBranding(htmlContent, brandName),
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`[Email] Đã gửi thông báo trạng thái hồ sơ trực tuyến "${recordData.title}" (${actionName}) tới:`, recipientEmails.join(', '), info?.messageId);
        return true;
    } catch (error) {
        console.error("Error in sendOnlineRecordStatusEmail:", error);
    }
};

/**
 * Gửi email thông báo nhắc nhở tiến độ / hạn xử lý nhiệm vụ Kế hoạch quý
 * @param {Array<string>} recipientEmails Danh sách email người nhận (Cấp trưởng, Ban Giám hiệu)
 * @param {Object} planData Dữ liệu kế hoạch { title, quarter, academicYear }
 * @param {Object} itemData Dữ liệu nhiệm vụ { taskContent, expectedOutcome, startDate, expectedDeadline, actualCompletedDate, status, autoRemark, manualRemark, assignedDepartments, coordinatingDepartments, bghInCharge }
 * @param {string} reminderType 'near_deadline' (sắp đến hạn), 'due_today' (đến hạn hôm nay), 'overdue' (quá hạn)
 */
const sendQuarterlyPlanReminderEmail = async (recipientEmails, planData, itemData, reminderType) => {
    try {
        if (!recipientEmails || recipientEmails.length === 0) return;
        const bccList = Array.from(new Set(Array.isArray(recipientEmails) ? recipientEmails : [recipientEmails]))
            .filter(e => !!e && typeof e === 'string' && e.includes('@'));
        if (bccList.length === 0) return;

        const { transporter, sender, brandName } = await getTransporterAndSender();

        let headerTitle = "THÔNG BÁO TIẾN ĐỘ NHIỆM VỤ";
        let reminderBadge = "Nhắc nhở công việc";
        let headerColorStart = "#2563eb";
        let headerColorEnd = "#3b82f6";
        let headerBorderColor = "#2563eb";
        let alertBg = "#eff6ff";
        let alertBorder = "#bfdbfe";
        let alertColor = "#1d4ed8";
        let deadlineStatusStr = "Sắp đến hạn hoàn thành";

        if (reminderType === "near_deadline") {
            headerTitle = "NHIỆM VỤ SẮP ĐẾN HẠN HOÀN THÀNH";
            reminderBadge = "Sắp đến hạn";
            headerColorStart = "#f59e0b";
            headerColorEnd = "#fbbf24";
            headerBorderColor = "#d97706";
            alertBg = "#fffbeb";
            alertBorder = "#fde68a";
            alertColor = "#b45309";
            deadlineStatusStr = "Sắp đến hạn hoàn thành (còn trong vòng 3 ngày tới)";
        } else if (reminderType === "due_today") {
            headerTitle = "NHIỆM VỤ ĐẾN HẠN HÔM NAY";
            reminderBadge = "Đến hạn hôm nay";
            headerColorStart = "#ea580c";
            headerColorEnd = "#f97316";
            headerBorderColor = "#c2410c";
            alertBg = "#fff7ed";
            alertBorder = "#fed7aa";
            alertColor = "#c2410c";
            deadlineStatusStr = "ĐẾN HẠN HOÀN THÀNH TRONG HÔM NAY";
        } else if (reminderType === "overdue") {
            headerTitle = "NHIỆM VỤ ĐÃ QUÁ HẠN DỰ KIẾN";
            reminderBadge = "Quá hạn hoàn thành";
            headerColorStart = "#dc2626";
            headerColorEnd = "#ef4444";
            headerBorderColor = "#b91c1c";
            alertBg = "#fef2f2";
            alertBorder = "#fecaca";
            alertColor = "#b91c1c";
            deadlineStatusStr = "ĐÃ QUÁ HẠN DỰ KIẾN";
        }

        const planTitle = planData?.title 
            ? `${planData.title} (Quý ${planData.quarter} - Năm học ${planData.academicYear || ''})`
            : "Kế hoạch công tác trọng tâm theo Quý";

        const startStr = itemData.startDate ? formatVietnamDate(itemData.startDate) : "";
        const endStr = itemData.expectedDeadline ? formatVietnamDate(itemData.expectedDeadline) : "Chưa rõ";
        const dateRangeStr = startStr ? `${startStr} đến ${endStr}` : endStr;

        let assignedStr = "Chưa phân công";
        if (Array.isArray(itemData.assignedDepartments) && itemData.assignedDepartments.length > 0) {
            assignedStr = itemData.assignedDepartments.map(d => d.departmentName || d).join(', ');
        }

        let coordStr = "Không có";
        if (Array.isArray(itemData.coordinatingDepartments) && itemData.coordinatingDepartments.length > 0) {
            coordStr = itemData.coordinatingDepartments.map(d => d.departmentName || d).join(', ');
        }

        let bghStr = "Ban Giám hiệu";
        if (Array.isArray(itemData.bghInCharge) && itemData.bghInCharge.length > 0) {
            bghStr = itemData.bghInCharge.map(u => u.name || u).join(', ');
        }

        let taskStatusStr = "Đang thực hiện";
        if (itemData.status === "NOT_STARTED") taskStatusStr = "Chưa làm";
        else if (itemData.status === "COMPLETED") taskStatusStr = "Đã hoàn thành";
        else if (itemData.status === "PAUSED") taskStatusStr = `Tạm dừng ${itemData.pauseReason ? `(${itemData.pauseReason})` : ''}`;
        else if (itemData.status === "OVERDUE") taskStatusStr = "Quá hạn";

        let noteBlockHtml = "";
        if (itemData.manualRemark && itemData.manualRemark.trim()) {
            noteBlockHtml = `
            <div style="margin-top: 10px; padding: 8px 12px; background-color: #f8fafc; border-left: 3px solid #64748b; font-size: 13px; color: #475569;">
                <strong>Ghi chú từ BGH / Quản lý:</strong> ${itemData.manualRemark}
            </div>`;
        }

        const subject = `[${brandName} - Kế hoạch quý] [${reminderBadge}] ${itemData.taskContent}`;

        let htmlContent = QUARTERLY_PLAN_REMINDER_EMAIL_TEMPLATE
            .replace(/{headerTitle}/g, headerTitle)
            .replace(/{reminderBadge}/g, reminderBadge)
            .replace(/{headerColorStart}/g, headerColorStart)
            .replace(/{headerColorEnd}/g, headerColorEnd)
            .replace(/{headerBorderColor}/g, headerBorderColor)
            .replace(/{planTitle}/g, planTitle)
            .replace(/{groupName}/g, itemData.groupName || "Nhiệm vụ trọng tâm")
            .replace(/{taskContent}/g, itemData.taskContent || "--")
            .replace(/{expectedOutcome}/g, itemData.expectedOutcome || "Theo kế hoạch ban hành")
            .replace(/{assignedDepartments}/g, assignedStr)
            .replace(/{coordinatingDepartments}/g, coordStr)
            .replace(/{bghInCharge}/g, bghStr)
            .replace(/{dateRangeStr}/g, dateRangeStr)
            .replace(/{deadlineStatusStr}/g, deadlineStatusStr)
            .replace(/{alertBg}/g, alertBg)
            .replace(/{alertBorder}/g, alertBorder)
            .replace(/{alertColor}/g, alertColor)
            .replace(/{taskStatusStr}/g, taskStatusStr)
            .replace(/{autoRemark}/g, itemData.autoRemark || deadlineStatusStr)
            .replace(/{noteBlockHtml}/g, noteBlockHtml);

        const mailOptions = {
            from: sender,
            to: bccList.join(', '),
            subject: subject,
            html: applySystemBranding(htmlContent, brandName),
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`[Email] Đã gửi nhắc nhở Kế hoạch quý "${itemData.taskContent.substring(0, 40)}..." (${reminderType}) tới:`, bccList.join(', '), info?.messageId);
        return true;
    } catch (error) {
        console.error("Error in sendQuarterlyPlanReminderEmail:", error);
    }
};

/**
 * Gửi email nhắc nhở lịch họp cho đại biểu tham dự
 * @param {Array<string>} recipientEmails Danh sách email nhận
 * @param {Object} meeting Dữ liệu cuộc họp
 * @param {string} reminderType '1_day' | '30_min' | 'start'
 */
const sendMeetingReminderEmail = async (recipientEmails, meeting, reminderType = "30_min") => {
    try {
        const validEmails = recipientEmails.filter((e) => typeof e === "string" && e.includes("@"));
        if (validEmails.length === 0) return false;

        const { transporter, sender } = await getTransporterAndSender();
        const brandName = await getSystemBrandName();

        let headerTitle = "THÔNG BÁO CUỘC HỌP";
        let headerColorStart = "#2563eb";
        let headerColorEnd = "#3b82f6";
        let headerBorderColor = "#2563eb";
        let alertBg = "#eff6ff";
        let alertBorder = "#bfdbfe";
        let alertColor = "#1e40af";
        let reminderNote = "Cuộc họp sắp diễn ra. Quý Đại biểu vui lòng lưu ý thời gian.";
        let subjectPrefix = "[THÔNG BÁO]";

        if (reminderType === "1_day") {
            headerTitle = "NHẮC HỌP: TRƯỚC 1 NGÀY";
            headerColorStart = "#0284c7";
            headerColorEnd = "#38bdf8";
            headerBorderColor = "#0284c7";
            alertBg = "#f0f9ff";
            alertBorder = "#bae6fd";
            alertColor = "#0369a1";
            reminderNote = "Cuộc họp sẽ bắt đầu sau 1 ngày nữa (ngày mai). Quý Đại biểu vui lòng sắp xếp thời gian.";
            subjectPrefix = "[NHẮC HỌP TRƯỚC 1 NGÀY]";
        } else if (reminderType === "30_min") {
            headerTitle = "NHẮC HỌP: CÒN 30 PHÚT";
            headerColorStart = "#ea580c";
            headerColorEnd = "#f97316";
            headerBorderColor = "#ea580c";
            alertBg = "#fff7ed";
            alertBorder = "#fed7aa";
            alertColor = "#c2410c";
            reminderNote = "Chỉ còn 30 phút nữa cuộc họp sẽ chính thức bắt đầu. Quý Đại biểu vui lòng chuẩn bị vào phòng họp.";
            subjectPrefix = "[SẮP BẮT ĐẦU - 30 PHÚT]";
        } else if (reminderType === "start") {
            headerTitle = "PHIÊN HỌP ĐANG BẮT ĐẦU";
            headerColorStart = "#16a34a";
            headerColorEnd = "#22c55e";
            headerBorderColor = "#16a34a";
            alertBg = "#f0fdf4";
            alertBorder = "#bbf7d0";
            alertColor = "#15803d";
            reminderNote = "Cuộc họp đang chính thức bắt đầu! Quý Đại biểu vui lòng vào phòng họp và điểm danh.";
            subjectPrefix = "[BẮT ĐẦU PHIÊN HỌP]";
        }

        const startTimeStr = new Date(meeting.startTime).toLocaleString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        });
        const endTimeStr = new Date(meeting.endTime).toLocaleString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        });
        const timeRangeStr = `${startTimeStr} - ${endTimeStr}`;

        const roomTypeStr =
            meeting.roomType === "ONLINE"
                ? "Trực tuyến 100%"
                : meeting.roomType === "HYBRID"
                ? "Kết hợp Trực tiếp & Trực tuyến"
                : "Họp trực tiếp tại phòng";

        const secretaryName = meeting.secretary?.name || meeting.secretaryName || "";
        const secretaryRowHtml = secretaryName
            ? `<p style="margin: 6px 0;"><strong>Thư ký phiên họp:</strong> <span style="color: #475569;">${secretaryName}</span></p>`
            : "";

        const onlineUrlHtml = meeting.onlineMeetingUrl
            ? `<p style="margin: 6px 0;"><strong>Link họp trực tuyến:</strong> <a href="${meeting.onlineMeetingUrl}" target="_blank" style="color: #2563eb; font-weight: 600;">${meeting.onlineMeetingUrl}</a></p>`
            : "";

        let agendasHtml = "";
        if (meeting.agendas && meeting.agendas.length > 0) {
            const listItems = meeting.agendas
                .map(
                    (ag, i) =>
                        `<li style="margin-bottom: 6px;"><strong>${i + 1}. ${ag.title}</strong> ${
                            ag.presenter ? `(${ag.presenter})` : ""
                        } - <em>${ag.durationMinutes || 15} phút</em></li>`
                )
                .join("");
            agendasHtml = `
            <div style="margin-top: 14px; border-top: 1px dashed #cbd5e1; padding-top: 10px;">
              <p style="margin: 4px 0; font-weight: bold; color: #334155;">Chương trình cuộc họp:</p>
              <ol style="margin: 6px 0; padding-left: 20px; font-size: 13px; color: #475569;">
                ${listItems}
              </ol>
            </div>
            `;
        }

        const meetingUrl = `https://qlvb.namsaigon.edu.vn/meetings/${meeting._id}`;

        let htmlContent = MEETING_REMINDER_EMAIL_TEMPLATE
            .replace(/{headerTitle}/g, headerTitle)
            .replace(/{headerColorStart}/g, headerColorStart)
            .replace(/{headerColorEnd}/g, headerColorEnd)
            .replace(/{headerBorderColor}/g, headerBorderColor)
            .replace(/{alertBg}/g, alertBg)
            .replace(/{alertBorder}/g, alertBorder)
            .replace(/{alertColor}/g, alertColor)
            .replace(/{reminderNote}/g, reminderNote)
            .replace(/{meetingTitle}/g, meeting.title || "Cuộc họp")
            .replace(/{meetingCode}/g, meeting.meetingCode || "PH")
            .replace(/{timeRangeStr}/g, timeRangeStr)
            .replace(/{location}/g, meeting.location || "Phòng họp số")
            .replace(/{roomTypeStr}/g, roomTypeStr)
            .replace(/{hostName}/g, meeting.host?.name || meeting.hostName || "Chủ tọa")
            .replace(/{secretaryRowHtml}/g, secretaryRowHtml)
            .replace(/{onlineUrlHtml}/g, onlineUrlHtml)
            .replace(/{pinCode}/g, meeting.pinCode || "—")
            .replace(/{agendasHtml}/g, agendasHtml)
            .replace(/{meetingUrl}/g, meetingUrl);

        const subject = `${subjectPrefix} ${meeting.title} - ${startTimeStr}`;

        const mailOptions = {
            from: sender,
            to: validEmails.join(", "),
            subject: subject,
            html: applySystemBranding(htmlContent, brandName),
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`[Email] Đã gửi nhắc lịch họp "${meeting.title}" (${reminderType}) tới ${validEmails.length} email:`, info?.messageId);
        return true;
    } catch (error) {
        console.error("Error in sendMeetingReminderEmail:", error);
        return false;
    }
};

/**
 * Gửi email thông báo cho BGH khi có người dùng đăng ký lịch công tác mới
 */
const sendWorkScheduleRegistrationEmail = async (schedule, approverUser, creatorUser) => {
    try {
        if (!approverUser || !approverUser.email) return false;

        const { transporter, sender, brandName } = await getTransporterAndSender();

        const startDateStr = formatVietnamDate(schedule.startDate);
        const endDateStr = formatVietnamDate(schedule.endDate);
        const dateStr = startDateStr === endDateStr ? startDateStr : `${startDateStr} - ${endDateStr}`;
        const timeDisplay = schedule.startTime && schedule.endTime
            ? `${schedule.startTime} - ${schedule.endTime}, ${dateStr}`
            : schedule.startTime
            ? `Từ ${schedule.startTime}, ${dateStr}`
            : dateStr;

        const notesHtml = schedule.notes
            ? `<p style="margin: 6px 0;"><strong>Ghi chú:</strong> <span style="color: #64748b; font-style: italic;">${schedule.notes}</span></p>`
            : "";

        // Lấy đầy đủ Chức vụ và Đơn vị công tác
        const creatorPos = creatorUser?.position?.positionName || creatorUser?.position?.name || creatorUser?.positionName || "";
        const creatorDept = creatorUser?.department?.departmentName || creatorUser?.department?.name || creatorUser?.departmentName || "";
        
        let creatorAffiliation = "";
        if (creatorPos && creatorDept) {
            creatorAffiliation = `${creatorPos} - ${creatorDept}`;
        } else if (creatorDept) {
            creatorAffiliation = creatorDept;
        } else if (creatorPos) {
            creatorAffiliation = `${creatorPos} - Trường Cao đẳng Bách khoa Nam Sài Gòn`;
        } else {
            creatorAffiliation = "Trường Cao đẳng Bách khoa Nam Sài Gòn";
        }

        const createdAtStr = formatVietnamDateTime(schedule.createdAt || Date.now());
        const creatorDisplayName = creatorUser?.name || creatorUser?.fullName || creatorUser?.userName || "Cán bộ / Giảng viên";
        const approverDisplayName = approverUser?.name || approverUser?.fullName || approverUser?.userName || "Thầy/Cô Ban Giám Hiệu";

        let htmlContent = WORK_SCHEDULE_REGISTRATION_EMAIL_TEMPLATE
            .replace(/{approverName}/g, approverDisplayName)
            .replace(/{timeDisplay}/g, timeDisplay)
            .replace(/{content}/g, schedule.content || "Chưa có nội dung")
            .replace(/{host}/g, schedule.host || "Ban Giám Hiệu")
            .replace(/{participants}/g, schedule.participants || "Không có thông tin")
            .replace(/{location}/g, schedule.location || "Chưa xác định")
            .replace(/{notesHtml}/g, notesHtml)
            .replace(/{creatorName}/g, creatorDisplayName)
            .replace(/{creatorDepartment}/g, creatorAffiliation)
            .replace(/{createdAtStr}/g, createdAtStr);

        const subject = `[${brandName} - Đăng ký lịch công tác] ${schedule.content ? schedule.content.substring(0, 60) : 'Lịch mới'} - ${dateStr}`;

        const mailOptions = {
            from: sender,
            to: approverUser.email,
            subject: subject,
            html: applySystemBranding(htmlContent, brandName),
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`[Email] Đã gửi thông báo đăng ký lịch công tác tới ${approverUser.email}:`, info?.messageId);
        return true;
    } catch (error) {
        console.error("Error in sendWorkScheduleRegistrationEmail:", error);
        return false;
    }
};

/**
 * Gửi email thông báo cho người đăng ký lịch công tác khi BGH phê duyệt hoặc từ chối
 */
const sendWorkScheduleStatusEmail = async (schedule, creatorUser, approverUser, status, rejectionReason = "") => {
    try {
        if (!creatorUser || !creatorUser.email) return false;

        const { transporter, sender, brandName } = await getTransporterAndSender();

        const isApproved = status === "APPROVED";
        const headerTitle = isApproved ? "Lịch Công Tác Đã Được Phê Duyệt" : "Lịch Công Tác Chưa Được Phê Duyệt";
        const headerColorStart = isApproved ? "#10b981" : "#ef4444";
        const headerColorEnd = isApproved ? "#047857" : "#b91c1c";
        const headerBorderColor = isApproved ? "#059669" : "#dc2626";

        const statusBadgeHtml = isApproved
            ? `<span style="background-color: #d1fae5; color: #065f46; font-weight: bold; padding: 3px 10px; border-radius: 4px; border: 1px solid #a7f3d0; font-size: 13px;">✓ Đã phê duyệt</span>`
            : `<span style="background-color: #fee2e2; color: #991b1b; font-weight: bold; padding: 3px 10px; border-radius: 4px; border: 1px solid #fecaca; font-size: 13px;">✕ Chưa được duyệt (Từ chối)</span>`;

        const rejectionReasonHtml = (!isApproved && rejectionReason)
            ? `<div style="margin: 12px 0; padding: 12px; background-color: #fff1f2; border: 1px solid #fecdd3; border-radius: 6px;">
                 <p style="margin: 0; color: #be123c; font-weight: bold; font-size: 13px;">Lý do từ chối / Ý kiến chỉ đạo:</p>
                 <p style="margin: 6px 0 0 0; color: #9f1239; font-size: 13px;">${rejectionReason}</p>
               </div>`
            : "";

        const startDateStr = formatVietnamDate(schedule.startDate);
        const endDateStr = formatVietnamDate(schedule.endDate);
        const dateStr = startDateStr === endDateStr ? startDateStr : `${startDateStr} - ${endDateStr}`;
        const timeDisplay = schedule.startTime && schedule.endTime
            ? `${schedule.startTime} - ${schedule.endTime}, ${dateStr}`
            : schedule.startTime
            ? `Từ ${schedule.startTime}, ${dateStr}`
            : dateStr;

        const processedAtStr = formatVietnamDateTime(schedule.approvedAt || Date.now());

        let htmlContent = WORK_SCHEDULE_STATUS_EMAIL_TEMPLATE
            .replace(/{headerTitle}/g, headerTitle)
            .replace(/{headerColorStart}/g, headerColorStart)
            .replace(/{headerColorEnd}/g, headerColorEnd)
            .replace(/{headerBorderColor}/g, headerBorderColor)
            .replace(/{creatorName}/g, creatorUser?.name || creatorUser?.fullName || creatorUser?.userName || "Thầy/Cô")
            .replace(/{statusBadgeHtml}/g, statusBadgeHtml)
            .replace(/{timeDisplay}/g, timeDisplay)
            .replace(/{content}/g, schedule.content || "Chưa có nội dung")
            .replace(/{host}/g, schedule.host || "Ban Giám Hiệu")
            .replace(/{location}/g, schedule.location || "Chưa xác định")
            .replace(/{rejectionReasonHtml}/g, rejectionReasonHtml)
            .replace(/{approverName}/g, approverUser?.name || "Ban Giám Hiệu")
            .replace(/{processedAtStr}/g, processedAtStr);

        const statusPrefix = isApproved ? "Đã phê duyệt" : "Từ chối duyệt";
        const subject = `[${brandName} - ${statusPrefix}] Lịch công tác: ${schedule.content ? schedule.content.substring(0, 50) : ''} (${dateStr})`;

        const mailOptions = {
            from: sender,
            to: creatorUser.email,
            subject: subject,
            html: applySystemBranding(htmlContent, brandName),
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`[Email] Đã gửi thông báo kết quả duyệt lịch tới ${creatorUser.email}:`, info?.messageId);
        return true;
    } catch (error) {
        console.error("Error in sendWorkScheduleStatusEmail:", error);
        return false;
    }
};

/**
 * 1. Gửi email thông báo đơn đăng ký xe công tác mới tới BGH
 */
const sendVehicleBookingNotificationEmail = async (booking, creatorUser, approverUser) => {
    try {
        if (!approverUser || !approverUser.email) return false;
        const { transporter, sender, brandName } = await getTransporterAndSender();

        const depDateStr = booking.departureDate ? formatVietnamDate(booking.departureDate) : formatVietnamDate(booking.departureTime);
        const retDateStr = booking.returnDate ? formatVietnamDate(booking.returnDate) : formatVietnamDate(booking.estimatedReturnTime);
        const depHourStr = booking.departureHour ? `${booking.departureHour}, ` : "";
        const vehicleTypeStr = booking.vehicleType === "SCHOOL_VEHICLE" ? "Xe trường" : "Xe công nghệ";

        const subject = `[${brandName}] Yêu cầu đăng ký xe công tác mới: ${booking.purpose}`;
        const htmlContent = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 650px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
            <div style="background: linear-gradient(135deg, #1e40af 0%, #0369a1 100%); padding: 22px 24px; text-align: center; color: white;">
                <h2 style="margin: 0; font-size: 21px; letter-spacing: 0.5px;">ĐƠN ĐĂNG KÝ PHƯƠNG TIỆN CÔNG TÁC MỚI</h2>
                <p style="margin: 6px 0 0; opacity: 0.95; font-size: 13.5px;">Mã phiếu: <strong>${booking.bookingCode || 'Chờ cấp mã'}</strong></p>
            </div>
            <div style="padding: 24px; background-color: #ffffff;">
                <p style="font-size: 15px;">Kính gửi <strong>${approverUser?.name || approverUser?.fullName || approverUser?.userName || 'Quý Thầy/Cô'}</strong> (Ban Giám Hiệu),</p>
                <p style="font-size: 14px; color: #475569;">Hệ thống vừa tiếp nhận yêu cầu đăng ký phương tiện đi công tác từ <strong>${creatorUser?.name || creatorUser?.fullName || creatorUser?.userName || booking.requesterName || 'Người đăng ký'}</strong> thuộc <strong>${booking.departmentName || 'Trường Cao đẳng Bách khoa Nam Sài Gòn'}</strong>. Kính trình Thầy/Cô xem xét và phê duyệt theo quy định:</p>
                
                <table style="width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 14px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                    <tr>
                        <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: bold; width: 35%; color: #64748b;">Mục đích công tác:</td>
                        <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #0f172a;">${booking.purpose}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #64748b;">Lộ trình di chuyển:</td>
                        <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0;">${booking.route}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #64748b;">Thời gian xuất phát:</td>
                        <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #0284c7; font-weight: bold;">${depHourStr}ngày ${depDateStr}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #64748b;">Thời gian về (dự kiến):</td>
                        <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0;">ngày ${retDateStr}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #64748b;">Số lượng người đi:</td>
                        <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0;">${booking.passengersCount || 1} người ${booking.passengerNames ? `(${booking.passengerNames})` : ''}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #64748b;">Loại phương tiện:</td>
                        <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0;">${vehicleTypeStr} (Yêu cầu xe ${booking.requiredSeats || 7} chỗ)</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px 14px; font-weight: bold; color: #64748b;">Người đăng ký liên hệ:</td>
                        <td style="padding: 10px 14px;"><strong>${creatorUser?.name || creatorUser?.fullName || creatorUser?.userName || booking.requesterName}</strong> - SĐT: <span style="color: #0284c7; font-weight: bold;">${booking.contactPhone}</span></td>
                    </tr>
                </table>

                <div style="text-align: center; margin-top: 25px;">
                    <a href="https://qlvb.namsaigon.edu.vn/vehicles" style="background-color: #0284c7; color: white; padding: 12px 26px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 2px 4px rgba(2,132,199,0.3);">Xem và Phê duyệt trên hệ thống</a>
                </div>
            </div>
            <div style="background-color: #f1f5f9; padding: 14px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
                Email được gửi tự động từ Hệ thống Quản lý Văn bản và Điều hành - Trường Cao đẳng Bách khoa Nam Sài Gòn.
            </div>
        </div>
        `;

        const mailOptions = {
            from: sender,
            to: approverUser.email,
            subject: subject,
            html: applySystemBranding(htmlContent, brandName),
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`[Email] Đã gửi thông báo đăng ký xe tới BGH ${approverUser.email}:`, info?.messageId);
        return true;
    } catch (error) {
        console.error("Error in sendVehicleBookingNotificationEmail:", error);
        return false;
    }
};

/**
 * 2. Gửi email kết quả duyệt đơn đăng ký xe cho Người Đăng Ký và Lãnh Đạo Phân Bổ Xe
 */
const sendVehicleBookingStatusEmail = async (booking, creatorUser, approverUser, status, rejectionReason = "", assignedDispatcher = null) => {
    try {
        const { transporter, sender, brandName } = await getTransporterAndSender();
        const isApproved = status === "APPROVED";
        const headerTitle = isApproved ? "ĐƠN ĐĂNG KÝ XE ĐÃ ĐƯỢC PHÊ DUYỆT" : "ĐƠN ĐĂNG KÝ XE KHÔNG ĐƯỢC PHÊ DUYỆT";
        const headerBg = isApproved ? "linear-gradient(135deg, #059669 0%, #047857 100%)" : "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)";

        const depDateStr = booking.departureDate ? formatVietnamDate(booking.departureDate) : formatVietnamDate(booking.departureTime);
        const retDateStr = booking.returnDate ? formatVietnamDate(booking.returnDate) : formatVietnamDate(booking.estimatedReturnTime);
        const depHourStr = booking.departureHour ? `${booking.departureHour}, ` : "";

        // A. Gửi cho Người Đăng Ký
        if (creatorUser && creatorUser.email) {
            const subject = `[${brandName}] Kết quả phê duyệt đơn xe ${booking.bookingCode}: ${isApproved ? 'ĐÃ DUYỆT' : 'TỪ CHỐI'}`;
            const htmlContent = `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 650px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 10px; overflow: hidden;">
                <div style="background: ${headerBg}; padding: 22px 24px; text-align: center; color: white;">
                    <h2 style="margin: 0; font-size: 21px;">${headerTitle}</h2>
                    <p style="margin: 6px 0 0; opacity: 0.95; font-size: 13.5px;">Mã phiếu: <strong>${booking.bookingCode}</strong></p>
                </div>
                <div style="padding: 24px; background-color: #ffffff;">
                    <p style="font-size: 15px;">Kính gửi <strong>${creatorUser?.name || creatorUser?.fullName || creatorUser?.userName || booking.requesterName || 'Quý Thầy/Cô'}</strong>,</p>
                    <p style="font-size: 14px; color: #475569;">Đơn đăng ký xe công tác của bạn đã được <strong>${approverUser ? (approverUser.name || approverUser.fullName || approverUser.userName) : 'Ban Giám Hiệu'}</strong> xem xét và đưa ra quyết định:</p>
                    
                    <div style="background-color: ${isApproved ? '#f0fdf4' : '#fef2f2'}; border-left: 4px solid ${isApproved ? '#10b981' : '#ef4444'}; padding: 14px 18px; margin: 18px 0; border-radius: 6px;">
                        <p style="margin: 0; font-weight: bold; font-size: 15px; color: ${isApproved ? '#15803d' : '#b91c1c'};">
                            Trạng thái: ${isApproved ? 'ĐỒNG Ý PHÊ DUYỆT' : 'TỪ CHỐI DUYỆT'}
                        </p>
                        ${isApproved && booking.vehicleType === "SCHOOL_VEHICLE" ? `<p style="margin: 6px 0 0; font-size: 13.5px; color: #166534;">Ban Giám Hiệu đã chuyển tiếp nhiệm vụ cho bộ phận quản lý xe để bố trí tài xế và phương tiện.</p>` : ''}
                        ${isApproved && booking.vehicleType === "RIDE_HAILING" ? `<p style="margin: 6px 0 0; font-size: 13.5px; color: #166534;">Phương tiện là <strong>Xe công nghệ</strong>: Đơn vị chủ động đặt xe và thực hiện theo đúng lộ trình đã được duyệt.</p>` : ''}
                        ${booking.approvalNotes ? `<p style="margin: 6px 0 0; font-size: 13.5px; color: #1e3a8a;"><strong>Ý kiến BGH:</strong> <em>${booking.approvalNotes}</em></p>` : ''}
                        ${!isApproved && rejectionReason ? `<p style="margin: 6px 0 0; font-size: 13.5px; color: #991b1b;"><strong>Lý do từ chối:</strong> <em>${rejectionReason}</em></p>` : ''}
                    </div>

                    <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; background-color: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0;">
                        <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: bold; width: 35%; color: #64748b;">Nội dung công tác:</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">${booking.purpose}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #64748b;">Lộ trình:</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0;">${booking.route}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 14px; font-weight: bold; color: #64748b;">Thời gian xuất phát:</td>
                            <td style="padding: 10px 14px; color: #0284c7; font-weight: bold;">${depHourStr}ngày ${depDateStr}</td>
                        </tr>
                    </table>

                    <div style="text-align: center; margin-top: 24px;">
                        <a href="https://qlvb.namsaigon.edu.vn/vehicles" style="background-color: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Kiểm tra tiến độ điều xe</a>
                    </div>
                </div>
                <div style="background-color: #f1f5f9; padding: 14px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
                    Email được gửi tự động từ Hệ thống Quản lý Văn bản và Điều hành - Trường Cao đẳng Bách khoa Nam Sài Gòn.
                </div>
            </div>
            `;

            await transporter.sendMail({
                from: sender,
                to: creatorUser.email,
                subject: subject,
                html: applySystemBranding(htmlContent, brandName),
            });
            console.log(`[Email] Đã gửi thông báo kết quả duyệt xe tới người đăng ký ${creatorUser.email}`);
        }

        // B. Nếu BGH duyệt và có chỉ định Lãnh Đạo Phân Bổ Xe (đối với xe trường): Gửi email cho Lãnh Đạo Phân Bổ Xe
        if (isApproved && booking.vehicleType === "SCHOOL_VEHICLE" && assignedDispatcher && assignedDispatcher.email) {
            const subjectDispatcher = `[${brandName}] Nhiệm vụ phân bổ phương tiện & tài xế: Mã ${booking.bookingCode}`;
            const htmlDispatcher = `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 650px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 10px; overflow: hidden;">
                <div style="background: linear-gradient(135deg, #4338ca 0%, #6366f1 100%); padding: 22px 24px; text-align: center; color: white;">
                    <h2 style="margin: 0; font-size: 21px;">GIAO NHIỆM VỤ ĐIỀU PHỐI XE CÔNG TÁC</h2>
                    <p style="margin: 6px 0 0; opacity: 0.95; font-size: 13.5px;">Mã phiếu: <strong>${booking.bookingCode}</strong></p>
                </div>
                <div style="padding: 24px; background-color: #ffffff;">
                    <p style="font-size: 15px;">Kính gửi <strong>${assignedDispatcher?.name || assignedDispatcher?.fullName || assignedDispatcher?.userName || 'Thầy/Cô'}</strong>,</p>
                    <p style="font-size: 14px; color: #475569;">Ban Giám Hiệu vừa phê duyệt đơn đăng ký xe công tác và <strong>giao nhiệm vụ phân bổ phương tiện, tài xế</strong> cho Thầy/Cô. Thông tin chi tiết chuyến đi:</p>

                    <table style="width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 14px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                        <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: bold; width: 35%; color: #64748b;">Mục đích công tác:</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #0f172a;">${booking.purpose}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #64748b;">Lộ trình di chuyển:</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0;">${booking.route}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #64748b;">Thời gian xuất phát:</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #4338ca; font-weight: bold;">${depHourStr}ngày ${depDateStr}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #64748b;">Thời gian về (dự kiến):</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0;">ngày ${retDateStr}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #64748b;">Người đăng ký:</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0;"><strong>${creatorUser?.name || creatorUser?.fullName || creatorUser?.userName || booking.requesterName}</strong> (${booking.departmentName || 'Trường Cao đẳng Bách khoa Nam Sài Gòn'}) - SĐT: ${booking.contactPhone}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #64748b;">Số lượng người đi:</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0;">${booking.passengersCount || 1} người (Cần xe ${booking.requiredSeats || 7} chỗ)</td>
                        </tr>
                        ${booking.approvalNotes ? `
                        <tr>
                            <td style="padding: 10px 14px; font-weight: bold; color: #64748b;">Ý kiến chỉ đạo BGH:</td>
                            <td style="padding: 10px 14px; color: #4338ca; font-weight: bold;">${booking.approvalNotes}</td>
                        </tr>` : ''}
                    </table>

                    <div style="text-align: center; margin-top: 25px;">
                        <a href="https://qlvb.namsaigon.edu.vn/vehicles" style="background-color: #4338ca; color: white; padding: 12px 26px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Truy cập phân bổ Xe & Tài xế</a>
                    </div>
                </div>
                <div style="background-color: #f1f5f9; padding: 14px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
                    Email được gửi tự động từ Hệ thống Quản lý Văn bản và Điều hành - Trường Cao đẳng Bách khoa Nam Sài Gòn.
                </div>
            </div>
            `;

            await transporter.sendMail({
                from: sender,
                to: assignedDispatcher.email,
                subject: subjectDispatcher,
                html: applySystemBranding(htmlDispatcher, brandName),
            });
            console.log(`[Email] Đã gửi thông báo giao phân bổ xe tới lãnh đạo ${assignedDispatcher.email}`);
        }

        return true;
    } catch (error) {
        console.error("Error in sendVehicleBookingStatusEmail:", error);
        return false;
    }
};

/**
 * 3. Gửi email thông báo điều phối xe thành công cho Người Đăng Ký và Tài Xế
 */
const sendVehicleDispatchedEmail = async (booking) => {
    try {
        const { transporter, sender, brandName } = await getTransporterAndSender();
        const isSchoolVehicle = booking.vehicleType === "SCHOOL_VEHICLE";

        const depDateStr = booking.departureDate ? formatVietnamDate(booking.departureDate) : formatVietnamDate(booking.departureTime);
        const retDateStr = booking.returnDate ? formatVietnamDate(booking.returnDate) : formatVietnamDate(booking.estimatedReturnTime);
        const depHourStr = booking.departureHour ? `${booking.departureHour}, ` : "";

        const vehicleName = booking.assignedVehicle?.name || "Xe trường";
        const licensePlate = booking.assignedVehicle?.licensePlate || "";
        const driverName = booking.assignedDriver?.fullName || "Tài xế phân công";
        const driverPhone = booking.assignedDriver?.phone || "";

        // A. Gửi email thông báo cho Người Đăng Ký
        if (booking.requester && booking.requester.email) {
            const subject = `[${brandName}] Thông tin điều phối xe công tác: Mã ${booking.bookingCode}`;
            const htmlContent = `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 650px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 10px; overflow: hidden;">
                <div style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); padding: 22px 24px; text-align: center; color: white;">
                    <h2 style="margin: 0; font-size: 21px;">PHƯƠNG TIỆN CÔNG TÁC ĐÃ SẴN SÀNG</h2>
                    <p style="margin: 6px 0 0; opacity: 0.95; font-size: 13.5px;">Mã phiếu: <strong>${booking.bookingCode}</strong></p>
                </div>
                <div style="padding: 24px; background-color: #ffffff;">
                    <p style="font-size: 15px;">Kính gửi <strong>${booking.requester.fullName || booking.requester.userName}</strong>,</p>
                    <p style="font-size: 14px; color: #475569;">Đơn vị quản lý xe đã hoàn tất sắp xếp phương tiện và nhân sự lái xe cho chuyến đi của bạn:</p>

                    ${isSchoolVehicle ? `
                    <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 18px; margin: 18px 0;">
                        <h3 style="margin-top: 0; color: #1e40af; font-size: 15px;">🚗 THÔNG TIN XE & TÀI XẾ PHỤ TRÁCH:</h3>
                        <p style="margin: 6px 0; font-size: 14px;">Phương tiện: <strong>${vehicleName}</strong> - Biển số: <strong style="color: #b91c1c; font-size: 15px;">${licensePlate}</strong></p>
                        <p style="margin: 6px 0; font-size: 14px;">Tài xế phụ trách: <strong>${driverName}</strong></p>
                        <p style="margin: 6px 0; font-size: 14px;">Số điện thoại liên hệ: <a href="tel:${driverPhone}" style="color: #047857; font-weight: bold; font-size: 16px; text-decoration: none;">${driverPhone}</a></p>
                        ${booking.dispatchNotes ? `<p style="margin: 10px 0 0; font-size: 13.5px; color: #475569; background: #fff; padding: 8px 12px; border-radius: 4px; border: 1px dashed #93c5fd;"><strong>Ghi chú điều phối:</strong> ${booking.dispatchNotes}</p>` : ''}
                    </div>` : `
                    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 18px; margin: 18px 0;">
                        <h3 style="margin-top: 0; color: #166534; font-size: 15px;">🚕 PHƯƠNG TIỆN CÔNG NGHỆ:</h3>
                        <p style="margin: 6px 0; font-size: 14px;">Đơn vị quản lý đã xác nhận duyệt phương thức <strong>Xe công nghệ</strong>.</p>
                        ${booking.dispatchNotes ? `<p style="margin: 10px 0 0; font-size: 13.5px; color: #166534;"><strong>Ghi chú:</strong> ${booking.dispatchNotes}</p>` : ''}
                    </div>`}

                    <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; background-color: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0;">
                        <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: bold; width: 35%; color: #64748b;">Mục đích công tác:</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">${booking.purpose}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #64748b;">Lộ trình di chuyển:</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0;">${booking.route}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 14px; font-weight: bold; color: #64748b;">Thời gian xuất phát:</td>
                            <td style="padding: 10px 14px; color: #2563eb; font-weight: bold;">${depHourStr}ngày ${depDateStr}</td>
                        </tr>
                    </table>

                    <div style="text-align: center; margin-top: 25px;">
                        <a href="https://qlvb.namsaigon.edu.vn/vehicles" style="background-color: #1e3a8a; color: white; padding: 12px 26px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Xem chi tiết & In phiếu điều xe</a>
                    </div>
                </div>
                <div style="background-color: #f1f5f9; padding: 14px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
                    Email được gửi tự động từ Hệ thống Quản lý Văn bản và Điều hành - Trường Cao đẳng Bách khoa Nam Sài Gòn.
                </div>
            </div>
            `;

            await transporter.sendMail({
                from: sender,
                to: booking.requester.email,
                subject: subject,
                html: applySystemBranding(htmlContent, brandName),
            });
            console.log(`[Email] Đã gửi thông báo điều xe tới người đăng ký ${booking.requester.email}`);
        }

        // B. Gửi email thông báo Lịch chạy cho Tài Xế phụ trách (nếu có email)
        const driverEmail = booking.assignedDriver?.userAccount?.email || booking.assignedDriver?.email;
        if (isSchoolVehicle && driverEmail) {
            const subjectDriver = `[${brandName}] Lịch chạy xe công tác mới: ${booking.purpose} (Mã ${booking.bookingCode})`;
            const htmlDriver = `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 650px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 10px; overflow: hidden;">
                <div style="background: linear-gradient(135deg, #059669 0%, #0d9488 100%); padding: 22px 24px; text-align: center; color: white;">
                    <h2 style="margin: 0; font-size: 21px;">LỊCH CHẠY XE CÔNG TÁC MỚI</h2>
                    <p style="margin: 6px 0 0; opacity: 0.95; font-size: 13.5px;">Mã phiếu: <strong>${booking.bookingCode}</strong></p>
                </div>
                <div style="padding: 24px; background-color: #ffffff;">
                    <p style="font-size: 15px;">Kính gửi Tài xế <strong>${driverName}</strong>,</p>
                    <p style="font-size: 14px; color: #475569;">Đơn vị quản lý xe đã phân công bạn lái xe phục vụ đoàn công tác với lịch trình cụ thể như sau:</p>

                    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 18px; margin: 18px 0;">
                        <p style="margin: 6px 0; font-size: 14px;">Phương tiện phụ trách: <strong>${vehicleName}</strong> (Biển số: <strong style="color: #b91c1c;">${licensePlate}</strong>)</p>
                        <p style="margin: 6px 0; font-size: 14px;">Thời gian xuất phát: <strong style="color: #059669; font-size: 15px;">${depHourStr}ngày ${depDateStr}</strong></p>
                        <p style="margin: 6px 0; font-size: 14px;">Lộ trình: <strong>${booking.route}</strong></p>
                        <p style="margin: 6px 0; font-size: 14px;">Người liên hệ / Trưởng đoàn: <strong>${booking.requester?.name || booking.requester?.fullName || booking.requesterName}</strong> - SĐT: <a href="tel:${booking.contactPhone}" style="color: #0284c7; font-weight: bold; text-decoration: none;">${booking.contactPhone}</a></p>
                        <p style="margin: 6px 0; font-size: 14px;">Số lượng người đi: <strong>${booking.passengersCount || 1}</strong> người ${booking.passengerNames ? `(${booking.passengerNames})` : ''}</p>
                        ${booking.dispatchNotes ? `<p style="margin: 10px 0 0; font-size: 13.5px; color: #166534; background: #fff; padding: 8px 12px; border-radius: 4px; border: 1px dashed #86efac;"><strong>Ghi chú điểm đón/ca trực:</strong> ${booking.dispatchNotes}</p>` : ''}
                    </div>

                    <p style="font-size: 13.5px; color: #475569;">💡 <em>Lưu ý: Khi bắt đầu xuất phát và khi kết thúc chuyến về an toàn, bạn vui lòng truy cập hệ thống để bấm <strong>"Bắt đầu đi"</strong> và <strong>"Đã về"</strong> để hệ thống tự động ghi nhận thời gian chính xác.</em></p>

                    <div style="text-align: center; margin-top: 25px;">
                        <a href="https://qlvb.namsaigon.edu.vn/vehicles" style="background-color: #059669; color: white; padding: 12px 26px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Xem lịch chạy & Xác nhận chuyến đi</a>
                    </div>
                </div>
                <div style="background-color: #f1f5f9; padding: 14px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
                    Email được gửi tự động từ Hệ thống Quản lý Văn bản và Điều hành - Trường Cao đẳng Bách khoa Nam Sài Gòn.
                </div>
            </div>
            `;

            await transporter.sendMail({
                from: sender,
                to: driverEmail,
                subject: subjectDriver,
                html: applySystemBranding(htmlDriver, brandName),
            });
            console.log(`[Email] Đã gửi thông báo lịch chạy xe tới tài xế ${driverEmail}`);
        }

        return true;
    } catch (error) {
        console.error("Error in sendVehicleDispatchedEmail:", error);
        return false;
    }
};

module.exports = {
    sentTempPassword,
    sendRestoreOtpEmail,
    sendNewDocumentEmail,
    sendTaskReminderEmail,
    sendTaskNotificationEmail,
    sendReviewNotificationEmail,
    sendEmulationRegistrationEmail,
    sendEmulationStatusEmail,
    sendTrainingRegistrationEmail,
    sendTrainingStatusEmail,
    sendOnlineRecordSubmitEmail,
    sendOnlineRecordStatusEmail,
    sendQuarterlyPlanReminderEmail,
    sendMeetingReminderEmail,
    sendWorkScheduleRegistrationEmail,
    sendWorkScheduleStatusEmail,
    sendVehicleBookingNotificationEmail,
    sendVehicleBookingStatusEmail,
    sendVehicleDispatchedEmail,
};