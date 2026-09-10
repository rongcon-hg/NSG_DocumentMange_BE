const { google } = require("googleapis");
const { Readable } = require("stream");
const EmulationRegistration = require("../models/emulationRegistration.model");
const EmulationTitle = require("../models/emulationTitle.model");
const EmulationDocumentType = require("../models/emulationDocumentType.model");
const User = require("../models/user.model");
const Department = require("../models/department.model");
const Position = require("../models/position.model");
const DriveConfig = require("../models/driveConfig.model");

// Helper: Kiểm tra User có phải BGH hay không
const isUserBGH = (user) => {
  if (!user) return false;
  if (user.role === "admin") return true;

  const deptCode = (user.department?.departmentCode || "").toUpperCase();
  const deptName = (user.department?.departmentName || "").toLowerCase();
  const posName = (user.position?.positionName || "").toLowerCase();
  const posCode = (user.position?.positionCode || "").toUpperCase();

  return (
    deptCode === "BGH" ||
    deptName.includes("ban giám hiệu") ||
    ["HT", "PHT", "NHT"].includes(posCode) ||
    posName.includes("hiệu trưởng") ||
    posName.includes("phó hiệu trưởng")
  );
};

// Helper: Authorize Google Drive
async function authorizeDrive() {
  const config = await DriveConfig.findOne();
  if (!config || !config.clientEmail || !config.privateKey) {
    throw new Error("Chưa cấu hình Service Account cho Google Drive.");
  }
  return new google.auth.JWT({
    email: config.clientEmail,
    key: config.privateKey.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
}

// Helper: Get or create Thi đua folder
async function getOrCreateEmulationFolder(drive) {
  const config = await DriveConfig.findOne();
  const parentId = config?.folderId || process.env.DRIVE_FOLDER_ID;
  if (!parentId) throw new Error("Chưa cấu hình folderId trên Google Drive.");

  const folderName = "ThiDua_KhenThuong";
  try {
    const query = `name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const response = await drive.files.list({
      q: query,
      fields: "files(id, name)",
      spaces: "drive",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    if (response.data.files && response.data.files.length > 0) {
      return response.data.files[0].id;
    }

    const createResponse = await drive.files.create({
      resource: {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      },
      fields: "id",
      supportsAllDrives: true,
    });

    return createResponse.data.id;
  } catch (err) {
    console.error("Lỗi getOrCreateEmulationFolder:", err);
    return parentId; // fallback
  }
}

// Upload 1 hoặc nhiều file minh chứng lên Google Drive
const uploadEmulationFile = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: "Không có file nào được tải lên" });
    }

    const auth = await authorizeDrive();
    const drive = google.drive({ version: "v3", auth });
    const targetFolderId = await getOrCreateEmulationFolder(drive);

    const uploaded = [];
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
        media: media,
        fields: "id, name, mimeType, size, webViewLink",
        supportsAllDrives: true,
      });

      uploaded.push({
        fileId: response.data.id,
        fileName: response.data.name || originalName,
        mimeType: response.data.mimeType || file.mimetype,
        size: response.data.size ? `${(response.data.size / 1024).toFixed(1)} KB` : "",
        fileUrl: response.data.webViewLink || `https://drive.google.com/file/d/${response.data.id}/view`,
      });
    }

    res.status(200).json({
      success: true,
      message: "Tải file lên Google Drive thành công",
      data: uploaded,
    });
  } catch (error) {
    console.error("Lỗi uploadEmulationFile:", error);
    res.status(500).json({ success: false, message: "Lỗi tải file", error: error.message });
  }
};

