const RecurringTask = require('../models/recurringTask.model');
const Task = require('../models/task.model');
const User = require('../models/user.model');
const { sendTaskNotificationEmail } = require('./NodeMailer.service/email');
const { syncTaskToGoogleCalendar } = require('./Notification.service');

/**
 * Tính ngày chạy tiếp theo cho Mẫu việc định kỳ
 */
const calculateNextRunDate = (recTask, baseDate = new Date()) => {
    const d = new Date(baseDate);
    d.setHours(8, 0, 0, 0);

    const freq = recTask.frequency || 'WEEKLY';

    if (freq === 'DAILY') {
        d.setDate(d.getDate() + 1);
        return d;
    }

    if (freq === 'WEEKLY') {
        const days = (recTask.repeatDaysOfWeek && recTask.repeatDaysOfWeek.length > 0)
            ? recTask.repeatDaysOfWeek
            : [1]; // Mặc định Thứ Hai (1)

        // Quy đổi JS: 0=CN, 1=T2, 2=T3, ..., 6=T7
        // Mô hình: 1=T2, 2=T3, ..., 6=T7, 7=CN
        for (let i = 1; i <= 7; i++) {
            const checkDate = new Date(d);
            checkDate.setDate(checkDate.getDate() + i);
            let jsDay = checkDate.getDay();
            let modelDay = jsDay === 0 ? 7 : jsDay;
            if (days.includes(modelDay)) {
                return checkDate;
            }
        }
        d.setDate(d.getDate() + 7);
        return d;
    }

    if (freq === 'MONTHLY') {
        const targetDay = recTask.repeatDayOfMonth || 1;
        let candidate = new Date(d);
        candidate.setDate(targetDay);
        candidate.setHours(8, 0, 0, 0);

        const dZero = new Date(d);
        dZero.setHours(0, 0, 0, 0);
        const candidateZero = new Date(candidate);
        candidateZero.setHours(0, 0, 0, 0);

        if (candidateZero.getTime() <= dZero.getTime()) {
            candidate.setMonth(candidate.getMonth() + 1);
        }
        return candidate;
    }

    if (freq === 'QUARTERLY') {
        const offset = Math.max(0, Math.min(2, (recTask.repeatQuarterMonth || 1) - 1)); // 0 (đầu), 1 (giữa), 2 (cuối)
        const targetDay = recTask.repeatDayOfMonth || 1;
        const quarters = (Array.isArray(recTask.repeatQuarters) && recTask.repeatQuarters.length > 0)
            ? recTask.repeatQuarters
            : [1, 2, 3, 4];
        const validMonths = quarters.map(q => (q - 1) * 3 + offset).sort((a, b) => a - b);

        const dZero = new Date(d);
        dZero.setHours(0, 0, 0, 0);

        for (const m of validMonths) {
            let candidate = new Date(d);
            candidate.setMonth(m);
            candidate.setDate(targetDay);
            candidate.setHours(8, 0, 0, 0);

            let candidateZero = new Date(candidate);
            candidateZero.setHours(0, 0, 0, 0);

            if (candidateZero.getTime() > dZero.getTime()) {
                return candidate;
            }
        }

        let nextYearCandidate = new Date(d);
        nextYearCandidate.setFullYear(nextYearCandidate.getFullYear() + 1);
        nextYearCandidate.setMonth(validMonths[0] !== undefined ? validMonths[0] : offset);
        nextYearCandidate.setDate(targetDay);
        nextYearCandidate.setHours(8, 0, 0, 0);
        return nextYearCandidate;
    }

    if (freq === 'YEARLY') {
        const targetMonth = (recTask.repeatMonthOfYear || 1) - 1; // 0 - 11 in JS
        const targetDay = recTask.repeatDayOfMonth || 1;

        let candidate = new Date(d);
        candidate.setMonth(targetMonth);
        candidate.setDate(targetDay);
        candidate.setHours(8, 0, 0, 0);

        const dZero = new Date(d);
        dZero.setHours(0, 0, 0, 0);
        const candidateZero = new Date(candidate);
        candidateZero.setHours(0, 0, 0, 0);

        if (candidateZero.getTime() <= dZero.getTime()) {
            candidate.setFullYear(candidate.getFullYear() + 1);
        }
        return candidate;
    }

    if (freq === 'SEMESTER') {
        let nextSem = new Date(d);
        nextSem.setMonth(nextSem.getMonth() + 6);
        return nextSem;
    }

    d.setDate(d.getDate() + 7);
    return d;
};

