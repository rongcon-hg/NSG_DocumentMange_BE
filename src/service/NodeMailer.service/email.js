const { TEMPPASSWORD_EMAIL_TEMPLATE, NEW_DOCUMENT_EMAIL_TEMPLATE, TASK_NOTIFICATION_EMAIL_TEMPLATE, REVIEW_NOTIFICATION_EMAIL_TEMPLATE } = require("./emailTemplate");
const nodemailer = require("nodemailer");
const dotenv = require("dotenv");
dotenv.config();

const createTransporter = () => {
    return nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false, // true cho port 465, false cho các port khác
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  };

const sentTempPassword = async (email,tempPass) => {
    try {
        const transporter = createTransporter();

        const mailOptions = {
            from: '"Hệ thống quản lý văn bản NSG" <qlvb@nsgpc.edu.vn>', // sender address
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

const sendNewDocumentEmail = async (uniqueUsers, docData, senderName = "Hệ thống") => {
    try {
        if (!uniqueUsers || uniqueUsers.length === 0) return;
        const transporter = createTransporter();
        
        let linksHtml = "";
        if (docData.files && docData.files.length > 0) {
            linksHtml = docData.files.map(f => 
                `<li><a href="https://drive.google.com/file/d/${f.fileId}/view" target="_blank">${f.fileName || 'Xem file'}</a></li>`
            ).join('');
        } else {
            linksHtml = "<li>Không có file đính kèm</li>";
        }

        const dateValue = docData.receivedAt ? 
            new Date(docData.receivedAt).toLocaleDateString('vi-VN') : 
            (docData.createAt ? new Date(docData.createAt).toLocaleDateString('vi-VN') : "N/A");
            
        const deadlineValue = docData.deadlineDay ? 
            new Date(docData.deadlineDay).toLocaleDateString('vi-VN') : "Không có";

        const fullDocCode = (docData.docNum && docData.docCode) 
            ? `${docData.docNum}/${docData.docCode}` 
            : (docData.docNum || docData.docCode || "N/A");

        const subject = `${fullDocCode} - ${docData.shortDescription || "N/A"}`;

        const bccList = uniqueUsers.map(u => u.email).filter(e => !!e);
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
            from: '"Hệ thống quản lý văn bản NSG" <qlvb@nsgpc.edu.vn>',
            to: '"Hệ thống quản lý văn bản NSG" <qlvb@nsgpc.edu.vn>',
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

        const transporter = createTransporter();
        
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

        const endDateStr = new Date(taskData.endDate).toLocaleDateString('vi-VN');

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
            from: '"Hệ thống quản lý văn bản NSG" <qlvb@nsgpc.edu.vn>',
            to: '"Hệ thống quản lý văn bản NSG" <qlvb@nsgpc.edu.vn>',
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
        const transporter = createTransporter();
        
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
            `${new Date(taskData.startDate).toLocaleDateString('vi-VN')} - ${new Date(taskData.endDate).toLocaleDateString('vi-VN')}` : "N/A";

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

        const bccList = uniqueUsers.map(u => u.email).filter(e => !!e);
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
            from: '"Hệ thống quản lý văn bản NSG" <qlvb@nsgpc.edu.vn>',
            to: '"Hệ thống quản lý văn bản NSG" <qlvb@nsgpc.edu.vn>',
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

const sendReviewNotificationEmail = async (uniqueUsers, docData, actionType, notes = "") => {
    try {
        if (!uniqueUsers || uniqueUsers.length === 0) return;
        const bccList = uniqueUsers.map(u => u.email).filter(e => !!e);
        if (bccList.length === 0) return;

        const transporter = createTransporter();
        
        let actionName = "Cập nhật xét duyệt";
        let statusLabel = '<span style="color: #2196F3; font-weight: bold;">Đang xét duyệt</span>';
        let headerColorStart = "#2196F3";
        let headerColorEnd = "#42a5f5";
        let headerBorderColor = "#2196F3";

        if (actionType === 'submitToBGH') {
            actionName = "Yêu cầu BGH xét duyệt";
            statusLabel = '<span style="color: #ff9800; font-weight: bold;">Chờ BGH duyệt</span>';
            headerColorStart = "#ff9800";
            headerColorEnd = "#ffb74d";
            headerBorderColor = "#ff9800";
        } else if (actionType === 'bghReject') {
            actionName = "BGH từ chối phê duyệt";
            statusLabel = '<span style="color: #f44336; font-weight: bold;">BGH Từ chối</span>';
            headerColorStart = "#f44336";
            headerColorEnd = "#ef5350";
            headerBorderColor = "#f44336";
        } else if (actionType === 'managerAccept') {
            actionName = "Manager đã chấp nhận";
            statusLabel = '<span style="color: #4CAF50; font-weight: bold;">Đã chấp nhận</span>';
            headerColorStart = "#4CAF50";
            headerColorEnd = "#66bb6a";
            headerBorderColor = "#4CAF50";
        } else if (actionType === 'managerReject') {
            actionName = "Manager từ chối phê duyệt";
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
            ((docData.repliedDoc.docNum && docData.repliedDoc.docCode) ? \`\${docData.repliedDoc.docNum}/\${docData.repliedDoc.docCode}\` : "N/A") 
            : "N/A";
            
        const docTitle = docData.shortDescription || "Không có";
        const docType = docData.docVariant ? (docData.docVariant.docVariantName || "N/A") : "N/A";
        const drafter = docData.repliedDoc ? (docData.repliedDoc.author || "N/A") : "N/A";
        const submitter = docData.replyBy ? (docData.replyBy.name || "N/A") : "N/A";

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

        const subject = \`[\${actionName}] \${docTitle}\`;

        const mailOptions = {
            from: '"Hệ thống quản lý văn bản NSG" <qlvb@nsgpc.edu.vn>',
            to: '"Hệ thống quản lý văn bản NSG" <qlvb@nsgpc.edu.vn>',
            bcc: bccList.join(','),
            subject: subject,
            html: htmlContent,
        }
        await transporter.sendMail(mailOptions).catch(err => console.error(\`Error sending email:\`, err));
        return true;
    } catch (error) {
        console.error("Error sending review notification to email:", error);
    }
}

module.exports = {
    sentTempPassword,
    sendNewDocumentEmail,
    sendTaskReminderEmail,
    sendTaskNotificationEmail,
    sendReviewNotificationEmail
}