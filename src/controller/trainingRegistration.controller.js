const TrainingRegistration = require("../models/trainingRegistration.model");
const User = require("../models/user.model");
const Department = require("../models/department.model");
const Position = require("../models/position.model");
const Notification = require("../models/notification.model");
const DriveConfig = require("../models/driveConfig.model");
const { google } = require("googleapis");
const { Readable } = require("stream");
const ExcelJS = require("exceljs");
const {
  sendTrainingRegistrationEmail,
  sendTrainingStatusEmail,
} = require("../service/NodeMailer.service/email");

// === Helper: Google Drive Authorization ===
async function authorizeDrive() {
  const config = await DriveConfig.findOne();
  if (!config || !config.clientEmail || !config.privateKey) {
    throw new Error("Chưa cấu hình Service Account cho Google Drive.");
  }
  const auth = new google.auth.JWT({
    email: config.clientEmail,
    key: config.privateKey.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return auth;
}

// === Helper: Get or Create Training Proof Folder in Google Drive ===
async function getOrCreateTrainingFolder(drive) {
  let parentId = process.env.DRIVE_FOLDER_ID;
  const config = await DriveConfig.findOne();
  if (config && config.folderId) parentId = config.folderId;

  try {
    const res = await drive.files.list({
      q: `'${parentId}' in parents and name = 'HocTap_BoiDuong' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id, name)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    if (res.data.files && res.data.files.length > 0) {
      return res.data.files[0].id;
    }

    const folderMetadata = {
      name: "HocTap_BoiDuong",
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    };

    const createResponse = await drive.files.create({
      requestBody: folderMetadata,
      fields: "id",
      supportsAllDrives: true,
    });

    return createResponse.data.id;
  } catch (err) {
    console.error("Lỗi getOrCreateTrainingFolder:", err);
    return parentId;
  }
}

// === Helper: Check Special Privileged User (Mai Anh Thy) ===
const isUserMaiAnhThy = (user) => {
  if (!user) return false;
  const name = (user.name || "").trim().toLowerCase();
  const normalizedName = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
  if (normalizedName === "mai anh thy" || normalizedName.includes("mai anh thy")) return true;

  const username = (user.username || "").trim().toLowerCase();
  if (username === "maianhthy" || username.includes("maianhthy") || username === "thymaianh") return true;

  const email = (user.email || "").trim().toLowerCase();
  if (email.includes("maianhthy") || email.startsWith("thy") || email.includes("thiy")) return true;

  return false;
};

// === Helper: Check User Role BGH ===
const isUserBGH = (user) => {
  if (!user) return false;
  if (user.department?.departmentCode === "BGH") return true;
  if (user.departmentName?.toUpperCase().includes("BAN GIÁM HIỆU")) return true;
  const posName = user.position?.positionName?.toLowerCase() || "";
  if (posName.includes("hiệu trưởng") || posName.includes("phó hiệu trưởng")) return true;
  return false;
};

// === Helper: Get Detailed User Role & Department Info ===
const getUserRoleInfo = (user) => {
  if (!user) return {};
  const isBGH = isUserBGH(user);
  const isAdminOrManager = ["admin", "manager"].includes(user?.role);
  const isMaiAnhThy = isUserMaiAnhThy(user);
  const posName = (user?.position?.positionName || "").toLowerCase();
  const isCapTruong =
    !isMaiAnhThy &&
    !isBGH &&
    !isAdminOrManager &&
    (user?.role === "staff" || user?.role === "captruong" || posName.includes("trưởng"));
  const isCapPho =
    !isMaiAnhThy &&
    !isBGH &&
    !isAdminOrManager &&
    !isCapTruong &&
    (user?.role === "cappho" || posName.includes("phó"));
  const isChuyenVien = !isMaiAnhThy && !isBGH && !isAdminOrManager && !isCapTruong && !isCapPho;
  const userDeptId = user?.department?._id || user?.department;
  const userDeptName = user?.department?.departmentName || user?.departmentName || "";
  return { isBGH, isAdminOrManager, isMaiAnhThy, isCapTruong, isCapPho, isChuyenVien, userDeptId, userDeptName };
};

// === Helper: Lấy danh sách Manager, Admin và tài khoản đặc quyền Mai Anh Thy ===
const getManagerAndThyUsers = async () => {
  try {
    const users = await User.find({
      $or: [
        { role: { $in: ["admin", "manager"] } },
        { name: /Mai Anh Thy/i },
        { username: /maianhthy/i },
      ],
    }).select("_id name email emailNotifications role");
    return users;
  } catch (err) {
    console.error("Lỗi getManagerAndThyUsers:", err);
    return [];
  }
};

/**
 * 1. TẠO MỚI HỒ SƠ ĐĂNG KÝ BỒI DƯỠNG (Hỗ trợ 1 hoặc nhiều người)
 */
const createRegistrations = async (req, res) => {
  try {
    const creatorId = req.user._id;
    const payload = req.body;

    const items = Array.isArray(payload.items) ? payload.items : [payload];
    if (items.length === 0) {
      return res.status(400).json({ success: false, message: "Danh sách đăng ký trống." });
    }

    const creatorUser = await User.findById(creatorId)
      .populate("department")
      .populate("position");
    const { isBGH, isAdminOrManager, isCapTruong, isCapPho, isChuyenVien, userDeptId, userDeptName } =
      getUserRoleInfo(creatorUser);
    const creatorName = creatorUser?.name || req.user.name || "Người lập";

    const createdRecords = [];

    for (const item of items) {
      let targetUser = null;
      let finalUserName = "";
      let finalDeptId = null;
      let finalDeptName = "";
      let finalPositionId = null;
      let finalPositionName = "Cán bộ";

      if (isChuyenVien) {
        // Chuyên viên: CHỈ ĐƯỢC ĐĂNG KÝ CHO CÁ NHÂN MÌNH
        targetUser = creatorUser;
        finalUserName = creatorUser.name;
        finalDeptId = userDeptId;
        finalDeptName = userDeptName;
        finalPositionId = creatorUser.position?._id || null;
        finalPositionName = creatorUser.position?.positionName || "Chuyên viên";
      } else if (isCapTruong || isCapPho) {
        // Cấp trưởng & Cấp phó: Đăng ký cho các thành viên trong đơn vị mình (hoặc người chưa có TK)
        finalDeptId = userDeptId;
        finalDeptName = userDeptName;
        const targetUserId = item.userId || item.user;

        if (targetUserId) {
          targetUser = await User.findById(targetUserId)
            .populate("department")
            .populate("position");

          if (targetUser) {
            const tDeptId = targetUser.department?._id || targetUser.department;
            if (tDeptId && userDeptId && tDeptId.toString() !== userDeptId.toString()) {
              return res.status(403).json({
                success: false,
                message: `Cấp trưởng/phó chỉ được đăng ký cho nhân sự thuộc đơn vị mình. Nhân sự "${targetUser.name}" thuộc đơn vị khác.`,
              });
            }
            finalUserName = targetUser.name;
            finalPositionId = targetUser.position?._id || null;
            finalPositionName = targetUser.position?.positionName || item.positionName || "Cán bộ";
          }
        } else {
          // Chưa có tài khoản hệ thống (nhập tay)
          finalUserName = (item.userName || "").trim();
          finalPositionName = item.positionName || "Cán bộ";
        }
      } else {
        // Manager / Admin / BGH: Được đăng ký cho bất kỳ ai và tất cả các đơn vị
        const targetUserId = item.userId || item.user;
        if (targetUserId) {
          targetUser = await User.findById(targetUserId)
            .populate("department")
            .populate("position");
        }
        finalUserName = targetUser ? targetUser.name : (item.userName || "").trim();
        finalDeptId = item.department || targetUser?.department?._id || null;
        finalDeptName = item.departmentName || targetUser?.department?.departmentName || "";

        if (finalDeptId && !finalDeptName) {
          const dObj = await Department.findById(finalDeptId).lean();
          if (dObj) finalDeptName = dObj.departmentName;
        } else if (!finalDeptId && finalDeptName) {
          const dObj = await Department.findOne({
            departmentName: { $regex: new RegExp(`^${finalDeptName.trim()}$`, "i") },
          }).lean();
          if (dObj) finalDeptId = dObj._id;
        }

        finalPositionId = targetUser?.position?._id || item.position || null;
        finalPositionName = targetUser?.position?.positionName || item.positionName || "Cán bộ";
      }

      if (!finalUserName) {
        continue;
      }

      const newReg = new TrainingRegistration({
        user: targetUser ? targetUser._id : null,
        userName: finalUserName,
        department: finalDeptId,
        departmentName: finalDeptName,
        position: finalPositionId,
        positionName: finalPositionName,
        year: item.year || new Date().getFullYear().toString(),
        trainingContent: item.trainingContent || "",
        estimatedCost: Number(item.estimatedCost) || 0,
        trainingLocation: item.trainingLocation || "",
        startDate: item.startDate ? new Date(item.startDate) : null,
        endDate: item.endDate ? new Date(item.endDate) : null,
        trainingDuration: item.trainingDuration || "",
        trainingForm: item.trainingForm || "Chứng chỉ",
        createdByUser: creatorId,
        createdByUserName: creatorName,
        notes: item.notes || "",
        status: "PENDING",
        history: [
          {
            action: "Lập hồ sơ đăng ký",
            actor: creatorId,
            actorName: creatorName,
            actorRole: req.user.role,
            details: `Đăng ký khóa bồi dưỡng "${item.trainingContent}" cho nhân sự ${finalUserName}${!targetUser ? " (Chưa có tài khoản hệ thống)" : ""}`,
            timestamp: new Date(),
          },
        ],
      });

      const saved = await newReg.save();
      createdRecords.push(saved);
    }

    // Gửi thông báo chuông và email thông báo (bất đồng bộ, không chặn response)
    (async () => {
      try {
        const managersAndThy = await getManagerAndThyUsers();

        // 1. Chuông thông báo
        const notifs = [];
        // Gửi cho Manager/Admin/Mai Anh Thy
        managersAndThy.forEach((m) => {
          if (m._id.toString() !== creatorId.toString()) {
            notifs.push({
              recipient: m._id,
              sender: creatorId,
              type: "GENERAL",
              title: "Đăng ký học tập bồi dưỡng mới",
              message: `${creatorName} vừa gửi ${createdRecords.length} hồ sơ đăng ký bồi dưỡng cần xét duyệt.`,
              link: "/training/list?status=PENDING",
              isRead: false,
              isPopupShown: false,
            });
          }
        });

        // Gửi chuông cho người được đăng ký (nếu được đăng ký hộ)
        createdRecords.forEach((r) => {
          if (r.user && r.user.toString() !== creatorId.toString()) {
            notifs.push({
              recipient: r.user,
              sender: creatorId,
              type: "GENERAL",
              title: "Đăng ký kế hoạch bồi dưỡng",
              message: `Bạn đã được ${creatorName} đăng ký tham gia khóa bồi dưỡng "${r.trainingContent}" (${r.year}).`,
              link: "/training/list",
              isRead: false,
              isPopupShown: false,
            });
          }
        });

        if (notifs.length > 0) {
          await Notification.insertMany(notifs);
        }

        // 2. Email thông báo
        const recipientMap = new Map();
        managersAndThy.forEach((m) => {
          if (m.email) recipientMap.set(m._id.toString(), m);
        });
        if (creatorUser && creatorUser.email) {
          recipientMap.set(creatorUser._id.toString(), creatorUser);
        }

        // Thêm nhân sự được đăng ký nếu có tài khoản email
        const targetUserIds = createdRecords.map((r) => r.user).filter((id) => !!id);
        if (targetUserIds.length > 0) {
          const registeredUsers = await User.find({ _id: { $in: targetUserIds } }).select(
            "_id name email emailNotifications role"
          );
          registeredUsers.forEach((u) => {
            if (u.email) recipientMap.set(u._id.toString(), u);
          });
        }

        await sendTrainingRegistrationEmail(
          Array.from(recipientMap.values()),
          createdRecords,
          creatorName
        );
      } catch (notifyErr) {
        console.error("Lỗi gửi thông báo / email đăng ký bồi dưỡng:", notifyErr);
      }
    })();

    res.status(201).json({
      success: true,
      message: `Đã đăng ký thành công ${createdRecords.length} hồ sơ bồi dưỡng.`,
      data: createdRecords,
    });
  } catch (error) {
    console.error("Lỗi createRegistrations:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

/**
 * 2. LẤY DANH SÁCH ĐĂNG KÝ BỒI DƯỠNG (KÈM BỘ LỌC VÀ PHÂN QUYỀN)
 */
const getRegistrations = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user._id)
      .populate("department")
      .populate("position");

    const { isBGH, isAdminOrManager, isMaiAnhThy, isCapTruong, isCapPho, isChuyenVien, userDeptId } =
      getUserRoleInfo(currentUser);
    const isAdminOrManagerOrBGH = isAdminOrManager || isBGH || isMaiAnhThy;

    const {
      year,
      department,
      status,
      trainingForm,
      reportStatus,
      attended,
      search,
      page = 1,
      limit = 20,
      fetchAll = "false",
    } = req.query;

    const query = {};

    // 1. Phân quyền xem dữ liệu
    if (isChuyenVien) {
      // Chuyên viên: CHỈ THẤY THÔNG TIN CỦA CÁ NHÂN MÌNH
      query.user = currentUser._id;
    } else if (isCapTruong || isCapPho) {
      // Cấp trưởng, cấp phó: CHỈ THẤY DANH SÁCH TRONG ĐƠN VỊ MÌNH (hoặc do mình lập)
      query.$or = [
        { department: userDeptId },
        { createdByUser: currentUser._id },
        { user: currentUser._id },
      ];
    } else {
      // Manager / BGH / Admin: Thấy tất cả, có thể lọc theo department nếu chọn
      if (department) {
        query.department = department;
      }
    }

    // 2. Bộ lọc khác
    if (year) query.year = year;
    if (department) query.department = department;
    if (status) query.status = status;
    if (trainingForm) query.trainingForm = trainingForm;
    if (reportStatus) query["reportResult.status"] = reportStatus;
    if (attended !== undefined && attended !== "") {
      query["reportResult.attended"] = attended === "true";
    }

    // 3. Tìm kiếm từ khóa
    if (search && search.trim() !== "") {
      const keyword = search.trim();
      const regex = new RegExp(keyword, "i");
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { userName: regex },
          { trainingContent: regex },
          { trainingLocation: regex },
          { departmentName: regex },
        ],
      });
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const shouldFetchAll = fetchAll === "true";

    let dbQuery = TrainingRegistration.find(query)
      .populate("user", "name email phone department position avatar")
      .populate("department", "departmentName departmentCode")
      .populate("position", "positionName")
      .populate("createdByUser", "name email")
      .populate("managerReview.reviewedBy", "name email")
      .populate("reportResult.reportedBy", "name email")
      .sort({ createdAt: -1 });

    if (!shouldFetchAll) {
      dbQuery = dbQuery.skip((pageNum - 1) * limitNum).limit(limitNum);
    }

    const [data, total] = await Promise.all([
      dbQuery.lean(),
      TrainingRegistration.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data,
      total,
      page: pageNum,
      totalPages: shouldFetchAll ? 1 : Math.ceil(total / limitNum) || 1,
    });
  } catch (error) {
    console.error("Lỗi getRegistrations:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

/**
 * 3. LẤY CHI TIẾT MỘT HỒ SƠ
 */
const getRegistrationById = async (req, res) => {
  try {
    const { id } = req.params;
    const record = await TrainingRegistration.findById(id)
      .populate("user", "name email phone department position avatar")
      .populate("department", "departmentName departmentCode")
      .populate("position", "positionName")
      .populate("createdByUser", "name email")
      .populate("managerReview.reviewedBy", "name email")
      .populate("reportResult.reportedBy", "name email");

    if (!record) {
      return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ bồi dưỡng" });
    }

    res.status(200).json({ success: true, data: record });
  } catch (error) {
    console.error("Lỗi getRegistrationById:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

/**
 * 4. CẬP NHẬT HỒ SƠ ĐĂNG KÝ (Khi còn PENDING)
 */
const updateRegistration = async (req, res) => {
  try {
    const { id } = req.params;
    const record = await TrainingRegistration.findById(id);

    if (!record) {
      return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ" });
    }

    const isCreator = record.createdByUser?.toString() === req.user._id.toString();
    const isAdminOrManager = ["admin", "manager"].includes(req.user.role);

    if (!isCreator && !isAdminOrManager) {
      return res.status(403).json({ success: false, message: "Bạn không có quyền chỉnh sửa hồ sơ này." });
    }

    if (record.status !== "PENDING" && !isAdminOrManager) {
      return res.status(400).json({ success: false, message: "Hồ sơ đã được phê duyệt, không thể sửa đổi." });
    }

    const {
      trainingContent,
      estimatedCost,
      trainingLocation,
      startDate,
      endDate,
      trainingDuration,
      trainingForm,
      notes,
      year,
    } = req.body;

    if (trainingContent) record.trainingContent = trainingContent.trim();
    if (estimatedCost !== undefined) record.estimatedCost = Number(estimatedCost) || 0;
    if (trainingLocation !== undefined) record.trainingLocation = trainingLocation.trim();
    if (startDate !== undefined) record.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined) record.endDate = endDate ? new Date(endDate) : null;
    if (trainingDuration !== undefined) record.trainingDuration = trainingDuration.trim();
    if (trainingForm) record.trainingForm = trainingForm;
    if (notes !== undefined) record.notes = notes.trim();
    if (year) record.year = year.trim();

    record.history.push({
      action: "Cập nhật hồ sơ",
      actor: req.user._id,
      actorName: req.user.name,
      actorRole: req.user.role,
      details: "Chỉnh sửa thông tin khóa bồi dưỡng",
      timestamp: new Date(),
    });

    await record.save();

    res.status(200).json({ success: true, message: "Cập nhật thành công", data: record });
  } catch (error) {
    console.error("Lỗi updateRegistration:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

/**
 * 5. XÓA HỒ SƠ ĐĂNG KÝ
 */
const deleteRegistration = async (req, res) => {
  try {
    const { id } = req.params;
    const record = await TrainingRegistration.findById(id);

    if (!record) {
      return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ" });
    }

    const isCreator = record.createdByUser?.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    // Nếu hồ sơ đã duyệt hoặc không ở trạng thái PENDING: CHỈ ADMIN MỚI ĐƯỢC XÓA
    if (record.status !== "PENDING") {
      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          message: "Hồ sơ đã được duyệt. Chỉ quản trị viên (Admin) mới có quyền xóa.",
        });
      }
    } else {
      // Khi status === "PENDING": Người tạo, Manager hoặc Admin mới được xóa
      const isAdminOrManager = ["admin", "manager"].includes(req.user.role);
      if (!isCreator && !isAdminOrManager) {
        return res.status(403).json({ success: false, message: "Bạn không có quyền xóa hồ sơ này." });
      }
    }

    await TrainingRegistration.findByIdAndDelete(id);

    res.status(200).json({ success: true, message: "Đã xóa hồ sơ đăng ký bồi dưỡng." });
  } catch (error) {
    console.error("Lỗi deleteRegistration:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

/**
 * 6. MANAGER / ADMIN / MAI ANH THY XÉT DUYỆT HỒ SƠ
 */
const reviewRegistration = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, note } = req.body;

    if (!["APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({ success: false, message: "Trạng thái phê duyệt không hợp lệ (chỉ chấp nhận APPROVED hoặc REJECTED)." });
    }

    const currentUser = await User.findById(req.user._id)
      .populate("department")
      .populate("position");
    const { isAdminOrManager, isMaiAnhThy } = getUserRoleInfo(currentUser || req.user);
    if (!isAdminOrManager && !isMaiAnhThy) {
      return res.status(403).json({ success: false, message: "Bạn không có quyền xét duyệt hồ sơ này." });
    }

    const record = await TrainingRegistration.findById(id);
    if (!record) {
      return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ bồi dưỡng" });
    }

    record.status = status;
    record.managerReview = {
      status,
      reviewedBy: req.user._id,
      reviewedByName: req.user.name,
      reviewedAt: new Date(),
      note: note || "",
    };

    const statusLabel = status === "APPROVED" ? "Phê duyệt" : "Từ chối";
    record.history.push({
      action: statusLabel,
      actor: req.user._id,
      actorName: req.user.name,
      actorRole: req.user.role,
      details: `${statusLabel} hồ sơ đăng ký bồi dưỡng. ${note ? `Ghi chú: ${note}` : ""}`,
      timestamp: new Date(),
    });

    await record.save();

    // Gửi thông báo chuông và email thông báo xét duyệt (bất đồng bộ)
    (async () => {
      try {
        const recipientIds = new Set();
        if (record.user) recipientIds.add(record.user.toString());
        if (record.createdByUser) recipientIds.add(record.createdByUser.toString());
        recipientIds.delete(req.user._id.toString());

        // 1. Chuông thông báo
        const notifs = Array.from(recipientIds).map((recId) => ({
          recipient: recId,
          sender: req.user._id,
          type: "GENERAL",
          title: status === "APPROVED" ? "Hồ sơ bồi dưỡng đã được phê duyệt" : "Hồ sơ bồi dưỡng bị từ chối",
          message: `Hồ sơ bồi dưỡng "${record.trainingContent}" của ${record.userName} đã được ${req.user.name} ${statusLabel.toLowerCase()}.${note ? ` (Ghi chú: ${note})` : ""}`,
          link: "/training/list",
          isRead: false,
          isPopupShown: false,
        }));

        if (notifs.length > 0) {
          await Notification.insertMany(notifs);
        }

        // 2. Email thông báo
        if (recipientIds.size > 0) {
          const emailUsers = await User.find({ _id: { $in: Array.from(recipientIds) } }).select(
            "_id name email emailNotifications role"
          );
          await sendTrainingStatusEmail(
            emailUsers,
            record,
            status === "APPROVED" ? "REVIEW_APPROVED" : "REVIEW_REJECTED",
            note,
            req.user.name,
            isMaiAnhThy ? "Xét duyệt (Mai Anh Thy)" : req.user.role
          );
        }
      } catch (notifyErr) {
        console.error("Lỗi gửi thông báo / email xét duyệt bồi dưỡng:", notifyErr);
      }
    })();

    res.status(200).json({
      success: true,
      message: `Đã ${statusLabel.toLowerCase()} hồ sơ thành công.`,
      data: record,
    });
  } catch (error) {
    console.error("Lỗi reviewRegistration:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

/**
 * 7. BÁO CÁO KẾT QUẢ BỒI DƯỠNG (SAU KHI HỌC XONG)
 */
const reportResult = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      attended, // true / false
      notAttendedReason,
      resultDetails,
      hasFundingSupport,
      actualFundAmount,
      proofFiles,
    } = req.body;

    const record = await TrainingRegistration.findById(id);
    if (!record) {
      return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ" });
    }

    if (record.status !== "APPROVED") {
      return res.status(400).json({ success: false, message: "Hồ sơ phải được phê duyệt trước khi báo cáo kết quả." });
    }

    const currentUser = await User.findById(req.user._id)
      .populate("department")
      .populate("position");
    const { isBGH, isAdminOrManager, isCapTruong, isCapPho, isChuyenVien, userDeptId } =
      getUserRoleInfo(currentUser);

    const isTargetUser = record.user?.toString() === currentUser._id.toString();
    const isRecordInDept = record.department?.toString() === userDeptId?.toString();
    const isCreator = record.createdByUser?.toString() === currentUser._id.toString();

    if (isChuyenVien) {
      // Chuyên viên: CHỈ ĐƯỢC BÁO CÁO KẾT QUẢ CHO CÁ NHÂN MÌNH
      if (!isTargetUser) {
        return res.status(403).json({
          success: false,
          message: "Chuyên viên chỉ có quyền báo cáo kết quả bồi dưỡng cho bản thân.",
        });
      }
    } else if (isCapTruong || isCapPho) {
      // Cấp trưởng & Cấp phó: Báo cáo cho các hồ sơ trong đơn vị mình hoặc do mình tạo/thuộc về mình
      if (!isRecordInDept && !isCreator && !isTargetUser) {
        return res.status(403).json({
          success: false,
          message: "Cấp trưởng/phó chỉ có quyền báo cáo kết quả cho nhân sự trong đơn vị mình.",
        });
      }
    } else if (!isAdminOrManager && !isBGH) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền báo cáo kết quả cho hồ sơ này.",
      });
    }

    const isAttended = attended === true || attended === "true";

    record.reportResult = {
      status: "REPORTED",
      attended: isAttended,
      notAttendedReason: !isAttended ? (notAttendedReason || "").trim() : "",
      resultDetails: isAttended ? (resultDetails || "").trim() : "",
      hasFundingSupport: isAttended ? Boolean(hasFundingSupport) : false,
      actualFundAmount: isAttended ? Number(actualFundAmount) || 0 : 0,
      proofFiles: isAttended && Array.isArray(proofFiles) ? proofFiles : [],
      reportedBy: req.user._id,
      reportedByName: req.user.name,
      reportedAt: new Date(),
      managerConfirmed: false,
    };

    record.history.push({
      action: "Báo cáo kết quả bồi dưỡng",
      actor: req.user._id,
      actorName: req.user.name,
      actorRole: req.user.role,
      details: isAttended
        ? `Đã tham gia học. Kết quả: ${resultDetails || "Đạt"}. ${hasFundingSupport ? `Có hỗ trợ kinh phí: ${actualFundAmount || 0}đ` : "Không hỗ trợ kinh phí"}`
        : `Không tham gia học. Lý do: ${notAttendedReason || "Không nêu rõ"}`,
      timestamp: new Date(),
    });

    await record.save();

    // Gửi thông báo chuông và email thông báo báo cáo kết quả (bất đồng bộ)
    (async () => {
      try {
        const managersAndThy = await getManagerAndThyUsers();

        // 1. Chuông thông báo
        const notifs = [];
        managersAndThy.forEach((m) => {
          if (m._id.toString() !== req.user._id.toString()) {
            notifs.push({
              recipient: m._id,
              sender: req.user._id,
              type: "GENERAL",
              title: "Báo cáo kết quả bồi dưỡng mới",
              message: `${req.user.name} đã nộp báo cáo kết quả khóa bồi dưỡng "${record.trainingContent}" của ${record.userName} (${isAttended ? "Đã học" : "Không tham gia"}).`,
              link: "/training/result-report",
              isRead: false,
              isPopupShown: false,
            });
          }
        });

        // Nếu người nộp báo cáo khác với nhân sự được bồi dưỡng
        if (record.user && record.user.toString() !== req.user._id.toString()) {
          notifs.push({
            recipient: record.user,
            sender: req.user._id,
            type: "GENERAL",
            title: "Báo cáo kết quả bồi dưỡng",
            message: `${req.user.name} đã cập nhật báo cáo kết quả khóa bồi dưỡng "${record.trainingContent}" của bạn.`,
            link: "/training/result-report",
            isRead: false,
            isPopupShown: false,
          });
        }

        if (notifs.length > 0) {
          await Notification.insertMany(notifs);
        }

        // 2. Email thông báo
        const recipientMap = new Map();
        managersAndThy.forEach((m) => {
          if (m.email && m._id.toString() !== req.user._id.toString()) {
            recipientMap.set(m._id.toString(), m);
          }
        });

        if (record.user && record.user.toString() !== req.user._id.toString()) {
          const u = await User.findById(record.user).select("_id name email emailNotifications role");
          if (u && u.email) recipientMap.set(u._id.toString(), u);
        }

        await sendTrainingStatusEmail(
          Array.from(recipientMap.values()),
          record,
          "REPORT_SUBMITTED",
          isAttended
            ? (record.reportResult?.resultDetails || "Đã hoàn thành khóa học và nộp hồ sơ minh chứng.")
            : (record.reportResult?.notAttendedReason || "Không tham gia học"),
          req.user.name,
          req.user.role
        );
      } catch (notifyErr) {
        console.error("Lỗi gửi thông báo / email báo cáo kết quả:", notifyErr);
      }
    })();

    res.status(200).json({
      success: true,
      message: "Gửi báo cáo kết quả bồi dưỡng thành công.",
      data: record,
    });
  } catch (error) {
    console.error("Lỗi reportResult:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

/**
 * 8. UPLOAD TỆP MINH CHỨNG KẾT QUẢ BỒI DƯỠNG LÊN GOOGLE DRIVE
 */
const uploadProofFiles = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: "Không có file nào được tải lên." });
    }

    const auth = await authorizeDrive();
    const drive = google.drive({ version: "v3", auth });
    const targetFolderId = await getOrCreateTrainingFolder(drive);

    const uploadedFiles = [];
    for (const file of req.files) {
      const originalName = Buffer.from(file.originalname, "latin1").toString("utf8");
      const fileMetadata = {
        name: originalName,
        parents: [targetFolderId],
      };
      const media = {
        mimeType: file.mimetype,
        body: Readable.from(file.buffer),
      };

      const response = await drive.files.create({
        requestBody: fileMetadata,
        media,
        fields: "id, name, mimeType, size, webViewLink",
        supportsAllDrives: true,
      });

      uploadedFiles.push({
        fileId: response.data.id,
        fileName: response.data.name || originalName,
        mimeType: response.data.mimeType || file.mimetype,
        size: response.data.size ? `${(response.data.size / 1024).toFixed(1)} KB` : "",
        fileUrl: response.data.webViewLink || `https://drive.google.com/file/d/${response.data.id}/view`,
        uploadedAt: new Date(),
      });
    }

    res.status(200).json({
      success: true,
      message: `Tải lên ${uploadedFiles.length} file minh chứng thành công`,
      data: uploadedFiles,
    });
  } catch (error) {
    console.error("Lỗi uploadProofFiles:", error);
    res.status(500).json({ success: false, message: "Lỗi tải tệp lên Google Drive", error: error.message });
  }
};

/**
 * 9. THỐNG KÊ TỔNG HỢP HỌC TẬP BỒI DƯỠNG
 */
const getStats = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user._id)
      .populate("department")
      .populate("position");
    const { isBGH, isAdminOrManager, isCapTruong, isCapPho, isChuyenVien, userDeptId } =
      getUserRoleInfo(currentUser);

    const { year, department } = req.query;
    const match = {};
    if (year) match.year = year;

    if (isChuyenVien) {
      // Chuyên viên: chỉ thống kê của cá nhân mình
      match.user = currentUser._id;
    } else if (isCapTruong || isCapPho) {
      // Cấp trưởng & cấp phó: chỉ thống kê của đơn vị mình
      if (userDeptId) {
        match.department = new (require("mongoose").Types.ObjectId)(userDeptId);
      }
    } else {
      // Manager / BGH / Admin: thống kê toàn trường hoặc theo department nếu có chọn
      if (department) {
        match.department = new (require("mongoose").Types.ObjectId)(department);
      }
    }

    const [allRecords, deptList] = await Promise.all([
      TrainingRegistration.find(match).lean(),
      Department.find().select("departmentName departmentCode").lean(),
    ]);

    const totalRegistrations = allRecords.length;
    let pendingCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;

    let totalEstimatedCost = 0;
    let totalActualFund = 0;

    let reportedCount = 0;
    let attendedCount = 0;
    let notAttendedCount = 0;

    const formStats = {
      "Chứng chỉ": 0,
      "Chứng nhận": 0,
      "Văn bằng": 0,
      "Khác": 0,
    };

    const deptStatsMap = {};
    deptList.forEach((d) => {
      deptStatsMap[d._id.toString()] = {
        departmentName: d.departmentName,
        total: 0,
        approved: 0,
        attended: 0,
        notAttended: 0,
        totalCost: 0,
      };
    });

    allRecords.forEach((r) => {
      if (r.status === "PENDING") pendingCount++;
      if (r.status === "APPROVED") approvedCount++;
      if (r.status === "REJECTED") rejectedCount++;

      totalEstimatedCost += r.estimatedCost || 0;

      if (r.trainingForm && formStats[r.trainingForm] !== undefined) {
        formStats[r.trainingForm]++;
      } else {
        formStats["Khác"]++;
      }

      if (r.reportResult?.status === "REPORTED") {
        reportedCount++;
        if (r.reportResult.attended === true) {
          attendedCount++;
          if (r.reportResult.hasFundingSupport) {
            totalActualFund += r.reportResult.actualFundAmount || 0;
          }
        } else if (r.reportResult.attended === false) {
          notAttendedCount++;
        }
      }

      const dId = r.department?.toString();
      if (dId && deptStatsMap[dId]) {
        deptStatsMap[dId].total++;
        if (r.status === "APPROVED") deptStatsMap[dId].approved++;
        if (r.reportResult?.attended === true) deptStatsMap[dId].attended++;
        if (r.reportResult?.attended === false) deptStatsMap[dId].notAttended++;
        deptStatsMap[dId].totalCost += r.estimatedCost || 0;
      }
    });

    const completionRate = approvedCount > 0 ? Math.round((attendedCount / approvedCount) * 100) : 0;

    res.status(200).json({
      success: true,
      data: {
        totalRegistrations,
        pendingCount,
        approvedCount,
        rejectedCount,
        reportedCount,
        attendedCount,
        notAttendedCount,
        completionRate,
        totalEstimatedCost,
        totalActualFund,
        formStats,
        departmentBreakdown: Object.values(deptStatsMap).filter((d) => d.total > 0),
      },
    });
  } catch (error) {
    console.error("Lỗi getStats:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

/**
 * 10. TẢI FILE MẪU EXCEL ĐĂNG KÝ BỒI DƯỠNG (2 Sheet)
 */
const getTemplateExcel = async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Hệ thống Quản lý Văn bản";

    // Sheet 1: Mẫu nhập liệu
    const sheet1 = workbook.addWorksheet("Mau_Dang_Ky");
    sheet1.columns = [
      { header: "STT", key: "stt", width: 8 },
      { header: "Email / Mã nhân sự (*)", key: "userIdentifier", width: 28 },
      { header: "Họ và tên", key: "userName", width: 25 },
      { header: "Đơn vị (*)", key: "departmentName", width: 30 },
      { header: "Chức danh", key: "positionName", width: 20 },
      { header: "Năm đào tạo (*)", key: "year", width: 16 },
      { header: "Nội dung bồi dưỡng (*)", key: "trainingContent", width: 35 },
      { header: "Hình thức đào tạo (*)", key: "trainingForm", width: 22 },
      { header: "Nơi đào tạo (*)", key: "trainingLocation", width: 30 },
      { header: "Thời gian đào tạo", key: "trainingDuration", width: 22 },
      { header: "Kinh phí dự kiến (VNĐ)", key: "estimatedCost", width: 25 },
      { header: "Ghi chú", key: "notes", width: 25 },
    ];

    // Format Header Sheet 1
    sheet1.getRow(1).height = 28;
    sheet1.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1E40AF" }, // Blue 800
      };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });

    // Thêm vài dòng mẫu
    sheet1.addRow({
      stt: 1,
      userIdentifier: "nguyenvana@namsaigon.edu.vn",
      userName: "Nguyễn Văn A",
      departmentName: "Khoa Công nghệ Thông tin",
      positionName: "Giảng viên",
      year: new Date().getFullYear().toString(),
      trainingContent: "Bồi dưỡng chuẩn chức danh nghề nghiệp Giảng viên đại học",
      trainingForm: "Chứng chỉ",
      trainingLocation: "Trường Cán bộ Quản lý Giáo dục TP.HCM",
      trainingDuration: "03 tháng",
      estimatedCost: 3500000,
      notes: "Đăng ký kế hoạch đợt 1",
    });

    sheet1.addRow({
      stt: 2,
      userIdentifier: "tranthib@namsaigon.edu.vn",
      userName: "Trần Thị B",
      departmentName: "Phòng Tổ chức - Hành chính",
      positionName: "Chuyên viên",
      year: new Date().getFullYear().toString(),
      trainingContent: "Tập huấn nghiệp vụ Lưu trữ và Số hóa tài liệu điện tử",
      trainingForm: "Chứng nhận",
      trainingLocation: "Học viện Hành chính Quốc gia",
      trainingDuration: "05 ngày",
      estimatedCost: 1500000,
      notes: "",
    });

    // Sheet 2: Danh mục tham chiếu
    const sheet2 = workbook.addWorksheet("Huong_Dan_DanhMuc");

    const [departments, positions, users] = await Promise.all([
      Department.find().select("departmentName departmentCode").lean(),
      Position.find().select("positionName").lean(),
      User.find().select("name email department").populate("department", "departmentName").lean(),
    ]);

    sheet2.columns = [
      { header: "Tên Đơn vị / Phòng ban", key: "dept", width: 35 },
      { header: "Hình thức đào tạo chuẩn", key: "form", width: 25 },
      { header: "Chức danh / Chức vụ", key: "pos", width: 25 },
      { header: "Họ tên nhân sự (Hệ thống)", key: "uName", width: 25 },
      { header: "Email nhân sự (Dùng để nhập)", key: "uEmail", width: 32 },
    ];

    sheet2.getRow(1).height = 25;
    sheet2.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF047857" }, // Emerald 700
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    const forms = ["Chứng chỉ", "Chứng nhận", "Văn bằng", "Khác"];
    const maxRows = Math.max(departments.length, forms.length, positions.length, users.length);

    for (let i = 0; i < maxRows; i++) {
      sheet2.addRow({
        dept: departments[i]?.departmentName || "",
        form: forms[i] || "",
        pos: positions[i]?.positionName || "",
        uName: users[i]?.name || "",
        uEmail: users[i]?.email || "",
      });
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Mau_Dang_Ky_Boi_Duong_${new Date().getFullYear()}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Lỗi getTemplateExcel:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

/**
 * 11. XUẤT EXCEL DANH SÁCH BỒI DƯỠNG (Theo bộ lọc hiện tại)
 */
const exportExcel = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user._id)
      .populate("department")
      .populate("position");
    const { isBGH, isAdminOrManager, isCapTruong, isCapPho, isChuyenVien, userDeptId } =
      getUserRoleInfo(currentUser);

    const { year, department, status, trainingForm, reportStatus, attended } = req.query;
    const query = {};

    if (isChuyenVien) {
      query.user = currentUser._id;
    } else if (isCapTruong || isCapPho) {
      query.$or = [
        { department: userDeptId },
        { createdByUser: currentUser._id },
        { user: currentUser._id },
      ];
    } else {
      if (department) query.department = department;
    }

    if (year) query.year = year;
    if (status) query.status = status;
    if (trainingForm) query.trainingForm = trainingForm;
    if (reportStatus) query["reportResult.status"] = reportStatus;
    if (attended !== undefined && attended !== "") {
      query["reportResult.attended"] = attended === "true";
    }

    const records = await TrainingRegistration.find(query)
      .populate("user", "name email")
      .populate("department", "departmentName")
      .populate("position", "positionName")
      .populate("managerReview.reviewedBy", "name")
      .populate("reportResult.reportedBy", "name")
      .sort({ createdAt: -1 })
      .lean();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Hệ thống Quản lý Văn bản";

    const worksheet = workbook.addWorksheet("Danh_Sach_Boi_Duong");

    worksheet.columns = [
      { header: "STT", key: "stt", width: 8 },
      { header: "Họ và tên", key: "userName", width: 24 },
      { header: "Đơn vị", key: "departmentName", width: 28 },
      { header: "Chức danh", key: "positionName", width: 18 },
      { header: "Năm", key: "year", width: 10 },
      { header: "Nội dung học tập bồi dưỡng", key: "trainingContent", width: 35 },
      { header: "Hình thức", key: "trainingForm", width: 16 },
      { header: "Nơi đào tạo", key: "trainingLocation", width: 28 },
      { header: "Thời gian đào tạo", key: "trainingDuration", width: 20 },
      { header: "Kinh phí dự kiến (VNĐ)", key: "estimatedCost", width: 22 },
      { header: "Trạng thái duyệt", key: "status", width: 18 },
      { header: "Tình trạng học", key: "attendedStatus", width: 18 },
      { header: "Kết quả bồi dưỡng", key: "resultDetails", width: 25 },
      { header: "Hỗ trợ kinh phí", key: "fundingSupport", width: 20 },
      { header: "Kinh phí hỗ trợ thực tế (VNĐ)", key: "actualFundAmount", width: 25 },
      { header: "Lý do không học (nếu có)", key: "notAttendedReason", width: 28 },
      { header: "Ghi chú", key: "notes", width: 20 },
    ];

    worksheet.getRow(1).height = 28;
    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1E3A8A" }, // Indigo 900
      };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });

    const statusLabels = {
      PENDING: "Chờ phê duyệt",
      APPROVED: "Đã phê duyệt",
      REJECTED: "Đã từ chối",
    };

    records.forEach((r, idx) => {
      let attendedText = "Chưa báo cáo";
      if (r.reportResult?.status === "REPORTED") {
        attendedText = r.reportResult.attended === true ? "Đã tham gia học" : "Không tham gia học";
      }

      let fundingText = "Không";
      if (r.reportResult?.hasFundingSupport) {
        fundingText = "Có hỗ trợ";
      }

      const row = worksheet.addRow({
        stt: idx + 1,
        userName: r.userName || r.user?.name || "",
        departmentName: r.departmentName || r.department?.departmentName || "",
        positionName: r.positionName || r.position?.positionName || "",
        year: r.year || "",
        trainingContent: r.trainingContent || "",
        trainingForm: r.trainingForm || "",
        trainingLocation: r.trainingLocation || "",
        trainingDuration: r.trainingDuration || "",
        estimatedCost: r.estimatedCost || 0,
        status: statusLabels[r.status] || r.status,
        attendedStatus: attendedText,
        resultDetails: r.reportResult?.resultDetails || "",
        fundingSupport: fundingText,
        actualFundAmount: r.reportResult?.actualFundAmount || 0,
        notAttendedReason: r.reportResult?.notAttendedReason || "",
        notes: r.notes || "",
      });

      row.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } },
        };
        if (colNumber === 10 || colNumber === 15) {
          cell.numFmt = "#,##0";
          cell.alignment = { horizontal: "right", vertical: "middle" };
        } else if (colNumber === 1 || colNumber === 5) {
          cell.alignment = { horizontal: "center", vertical: "middle" };
        } else {
          cell.alignment = { vertical: "middle" };
        }
      });
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Bao_Cao_Boi_Duong_${year || "All"}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Lỗi exportExcel:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

