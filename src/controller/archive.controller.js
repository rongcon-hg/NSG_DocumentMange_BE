const ArchiveFolder = require('../models/archiveFolder.model');
const Document = require('../models/document.model');
const Task = require('../models/task.model');
const mongoose = require('mongoose');

/**
 * Lấy danh sách hồ sơ lưu trữ (hỗ trợ phân trang, lọc theo năm học, phòng ban, trạng thái)
 */
const getArchiveFolders = async (req, res) => {
  try {
    const { page = 1, limit = 20, academicYear, department, status, search } = req.query;
    const query = {};

    if (academicYear) query.academicYear = academicYear;
    if (department) query.department = department;
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { folderCode: { $regex: search, $options: 'i' } },
      ];
    }

    // Phân quyền theo quy chuẩn và phạm vi truy cập (accessScope):
    // 1. Quản trị viên (admin) hoặc Văn thư lưu trữ (manager): Thấy tất cả hồ sơ nộp lưu/kho và hồ sơ của chính mình
    // 2. Cán bộ/người dùng thông thường:
    //    - Hồ sơ do chính mình tạo (creator: userId)
    //    - Hồ sơ công khai toàn trường (accessScope: 'PUBLIC')
    //    - Hồ sơ đơn vị mình (accessScope: 'DEPARTMENT' và department khớp đơn vị user)
    //    - Hồ sơ chỉ định đơn vị user (allowedDepartments chứa userDepartment)
    //    - Hồ sơ chỉ định user (allowedUsers chứa userId)
    const userRole = req.user?.role;
    const userId = req.user?._id;
    const userDepartment = req.user?.department;

    const accessConditions = [
      { creator: userId },
      { accessScope: 'PUBLIC' },
      { allowedUsers: userId }
    ];

    if (userDepartment) {
      accessConditions.push(
        { accessScope: 'DEPARTMENT', department: userDepartment },
        { allowedDepartments: userDepartment }
      );
    }

    if (userRole === "manager" || userRole === "admin") {
      // Manager/Admin thấy hồ sơ của chính mình + tất cả hồ sơ đã nộp lưu (SUBMITTED) hoặc đã duyệt kho (ARCHIVED) + các hồ sơ được cấp quyền
      accessConditions.push({ status: { $in: ["SUBMITTED", "ARCHIVED"] } });
    }

    if (query.$or) {
      query.$and = [
        { $or: query.$or },
        { $or: accessConditions }
      ];
      delete query.$or;
    } else {
      query.$or = accessConditions;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [folders, total] = await Promise.all([
      ArchiveFolder.find(query)
        .populate('creator', 'name email')
        .populate('department', 'departmentName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      ArchiveFolder.countDocuments(query),
    ]);

    return res.json({
      success: true,
      data: folders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      }
    });
  } catch (error) {
    console.error('Lỗi getArchiveFolders:', error);
    return res.status(500).json({ success: false, message: 'Lỗi khi lấy danh sách hồ sơ lưu trữ' });
  }
};

/**
 * Lấy chi tiết hồ sơ lưu trữ kèm mục lục tài liệu
 */
const getArchiveFolderById = async (req, res) => {
  try {
    const { id } = req.params;
    const folder = await ArchiveFolder.findById(id)
      .populate('creator', 'name email role position')
      .populate('department', 'departmentName');

    if (!folder) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ lưu trữ' });
    }

    // Kiểm tra quyền xem chi tiết hồ sơ:
    const isCreator = folder.creator?._id?.toString() === req.user?._id?.toString();
    const isManagerOrAdmin = ['manager', 'admin'].includes(req.user?.role);
    const isSubmittedOrArchived = ['SUBMITTED', 'ARCHIVED'].includes(folder.status);
    const isPublic = folder.accessScope === 'PUBLIC';
    const isDeptMatch = folder.accessScope === 'DEPARTMENT' && folder.department?.toString() === req.user?.department?.toString();
    const isUserAllowed = folder.allowedUsers?.some(u => u.toString() === req.user?._id?.toString());
    const isDeptAllowed = folder.allowedDepartments?.some(d => d.toString() === req.user?.department?.toString());

    if (!isCreator && !(isManagerOrAdmin && isSubmittedOrArchived) && !isPublic && !isDeptMatch && !isUserAllowed && !isDeptAllowed) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền xem hồ sơ này.',
      });
    }

    return res.json({ success: true, data: folder });
  } catch (error) {
    console.error('Lỗi getArchiveFolderById:', error);
    return res.status(500).json({ success: false, message: 'Lỗi khi tải chi tiết hồ sơ' });
  }
};

/**
 * Tạo mới hồ sơ lưu trữ
 */
