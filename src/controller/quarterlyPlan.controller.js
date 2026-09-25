const QuarterlyPlan = require("../models/quarterlyPlan.model");
const QuarterlyPlanItem = require("../models/quarterlyPlanItem.model");
const Department = require("../models/department.model");
const User = require("../models/user.model");
const Position = require("../models/position.model");

/**
 * Kiểm tra xem người dùng có quyền quản trị/nhập kế hoạch quý không
 * Manager và Admin có quyền quản trị toàn bộ
 */
const isManagerOrAdmin = (user) => {
  if (!user) return false;
  return user.role === "admin" || user.role === "manager";
};

/**
 * Kiểm tra xem người dùng có thuộc đối tượng được xem không:
 * Manager, Admin, Cấp trưởng, Cấp phó, Ban Giám hiệu
 */
const canViewQuarterlyPlan = (user) => {
  if (!user) return false;
  if (user.role === "admin" || user.role === "manager" || user.role === "cappho") return true;

  const posName = (user.position?.positionName || "").toLowerCase();
  const isLeader =
    posName.includes("trưởng") ||
    posName.includes("phó") ||
    posName.includes("giám đốc") ||
    posName.includes("hiệu trưởng");

  return isLeader;
};

/**
 * Lấy danh sách lãnh đạo Ban Giám hiệu và toàn bộ đơn vị để hỗ trợ Form nhập liệu
 */
const getPlanMetadata = async (req, res) => {
  try {
    // 1. Lấy toàn bộ đơn vị (Khoa/Phòng/Trung tâm) đang hoạt động, loại trừ đơn vị có chữ "giải thể"
    const departments = await Department.find({
      departmentName: { $not: /giải thể/i },
    })
      .select("_id departmentName departmentCode")
      .sort({ departmentName: 1 });

    // 2. Lấy danh sách người dùng thuộc Ban Giám hiệu (Hiệu trưởng, Phó Hiệu trưởng) - LỌC CHUẨN XÁC
    const bghPositions = await Position.find({
      $or: [
        { positionCode: { $in: ["HT", "PHT"] } },
        { positionName: { $regex: /hiệu trưởng/i } },
      ],
    }).select("_id");

    const bghPosIds = bghPositions.map((p) => p._id);
    const bghUsers = await User.find({
      position: { $in: bghPosIds },
    })
      .populate("position", "positionName positionCode")
      .select("_id name email position role")
      .sort({ name: 1 });

    return res.status(200).json({
      success: true,
      data: {
        departments,
        bghUsers,
      },
    });
  } catch (error) {
    console.error("Lỗi getPlanMetadata:", error);
    return res.status(500).json({ success: false, message: "Lỗi tải danh mục kế hoạch quý", error: error.message });
  }
};

/**
 * Lấy danh sách các Kế hoạch quý (có lọc theo năm học / quý)
 */
const getQuarterlyPlans = async (req, res) => {
  try {
    const { academicYear, quarter } = req.query;
    const filter = {};
    if (academicYear) filter.academicYear = academicYear;
    if (quarter) filter.quarter = Number(quarter);

    const plans = await QuarterlyPlan.find(filter)
      .populate("creator", "name email")
      .sort({ academicYear: -1, quarter: -1, createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: plans,
    });
  } catch (error) {
    console.error("Lỗi getQuarterlyPlans:", error);
    return res.status(500).json({ success: false, message: "Lỗi tải danh sách kế hoạch quý", error: error.message });
  }
};

/**
 * Tạo mới một Kế hoạch quý (Chỉ Manager / Admin)
 */
const createQuarterlyPlan = async (req, res) => {
  try {
    if (!isManagerOrAdmin(req.user)) {
      return res.status(403).json({ success: false, message: "Bạn không có quyền tạo kế hoạch quý mới." });
    }

    const { title, academicYear, year, quarter, startDate, endDate, note } = req.body;
    if (!title || !quarter) {
      return res.status(400).json({ success: false, message: "Vui lòng nhập tên kế hoạch và quý thực hiện." });
    }

    const plan = await QuarterlyPlan.create({
      title,
      academicYear: academicYear || "2026-2027",
      year: year || new Date().getFullYear(),
      quarter: Number(quarter),
      startDate,
      endDate,
      note,
      creator: req.user._id,
      status: "ACTIVE",
    });

    return res.status(201).json({
      success: true,
      message: "Đã tạo kế hoạch quý thành công!",
      data: plan,
    });
  } catch (error) {
    console.error("Lỗi createQuarterlyPlan:", error);
    return res.status(500).json({ success: false, message: "Lỗi tạo kế hoạch quý", error: error.message });
  }
};

