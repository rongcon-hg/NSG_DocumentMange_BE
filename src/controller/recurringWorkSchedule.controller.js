const RecurringWorkSchedule = require("../models/recurringWorkSchedule.model");
const Department = require("../models/department.model");
const Position = require("../models/position.model");
const {
  calculateNextRunDate,
  generateSingleScheduleFromRecurring,
  executeRecurringWorkSchedulesGeneration,
} = require("../service/recurringWorkSchedule.service");

/**
 * Kiểm tra xem người dùng có quyền quản trị mẫu lịch định kỳ không
 * Quyền: Admin, Manager, Hiệu trưởng, Quyền Hiệu trưởng
 */
const checkIsAuthorized = async (user) => {
  if (!user) return false;
  if (user.role === "admin" || user.role === "manager") return true;

  if (user.position) {
    const pos = await Position.findById(user.position).select("positionName positionCode abbreviation code").lean();
    const pCode = (pos?.positionCode || pos?.abbreviation || pos?.code || "").toUpperCase();
    const pName = (pos?.positionName || "").toLowerCase();
    if (
      ["HT", "QHT"].includes(pCode) ||
      (pName.includes("hiệu trưởng") && !pName.includes("phó") && !pName.includes("nguyên")) ||
      pName.includes("quyền hiệu trưởng")
    ) {
      return true;
    }
  }

  return false;
};

/**
 * [GET] /api/work-schedules/recurring
 * Lấy danh sách các mẫu lịch định kỳ
 */
exports.getRecurringWorkSchedules = async (req, res) => {
  try {
    const isAuth = await checkIsAuthorized(req.user);
    if (!isAuth) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền quản lý mẫu lịch công tác định kỳ.",
      });
    }

    const { keyword = "", frequency } = req.query;
    const filter = {};

    if (frequency) {
      filter.frequency = frequency;
    }

    if (keyword && keyword.trim()) {
      const reg = new RegExp(keyword.trim(), "i");
      filter.$or = [{ title: reg }, { content: reg }, { location: reg }, { host: reg }];
    }

    const templates = await RecurringWorkSchedule.find(filter)
      .populate("createdBy", "name email")
      .populate("department", "departmentName departmentCode")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: templates,
      total: templates.length,
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách mẫu lịch định kỳ:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống khi tải danh sách mẫu lịch định kỳ.",
      error: error.message,
    });
  }
};

/**
 * [POST] /api/work-schedules/recurring
 * Tạo mới một mẫu lịch công tác định kỳ
 */
exports.createRecurringWorkSchedule = async (req, res) => {
  try {
    const isAuth = await checkIsAuthorized(req.user);
    if (!isAuth) {
      return res.status(403).json({
        success: false,
        message: "Chỉ Admin, Manager và Hiệu trưởng / Q.Hiệu trưởng mới có quyền tạo mẫu lịch định kỳ.",
      });
    }

    const {
      title,
      content,
      participants,
      location,
      notes,
      host,
      department,
      startTime,
      endTime,
      durationDays,
      frequency,
      repeatDaysOfWeek,
      repeatDayOfMonth,
      repeatQuarterMonth,
      repeatQuarters,
      repeatMonthOfYear,
      startDate, // Ngày bắt đầu tính chu kỳ
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: "Tiêu đề mẫu lịch không được để trống." });
    }

    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: "Nội dung công tác không được để trống." });
    }

    const newTemplate = new RecurringWorkSchedule({
      title: title.trim(),
      content: content.trim(),
      participants: participants?.trim() || "",
      location: location?.trim() || "",
      notes: notes?.trim() || "",
      host: host?.trim() || "Ban Giám Hiệu",
      department: department || req.user.department,
      createdBy: req.user._id,
      startTime: startTime || "08:00",
      endTime: endTime || "10:30",
      durationDays: Number(durationDays) || 1,
      frequency: frequency || "WEEKLY",
      repeatDaysOfWeek: Array.isArray(repeatDaysOfWeek) ? repeatDaysOfWeek : [1],
      repeatDayOfMonth: Number(repeatDayOfMonth) || 1,
      repeatQuarterMonth: Number(repeatQuarterMonth) || 1,
      repeatQuarters: Array.isArray(repeatQuarters) ? repeatQuarters : [1, 2, 3, 4],
      repeatMonthOfYear: Number(repeatMonthOfYear) || 1,
      isActive: true,
    });

    const baseD = startDate ? new Date(startDate) : new Date();
    newTemplate.nextRunDate = calculateNextRunDate(newTemplate, baseD);

    await newTemplate.save();

    // Tự động quét sinh lịch cho tuần/thời gian kế tiếp ngay khi tạo mẫu mới (nếu sự kiện sắp diễn ra trong 10 ngày tới)
    executeRecurringWorkSchedulesGeneration().catch((err) =>
      console.warn("Lỗi auto generate schedule sau khi tạo mẫu:", err.message)
    );

    const populated = await RecurringWorkSchedule.findById(newTemplate._id)
      .populate("createdBy", "name email")
      .populate("department", "departmentName departmentCode");

    return res.status(201).json({
      success: true,
      message: "Tạo mẫu lịch công tác định kỳ thành công.",
      data: populated,
    });
  } catch (error) {
    console.error("Lỗi tạo mẫu lịch định kỳ:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống khi tạo mẫu lịch định kỳ.",
      error: error.message,
    });
  }
};

/**
 * [PUT] /api/work-schedules/recurring/:id
 * Cập nhật mẫu lịch định kỳ
 */
