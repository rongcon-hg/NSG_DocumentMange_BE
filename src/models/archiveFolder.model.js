const mongoose = require('mongoose');

const archiveFileItemSchema = new mongoose.Schema({
  title: { type: String, required: true },
  itemType: { type: String, enum: ['Document', 'Task', 'Attachment', 'Report'], default: 'Document' },
  refId: { type: mongoose.Schema.Types.ObjectId, refPath: 'items.itemType' },
  documentNumber: { type: String, default: '' },
  date: { type: Date, default: Date.now },
  author: { type: String, default: '' },
  fileId: { type: String, default: '' },
  fileUrl: { type: String, default: '' },
  pageCount: { type: Number, default: 1 },
  note: { type: String, default: '' },
}, { _id: true });

const archiveFolderSchema = new mongoose.Schema({
  folderCode: { 
    type: String, 
    required: true, 
    unique: true, 
    trim: true 
  }, // Ví dụ: HS-2026/001
  title: { 
    type: String, 
    required: true, 
    trim: true 
  }, // Tiêu đề hồ sơ vụ việc
  academicYear: { 
    type: String, 
    default: () => `${new Date().getFullYear()}-${new Date().getFullYear() + 1}` 
  }, // Năm học hoặc năm dương lịch (VD: 2025-2026)
  retentionPeriod: { 
    type: String, 
    enum: ['Vĩnh viễn', '70 năm', '50 năm', '20 năm', '10 năm', '5 năm'], 
    default: '10 năm' 
  }, // Thời hạn bảo quản
  department: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Department' 
  }, // Đơn vị nộp lưu
  creator: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  }, // Cán bộ lập hồ sơ
  status: { 
    type: String, 
    enum: ['OPEN', 'SUBMITTED', 'ARCHIVED', 'DISCARDED'], 
    default: 'OPEN' 
  }, // Mở (đang gom tài liệu) -> Đã nộp lưu -> Đã vào kho -> Tiêu hủy
  closedAt: { type: Date }, // Ngày đóng hồ sơ
  archivedAt: { type: Date }, // Ngày duyệt nhập kho lưu trữ cơ quan
  description: { type: String, default: '' },
  accessScope: {
    type: String,
    enum: ['PUBLIC', 'DEPARTMENT', 'RESTRICTED'],
    default: 'DEPARTMENT',
  }, // PUBLIC: Toàn trường xem được, DEPARTMENT: Chỉ đơn vị nộp lưu, RESTRICTED: Chỉ người được chỉ định & BGH
  allowedDepartments: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
    }
  ], // Các đơn vị được phép truy cập
  allowedUsers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }
  ], // Các cán bộ được cấp quyền xem riêng
  items: [archiveFileItemSchema], // Các tài liệu, công việc thành phần trong hồ sơ
}, { timestamps: true });

module.exports = mongoose.model('ArchiveFolder', archiveFolderSchema);
