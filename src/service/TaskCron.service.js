const Task = require("../models/task.model");
const { sendTaskReminderEmail } = require("./NodeMailer.service/email");

const executeTaskReminders = async () => {
        try {
            console.log("Running daily task reminder cron job...");
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Tìm các task chưa hoàn thành
            const tasks = await Task.find({ status: { $ne: "DONE" } }).populate("assignees", "email name");

            for (const task of tasks) {
                if (!task.endDate) continue;

                const endDate = new Date(task.endDate);
                endDate.setHours(0, 0, 0, 0);

                const timeDiff = endDate.getTime() - today.getTime();
                const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

                // 1. Quá hạn (1 ngày sau ngày hết hạn)
                if (daysDiff === -1 && !task.overdueReminderSent) {
                    if (task.assignees && task.assignees.length > 0) {
                        const emails = task.assignees.map(u => u.email).filter(e => !!e);
                        await sendTaskReminderEmail(emails, task, "overdue");
                    }
                    task.overdueReminderSent = true;
                    await task.save();
                }
                
                // 2. Đúng ngày hạn
                else if (daysDiff === 0) {
                    if (task.assignees && task.assignees.length > 0) {
                        const emails = task.assignees.map(u => u.email).filter(e => !!e);
                        await sendTaskReminderEmail(emails, task, "due_today");
                    }
                }
                
                // 3. Trước hạn <= 3 ngày (Gửi 1 lần)
                else if (daysDiff > 0 && daysDiff <= 3 && !task.nearDeadlineReminderSent) {
                    if (task.assignees && task.assignees.length > 0) {
                        const emails = task.assignees.map(u => u.email).filter(e => !!e);
                        await sendTaskReminderEmail(emails, task, "near_deadline");
                    }
                    task.nearDeadlineReminderSent = true;
                    await task.save();
                }
            }
            
            console.log("Daily task reminder cron job completed.");
        } catch (error) {
            console.error("Error running task reminder cron:", error);
        }
    };

const BackupConfig = require('../models/backupConfig.model');
const { performBackup } = require('./backup.service');

const executeAutoBackup = async () => {
    try {
        const config = await BackupConfig.findOne();
        if (!config || config.schedule === 'none') return;
        
        const now = new Date();
        const lastBackup = config.lastBackupAt;
        
        let shouldRun = false;
        
        if (!lastBackup) {
            shouldRun = true;
        } else {
            const timeDiff = now.getTime() - new Date(lastBackup).getTime();
            const daysDiff = Math.floor(timeDiff / (1000 * 3600 * 24));
            
            if (config.schedule === 'daily' && daysDiff >= 1) shouldRun = true;
            if (config.schedule === 'weekly' && daysDiff >= 7) shouldRun = true;
            if (config.schedule === 'monthly' && daysDiff >= 30) shouldRun = true;
        }
        
        if (shouldRun) {
            console.log("Running auto backup job...");
            await performBackup(null);
            console.log("Auto backup job completed.");
        }
    } catch (error) {
        console.error("Error running auto backup:", error);
    }
}

module.exports = { executeTaskReminders, executeAutoBackup };
