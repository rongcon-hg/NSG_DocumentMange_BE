const WorkSchedule = require("../models/workSchedule.model");
const User = require("../models/user.model");
const Department = require("../models/department.model");
const Position = require("../models/position.model");
const Notification = require("../models/notification.model");

/**
 * Helper: Lấy danh sách ID người dùng thuộc Ban Giám Hiệu và Manager/Admin
 */
const getBghAndManagerUserIds = async () => {
  try {
    const bghDepts = await Department.find({
      $or: [
        { departmentCode: "BGH" },
        { departmentName: { $regex: /ban giám hiệu/i } },
      ],
    }).select("_id");
    const bghDeptIds = bghDepts.map((d) => d._id);

    const bghPositions = await Position.find({
      $or: [
        { abbreviation: { $in: ["HT", "PHT", "NHT"] } },
        { code: { $in: ["HT", "PHT", "NHT"] } },
        { positionName: { $regex: /hiệu trưởng/i } },
      ],
    }).select("_id");
    const bghPosIds = bghPositions.map((p) => p._id);

    const users = await User.find({
      $or: [
        { role: { $in: ["admin", "manager"] } },
        { department: { $in: bghDeptIds } },
        { position: { $in: bghPosIds } },
      ],
    }).select("_id");

    return [...new Set(users.map((u) => u._id.toString()))];
  } catch (err) {
    console.warn("Lỗi tìm BGH/Manager users:", err.message);
    const fallback = await User.find({ role: { $in: ["admin", "manager"] } }).select("_id");
    return fallback.map((u) => u._id.toString());
  }
};

/**
 * Helper: Kiểm tra vai trò của người dùng
 */
const checkUserRole = async (user) => {
  if (!user) {
    return {
      isBGH: false,
      isManager: false,
      isCapTruong: false,
      isCapPho: false,
      isGvCv: true,
      canDirectAdd: false,
      canRegister: false,
      canApprove: false,
    };
  }

  const role = user.role;
  let isBGH = false;
  const isManager = ["admin", "manager"].includes(role);

  // Kiểm tra phòng ban BGH
  if (user.department) {
    const dept = await Department.findById(user.department)
      .select("departmentCode departmentName")
      .lean();
    if (
      dept &&
      (dept.departmentCode === "BGH" ||
        (dept.departmentName &&
          dept.departmentName.toLowerCase().includes("ban giám hiệu")))
    ) {
      isBGH = true;
    }
  }

  // Kiểm tra chức vụ Ban Giám Hiệu
  if (!isBGH && user.position) {
    const pos = await Position.findById(user.position)
      .select("positionName abbreviation code")
      .lean();
    if (pos) {
      const pName = (pos.positionName || "").toLowerCase();
      const pCode = (pos.abbreviation || pos.code || "").toUpperCase();
      if (
        ["HT", "PHT", "NHT"].includes(pCode) ||
        pName.includes("hiệu trưởng") ||
        pName.includes("phó hiệu trưởng")
      ) {
        isBGH = true;
      }
    }
  }

  const posName = (user.position?.positionName || "").toLowerCase();
  const isCapTruong =
    !isBGH &&
    !isManager &&
    (role === "captruong" || role === "staff" || posName.includes("trưởng"));
  const isCapPho =
    !isBGH && !isManager && !isCapTruong && (role === "cappho" || posName.includes("phó"));
  const isGvCv = !isBGH && !isManager && !isCapTruong && !isCapPho;

  return {
    isBGH,
    isManager,
    isCapTruong,
    isCapPho,
    isGvCv,
    canDirectAdd: isBGH || isManager,
    canRegister: isBGH || isManager || isCapTruong || isCapPho,
    canApprove: isBGH || isManager,
  };
};

/**
 * Helper: Lấy thời điểm bắt đầu ngày hôm nay (theo múi giờ Việt Nam UTC+7)
 */
const getVietnamStartOfToday = () => {
  const now = new Date();
  const vnDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now); // e.g. "2026-09-19"

  return new Date(`${vnDateStr}T00:00:00+07:00`);
};

/**
 * [GET] /api/work-schedules
 * Lấy danh sách lịch công tác theo tab và bộ lọc
 */