/**
 * Cập nhật thông tin Kế hoạch quý (Manager / Admin)
 */
const updateQuarterlyPlan = async (req, res) => {
  try {
    if (!isManagerOrAdmin(req.user)) {
      return res.status(403).json({ success: false, message: "Bạn không có quyền chỉnh sửa kế hoạch quý." });
    }

    const { id } = req.params;
    const { title, academicYear, year, quarter, startDate, endDate, status, note } = req.body;

    const plan = await QuarterlyPlan.findById(id);
    if (!plan) {
      return res.status(404).json({ success: false, message: "Không tìm thấy kế hoạch quý." });
    }

    if (title !== undefined) plan.title = title;
    if (academicYear !== undefined) plan.academicYear = academicYear;
    if (year !== undefined) plan.year = year;
    if (quarter !== undefined) plan.quarter = quarter;
    if (startDate !== undefined) plan.startDate = startDate;
    if (endDate !== undefined) plan.endDate = endDate;
    if (status !== undefined) plan.status = status;
    if (note !== undefined) plan.note = note;

    await plan.save();

    return res.status(200).json({
      success: true,
      message: "Đã cập nhật kế hoạch quý thành công!",
      data: plan,
    });
  } catch (error) {
    console.error("Lỗi updateQuarterlyPlan:", error);
    return res.status(500).json({ success: false, message: "Lỗi cập nhật kế hoạch quý", error: error.message });
  }
};

/**
 * Xóa Kế hoạch quý và tất cả các nhiệm vụ thuộc kế hoạch đó (Manager / Admin)
 */
const deleteQuarterlyPlan = async (req, res) => {
  try {
    if (!isManagerOrAdmin(req.user)) {
      return res.status(403).json({ success: false, message: "Bạn không có quyền xóa kế hoạch quý." });
    }

    const { id } = req.params;
    const plan = await QuarterlyPlan.findById(id);
    if (!plan) {
      return res.status(404).json({ success: false, message: "Không tìm thấy kế hoạch quý." });
    }

    // Xóa tất cả các nhiệm vụ thuộc kế hoạch này
    await QuarterlyPlanItem.deleteMany({ planId: id });
    await QuarterlyPlan.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "Đã xóa kế hoạch quý và toàn bộ nhiệm vụ liên quan thành công!",
    });
  } catch (error) {
    console.error("Lỗi deleteQuarterlyPlan:", error);
    return res.status(500).json({ success: false, message: "Lỗi xóa kế hoạch quý", error: error.message });
  }
};

/**
 * Lấy chi tiết Kế hoạch quý kèm danh sách tất cả các mục nhiệm vụ đã phân công
 */
const getQuarterlyPlanDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const plan = await QuarterlyPlan.findById(id).populate("creator", "name email");
    if (!plan) {
      return res.status(404).json({ success: false, message: "Không tìm thấy kế hoạch quý." });
    }

    // Lấy các mục nhiệm vụ
    const items = await QuarterlyPlanItem.find({ planId: id })
      .populate("assignedDepartments", "_id departmentName departmentCode")
      .populate("coordinatingDepartments", "_id departmentName departmentCode")
      .populate({
        path: "bghInCharge",
        select: "_id name email position",
        populate: { path: "position", select: "positionName positionCode" },
      })
      .populate("creator", "name email")
      .populate("history.actor", "name email role")
      .sort({ groupName: 1, order: 1, createdAt: 1 });

    // Tính toán lại tự động nhận xét theo thời gian hiện tại
    const updatedItems = items.map((item) => {
      item.calculateAutoRemark();
      return item;
    });

    return res.status(200).json({
      success: true,
      data: {
        plan,
        items: updatedItems,
      },
    });
  } catch (error) {
    console.error("Lỗi getQuarterlyPlanDetail:", error);
    return res.status(500).json({ success: false, message: "Lỗi tải chi tiết kế hoạch quý", error: error.message });
  }
};

/**
 * Thêm một mục nhiệm vụ vào Kế hoạch quý (Manager / Admin)
 */
