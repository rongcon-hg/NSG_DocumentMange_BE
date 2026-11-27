const RecurringWorkSchedule = require("../models/recurringWorkSchedule.model");
const WorkSchedule = require("../models/workSchedule.model");
const User = require("../models/user.model");

/**
 * Tính ngày chạy tiếp theo cho Mẫu lịch công tác định kỳ
 * @param {Object} recSchedule
 * @param {Date} baseDate
 */
const calculateNextRunDate = (recSchedule, baseDate = new Date()) => {
  let d = new Date(baseDate);
  d.setHours(0, 0, 0, 0);

  // Nếu có recurringStartDate và ngày này ở tương lai so với baseDate:
  if (recSchedule.recurringStartDate) {
    const recStart = new Date(recSchedule.recurringStartDate);
    recStart.setHours(0, 0, 0, 0);
    if (recStart > d) {
      // Lấy ngày liền trước recurringStartDate để nếu chính recurringStartDate thỏa mãn chu kỳ thì nó được chọn
      d = new Date(recStart);
      d.setDate(d.getDate() - 1);
    }
  }

  let nextDate = null;
  const freq = recSchedule.frequency || "WEEKLY";

  if (freq === "WEEKLY") {
    const days =
      recSchedule.repeatDaysOfWeek && recSchedule.repeatDaysOfWeek.length > 0
        ? recSchedule.repeatDaysOfWeek
        : [1]; // 1 = Thứ 2, 7 = Chủ nhật

    for (let i = 1; i <= 14; i++) {
      const checkDate = new Date(d);
      checkDate.setDate(checkDate.getDate() + i);
      const jsDay = checkDate.getDay();
      const modelDay = jsDay === 0 ? 7 : jsDay;
      if (days.includes(modelDay)) {
        nextDate = checkDate;
        break;
      }
    }
    if (!nextDate) {
      d.setDate(d.getDate() + 7);
      nextDate = d;
    }
  } else if (freq === "MONTHLY") {
    const targetDay = recSchedule.repeatDayOfMonth || 1;
    let candidate = new Date(d.getFullYear(), d.getMonth(), targetDay, 0, 0, 0, 0);

    if (candidate.getTime() <= d.getTime()) {
      candidate = new Date(d.getFullYear(), d.getMonth() + 1, targetDay, 0, 0, 0, 0);
    }
    nextDate = candidate;
  } else if (freq === "QUARTERLY") {
    const offset = Math.max(0, Math.min(2, (recSchedule.repeatQuarterMonth || 1) - 1)); // 0: tháng đầu, 1: tháng giữa, 2: tháng cuối
    const targetDay = recSchedule.repeatDayOfMonth || 1;
    const quarters =
      Array.isArray(recSchedule.repeatQuarters) && recSchedule.repeatQuarters.length > 0
        ? recSchedule.repeatQuarters
        : [1, 2, 3, 4];
    const validMonths = quarters.map((q) => (q - 1) * 3 + offset).sort((a, b) => a - b);

    for (const m of validMonths) {
      const candidate = new Date(d.getFullYear(), m, targetDay, 0, 0, 0, 0);
      if (candidate.getTime() > d.getTime()) {
        nextDate = candidate;
        break;
      }
    }

    // Nếu hết năm, nhảy sang quý đầu của năm sau
    if (!nextDate) {
      nextDate = new Date(d.getFullYear() + 1, validMonths[0] !== undefined ? validMonths[0] : offset, targetDay, 0, 0, 0, 0);
    }
  } else if (freq === "YEARLY") {
    const targetMonth = (recSchedule.repeatMonthOfYear || 1) - 1; // 0 - 11
    const targetDay = recSchedule.repeatDayOfMonth || 1;
    let candidate = new Date(d.getFullYear(), targetMonth, targetDay, 0, 0, 0, 0);

    if (candidate.getTime() <= d.getTime()) {
      candidate = new Date(d.getFullYear() + 1, targetMonth, targetDay, 0, 0, 0, 0);
    }
    nextDate = candidate;
  } else {
    d.setDate(d.getDate() + 7);
    nextDate = d;
  }

  // Nếu có recurringEndDate, kiểm tra xem nextDate có vượt quá thời hạn lặp không
  if (nextDate && recSchedule.recurringEndDate) {
    const recEnd = new Date(recSchedule.recurringEndDate);
    recEnd.setHours(23, 59, 59, 999);
    if (nextDate.getTime() > recEnd.getTime()) {
      return null; // Đã quá hạn lặp, không sinh lịch tiếp
    }
  }

  return nextDate;
};

