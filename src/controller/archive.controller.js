const ArchiveFolder = require('../models/archiveFolder.model');
const Document = require('../models/document.model');
const Task = require('../models/task.model');
const Department = require('../models/department.model');
const mongoose = require('mongoose');

/**
 * Lấy danh sách hồ sơ lưu trữ (hỗ trợ phân trang, lọc theo năm học, phòng ban, trạng thái)
 */
const getArchiveFolders = async (req, res) => {
  try {
    const { page = 1, limit = 100, academicYear, department, status, search, startDate, endDate } = req.query;
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

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
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

    // Xử lý an toàn ID đơn vị của folder (kể cả khi đã populate thành object) và của user
    const folderDeptId = (folder.department?._id || folder.department)?.toString();
    const userDeptId = (req.user?.department?._id || req.user?.department)?.toString();

    const isDeptMatch = folder.accessScope === 'DEPARTMENT' && folderDeptId && userDeptId && folderDeptId === userDeptId;
    const isUserAllowed = folder.allowedUsers?.some(u => (u?._id || u)?.toString() === req.user?._id?.toString());
    const isDeptAllowed = folder.allowedDepartments?.some(d => (d?._id || d)?.toString() === userDeptId);

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
 * Thêm hàng loạt tài liệu thành phần vào hồ sơ từ file Excel
 */
const batchImportItemsToFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const { items } = req.body;

    const folder = await ArchiveFolder.findById(id);
    if (!folder) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ lưu trữ' });
    }

    if (folder.status === 'ARCHIVED' && req.user?.role !== 'admin') {
      return res.status(400).json({ success: false, message: 'Hồ sơ đã nhập kho, không thể bổ sung tài liệu.' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Dữ liệu tài liệu rỗng hoặc không hợp lệ' });
    }

    let addedCount = 0;
    for (const it of items) {
      const title = (it.title || '').trim();
      if (!title) continue;

      let dateVal = new Date();
      if (it.date) {
        const parsed = new Date(it.date);
        if (!isNaN(parsed.getTime())) {
          dateVal = parsed;
        }
      }

      folder.items.push({
        title,
        documentNumber: (it.documentNumber || '').trim(),
        date: dateVal,
        itemType: (it.itemType || 'Document').trim(),
        pageCount: Number(it.pageCount) > 0 ? Number(it.pageCount) : 1,
        author: (it.author || '').trim(),
        fileUrl: (it.fileUrl || '').trim(),
        fileId: (it.fileId || '').trim(),
        note: (it.note || '').trim(),
      });
      addedCount++;
    }

    await folder.save();

    return res.json({
      success: true,
      message: `Đã import thành công ${addedCount} tài liệu vào hồ sơ`,
      data: folder,
    });
  } catch (error) {
    console.error('Lỗi batchImportItemsToFolder:', error);
    return res.status(500).json({ success: false, message: error.message || 'Lỗi khi import tài liệu thành phần' });
  }
};

/**
 * Cập nhật thông tin hồ sơ (tiêu đề, thời hạn, phạm vi truy cập, đơn vị được xem...)
 */
const updateArchiveFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, academicYear, retentionPeriod, description, accessScope, allowedDepartments, allowedUsers, status } = req.body;

    const folder = await ArchiveFolder.findById(id);
    if (!folder) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ lưu trữ' });
    }

    const userId = req.user?._id || req.user?.id;
    const isCreator = folder.creator?.toString() === userId?.toString();
    const isAdminOrManager = ['admin', 'manager'].includes(req.user?.role);

    // Chỉ người tạo hoặc Admin/Manager mới được chỉnh sửa
    if (!isCreator && !isAdminOrManager) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền chỉnh sửa hồ sơ này' });
    }

    // Nếu hồ sơ đã ARCHIVED thì chỉ admin hoặc manager mới được sửa
    if (folder.status === 'ARCHIVED' && !isAdminOrManager) {
      return res.status(400).json({ success: false, message: 'Hồ sơ đã nhập kho lưu trữ cơ quan, chỉ Quản trị viên/Văn thư mới được điều chỉnh.' });
    }

    if (title) folder.title = title.trim();
    if (academicYear) folder.academicYear = academicYear;
    if (retentionPeriod) folder.retentionPeriod = retentionPeriod;
    if (description !== undefined) folder.description = description;
    if (accessScope) folder.accessScope = accessScope;
    if (allowedDepartments !== undefined) {
      folder.allowedDepartments = Array.isArray(allowedDepartments) ? allowedDepartments : [];
    }
    if (allowedUsers !== undefined) {
      folder.allowedUsers = Array.isArray(allowedUsers) ? allowedUsers : [];
    }
    if (status && isAdminOrManager) {
      folder.status = status;
      if (status === 'ARCHIVED') {
        folder.archivedAt = folder.archivedAt || new Date();
        folder.closedAt = folder.closedAt || new Date();
      } else if (status === 'SUBMITTED') {
        folder.closedAt = folder.closedAt || new Date();
      }
    }

    await folder.save();

    const updated = await ArchiveFolder.findById(id)
      .populate('creator', 'name email role position')
      .populate('department', 'departmentName')
      .populate('allowedDepartments', 'departmentName');

    return res.json({
      success: true,
      message: 'Cập nhật thông tin hồ sơ lưu trữ thành công',
      data: updated,
    });
  } catch (error) {
    console.error('Lỗi updateArchiveFolder:', error);
    return res.status(500).json({ success: false, message: 'Lỗi khi cập nhật hồ sơ lưu trữ' });
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
 * Cập nhật thông tin 1 tài liệu thành phần trong hồ sơ
 */
const updateItemInFolder = async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const { title, itemType, documentNumber, date, pageCount, note, fileUrl } = req.body;

    const folder = await ArchiveFolder.findById(id);
    if (!folder) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ lưu trữ' });
    }

    const item = folder.items.id(itemId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài liệu trong hồ sơ' });
    }

    if (title) item.title = title.trim();
    if (itemType) item.itemType = itemType;
    if (documentNumber !== undefined) item.documentNumber = documentNumber;
    if (date !== undefined) item.date = date ? new Date(date) : item.date;
    if (pageCount !== undefined) item.pageCount = pageCount;
    if (note !== undefined) item.note = note;
    if (fileUrl !== undefined) item.fileUrl = fileUrl;

    await folder.save();

    return res.json({
      success: true,
      message: 'Đã cập nhật tài liệu trong hồ sơ',
      data: folder,
    });
  } catch (error) {
    console.error('Lỗi updateItemInFolder:', error);
    return res.status(500).json({ success: false, message: 'Lỗi khi cập nhật tài liệu trong hồ sơ' });
  }
};

