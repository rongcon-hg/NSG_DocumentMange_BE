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
    // 1. Lấy toàn bộ đơn vị (Khoa/Phòng/Trung tâm)
    const departments = await Department.find({ isDeleted: false })
      .select("_id departmentName departmentCode")
      .sort({ departmentName: 1 });

    // 2. Lấy danh sách người dùng thuộc Ban Giám hiệu (Hiệu trưởng, Phó Hiệu trưởng)
    const bghPositions = await Position.find({
      $or: [
        { positionCode: { $in: ["HT", "PHT"] } },
        { positionName: { $regex: /hiệu trưởng/i } },
      ],
    }).select("_id");

    const bghPosIds = bghPositions.map((p) => p._id);
    const bghUsers = await User.find({
      $or: [
        { position: { $in: bghPosIds } },
        { role: "manager" },
      ],
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
    } = req.body;

    if (!planId || !groupName || !taskContent || !expectedDeadline) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập nhóm nhiệm vụ, nội dung công việc và thời gian dự kiến hoàn thành.",
      });
    }

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
      creator: req.user._id,
      status: "NOT_STARTED",
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
      });

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
      manualRemark,
    } = req.body;

    if (isManager) {
      // Manager có quyền sửa tất cả các trường
      if (groupName !== undefined) item.groupName = groupName;
      if (order !== undefined) item.order = order;
      if (taskContent !== undefined) item.taskContent = taskContent;
      if (expectedOutcome !== undefined) item.expectedOutcome = expectedOutcome;
      if (assignedDepartments !== undefined) item.assignedDepartments = assignedDepartments;
      if (coordinatingDepartments !== undefined) item.coordinatingDepartments = coordinatingDepartments;
      if (bghInCharge !== undefined) item.bghInCharge = bghInCharge;
      if (startDate !== undefined) item.startDate = startDate;
      if (expectedDeadline !== undefined) item.expectedDeadline = expectedDeadline;
      if (manualRemark !== undefined) item.manualRemark = manualRemark;
    }

    // Cả Manager và Đơn vị thực hiện đều có thể cập nhật ngày hoàn thành thực tế và tiến độ
    if (actualCompletedDate !== undefined) item.actualCompletedDate = actualCompletedDate;
    if (progressPercent !== undefined) item.progressPercent = progressPercent;
    if (status !== undefined) item.status = status;

    item.calculateAutoRemark();
    await item.save();

    const populatedItem = await QuarterlyPlanItem.findById(item._id)
      .populate("assignedDepartments", "_id departmentName departmentCode")
      .populate("coordinatingDepartments", "_id departmentName departmentCode")
      .populate({
        path: "bghInCharge",
        select: "_id name email position",
        populate: { path: "position", select: "positionName positionCode" },
      });

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
};