/**
 * Sinh một bản ghi WorkSchedule từ mẫu lịch định kỳ vào ngày được chỉ định
 * @param {Object} recSchedule
 * @param {Date} runDate
 * @param {String} triggerUserId (nếu bấm Chạy ngay)
 */
const generateSingleScheduleFromRecurring = async (
  recSchedule,
  runDate = new Date(),
  triggerUserId = null
) => {
  try {
    const creatorId = triggerUserId || recSchedule.createdBy;
    const duration = Math.max(1, recSchedule.durationDays || 1);

    const startD = new Date(runDate);
    const startStr = `${startD.getFullYear()}-${String(startD.getMonth() + 1).padStart(2, "0")}-${String(startD.getDate()).padStart(2, "0")}`;

    const endD = new Date(runDate);
    endD.setDate(endD.getDate() + (duration - 1));
    const endStr = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, "0")}-${String(endD.getDate()).padStart(2, "0")}`;

    const startDate = new Date(`${startStr}T00:00:00+07:00`);
    const endDate = new Date(`${endStr}T23:59:59+07:00`);

    // Kiểm tra giới hạn ngày bắt đầu & kết thúc lặp (nếu có cấu hình)
    if (recSchedule.recurringStartDate) {
      const recStart = new Date(recSchedule.recurringStartDate);
      recStart.setHours(0, 0, 0, 0);
      if (startDate < recStart) {
        console.log(`[RecurringSchedule] Bỏ qua ngày ${startStr} do trước ngày bắt đầu lặp.`);
        recSchedule.nextRunDate = calculateNextRunDate(recSchedule, runDate);
        await recSchedule.save();
        return null;
      }
    }

    if (recSchedule.recurringEndDate) {
      const recEnd = new Date(recSchedule.recurringEndDate);
      recEnd.setHours(23, 59, 59, 999);
      if (startDate > recEnd) {
        console.log(`[RecurringSchedule] Bỏ qua ngày ${startStr} do sau ngày kết thúc lặp.`);
        recSchedule.nextRunDate = null;
        await recSchedule.save();
        return null;
      }
    }

    // Kiểm tra trùng lặp để tránh tạo nhiều lần trong cùng ngày cho cùng một mẫu
    const existing = await WorkSchedule.findOne({
      startDate,
      content: recSchedule.content,
      status: "APPROVED",
    });

    if (existing) {
      console.log(`[RecurringSchedule] Lịch "${recSchedule.content.substring(0, 30)}" đã tồn tại ngày ${startStr}, cập nhật nextRunDate tiếp theo.`);
      recSchedule.nextRunDate = calculateNextRunDate(recSchedule, runDate);
      await recSchedule.save();
      return existing;
    }

    // Tự động ban hành lịch chính thức (APPROVED) vì đây là chức năng của Admin, Manager, Hiệu trưởng
    const newSchedule = new WorkSchedule({
      startDate,
      endDate,
      startTime: recSchedule.startTime || "08:00",
      endTime: recSchedule.endTime || "10:30",
      content: recSchedule.content,
      participants: recSchedule.participants || "",
      location: recSchedule.location || "",
      notes: recSchedule.notes || "",
      host: recSchedule.host || "Ban Giám Hiệu",
      department: recSchedule.department || null,
      createdBy: creatorId,
      status: "APPROVED",
      approvedBy: creatorId,
      approvedAt: new Date(),
      rejectionReason: "",
      attachments: [],
    });

    await newSchedule.save();

    // Cập nhật thông số lần chạy cho mẫu
    recSchedule.lastGeneratedAt = new Date();
    recSchedule.totalGeneratedCount = (recSchedule.totalGeneratedCount || 0) + 1;
    recSchedule.nextRunDate = calculateNextRunDate(recSchedule, runDate);
    await recSchedule.save();

    console.log(`[RecurringSchedule] Đã tự động ban hành lịch: "${recSchedule.content.substring(0, 35)}" cho ngày ${startStr}`);
    return newSchedule;
  } catch (err) {
    console.error(`[RecurringSchedule] Lỗi khi sinh lịch từ mẫu ID ${recSchedule._id}:`, err);
    throw err;
  }
};

/**
 * Quét toàn bộ mẫu lịch công tác định kỳ để sinh lịch tự động trước thời điểm diễn ra.
 * Yêu cầu đặc biệt:
 * "đối với những lịch hẹn lặp lại định kỳ thì sẽ hiển thị thông tin lịch vào ngày thứ 6 trước ngày hẹn lịch
 * để cho người dùng biết trước lịch. Ví dụ có lịch lặp lại vào thứ 2 hàng tuần (26/10) thì lịch đó của tuần liền kề
 * sẽ được hiển thị trên lịch công tác trước vào ngày thứ 6 của tuần này. Đảm bảo có lịch trước khi tuần diễn ra sự kiện đó bắt đầu."
 * 
 * Do đó, ngưỡng quét (lead time window):
 * Quét trước tối thiểu 7 - 10 ngày (đặc biệt đến hết Chủ Nhật của tuần tới).
 * Bất cứ sự kiện định kỳ nào rơi vào khoảng từ nay đến hết tuần tới (hoặc đến nextSundayOfWeekAhead)
 * đều sẽ được tự động sinh ngay vào thứ 6 (hoặc các ngày trước đó) để người dùng xem trước kế hoạch công tác.
 */
const executeRecurringWorkSchedulesGeneration = async () => {
  try {
    const now = new Date();
    // Ngưỡng quét nhìn trước (Look-ahead window): Quét trước 10 ngày để đảm bảo vào Thứ 6 (hoặc bất kỳ ngày nào trước đó)
    // thì toàn bộ lịch của tuần kế tiếp (Thứ 2 đến Chủ nhật) đã được sinh và hiển thị đầy đủ
    const horizonDate = new Date(now);
    horizonDate.setDate(horizonDate.getDate() + 10);
    horizonDate.setHours(23, 59, 59, 999);

    const activeTemplates = await RecurringWorkSchedule.find({
      isActive: true,
      $or: [
        { nextRunDate: { $lte: horizonDate } },
        { nextRunDate: null },
      ],
    });

    if (!activeTemplates || activeTemplates.length === 0) {
      return { success: true, count: 0 };
    }

    console.log(`[RecurringSchedule Cron] Tìm thấy ${activeTemplates.length} mẫu lịch định kỳ cần quét (ngưỡng nhìn trước đến ${horizonDate.toLocaleDateString("vi-VN")}).`);

    let generatedCount = 0;
    for (const template of activeTemplates) {
      try {
        let currentTargetDate = template.nextRunDate;
        if (!currentTargetDate) {
          currentTargetDate = calculateNextRunDate(template, new Date());
          template.nextRunDate = currentTargetDate;
          await template.save();
        }
        
        // Vòng lặp sinh lịch cho đến khi nextRunDate vượt quá ngưỡng nhìn trước (horizonDate)
        // Cho phép tối đa 20 vòng lặp để bắt kịp nếu có ngày trong quá khứ bị bỏ lỡ
        let loopLimit = 0;
        while (currentTargetDate && currentTargetDate <= horizonDate && loopLimit < 20) {
          // Kiểm tra nếu template có ngày kết thúc lặp và currentTargetDate đã vượt qua
          if (template.recurringEndDate) {
            const recEnd = new Date(template.recurringEndDate);
            recEnd.setHours(23, 59, 59, 999);
            if (new Date(currentTargetDate).getTime() > recEnd.getTime()) {
              template.nextRunDate = null;
              await template.save();
              break;
            }
          }

          loopLimit++;
          const prevTime = new Date(currentTargetDate).getTime();
          await generateSingleScheduleFromRecurring(template, currentTargetDate);
          generatedCount++;

          let nextDate = template.nextRunDate;
          // Nếu nextRunDate không tự động tiến lên (hoặc bị trùng), ép buộc tính ngày tiếp theo
          if (!nextDate || new Date(nextDate).getTime() <= prevTime) {
            nextDate = calculateNextRunDate(template, currentTargetDate);
            template.nextRunDate = nextDate;
            await template.save();
          }
          currentTargetDate = nextDate;
        }
      } catch (e) {
        console.error(`Lỗi sinh lịch cho mẫu ${template._id}:`, e.message);
      }
    }

    console.log(`[RecurringSchedule Cron] Đã hoàn tất, xử lý/sinh thành công ${generatedCount} lượt lịch công tác.`);
    return { success: true, count: generatedCount };
  } catch (error) {
    console.error("[RecurringSchedule Cron] Lỗi khi quét sinh lịch định kỳ:", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  calculateNextRunDate,
  generateSingleScheduleFromRecurring,
  executeRecurringWorkSchedulesGeneration,
};