const createArchiveFolder = async (req, res) => {
  try {
    const { folderCode, title, academicYear, retentionPeriod, department, description, accessScope, allowedDepartments, allowedUsers } = req.body;
    const userId = req.user?._id || req.user?.id;

    if (!folderCode || !title) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập Mã hồ sơ và Tiêu đề hồ sơ' });
    }

    const existing = await ArchiveFolder.findOne({ folderCode: folderCode.trim() });
    if (existing) {
      return res.status(400).json({ success: false, message: `Mã hồ sơ "${folderCode}" đã tồn tại trên hệ thống!` });
    }

    const newFolder = await ArchiveFolder.create({
      folderCode: folderCode.trim(),
      title: title.trim(),
      academicYear: academicYear || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
      retentionPeriod: retentionPeriod || '10 năm',
      department: department || req.user?.department,
      creator: userId,
      description: description || '',
      accessScope: accessScope || 'DEPARTMENT',
      allowedDepartments: Array.isArray(allowedDepartments) ? allowedDepartments : [],
      allowedUsers: Array.isArray(allowedUsers) ? allowedUsers : [],
      status: 'OPEN',
    });

    return res.status(201).json({
      success: true,
      message: 'Tạo hồ sơ lưu trữ thành công',
      data: newFolder,
    });
  } catch (error) {
    console.error('Lỗi createArchiveFolder:', error);
    return res.status(500).json({ success: false, message: 'Lỗi khi tạo hồ sơ lưu trữ', error: error.message });
  }
};

/**
 * Thêm tài liệu hoặc công việc vào hồ sơ lưu trữ
 */
const addItemToFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, itemType, refId, documentNumber, date, author, fileId, fileUrl, pageCount, note } = req.body;

    const folder = await ArchiveFolder.findById(id);
    if (!folder) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ lưu trữ' });
    }

    if (folder.status === 'ARCHIVED') {
      return res.status(400).json({ success: false, message: 'Hồ sơ đã được lưu trữ vĩnh viễn vào kho, không thể bổ sung thêm tài liệu.' });
    }

    folder.items.push({
      title: title || 'Tài liệu không tên',
      itemType: itemType || 'Document',
      refId: refId || null,
      documentNumber: documentNumber || '',
      date: date || new Date(),
      author: author || '',
      fileId: fileId || '',
      fileUrl: fileUrl || '',
      pageCount: pageCount || 1,
      note: note || '',
    });

    await folder.save();

    return res.json({
      success: true,
      message: 'Đã bổ sung tài liệu vào hồ sơ lưu trữ',
      data: folder,
    });
  } catch (error) {
    console.error('Lỗi addItemToFolder:', error);
    return res.status(500).json({ success: false, message: 'Lỗi khi thêm tài liệu vào hồ sơ' });
  }
};

/**
 * Cập nhật trạng thái hồ sơ (Nộp lưu / Duyệt nhập kho / Đóng hồ sơ)
 */
const updateFolderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const folder = await ArchiveFolder.findById(id);
    if (!folder) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ lưu trữ' });
    }

    // Chỉ Admin/Manager mới được duyệt hồ sơ vào kho lưu trữ cơ quan (ARCHIVED)
    if (status === 'ARCHIVED' && !['admin', 'manager'].includes(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Chỉ Quản trị viên hoặc Văn thư Lưu trữ mới có quyền duyệt hồ sơ nhập kho.' });
    }

    folder.status = status;
    if (status === 'ARCHIVED') {
      folder.archivedAt = new Date();
      folder.closedAt = folder.closedAt || new Date();
    } else if (status === 'SUBMITTED') {
      folder.closedAt = new Date();
    }

    await folder.save();

    return res.json({
      success: true,
      message: `Đã chuyển trạng thái hồ sơ sang: ${status}`,
      data: folder,
    });
  } catch (error) {
    console.error('Lỗi updateFolderStatus:', error);
    return res.status(500).json({ success: false, message: 'Lỗi khi cập nhật trạng thái hồ sơ' });
  }
};

/**
 * Xóa hồ sơ (chỉ khi hồ sơ còn ở trạng thái OPEN hoặc DISCARDED)
 */
const deleteArchiveFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const folder = await ArchiveFolder.findById(id);

    if (!folder) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ lưu trữ' });
    }

    if (folder.status === 'ARCHIVED' && req.user?.role !== 'admin') {
      return res.status(400).json({ success: false, message: 'Hồ sơ đã lưu trữ vào kho, chỉ Quản trị viên cấp cao mới có quyền xử lý.' });
    }

    await ArchiveFolder.findByIdAndDelete(id);

    return res.json({
      success: true,
      message: 'Đã xóa hồ sơ lưu trữ thành công',
    });
  } catch (error) {
    console.error('Lỗi deleteArchiveFolder:', error);
    return res.status(500).json({ success: false, message: 'Lỗi khi xóa hồ sơ lưu trữ' });
  }
};

module.exports = {
  getArchiveFolders,
  getArchiveFolderById,
  createArchiveFolder,
  addItemToFolder,
  updateFolderStatus,
  deleteArchiveFolder,
};