/**
 * Khởi tạo một Task thực tế từ Mẫu việc định kỳ (RecurringTask)
 */
const generateSingleTaskFromRecurring = async (recTask, triggeredBy = null) => {
    try {
        const now = new Date();
        const durationDays = recTask.durationDays !== undefined ? recTask.durationDays : 3;

        // Xử lý giờ bắt đầu và kết thúc
        let startHour = 8, startMinute = 0;
        let endHour = 17, endMinute = 0;

        if (Array.isArray(recTask.times) && recTask.times.length >= 2) {
            const [sH, sM] = String(recTask.times[0]).split(':').map(Number);
            const [eH, eM] = String(recTask.times[1]).split(':').map(Number);
            if (!isNaN(sH)) startHour = sH;
            if (!isNaN(sM)) startMinute = sM;
            if (!isNaN(eH)) endHour = eH;
            if (!isNaN(eM)) endMinute = eM;
        }

        const startDate = new Date(now);
        startDate.setHours(startHour, startMinute, 0, 0);

        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + durationDays);
        endDate.setHours(endHour, endMinute, 0, 0);

        // Chuẩn bị danh sách việc con
        const subtasks = (recTask.subtasks || []).map(st => ({
            title: st.title,
            assignee: st.assignee || undefined,
            startDate,
            endDate,
            status: 'TODO',
            createdBy: recTask.createdBy,
            createdAt: new Date()
        }));

        const newTask = new Task({
            title: recTask.title,
            description: recTask.description,
            notes: recTask.notes,
            startDate,
            endDate,
            assignees: recTask.assignees || [],
            collaborators: recTask.collaborators || [],
            files: recTask.files || [],
            subtasks,
            priority: recTask.priority || 'NORMAL',
            taskType: recTask.taskType || 'REGULAR',
            baseScore: recTask.baseScore || (recTask.taskType === 'URGENT' ? 12 : 10),
            outputResult: recTask.outputResult || '',
            focusAxis: recTask.focusAxis || '',
            difficultyRate: recTask.difficultyRate || 1.0,
            department: recTask.department,
            createdBy: recTask.createdBy,
            history: [{
                action: 'Tự động sinh việc định kỳ',
                user: triggeredBy || recTask.createdBy,
                details: triggeredBy
                    ? 'Kích hoạt chạy ngay bởi người dùng'
                    : `Tự động sinh theo lịch chu kỳ (${recTask.frequency})`,
                timestamp: new Date()
            }]
        });

        await newTask.save();

        // Gửi email thông báo và đồng bộ Google Calendar
        try {
            const populatedTask = await Task.findById(newTask._id)
                .populate("assignees", "name email emailNotifications")
                .populate("collaborators", "name email emailNotifications");

            const uniqueUsersMap = new Map();
            if (populatedTask.assignees) populatedTask.assignees.forEach(u => uniqueUsersMap.set(u._id.toString(), u));
            if (populatedTask.collaborators) populatedTask.collaborators.forEach(u => uniqueUsersMap.set(u._id.toString(), u));

            const creatorUser = await User.findById(recTask.createdBy);
            if (creatorUser && !uniqueUsersMap.has(creatorUser._id.toString())) {
                uniqueUsersMap.set(creatorUser._id.toString(), creatorUser);
            }

            const uniqueUsers = Array.from(uniqueUsersMap.values());
            if (uniqueUsers.length > 0) {
                sendTaskNotificationEmail(uniqueUsers, populatedTask, 'create');
                syncTaskToGoogleCalendar(populatedTask, uniqueUsers);
            }
        } catch (emailErr) {
            console.error('[RecurringTask] Lỗi gửi email tạo việc:', emailErr);
        }

        // Cập nhật trạng thái RecurringTask
        recTask.lastGeneratedAt = new Date();
        recTask.totalGeneratedCount = (recTask.totalGeneratedCount || 0) + 1;
        recTask.nextRunDate = calculateNextRunDate(recTask, now);
        await recTask.save();

        console.log(`[RecurringTask] Đã sinh công việc thành công: "${newTask.title}" (ID: ${newTask._id})`);
        return newTask;
    } catch (err) {
        console.error('[RecurringTask] Lỗi sinh công việc từ mẫu:', err);
        throw err;
    }
};