exports.updateRecurringWorkSchedule = async (req, res) => {
  try {
    const isAuth = await checkIsAuthorized(req.user);
    if (!isAuth) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền cập nhật mẫu lịch định kỳ.",
      });
    }

    const { id } = req.params;
    const template = await RecurringWorkSchedule.findById(id);
    if (!template) {
      return res.status(404).json({ success: false, message: "Không tìm thấy mẫu lịch định kỳ." });
    }

    const {
      title,
      content,
      participants,
      location,
      notes,
      host,
      department,
      startTime,
      endTime,
      durationDays,
      frequency,
      repeatDaysOfWeek,
      repeatDayOfMonth,
      repeatQuarterMonth,
      repeatQuarters,
      repeatMonthOfYear,
      isActive,
    } = req.body;

    if (title !== undefined) template.title = title.trim();
    if (content !== undefined) template.content = content.trim();
    if (participants !== undefined) template.participants = participants.trim();
    if (location !== undefined) template.location = location.trim();
    if (notes !== undefined) template.notes = notes.trim();
    if (host !== undefined) template.host = host.trim();
    if (department !== undefined) template.department = department;
    if (startTime !== undefined) template.startTime = startTime;
    if (endTime !== undefined) template.endTime = endTime;
    if (durationDays !== undefined) template.durationDays = Number(durationDays) || 1;
    if (frequency !== undefined) template.frequency = frequency;
    if (repeatDaysOfWeek !== undefined) template.repeatDaysOfWeek = repeatDaysOfWeek;
    if (repeatDayOfMonth !== undefined) template.repeatDayOfMonth = Number(repeatDayOfMonth);
    if (repeatQuarterMonth !== undefined) template.repeatQuarterMonth = Number(repeatQuarterMonth);
    if (repeatQuarters !== undefined) template.repeatQuarters = repeatQuarters;
    if (repeatMonthOfYear !== undefined) template.repeatMonthOfYear = Number(repeatMonthOfYear);
    if (isActive !== undefined) template.isActive = Boolean(isActive);

    // Tính lại nextRunDate nếu chu kỳ thay đổi
    template.nextRunDate = calculateNextRunDate(template, new Date());

    await template.save();

    const populated = await RecurringWorkSchedule.findById(template._id)
      .populate("createdBy", "name email")
      .populate("department", "departmentName departmentCode");

    return res.status(200).json({
      success: true,
      message: "Cập nhật mẫu lịch định kỳ thành công.",
      data: populated,
    });
  } catch (error) {
    console.error("Lỗi cập nhật mẫu lịch định kỳ:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống khi cập nhật mẫu lịch định kỳ.",
      error: error.message,
    });
  }
};

/**
 * [DELETE] /api/work-schedules/recurring/:id
 * Xóa mẫu lịch định kỳ
 */
exports.deleteRecurringWorkSchedule = async (req, res) => {
  try {
    const isAuth = await checkIsAuthorized(req.user);
    if (!isAuth) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền xóa mẫu lịch định kỳ.",
      });
    }

    const { id } = req.params;
    const deleted = await RecurringWorkSchedule.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Không tìm thấy mẫu lịch định kỳ." });
    }

    return res.status(200).json({
      success: true,
      message: "Đã xóa mẫu lịch định kỳ thành công.",
    });
  } catch (error) {
    console.error("Lỗi xóa mẫu lịch định kỳ:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống khi xóa mẫu lịch định kỳ.",
      error: error.message,
    });
  }
};

/**
 * [PATCH] /api/work-schedules/recurring/:id/toggle
 * Bật / tắt kích hoạt mẫu lịch
 */
exports.toggleRecurringWorkSchedule = async (req, res) => {
  try {
    const isAuth = await checkIsAuthorized(req.user);
    if (!isAuth) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền thay đổi trạng thái mẫu lịch.",
      });
    }

    const { id } = req.params;
    const template = await RecurringWorkSchedule.findById(id);
    if (!template) {
      return res.status(404).json({ success: false, message: "Không tìm thấy mẫu lịch." });
    }

    template.isActive = !template.isActive;
    if (template.isActive) {
      template.nextRunDate = calculateNextRunDate(template, new Date());
    }
    await template.save();

    return res.status(200).json({
      success: true,
      message: template.isActive ? "Đã kích hoạt mẫu lịch." : "Đã tạm dừng mẫu lịch.",
      data: template,
    });
  } catch (error) {
    console.error("Lỗi toggle mẫu lịch định kỳ:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống.",
      error: error.message,
    });
  }
};

/**
 * [POST] /api/work-schedules/recurring/:id/run-now
 * Kích hoạt sinh lịch công tác ngay lập tức từ mẫu
 */
exports.runRecurringWorkScheduleNow = async (req, res) => {
  try {
    const isAuth = await checkIsAuthorized(req.user);
    if (!isAuth) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền thực thi sinh lịch từ mẫu.",
      });
    }

    const { id } = req.params;
    const { targetDate } = req.body; // Ngày muốn sinh lịch (mặc định hôm nay hoặc ngày tiếp theo)

    const template = await RecurringWorkSchedule.findById(id);
    if (!template) {
      return res.status(404).json({ success: false, message: "Không tìm thấy mẫu lịch." });
    }

    const runDate = targetDate ? new Date(targetDate) : (template.nextRunDate || new Date());
    const generatedSchedule = await generateSingleScheduleFromRecurring(
      template,
      runDate,
      req.user._id
    );

    return res.status(200).json({
      success: true,
      message: `Đã ban hành lịch công tác thành công từ mẫu "${template.title}".`,
      data: generatedSchedule,
    });
  } catch (error) {
    console.error("Lỗi chạy ngay mẫu lịch định kỳ:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi sinh lịch công tác từ mẫu.",
      error: error.message,
    });
  }
};
