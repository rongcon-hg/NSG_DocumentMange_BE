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

const TRAINING_REGISTRATION_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Thông Báo: Đăng Ký Học Tập Bồi Dưỡng Mới</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 680px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(to right, #1d4ed8, #3b82f6); padding: 22px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: #fff; margin: 0; font-size: 20px; text-transform: uppercase; letter-spacing: 0.5px;">Thông Báo: Đăng Ký Học Tập Bồi Dưỡng</h1>
  </div>
  <div style="background-color: #f9fbfd; padding: 24px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border: 1px solid #e1e8ed; border-top: none;">
    <p>Kính chào Quý Thầy/Cô,</p>
    <p>Hệ thống Quản lý văn bản NSG vừa ghi nhận <strong>kế hoạch học tập bồi dưỡng mới</strong> được đăng ký trên hệ thống:</p>
    
    <div style="background: #fff; padding: 18px; border-left: 4px solid #2563eb; margin: 20px 0; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
      <p style="margin: 6px 0;"><strong>Năm đào tạo:</strong> <span style="color: #1d4ed8; font-weight: bold;">{year}</span></p>
      <p style="margin: 6px 0;"><strong>Người lập hồ sơ:</strong> {creatorName}</p>
      <p style="margin: 6px 0;"><strong>Thời gian gửi:</strong> {createdAt}</p>
      
      <div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed #e1e8ed;">
        <p style="margin: 6px 0;"><strong>Danh sách bồi dưỡng ({itemsCount} lượt đăng ký):</strong></p>
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 6px;">
            <thead>
              <tr style="background-color: #f0f4f8; text-align: left;">
                <th style="padding: 6px 8px; text-align: center;">STT</th>
                <th style="padding: 6px 8px;">Nhân sự</th>
                <th style="padding: 6px 8px;">Đơn vị</th>
                <th style="padding: 6px 8px;">Nội dung bồi dưỡng</th>
                <th style="padding: 6px 8px;">Hình thức</th>
                <th style="padding: 6px 8px; text-align: right;">Kinh phí dự kiến</th>
              </tr>
            </thead>
            <tbody>
              {recordsTableRows}
            </tbody>
          </table>
        </div>
      </div>

      {notesBlock}
    </div>

    <div style="text-align: center; margin: 25px 0;">
      <a href="https://qlvb.namsaigon.edu.vn/training/list" target="_blank" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; box-shadow: 0 2px 4px rgba(37,99,235,0.3);">
        Xem và Xét duyệt hồ sơ trên hệ thống
      </a>
    </div>

    <p style="font-size: 13px; color: #666;">Vui lòng đăng nhập vào hệ thống để xem chi tiết và thực hiện các bước xét duyệt / theo dõi.</p>
    <p style="margin-top: 20px;">Trân trọng,<br><strong>Hệ thống Quản lý văn bản NSG</strong></p>
  </div>
  <div style="text-align: center; margin-top: 15px; color: #888; font-size: 11px;">
    <p>Đây là email tự động từ hệ thống Quản lý văn bản NSG, vui lòng không trả lời trực tiếp email này.</p>
  </div>
</body>
</html>
`;

const TRAINING_STATUS_EMAIL_TEMPLATE = `
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
    <p>Hệ thống Quản lý văn bản NSG xin thông báo cập nhật về hồ sơ học tập bồi dưỡng:</p>
    
    <div style="background: #fff; padding: 18px; border-left: 4px solid {headerBorderColor}; margin: 20px 0; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
      <p style="margin: 6px 0;"><strong>Nhân sự bồi dưỡng:</strong> <span style="font-weight: bold;">{userName}</span> ({positionName})</p>
      <p style="margin: 6px 0;"><strong>Đơn vị / Phòng ban:</strong> {departmentName}</p>
      <p style="margin: 6px 0;"><strong>Nội dung bồi dưỡng:</strong> <span style="color: #1d4ed8; font-weight: bold;">{trainingContent}</span></p>
      <p style="margin: 6px 0;"><strong>Hình thức đào tạo:</strong> {trainingForm} | <strong>Năm:</strong> {year}</p>
      <p style="margin: 6px 0;"><strong>Trạng thái hồ sơ:</strong> {statusLabel}</p>
      <p style="margin: 6px 0;"><strong>Người thực hiện:</strong> {actorName} ({actorRole})</p>
      <p style="margin: 6px 0;"><strong>Thời gian:</strong> {actionTime}</p>
      
      {extraDetailsHtml}

      <div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed #e1e8ed;">
        <p style="margin: 6px 0;"><strong>Ý kiến / Ghi chú:</strong></p>
        <div style="background-color: #f5f5f5; padding: 10px 14px; border-radius: 4px; font-style: italic; color: #444;">
          {notes}
        </div>
      </div>
    </div>

    <div style="text-align: center; margin: 25px 0;">
      <a href="{actionUrl}" target="_blank" style="background-color: {headerBorderColor}; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
        Xem chi tiết hồ sơ trên hệ thống
      </a>
    </div>

    <p style="font-size: 13px; color: #666;">Vui lòng đăng nhập vào hệ thống để theo dõi và thực hiện các bước tiếp theo.</p>
    <p style="margin-top: 20px;">Trân trọng,<br><strong>Hệ thống Quản lý văn bản NSG</strong></p>
  </div>
  <div style="text-align: center; margin-top: 15px; color: #888; font-size: 11px;">
    <p>Đây là email tự động từ hệ thống Quản lý văn bản NSG, vui lòng không trả lời trực tiếp email này.</p>
  </div>
</body>
</html>
`;

const ONLINE_RECORD_SUBMIT_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Thông Báo: Hồ Sơ Trực Tuyến Mới Được Gửi</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 680px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(to right, #0d9488, #14b8a6); padding: 22px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: #fff; margin: 0; font-size: 20px; text-transform: uppercase; letter-spacing: 0.5px;">Thông Báo: Hồ Sơ Trực Tuyến Mới</h1>
  </div>
  <div style="background-color: #f9fbfd; padding: 24px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border: 1px solid #e1e8ed; border-top: none;">
    <p>Kính chào Quý Thầy/Cô,</p>
    <p>Hệ thống Quản lý văn bản NSG vừa tiếp nhận một <strong>hồ sơ trực tuyến mới</strong> được gửi đến Quý Thầy/Cô để tiếp nhận / xử lý:</p>
    
    <div style="background: #fff; padding: 18px; border-left: 4px solid #0d9488; margin: 20px 0; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
      <p style="margin: 6px 0;"><strong>Người gửi hồ sơ:</strong> <span style="font-weight: bold; color: #0f766e;">{senderName}</span> ({senderPosition})</p>
      <p style="margin: 6px 0;"><strong>Đơn vị:</strong> {senderDepartment}</p>
      <p style="margin: 6px 0;"><strong>Số điện thoại:</strong> {senderPhone} | <strong>Email:</strong> {senderEmail}</p>
      <p style="margin: 6px 0;"><strong>Loại hồ sơ:</strong> <span style="display: inline-block; padding: 2px 8px; background: #ccfbf1; border-radius: 4px; color: #0f766e; font-weight: 600;">📁 {categoryName}</span></p>
      <p style="margin: 6px 0;"><strong>Tiêu đề hồ sơ:</strong> <span style="font-weight: bold; color: #1e293b;">{recordTitle}</span></p>
      <p style="margin: 6px 0;"><strong>Thời gian gửi:</strong> {createdAt}</p>
      <p style="margin: 6px 0;"><strong>Người tiếp nhận / Phê duyệt:</strong> {recipientsList}</p>

      <div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed #e1e8ed;">
        <p style="margin: 6px 0;"><strong>Nội dung / Ghi chú:</strong></p>
        <div style="background-color: #f8fafc; padding: 10px 14px; border-radius: 4px; font-size: 13px; color: #475569;">
          {notes}
        </div>
      </div>

      <div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed #e1e8ed;">
        <p style="margin: 6px 0;"><strong>Tệp đính kèm ({filesCount} file):</strong></p>
        <ul style="padding-left: 20px; margin: 6px 0; font-size: 13px;">
          {linksHtml}
        </ul>
      </div>
    </div>

    <div style="text-align: center; margin: 25px 0;">
      <a href="https://qlvb.namsaigon.edu.vn/online-records/list" target="_blank" style="background-color: #0d9488; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; box-shadow: 0 2px 4px rgba(13,148,136,0.3);">
        Xem và Xử lý hồ sơ trên hệ thống
      </a>
    </div>

    <p style="font-size: 13px; color: #666;">Vui lòng đăng nhập vào hệ thống để xem chi tiết và tiến hành xử lý hồ sơ kịp thời.</p>
    <p style="margin-top: 20px;">Trân trọng,<br><strong>Hệ thống Quản lý văn bản NSG</strong></p>
  </div>
  <div style="text-align: center; margin-top: 15px; color: #888; font-size: 11px;">
    <p>Đây là email tự động từ hệ thống Quản lý văn bản NSG, vui lòng không trả lời trực tiếp email này.</p>
  </div>
</body>
</html>
`;

const ONLINE_RECORD_STATUS_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Thông Báo: {actionName}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 650px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(to right, {headerColorStart}, {headerColorEnd}); padding: 22px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: #fff; margin: 0; font-size: 20px; text-transform: uppercase; letter-spacing: 0.5px;">Thông Báo: {actionName}</h1>
  </div>
  <div style="background-color: #f9fbfd; padding: 24px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border: 1px solid #e1e8ed; border-top: none;">
    <p>Kính chào Quý Thầy/Cô,</p>
    <p>Hệ thống Quản lý văn bản NSG xin thông báo cập nhật về trạng thái hồ sơ trực tuyến của Quý Thầy/Cô:</p>
    
    <div style="background: #fff; padding: 18px; border-left: 4px solid {headerBorderColor}; margin: 20px 0; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
      <p style="margin: 6px 0;"><strong>Tiêu đề hồ sơ:</strong> <span style="font-weight: bold; color: #1e293b;">{recordTitle}</span></p>
      <p style="margin: 6px 0;"><strong>Loại hồ sơ:</strong> {categoryName}</p>
      <p style="margin: 6px 0;"><strong>Người nộp hồ sơ:</strong> {senderName} ({senderDepartment})</p>
      <p style="margin: 6px 0;"><strong>Trạng thái cập nhật:</strong> {statusLabel}</p>
      <p style="margin: 6px 0;"><strong>Người xử lý:</strong> <span style="font-weight: 600;">{reviewerName}</span> ({reviewerRole})</p>
      <p style="margin: 6px 0;"><strong>Thời gian:</strong> {actionTime}</p>

      <div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed #e1e8ed;">
        <p style="margin: 6px 0;"><strong>Ý kiến phản hồi / Ghi chú:</strong></p>
        <div style="background-color: #f8fafc; padding: 10px 14px; border-radius: 4px; font-style: italic; color: #334155; border: 1px solid #f1f5f9;">
          {opinion}
        </div>
      </div>
    </div>

    <div style="text-align: center; margin: 25px 0;">
      <a href="https://qlvb.namsaigon.edu.vn/online-records/list" target="_blank" style="background-color: {headerBorderColor}; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
        Xem chi tiết hồ sơ trên hệ thống
      </a>
    </div>

    <p style="font-size: 13px; color: #666;">Vui lòng đăng nhập vào hệ thống để theo dõi và thực hiện các điều chỉnh (nếu có yêu cầu).</p>
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
  TRAINING_REGISTRATION_EMAIL_TEMPLATE,
  TRAINING_STATUS_EMAIL_TEMPLATE,
  ONLINE_RECORD_SUBMIT_EMAIL_TEMPLATE,
  ONLINE_RECORD_STATUS_EMAIL_TEMPLATE,
};
