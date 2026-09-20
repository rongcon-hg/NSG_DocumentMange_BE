const RecurringTask = require('../models/recurringTask.model');
const User = require('../models/user.model');
const { calculateNextRunDate, generateSingleTaskFromRecurring } = require('../service/recurringTask.service');

// Lấy danh sách mẫu công việc định kỳ (chỉ hiển thị mẫu của người dùng đó tạo)
const getRecurringTasks = async (req, res) => {
    try {
        const userId = req.user?._id || req.user?.id;
        let filter = { createdBy: userId };

        // Nếu có lọc theo phòng ban
        if (req.query.department) {
            filter.department = req.query.department;
        }

        // Nếu có lọc theo trạng thái hoạt động
        if (req.query.isActive !== undefined) {
            filter.isActive = req.query.isActive === 'true';
        }

        const recurringTasks = await RecurringTask.find(filter)
            .populate('assignees', 'name email avatar')
            .populate('collaborators', 'name email avatar')
            .populate('createdBy', 'name email avatar')
            .populate('department', 'departmentName')
            .populate('subtasks.assignee', 'name email')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            data: recurringTasks
        });
    } catch (error) {
        console.error('Error fetching recurring tasks:', error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách mẫu việc định kỳ', error: error.message });
    }
};

// Lấy chi tiết 1 mẫu việc định kỳ
const getRecurringTaskById = async (req, res) => {
    try {
        const recurringTask = await RecurringTask.findById(req.params.id)
            .populate('assignees', 'name email avatar')
            .populate('collaborators', 'name email avatar')
            .populate('createdBy', 'name email avatar')
            .populate('department', 'departmentName')
            .populate('subtasks.assignee', 'name email');

        if (!recurringTask) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy mẫu công việc định kỳ' });
        }

        res.status(200).json({
            success: true,
            data: recurringTask
        });
    } catch (error) {
        console.error('Error fetching recurring task by id:', error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ', error: error.message });
    }
};

const { google } = require("googleapis");
const { Readable } = require("stream");
const { authorize, getOrCreateMonthFolder } = require("./uploadfile.Controller");
const { formatFileName } = require("../utils/formatFileName");

const getSafeFileName = (file) => {
    let originalName = file.originalname || "attachment";
    try {
        originalName = Buffer.from(file.originalname, "latin1").toString("utf8");
    } catch (e) {
        // fallback
    }
    return formatFileName(originalName);
};

const parseJSON = (data, fallback = []) => {
    try {
        return typeof data === "string" ? JSON.parse(data) : (data || fallback);
    } catch (e) {
        return fallback;
    }
};