/**
 * Quét toàn bộ mẫu việc định kỳ đến hạn để sinh công việc tự động (gọi bởi cron job)
 */
const executeRecurringTasksGeneration = async () => {
    try {
        console.log('[RecurringTask Cron] Bắt đầu quét các mẫu công việc định kỳ...');
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const jsDay = today.getDay(); // 0=CN, 1=T2, ..., 6=T7
        const currentModelDay = jsDay === 0 ? 7 : jsDay; // 1=T2, ..., 7=CN
        const currentDayOfMonth = today.getDate(); // 1..31

        const activeRecurringTasks = await RecurringTask.find({ isActive: true });
        let generatedCount = 0;

        for (const recTask of activeRecurringTasks) {
            // Kiểm tra nếu đã sinh hôm nay thì bỏ qua
            if (recTask.lastGeneratedAt) {
                const lastGen = new Date(recTask.lastGeneratedAt);
                lastGen.setHours(0, 0, 0, 0);
                if (lastGen.getTime() === today.getTime()) {
                    continue; // Đã chạy hôm nay
                }
            }

            let shouldRun = false;
            const freq = recTask.frequency || 'WEEKLY';

            if (freq === 'DAILY') {
                shouldRun = true;
            } else if (freq === 'WEEKLY') {
                const days = recTask.repeatDaysOfWeek || [1];
                if (days.includes(currentModelDay)) {
                    shouldRun = true;
                }
            } else if (freq === 'MONTHLY') {
                const targetDay = recTask.repeatDayOfMonth || 1;
                if (currentDayOfMonth === targetDay) {
                    shouldRun = true;
                }
            } else if (freq === 'QUARTERLY') {
                const offset = Math.max(0, Math.min(2, (recTask.repeatQuarterMonth || 1) - 1));
                const quarters = (Array.isArray(recTask.repeatQuarters) && recTask.repeatQuarters.length > 0)
                    ? recTask.repeatQuarters
                    : [1, 2, 3, 4];
                const validMonths = quarters.map(q => (q - 1) * 3 + offset);
                const targetDay = recTask.repeatDayOfMonth || 1;
                const currentMonth0 = today.getMonth(); // 0 - 11
                if (validMonths.includes(currentMonth0) && currentDayOfMonth === targetDay) {
                    shouldRun = true;
                }
            } else if (freq === 'YEARLY') {
                const targetMonth = recTask.repeatMonthOfYear || 1;
                const targetDay = recTask.repeatDayOfMonth || 1;
                const currentMonth = today.getMonth() + 1; // 1 - 12
                if (currentMonth === targetMonth && currentDayOfMonth === targetDay) {
                    shouldRun = true;
                }
            } else if (freq === 'SEMESTER') {
                if (recTask.nextRunDate) {
                    const nextRun = new Date(recTask.nextRunDate);
                    nextRun.setHours(0, 0, 0, 0);
                    if (today.getTime() >= nextRun.getTime()) {
                        shouldRun = true;
                    }
                }
            }

            if (shouldRun) {
                await generateSingleTaskFromRecurring(recTask);
                generatedCount++;
            }
        }

        console.log(`[RecurringTask Cron] Hoàn tất quét. Đã sinh ${generatedCount} công việc mới.`);
        return generatedCount;
    } catch (error) {
        console.error('[RecurringTask Cron] Lỗi quét mẫu việc định kỳ:', error);
    }
};

module.exports = {
    calculateNextRunDate,
    generateSingleTaskFromRecurring,
    executeRecurringTasksGeneration
};