exports.getWorkSchedules = async (req, res) => {
  try {
    const currentUser = req.user;
    const roleInfo = await checkUserRole(currentUser);

    const {
      tab = "upcoming", // 'upcoming' (mặc định), 'past', 'pending', 'all'
      keyword = "",
      startDate,
      endDate,
      status,
    } = req.query;

    const startOfToday = getVietnamStartOfToday();
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000 - 1);

    const filter = {};

    // 1. Phân quyền dữ liệu theo vai trò & Tab
    if (tab === "pending") {
      if (!roleInfo.canApprove) {
        return res.status(200).json({
          success: true,
          data: [],
          userRoleInfo: roleInfo,
          meta: { today: startOfToday.toISOString(), total: 0 },
        });
      }
      if (status && status !== "ALL") {
        filter.status = status;
      } else {
        // Mặc định hoặc ALL: xem toàn bộ các lịch chưa duyệt, đã duyệt và từ chối
        delete filter.status;
      }
    } else if (tab === "my_registered") {
      // Tab lịch tôi đã đăng ký: xem toàn bộ trạng thái lịch của chính mình
      filter.createdBy = currentUser._id;
      if (status && status !== "ALL") {
        filter.status = status;
      } else {
        delete filter.status;
      }
    } else {
      // Tab xem chung ("upcoming", "past") hoặc in/xuất:
      // Yêu cầu: Những lịch nào đang gửi duyệt mà chưa được duyệt thì KHÔNG hiển thị, khi nào được duyệt mới hiển thị
      filter.status = "APPROVED";
      if (tab === "upcoming") {
        filter.endDate = { $gte: startOfToday };
      } else if (tab === "past") {
        filter.endDate = { $lt: startOfToday };
      }
    }

    // 3. Lọc theo khoảng ngày người dùng chọn (nếu có)
    if (startDate || endDate) {
      if (startDate && endDate) {
        // Sự kiện giao thoa với khoảng [startDate, endDate]:
        // startDate <= target_endDate VÀ endDate >= target_startDate
        filter.startDate = { $lte: new Date(`${endDate}T23:59:59+07:00`) };
        filter.endDate = { $gte: new Date(`${startDate}T00:00:00+07:00`) };
      } else if (startDate) {
        filter.endDate = { $gte: new Date(`${startDate}T00:00:00+07:00`) };
      } else if (endDate) {
        filter.startDate = { $lte: new Date(`${endDate}T23:59:59+07:00`) };
      }
    }

    // 4. Tìm kiếm từ khóa
    if (keyword && keyword.trim()) {
      const reg = new RegExp(keyword.trim(), "i");
      const searchConditions = [
        { content: reg },
        { participants: reg },
        { location: reg },
        { notes: reg },
        { host: reg },
      ];
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchConditions }];
        delete filter.$or;
      } else {
        filter.$or = searchConditions;
      }
    }

    // 5. Xác định thứ tự sắp xếp
    // Với tab 'upcoming': sắp xếp startDate tăng dần, startTime tăng dần (ngày hiện tại sẽ lên trên cùng)
    // Với tab 'past': sắp xếp startDate giảm dần, startTime giảm dần
    // Với tab 'my_registered' hoặc 'pending': sắp xếp mới nhất lên trước
    let sortOption = { startDate: 1, startTime: 1 };
    if (tab === "past") {
      sortOption = { startDate: -1, startTime: -1 };
    } else if (tab === "my_registered" || tab === "pending") {
      sortOption = { createdAt: -1, startDate: -1 };
    }

    const schedules = await WorkSchedule.find(filter)
      .populate("createdBy", "name email avatar")
      .populate("department", "departmentName departmentCode")
      .populate("approvedBy", "name email")
      .populate("targetApprover", "name email avatar")
      .sort(sortOption)
      .lean();

    return res.status(200).json({
      success: true,
      data: schedules,
      userRoleInfo: roleInfo,
      meta: {
        today: startOfToday.toISOString(),
        total: schedules.length,
      },
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách lịch công tác:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống khi tải lịch công tác",
      error: error.message,
    });
  }
};