// Lấy danh sách đăng ký thi đua (kèm phân quyền)
const getAllRegistrations = async (req, res) => {
  try {
    const { schoolYear, department, title, status, search, page = 1, limit = 50 } = req.query;
    const currentUser = await User.findById(req.user._id)
      .populate("department")
      .populate("position");

    const filter = {};

    // Phân quyền dữ liệu
    const isBGH = isUserBGH(currentUser);
    const isManager = ["manager", "cappho", "staff"].includes(currentUser.role);

    if (isBGH) {
      // BGH và Admin xem toàn trường -> Cho phép lọc tự do theo department nếu có query
      if (department) {
        filter.department = department;
      }
    } else if (isManager) {
      // Trưởng đơn vị / Quản lý -> Xem các hồ sơ trong đơn vị của mình
      filter.department = currentUser.department?._id || currentUser.department;
    } else {
      // Chuyên viên / Nhân viên thường -> Chỉ xem đơn của chính mình
      filter.user = currentUser._id;
    }

    if (schoolYear) {
      filter.schoolYear = schoolYear;
    }
    if (status) {
      filter.status = status;
    }
    if (title) {
      filter.titles = title;
    }
    if (search) {
      filter.name = { $regex: search.trim(), $options: "i" };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [total, registrations] = await Promise.all([
      EmulationRegistration.countDocuments(filter),
      EmulationRegistration.find(filter)
        .populate("user", "name email mobile avatar")
        .populate("department", "departmentName departmentCode")
        .populate("position", "positionName positionCode")
        .populate("titles", "code name level targetType")
        .populate("attachedFiles.documentType", "code name isRequired")
        .populate("managerReview.reviewedBy", "name")
        .populate("bghReview.reviewedBy", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
    ]);

    res.status(200).json({
      success: true,
      data: registrations,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
      userRoleInfo: {
        isBGH,
        isManager,
        departmentId: currentUser.department?._id,
      },
    });
  } catch (error) {
    console.error("Lỗi getAllRegistrations:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

// Lấy thông tin đơn đăng ký của user trong năm học cụ thể
const getMyRegistration = async (req, res) => {
  try {
    const { schoolYear } = req.query;
    if (!schoolYear) {
      return res.status(400).json({ success: false, message: "Cần cung cấp năm học" });
    }

    const reg = await EmulationRegistration.findOne({
      user: req.user._id,
      schoolYear: schoolYear.trim(),
    })
      .populate("department", "departmentName departmentCode")
      .populate("position", "positionName positionCode")
      .populate("titles")
      .populate("attachedFiles.documentType");

    res.status(200).json({ success: true, data: reg });
  } catch (error) {
    console.error("Lỗi getMyRegistration:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

// Lấy chi tiết đơn theo ID
const getRegistrationById = async (req, res) => {
  try {
    const { id } = req.params;
    const reg = await EmulationRegistration.findById(id)
      .populate("user", "name email mobile avatar")
      .populate("department", "departmentName departmentCode")
      .populate("position", "positionName positionCode")
      .populate("titles")
      .populate("attachedFiles.documentType")
      .populate("managerReview.reviewedBy", "name")
      .populate("bghReview.reviewedBy", "name")
      .populate("history.actor", "name role");

    if (!reg) {
      return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ đăng ký" });
    }

    res.status(200).json({ success: true, data: reg });
  } catch (error) {
    console.error("Lỗi getRegistrationById:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

// Tạo mới hồ sơ đăng ký thi đua
const createRegistration = async (req, res) => {
  try {
    const { schoolYear, titles, attachedFiles, notes } = req.body;

    if (!schoolYear) {
      return res.status(400).json({ success: false, message: "Năm học là bắt buộc" });
    }
    if (!titles || !Array.isArray(titles) || titles.length === 0) {
      return res.status(400).json({ success: false, message: "Vui lòng chọn ít nhất một danh hiệu thi đua" });
    }

    // Lấy thông tin user hiện tại
    const user = await User.findById(req.user._id)
      .populate("department")
      .populate("position");

    // Kiểm tra xem user đã có đơn đăng ký trong năm học này chưa
    const existing = await EmulationRegistration.findOne({
      user: req.user._id,
      schoolYear: schoolYear.trim(),
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Bạn đã có đơn đăng ký thi đua cho năm học ${schoolYear}. Vui lòng cập nhật đơn hiện có thay vì tạo mới.`,
        data: existing,
      });
    }

    const reg = await EmulationRegistration.create({
      user: user._id,
      name: user.name,
      department: user.department?._id || user.department,
      departmentName: user.department?.departmentName || "",
      position: user.position?._id || user.position,
      positionName: user.position?.positionName || "",
      schoolYear: schoolYear.trim(),
      titles: titles,
      attachedFiles: Array.isArray(attachedFiles) ? attachedFiles : [],
      notes: notes || "",
      status: "PENDING",
      history: [
        {
          action: "CREATED",
          actor: user._id,
          actorName: user.name,
          actorRole: user.role,
          details: `Đăng ký danh hiệu cho năm học ${schoolYear.trim()}`,
          timestamp: new Date(),
        },
      ],
    });

    const populated = await EmulationRegistration.findById(reg._id)
      .populate("titles")
      .populate("attachedFiles.documentType");

    res.status(201).json({
      success: true,
      message: "Gửi đơn đăng ký thi đua thành công",
      data: populated,
    });
  } catch (error) {
    console.error("Lỗi createRegistration:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

// Cập nhật hồ sơ đăng ký
const updateRegistration = async (req, res) => {
  try {
    const { id } = req.params;
    const { titles, attachedFiles, notes, schoolYear } = req.body;

    const reg = await EmulationRegistration.findById(id);
    if (!reg) {
      return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ đăng ký" });
    }

    const isOwner = String(reg.user) === String(req.user._id);
    const isBGH = isUserBGH(req.user);

    // Chỉ cho phép sửa khi chưa được BGH công nhận hoặc người có thẩm quyền
    if (!isOwner && !isBGH) {
      return res.status(403).json({ success: false, message: "Bạn không có quyền sửa hồ sơ này" });
    }

    if (reg.status === "SCHOOL_APPROVED" && !isBGH) {
      return res.status(400).json({
        success: false,
        message: "Hồ sơ đã được Ban Giám hiệu phê duyệt công nhận, không thể chỉnh sửa.",
      });
    }

    if (titles && Array.isArray(titles)) reg.titles = titles;
    if (attachedFiles && Array.isArray(attachedFiles)) reg.attachedFiles = attachedFiles;
    if (notes !== undefined) reg.notes = notes;
    if (schoolYear) reg.schoolYear = schoolYear.trim();

    // Nếu hồ sơ trước đó bị REJECTED thì khi người dùng sửa và gửi lại, chuyển về PENDING
    if (reg.status === "REJECTED" && isOwner) {
      reg.status = "PENDING";
      reg.managerReview.status = "PENDING";
      reg.bghReview.status = "PENDING";
    }

    reg.history.push({
      action: "UPDATED",
      actor: req.user._id,
      actorName: req.user.name,
      actorRole: req.user.role,
      details: "Cập nhật lại thông tin hồ sơ đăng ký",
      timestamp: new Date(),
    });

    await reg.save();

    const populated = await EmulationRegistration.findById(reg._id)
      .populate("titles")
      .populate("attachedFiles.documentType");

    res.status(200).json({
      success: true,
      message: "Cập nhật hồ sơ đăng ký thành công",
      data: populated,
    });
  } catch (error) {
    console.error("Lỗi updateRegistration:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

// Xóa hồ sơ đăng ký
const deleteRegistration = async (req, res) => {
  try {
    const { id } = req.params;
    const reg = await EmulationRegistration.findById(id);
    if (!reg) {
      return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ đăng ký" });
    }

    const isOwner = String(reg.user) === String(req.user._id);
    const isBGH = isUserBGH(req.user);

    if (!isOwner && !isBGH) {
      return res.status(403).json({ success: false, message: "Bạn không có quyền xóa hồ sơ này" });
    }

    if (reg.status === "SCHOOL_APPROVED" && !isBGH) {
      return res.status(400).json({
        success: false,
        message: "Hồ sơ đã được phê duyệt công nhận, không thể xóa.",
      });
    }

    await EmulationRegistration.findByIdAndDelete(id);
    res.status(200).json({ success: true, message: "Xóa hồ sơ đăng ký thành công" });
  } catch (error) {
    console.error("Lỗi deleteRegistration:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

// Xét duyệt hồ sơ theo quy trình 2 cấp:
// 1. Quản lý/Trưởng đơn vị xem xét & chuyển lên BGH (MANAGER_SUBMIT_BGH) hoặc từ chối (MANAGER_REJECT)
// 2. Ban Giám hiệu công nhận (BGH_APPROVE) hoặc từ chối (BGH_REJECT)
const reviewRegistration = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, note } = req.body;

    const reg = await EmulationRegistration.findById(id);
    if (!reg) {
      return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ đăng ký" });
    }

    const currentUser = await User.findById(req.user._id)
      .populate("department")
      .populate("position");

    const isBGH = isUserBGH(currentUser);
    const isManager =
      ["manager", "cappho", "staff"].includes(currentUser.role) &&
      String(currentUser.department?._id || currentUser.department) === String(reg.department);

    if (action === "MANAGER_SUBMIT_BGH") {
      if (!isManager && !isBGH) {
        return res.status(403).json({
          success: false,
          message: "Chỉ Cấp trưởng/Quản lý đơn vị mới có quyền duyệt và chuyển hồ sơ lên BGH",
        });
      }

      reg.status = "SUBMITTED_TO_BGH";
      reg.managerReview = {
        status: "APPROVED",
        reviewedBy: currentUser._id,
        reviewedByName: currentUser.name,
        reviewedAt: new Date(),
        note: note || "Đã duyệt và chuyển hồ sơ lên Ban Giám hiệu",
      };

      reg.history.push({
        action: "MANAGER_SUBMIT_BGH",
        actor: currentUser._id,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        details: `Quản lý đơn vị duyệt và gửi lên Ban Giám hiệu${note ? `: ${note}` : ""}`,
        timestamp: new Date(),
      });
    } else if (action === "MANAGER_REJECT") {
      if (!isManager && !isBGH) {
        return res.status(403).json({
          success: false,
          message: "Chỉ Cấp trưởng/Quản lý đơn vị mới có quyền từ chối hồ sơ này",
        });
      }

      reg.status = "REJECTED";
      reg.managerReview = {
        status: "REJECTED",
        reviewedBy: currentUser._id,
        reviewedByName: currentUser.name,
        reviewedAt: new Date(),
        note: note || "Hồ sơ chưa đạt yêu cầu của đơn vị",
      };

      reg.history.push({
        action: "MANAGER_REJECT",
        actor: currentUser._id,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        details: `Quản lý đơn vị từ chối: ${note || "Chưa đạt yêu cầu"}`,
        timestamp: new Date(),
      });
    } else if (action === "BGH_APPROVE") {
      if (!isBGH) {
        return res.status(403).json({
          success: false,
          message: "Chỉ Ban Giám hiệu / Quản trị viên mới có quyền phê duyệt công nhận",
        });
      }

      reg.status = "SCHOOL_APPROVED";
      reg.bghReview = {
        status: "APPROVED",
        reviewedBy: currentUser._id,
        reviewedByName: currentUser.name,
        reviewedAt: new Date(),
        note: note || "Ban Giám hiệu công nhận đạt danh hiệu thi đua",
      };

      reg.history.push({
        action: "BGH_APPROVE",
        actor: currentUser._id,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        details: `Ban Giám hiệu công nhận phê duyệt${note ? `: ${note}` : ""}`,
        timestamp: new Date(),
      });
    } else if (action === "BGH_REJECT") {
      if (!isBGH) {
        return res.status(403).json({
          success: false,
          message: "Chỉ Ban Giám hiệu / Quản trị viên mới có quyền từ chối hồ sơ này",
        });
      }

      reg.status = "REJECTED";
      reg.bghReview = {
        status: "REJECTED",
        reviewedBy: currentUser._id,
        reviewedByName: currentUser.name,
        reviewedAt: new Date(),
        note: note || "Ban Giám hiệu không công nhận",
      };

      reg.history.push({
        action: "BGH_REJECT",
        actor: currentUser._id,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        details: `Ban Giám hiệu từ chối: ${note || "Không đạt tiêu chuẩn"}`,
        timestamp: new Date(),
      });
    } else {
      return res.status(400).json({ success: false, message: "Hành động xét duyệt không hợp lệ" });
    }

    await reg.save();

    const updated = await EmulationRegistration.findById(reg._id)
      .populate("titles")
      .populate("attachedFiles.documentType")
      .populate("managerReview.reviewedBy", "name")
      .populate("bghReview.reviewedBy", "name");

    res.status(200).json({
      success: true,
      message: "Cập nhật trạng thái xét duyệt thành công",
      data: updated,
    });
  } catch (error) {
    console.error("Lỗi reviewRegistration:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

// Thống kê số liệu đăng ký thi đua
const getEmulationStats = async (req, res) => {
  try {
    const { schoolYear } = req.query;
    const filter = {};
    if (schoolYear) {
      filter.schoolYear = schoolYear;
    }

    const allRegs = await EmulationRegistration.find(filter)
      .populate("titles", "code name level targetType")
      .populate("department", "departmentName departmentCode");

    const total = allRegs.length;
    const byStatus = {
      PENDING: 0,
      SUBMITTED_TO_BGH: 0,
      SCHOOL_APPROVED: 0,
      REJECTED: 0,
    };

    const byTitle = {};
    const byDepartment = {};

    allRegs.forEach((r) => {
      // Status
      if (byStatus[r.status] !== undefined) {
        byStatus[r.status]++;
      }

      // Titles
      if (Array.isArray(r.titles)) {
        r.titles.forEach((t) => {
          const tName = t.name || "Khác";
          byTitle[tName] = (byTitle[tName] || 0) + 1;
        });
      }

      // Department
      const dName = r.department?.departmentName || r.departmentName || "Chưa phân khoa/phòng";
      byDepartment[dName] = (byDepartment[dName] || 0) + 1;
    });

    // Chuyển format cho biểu đồ Recharts
    const titleChartData = Object.keys(byTitle).map((key) => ({
      name: key,
      count: byTitle[key],
    }));

    const deptChartData = Object.keys(byDepartment).map((key) => ({
      name: key,
      count: byDepartment[key],
    }));

    res.status(200).json({
      success: true,
      data: {
        total,
        byStatus,
        byTitle: titleChartData,
        byDepartment: deptChartData,
      },
    });
  } catch (error) {
    console.error("Lỗi getEmulationStats:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

module.exports = {
  uploadEmulationFile,
  getAllRegistrations,
  getMyRegistration,
  getRegistrationById,
  createRegistration,
  updateRegistration,
  deleteRegistration,
  reviewRegistration,
  getEmulationStats,
};
