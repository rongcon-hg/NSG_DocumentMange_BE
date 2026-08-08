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
                        for (const user of task.assignees) {
                            await sendTaskReminderEmail(user.email, task, "overdue");
                        }
                    }
                    task.overdueReminderSent = true;
                    await task.save();
                }
                
                // 2. Đúng ngày hạn
                else if (daysDiff === 0) {
                    if (task.assignees && task.assignees.length > 0) {
                        for (const user of task.assignees) {
                            await sendTaskReminderEmail(user.email, task, "due_today");
                        }
                    }
                }
                
                // 3. Trước hạn <= 3 ngày (Gửi 1 lần)
                else if (daysDiff > 0 && daysDiff <= 3 && !task.nearDeadlineReminderSent) {
                    if (task.assignees && task.assignees.length > 0) {
                        for (const user of task.assignees) {
                            await sendTaskReminderEmail(user.email, task, "near_deadline");
                        }
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

module.exports = { executeTaskReminders };
