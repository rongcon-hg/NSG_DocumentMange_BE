const { sendNewDocumentEmail } = require("./NodeMailer.service/email");
const User = require("../models/user.model");
const Task = require("../models/task.model");
const { google } = require("googleapis");

const triggerDocumentNotifications = async (document) => {
    try {
        // The Document pre-save middleware resolves executors and departments into assignedToUsers
        let targetUsers = [];
        const { assignedToUsers } = document;

        if (assignedToUsers && assignedToUsers.length > 0) {
            const userIds = assignedToUsers.map(u => u.userId || u);
            targetUsers = await User.find({ _id: { $in: userIds } });
        }

        const uniqueUsers = Array.from(new Set(targetUsers.map(u => u._id.toString())))
            .map(id => targetUsers.find(u => u._id.toString() === id));

        // Lấy thông tin người gửi
        let senderName = "Hệ thống";
        let senderUser = null;
        if (document.sentBy || document.sender) {
            senderUser = await User.findById(document.sentBy || document.sender);
            if (senderUser) senderName = senderUser.name;
        }

        // 1. Send Email notification
        if (uniqueUsers.length > 0) {
            sendNewDocumentEmail(uniqueUsers, document, senderName).catch(err => console.error("Email Notify Error:", err));
        }

        // 2. Create internal Task and sync Google Calendar if deadline is present
        if (document.deadlineDay) {
            let executorUserIds = [];
            if (document.executors && document.executors.length > 0) {
                for (const exec of document.executors) {
                    if (exec.executorType === 'User') {
                        executorUserIds.push(exec.executorId.toString());
                    } else if (exec.executorType === 'Department') {
                        const deptUsers = await User.find({ department: exec.executorId, role: { $ne: null } }).select('_id');
                        deptUsers.forEach(u => executorUserIds.push(u._id.toString()));
                    }
                }
            }
            
            // Lọc ra những người chủ trì (executors)
            let taskUsers = uniqueUsers.filter(u => executorUserIds.includes(u._id.toString()));
            

            if (taskUsers.length > 0) {
                await createTasksAndSyncGoogleCalendar(document, taskUsers);
            }
        }

    } catch (error) {
        console.error("Error in triggerDocumentNotifications:", error);
    }
};

const createTasksAndSyncGoogleCalendar = async (document, uniqueUsers) => {
    try {
        // Create an internal Task
        const fullDocCode = (document.docNum && document.docCode) 
            ? `${document.docNum}/${document.docCode}` 
            : (document.docNum || document.docCode || 'N/A');
        
        const taskTitle = `Xử lý VB: ${fullDocCode} - ${document.shortDescription || document.principalIdea || 'N/A'}`;
        const taskDescription = document.shortDescription || 'N/A';
        const startDate = document.createAt || new Date();
        const endDate = new Date(document.deadlineDay);

        // Ensure valid creator
        const createdBy = document.sentBy || document.sender || (uniqueUsers[0] ? uniqueUsers[0]._id : null);
        
        if (createdBy) {
            const newTask = new Task({
                title: taskTitle,
                description: taskDescription,
                startDate: startDate,
                endDate: endDate,
                assignees: uniqueUsers.map(u => u._id),
                createdBy: createdBy,
                relatedDocument: document._id,
                files: document.files ? document.files.map(f => ({
                    fileId: f.fileId,
                    fileName: f.fileName,
                    fileMimeType: f.mimeType || f.fileMimeType
                })) : []
            });
            await newTask.save().catch(err => console.error("Error saving task:", err));
        }

        // Sync with Google Calendar for users that have linked accounts
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        for (const user of uniqueUsers) {
            if (user.google && user.google.refreshToken) {
                oauth2Client.setCredentials({
                    access_token: user.google.accessToken,
                    refresh_token: user.google.refreshToken,
                    expiry_date: user.google.tokenExpiryDate 
                        ? new Date(user.google.tokenExpiryDate).getTime() 
                        : null,
                });

                let fileLinksText = "";
                if (document.files && document.files.length > 0) {
                    fileLinksText = "\n\nTệp đính kèm:\n" + document.files.map(f => `- ${f.fileName}: https://drive.google.com/file/d/${f.fileId}/view`).join("\n");
                }

                const calendar = google.calendar({ version: "v3", auth: oauth2Client });
                const event = {
                    summary: taskTitle,
                    description: taskDescription + `\n\nLink VB: ${process.env.FE_URL || 'http://localhost:5173'}/documents/${document.docType === 'sent' ? 'SentDocumentList' : 'ReceivedDocumentList'}` + fileLinksText,
                    start: {
                        dateTime: startDate.toISOString(),
                        timeZone: 'Asia/Ho_Chi_Minh',
                    },
                    end: {
                        dateTime: endDate.toISOString(),
                        timeZone: 'Asia/Ho_Chi_Minh',
                    }
                };

                await calendar.events.insert({
                    calendarId: 'primary',
                    resource: event,
                }).catch(err => console.error(`Error syncing calendar for user ${user.email}:`, err));
            }
        }
    } catch (error) {
        console.error("Error creating task and syncing to Google Calendar:", error);
    }
};