// Tạo mới một mẫu công việc định kỳ
const createRecurringTask = async (req, res) => {
    try {
        const createdBy = req.user?._id || req.user?.id;
        if (!createdBy) {
            return res.status(401).json({ success: false, message: 'Chưa xác thực người dùng' });
        }

        const {
            title,
            description,
            notes,
            taskType,
            baseScore,
            outputResult,
            focusAxis,
            difficultyRate,
            priority,
            department,
            frequency,
            repeatDayOfMonth,
            repeatQuarterMonth,
            repeatMonthOfYear,
            durationDays
        } = req.body;

        if (!title || !title.trim()) {
            return res.status(400).json({ success: false, message: 'Tiêu đề mẫu công việc không được để trống' });
        }

        const assignees = parseJSON(req.body.assignees, []);
        const collaborators = parseJSON(req.body.collaborators, []);
        const subtasks = parseJSON(req.body.subtasks, []);
        const repeatDaysOfWeek = parseJSON(req.body.repeatDaysOfWeek, [1]);
        const repeatQuarters = parseJSON(req.body.repeatQuarters, [1, 2, 3, 4]);
        const times = parseJSON(req.body.times, ['08:00', '17:00']);

        let uploadedFiles = [];
        if (req.body.uploadedFiles) {
            uploadedFiles = parseJSON(req.body.uploadedFiles, []);
        } else if (req.body.files) {
            uploadedFiles = parseJSON(req.body.files, []);
        }

        if (req.files && req.files.length > 0) {
            try {
                const auth = await authorize();
                const drive = google.drive({ version: "v3", auth });
                const monthFolderId = await getOrCreateMonthFolder(drive);

                for (const file of req.files) {
                    const fileMetadata = {
                        name: getSafeFileName(file),
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
            } catch (driveErr) {
                console.warn("[RecurringTask] Lỗi tải file lên Drive:", driveErr.message);
            }
        }

        const newRecTask = new RecurringTask({
            title: title.trim(),
            description: description || '',
            notes: notes || '',
            taskType: taskType || 'REGULAR',
            baseScore: baseScore !== undefined ? Number(baseScore) : (taskType === 'URGENT' ? 12 : 10),
            outputResult: outputResult ? String(outputResult).trim() : '',
            focusAxis: focusAxis ? String(focusAxis).trim() : '',
            difficultyRate: difficultyRate !== undefined ? Number(difficultyRate) : 1.0,
            priority: priority || 'NORMAL',
            assignees,
            collaborators,
            department: department || undefined,
            createdBy,
            subtasks,
            frequency: frequency || 'WEEKLY',
            repeatDaysOfWeek,
            repeatQuarters,
            repeatDayOfMonth: repeatDayOfMonth !== undefined ? Number(repeatDayOfMonth) : 1,
            repeatQuarterMonth: repeatQuarterMonth !== undefined ? Number(repeatQuarterMonth) : 1,
            repeatMonthOfYear: repeatMonthOfYear !== undefined ? Number(repeatMonthOfYear) : 1,
            times: Array.isArray(times) && times.length >= 2 ? times : ['08:00', '17:00'],
            durationDays: durationDays !== undefined ? Number(durationDays) : 3,
            files: uploadedFiles,
            isActive: true
        });

        newRecTask.nextRunDate = calculateNextRunDate(newRecTask);
        await newRecTask.save();

        const populated = await RecurringTask.findById(newRecTask._id)
            .populate('assignees', 'name email avatar')
            .populate('collaborators', 'name email avatar')
            .populate('createdBy', 'name email avatar');

        res.status(201).json({
            success: true,
            message: 'Tạo mẫu công việc định kỳ thành công',
            data: populated
        });
    } catch (error) {
        console.error('Error creating recurring task:', error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tạo mẫu việc định kỳ', error: error.message });
    }
};

// Cập nhật mẫu công việc định kỳ
const updateRecurringTask = async (req, res) => {
    try {
        const { id } = req.params;
        const recTask = await RecurringTask.findById(id);

        if (!recTask) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy mẫu công việc định kỳ' });
        }

        const allowedFields = [
            'title', 'description', 'notes', 'taskType', 'baseScore', 'outputResult',
            'focusAxis', 'difficultyRate', 'priority', 'department', 'frequency',
            'repeatDayOfMonth', 'repeatQuarterMonth', 'repeatMonthOfYear', 'durationDays', 'isActive'
        ];

        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                recTask[field] = req.body[field];
            }
        });

        if (req.body.assignees !== undefined) recTask.assignees = parseJSON(req.body.assignees, []);
        if (req.body.collaborators !== undefined) recTask.collaborators = parseJSON(req.body.collaborators, []);
        if (req.body.subtasks !== undefined) recTask.subtasks = parseJSON(req.body.subtasks, []);
        if (req.body.repeatDaysOfWeek !== undefined) recTask.repeatDaysOfWeek = parseJSON(req.body.repeatDaysOfWeek, [1]);
        if (req.body.repeatQuarters !== undefined) recTask.repeatQuarters = parseJSON(req.body.repeatQuarters, [1, 2, 3, 4]);
        if (req.body.times !== undefined) recTask.times = parseJSON(req.body.times, ['08:00', '17:00']);

        let uploadedFiles = recTask.files || [];
        if (req.body.uploadedFiles !== undefined) {
            uploadedFiles = parseJSON(req.body.uploadedFiles, []);
        } else if (req.body.files !== undefined) {
            uploadedFiles = parseJSON(req.body.files, []);
        }

        if (req.files && req.files.length > 0) {
            try {
                const auth = await authorize();
                const drive = google.drive({ version: "v3", auth });
                const monthFolderId = await getOrCreateMonthFolder(drive);

                for (const file of req.files) {
                    const fileMetadata = {
                        name: getSafeFileName(file),
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
            } catch (driveErr) {
                console.warn("[RecurringTask] Lỗi tải file lên Drive:", driveErr.message);
            }
        }
        recTask.files = uploadedFiles;

        // Tính lại ngày chạy tiếp theo
        recTask.nextRunDate = calculateNextRunDate(recTask);
        await recTask.save();

        const populated = await RecurringTask.findById(id)
            .populate('assignees', 'name email avatar')
            .populate('collaborators', 'name email avatar')
            .populate('createdBy', 'name email avatar')
            .populate('department', 'departmentName');

        res.status(200).json({
            success: true,
            message: 'Cập nhật mẫu công việc định kỳ thành công',
            data: populated
        });
    } catch (error) {
        console.error('Error updating recurring task:', error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật', error: error.message });
    }
};

// Xóa mẫu công việc định kỳ
const deleteRecurringTask = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await RecurringTask.findByIdAndDelete(id);

        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy mẫu công việc định kỳ' });
        }

        res.status(200).json({
            success: true,
            message: 'Đã xóa mẫu công việc định kỳ thành công'
        });
    } catch (error) {
        console.error('Error deleting recurring task:', error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ khi xóa', error: error.message });
    }
};

// Bật / Tắt trạng thái hoạt động (Pause / Resume)
const toggleRecurringTask = async (req, res) => {
    try {
        const { id } = req.params;
        const recTask = await RecurringTask.findById(id);

        if (!recTask) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy mẫu công việc' });
        }

        recTask.isActive = !recTask.isActive;
        if (recTask.isActive) {
            recTask.nextRunDate = calculateNextRunDate(recTask);
        }
        await recTask.save();

        res.status(200).json({
            success: true,
            message: recTask.isActive ? 'Đã kích hoạt mẫu công việc định kỳ' : 'Đã tạm dừng mẫu công việc định kỳ',
            data: { isActive: recTask.isActive, nextRunDate: recTask.nextRunDate }
        });
    } catch (error) {
        console.error('Error toggling recurring task:', error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ', error: error.message });
    }
};

// Kích hoạt chạy ngay tức thì (Run Now)
const runRecurringTaskNow = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?._id || req.user?.id;

        const recTask = await RecurringTask.findById(id);
        if (!recTask) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy mẫu công việc định kỳ' });
        }

        const createdTask = await generateSingleTaskFromRecurring(recTask, userId);

        res.status(200).json({
            success: true,
            message: `Đã sinh công việc mới thành công: "${createdTask.title}"`,
            data: createdTask
        });
    } catch (error) {
        console.error('Error running recurring task now:', error);
        res.status(500).json({ success: false, message: 'Lỗi khi kích hoạt công việc định kỳ', error: error.message });
    }
};

module.exports = {
    getRecurringTasks,
    getRecurringTaskById,
    createRecurringTask,
    updateRecurringTask,
    deleteRecurringTask,
    toggleRecurringTask,
    runRecurringTaskNow
};
