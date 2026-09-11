const {
    TEMPPASSWORD_EMAIL_TEMPLATE,
    NEW_DOCUMENT_EMAIL_TEMPLATE,
    TASK_NOTIFICATION_EMAIL_TEMPLATE,
    REVIEW_NOTIFICATION_EMAIL_TEMPLATE,
    EMULATION_REGISTRATION_EMAIL_TEMPLATE,
    EMULATION_STATUS_EMAIL_TEMPLATE,
    TRAINING_REGISTRATION_EMAIL_TEMPLATE,
    TRAINING_STATUS_EMAIL_TEMPLATE
} = require("./emailTemplate");
const nodemailer = require("nodemailer");
const dotenv = require("dotenv");
const SmtpConfig = require("../../models/smtpConfig.model");
dotenv.config();

const getTransporterAndSender = async () => {
    let host = "smtp.gmail.com";
    let port = 465;
    let secure = true;
    let user = process.env.EMAIL_USERNAME;
    let pass = process.env.EMAIL_PASSWORD;
    let senderName = "Hệ thống quản lý văn bản NSG";

    try {
        const config = await SmtpConfig.findOne();
        if (config && config.user && config.pass) {
            host = config.host || host;
            port = config.port || port;
            secure = (port === 465);
            user = config.user;
            pass = config.pass;
            senderName = config.senderName || senderName;
        }
    } catch (e) {
        console.error("Error fetching SMTP config for email service:", e);
    }

    const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
    });

    const sender = `"${senderName}" <${user || 'qlvb@nsgpc.edu.vn'}>`;

    return { transporter, sender };
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
        const { transporter, sender } = await getTransporterAndSender();

        const mailOptions = {
            from: sender, // sender address
            to: email, // list of receivers
            subject: "OTP tạm thời", // Subject line
            text: "Mã khôi phục mật khẩu", // plain text body
            html: TEMPPASSWORD_EMAIL_TEMPLATE.replace("{tempPass}",tempPass),
        }
        const info = await transporter.sendMail(mailOptions);
        return info;
    } catch (error) {
        console.error("Error sending temp password to email:", error);

    }
}