const syncCalendarForDocument = async (document) => {
    try {
        if (!document.deadlineDay) return;

        // Extract users
        let targetUsers = [];
        const { assignedToUsers } = document;
        if (assignedToUsers && assignedToUsers.length > 0) {
            const userIds = assignedToUsers.map(u => u.userId || u);
            targetUsers = await User.find({ _id: { $in: userIds } });
        }
        
        const uniqueUsers = Array.from(new Set(targetUsers.map(u => u._id.toString())))
            .map(id => targetUsers.find(u => u._id.toString() === id));

        let taskUsers = [];
        let executorUserIds = [];
        if (document.executors && document.executors.length > 0) {
            for (const exec of document.executors) {
                if (exec.executorType === 'User') {
                    executorUserIds.push(exec.executorId.toString());
                } else if (exec.executorType === 'Department') {
                    const deptUsers = await User.find({ department: exec.executorId, role: { $ne: null } }).select('_id');
                    deptUsers.forEach(u => executorUserIds.push(u._id.toString()));
                }
            }
        }
        
        taskUsers = uniqueUsers.filter(u => executorUserIds.includes(u._id.toString()));
        

        if (taskUsers.length === 0) return;

        // Check if task exists
        const existingTask = await Task.findOne({ relatedDocument: document._id });
        if (!existingTask) {
            // Task does not exist, so this is likely a first time deadline has been added during update
            await createTasksAndSyncGoogleCalendar(document, taskUsers);
        } else {
            // Task exists, optionally we could update the task's endDate here.
            existingTask.endDate = new Date(document.deadlineDay);
            await existingTask.save().catch(err => console.error("Error updating task:", err));
            // Google calendar update is more complex (requires eventId), so we just update the internal task for now
        }
    } catch (error) {
        console.error("Error in syncCalendarForDocument:", error);
    }
};

const syncTaskToGoogleCalendar = async (task, users) => {
    try {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        for (const user of users) {
            if (user.google && user.google.refreshToken) {
                oauth2Client.setCredentials({
                    access_token: user.google.accessToken,
                    refresh_token: user.google.refreshToken,
                    expiry_date: user.google.tokenExpiryDate 
                        ? new Date(user.google.tokenExpiryDate).getTime() 
                        : null,
                });

                let fileLinksText = "";
                if (task.files && task.files.length > 0) {
                    fileLinksText = "\n\nTệp đính kèm:\n" + task.files.map(f => `- ${f.fileName}: https://drive.google.com/file/d/${f.fileId}/view`).join("\n");
                }

                const calendar = google.calendar({ version: "v3", auth: oauth2Client });
                const event = {
                    summary: task.title,
                    description: (task.description || '') + `\n\nLink công việc: ${process.env.FE_URL || 'http://localhost:5173'}/schedule` + fileLinksText,
                    start: {
                        dateTime: new Date(task.startDate).toISOString(),
                        timeZone: 'Asia/Ho_Chi_Minh',
                    },
                    end: {
                        dateTime: new Date(task.endDate).toISOString(),
                        timeZone: 'Asia/Ho_Chi_Minh',
                    }
                };

                await calendar.events.insert({
                    calendarId: 'primary',
                    resource: event,
                }).catch(err => console.error(`Error syncing task to calendar for user ${user.email}:`, err));
            }
        }
    } catch (error) {
        console.error("Error syncing manual task to Google Calendar:", error);
    }
};

module.exports = {
    triggerDocumentNotifications,
    syncCalendarForDocument,
    syncTaskToGoogleCalendar
};
