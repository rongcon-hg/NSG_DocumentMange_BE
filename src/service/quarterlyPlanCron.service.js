const QuarterlyPlanItem = require("../models/quarterlyPlanItem.model");
const QuarterlyPlan = require("../models/quarterlyPlan.model");
const User = require("../models/user.model");
const Position = require("../models/position.model");
const Notification = require("../models/notification.model");
const { sendQuarterlyPlanReminderEmail } = require("./NodeMailer.service/email");
const { sendPushToUsers } = require("./webPush.service");

/**
 * Helper: Lấy chuỗi ngày YYYY-MM-DD theo múi giờ Việt Nam
 */
const toVietnamDateString = (d) => {
  if (!d) return null;
  const dateObj = new Date(d);
  if (isNaN(dateObj.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dateObj); // "YYYY-MM-DD"
};

/**
 * Helper: Tính số ngày chênh lệch giữa ngày cần so sánh với ngày hiện tại (theo múi giờ Việt Nam)
 * diffDays = dDeadline - dToday
 * - diffDays > 0: Còn n ngày nữa đến hạn
 * - diffDays === 0: Đến hạn hôm nay
 * - diffDays < 0: Đã quá hạn |diffDays| ngày
 */
const getDayDifference = (deadlineDate, todayDate = new Date()) => {
  const deadlineStr = toVietnamDateString(deadlineDate);
  const todayStr = toVietnamDateString(todayDate);
  if (!deadlineStr || !todayStr) return null;

  const dDeadline = new Date(deadlineStr).getTime();
  const dToday = new Date(todayStr).getTime();
  return Math.round((dDeadline - dToday) / (1000 * 3600 * 24));
};

/**
 * Tìm danh sách người nhận thông báo hợp lệ cho một nhiệm vụ:
 * 1. Cấp trưởng của Đơn vị chủ trì (TK, TP, GD)
 * 2. Cấp trưởng của Đơn vị phối hợp (TK, TP, GD)
 * 3. Lãnh đạo Ban Giám hiệu phụ trách chỉ đạo (bghInCharge)
 *
 * * LƯU Ý QUAN TRỌNG:
 * - KHÔNG gửi cho Cấp phó (PTK, PTP, PBT, role 'cappho')
 * - KHÔNG gửi cho Giảng viên, Chuyên viên (GV, CV, role 'chuyenvien', 'staff' không phải cấp trưởng)
 */
const getTargetRecipientsForItem = async (item) => {
  try {
    // 1. Lấy danh sách ID các phòng ban liên quan (chủ trì + phối hợp)
    const departmentIds = [];
    if (Array.isArray(item.assignedDepartments)) {
      item.assignedDepartments.forEach((d) => {
        const id = d._id ? d._id.toString() : d.toString();
        if (id && !departmentIds.includes(id)) departmentIds.push(id);
      });
    }
    if (Array.isArray(item.coordinatingDepartments)) {
      item.coordinatingDepartments.forEach((d) => {
        const id = d._id ? d._id.toString() : d.toString();
        if (id && !departmentIds.includes(id)) departmentIds.push(id);
      });
    }

    // 2. Tìm các Position ID đại diện cho "Cấp trưởng"
    // Các vị trí Cấp trưởng chuẩn trong DB: Trưởng Phòng (TP), Trưởng khoa (TK), Giám đốc (GD), Bí thư Đoàn (BT)
    const leaderPositions = await Position.find({
      $or: [
        { positionCode: { $in: ["TP", "TK", "GD", "BT"] } },
        { positionName: { $regex: /^(trưởng\s+(phòng|khoa|ban|trung tâm)|giám đốc|bí thư\s+đoàn)/i } },
      ],
    }).select("_id");
    const leaderPosIds = leaderPositions.map((p) => p._id);

    // 3. Tìm tất cả User là Cấp trưởng của các phòng ban liên quan
    let departmentLeaders = [];
    if (departmentIds.length > 0 && leaderPosIds.length > 0) {
      departmentLeaders = await User.find({
        department: { $in: departmentIds },
        position: { $in: leaderPosIds },
        role: { $ne: "cappho" }, // Chắc chắn loại trừ role cấp phó
      })
        .populate("position", "positionName positionCode")
        .populate("department", "departmentName departmentCode")
        .select("_id name email position department role emailNotifications");
    }

    // 4. Lấy danh sách Ban Giám hiệu phụ trách chỉ đạo (bghInCharge)
    const bghUserIds = [];
    if (Array.isArray(item.bghInCharge)) {
      item.bghInCharge.forEach((u) => {
        const id = u._id ? u._id.toString() : u.toString();
        if (id && !bghUserIds.includes(id)) bghUserIds.push(id);
      });
    }

    let bghUsers = [];
    if (bghUserIds.length > 0) {
      bghUsers = await User.find({
        _id: { $in: bghUserIds },
      })
        .populate("position", "positionName positionCode")
        .populate("department", "departmentName departmentCode")
        .select("_id name email position department role emailNotifications");
    }

    // 5. Gộp lại và loại trừ trùng lặp
    const mapUsers = new Map();
    [...departmentLeaders, ...bghUsers].forEach((u) => {
      const uId = u._id.toString();
      if (!mapUsers.has(uId)) {
        mapUsers.set(uId, u);
      }
    });

    return Array.from(mapUsers.values());
  } catch (err) {
    console.error("Lỗi getTargetRecipientsForItem:", err);
    return [];
  }
};

/**
 * Quét toàn bộ Kế hoạch quý và gửi email + chuông thông báo
 * Cho các nhiệm vụ:
 * 1. Sắp đến hạn (còn từ 1 đến 3 ngày nữa đến hạn) -> 'near_deadline'
 * 2. Đến hạn hôm nay (diffDays === 0) -> 'due_today'
 * 3. Đã quá hạn (diffDays < 0, quét 1 lần hoặc định kỳ) -> 'overdue'
 */
const executeQuarterlyPlanReminders = async () => {
  console.log("=== [QUARTERLY PLAN CRON] Bắt đầu quét nhiệm vụ Kế hoạch quý để gửi Email & Chuông thông báo ===");
  try {
    const today = new Date();
    const todayStr = toVietnamDateString(today);

    // Lấy các nhiệm vụ chưa hoàn thành và không tạm dừng
    const items = await QuarterlyPlanItem.find({
      status: { $nin: ["COMPLETED", "PAUSED"] },
      actualCompletedDate: null,
      expectedDeadline: { $ne: null },
    })
      .populate("planId", "title quarter academicYear startDate endDate")
      .populate("assignedDepartments", "_id departmentName departmentCode")
      .populate("coordinatingDepartments", "_id departmentName departmentCode")
      .populate("bghInCharge", "_id name email position")
      .sort({ expectedDeadline: 1 });

    console.log(`[QUARTERLY PLAN CRON] Tìm thấy ${items.length} nhiệm vụ chưa hoàn thành cần kiểm tra hạn.`);

    let emailSentCount = 0;
    let notifCreatedCount = 0;

    for (const item of items) {
      if (!item.expectedDeadline) continue;

      const diffDays = getDayDifference(item.expectedDeadline, today);
      if (diffDays === null) continue;

      let reminderType = null;
      let shouldSendNotification = false;

      // Kịch bản 1: Sắp đến hạn (còn 1 đến 3 ngày: diffDays >= 1 && diffDays <= 3)
      if (diffDays >= 1 && diffDays <= 3) {
        if (!item.nearDeadlineReminderSent) {
          reminderType = "near_deadline";
          shouldSendNotification = true;
          item.nearDeadlineReminderSent = true;
        }
      }
      // Kịch bản 2: Đến hạn hôm nay (diffDays === 0)
      else if (diffDays === 0) {
        if (!item.dueTodayReminderSent) {
          reminderType = "due_today";
          shouldSendNotification = true;
          item.dueTodayReminderSent = true;
        }
      }
      // Kịch bản 3: Đã quá hạn (diffDays < 0)
      else if (diffDays < 0) {
        if (!item.overdueReminderSent) {
          reminderType = "overdue";
          shouldSendNotification = true;
          item.overdueReminderSent = true;
        }
      }

      if (shouldSendNotification && reminderType) {
        // Lấy danh sách người nhận (Chỉ Cấp trưởng các đơn vị liên quan + Ban Giám hiệu)
        const recipients = await getTargetRecipientsForItem(item);
        if (recipients.length === 0) {
          await item.save();
          continue;
        }

        // Lọc email của những người nhận đồng ý nhận email (mặc định true)
        const emailRecipients = recipients
          .filter((u) => !u.emailNotifications || u.emailNotifications.quarterlyPlanReminder !== false)
          .map((u) => u.email)
          .filter((e) => !!e && e.includes("@"));

        // 1. GỬI EMAIL THÔNG BÁO CHI TIẾT
        if (emailRecipients.length > 0) {
          try {
            await sendQuarterlyPlanReminderEmail(
              emailRecipients,
              item.planId,
              item,
              reminderType
            );
            emailSentCount += emailRecipients.length;
          } catch (eErr) {
            console.error(`[QUARTERLY PLAN CRON] Lỗi gửi email cho nhiệm vụ ${item._id}:`, eErr.message);
          }
        }

        // 2. TẠO THÔNG BÁO TRÊN CHUÔNG (Notification DB) & GỬI WEB PUSH
        let notifTitle = "";
        let notifMessage = "";
        const planName = item.planId?.title || "Kế hoạch quý";

        if (reminderType === "near_deadline") {
          notifTitle = `[Sắp đến hạn] Nhiệm vụ Kế hoạch quý (còn ${diffDays} ngày)`;
          notifMessage = `Nhiệm vụ "${item.taskContent}" thuộc ${planName} sẽ đến hạn vào ngày ${toVietnamDateString(item.expectedDeadline)}. Kính đề nghị Đơn vị chủ trì và phối hợp khẩn trương rà soát.`;
        } else if (reminderType === "due_today") {
          notifTitle = `[Đến hạn hôm nay] Nhiệm vụ Kế hoạch quý`;
          notifMessage = `Nhiệm vụ "${item.taskContent}" thuộc ${planName} ĐẾN HẠN HOÀN THÀNH TRONG HÔM NAY. Vui lòng nộp báo cáo hoặc cập nhật tiến độ kịp thời.`;
        } else if (reminderType === "overdue") {
          notifTitle = `[Quá hạn] Nhiệm vụ Kế hoạch quý đã quá hạn dự kiến`;
          notifMessage = `Nhiệm vụ "${item.taskContent}" thuộc ${planName} đã quá hạn dự kiến (${Math.abs(diffDays)} ngày). Kính đề nghị báo cáo tình hình cho Ban Giám hiệu phụ trách.`;
        }

        const notifDocs = recipients.map((u) => ({
          recipient: u._id,
          type: "QUARTERLY_PLAN",
          title: notifTitle,
          message: notifMessage,
          link: "/schedule/quarterly-plan",
          metadata: {
            planId: item.planId?._id || item.planId,
            itemId: item._id,
            reminderType,
            expectedDeadline: item.expectedDeadline,
          },
        }));

        if (notifDocs.length > 0) {
          try {
            await Notification.insertMany(notifDocs);
            notifCreatedCount += notifDocs.length;

            // Gửi Web Push Notification tức thì đến trình duyệt/PWA
            const recipientIds = recipients.map((u) => u._id);
            sendPushToUsers(recipientIds, {
              title: notifTitle,
              body: item.taskContent,
              url: "/schedule/quarterly-plan",
            }).catch((pErr) => console.error("[QUARTERLY PLAN CRON] Push Notify Error:", pErr));
          } catch (nErr) {
            console.error(`[QUARTERLY PLAN CRON] Lỗi tạo thông báo chuông:`, nErr.message);
          }
        }

        item.lastReminderDate = todayStr;
        await item.save();
      }
    }

    console.log(`=== [QUARTERLY PLAN CRON] Hoàn tất quét. Đã gửi ${emailSentCount} email, tạo ${notifCreatedCount} thông báo chuông. ===`);
    return { success: true, emailSentCount, notifCreatedCount };
  } catch (error) {
    console.error("[QUARTERLY PLAN CRON] Lỗi khi thực thi Cron Kế hoạch quý:", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  executeQuarterlyPlanReminders,
  getTargetRecipientsForItem,
};