/**
 * [GET] /api/work-schedules/pending-count
 * Đếm số lượng lịch chờ duyệt
 */
exports.getPendingCount = async (req, res) => {
  try {
    const currentUser = req.user;
    const roleInfo = await checkUserRole(currentUser);

    let count = 0;
    if (roleInfo.isBGH || roleInfo.isManager) {
      count = await WorkSchedule.countDocuments({ status: "PENDING" });
    }

    return res.status(200).json({
      success: true,
      data: { count },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy số lượng lịch chờ duyệt",
      error: error.message,
    });
  }
};

/**
 * [GET] /api/work-schedules/bgh-list
 * Lấy danh sách thành viên Ban Giám Hiệu để cấp trưởng chọn người duyệt
 */
exports.getBghUsers = async (req, res) => {
  try {
    const bghDepts = await Department.find({
      $or: [
        { departmentCode: "BGH" },
        { departmentName: { $regex: /ban giám hiệu/i } },
      ],
    }).select("_id");
    const bghDeptIds = bghDepts.map((d) => d._id);

    const bghPositions = await Position.find({
      $or: [
        { abbreviation: { $in: ["HT", "PHT", "NHT"] } },
        { code: { $in: ["HT", "PHT", "NHT"] } },
        { positionName: { $regex: /hiệu trưởng/i } },
      ],
    }).select("_id");
    const bghPosIds = bghPositions.map((p) => p._id);

    // CHỈ lấy người dùng thuộc phòng ban BGH hoặc có chức vụ Hiệu trưởng / Phó hiệu trưởng
    const users = await User.find({
      $or: [
        { department: { $in: bghDeptIds } },
        { position: { $in: bghPosIds } },
      ],
      isActive: { $ne: false },
    })
      .select("name email avatar position department role")
      .populate("position", "positionName abbreviation code")
      .populate("department", "departmentName departmentCode")
      .lean();

    // Lọc lại nghiêm ngặt để đảm bảo 100% thuộc Ban Giám Hiệu
    const filteredUsers = users.filter((u) => {
      const dCode = (u.department?.departmentCode || "").toUpperCase();
      const dName = (u.department?.departmentName || "").toLowerCase();
      const pName = (u.position?.positionName || "").toLowerCase();
      const pCode = (u.position?.abbreviation || u.position?.code || "").toUpperCase();

      return (
        dCode === "BGH" ||
        dName.includes("ban giám hiệu") ||
        ["HT", "PHT", "NHT"].includes(pCode) ||
        pName.includes("hiệu trưởng") ||
        pName.includes("phó hiệu trưởng")
      );
    });

    // Sắp xếp: Hiệu trưởng lên đầu, sau đó đến Phó hiệu trưởng
    filteredUsers.sort((a, b) => {
      const aPos = (a.position?.positionName || "").toLowerCase();
      const bPos = (b.position?.positionName || "").toLowerCase();
      const aIsHT = aPos.includes("hiệu trưởng") && !aPos.includes("phó");
      const bIsHT = bPos.includes("hiệu trưởng") && !bPos.includes("phó");
      if (aIsHT && !bIsHT) return -1;
      if (!aIsHT && bIsHT) return 1;
      return (a.name || "").localeCompare(b.name || "", "vi");
    });

    return res.status(200).json({
      success: true,
      data: filteredUsers,
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách BGH:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống khi lấy danh sách Ban Giám Hiệu",
      error: error.message,
    });
  }
};

/**
 * [POST] /api/work-schedules
 * Thêm hoặc Đăng ký lịch công tác
 */
