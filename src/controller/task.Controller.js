const Task = require("../models/task.model");
const User = require("../models/user.model");
const Department = require("../models/department.model");
const Position = require("../models/position.model");
const { google } = require("googleapis");
const { Readable } = require("stream");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

const DriveConfig = require('../models/driveConfig.model');

// Lấy Folder ID từ DB, nếu không có lấy từ .env
async function getDriveFolderId() {
    const config = await DriveConfig.findOne();
    if (config && config.folderId) return config.folderId;
    return process.env.DRIVE_FOLDER_ID;
}

// Google Drive Authentication using Service Account
async function authorize() {
    const config = await DriveConfig.findOne();
    if (!config || !config.clientEmail || !config.privateKey) {
      throw new Error(`Chưa cấu hình Service Account cho Google Drive. Vui lòng vào Cấu hình Google Drive để thiết lập.`);
    }

    const auth = new google.auth.JWT({
        email: config.clientEmail,
        key: config.privateKey.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/drive'],
    });
    
    return auth;
}

// Helper function to sanitize file names
function sanitizeFileName(str) {
  if (!str) return "";
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
  str = str.replace(/đ/g, "d");
  str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
  str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
  str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
  str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
  str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
  str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
  str = str.replace(/Đ/g, "D");
  str = str.replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, ""); // ̀ ́ ̃ ̉ ̣  huyền, sắc, ngã, hỏi, nặng
  str = str.replace(/\u02C6|\u0306|\u031B/g, ""); // ˆ ̆ ̛  Â, Ê, Ă, Ơ, Ư
  // Remove special characters, replace spaces with hyphens
  str = str.replace(/!|@|%|\^|\*|\(|\)|\+|\=|\<|\>|\?|\/|,|\:|\;|\'|\"|\&|\#|\[|\]|~|\$|_|`|{|}|\||\\/g, "-");
  str = str.replace(/ +/g, " ");
  str = str.trim();
  str = str.replace(/\s+/g, '-');
  str = str.replace(/-+/g, '-');
  return str;
}

function formatDateStr(d) {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date);
  } catch (e) {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  }
}