const createPlanItem = async (req, res) => {
  try {
    if (!isManagerOrAdmin(req.user)) {
      return res.status(403).json({ success: false, message: "Chỉ tài khoản Quản lý mới có quyền thêm nhiệm vụ." });
    }

    const {
      planId,
      groupName,
      order,
      taskContent,
      expectedOutcome,
      assignedDepartments,
      coordinatingDepartments,
      bghInCharge,
      startDate,
      expectedDeadline,
      manualRemark,
      files,
    } = req.body;

    if (!planId || !groupName || !taskContent || !expectedDeadline) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập nhóm nhiệm vụ, nội dung công việc và thời gian dự kiến hoàn thành.",
      });
    }

    const status = req.body.status || "NOT_STARTED";
    const pauseReason = req.body.pauseReason || "";

    const newItem = new QuarterlyPlanItem({
      planId,
      groupName: groupName.trim(),
      order: order || 0,
      taskContent: taskContent.trim(),
      expectedOutcome: expectedOutcome || "",
      assignedDepartments: assignedDepartments || [],
      coordinatingDepartments: coordinatingDepartments || [],
      bghInCharge: bghInCharge || [],
      startDate,
      expectedDeadline,
      manualRemark: manualRemark || "",
      files: files || [],
      creator: req.user._id,
      status,
      pauseReason,
      history: [
        {
          action: "CREATE",
          actor: req.user._id,
          actorName: req.user.name || "Quản trị viên",
          details: `Khởi tạo nhiệm vụ: "${taskContent.trim()}"`,
          timestamp: new Date(),
        },
      ],
    });

    newItem.calculateAutoRemark();
    await newItem.save();

    const populatedItem = await QuarterlyPlanItem.findById(newItem._id)
      .populate("assignedDepartments", "_id departmentName departmentCode")
      .populate("coordinatingDepartments", "_id departmentName departmentCode")
      .populate({
        path: "bghInCharge",
        select: "_id name email position",
        populate: { path: "position", select: "positionName positionCode" },
      })
      .populate("creator", "name email")
      .populate("history.actor", "name email role");

    return res.status(201).json({
      success: true,
      message: "Đã thêm nhiệm vụ vào kế hoạch quý!",
      data: populatedItem,
    });
  } catch (error) {
    console.error("Lỗi createPlanItem:", error);
    return res.status(500).json({ success: false, message: "Lỗi thêm nhiệm vụ kế hoạch", error: error.message });
  }
};

/**
 * Cập nhật một mục nhiệm vụ (Manager có thể cập nhật tất cả; Đơn vị thực hiện có thể cập nhật ngày hoàn thành thực tế và tiến độ)
 */
const updatePlanItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const item = await QuarterlyPlanItem.findById(itemId);
    if (!item) {
      return res.status(404).json({ success: false, message: "Không tìm thấy nhiệm vụ." });
    }

    const isManager = isManagerOrAdmin(req.user);
    const userDeptId = req.user.department?._id || req.user.department;
    const isAssignedDept = item.assignedDepartments.some((d) => d.toString() === userDeptId?.toString());

    if (!isManager && !isAssignedDept) {
      return res.status(403).json({ success: false, message: "Bạn không có quyền chỉnh sửa nhiệm vụ này." });
    }

    const {
      groupName,
      order,
      taskContent,
      expectedOutcome,
      assignedDepartments,
      coordinatingDepartments,
      bghInCharge,
      startDate,
      expectedDeadline,
      actualCompletedDate,
      progressPercent,
      status,
      pauseReason,
      manualRemark,
      files,
    } = req.body;

    const changes = [];
    const statusMap = {
      NOT_STARTED: "Chưa làm",
      IN_PROGRESS: "Đang thực hiện",
      COMPLETED: "Đã hoàn thành",
      OVERDUE: "Quá hạn",
      PAUSED: "Tạm dừng",
    };

    if (isManager) {
      if (taskContent !== undefined && taskContent !== item.taskContent) {
        changes.push(`Đổi nội dung: "${taskContent}"`);
        item.taskContent = taskContent;
      }
      if (groupName !== undefined && groupName !== item.groupName) {
        changes.push(`Đổi nhóm: "${groupName}"`);
        item.groupName = groupName;
      }
      if (order !== undefined && order !== item.order) {
        item.order = order;
      }
      if (expectedOutcome !== undefined && expectedOutcome !== item.expectedOutcome) {
        changes.push(`Đổi kết quả đầu ra: "${expectedOutcome}"`);
        item.expectedOutcome = expectedOutcome;
      }
      if (assignedDepartments !== undefined) item.assignedDepartments = assignedDepartments;
      if (coordinatingDepartments !== undefined) item.coordinatingDepartments = coordinatingDepartments;
      if (bghInCharge !== undefined) item.bghInCharge = bghInCharge;
      if (startDate !== undefined) item.startDate = startDate;
      if (expectedDeadline !== undefined) item.expectedDeadline = expectedDeadline;
      if (manualRemark !== undefined && manualRemark !== item.manualRemark) {
        changes.push(`Cập nhật ghi chú`);
        item.manualRemark = manualRemark;
      }
    }

    if (status !== undefined && status !== item.status) {
      const oldStatusLabel = statusMap[item.status] || item.status;
      const newStatusLabel = statusMap[status] || status;
      changes.push(`Chuyển trạng thái từ [${oldStatusLabel}] sang [${newStatusLabel}]`);
      item.status = status;
      if (status !== "COMPLETED" && actualCompletedDate === undefined) {
        item.actualCompletedDate = null;
      }
    }

    if (pauseReason !== undefined && pauseReason !== item.pauseReason) {
      if (pauseReason) {
        changes.push(`Lý do tạm dừng: "${pauseReason}"`);
      }
      item.pauseReason = pauseReason;
    }

    if (actualCompletedDate !== undefined) {
      const oldDate = item.actualCompletedDate ? new Date(item.actualCompletedDate).toISOString().slice(0, 10) : "";
      const newDate = actualCompletedDate ? new Date(actualCompletedDate).toISOString().slice(0, 10) : "";
      if (oldDate !== newDate) {
        changes.push(newDate ? `Cập nhật ngày hoàn thành thực tế: ${newDate}` : `Hủy ngày hoàn thành thực tế`);
      }
      item.actualCompletedDate = actualCompletedDate;
      if (!actualCompletedDate && item.status === "COMPLETED") {
        item.status = "IN_PROGRESS";
      }
    }

    if (progressPercent !== undefined && progressPercent !== item.progressPercent) {
      changes.push(`Tiến độ: ${item.progressPercent}% -> ${progressPercent}%`);
      item.progressPercent = progressPercent;
    }

    if (files !== undefined) item.files = files;

    // Ghi nhận lịch sử nếu có thay đổi
    if (changes.length > 0) {
      if (!item.history) item.history = [];
      item.history.push({
        action: status !== undefined && status !== item.status ? "STATUS_CHANGE" : "UPDATE",
        actor: req.user._id,
        actorName: req.user.name || (isManager ? "Quản lý" : "Đơn vị thực hiện"),
        details: changes.join("; "),
        timestamp: new Date(),
      });
    }

    item.calculateAutoRemark();
    await item.save();

    const populatedItem = await QuarterlyPlanItem.findById(item._id)
      .populate("assignedDepartments", "_id departmentName departmentCode")
      .populate("coordinatingDepartments", "_id departmentName departmentCode")
      .populate({
        path: "bghInCharge",
        select: "_id name email position",
        populate: { path: "position", select: "positionName positionCode" },
      })
      .populate("creator", "name email")
      .populate("history.actor", "name email role");

    return res.status(200).json({
      success: true,
      message: "Đã cập nhật nhiệm vụ thành công!",
      data: populatedItem,
    });
  } catch (error) {
    console.error("Lỗi updatePlanItem:", error);
    return res.status(500).json({ success: false, message: "Lỗi cập nhật nhiệm vụ", error: error.message });
  }
};

/**
 * Xóa một mục nhiệm vụ (Chỉ Manager / Admin)
 */
const deletePlanItem = async (req, res) => {
  try {
    if (!isManagerOrAdmin(req.user)) {
      return res.status(403).json({ success: false, message: "Chỉ Quản lý mới có quyền xóa nhiệm vụ." });
    }

    const { itemId } = req.params;
    await QuarterlyPlanItem.findByIdAndDelete(itemId);

    return res.status(200).json({
      success: true,
      message: "Đã xóa nhiệm vụ khỏi kế hoạch quý!",
    });
  } catch (error) {
    console.error("Lỗi deletePlanItem:", error);
    return res.status(500).json({ success: false, message: "Lỗi xóa nhiệm vụ", error: error.message });
  }
};

/**
 * Import danh sách nhiệm vụ từ Excel vào Kế hoạch quý (Chỉ Manager / Admin)
 */
