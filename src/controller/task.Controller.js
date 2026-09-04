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

        const assignees = parseJSON(req.body.assignees);
        const collaborators = parseJSON(req.body.collaborators);

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

        const newTask = new Task({
            title,
            description,
            notes,
            startDate,
            endDate,
            assignees,
            collaborators,
            files: uploadedFiles,
            relatedDocument,
            priority: priority || 'NORMAL',
            createdBy,
            history: [{
                action: 'Tạo mới',
                user: createdBy,
                details: 'Khởi tạo công việc',
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

        res.status(201).json({ success: true, message: "Task created successfully", data: newTask });
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
                    { collaborators: userId }
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
            .sort({ startDate: 1 });

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
        let historyEntry = {
            action: 'Cập nhật',
            user: updater,
            details: 'Cập nhật thông tin công việc',
            timestamp: new Date()
        };

        if (updates.status && updates.status !== existingTask.status) {
            historyEntry.action = 'Cập nhật trạng thái';
            const statusLabels = { 'TODO': 'Chưa làm', 'IN_PROGRESS': 'Đang làm', 'DONE': 'Hoàn thành' };
            const oldStatus = statusLabels[existingTask.status] || existingTask.status;
            const newStatus = statusLabels[updates.status] || updates.status;
            historyEntry.details = `Chuyển trạng thái từ ${oldStatus} sang ${newStatus}`;

            if (updates.status === 'DONE') {
                if (!updates.completedAt) {
                    updates.completedAt = new Date();
                }
            } else if (existingTask.status === 'DONE') {
                updates.completedAt = null;
            }
        }
        
        // Remove history from updates object if it was somehow sent by client
        if (updates.history) delete updates.history;

        const updatedTask = await Task.findByIdAndUpdate(taskId, { $set: updates, $push: { history: historyEntry } }, { new: true });

        try {
            const populatedTask = await Task.findById(updatedTask._id)
                .populate("assignees", "name email emailNotifications")
                .populate("collaborators", "name email emailNotifications")
                .populate("evaluation.evaluatedBy", "name email");
                
            const uniqueUsers = [...(populatedTask.assignees || []), ...(populatedTask.collaborators || [])].filter((user, index, self) => 
                index === self.findIndex((t) => (
                    t._id.toString() === user._id.toString()
                ))
            );
            
            let actionType = 'update';
            if (updates.status && updates.status !== existingTask.status) {
                actionType = 'status_change';
            }

            const { sendTaskNotificationEmail } = require('../service/NodeMailer.service/email');
            if (uniqueUsers.length > 0) {
                sendTaskNotificationEmail(uniqueUsers, populatedTask, actionType);
            }
        } catch (emailErr) {
            console.error("Lỗi gửi email cập nhật task:", emailErr);
        }

        res.status(200).json({ success: true, message: "Task updated", data: updatedTask });
    } catch (error) {
        console.error("Error updating task:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

const evaluateTask = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { score, rating, feedback } = req.body;

        const existingTask = await Task.findById(taskId);
        if (!existingTask) {
            return res.status(404).json({ success: false, message: "Task not found" });
        }

        if (existingTask.status !== 'DONE') {
            return res.status(400).json({ success: false, message: "Chỉ có thể đánh giá công việc đã hoàn thành." });
        }

        const currentUserId = req.user ? req.user._id : null;
        const currentUserRole = req.user ? req.user.role : null;
        const isCreator = currentUserId && existingTask.createdBy.toString() === currentUserId.toString();
        const isManagerOrAdmin = ['admin', 'manager', 'cappho'].includes(currentUserRole);

        if (!isCreator && !isManagerOrAdmin) {
            return res.status(403).json({ success: false, message: "Bạn không có quyền đánh giá công việc này." });
        }

        const calculatedScore = score !== undefined ? Number(score) : (rating ? Number(rating) * 20 : 80);
        const calculatedRating = rating !== undefined ? Number(rating) : Math.round(calculatedScore / 20);

        const evaluationData = {
            score: calculatedScore,
            rating: calculatedRating,
            feedback: feedback || '',
            evaluatedBy: currentUserId,
            evaluatedAt: new Date()
        };

        const historyEntry = {
            action: 'Đánh giá KPI',
            user: currentUserId,
            details: `Đánh giá chất lượng: ${calculatedScore}/100 điểm (${calculatedRating} sao). ${feedback ? `Nhận xét: "${feedback}"` : ''}`,
            timestamp: new Date()
        };

        const updatedTask = await Task.findByIdAndUpdate(
            taskId,
            { 
                $set: { evaluation: evaluationData },
                $push: { history: historyEntry }
            },
            { new: true }
        )
        .populate("assignees", "name email")
        .populate("collaborators", "name email")
        .populate("createdBy", "name email")
        .populate("evaluation.evaluatedBy", "name email");

        res.status(200).json({ success: true, message: "Đánh giá công việc thành công", data: updatedTask });
    } catch (error) {
        console.error("Error evaluating task:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

const getKpiStats = async (req, res) => {
    try {
        const currentUser = req.user;
        const currentRole = currentUser?.role;

        // 1. Quyền chuyenvien không được truy cập KPI
        if (currentRole === 'chuyenvien') {
            return res.status(403).json({
                success: false,
                message: "Chuyên viên không có quyền truy cập báo cáo Đánh giá & KPI."
            });
        }

        // Lấy thông tin phòng ban của user hiện tại
        let userDeptCode = null;
        if (currentUser && currentUser.department) {
            const userDept = await Department.findById(currentUser.department).select("departmentCode").lean();
            if (userDept) userDeptCode = userDept.departmentCode;
        }

        // Kiểm tra đặc quyền nhóm BGH (admin, manager, hoặc phòng ban BGH)
        const isBGH = currentRole === 'admin' || currentRole === 'manager' || userDeptCode === 'BGH';

        let { month, year, departmentId, userId } = req.query;

        // 2. Quyền cappho (hoặc cán bộ cấp đơn vị): chỉ xem được thông tin của thành viên trong đơn vị mình
        if (!isBGH) {
            departmentId = currentUser && currentUser.department ? currentUser.department.toString() : null;
        }

        // Build date range filter if month and/or year specified
        let dateFilter = {};
        const targetYear = year ? parseInt(year) : new Date().getFullYear();
        if (month) {
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

        // Fetch users matching departmentId or userId filter (loại bỏ tài khoản vô hiệu hóa và admin qlvb@nsgpc.edu.vn)
        let userFilter = {
            role: { $nin: [null, ""] },
            email: { $not: /^qlvb@nsgpc\.edu\.vn$/i }
        };
        if (userId) {
            userFilter._id = userId;
        } else if (departmentId) {
            userFilter.department = departmentId;
        }

        const users = await User.find(userFilter)
            .select("name email department position role")
            .populate("department", "departmentName departmentCode")
            .populate("position", "positionName")
            .lean();

        const userIds = users.map(u => u._id.toString());

        // Find tasks related to these users
        let taskQuery = { ...dateFilter };
        if (userIds.length > 0) {
            const userMatch = {
                $or: [
                    { assignees: { $in: userIds } },
                    { collaborators: { $in: userIds } }
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
            .populate("evaluation.evaluatedBy", "name email")
            .lean();

        const priorityWeights = {
            FLASH: 1.5,
            URGENT: 1.2,
            NORMAL: 1.0
        };

        // Initialize user KPI map
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
                totalWeightedScore: 0,
                totalMaxPossibleScore: 0,
                evaluatedTasksCount: 0,
                totalEvaluationScore: 0,
                kpiScore: 0,
                rank: 'D',
                details: []
            };
        });

        const now = new Date();

        tasks.forEach(task => {
            const priorityWeight = (priorityWeights[task.priority] || 1.0) * (task.weight || 1.0);
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

            // Tính hạn chót là hết ngày (23:59:59.999) của ngày endDate (qua 00:00 ngày hôm sau mới tính quá hạn)
            const endOfDayDeadline = new Date(task.endDate);
            endOfDayDeadline.setHours(23, 59, 59, 999);
            const deadlineTime = endOfDayDeadline.getTime();
            
            let isOnTime = false;
            let isLate = false;
            let isOverdue = false;
            let daysLate = 0;
            let progressScore = 0;

            if (isDone) {
                const compTime = completedTime ? new Date(completedTime).getTime() : deadlineTime;
                if (compTime <= deadlineTime) {
                    isOnTime = true;
                    progressScore = 100;
                } else {
                    isLate = true;
                    daysLate = Math.max(1, Math.ceil((compTime - deadlineTime) / (1000 * 60 * 60 * 24)));
                    progressScore = Math.max(50, 100 - daysLate * 5);
                }
            } else {
                if (now.getTime() > deadlineTime) {
                    isOverdue = true;
                    daysLate = Math.max(1, Math.ceil((now.getTime() - deadlineTime) / (1000 * 60 * 60 * 24)));
                    progressScore = 0;
                } else {
                    progressScore = 70; // Đang thực hiện trong hạn (chưa qua 00:00 ngày hôm sau)
                }
            }

            const qualityScore = (task.evaluation && task.evaluation.score !== undefined) 
                ? task.evaluation.score 
                : (isDone ? 80 : 50);

            // Combined task score out of 100
            const combinedTaskScore = Math.round((progressScore * 0.5) + (qualityScore * 0.5));

            // Helper to accumulate for user
            const accumulateForUser = (uId, roleType) => {
                const stat = userStatsMap[uId];
                if (!stat) return;

                const roleWeight = roleType === 'assignee' ? 1.0 : 0.5;
                const taskEffectiveWeight = priorityWeight * roleWeight;

                if (roleType === 'assignee') {
                    stat.totalAssignedTasks += 1;
                } else {
                    stat.totalCollaboratedTasks += 1;
                }
                stat.totalTasks += 1;

                if (isDone) {
                    stat.completedTasks += 1;
                    if (isOnTime) stat.onTimeTasks += 1;
                    if (isLate) stat.lateTasks += 1;
                } else {
                    if (isOverdue) stat.overdueTasks += 1;
                    else stat.inProgressTasks += 1;
                }

                if (task.evaluation && task.evaluation.score !== undefined) {
                    stat.evaluatedTasksCount += 1;
                    stat.totalEvaluationScore += task.evaluation.score;
                }

                stat.totalWeightedScore += combinedTaskScore * taskEffectiveWeight;
                stat.totalMaxPossibleScore += 100 * taskEffectiveWeight;

                stat.details.push({
                    taskId: task._id,
                    title: task.title,
                    role: roleType,
                    priority: task.priority,
                    status: task.status,
                    startDate: task.startDate,
                    endDate: task.endDate,
                    completedAt: task.completedAt,
                    isOnTime,
                    isLate,
                    isOverdue,
                    daysLate,
                    progressScore,
                    qualityScore,
                    combinedTaskScore,
                    evaluation: task.evaluation || null
                });
            };

            if (Array.isArray(task.assignees)) {
                task.assignees.forEach(a => {
                    const id = (a._id || a).toString();
                    accumulateForUser(id, 'assignee');
                });
            }

            if (Array.isArray(task.collaborators)) {
                task.collaborators.forEach(c => {
                    const id = (c._id || c).toString();
                    const isAlsoAssignee = task.assignees && task.assignees.some(a => (a._id || a).toString() === id);
                    if (!isAlsoAssignee) {
                        accumulateForUser(id, 'collaborator');
                    }
                });
            }
        });

        // Compute final score and ranks (Chỉ tính cho cán bộ CÓ công việc được phân công, còn hoạt động và không phải admin qlvb)
        const userStats = Object.values(userStatsMap)
            .filter(stat => {
                if (stat.totalTasks <= 0) return false;
                const u = stat.user;
                if (!u || !u.role) return false;
                if (u.email && u.email.toLowerCase() === 'qlvb@nsgpc.edu.vn') return false;
                return true;
            })
            .map(stat => {
                const kpiScore = stat.totalMaxPossibleScore > 0 
                    ? Math.round((stat.totalWeightedScore / stat.totalMaxPossibleScore) * 100)
                    : 0;
                
                let rank = 'D';
                if (kpiScore >= 90) rank = 'A';
                else if (kpiScore >= 75) rank = 'B';
                else if (kpiScore >= 50) rank = 'C';

                const onTimeRate = (stat.onTimeTasks + stat.lateTasks) > 0 
                    ? Math.round((stat.onTimeTasks / (stat.onTimeTasks + stat.lateTasks)) * 100) 
                    : 0;

                const averageQualityScore = stat.evaluatedTasksCount > 0 
                    ? Math.round(stat.totalEvaluationScore / stat.evaluatedTasksCount) 
                    : null;

                return {
                    ...stat,
                    kpiScore,
                    rank,
                    onTimeRate,
                    averageQualityScore
                };
            });

        // Sort by KPI score descending
        userStats.sort((a, b) => b.kpiScore - a.kpiScore);

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
        const overallOnTimeRate = totalCompletedTasks > 0 ? Math.round((totalOnTimeTasks / totalCompletedTasks) * 100) : 0;
        
        const overallKpiAverage = userStats.length > 0 
            ? Math.round(userStats.reduce((sum, u) => sum + u.kpiScore, 0) / userStats.length)
            : 0;

        res.status(200).json({
            success: true,
            data: {
                summary: {
                    totalTasksCount,
                    totalCompletedTasks,
                    totalOnTimeTasks,
                    totalLateTasks,
                    totalOverdueTasks,
                    overallOnTimeRate,
                    overallKpiAverage,
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

module.exports = {
    createTask,
    getTasks,
    updateTask,
    evaluateTask,
    getKpiStats,
    deleteTask
};
