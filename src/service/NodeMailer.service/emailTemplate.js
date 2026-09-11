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
    <p>Kính chào Quý Thầy/Cô,</p> 
    <p>Hệ thống Quản lý văn bản NSG vừa ghi nhận một văn bản mới liên quan đến Quý Thầy/Cô (được phát hành/chuyển đến bởi <strong>{senderName}</strong>):</p> 
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
    <p>Kính chào Quý Thầy/Cô,</p>
    <p>Hệ thống Quản lý văn bản NSG vừa ghi nhận một sự kiện công việc liên quan đến Quý Thầy/Cô: <strong>{actionName}</strong></p>
    
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

const REVIEW_NOTIFICATION_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Thông báo trình ký: {actionName}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(to right, {headerColorStart}, {headerColorEnd}); padding: 20px; text-align: center;">
    <h1 style="color: #fff; margin: 0;">Thông báo trình ký: {actionName}</h1>
  </div>
  <div style="background-color: #F9F9F9; padding: 20px; border-radius: 0 0 5px 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
    <p>Kính chào Quý Thầy/Cô,</p>
    <p>Hệ thống Quản lý văn bản NSG vừa ghi nhận một sự kiện xét duyệt trình ký liên quan đến Quý Thầy/Cô: <strong>{actionName}</strong></p>
    
    <div style="background: #fff; padding: 15px; border-left: 4px solid {headerBorderColor}; margin: 20px 0;">
      <p><strong>Tiêu đề / Trích yếu:</strong> {docTitle}</p>
      <p><strong>Số/Ký hiệu:</strong> {docCode}</p>
      <p><strong>Loại văn bản:</strong> {docType}</p>
      <p><strong>Người soạn thảo:</strong> {drafter}</p>
      <p><strong>Người trình ký:</strong> {submitter}</p>
      <p><strong>Trạng thái:</strong> {statusLabel}</p>
      <p><strong>Ghi chú / Ý kiến:</strong> {notes}</p>
      <br>
      <p><strong>Tệp đính kèm:</strong></p>
      <ul style="padding-left: 20px;">
        {linksHtml}
      </ul>
    </div>
    <p>Vui lòng đăng nhập vào hệ thống để xem chi tiết.</p>
    <p>Trân trọng,<br>Hệ thống Quản lý văn bản NSG</p>
  </div>
</body>
</html>
`;

const EMULATION_REGISTRATION_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Thông báo Đề nghị Thi đua mới</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 650px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(to right, #1890ff, #096dd9); padding: 22px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: #fff; margin: 0; font-size: 20px; text-transform: uppercase; letter-spacing: 0.5px;">Hồ Sơ Đề Nghị Thi Đua Mới</h1>
  </div>
  <div style="background-color: #f9fbfd; padding: 24px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border: 1px solid #e1e8ed; border-top: none;">
    <p>Kính chào Quý Thầy/Cô,</p>
    <p>Hệ thống Quản lý văn bản NSG vừa ghi nhận một <strong>hồ sơ đề nghị thi đua mới</strong> được gửi lên hệ thống:</p>
    
    <div style="background: #fff; padding: 18px; border-left: 4px solid #1890ff; margin: 20px 0; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
      <p style="margin: 6px 0;"><strong>Năm học đề nghị:</strong> <span style="color: #096dd9; font-weight: bold;">{schoolYear}</span></p>
      <p style="margin: 6px 0;"><strong>Đơn vị / Phòng ban:</strong> {departmentName}</p>
      <p style="margin: 6px 0;"><strong>Đối tượng / Cán bộ đại diện:</strong> {targetName} ({positionName})</p>
      <p style="margin: 6px 0;"><strong>Người lập hồ sơ:</strong> {creatorName}</p>
      <p style="margin: 6px 0;"><strong>Thời gian gửi:</strong> {createdAt}</p>
      
      <div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed #e1e8ed;">
        <p style="margin: 6px 0;"><strong>Danh hiệu thi đua đăng ký:</strong></p>
        <div style="margin-left: 10px;">{titlesHtml}</div>
      </div>

      {membersBlockHtml}

      <div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed #e1e8ed;">
        <p style="margin: 6px 0;"><strong>Ghi chú / Cam kết:</strong> {notes}</p>
      </div>

      <div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed #e1e8ed;">
        <p style="margin: 6px 0;"><strong>Hồ sơ / Minh chứng đính kèm:</strong></p>
        <ul style="padding-left: 20px; margin: 6px 0;">
          {linksHtml}
        </ul>
      </div>
    </div>

    <div style="text-align: center; margin: 25px 0;">
      <a href="https://qlvb.namsaigon.edu.vn/emulation/list" target="_blank" style="background-color: #1890ff; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; box-shadow: 0 2px 4px rgba(24,144,255,0.3);">
        Xem và Xét duyệt hồ sơ trên hệ thống
      </a>
    </div>

    <p style="font-size: 13px; color: #666;">Vui lòng đăng nhập vào hệ thống để xem chi tiết và thực hiện các bước xét duyệt theo quy trình.</p>
    <p style="margin-top: 20px;">Trân trọng,<br><strong>Hệ thống Quản lý văn bản NSG</strong></p>
  </div>
  <div style="text-align: center; margin-top: 15px; color: #888; font-size: 11px;">
    <p>Đây là email tự động từ hệ thống Quản lý văn bản NSG, vui lòng không trả lời trực tiếp email này.</p>
  </div>
</body>
</html>
`;