const importPlanItems = async (req, res) => {
  try {
    if (!isManagerOrAdmin(req.user)) {
      return res.status(403).json({ success: false, message: "Chỉ Quản lý mới có quyền import nhiệm vụ." });
    }

    const { planId, items } = req.body;
    if (!planId) {
      return res.status(400).json({ success: false, message: "Thiếu mã kế hoạch quý (planId)." });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "Danh sách nhiệm vụ trống." });
    }

    const plan = await QuarterlyPlan.findById(planId);
    if (!plan) {
      return res.status(404).json({ success: false, message: "Không tìm thấy kế hoạch quý." });
    }

    // Tra cứu danh sách phòng ban và BGH để map tên sang ObjectId
    const allDepts = await Department.find().select("_id departmentName");
    const bghPositions = await Position.find({
      $or: [{ positionCode: { $in: ["HT", "PHT"] } }, { positionName: { $regex: /hiệu trưởng/i } }],
    }).select("_id");
    const allBgh = await User.find({ position: { $in: bghPositions.map((p) => p._id) } }).select("_id name");

    const createdItems = [];

    for (const raw of items) {
      if (!raw.taskContent || !raw.taskContent.trim()) continue;

      // Tìm assignedDepartments
      const assignedIds = [];
      if (raw.assignedDepartmentNames && Array.isArray(raw.assignedDepartmentNames)) {
        for (const name of raw.assignedDepartmentNames) {
          const match = allDepts.find(
            (d) => d.departmentName.trim().toLowerCase() === name.trim().toLowerCase()
          );
          if (match) assignedIds.push(match._id);
        }
      }

      // Tìm coordinatingDepartments
      const coordIds = [];
      if (raw.coordinatingDepartmentNames && Array.isArray(raw.coordinatingDepartmentNames)) {
        for (const name of raw.coordinatingDepartmentNames) {
          const match = allDepts.find(
            (d) => d.departmentName.trim().toLowerCase() === name.trim().toLowerCase()
          );
          if (match) coordIds.push(match._id);
        }
      }

      // Tìm BGH
      const bghIds = [];
      if (raw.bghNames && Array.isArray(raw.bghNames)) {
        for (const name of raw.bghNames) {
          const cleanName = name.replace(/^(ThS\.|TS\.|Thầy|Cô|Hiệu trưởng|Phó Hiệu trưởng|HT|PHT)[:\s]+/i, "").trim().toLowerCase();
          const match = allBgh.find(
            (u) => u.name.trim().toLowerCase().includes(cleanName) || cleanName.includes(u.name.trim().toLowerCase())
          );
          if (match) bghIds.push(match._id);
        }
      }

      const newItem = new QuarterlyPlanItem({
        planId,
        groupName: raw.groupName || "I. CÔNG TÁC CHÍNH TRỊ - TƯ TƯỞNG",
        order: raw.order || (createdItems.length + 1),
        taskContent: raw.taskContent.trim(),
        expectedOutcome: raw.expectedOutcome || "",
        assignedDepartments: assignedIds,
        coordinatingDepartments: coordIds,
        bghInCharge: bghIds,
        startDate: raw.startDate ? new Date(raw.startDate) : null,
        expectedDeadline: raw.expectedDeadline ? new Date(raw.expectedDeadline) : (plan.endDate || new Date()),
        actualCompletedDate: raw.actualCompletedDate ? new Date(raw.actualCompletedDate) : null,
        manualRemark: raw.manualRemark || "",
        creator: req.user._id,
        status: raw.actualCompletedDate ? "COMPLETED" : "NOT_STARTED",
        history: [
          {
            action: "CREATE",
            actor: req.user._id,
            actorName: req.user.name || "Quản trị viên",
            details: `Import từ file Excel: "${raw.taskContent.trim()}"`,
            timestamp: new Date(),
          },
        ],
      });

      newItem.calculateAutoRemark();
      await newItem.save();
      createdItems.push(newItem);
    }

    return res.status(200).json({
      success: true,
      message: `Đã import thành công ${createdItems.length} nhiệm vụ vào kế hoạch!`,
      data: { count: createdItems.length },
    });
  } catch (error) {
    console.error("Lỗi importPlanItems:", error);
    return res.status(500).json({ success: false, message: "Lỗi import danh sách nhiệm vụ", error: error.message });
  }
};

/**
 * Kích hoạt thủ công việc quét và gửi email + chuông thông báo (Dành cho Manager/Admin)
 */
const triggerPlanReminders = async (req, res) => {
  try {
    if (!isManagerOrAdmin(req.user)) {
      return res.status(403).json({ success: false, message: "Bạn không có quyền thực hiện tính năng này." });
    }

    const { executeQuarterlyPlanReminders } = require("../service/quarterlyPlanCron.service");
    const result = await executeQuarterlyPlanReminders();

    return res.status(200).json({
      success: true,
      message: "Đã kích hoạt quét và gửi thông báo Kế hoạch quý thành công!",
      data: result,
    });
  } catch (error) {
    console.error("Lỗi triggerPlanReminders:", error);
    return res.status(500).json({ success: false, message: "Lỗi khi quét thông báo", error: error.message });
  }
};

module.exports = {
  getPlanMetadata,
  getQuarterlyPlans,
  createQuarterlyPlan,
  updateQuarterlyPlan,
  deleteQuarterlyPlan,
  getQuarterlyPlanDetail,
  createPlanItem,
  updatePlanItem,
  deletePlanItem,
  importPlanItems,
  triggerPlanReminders,
};

