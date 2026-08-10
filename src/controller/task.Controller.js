const Task = require("../models/task.model");
const User = require("../models/user.model");
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
        const { title, description, startDate, endDate, relatedDocument, priority } = req.body;
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
                .populate("assignees", "name email")
                .populate("collaborators", "name email");
                
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
        const { userId } = req.query; // If provided, filter by assignee or creator

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
        }
        
        // Remove history from updates object if it was somehow sent by client
        if (updates.history) delete updates.history;

        const updatedTask = await Task.findByIdAndUpdate(taskId, { $set: updates, $push: { history: historyEntry } }, { new: true });

        try {
            const populatedTask = await Task.findById(updatedTask._id)
                .populate("assignees", "name email")
                .populate("collaborators", "name email");
                
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

const deleteTask = async (req, res) => {
    try {
        const { taskId } = req.params;
        const deletedTask = await Task.findByIdAndDelete(taskId);
        
        if (!deletedTask) {
            return res.status(404).json({ success: false, message: "Task not found" });
        }

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
    deleteTask
};
