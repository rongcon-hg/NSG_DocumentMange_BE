const TEMPPASSWORD_EMAIL_TEMPLATE = ` 
<!DOCTYPE html> 
<html lang="vi"> 
<head> 
  <meta charset="UTF-8"> 
  <meta name="viewport" content="width=device-width, initial-scale=1.0"> 
  <title>Xác nhận email</title> 
</head> 
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;"> 
  <div style="background: linear-gradient(to right, #A3AAAE, #E0E0E0); padding: 20px; text-align: center;"> 
    <h1 style="color: #333; margin: 0;">Xác nhận email</h1> 
  </div> 
  <div style="background-color: #F2F2F5; padding: 20px; border-radius: 0 0 5px 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);"> 
    <p>Xin chào,</p> 
    <p>Cảm ơn bạn đã khôi phục tài khoản! Mã xác minh của bạn là:</p> 
    <div style="text-align: center; margin: 30px 0;"> 
      <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #0071E3;">{tempPass}</span> 
    </div> 
    <p>Nhập mã này vào trang xác minh để hoàn tất quá trình khôi phục tài khoản.</p> 
    <p>Vì lý do bảo mật, mã này sẽ hết hạn sau 1 phút.</p> 
    
    <p>Trân trọng,<br>Phòng Tổ chức - Hành chính</p> 
  </div> 
  <div style="text-align: center; margin-top: 20px; color: #888; font-size: 0.8em;"> 
    <p>Đây là email tự động, vui lòng không trả lời email này.</p> 
  </div> 
</body> 
</html> 
`;

const NEW_DOCUMENT_EMAIL_TEMPLATE = ` 
<!DOCTYPE html> 
<html lang="vi"> 
<head> 
  <meta charset="UTF-8"> 
  <title>Thông báo văn bản mới</title> 
</head> 
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;"> 
  <div style="background: linear-gradient(to right, #4CAF50, #81C784); padding: 20px; text-align: center;"> 
    <h1 style="color: #fff; margin: 0;">Thông báo văn bản mới</h1> 
  </div> 
  <div style="background-color: #F9F9F9; padding: 20px; border-radius: 0 0 5px 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);"> 
    <p>Xin chào <strong>{recipientName}</strong>,</p> 
    <p>Hệ thống Quản lý văn bản NSG vừa ghi nhận một văn bản mới liên quan đến bạn (được phát hành/chuyển đến bởi <strong>{senderName}</strong>):</p> 
    <div style="background: #fff; padding: 15px; border-left: 4px solid #4CAF50; margin: 20px 0;"> 
      <p><strong>Số/Ký hiệu:</strong> {docCode}</p> 
      <p><strong>Ngày phát hành/Ngày đến:</strong> {dateValue}</p> 
      <p><strong>Trích yếu:</strong> {shortDescription}</p> 
      <p><strong>Loại văn bản:</strong> {docType}</p> 
      <p><strong>Mức độ khẩn:</strong> {urgency}</p> 
      <p><strong>Nội dung xử lý/Ý kiến:</strong> {principalIdea}</p> 
      <p><strong>Hạn xử lý:</strong> {deadlineDay}</p> 
      <br>
      <p><strong>File đính kèm:</strong></p>
      <ul style="padding-left: 20px;">
        {linksHtml}
      </ul>
    </div> 
    <p>Vui lòng đăng nhập vào hệ thống để xem chi tiết và xử lý kịp thời.</p> 
    <p>Trân trọng,<br>Hệ thống Quản lý văn bản NSG</p> 
  </div> 
</body> 
</html> 
`;

const TASK_NOTIFICATION_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Thông báo công việc: {actionName}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(to right, {headerColorStart}, {headerColorEnd}); padding: 20px; text-align: center;">
    <h1 style="color: #fff; margin: 0;">Thông báo: {actionName}</h1>
  </div>
  <div style="background-color: #F9F9F9; padding: 20px; border-radius: 0 0 5px 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
    <p>Xin chào <strong>{recipientName}</strong>,</p>
    <p>Hệ thống Quản lý văn bản NSG vừa ghi nhận một sự kiện công việc liên quan đến bạn: <strong>{actionName}</strong></p>
    
    {priorityHighlightBlock}
    
    <div style="background: #fff; padding: 15px; border-left: 4px solid {headerBorderColor}; margin: 20px 0;">
      <p><strong>Tiêu đề công việc:</strong> {taskTitle}</p>
      <p><strong>Nội dung:</strong> {taskDescription}</p>
      <p><strong>Thời gian:</strong> {taskTime}</p>
      <p><strong>Mức độ:</strong> {priorityLabel}</p>
      <p><strong>Trạng thái:</strong> {statusLabel}</p>
      <p><strong>Người thực hiện:</strong> {assigneesList}</p>
      <p><strong>Người phối hợp:</strong> {collaboratorsList}</p>
      <br>
      <p><strong>Tệp đính kèm:</strong></p>
      <ul style="padding-left: 20px;">
        {linksHtml}
      </ul>
    </div>
    <p>Vui lòng đăng nhập vào hệ thống để xem chi tiết và cập nhật tiến độ kịp thời.</p>
    <p>Trân trọng,<br>Hệ thống Quản lý văn bản NSG</p>
  </div>
</body>
</html>
`;

module.exports = {
  TEMPPASSWORD_EMAIL_TEMPLATE,
  NEW_DOCUMENT_EMAIL_TEMPLATE,
  TASK_NOTIFICATION_EMAIL_TEMPLATE
}