/**
 * 12. IMPORT DANH SÁCH ĐĂNG KÝ TỪ FILE EXCEL
 */
const importExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Vui lòng chọn file Excel để tải lên." });
    }

    const currentUser = await User.findById(req.user._id)
      .populate("department")
      .populate("position");
    const { isBGH, isAdminOrManager, isCapTruong, isCapPho, isChuyenVien, userDeptId, userDeptName } =
      getUserRoleInfo(currentUser);

    if (isChuyenVien) {
      return res.status(403).json({
        success: false,
        message:
          "Chuyên viên không được quyền import Excel danh sách bồi dưỡng. Vui lòng đăng ký trực tiếp trên giao diện cá nhân.",
      });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return res.status(400).json({ success: false, message: "File Excel không có trang tính hợp lệ." });
    }

    const [allUsers, allDepts, allPositions] = await Promise.all([
      User.find().populate("department").populate("position").lean(),
      Department.find().lean(),
      Position.find().lean(),
    ]);

    const usersByEmail = new Map();
    const usersByName = new Map();
    allUsers.forEach((u) => {
      if (u.email) usersByEmail.set(u.email.toLowerCase().trim(), u);
      if (u.name) usersByName.set(u.name.toLowerCase().trim(), u);
    });

    const deptsByName = new Map();
    allDepts.forEach((d) => {
      if (d.departmentName) deptsByName.set(d.departmentName.toLowerCase().trim(), d);
    });

    const positionsByName = new Map();
    allPositions.forEach((p) => {
      if (p.positionName) positionsByName.set(p.positionName.toLowerCase().trim(), p);
    });

    const validRows = [];
    const errors = [];

    // Duyệt từ dòng thứ 2 (bỏ qua header)
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const userIdentifier = row.getCell(2).text ? row.getCell(2).text.trim() : "";
      const rawUserName = row.getCell(3).text ? row.getCell(3).text.trim() : "";
      const rawDept = row.getCell(4).text ? row.getCell(4).text.trim() : "";
      const rawPos = row.getCell(5).text ? row.getCell(5).text.trim() : "";
      const rawYear = row.getCell(6).text ? row.getCell(6).text.trim() : new Date().getFullYear().toString();
      const rawContent = row.getCell(7).text ? row.getCell(7).text.trim() : "";
      const rawForm = row.getCell(8).text ? row.getCell(8).text.trim() : "Chứng chỉ";
      const rawLocation = row.getCell(9).text ? row.getCell(9).text.trim() : "";
      const rawDuration = row.getCell(10).text ? row.getCell(10).text.trim() : "";
      const rawCost = row.getCell(11).value;
      const rawNotes = row.getCell(12).text ? row.getCell(12).text.trim() : "";

      if (!rawContent) {
        errors.push(`Dòng ${rowNumber}: Thiếu nội dung học tập bồi dưỡng.`);
        return;
      }

      // Tìm user theo Email trước, sau đó theo Tên
      let matchedUser = null;
      if (userIdentifier && usersByEmail.has(userIdentifier.toLowerCase())) {
        matchedUser = usersByEmail.get(userIdentifier.toLowerCase());
      } else if (rawUserName && usersByName.has(rawUserName.toLowerCase())) {
        matchedUser = usersByName.get(rawUserName.toLowerCase());
      }

      // Nếu là Cấp trưởng/phó: kiểm tra nhân sự có thuộc đơn vị không
      if (isCapTruong || isCapPho) {
        if (matchedUser) {
          const mDeptId = matchedUser.department?._id || matchedUser.department;
          if (mDeptId && userDeptId && mDeptId.toString() !== userDeptId.toString()) {
            errors.push(
              `Dòng ${rowNumber}: Nhân sự "${matchedUser.name}" thuộc đơn vị khác. Cấp trưởng/phó chỉ được nạp nhân sự trong đơn vị mình.`
            );
            return;
          }
        }
      }

      const matchedDept = rawDept ? deptsByName.get(rawDept.toLowerCase()) : matchedUser?.department;
      const matchedPos = rawPos ? positionsByName.get(rawPos.toLowerCase()) : matchedUser?.position;

      const validForms = ["Chứng chỉ", "Chứng nhận", "Văn bằng", "Khác"];
      const finalForm = validForms.includes(rawForm) ? rawForm : "Chứng chỉ";

      let costNum = 0;
      if (typeof rawCost === "number") costNum = rawCost;
      else if (rawCost) costNum = Number(String(rawCost).replace(/[^0-9.-]+/g, "")) || 0;

      // Xác định đơn vị theo vai trò
      const finalDeptId = (isCapTruong || isCapPho)
        ? userDeptId
        : (matchedDept?._id || matchedUser?.department?._id || null);
      const finalDeptName = (isCapTruong || isCapPho)
        ? userDeptName
        : (matchedDept?.departmentName || matchedUser?.department?.departmentName || rawDept);

      validRows.push({
        user: matchedUser ? matchedUser._id : null,
        userName: matchedUser ? matchedUser.name : (rawUserName || userIdentifier),
        department: finalDeptId,
        departmentName: finalDeptName,
        position: matchedPos?._id || matchedUser?.position?._id || null,
        positionName: matchedPos?.positionName || matchedUser?.position?.positionName || rawPos || "Cán bộ",
        year: rawYear || new Date().getFullYear().toString(),
        trainingContent: rawContent,
        estimatedCost: costNum,
        trainingLocation: rawLocation,
        trainingDuration: rawDuration,
        trainingForm: finalForm,
        notes: rawNotes,
        createdByUser: req.user._id,
        createdByUserName: req.user.name,
        status: "PENDING",
        history: [
          {
            action: "Import Excel",
            actor: req.user._id,
            actorName: req.user.name,
            actorRole: req.user.role,
            details: `Import từ file Excel: "${req.file.originalname}"`,
            timestamp: new Date(),
          },
        ],
      });
    });

    if (validRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Không có dòng dữ liệu hợp lệ nào để import.",
        errors,
      });
    }

    const inserted = await TrainingRegistration.insertMany(validRows);

    res.status(200).json({
      success: true,
      message: `Đã import thành công ${inserted.length} bản ghi đăng ký bồi dưỡng.`,
      importedCount: inserted.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Lỗi importExcel:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ khi import Excel", error: error.message });
  }
};