const EMULATION_STATUS_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Thông báo: {actionName}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 650px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(to right, {headerColorStart}, {headerColorEnd}); padding: 22px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: #fff; margin: 0; font-size: 20px; text-transform: uppercase; letter-spacing: 0.5px;">Thông Báo: {actionName}</h1>
  </div>
  <div style="background-color: #f9fbfd; padding: 24px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border: 1px solid #e1e8ed; border-top: none;">
    <p>Kính chào Quý Thầy/Cô,</p>
    <p>Hệ thống Quản lý văn bản NSG xin thông báo về tiến độ xét duyệt hồ sơ đề nghị thi đua của Quý Thầy/Cô:</p>
    
    <div style="background: #fff; padding: 18px; border-left: 4px solid {headerBorderColor}; margin: 20px 0; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
      <p style="margin: 6px 0;"><strong>Đơn vị / Phòng ban:</strong> {departmentName}</p>
      <p style="margin: 6px 0;"><strong>Đối tượng đề nghị:</strong> {targetName}</p>
      <p style="margin: 6px 0;"><strong>Năm học:</strong> <span style="font-weight: bold;">{schoolYear}</span></p>
      <p style="margin: 6px 0;"><strong>Trạng thái hồ sơ:</strong> {statusLabel}</p>
      <p style="margin: 6px 0;"><strong>Người thực hiện:</strong> {actorName} ({actorRole})</p>
      <p style="margin: 6px 0;"><strong>Thời gian:</strong> {actionTime}</p>
      
      <div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed #e1e8ed;">
        <p style="margin: 6px 0;"><strong>Ý kiến / Nhận xét / Lý do:</strong></p>
        <div style="background-color: #f5f5f5; padding: 10px 14px; border-radius: 4px; font-style: italic; color: #444;">
          {notes}
        </div>
      </div>

      <div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed #e1e8ed;">
        <p style="margin: 6px 0;"><strong>Danh hiệu liên quan:</strong></p>
        <div style="margin-left: 10px;">{titlesHtml}</div>
      </div>
    </div>

    <div style="text-align: center; margin: 25px 0;">
      <a href="https://qlvb.namsaigon.edu.vn/emulation/list" target="_blank" style="background-color: {headerBorderColor}; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
        Xem chi tiết hồ sơ trên hệ thống
      </a>
    </div>

    <p style="font-size: 13px; color: #666;">Vui lòng đăng nhập vào hệ thống để theo dõi hoặc điều chỉnh bổ sung theo yêu cầu (nếu có).</p>
    <p style="margin-top: 20px;">Trân trọng,<br><strong>Hệ thống Quản lý văn bản NSG</strong></p>
  </div>
  <div style="text-align: center; margin-top: 15px; color: #888; font-size: 11px;">
    <p>Đây là email tự động từ hệ thống Quản lý văn bản NSG, vui lòng không trả lời trực tiếp email này.</p>
  </div>
</body>
</html>
`;

module.exports = {
  TEMPPASSWORD_EMAIL_TEMPLATE,
  NEW_DOCUMENT_EMAIL_TEMPLATE,
  TASK_NOTIFICATION_EMAIL_TEMPLATE,
  REVIEW_NOTIFICATION_EMAIL_TEMPLATE,
  EMULATION_REGISTRATION_EMAIL_TEMPLATE,
  EMULATION_STATUS_EMAIL_TEMPLATE,
};