async function getOrCreateMonthFolder(drive) {
  const date = new Date();
  const folderName = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const parentId = await getDriveFolderId();
  if (!parentId) throw new Error("Thư mục lưu trữ (Folder ID) chưa được cấu hình.");

  const query = `name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const response = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    spaces: 'drive',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });

  if (response.data.files && response.data.files.length > 0) {
    return response.data.files[0].id;
  }

  const folderMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentId],
  };

  const createResponse = await drive.files.create({
    requestBody: folderMetadata,
    fields: 'id',
    supportsAllDrives: true
  });

  return createResponse.data.id;
}

// Tự động đồng bộ người thực hiện công việc con vào danh sách người phối hợp (collaborators)
function syncCollaboratorsWithSubtasks(assignees = [], collaborators = [], subtasks = []) {
    const assigneeIds = new Set((assignees || []).map(a => (a._id || a).toString()));
    const collabIds = new Set((collaborators || []).map(c => (c._id || c).toString()));
    const newCollaborators = [...(collaborators || [])];

    if (Array.isArray(subtasks)) {
        subtasks.forEach(s => {
            if (s && s.assignee) {
                const subAssigneeId = (s.assignee._id || s.assignee).toString();
                if (!assigneeIds.has(subAssigneeId) && !collabIds.has(subAssigneeId)) {
                    newCollaborators.push(s.assignee._id || s.assignee);
                    collabIds.add(subAssigneeId);
                }
            }
        });
    }
    return newCollaborators;
}

// Hàm tính số ngày làm việc bị trễ (bỏ qua Thứ Bảy và Chủ Nhật theo Phụ lục 4)
function getWorkingDaysLate(completedDate, deadlineDate) {
    if (!completedDate || !deadlineDate) return 0;
    const comp = new Date(completedDate);
    const dead = new Date(deadlineDate);
    dead.setHours(23, 59, 59, 999);
    
    if (comp.getTime() <= dead.getTime()) return 0;

    let cur = new Date(dead);
    cur.setDate(cur.getDate() + 1);
    cur.setHours(0, 0, 0, 0);

    const compEnd = new Date(comp);
    compEnd.setHours(0, 0, 0, 0);

    let workingDays = 0;
    while (cur <= compEnd) {
        const day = cur.getDay();
        if (day !== 0 && day !== 6) {
            workingDays++;
        }
        cur.setDate(cur.getDate() + 1);
    }
    return Math.max(1, workingDays);
}

// Hàm tính Tiến độ % theo Phụ lục 4
function calculateProgressRate(isDone, workingDaysLate, isOverdue) {
    if (isDone) {
        if (workingDaysLate <= 0) return 100; // Hoàn thành đúng/trước hạn: 100%
        if (workingDaysLate <= 3) return 80;  // Chậm 1 - 3 ngày làm việc: 80%
        if (workingDaysLate <= 5) return 60;  // Chậm 4 - 5 ngày làm việc: 60%
        return 0;                             // Chậm trên 5 ngày làm việc: 0%
    } else {
        if (isOverdue) {
            if (workingDaysLate <= 3) return 60;
            if (workingDaysLate <= 5) return 40;
            return 0;
        }
        return 70; // Đang thực hiện trong hạn
    }
}

const createTask = async (req, res) => {
    try {
        const { title, description, notes, startDate, endDate, relatedDocument, priority } = req.body;
        const createdBy = req.user ? req.user._id : req.body.createdBy;

        const parseJSON = (data) => {
          try {
            return typeof data === "string" ? JSON.parse(data) : data;
          } catch (error) {
            return [];
          }
        };

        const parsedAssignees = parseJSON(req.body.assignees);
        const assignees = (Array.isArray(parsedAssignees) && parsedAssignees.length > 0)
            ? parsedAssignees
            : (createdBy ? [createdBy] : []);
        let collaborators = parseJSON(req.body.collaborators);

        let uploadedFiles = [];
        if (req.body.uploadedFiles) {
            const parsedUploadedFiles = parseJSON(req.body.uploadedFiles);
            if (Array.isArray(parsedUploadedFiles)) {
                uploadedFiles = [...parsedUploadedFiles];
            }
        }

        if (req.files && req.files.length > 0) {
            const auth = await authorize();
            const drive = google.drive({ version: "v3", auth });
            const monthFolderId = await getOrCreateMonthFolder(drive);

            for (const file of req.files) {
                const fileMetadata = {
                    name: sanitizeFileName(file.originalname),
                    parents: [monthFolderId],
                };

                const media = {
                    mimeType: file.mimetype,
                    body: Readable.from(file.buffer),
                };

                const response = await drive.files.create({
                    requestBody: fileMetadata,
                    media: media,
                    fields: "id, name, mimeType, size",
                    supportsAllDrives: true
                });

                uploadedFiles.push({
                    fileId: response.data.id,
                    fileName: response.data.name,
                    fileMimeType: response.data.mimeType,
                });
            }
        }

        let subtasks = [];
        if (req.body.subtasks) {
            const parsedSubtasks = parseJSON(req.body.subtasks);
            if (Array.isArray(parsedSubtasks)) {
                subtasks = parsedSubtasks.map(s => ({
                    title: s.title ? s.title.trim() : "",
                    assignee: s.assignee || null,
                    startDate: s.startDate ? new Date(s.startDate) : null,
                    endDate: s.endDate ? new Date(s.endDate) : null,
                    status: s.status || "TODO",
                    createdBy: createdBy,
                    createdAt: new Date()
                })).filter(s => s.title);
            }
        }

        // Đồng bộ người thực hiện công việc con vào danh sách người phối hợp nếu chưa có
        collaborators = syncCollaboratorsWithSubtasks(assignees, collaborators, subtasks);

        // Các trường theo Phụ lục 3 & Phụ lục 4
        const taskType = req.body.taskType === 'URGENT' ? 'URGENT' : 'REGULAR';
        const baseScore = req.body.baseScore !== undefined ? Number(req.body.baseScore) : (taskType === 'URGENT' ? 12 : 10);
        const outputResult = req.body.outputResult ? String(req.body.outputResult).trim() : '';
        const difficultyRate = req.body.difficultyRate !== undefined ? Number(req.body.difficultyRate) : 1.0;

        const newTask = new Task({
            title,
            description,
            notes,
            startDate,
            endDate,
            assignees,
            collaborators,
            subtasks,
            files: uploadedFiles,
            relatedDocument,
            priority: priority || 'NORMAL',
            taskType,
            baseScore,
            outputResult,
            difficultyRate,
            createdBy,
            history: [{
                action: 'Tạo mới',
                user: createdBy,
                details: subtasks.length > 0 ? `Khởi tạo công việc kèm ${subtasks.length} công việc con` : 'Khởi tạo công việc',
                timestamp: new Date()
            }]
        });

        await newTask.save();
        
        try {
            const populatedTask = await Task.findById(newTask._id)
                .populate("assignees", "name email emailNotifications")
                .populate("collaborators", "name email emailNotifications");
                
            const uniqueUsersMap = new Map();
            if (populatedTask.assignees) populatedTask.assignees.forEach(u => uniqueUsersMap.set(u._id.toString(), u));
            if (populatedTask.collaborators) populatedTask.collaborators.forEach(u => uniqueUsersMap.set(u._id.toString(), u));
            
            // Lấy thêm thông tin người tạo nếu chưa có
            if (!uniqueUsersMap.has(createdBy.toString())) {
                const creatorUser = await User.findById(createdBy);
                if (creatorUser) {
                    uniqueUsersMap.set(creatorUser._id.toString(), creatorUser);
                }
            }
            
            const uniqueUsers = Array.from(uniqueUsersMap.values());
            
            const { sendTaskNotificationEmail } = require('../service/NodeMailer.service/email');
            const { syncTaskToGoogleCalendar } = require('../service/Notification.service');
            if (uniqueUsers.length > 0) {
                sendTaskNotificationEmail(uniqueUsers, populatedTask, 'create');
                syncTaskToGoogleCalendar(populatedTask, uniqueUsers);
            }
        } catch (emailErr) {
            console.error("Lỗi gửi email tạo task:", emailErr);
        }

        const fullPopulatedTask = await Task.findById(newTask._id)
            .populate("assignees", "name email emailNotifications")
            .populate("collaborators", "name email emailNotifications")
            .populate("createdBy", "name email")
            .populate("history.user", "name email")
            .populate("relatedDocument", "docCode shortDescription files")
            .populate("subtasks.assignee", "name email")
            .populate("subtasks.createdBy", "name email");

        res.status(201).json({ success: true, message: "Task created successfully", data: fullPopulatedTask || newTask });
    } catch (error) {
        console.error("Error creating task:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

const getTasks = async (req, res) => {
    try {
        const userId = (req.user && req.user._id) ? req.user._id : req.query.userId;

        let filter = {};
        if (userId) {
            filter = {
                $or: [
                    { createdBy: userId },
                    { assignees: userId },
                    { collaborators: userId },
                    { "subtasks.assignee": userId }
                ]
            };
        }

        const tasks = await Task.find(filter)
            .populate("assignees", "name email")
            .populate("collaborators", "name email")
            .populate("createdBy", "name email")
            .populate("history.user", "name email")
            .populate("evaluation.evaluatedBy", "name email")
            .populate("relatedDocument", "docCode shortDescription files")
            .populate("subtasks.assignee", "name email")
            .populate("subtasks.createdBy", "name email")
            .sort({ updatedAt: -1, completedAt: -1, startDate: -1 });

        res.status(200).json({ success: true, data: tasks });
    } catch (error) {
        console.error("Error fetching tasks:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

const updateTask = async (req, res) => {
    try {
        const { taskId } = req.params;
        const updates = req.body;

        const existingTask = await Task.findById(taskId);
        if (!existingTask) {
            return res.status(404).json({ success: false, message: "Task not found" });
        }

        const parseJSON = (data) => {
          try {
            return typeof data === "string" ? JSON.parse(data) : data;
          } catch (error) {
            return data;
          }
        };

        if (updates.assignees) updates.assignees = parseJSON(updates.assignees);
        if (updates.collaborators) updates.collaborators = parseJSON(updates.collaborators);
        if (updates.subtasks) updates.subtasks = parseJSON(updates.subtasks);

        let updatedFiles = existingTask.files || [];
        if (req.body.existingFiles) {
            const parsedExistingFiles = parseJSON(req.body.existingFiles);
            updatedFiles = parsedExistingFiles;
        }

        if (req.body.uploadedFiles) {
            const parsedUploadedFiles = parseJSON(req.body.uploadedFiles);
            if (Array.isArray(parsedUploadedFiles)) {
                updatedFiles = [...updatedFiles, ...parsedUploadedFiles];
            }
        }

        if (req.files && req.files.length > 0) {
            const auth = await authorize();
            const drive = google.drive({ version: "v3", auth });
            const monthFolderId = await getOrCreateMonthFolder(drive);

            for (const file of req.files) {
                const fileMetadata = {
                    name: sanitizeFileName(file.originalname),
                    parents: [monthFolderId],
                };

                const media = {
                    mimeType: file.mimetype,
                    body: Readable.from(file.buffer),
                };

                const response = await drive.files.create({
                    requestBody: fileMetadata,
                    media: media,
                    fields: "id, name, mimeType, size",
                    supportsAllDrives: true
                });

                updatedFiles.push({
                    fileId: response.data.id,
                    fileName: response.data.name,
                    fileMimeType: response.data.mimeType,
                });
            }
        }
        
        updates.files = updatedFiles;

        const updater = req.user ? req.user._id : (req.body.updatedBy || existingTask.createdBy);
        const currentUserRole = req.user ? req.user.role : '';

        // 1. Kiểm tra quyền thay đổi thời gian: Chỉ người tạo, người chủ trì (assignees) hoặc admin/manager
        const isCreator = existingTask.createdBy && (existingTask.createdBy._id || existingTask.createdBy).toString() === updater.toString();
        const isAssignee = Array.isArray(existingTask.assignees) && existingTask.assignees.some(a => (a._id || a).toString() === updater.toString());
        const isAdminOrManager = ['admin', 'manager'].includes(currentUserRole);

        const oldStart = existingTask.startDate ? new Date(existingTask.startDate).getTime() : 0;
        const newStart = updates.startDate ? new Date(updates.startDate).getTime() : oldStart;
        const startDiff = Math.abs(oldStart - newStart);

        const oldEnd = existingTask.endDate ? new Date(existingTask.endDate).getTime() : 0;
        const newEnd = updates.endDate ? new Date(updates.endDate).getTime() : oldEnd;
        const endDiff = Math.abs(oldEnd - newEnd);

        const isTimeModified = (startDiff > 59000) || (endDiff > 59000);

        if (isTimeModified && !isCreator && !isAssignee && !isAdminOrManager) {
            return res.status(403).json({
                success: false,
                message: "Chỉ người tạo công việc và người chủ trì mới được phép thay đổi thời gian thực hiện."
            });
        }

        // 2. Thu thập danh sách thay đổi chi tiết
        const changes = [];

        // Thay đổi trạng thái
        let statusChanged = false;
        if (updates.status && updates.status !== existingTask.status) {
            // Ràng buộc: Không thể hoàn thành công việc lớn khi còn công việc con chưa hoàn thành
            if (updates.status === 'DONE') {
                const effectiveSubtasks = updates.subtasks !== undefined ? updates.subtasks : (existingTask.subtasks || []);
                const hasUnfinishedSubtasks = Array.isArray(effectiveSubtasks) && effectiveSubtasks.some(s => s.status !== 'DONE');
                if (hasUnfinishedSubtasks) {
                    return res.status(400).json({
                        success: false,
                        message: "Không thể hoàn thành công việc lớn khi còn công việc con chưa hoàn thành. Vui lòng hoàn thành tất cả công việc con trước."
                    });
                }
            }

            statusChanged = true;
            const statusLabels = { 'TODO': 'Chưa làm', 'IN_PROGRESS': 'Đang làm', 'DONE': 'Hoàn thành' };
            const oldStatus = statusLabels[existingTask.status] || existingTask.status;
            const newStatus = statusLabels[updates.status] || updates.status;
            changes.push(`Chuyển trạng thái từ "${oldStatus}" sang "${newStatus}"`);

            if (updates.status === 'DONE') {
                if (!updates.completedAt) {
                    updates.completedAt = new Date();
                }
            } else if (existingTask.status === 'DONE') {
                updates.completedAt = null;
            }
        }

        // Thay đổi công việc con
        if (updates.subtasks && Array.isArray(updates.subtasks)) {
            const oldLen = (existingTask.subtasks || []).length;
            const newLen = updates.subtasks.length;
            if (existingTask.status === 'DONE' && newLen > oldLen) {
                return res.status(400).json({
                    success: false,
                    message: "Công việc đã hoàn thành, không thể thêm công việc con mới."
                });
            }
            if (oldLen !== newLen) {
                changes.push(`Cập nhật danh sách công việc con (${newLen} việc con)`);
            }
        }

        // Thay đổi thời gian thực hiện
        let timeChanged = false;
        if (isTimeModified) {
            timeChanged = true;
            const timeParts = [];
            if (startDiff > 59000 && endDiff > 59000) {
                timeParts.push(`Từ [${formatDateStr(existingTask.startDate)} - ${formatDateStr(existingTask.endDate)}] sang [${formatDateStr(updates.startDate)} - ${formatDateStr(updates.endDate)}]`);
            } else if (endDiff > 59000) {
                timeParts.push(`Hạn hoàn thành từ ${formatDateStr(existingTask.endDate)} sang ${formatDateStr(updates.endDate)}`);
            } else if (startDiff > 59000) {
                timeParts.push(`Ngày bắt đầu từ ${formatDateStr(existingTask.startDate)} sang ${formatDateStr(updates.startDate)}`);
            }

            let timeLog = `Thay đổi thời gian: ${timeParts.join(', ')}`;
            const timeReason = req.body.timeChangeReason || updates.timeChangeReason;
            if (timeReason && timeReason.trim()) {
                timeLog += `. Lý do: "${timeReason.trim()}"`;
                updates.timeChangeReason = timeReason.trim();
            }
            changes.push(timeLog);
        }

        // Thay đổi tệp đính kèm
        const oldFiles = Array.isArray(existingTask.files) ? existingTask.files : [];
        const newFiles = Array.isArray(updatedFiles) ? updatedFiles : [];
        const oldFileIds = new Set(oldFiles.map(f => f.fileId).filter(Boolean));
        const newFileIds = new Set(newFiles.map(f => f.fileId).filter(Boolean));

        const addedFiles = newFiles.filter(f => f.fileId && !oldFileIds.has(f.fileId));
        if (addedFiles.length > 0) {
            const addedNames = addedFiles.map(f => f.fileName || 'Tệp mới').join(', ');
            changes.push(`Thêm tệp đính kèm: ${addedNames}`);
        }

        const removedFiles = oldFiles.filter(f => f.fileId && !newFileIds.has(f.fileId));
        if (removedFiles.length > 0) {
            const removedNames = removedFiles.map(f => f.fileName || 'Tệp').join(', ');
            changes.push(`Xóa tệp đính kèm: ${removedNames}`);
        }

        // Thay đổi tiêu đề
        let titleChanged = false;
        if (updates.title && updates.title.trim() !== (existingTask.title || '').trim()) {
            titleChanged = true;
            changes.push(`Đổi tiêu đề từ "${existingTask.title}" sang "${updates.title.trim()}"`);
        }

        // Thay đổi mức độ ưu tiên
        let priorityChanged = false;
        const priorityLabels = { 'NORMAL': 'Bình thường', 'URGENT': 'Khẩn', 'FLASH': 'Hỏa tốc' };
        if (updates.priority && updates.priority !== existingTask.priority) {
            priorityChanged = true;
            const oldP = priorityLabels[existingTask.priority] || existingTask.priority;
            const newP = priorityLabels[updates.priority] || updates.priority;
            changes.push(`Thay đổi mức độ ưu tiên từ "${oldP}" sang "${newP}"`);
        }

        // Thay đổi người thực hiện
        let assigneesChanged = false;
        if (updates.assignees && Array.isArray(updates.assignees)) {
            const oldIds = (existingTask.assignees || []).map(a => (a._id || a).toString()).sort();
            const newIds = updates.assignees.map(a => (a._id || a).toString()).sort();
            if (JSON.stringify(oldIds) !== JSON.stringify(newIds)) {
                assigneesChanged = true;
                const addedIds = newIds.filter(id => !oldIds.includes(id));
                const removedIds = oldIds.filter(id => !newIds.includes(id));
                const aParts = [];
                if (addedIds.length > 0) {
                    const addedUsers = await User.find({ _id: { $in: addedIds } }).select('name');
                    aParts.push(`Thêm: ${addedUsers.map(u => u.name).join(', ')}`);
                }
                if (removedIds.length > 0) {
                    const removedUsers = await User.find({ _id: { $in: removedIds } }).select('name');
                    aParts.push(`Bớt: ${removedUsers.map(u => u.name).join(', ')}`);
                }
                changes.push(`Cập nhật người thực hiện (${aParts.join('; ') || 'Thay đổi danh sách'})`);
            }
        }

        // Tự động đồng bộ người thực hiện việc con vào danh sách người phối hợp
        const effectiveAssignees = updates.assignees || existingTask.assignees || [];
        const baseCollaborators = updates.collaborators !== undefined ? updates.collaborators : (existingTask.collaborators || []);
        const effectiveSubtasks = updates.subtasks !== undefined ? updates.subtasks : (existingTask.subtasks || []);
        updates.collaborators = syncCollaboratorsWithSubtasks(effectiveAssignees, baseCollaborators, effectiveSubtasks);

        // Thay đổi người phối hợp
        let collaboratorsChanged = false;
        if (updates.collaborators && Array.isArray(updates.collaborators)) {
            const oldIds = (existingTask.collaborators || []).map(c => (c._id || c).toString()).sort();
            const newIds = updates.collaborators.map(c => (c._id || c).toString()).sort();
            if (JSON.stringify(oldIds) !== JSON.stringify(newIds)) {
                collaboratorsChanged = true;
                const addedIds = newIds.filter(id => !oldIds.includes(id));
                const removedIds = oldIds.filter(id => !newIds.includes(id));
                const cParts = [];
                if (addedIds.length > 0) {
                    const addedUsers = await User.find({ _id: { $in: addedIds } }).select('name');
                    cParts.push(`Thêm: ${addedUsers.map(u => u.name).join(', ')}`);
                }
                if (removedIds.length > 0) {
                    const removedUsers = await User.find({ _id: { $in: removedIds } }).select('name');
                    cParts.push(`Bớt: ${removedUsers.map(u => u.name).join(', ')}`);
                }
                changes.push(`Cập nhật người phối hợp (${cParts.join('; ') || 'Thay đổi danh sách'})`);
            }
        }

        // Thay đổi mô tả / ghi chú
        let descChanged = false;
        if (updates.description !== undefined && updates.description !== existingTask.description) {
            descChanged = true;
            changes.push('Cập nhật mô tả nội dung công việc');
        }
        if (updates.notes !== undefined && updates.notes !== existingTask.notes) {
            changes.push('Cập nhật ghi chú công việc');
        }

        // Thay đổi loại công việc & hệ số độ khó (Phụ lục 3 & 4)
        if (updates.taskType !== undefined) {
            updates.taskType = updates.taskType === 'URGENT' ? 'URGENT' : 'REGULAR';
            if (updates.baseScore === undefined) {
                updates.baseScore = updates.taskType === 'URGENT' ? 12 : 10;
            }
            if (updates.taskType !== existingTask.taskType) {
                changes.push(`Đổi loại công việc sang "${updates.taskType === 'URGENT' ? 'Đột xuất (12đ)' : 'Thường xuyên (10đ)'}"`);
            }
        }
        if (updates.baseScore !== undefined) {
            updates.baseScore = Number(updates.baseScore);
        }
        if (updates.outputResult !== undefined) {
            updates.outputResult = String(updates.outputResult).trim();
            if (updates.outputResult !== (existingTask.outputResult || '')) {
                changes.push(`Cập nhật kết quả đầu ra: "${updates.outputResult}"`);
            }
        }
        if (updates.difficultyRate !== undefined) {
            updates.difficultyRate = Number(updates.difficultyRate);
            if (updates.difficultyRate !== existingTask.difficultyRate) {
                changes.push(`Thay đổi hệ số độ khó thành ${updates.difficultyRate}`);
            }
        }

        // 3. Xác định tên hành động và chi tiết
        let action = 'Cập nhật';
        let details = 'Cập nhật thông tin công việc';

        if (changes.length === 1) {
            if (statusChanged) action = 'Cập nhật trạng thái';
            else if (timeChanged) action = 'Thay đổi thời gian';
            else if (addedFiles.length > 0 && removedFiles.length > 0) action = 'Cập nhật tệp đính kèm';
            else if (addedFiles.length > 0) action = 'Thêm tệp đính kèm';
            else if (removedFiles.length > 0) action = 'Xóa tệp đính kèm';
            else if (titleChanged) action = 'Sửa tiêu đề';
            else if (priorityChanged) action = 'Thay đổi mức độ';
            else if (assigneesChanged) action = 'Thay đổi người thực hiện';
            else if (collaboratorsChanged) action = 'Thay đổi người phối hợp';
            else if (descChanged) action = 'Cập nhật mô tả';
            details = changes[0];
        } else if (changes.length > 1) {
            if (statusChanged && timeChanged) action = 'Cập nhật trạng thái & thời gian';
            else if (statusChanged) action = 'Cập nhật trạng thái & thông tin';
            else if (timeChanged) action = 'Cập nhật thời gian & thông tin';
            else if (addedFiles.length > 0 || removedFiles.length > 0) action = 'Cập nhật tệp & thông tin';
            else action = 'Cập nhật công việc';
            details = changes.map(c => `• ${c}`).join('\n');
        }

        const historyEntry = {
            action,
            user: updater,
            details,
            timestamp: new Date()
        };

        // Xóa history khỏi updates nếu client gửi lên
        if (updates.history) delete updates.history;

        const updatedTask = await Task.findByIdAndUpdate(taskId, { $set: updates, $push: { history: historyEntry } }, { new: true });

        const populatedTask = await Task.findById(updatedTask._id)
            .populate("assignees", "name email emailNotifications")
            .populate("collaborators", "name email emailNotifications")
            .populate("createdBy", "name email")
            .populate("history.user", "name email")
            .populate("evaluation.evaluatedBy", "name email")
            .populate("relatedDocument", "docCode shortDescription files")
            .populate("subtasks.assignee", "name email")
            .populate("subtasks.createdBy", "name email");

        try {
            const uniqueUsers = [...(populatedTask.assignees || []), ...(populatedTask.collaborators || [])].filter((user, index, self) => 
                index === self.findIndex((t) => (
                    t._id.toString() === user._id.toString()
                ))
            );
            
            let actionType = 'update';
            if (statusChanged) {
                actionType = 'status_change';
            }

            const { sendTaskNotificationEmail } = require('../service/NodeMailer.service/email');
            if (uniqueUsers.length > 0) {
                sendTaskNotificationEmail(uniqueUsers, populatedTask, actionType);
            }
        } catch (emailErr) {
            console.error("Lỗi gửi email cập nhật task:", emailErr);
        }

        res.status(200).json({ success: true, message: "Task updated", data: populatedTask });
    } catch (error) {
        console.error("Error updating task:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

const evaluateTask = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { score, rating, feedback, qualityRate, progressRate, isExceeded, bonusScore } = req.body;

        const existingTask = await Task.findById(taskId);
        if (!existingTask) {
            return res.status(404).json({ success: false, message: "Task not found" });
        }

        if (existingTask.status !== 'DONE') {
            return res.status(400).json({ success: false, message: "Chỉ có thể đánh giá công việc đã hoàn thành." });
        }

        const currentUserId = req.user ? req.user._id : null;
        const currentUserRole = req.user ? req.user.role : null;

        if (currentUserRole === 'chuyenvien') {
            return res.status(403).json({ success: false, message: "Chuyên viên không có quyền đánh giá KPI công việc." });
        }

        const isCreator = currentUserId && existingTask.createdBy.toString() === currentUserId.toString();
        const isManagerOrAdmin = ['admin', 'manager', 'cappho'].includes(currentUserRole);

        if (!isCreator && !isManagerOrAdmin) {
            return res.status(403).json({ success: false, message: "Bạn không có quyền đánh giá công việc này." });
        }

        // 1. Xác định thời điểm hoàn thành
        let completedTime = existingTask.completedAt;
        if (!completedTime) {
            if (Array.isArray(existingTask.history)) {
                const doneEntry = [...existingTask.history].reverse().find(h => 
                    h.details && h.details.includes('Hoàn thành')
                );
                if (doneEntry && doneEntry.timestamp) completedTime = doneEntry.timestamp;
            }
            if (!completedTime) completedTime = existingTask.updatedAt;
        }

        // 2. Tính Tiến độ % (Phụ lục 4)
        const workingDaysLate = getWorkingDaysLate(completedTime, existingTask.endDate);
        const autoProgressRate = calculateProgressRate(true, workingDaysLate, false);
        const effectiveProgressRate = progressRate !== undefined && progressRate !== null 
            ? Number(progressRate) 
            : autoProgressRate;

        // 3. Tính Chất lượng / Kết quả % (Phụ lục 4: 100%, 80%, 60%, 0%)
        let effectiveQualityRate = 100;
        if (qualityRate !== undefined && qualityRate !== null) {
            effectiveQualityRate = Number(qualityRate);
        } else if (score !== undefined && score !== null) {
            effectiveQualityRate = Number(score);
        } else if (rating !== undefined && rating !== null) {
            effectiveQualityRate = Number(rating) * 20;
        }

        // 4. Vượt yêu cầu về tiến độ và chất lượng (Cột 10 Phụ lục 4)
        const endOfDayDeadline = new Date(existingTask.endDate);
        endOfDayDeadline.setHours(23, 59, 59, 999);
        const isCompletedBeforeDeadline = completedTime && (new Date(completedTime).getTime() < endOfDayDeadline.getTime() - 1000 * 60 * 60 * 6);
        const effectiveIsExceeded = isExceeded !== undefined 
            ? Boolean(isExceeded) 
            : (isCompletedBeforeDeadline && effectiveQualityRate === 100);

        // 5. Điểm thưởng đề xuất (Cột 11 Phụ lục 4)
        const effectiveBonusScore = bonusScore !== undefined ? Math.max(0, Number(bonusScore)) : 0;

        // Điểm quy đổi thang 100: 30% tiến độ + 70% kết quả
        const calculatedScore = Math.round((0.3 * effectiveProgressRate) + (0.7 * effectiveQualityRate));
        const calculatedRating = rating !== undefined ? Number(rating) : Math.min(5, Math.max(1, Math.round(calculatedScore / 20)));

        const evaluationData = {
            score: calculatedScore,
            rating: calculatedRating,
            qualityRate: effectiveQualityRate,
            progressRate: effectiveProgressRate,
            isExceeded: effectiveIsExceeded,
            bonusScore: effectiveBonusScore,
            feedback: feedback || '',
            evaluatedBy: currentUserId,
            evaluatedAt: new Date()
        };

        const historyEntry = {
            action: 'Đánh giá KPI',
            user: currentUserId,
            details: `Đánh giá KPI Phụ lục 4: Kết quả ${effectiveQualityRate}%, Tiến độ ${effectiveProgressRate}% (Quy đổi: ${calculatedScore}/100đ)${effectiveIsExceeded ? ' [Vượt yêu cầu (X)]' : ''}${effectiveBonusScore > 0 ? ` [Thưởng: +${effectiveBonusScore}đ]` : ''}. ${feedback ? `Nhận xét: "${feedback}"` : ''}`,
            timestamp: new Date()
        };

        await Task.findByIdAndUpdate(
            taskId,
            { 
                $set: { evaluation: evaluationData },
                $push: { history: historyEntry }
            }
        );

        const populatedTask = await Task.findById(taskId)
            .populate("assignees", "name email emailNotifications")
            .populate("collaborators", "name email emailNotifications")
            .populate("createdBy", "name email")
            .populate("history.user", "name email")
            .populate("evaluation.evaluatedBy", "name email")
            .populate("relatedDocument", "docCode shortDescription files")
            .populate("subtasks.assignee", "name email")
            .populate("subtasks.createdBy", "name email");

        res.status(200).json({ success: true, message: "Đánh giá công việc thành công", data: populatedTask });
    } catch (error) {
        console.error("Error evaluating task:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

const getKpiStats = async (req, res) => {
    try {
        const currentUser = req.user;
        const currentRole = currentUser?.role;

        // Lấy thông tin phòng ban & chức vụ của user hiện tại để xác định vai trò
        let userDeptCode = null;
        let isBGH = currentRole === 'admin' || currentRole === 'manager';
        if (currentUser && currentUser.department) {
            const userDept = await Department.findById(currentUser.department).select("departmentCode departmentName").lean();
            if (userDept) {
                userDeptCode = userDept.departmentCode;
                if (userDeptCode === 'BGH' || (userDept.departmentName && userDept.departmentName.toLowerCase().includes('ban giám hiệu'))) {
                    isBGH = true;
                }
            }
        }
        if (!isBGH && currentUser?.position) {
            const userPos = await Position.findById(currentUser.position).select("positionName abbreviation code").lean();
            if (userPos) {
                const pName = (userPos.positionName || '').toLowerCase();
                const pCode = (userPos.abbreviation || userPos.code || '').toUpperCase();
                if (['HT', 'PHT', 'NHT'].includes(pCode) || pName.includes('hiệu trưởng') || pName.includes('phó hiệu trưởng')) {
                    isBGH = true;
                }
            }
        }

        const isCapTruong = !isBGH && (currentRole === 'staff' || currentRole === 'captruong');
        const isCapPhoOrChuyenVien = !isBGH && !isCapTruong;

        let { month, year, departmentId, userId, quarter } = req.query;

        // Phân quyền dữ liệu theo vai trò:
        // 1. Cấp phó và chuyên viên: CHỈ THẤY THÔNG TIN CÁ NHÂN MÌNH
        if (isCapPhoOrChuyenVien) {
            userId = currentUser?._id ? currentUser._id.toString() : null;
            departmentId = currentUser?.department ? currentUser.department.toString() : null;
        } 
        // 2. Cấp trưởng: CHỈ THẤY THÔNG TIN TRONG ĐƠN VỊ MÌNH
        else if (isCapTruong) {
            departmentId = currentUser?.department ? currentUser.department.toString() : null;
        }
        // 3. BGH / Admin / Manager: Được xem toàn bộ đơn vị và nhân sự

        // Filter khoảng thời gian (Quý, Tháng, Năm theo Phụ lục 3 & 4)
        let dateFilter = {};
        const targetYear = year ? parseInt(year) : new Date().getFullYear();
        if (quarter) {
            const q = parseInt(quarter);
            const startMonth = Math.max(0, Math.min(3, q - 1)) * 3;
            const endMonth = startMonth + 2;
            const startDate = new Date(targetYear, startMonth, 1);
            const endDate = new Date(targetYear, endMonth + 1, 0, 23, 59, 59, 999);
            dateFilter = {
                $or: [
                    { endDate: { $gte: startDate, $lte: endDate } },
                    { completedAt: { $gte: startDate, $lte: endDate } }
                ]
            };
        } else if (month) {
            const targetMonth = parseInt(month) - 1; // 0-indexed
            const startDate = new Date(targetYear, targetMonth, 1);
            const endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);
            dateFilter = {
                $or: [
                    { endDate: { $gte: startDate, $lte: endDate } },
                    { completedAt: { $gte: startDate, $lte: endDate } }
                ]
            };
        } else if (year) {
            const startDate = new Date(targetYear, 0, 1);
            const endDate = new Date(targetYear, 11, 31, 23, 59, 59, 999);
            dateFilter = {
                $or: [
                    { endDate: { $gte: startDate, $lte: endDate } },
                    { completedAt: { $gte: startDate, $lte: endDate } }
                ]
            };
        }

        let userFilter = {
            role: { $nin: [null, ""] },
            email: { $not: /^qlvb@nsgpc\.edu\.vn$/i }
        };
        if (isCapPhoOrChuyenVien) {
            userFilter._id = currentUser._id;
        } else if (isCapTruong) {
            userFilter.department = currentUser.department;
            if (userId && userId !== 'ALL') {
                userFilter._id = userId;
            }
        } else {
            // BGH / Admin / Manager
            if (userId && userId !== 'ALL') {
                userFilter._id = userId;
            } else if (departmentId) {
                userFilter.department = departmentId;
            }
        }

        const users = await User.find(userFilter)
            .select("name email department position role")
            .populate("department", "departmentName departmentCode")
            .populate("position", "positionName")
            .lean();

        const userIds = users.map(u => u._id.toString());

        let taskQuery = { ...dateFilter };
        if (userIds.length > 0) {
            const userMatch = {
                $or: [
                    { assignees: { $in: userIds } },
                    { collaborators: { $in: userIds } },
                    { createdBy: { $in: userIds } },
                    { "subtasks.assignee": { $in: userIds } }
                ]
            };
            if (taskQuery.$or) {
                taskQuery = {
                    $and: [
                        { $or: taskQuery.$or },
                        userMatch
                    ]
                };
            } else {
                taskQuery = { ...taskQuery, ...userMatch };
            }
        }

        const tasks = await Task.find(taskQuery)
            .populate("assignees", "name email department")
            .populate("collaborators", "name email department")
            .populate("createdBy", "name email department")
            .populate("evaluation.evaluatedBy", "name email")
            .populate("subtasks.assignee", "name email department")
            .lean();

        // Khởi tạo bảng thống kê người dùng theo Phụ lục 4
        const userStatsMap = {};
        users.forEach(u => {
            userStatsMap[u._id.toString()] = {
                user: u,
                totalAssignedTasks: 0,
                totalCollaboratedTasks: 0,
                totalTasks: 0,
                completedTasks: 0,
                onTimeTasks: 0,
                lateTasks: 0,
                overdueTasks: 0,
                inProgressTasks: 0,
                totalMaxPossibleScore: 0, // Giá trị A (Tổng điểm quy đổi tối đa)
                totalActualScore: 0,      // Giá trị B (Tổng điểm quy đổi thực tế)
                totalBonusScore: 0,       // Tổng điểm thưởng đề xuất
                totalExceededTasks: 0,    // Số công việc vượt tiến độ/chất lượng
                evaluatedTasksCount: 0,
                totalEvaluationScore: 0,
                kpiScore70: 0,
                kpiScore100: 0,
                kpiScore: 0,
                rank: 'D',
                details: []
            };
        });

        const now = new Date();

        tasks.forEach(task => {
            const isDone = task.status === 'DONE';
            
            // Xác định thời điểm hoàn thành thực tế
            let completedTime = task.completedAt;
            if (!completedTime && isDone) {
                if (Array.isArray(task.history)) {
                    const doneEntry = [...task.history].reverse().find(h => 
                        h.details && h.details.includes('Hoàn thành')
                    );
                    if (doneEntry && doneEntry.timestamp) {
                        completedTime = doneEntry.timestamp;
                    }
                }
                if (!completedTime) completedTime = task.updatedAt;
            }

            // Hạn chót: 23:59:59.999 của ngày endDate
            const endOfDayDeadline = new Date(task.endDate);
            endOfDayDeadline.setHours(23, 59, 59, 999);
            const deadlineTime = endOfDayDeadline.getTime();
            
            let isOnTime = false;
            let isLate = false;
            let isOverdue = false;
            let daysLate = 0;

            if (isDone) {
                const compTime = completedTime ? new Date(completedTime).getTime() : deadlineTime;
                if (compTime <= deadlineTime) {
                    isOnTime = true;
                    daysLate = 0;
                } else {
                    isLate = true;
                    daysLate = getWorkingDaysLate(compTime, deadlineTime);
                }
            } else {
                if (now.getTime() > deadlineTime) {
                    isOverdue = true;
                    daysLate = getWorkingDaysLate(now, deadlineTime);
                }
            }

            // Helper tích lũy dữ liệu cho từng cán bộ theo Phụ lục 4
            const accumulateForUser = (uId, roleType, subtaskInfo = null) => {
                const stat = userStatsMap[uId];
                if (!stat) return;

                let userSubtask = subtaskInfo;
                if (!userSubtask && Array.isArray(task.subtasks)) {
                    userSubtask = task.subtasks.find(st => st.assignee && (st.assignee._id || st.assignee).toString() === uId);
                }

                let effectiveIsDone = isDone;
                let effectiveIsOnTime = isOnTime;
                let effectiveIsLate = isLate;
                let effectiveIsOverdue = isOverdue;
                let effectiveDaysLate = daysLate;

                if (userSubtask) {
                    const subDone = userSubtask.status === 'DONE';
                    const subDeadline = userSubtask.endDate ? new Date(userSubtask.endDate) : endOfDayDeadline;
                    subDeadline.setHours(23, 59, 59, 999);
                    const subDeadlineTime = subDeadline.getTime();
                    const subCompTime = userSubtask.completedAt ? new Date(userSubtask.completedAt).getTime() : subDeadlineTime;

                    if (subDone) {
                        effectiveIsDone = true;
                        if (subCompTime <= subDeadlineTime) {
                            effectiveIsOnTime = true;
                            effectiveIsLate = false;
                            effectiveIsOverdue = false;
                            effectiveDaysLate = 0;
                        } else {
                            effectiveIsOnTime = false;
                            effectiveIsLate = true;
                            effectiveIsOverdue = false;
                            effectiveDaysLate = getWorkingDaysLate(subCompTime, subDeadlineTime);
                        }
                    } else {
                        effectiveIsDone = false;
                        if (now.getTime() > subDeadlineTime) {
                            effectiveIsOverdue = true;
                            effectiveDaysLate = getWorkingDaysLate(now, subDeadlineTime);
                        } else {
                            effectiveDaysLate = 0;
                        }
                    }
                }

                // --- PHỤ LỤC 3 & 4 CÁC TIÊU CHÍ VÀ CÔNG THỨC ---
                const taskType = task.taskType || 'REGULAR';
                const taskTypeName = taskType === 'URGENT' ? 'Đột xuất' : 'Thường xuyên';
                const baseScore = task.baseScore !== undefined ? Number(task.baseScore) : (taskType === 'URGENT' ? 12 : 10); // Cột 3
                const outputResult = task.outputResult || '';
                const difficultyRate = task.difficultyRate !== undefined ? Number(task.difficultyRate) : 1.0; // Cột 4

                // Cột 5: Điểm quy đổi tối đa = Cột 3 * Cột 4
                const maxPossibleScore = Number((baseScore * difficultyRate).toFixed(2));

                // Cột 6: Tiến độ % (100%, 80%, 60%, 0%)
                let effectiveProgressRate = 100;
                if (task.evaluation && task.evaluation.progressRate !== undefined && task.evaluation.progressRate !== null) {
                    effectiveProgressRate = Number(task.evaluation.progressRate);
                } else {
                    effectiveProgressRate = calculateProgressRate(effectiveIsDone, effectiveDaysLate, effectiveIsOverdue);
                }

                // Cột 7: Kết quả % (100%, 80%, 60%, 0%)
                let effectiveQualityRate = 100;
                if (task.evaluation && task.evaluation.qualityRate !== undefined && task.evaluation.qualityRate !== null) {
                    effectiveQualityRate = Number(task.evaluation.qualityRate);
                } else if (task.evaluation && task.evaluation.score !== undefined) {
                    effectiveQualityRate = Number(task.evaluation.score);
                } else if (!effectiveIsDone) {
                    effectiveQualityRate = 50;
                } else {
                    effectiveQualityRate = 80;
                }

                // Cột 8: Điểm thực hiện = Cột 3 * (30% * Cột 6 + 70% * Cột 7)
                const executionScore = Number((baseScore * (0.3 * (effectiveProgressRate / 100) + 0.7 * (effectiveQualityRate / 100))).toFixed(2));

                // Cột 9: Điểm quy đổi thực tế = Cột 8 * Cột 4
                const actualScore = Number((executionScore * difficultyRate).toFixed(2));

                // Cột 10: Vượt yêu cầu về tiến độ/chất lượng ("X")
                let isExceeded = false;
                if (task.evaluation && task.evaluation.isExceeded !== undefined) {
                    isExceeded = Boolean(task.evaluation.isExceeded);
                } else if (effectiveIsDone && effectiveDaysLate <= 0 && effectiveQualityRate === 100) {
                    const deadlineCheck = userSubtask?.endDate ? new Date(userSubtask.endDate) : endOfDayDeadline;
                    const compCheck = userSubtask ? (userSubtask.completedAt ? new Date(userSubtask.completedAt) : null) : (completedTime ? new Date(completedTime) : null);
                    if (compCheck && (compCheck.getTime() < deadlineCheck.getTime() - 1000 * 60 * 60 * 6)) {
                        isExceeded = true;
                    }
                }

                // Cột 11: Đề xuất khen thưởng (Điểm thưởng)
                const bonusScore = (task.evaluation && task.evaluation.bonusScore) ? Number(task.evaluation.bonusScore) : 0;

                if (roleType === 'assignee') {
                    stat.totalAssignedTasks += 1;
                } else {
                    stat.totalCollaboratedTasks += 1;
                }
                stat.totalTasks += 1;

                if (effectiveIsDone) {
                    stat.completedTasks += 1;
                    if (effectiveIsOnTime) stat.onTimeTasks += 1;
                    if (effectiveIsLate) stat.lateTasks += 1;
                } else {
                    if (effectiveIsOverdue) stat.overdueTasks += 1;
                    else stat.inProgressTasks += 1;
                }

                if (task.evaluation && task.evaluation.score !== undefined) {
                    stat.evaluatedTasksCount += 1;
                    stat.totalEvaluationScore += task.evaluation.score;
                }

                stat.totalMaxPossibleScore += maxPossibleScore;
                stat.totalActualScore += actualScore;
                if (isExceeded) stat.totalExceededTasks += 1;
                if (bonusScore > 0) stat.totalBonusScore += bonusScore;

                stat.details.push({
                    taskId: task._id,
                    title: task.title,
                    description: task.description || '',
                    role: roleType,
                    priority: task.priority,
                    status: task.status,
                    startDate: task.startDate,
                    endDate: task.endDate,
                    completedAt: task.completedAt || completedTime,
                    isOnTime: effectiveIsOnTime,
                    isLate: effectiveIsLate,
                    isOverdue: effectiveIsOverdue,
                    daysLate: effectiveDaysLate,
                    // Các trường Phụ lục 3 & 4
                    taskType,
                    taskTypeName,
                    baseScore,
                    outputResult,
                    difficultyRate,
                    maxPossibleScore,
                    progressRate: effectiveProgressRate,
                    qualityRate: effectiveQualityRate,
                    executionScore,
                    actualScore,
                    isExceeded,
                    bonusScore,
                    // Tương thích ngược với UI cũ
                    progressScore: effectiveProgressRate,
                    qualityScore: effectiveQualityRate,
                    combinedTaskScore: Math.round((0.3 * effectiveProgressRate) + (0.7 * effectiveQualityRate)),
                    evaluation: task.evaluation || null,
                    subtaskInfo: userSubtask ? {
                        title: userSubtask.title,
                        status: userSubtask.status,
                        endDate: userSubtask.endDate,
                        completedAt: userSubtask.completedAt
                    } : null
                });
            };

            const processedUserIds = new Set();

            if (Array.isArray(task.assignees) && task.assignees.length > 0) {
                task.assignees.forEach(a => {
                    const id = (a._id || a).toString();
                    accumulateForUser(id, 'assignee');
                    processedUserIds.add(id);
                });
            } else if (task.createdBy) {
                const creatorId = (task.createdBy._id || task.createdBy).toString();
                accumulateForUser(creatorId, 'assignee');
                processedUserIds.add(creatorId);
            }

            if (Array.isArray(task.collaborators)) {
                task.collaborators.forEach(c => {
                    const id = (c._id || c).toString();
                    if (!processedUserIds.has(id)) {
                        accumulateForUser(id, 'collaborator');
                        processedUserIds.add(id);
                    }
                });
            }

            if (Array.isArray(task.subtasks)) {
                task.subtasks.forEach(s => {
                    if (s && s.assignee) {
                        const subAssigneeId = (s.assignee._id || s.assignee).toString();
                        if (!processedUserIds.has(subAssigneeId)) {
                            accumulateForUser(subAssigneeId, 'collaborator', s);
                            processedUserIds.add(subAssigneeId);
                        }
                    }
                });
            }
        });

        // Tính điểm tổng kết theo Phụ lục 4
        const userStats = Object.values(userStatsMap)
            .filter(stat => {
                if (stat.totalTasks <= 0) return false;
                const u = stat.user;
                if (!u || !u.role) return false;
                if (u.email && u.email.toLowerCase() === 'qlvb@nsgpc.edu.vn') return false;
                return true;
            })
            .map(stat => {
                const valA = Number(stat.totalMaxPossibleScore.toFixed(2));
                const valB = Number(stat.totalActualScore.toFixed(2));

                // KPI Thang 70 theo Phụ lục 4: (B / A) * 70 (tối đa 70 điểm)
                const kpiScore70 = valA > 0 ? Number(Math.min(70, (valB / valA) * 70).toFixed(1)) : 0;
                // KPI Thang 100 tương đương: (B / A) * 100 (tối đa 100)
                const kpiScore100 = valA > 0 ? Math.min(100, Math.round((valB / valA) * 100)) : 0;

                // Xếp loại theo Phụ lục 4:
                // Hạng A (Xuất sắc): KPI >= 63 (hoặc >= 90%)
                // Hạng B (Tốt): 52.5 <= KPI < 63 (hoặc 75% - 89%)
                // Hạng C (Đạt): 35 <= KPI < 52.5 (hoặc 50% - 74%)
                // Hạng D (Chưa đạt): KPI < 35 (hoặc < 50%)
                let rank = 'D';
                if (kpiScore70 >= 63) rank = 'A';
                else if (kpiScore70 >= 52.5) rank = 'B';
                else if (kpiScore70 >= 35) rank = 'C';

                const onTimeRate = (stat.onTimeTasks + stat.lateTasks) > 0 
                    ? Math.round((stat.onTimeTasks / (stat.onTimeTasks + stat.lateTasks)) * 100) 
                    : 0;

                const averageQualityScore = stat.evaluatedTasksCount > 0 
                    ? Math.round(stat.totalEvaluationScore / stat.evaluatedTasksCount) 
                    : null;

                return {
                    ...stat,
                    valueA: valA,
                    valueB: valB,
                    kpiScore70,
                    kpiScore100,
                    kpiScore: kpiScore100, // Tương thích ngược
                    rank,
                    onTimeRate,
                    averageQualityScore
                };
            });

        // Sắp xếp theo KPI thang 70 giảm dần
        userStats.sort((a, b) => b.kpiScore70 - a.kpiScore70);

        // Overall summary statistics
        const totalTasksCount = tasks.length;
        const totalCompletedTasks = tasks.filter(t => t.status === 'DONE').length;
        const totalOnTimeTasks = tasks.filter(t => {
            if (t.status !== 'DONE') return false;
            const endOfDay = new Date(t.endDate);
            endOfDay.setHours(23, 59, 59, 999);
            let compTime = t.completedAt;
            if (!compTime) {
                if (Array.isArray(t.history)) {
                    const doneEntry = [...t.history].reverse().find(h => 
                        h.details && h.details.includes('Hoàn thành')
                    );
                    if (doneEntry && doneEntry.timestamp) compTime = doneEntry.timestamp;
                }
                if (!compTime) compTime = t.updatedAt;
            }
            const comp = new Date(compTime);
            return comp.getTime() <= endOfDay.getTime();
        }).length;
        const totalLateTasks = totalCompletedTasks - totalOnTimeTasks;
        const totalOverdueTasks = tasks.filter(t => {
            if (t.status === 'DONE') return false;
            const endOfDay = new Date(t.endDate);
            endOfDay.setHours(23, 59, 59, 999);
            return now.getTime() > endOfDay.getTime();
        }).length;
        const totalInProgressTasks = tasks.filter(t => {
            if (t.status === 'DONE') return false;
            const endOfDay = new Date(t.endDate);
            endOfDay.setHours(23, 59, 59, 999);
            return now.getTime() <= endOfDay.getTime();
        }).length;
        const overallOnTimeRate = totalCompletedTasks > 0 ? Math.round((totalOnTimeTasks / totalCompletedTasks) * 100) : 0;
        
        const overallKpi70Average = userStats.length > 0 
            ? Number((userStats.reduce((sum, u) => sum + (u.kpiScore70 || 0), 0) / userStats.length).toFixed(1))
            : 0;
        const overallKpiAverage = userStats.length > 0 
            ? Math.round(userStats.reduce((sum, u) => sum + (u.kpiScore100 || 0), 0) / userStats.length)
            : 0;
        const totalExceededTasks = userStats.reduce((sum, u) => sum + (u.totalExceededTasks || 0), 0);

        res.status(200).json({
            success: true,
            data: {
                summary: {
                    totalTasksCount,
                    totalCompletedTasks,
                    totalInProgressTasks,
                    totalOnTimeTasks,
                    totalLateTasks,
                    totalOverdueTasks,
                    overallOnTimeRate,
                    overallKpi70Average,
                    overallKpiAverage,
                    totalExceededTasks,
                    totalUsersCount: userStats.length
                },
                leaderboard: userStats
            }
        });
    } catch (error) {
        console.error("Error calculating KPI stats:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

const deleteTask = async (req, res) => {
    try {
        const { taskId } = req.params;
        
        const existingTask = await Task.findById(taskId);
        if (!existingTask) {
            return res.status(404).json({ success: false, message: "Task not found" });
        }
        
        const requestUserId = req.user ? req.user._id.toString() : null;
        if (requestUserId && existingTask.createdBy.toString() !== requestUserId) {
            return res.status(403).json({ success: false, message: "Bạn không có quyền xóa công việc này." });
        }

        await Task.findByIdAndDelete(taskId);

        res.status(200).json({ success: true, message: "Task deleted successfully" });
    } catch (error) {
        console.error("Error deleting task:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

const addSubtask = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { title, assignee, startDate, endDate, status } = req.body;

        if (!title || !title.trim()) {
            return res.status(400).json({ success: false, message: "Tiêu đề công việc con không được để trống." });
        }

        const existingTask = await Task.findById(taskId);
        if (!existingTask) {
            return res.status(404).json({ success: false, message: "Không tìm thấy công việc." });
        }

        if (existingTask.status === 'DONE') {
            return res.status(400).json({ success: false, message: "Công việc đã hoàn thành, không thể thêm công việc con mới." });
        }

        const updater = req.user ? req.user._id : null;
        const newSubtask = {
            title: title.trim(),
            assignee: assignee || null,
            startDate: startDate ? new Date(startDate) : null,
            endDate: endDate ? new Date(endDate) : null,
            status: status || 'TODO',
            completedAt: status === 'DONE' ? new Date() : null,
            createdBy: updater,
            createdAt: new Date()
        };

        let assigneeName = '';
        if (assignee) {
            const assignedUser = await User.findById(assignee).select('name');
            if (assignedUser) assigneeName = ` (Giao cho: ${assignedUser.name})`;
        }

        const historyEntry = {
            action: 'Thêm việc con',
            user: updater,
            details: `Thêm công việc con: "${title.trim()}"${assigneeName}`,
            timestamp: new Date()
        };

        existingTask.subtasks.push(newSubtask);
        existingTask.collaborators = syncCollaboratorsWithSubtasks(existingTask.assignees, existingTask.collaborators, existingTask.subtasks);
        existingTask.history.push(historyEntry);
        await existingTask.save();

        const populatedTask = await Task.findById(existingTask._id)
            .populate("assignees", "name email emailNotifications")
            .populate("collaborators", "name email emailNotifications")
            .populate("createdBy", "name email")
            .populate("history.user", "name email")
            .populate("evaluation.evaluatedBy", "name email")
            .populate("relatedDocument", "docCode shortDescription files")
            .populate("subtasks.assignee", "name email")
            .populate("subtasks.createdBy", "name email");

        res.status(201).json({ success: true, message: "Thêm công việc con thành công", data: populatedTask });
    } catch (error) {
        console.error("Error adding subtask:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

const updateSubtask = async (req, res) => {
    try {
        const { taskId, subtaskId } = req.params;
        const { title, assignee, startDate, endDate, status } = req.body;

        const existingTask = await Task.findById(taskId);
        if (!existingTask) {
            return res.status(404).json({ success: false, message: "Không tìm thấy công việc." });
        }

        if (existingTask.status === 'DONE') {
            return res.status(400).json({ success: false, message: "Công việc đã hoàn thành, không thể chỉnh sửa công việc con." });
        }

        const subtask = existingTask.subtasks.id(subtaskId);
        if (!subtask) {
            return res.status(404).json({ success: false, message: "Không tìm thấy công việc con." });
        }

        const updater = req.user ? req.user._id : null;
        const historyDetails = [];

        if (title && title.trim() !== subtask.title) {
            historyDetails.push(`Đổi tên việc con từ "${subtask.title}" sang "${title.trim()}"`);
            subtask.title = title.trim();
        }

        if (assignee !== undefined) {
            const oldAssigneeId = subtask.assignee ? subtask.assignee.toString() : null;
            const newAssigneeId = assignee ? assignee.toString() : null;
            if (oldAssigneeId !== newAssigneeId) {
                if (newAssigneeId) {
                    const newUser = await User.findById(newAssigneeId).select('name');
                    historyDetails.push(`Phân công việc con "${subtask.title}" cho: ${newUser?.name || 'nhân sự mới'}`);
                } else {
                    historyDetails.push(`Bỏ phân công việc con "${subtask.title}"`);
                }
                subtask.assignee = assignee || null;
            }
        }

        if (startDate !== undefined) {
            subtask.startDate = startDate ? new Date(startDate) : null;
        }
        if (endDate !== undefined) {
            subtask.endDate = endDate ? new Date(endDate) : null;
        }

        if (status && status !== subtask.status) {
            const statusLabels = { 'TODO': 'Chưa làm', 'IN_PROGRESS': 'Đang làm', 'DONE': 'Hoàn thành' };
            historyDetails.push(`Việc con "${subtask.title}": Chuyển trạng thái sang "${statusLabels[status] || status}"`);
            subtask.status = status;
            if (status === 'DONE') {
                subtask.completedAt = new Date();
            } else {
                subtask.completedAt = null;
            }
        }

        if (historyDetails.length > 0) {
            existingTask.history.push({
                action: 'Cập nhật việc con',
                user: updater,
                details: historyDetails.join('; '),
                timestamp: new Date()
            });
        }

        existingTask.collaborators = syncCollaboratorsWithSubtasks(existingTask.assignees, existingTask.collaborators, existingTask.subtasks);
        await existingTask.save();

        const populatedTask = await Task.findById(existingTask._id)
            .populate("assignees", "name email emailNotifications")
            .populate("collaborators", "name email emailNotifications")
            .populate("createdBy", "name email")
            .populate("history.user", "name email")
            .populate("evaluation.evaluatedBy", "name email")
            .populate("relatedDocument", "docCode shortDescription files")
            .populate("subtasks.assignee", "name email")
            .populate("subtasks.createdBy", "name email");

        res.status(200).json({ success: true, message: "Cập nhật công việc con thành công", data: populatedTask });
    } catch (error) {
        console.error("Error updating subtask:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

const deleteSubtask = async (req, res) => {
    try {
        const { taskId, subtaskId } = req.params;

        const existingTask = await Task.findById(taskId);
        if (!existingTask) {
            return res.status(404).json({ success: false, message: "Không tìm thấy công việc." });
        }

        if (existingTask.status === 'DONE') {
            return res.status(400).json({ success: false, message: "Công việc đã hoàn thành, không thể xóa công việc con." });
        }

        const subtask = existingTask.subtasks.id(subtaskId);
        if (!subtask) {
            return res.status(404).json({ success: false, message: "Không tìm thấy công việc con." });
        }

        const updater = req.user ? req.user._id : null;
        const deletedTitle = subtask.title;

        existingTask.subtasks.pull(subtaskId);
        existingTask.history.push({
            action: 'Xóa việc con',
            user: updater,
            details: `Xóa công việc con: "${deletedTitle}"`,
            timestamp: new Date()
        });

        await existingTask.save();

        const populatedTask = await Task.findById(existingTask._id)
            .populate("assignees", "name email emailNotifications")
            .populate("collaborators", "name email emailNotifications")
            .populate("createdBy", "name email")
            .populate("history.user", "name email")
            .populate("evaluation.evaluatedBy", "name email")
            .populate("relatedDocument", "docCode shortDescription files")
            .populate("subtasks.assignee", "name email")
            .populate("subtasks.createdBy", "name email");

        res.status(200).json({ success: true, message: "Đã xóa công việc con", data: populatedTask });
    } catch (error) {
        console.error("Error deleting subtask:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

module.exports = {
    createTask,
    getTasks,
    updateTask,
    evaluateTask,
    getKpiStats,
    deleteTask,
    addSubtask,
    updateSubtask,
    deleteSubtask
};