/**
 * 13. MANAGER XÁC NHẬN KẾT QUẢ BÁO CÁO
 */
const confirmReportResult = async (req, res) => {
  try {
    const { id } = req.params;
    const record = await TrainingRegistration.findById(id);
    if (!record) {
      return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ" });
    }

    const { isAdminOrManager, isMaiAnhThy } = getUserRoleInfo(req.user);
    if (!isAdminOrManager && !isMaiAnhThy) {
      return res.status(403).json({ success: false, message: "Chỉ Manager/Admin/Mai Anh Thy mới có quyền xác nhận kết quả bồi dưỡng." });
    }

    if (!record.reportResult || record.reportResult.status !== "REPORTED") {
      return res.status(400).json({ success: false, message: "Hồ sơ chưa có báo cáo kết quả để xác nhận." });
    }

    record.reportResult.managerConfirmed = true;
    record.reportResult.confirmedBy = req.user._id;
    record.reportResult.confirmedByName = req.user.name;
    record.reportResult.confirmedAt = new Date();

    record.history.push({
      action: "Xác nhận kết quả bồi dưỡng",
      actor: req.user._id,
      actorName: req.user.name,
      actorRole: req.user.role,
      details: `${req.user.name} đã xác nhận kết quả báo cáo bồi dưỡng.`,
      timestamp: new Date(),
    });

    await record.save();

    // Gửi thông báo chuông và email thông báo xác nhận kết quả (bất đồng bộ)
    (async () => {
      try {
        const recipientIds = new Set();
        if (record.user) recipientIds.add(record.user.toString());
        if (record.reportResult?.reportedBy) recipientIds.add(record.reportResult.reportedBy.toString());
        if (record.createdByUser) recipientIds.add(record.createdByUser.toString());
        recipientIds.delete(req.user._id.toString());

        // 1. Chuông thông báo
        const notifs = Array.from(recipientIds).map((recId) => ({
          recipient: recId,
          sender: req.user._id,
          type: "GENERAL",
          title: "Xác nhận kết quả bồi dưỡng",
          message: `Quản lý ${req.user.name} đã xác nhận kết quả báo cáo khóa bồi dưỡng "${record.trainingContent}" của ${record.userName}.`,
          link: "/training/result-report",
          isRead: false,
          isPopupShown: false,
        }));

        if (notifs.length > 0) {
          await Notification.insertMany(notifs);
        }

        // 2. Email thông báo
        if (recipientIds.size > 0) {
          const emailUsers = await User.find({ _id: { $in: Array.from(recipientIds) } }).select(
            "_id name email emailNotifications role"
          );
          await sendTrainingStatusEmail(
            emailUsers,
            record,
            "REPORT_CONFIRMED",
            `Quản lý ${req.user.name} đã xác nhận kết quả báo cáo bồi dưỡng.`,
            req.user.name,
            req.user.role
          );
        }
      } catch (notifyErr) {
        console.error("Lỗi gửi thông báo / email xác nhận kết quả:", notifyErr);
      }
    })();

    res.status(200).json({
      success: true,
      message: "Đã xác nhận kết quả bồi dưỡng thành công.",
      data: record,
    });
  } catch (error) {
    console.error("Lỗi confirmReportResult:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

module.exports = {
  createRegistrations,
  getRegistrations,
  getRegistrationById,
  updateRegistration,
  deleteRegistration,
  reviewRegistration,
  reportResult,
  confirmReportResult,
  uploadProofFiles,
  getStats,
  getTemplateExcel,
  exportExcel,
  importExcel,
};