/**
 * Xóa 1 tài liệu thành phần khỏi hồ sơ lưu trữ
 */
const removeItemFromFolder = async (req, res) => {
  try {
    const { id, itemId } = req.params;

    const folder = await ArchiveFolder.findById(id);
    if (!folder) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ lưu trữ' });
    }

    // Dùng subdocument remove hoặc filter an toàn
    if (folder.items && folder.items.id) {
      const item = folder.items.id(itemId);
      if (item) {
        if (typeof item.deleteOne === 'function') {
          item.deleteOne();
        } else if (typeof item.remove === 'function') {
          item.remove();
        } else {
          folder.items = folder.items.filter(it => it._id && it._id.toString() !== itemId.toString());
        }
      } else {
        folder.items = folder.items.filter(it => it._id && it._id.toString() !== itemId.toString());
      }
    } else {
      folder.items = folder.items.filter(it => it._id && it._id.toString() !== itemId.toString());
    }

    await folder.save();

    return res.json({
      success: true,
      message: 'Đã xóa tài liệu khỏi danh mục hồ sơ',
      data: folder,
    });
  } catch (error) {
    console.error('Lỗi removeItemFromFolder:', error);
    return res.status(500).json({ success: false, message: error.message || 'Lỗi khi xóa tài liệu khỏi hồ sơ' });
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

/**
 * Nhập danh mục hồ sơ hàng loạt từ Excel
 */
const batchImportArchiveFolders = async (req, res) => {
  try {
    const { folders } = req.body;
    if (!folders || !Array.isArray(folders) || folders.length === 0) {
      return res.status(400).json({ success: false, message: 'Dữ liệu hồ sơ import không hợp lệ hoặc rỗng' });
    }

    // Load tất cả phòng ban để map ID
    const departments = await Department.find({}).lean();
    const deptMap = new Map();
    departments.forEach((dept) => {
      if (dept.departmentName) {
        deptMap.set(dept.departmentName.trim().toLowerCase(), dept._id);
      }
      if (dept.name) {
        deptMap.set(dept.name.trim().toLowerCase(), dept._id);
      }
      if (dept.departmentCode) {
        deptMap.set(dept.departmentCode.trim().toLowerCase(), dept._id);
      }
      if (dept.code) {
        deptMap.set(dept.code.trim().toLowerCase(), dept._id);
      }
    });

    const results = {
      total: folders.length,
      successCount: 0,
      failedCount: 0,
      errors: [],
      created: [],
    };

    const validRetentionPeriods = ['Vĩnh viễn', '70 năm', '50 năm', '20 năm', '10 năm', '5 năm'];

    for (let i = 0; i < folders.length; i++) {
      const item = folders[i];
      const rowNum = i + 1;
      const folderCode = (item.folderCode || '').trim();
      const title = (item.title || '').trim();

      if (!folderCode) {
        results.failedCount++;
        results.errors.push(`Dòng ${rowNum}: Thiếu mã hồ sơ`);
        continue;
      }

      if (!title) {
        results.failedCount++;
        results.errors.push(`Dòng ${rowNum} (${folderCode}): Thiếu tiêu đề hồ sơ`);
        continue;
      }

      // Kiểm tra trùng lặp mã hồ sơ
      const existing = await ArchiveFolder.findOne({ folderCode });
      if (existing) {
        results.failedCount++;
        results.errors.push(`Dòng ${rowNum} (${folderCode}): Mã hồ sơ đã tồn tại trong hệ thống`);
        continue;
      }

      // Xử lý đơn vị
      let deptId = null;
      if (item.department) {
        const rawDept = String(item.department).trim().toLowerCase();
        deptId = deptMap.get(rawDept) || null;
      }
      if (!deptId) {
        deptId = req.user?.department || null;
      }

      // Xử lý thời hạn bảo quản
      let retentionPeriod = (item.retentionPeriod || '10 năm').trim();
      if (!validRetentionPeriods.includes(retentionPeriod)) {
        // Cố gắng chuẩn hóa
        const matched = validRetentionPeriods.find(p => p.toLowerCase().includes(retentionPeriod.toLowerCase()));
        retentionPeriod = matched || '10 năm';
      }

      // Xử lý phạm vi truy cập
      let accessScope = 'DEPARTMENT';
      const rawScope = String(item.accessScope || '').trim().toUpperCase();
      if (rawScope.includes('PUBLIC') || rawScope.includes('TOÀN') || rawScope.includes('CÔNG KHAI')) {
        accessScope = 'PUBLIC';
      } else if (rawScope.includes('RESTRICTED') || rawScope.includes('CHỈ ĐỊNH') || rawScope.includes('GIỚI HẠN')) {
        accessScope = 'RESTRICTED';
      }

      const newFolder = new ArchiveFolder({
        folderCode,
        title,
        academicYear: item.academicYear || '2025-2026',
        retentionPeriod,
        department: deptId,
        creator: req.user?._id,
        status: 'OPEN',
        accessScope,
        description: item.description || '',
        items: [],
      });

      await newFolder.save();
      results.successCount++;
      results.created.push(newFolder);
    }

    return res.json({
      success: true,
      message: `Đã import thành công ${results.successCount}/${results.total} hồ sơ`,
      data: results,
    });
  } catch (error) {
    console.error('Lỗi batchImportArchiveFolders:', error);
    return res.status(500).json({ success: false, message: error.message || 'Lỗi xử lý import hồ sơ lưu trữ' });
  }
};

module.exports = {
  getArchiveFolders,
  getArchiveFolderById,
  createArchiveFolder,
  updateArchiveFolder,
  addItemToFolder,
  updateItemInFolder,
  removeItemFromFolder,
  updateFolderStatus,
  deleteArchiveFolder,
  batchImportArchiveFolders,
  batchImportItemsToFolder,
};