exports.createWorkSchedule = async (req, res) => {
  try {
    const currentUser = req.user;
    const roleInfo = await checkUserRole(currentUser);

    // Kiểm tra quyền
    if (!roleInfo.canRegister) {
      return res.status(403).json({
        success: false,
        message:
          "Bạn không có quyền đăng ký lịch công tác. Tính năng chỉ dành cho Ban Giám Hiệu, Manager và Cấp trưởng.",
      });
    }

    const {
      startDate,
      endDate,
      startTime = "",
      endTime = "",
      content,
      participants = "",
      location = "",
      notes = "",
      host = "",
      department,
      targetApprover,
      attachments = [],
    } = req.body;

    if (!startDate || !content) {
      return res.status(400).json({
        success: false,
        message: "Ngày bắt đầu và Nội dung công tác là bắt buộc.",
      });
    }

    // Nếu là BGH / Manager: Tự động APPROVED
    // Nếu là Cấp trưởng: Trạng thái PENDING
    const isDirectAdd = roleInfo.canDirectAdd;
    const scheduleStatus = isDirectAdd ? "APPROVED" : "PENDING";

    const newSchedule = new WorkSchedule({
      startDate: new Date(`${startDate}T00:00:00+07:00`),
      endDate: endDate
        ? new Date(`${endDate}T23:59:59+07:00`)
        : new Date(`${startDate}T23:59:59+07:00`),
      startTime: startTime.trim(),
      endTime: endTime.trim(),
      content: content.trim(),
      participants: participants.trim(),
      location: location.trim(),
      notes: notes.trim(),
      host: host.trim(),
      department: department || currentUser.department,
      targetApprover: targetApprover || null,
      createdBy: currentUser._id,
      status: scheduleStatus,
      approvedBy: isDirectAdd ? currentUser._id : null,
      approvedAt: isDirectAdd ? new Date() : null,
      attachments,
    });

    await newSchedule.save();

    // Nếu là Cấp trưởng đăng ký: Gửi thông báo đến BGH và Manager
    if (!isDirectAdd) {
      try {
        const bghAndMgrIds = await getBghAndManagerUserIds();
        const allRecipientIds = [...new Set([...bghAndMgrIds, targetApprover].filter(Boolean))];

        const notifyPromises = allRecipientIds
          .filter((id) => id !== currentUser._id.toString())
          .map((recipientId) => {
            const isSpecific = targetApprover && recipientId === targetApprover.toString();
            return Notification.create({
              recipient: recipientId,
              sender: currentUser._id,
              type: "GENERAL",
              title: isSpecific
                ? "Lịch công tác gửi Thầy/Cô Ban Giám Hiệu phê duyệt"
                : "Lịch công tác mới chờ Ban Giám Hiệu phê duyệt",
              message: `${currentUser.name} vừa đăng ký lịch công tác: "${content.substring(
                0,
                70
              )}..."`,
              link: "/work-schedule?tab=pending",
              isRead: false,
              isPopupShown: false,
            });
          });
        await Promise.allSettled(notifyPromises);
      } catch (notifyErr) {
        console.warn("Không thể gửi thông báo duyệt lịch:", notifyErr.message);
      }
    }

    const populated = await WorkSchedule.findById(newSchedule._id)
      .populate("createdBy", "name email avatar")
      .populate("department", "departmentName departmentCode")
      .populate("approvedBy", "name email")
      .populate("targetApprover", "name email avatar");

    return res.status(201).json({
      success: true,
      message: isDirectAdd
        ? "Đã thêm lịch công tác thành công."
        : "Đã gửi đăng ký lịch công tác cho Ban Giám Hiệu duyệt.",
      data: populated,
    });
  } catch (error) {
    console.error("Lỗi khi tạo lịch công tác:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống khi tạo lịch công tác",
      error: error.message,
    });
  }
};

/**
 * [PUT] /api/work-schedules/:id
 * Chỉnh sửa lịch công tác
 */