const sendRestoreOtpEmail = async (email, otp) => {
    try {
        const { transporter, sender } = await getTransporterAndSender();
        const mailOptions = {
            from: sender,
            to: email,
            subject: "Mã xác nhận Khôi phục Cơ sở dữ liệu",
            text: `Mã xác nhận của bạn là: ${otp}. Mã có hiệu lực trong 10 phút.`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2>Cảnh báo Bảo mật</h2>
                    <p>Bạn vừa yêu cầu khôi phục toàn bộ Cơ sở dữ liệu của hệ thống.</p>
                    <p>Mã xác nhận (OTP) của bạn là: <strong>${otp}</strong></p>
                    <p style="color: red;">Mã có hiệu lực trong 10 phút. <strong>LƯU Ý:</strong> Việc khôi phục sẽ ghi đè toàn bộ dữ liệu hiện tại.</p>
                </div>
            `,
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
        const { transporter, sender } = await getTransporterAndSender();
        
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

        const subject = `${fullDocCode} - ${docData.shortDescription || "N/A"}`;

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

        const mailOptions = {
            from: sender,
            to: sender,
            bcc: bccList.join(','),
            subject: subject,
            html: htmlContent,
        }
        await transporter.sendMail(mailOptions).catch(err => console.error(`Error sending email:`, err));

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

        const { transporter, sender } = await getTransporterAndSender();
        
        let subject = "";
        let headerTitle = "";
        let color = "#333";
        
        if (reminderType === "near_deadline") {
            subject = `[Nhắc nhở] Công việc sắp đến hạn: ${taskData.title}`;
            headerTitle = "Công việc của bạn sắp đến hạn";
            color = "#f39c12"; // Orange
        } else if (reminderType === "due_today") {
            subject = `[Khẩn cấp] Công việc đến hạn hôm nay: ${taskData.title}`;
            headerTitle = "Công việc của bạn ĐẾN HẠN TRONG HÔM NAY";
            color = "#e74c3c"; // Red
        } else if (reminderType === "overdue") {
            subject = `[Quá hạn] Công việc đã quá hạn: ${taskData.title}`;
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
            <p style="margin-top: 20px;">Vui lòng truy cập hệ thống Quản lý Văn bản NSG để cập nhật tiến độ công việc.</p>
            <p style="color: #888; font-size: 12px; margin-top: 30px; text-align: center;">Đây là email tự động từ hệ thống, vui lòng không trả lời email này.</p>
        </div>`;

        const mailOptions = {
            from: sender,
            to: sender,
            bcc: bccList.join(','),
            subject: subject,
            html: htmlContent,
        }
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error("Error sending task reminder email:", error);
    }
}

const sendTaskNotificationEmail = async (uniqueUsers, taskData, actionType) => {
    try {
        if (!uniqueUsers || uniqueUsers.length === 0) return;
        const { transporter, sender } = await getTransporterAndSender();
        
        let actionName = "Cập nhật công việc";
        if (actionType === 'create') actionName = "Tạo công việc mới";
        if (actionType === 'status_change') actionName = "Thay đổi trạng thái công việc";

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

        const subject = `[${actionName}] ${taskData.title}`;

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

        const mailOptions = {
            from: sender,
            to: sender,
            bcc: bccList.join(','),
            subject: subject,
            html: htmlContent,
        }
        await transporter.sendMail(mailOptions).catch(err => console.error(`Error sending email:`, err));

        return true;
    } catch (error) {
        console.error("Error sending task notification to email:", error);
    }
}

const sendReviewNotificationEmail = async (uniqueUsers, docData, actionType, notes = "", actorName = "") => {
    try {
        if (!uniqueUsers || uniqueUsers.length === 0) return;
        const allowedUsers = uniqueUsers.filter(u => !u.emailNotifications || u.emailNotifications.docReview !== false);
        const bccList = allowedUsers.map(u => u.email).filter(e => !!e);
        if (bccList.length === 0) return;

        const { transporter, sender } = await getTransporterAndSender();
        
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

        const subject = `[${actionName}] ${docTitle}`;

        const mailOptions = {
            from: sender,
            to: sender,
            bcc: bccList.join(','),
            subject: subject,
            html: htmlContent,
        }
        await transporter.sendMail(mailOptions).catch(err => console.error(`Error sending email:`, err));
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

        const { transporter, sender } = await getTransporterAndSender();

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
        const subject = `[Đề nghị thi đua] ${targetName} - Năm học ${schoolYear}`;
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

        const mailOptions = {
            from: sender,
            to: sender,
            bcc: bccList.join(','),
            subject: subject,
            html: htmlContent,
        };

        await transporter.sendMail(mailOptions).catch(err => console.error(`Error sending emulation email:`, err));
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

        const { transporter, sender } = await getTransporterAndSender();

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
            actionName = "Hiệu trưởng đã phê duyệt công nhận danh hiệu thi đua";
            statusLabel = '<span style="color: #52c41a; font-weight: bold;">Hiệu trưởng Phê duyệt Đạt</span>';
            headerColorStart = "#52c41a";
            headerColorEnd = "#389e0d";
            headerBorderColor = "#52c41a";
        } else if (actionType === 'BGH_REJECT') {
            actionName = "Hiệu trưởng từ chối công nhận danh hiệu thi đua";
            statusLabel = '<span style="color: #f5222d; font-weight: bold;">Hiệu trưởng Từ chối công nhận</span>';
            headerColorStart = "#f5222d";
            headerColorEnd = "#cf1322";
            headerBorderColor = "#f5222d";
        }

        // Danh hiệu HTML
        let titlesHtml = "";
        if (regData.titles && regData.titles.length > 0) {
            titlesHtml = regData.titles.map(t => {
                const name = typeof t === "object" ? t.name : t;
                return `<span style="display: inline-block; margin: 2px 4px; padding: 2px 8px; background: #fffbe6; border: 1px solid #ffe58f; border-radius: 4px; color: #b78103; font-size: 12px; font-weight: 600;">🏆 ${name}</span>`;
            }).join('');
        } else {
            titlesHtml = "<i>Không có</i>";
        }

        const targetName = regData.name || regData.departmentName || "Đơn vị";
        const schoolYear = regData.schoolYear || "N/A";
        const actionTimeStr = formatVietnamDateTime();
        const subject = `[${actionName}] ${targetName} - Năm học ${schoolYear}`;

        let htmlContent = EMULATION_STATUS_EMAIL_TEMPLATE
            .replace(/{actionName}/g, actionName)
            .replace(/{departmentName}/g, regData.departmentName || "Ban Giám hiệu / Nhà trường")
            .replace(/{targetName}/g, targetName)
            .replace(/{schoolYear}/g, schoolYear)
            .replace(/{statusLabel}/g, statusLabel)
            .replace(/{actorName}/g, actorName)
            .replace(/{actorRole}/g, actorRole)
            .replace(/{actionTime}/g, actionTimeStr)
            .replace(/{notes}/g, note || "Không có ý kiến bổ sung")
            .replace(/{titlesHtml}/g, titlesHtml)
            .replace(/{headerColorStart}/g, headerColorStart)
            .replace(/{headerColorEnd}/g, headerColorEnd)
            .replace(/{headerBorderColor}/g, headerBorderColor);

        const mailOptions = {
            from: sender,
            to: sender,
            bcc: bccList.join(','),
            subject: subject,
            html: htmlContent,
        };

        await transporter.sendMail(mailOptions).catch(err => console.error(`Error sending emulation status email:`, err));
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

        const { transporter, sender } = await getTransporterAndSender();

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

        const subject = `[Đăng ký bồi dưỡng] ${creatorName} vừa gửi ${records.length} hồ sơ đăng ký mới - Năm ${year}`;

        let htmlContent = TRAINING_REGISTRATION_EMAIL_TEMPLATE
            .replace(/{year}/g, year)
            .replace(/{creatorName}/g, creatorName)
            .replace(/{createdAt}/g, createdAtStr)
            .replace(/{itemsCount}/g, records.length)
            .replace(/{recordsTableRows}/g, rows)
            .replace(/{notesBlock}/g, notesBlock);

        const mailOptions = {
            from: sender,
            to: sender,
            bcc: bccList.join(','),
            subject: subject,
            html: htmlContent,
        };

        await transporter.sendMail(mailOptions).catch(err => console.error(`Error sending training registration email:`, err));
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

        const { transporter, sender } = await getTransporterAndSender();

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

        const subject = `[Bồi dưỡng - ${actionName}] ${record.userName} - ${record.trainingContent}`;
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

        const mailOptions = {
            from: sender,
            to: sender,
            bcc: bccList.join(','),
            subject: subject,
            html: htmlContent,
        };

        await transporter.sendMail(mailOptions).catch(err => console.error(`Error sending training status email:`, err));
        return true;
    } catch (error) {
        console.error("Error in sendTrainingStatusEmail:", error);
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
};