const Meeting = require("../models/meeting.model");
const Notification = require("../models/notification.model");
const { sendPushToUsers } = require("./webPush.service");
const { sendMeetingReminderEmail } = require("./NodeMailer.service/email");

/**
 * Quét các cuộc họp và gửi thông báo / email nhắc nhở:
 * 1. Trước 1 ngày (22h - 26h trước giờ bắt đầu)
 * 2. Trước 30 phút (15m - 45m trước giờ bắt đầu)
 * 3. Khi bắt đầu cuộc họp (-5m đến +15m quanh startTime)
 */
const executeMeetingReminders = async () => {
  try {
    const now = new Date();

    // Chỉ quét các cuộc họp chưa bế mạc hoặc hủy
    const upcomingMeetings = await Meeting.find({
      status: { $in: ["PREPARING", "IN_PROGRESS"] },
      startTime: {
        $gte: new Date(now.getTime() - 30 * 60 * 1000), // Không quá 30 phút sau giờ bắt đầu
        $lte: new Date(now.getTime() + 26 * 60 * 60 * 1000), // Tối đa 26 giờ tới
      },
    })
      .populate("host", "name email")
      .populate("secretary", "name email")
      .populate("attendees.user", "name email");

    if (!upcomingMeetings || upcomingMeetings.length === 0) {
      return { success: true, count: 0 };
    }

    let processedCount = 0;

    for (const meeting of upcomingMeetings) {
      const startTime = new Date(meeting.startTime);
      const diffMs = startTime.getTime() - now.getTime();
      const diffMinutes = Math.round(diffMs / (60 * 1000));
      const diffHours = diffMs / (60 * 60 * 1000);

      let reminderType = null;
      let shouldSend = false;

      // 1. Nhắc trước 1 ngày: khoảng 22 giờ đến 26 giờ trước giờ bắt đầu
      if (diffHours >= 22 && diffHours <= 26 && !meeting.reminder1DaySent) {
        reminderType = "1_day";
        shouldSend = true;
      }
      // 2. Nhắc trước 30 phút: khoảng 15 phút đến 45 phút trước giờ bắt đầu
      else if (diffMinutes >= 15 && diffMinutes <= 45 && !meeting.reminder30MinSent) {
        reminderType = "30_min";
        shouldSend = true;
      }
      // 3. Nhắc khi bắt đầu: từ 5 phút trước đến 15 phút sau giờ bắt đầu
      else if (diffMinutes >= -15 && diffMinutes <= 5 && !meeting.reminderStartSent) {
        reminderType = "start";
        shouldSend = true;
      }

      if (!shouldSend || !reminderType) {
        continue;
      }

      // Thu thập danh sách email và User ID của toàn bộ thành phần tham gia (attendees, host, secretary)
      const recipientEmails = new Set();
      const recipientUserIds = new Set();

      const addRecipient = (userObj, directEmail) => {
        if (userObj) {
          const uId = userObj._id || userObj;
          if (uId) recipientUserIds.add(uId.toString());
          if (userObj.email && userObj.email.includes("@")) {
            recipientEmails.add(userObj.email.trim());
          }
        }
        if (directEmail && directEmail.includes("@")) {
          recipientEmails.add(directEmail.trim());
        }
      };

      // Host & Secretary
      if (meeting.host) addRecipient(meeting.host);
      if (meeting.secretary) addRecipient(meeting.secretary);

      // Attendees
      if (meeting.attendees && meeting.attendees.length > 0) {
        meeting.attendees.forEach((att) => {
          addRecipient(att.user, att.email);
        });
      }

      const emailList = Array.from(recipientEmails);
      const userList = Array.from(recipientUserIds);

      let notifTitle = "";
      let notifBody = "";

      const timeStr = startTime.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
      const dateStr = startTime.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

      if (reminderType === "1_day") {
        notifTitle = `Nhắc lịch họp: ${meeting.title}`;
        notifBody = `Cuộc họp sẽ diễn ra vào ngày mai lúc ${timeStr} ${dateStr} tại ${meeting.location}.`;
      } else if (reminderType === "30_min") {
        notifTitle = `Sắp đến giờ họp (còn 30 phút): ${meeting.title}`;
        notifBody = `Phiên họp số "${meeting.title}" sẽ bắt đầu lúc ${timeStr}. Vui lòng vào phòng họp.`;
      } else if (reminderType === "start") {
        notifTitle = `Cuộc họp bắt đầu: ${meeting.title}`;
        notifBody = `Phiên họp đang diễn ra lúc ${timeStr}. Quý Đại biểu vui lòng điểm danh vào họp.`;
      }

      // A. Gửi email
      if (emailList.length > 0) {
        try {
          await sendMeetingReminderEmail(emailList, meeting, reminderType);
        } catch (emailErr) {
          console.error(`[MeetingReminder] Lỗi gửi email cho cuộc họp ${meeting._id}:`, emailErr.message);
        }
      }

      // B. Tạo thông báo in-app (Notification)
      if (userList.length > 0) {
        try {
          const notifDocs = userList.map((uId) => ({
            recipient: uId,
            sender: meeting.createdBy || meeting.host?._id || meeting.host,
            type: "GENERAL",
            title: notifTitle,
            message: notifBody,
            link: `/meetings/${meeting._id}`,
            isRead: false,
            isPopupShown: false,
          }));
          await Notification.insertMany(notifDocs);
        } catch (notifErr) {
          console.error(`[MeetingReminder] Lỗi tạo thông báo in-app ${meeting._id}:`, notifErr.message);
        }

        // C. Gửi thông báo đẩy WebPush
        try {
          await sendPushToUsers(userList, {
            title: notifTitle,
            body: notifBody,
            url: `/meetings/${meeting._id}`,
          });
        } catch (pushErr) {
          console.error(`[MeetingReminder] Lỗi gửi Push cho cuộc họp ${meeting._id}:`, pushErr.message);
        }
      }

      // Đánh dấu cờ đã gửi và lưu lại
      if (reminderType === "1_day") {
        meeting.reminder1DaySent = true;
      } else if (reminderType === "30_min") {
        meeting.reminder30MinSent = true;
      } else if (reminderType === "start") {
        meeting.reminderStartSent = true;
      }

      await meeting.save();
      processedCount++;
      console.log(`[MeetingReminder] Đã xử lý gửi nhắc nhở (${reminderType}) cho cuộc họp: ${meeting.title} (${meeting._id})`);
    }

    return { success: true, count: processedCount };
  } catch (error) {
    console.error("Error in executeMeetingReminders:", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  executeMeetingReminders,
};