exports.updateWorkSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;
    const roleInfo = await checkUserRole(currentUser);

    const schedule = await WorkSchedule.findById(id);
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lịch công tác.",
      });
    }

    // Kiểm tra quyền sửa: Lịch đã duyệt CHỈ Ban Giám Hiệu mới được sửa
    const isOwner = schedule.createdBy.toString() === currentUser._id.toString();
    const canEdit =
      roleInfo.isBGH ||
      (isOwner && schedule.status !== "APPROVED");

    if (!canEdit) {
      return res.status(403).json({
        success: false,
        message:
          "Bạn không có quyền chỉnh sửa lịch này. Lịch đã được duyệt chỉ Ban Giám Hiệu mới có thể điều chỉnh.",
      });
    }

    const {
      startDate,
      endDate,
      startTime,
      endTime,
      content,
      participants,
      location,
      notes,
      host,
      department,
      targetApprover,
      attachments,
    } = req.body;

    if (startDate) schedule.startDate = new Date(`${startDate}T00:00:00+07:00`);
    if (endDate) schedule.endDate = new Date(`${endDate}T23:59:59+07:00`);
    if (startTime !== undefined) schedule.startTime = startTime.trim();
    if (endTime !== undefined) schedule.endTime = endTime.trim();
    if (content !== undefined) schedule.content = content.trim();
    if (participants !== undefined) schedule.participants = participants.trim();
    if (location !== undefined) schedule.location = location.trim();
    if (notes !== undefined) schedule.notes = notes.trim();
    if (host !== undefined) schedule.host = host.trim();
    if (department !== undefined) schedule.department = department;
    if (targetApprover !== undefined) schedule.targetApprover = targetApprover || null;
    if (attachments !== undefined) schedule.attachments = attachments;

    let isResubmitted = false;
    // Nếu Cấp trưởng sửa lịch bị từ chối trước đó -> Đưa về PENDING để duyệt lại
    if (roleInfo.isCapTruong && schedule.status === "REJECTED") {
      schedule.status = "PENDING";
      schedule.rejectionReason = "";
      isResubmitted = true;
    }

    await schedule.save();

    // Nếu gửi duyệt lại: Bắn thông báo cho BGH & Manager
    if (isResubmitted) {
      try {
        const bghAndMgrIds = await getBghAndManagerUserIds();
        const allRecipientIds = [...new Set([...bghAndMgrIds, schedule.targetApprover].filter(Boolean))];
        const notifyPromises = allRecipientIds
          .filter((id) => id !== currentUser._id.toString())
          .map((recipientId) => {
            const isSpecific = schedule.targetApprover && recipientId === schedule.targetApprover.toString();
            return Notification.create({
              recipient: recipientId,
              sender: currentUser._id,
              type: "GENERAL",
              title: isSpecific
                ? "Lịch công tác đã cập nhật - gửi Thầy/Cô duyệt lại"
                : "Lịch công tác đã cập nhật - chờ Ban Giám Hiệu duyệt lại",
              message: `${currentUser.name} đã cập nhật lịch công tác: "${schedule.content.substring(
                0,
                70
              )}..." và gửi lại chờ phê duyệt.`,
              link: "/work-schedule?tab=pending",
              isRead: false,
              isPopupShown: false,
            });
          });
        await Promise.allSettled(notifyPromises);
      } catch (notifyErr) {
        console.warn("Không thể gửi thông báo duyệt lại:", notifyErr.message);
      }
    }

    const populated = await WorkSchedule.findById(schedule._id)
      .populate("createdBy", "name email avatar")
      .populate("department", "departmentName departmentCode")
      .populate("approvedBy", "name email")
      .populate("targetApprover", "name email avatar");

    return res.status(200).json({
      success: true,
      message: isResubmitted
        ? "Đã cập nhật và gửi lại lịch công tác cho Ban Giám Hiệu duyệt."
        : "Cập nhật lịch công tác thành công.",
      data: populated,
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật lịch công tác:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống khi cập nhật lịch",
      error: error.message,
    });
  }
};

/**
 * [DELETE] /api/work-schedules/:id
 * Xóa lịch công tác
 */
exports.deleteWorkSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;
    const roleInfo = await checkUserRole(currentUser);

    const schedule = await WorkSchedule.findById(id);
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lịch công tác.",
      });
    }

    // Kiểm tra quyền xóa: Lịch đã duyệt CHỈ Ban Giám Hiệu mới được xóa
    const isOwner = schedule.createdBy.toString() === currentUser._id.toString();
    const canDelete =
      roleInfo.isBGH ||
      (isOwner && schedule.status !== "APPROVED");

    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message:
          "Bạn không có quyền xóa lịch này. Lịch đã được duyệt chỉ Ban Giám Hiệu mới có thể xóa.",
      });
    }

    await WorkSchedule.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "Đã xóa lịch công tác thành công.",
    });
  } catch (error) {
    console.error("Lỗi khi xóa lịch công tác:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống khi xóa lịch",
      error: error.message,
    });
  }
};

/**
 * [PATCH] /api/work-schedules/:id/approve
 * Ban Giám Hiệu / Manager phê duyệt lịch công tác
 */
exports.approveWorkSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;
    const roleInfo = await checkUserRole(currentUser);

    if (!roleInfo.canApprove) {
      return res.status(403).json({
        success: false,
        message: "Chỉ Ban Giám Hiệu và Manager mới có quyền phê duyệt lịch công tác.",
      });
    }

    const schedule = await WorkSchedule.findById(id);
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lịch công tác.",
      });
    }

    schedule.status = "APPROVED";
    schedule.approvedBy = currentUser._id;
    schedule.approvedAt = new Date();
    schedule.rejectionReason = "";

    await schedule.save();

    // Gửi thông báo đến người đăng ký
    if (schedule.createdBy && schedule.createdBy.toString() !== currentUser._id.toString()) {
      try {
        await Notification.create({
          recipient: schedule.createdBy,
          sender: currentUser._id,
          type: "GENERAL",
          title: "Lịch công tác đã được duyệt",
          message: `Lịch công tác "${schedule.content.substring(
            0,
            60
          )}..." đã được Ban Giám Hiệu phê duyệt.`,
          link: "/work-schedule",
          isRead: false,
          isPopupShown: false,
        });
      } catch (err) {
        console.warn("Lỗi gửi thông báo phê duyệt:", err.message);
      }
    }

    const populated = await WorkSchedule.findById(schedule._id)
      .populate("createdBy", "name email avatar")
      .populate("department", "departmentName departmentCode")
      .populate("approvedBy", "name email")
      .populate("targetApprover", "name email avatar");

    return res.status(200).json({
      success: true,
      message: "Đã phê duyệt lịch công tác thành công.",
      data: populated,
    });
  } catch (error) {
    console.error("Lỗi khi duyệt lịch công tác:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống khi phê duyệt lịch",
      error: error.message,
    });
  }
};

/**
 * [PATCH] /api/work-schedules/:id/reject
 * Ban Giám Hiệu / Manager từ chối lịch công tác
 */
exports.rejectWorkSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = "Ban Giám Hiệu chưa phê duyệt lịch này." } = req.body;
    const currentUser = req.user;
    const roleInfo = await checkUserRole(currentUser);

    if (!roleInfo.canApprove) {
      return res.status(403).json({
        success: false,
        message: "Chỉ Ban Giám Hiệu và Manager mới có quyền từ chối lịch công tác.",
      });
    }

    const schedule = await WorkSchedule.findById(id);
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lịch công tác.",
      });
    }

    schedule.status = "REJECTED";
    schedule.approvedBy = currentUser._id;
    schedule.approvedAt = new Date();
    schedule.rejectionReason = reason.trim();

    await schedule.save();

    // Gửi thông báo đến người đăng ký
    if (schedule.createdBy && schedule.createdBy.toString() !== currentUser._id.toString()) {
      try {
        await Notification.create({
          recipient: schedule.createdBy,
          sender: currentUser._id,
          type: "GENERAL",
          title: "Lịch công tác chưa được duyệt",
          message: `Lịch công tác "${schedule.content.substring(
            0,
            50
          )}..." đã bị từ chối. Lý do: ${reason}`,
          link: "/work-schedule?tab=pending",
          isRead: false,
          isPopupShown: false,
        });
      } catch (err) {
        console.warn("Lỗi gửi thông báo từ chối:", err.message);
      }
    }

    const populated = await WorkSchedule.findById(schedule._id)
      .populate("createdBy", "name email avatar")
      .populate("department", "departmentName departmentCode")
      .populate("approvedBy", "name email")
      .populate("targetApprover", "name email avatar");

    return res.status(200).json({
      success: true,
      message: "Đã từ chối lịch công tác.",
      data: populated,
    });
  } catch (error) {
    console.error("Lỗi khi từ chối lịch công tác:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống khi từ chối lịch",
      error: error.message,
    });
  }
};
