const { google } = require("googleapis");
const { Readable } = require("stream");
const OnlineRecord = require("../models/onlineRecord.model");
const OnlineRecordCategory = require("../models/onlineRecordCategory.model");
const OnlineRecordAttachmentType = require("../models/onlineRecordAttachmentType.model");
const User = require("../models/user.model");
const Department = require("../models/department.model");
const Position = require("../models/position.model");
const DriveConfig = require("../models/driveConfig.model");

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

// Helper: Get or create Hồ sơ trực tuyến folder trên Drive
async function getOrCreateRecordsFolder(drive) {
  const config = await DriveConfig.findOne();
  const parentId = config?.folderId || process.env.DRIVE_FOLDER_ID;
  if (!parentId) throw new Error("Chưa cấu hình folderId trên Google Drive.");

  const folderName = "HoSoTrucTuyen";
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
    console.error("Lỗi getOrCreateRecordsFolder:", err);
    return parentId;
  }
}

// Upload file đính kèm lên Google Drive
const uploadRecordFile = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: "Không có file nào được tải lên" });
    }

    const auth = await authorizeDrive();
    const drive = google.drive({ version: "v3", auth });
    const targetFolderId = await getOrCreateRecordsFolder(drive);

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
    console.error("Lỗi uploadRecordFile:", error);
    res.status(500).json({ success: false, message: "Lỗi tải file", error: error.message });
  }
};

// Lấy danh sách hồ sơ (có phân trang, tìm kiếm, lọc theo người gửi hoặc người nhận)
const getRecords = async (req, res) => {
  try {
    const currentUserId = req.user?.userId || req.user?._id;
    const currentUserRole = req.user?.role;
    const {
      page = 1,
      limit = 20,
      search,
      status,
      category,
      department,
      startDate,
      endDate,
      isExport,
      type = "all", // "all", "sent" (hồ sơ tôi gửi), "received" (hồ sơ gửi đến tôi)
    } = req.query;

    const query = {};
    const andConditions = [];

    // Phân loại hồ sơ theo vai trò và tab
    const isAdminOrManager = currentUserRole === "admin" || currentUserRole === "manager";

    if (type === "sent") {
      andConditions.push({ sender: currentUserId });
    } else if (type === "received") {
      andConditions.push({ recipients: currentUserId });
    } else {
      // type === "all"
      if (!isAdminOrManager) {
        // Người dùng thông thường: xem hồ sơ mình gửi HOẶC hồ sơ gửi đích danh đến mình
        andConditions.push({
          $or: [{ sender: currentUserId }, { recipients: currentUserId }],
        });
      }
    }

    if (status) query.status = status;
    if (category) query.category = category;
    if (department) query.department = department;

    // Lọc theo khoảng thời gian gửi hồ sơ
    if (startDate || endDate) {
      const dateFilter = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        dateFilter.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
      }
      query.createdAt = dateFilter;
    }

    if (search) {
      const regex = new RegExp(search.trim(), "i");
      andConditions.push({
        $or: [
          { recordCode: regex },
          { title: regex },
          { fullName: regex },
          { departmentName: regex },
        ],
      });
    }

    if (andConditions.length > 0) {
      query.$and = andConditions;
    }

    const pageNum = parseInt(page, 10);
    const limitNum = isExport === "true" || isExport === true ? 10000 : parseInt(limit, 10);
    const skip = isExport === "true" || isExport === true ? 0 : (pageNum - 1) * limitNum;

    const [records, total] = await Promise.all([
      OnlineRecord.find(query)
        .populate("category", "code name")
        .populate("sender", "name email avatar")
        .populate("recipients", "name email avatar position department")
        .populate("attachedFiles.attachmentType", "name code")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      OnlineRecord.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: records,
      total,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Lỗi getRecords:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

// Lấy chi tiết hồ sơ
const getRecordById = async (req, res) => {
  try {
    const { id } = req.params;
    const record = await OnlineRecord.findById(id)
      .populate("category", "code name description")
      .populate("sender", "name email avatar phoneNumber department position")
      .populate("recipients", "name email avatar position department")
      .populate("reviewedBy", "name email avatar")
      .populate("attachedFiles.attachmentType", "code name isRequired allowedExtensions");

    if (!record) {
      return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ" });
    }

    res.status(200).json({ success: true, data: record });
  } catch (error) {
    console.error("Lỗi getRecordById:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

// Tạo mới hồ sơ trực tuyến
const createRecord = async (req, res) => {
  try {
    const currentUserId = req.user?.userId || req.user?._id;
    const {
      categoryId,
      title,
      note,
      recipients,
      attachedFiles,
      fullName,
      positionName,
      departmentName,
      phoneNumber,
      email,
    } = req.body;

    if (!categoryId || !title || !recipients || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng điền đầy đủ loại hồ sơ, tiêu đề và người nhận",
      });
    }

    const categoryDoc = await OnlineRecordCategory.findById(categoryId);
    if (!categoryDoc) {
      return res.status(400).json({ success: false, message: "Loại hồ sơ không hợp lệ" });
    }

    // Lấy danh sách người nhận và khởi tạo trạng thái duyệt riêng lẻ cho từng người
    const recipientUsers = await User.find({ _id: { $in: recipients } }).select("name role");
    const recipientNames = recipientUsers.map((u) => u.name);
    const recipientReviews = recipientUsers.map((u) => ({
      user: u._id,
      userName: u.name,
      userRole: u.role || "recipient",
      status: "PENDING",
      reviewOpinion: "",
    }));

    // Lấy thông tin user hiện tại nếu frontend chưa gửi kèm đầy đủ
    let senderName = fullName;
    let senderPos = positionName;
    let senderDept = departmentName;
    let senderPhone = phoneNumber;
    let senderEmail = email;

    const userDoc = await User.findById(currentUserId)
      .populate("department", "departmentName")
      .populate("position", "positionName");

    if (userDoc) {
      senderName = senderName || userDoc.name;
      senderPos = senderPos || userDoc.position?.positionName || "";
      senderDept = senderDept || userDoc.department?.departmentName || "";
      senderPhone = senderPhone || userDoc.phoneNumber || "";
      senderEmail = senderEmail || userDoc.email || "";
    }

    const historyEntry = {
      action: "CREATED",
      actor: currentUserId,
      actorName: senderName,
      actorRole: req.user?.role || "user",
      details: "Tạo mới và gửi hồ sơ trực tuyến",
      timestamp: new Date(),
    };

    const newRecord = new OnlineRecord({
      sender: currentUserId,
      fullName: senderName,
      position: userDoc?.position?._id,
      positionName: senderPos,
      department: userDoc?.department?._id,
      departmentName: senderDept,
      phoneNumber: senderPhone,
      email: senderEmail,
      category: categoryId,
      categoryName: categoryDoc.name,
      title: title.trim(),
      note: note || "",
      recipients,
      recipientNames,
      recipientReviews,
      attachedFiles: Array.isArray(attachedFiles) ? attachedFiles : [],
      status: "PENDING",
      history: [historyEntry],
    });

    await newRecord.save();

    res.status(201).json({
      success: true,
      message: "Gửi hồ sơ trực tuyến thành công!",
      data: newRecord,
    });
  } catch (error) {
    console.error("Lỗi createRecord:", error);
    res.status(500).json({ success: false, message: "Lỗi gửi hồ sơ", error: error.message });
  }
};

// Cập nhật hồ sơ (chỉ khi hồ sơ đang PENDING hoặc REJECTED và người sửa là người tạo)
const updateRecord = async (req, res) => {
  try {
    const currentUserId = req.user?.userId || req.user?._id;
    const currentUserRole = req.user?.role;
    const { id } = req.params;
    const {
      categoryId,
      title,
      note,
      recipients,
      attachedFiles,
    } = req.body;

    const record = await OnlineRecord.findById(id);
    if (!record) {
      return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ" });
    }

    const isOwner = String(record.sender) === String(currentUserId);
    const isAdmin = currentUserRole === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: "Bạn không có quyền chỉnh sửa hồ sơ này" });
    }

    if (categoryId) {
      const catDoc = await OnlineRecordCategory.findById(categoryId);
      if (catDoc) {
        record.category = categoryId;
        record.categoryName = catDoc.name;
      }
    }

    if (title) record.title = title.trim();
    if (note !== undefined) record.note = note;

    if (recipients && recipients.length > 0) {
      record.recipients = recipients;
      const recipientUsers = await User.find({ _id: { $in: recipients } }).select("name");
      record.recipientNames = recipientUsers.map((u) => u.name);
    }

    if (attachedFiles) {
      record.attachedFiles = attachedFiles;
    }

    // Nếu hồ sơ đang bị trả lại (REJECTED), khi người dùng cập nhật nộp lại -> chuyển về PENDING
    if (record.status === "REJECTED") {
      record.status = "PENDING";
    }

    const historyEntry = {
      action: "UPDATED",
      actor: currentUserId,
      actorName: req.user?.name || "Người dùng",
      actorRole: currentUserRole || "user",
      details: "Cập nhật lại thông tin và file đính kèm hồ sơ",
      timestamp: new Date(),
    };
    record.history.push(historyEntry);

    await record.save();

    res.status(200).json({
      success: true,
      message: "Cập nhật hồ sơ thành công!",
      data: record,
    });
  } catch (error) {
    console.error("Lỗi updateRecord:", error);
    res.status(500).json({ success: false, message: "Lỗi cập nhật hồ sơ", error: error.message });
  }
};

// Xử lý / Phê duyệt hồ sơ (Dành cho Người nhận hoặc Manager/Admin)
const reviewRecord = async (req, res) => {
  try {
    const currentUserId = req.user?.userId || req.user?._id;
    const currentUserRole = req.user?.role;
    const { id } = req.params;
    const { status, reviewOpinion } = req.body;

    if (!status || !["PROCESSING", "APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({ success: false, message: "Trạng thái phê duyệt không hợp lệ" });
    }

    const record = await OnlineRecord.findById(id);
    if (!record) {
      return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ" });
    }

    // Kiểm tra quyền duyệt: người nhận hồ sơ HOẶC Admin/Manager
    const isRecipient = record.recipients.some((r) => String(r) === String(currentUserId));
    const isAdminOrManager = currentUserRole === "admin" || currentUserRole === "manager";

    if (!isRecipient && !isAdminOrManager) {
      return res.status(403).json({ success: false, message: "Bạn không có thẩm quyền xử lý hồ sơ này" });
    }

    const reviewer = await User.findById(currentUserId).select("name role");
    const reviewerName = reviewer ? reviewer.name : "Người duyệt";
    const reviewerRole = currentUserRole || reviewer?.role || "reviewer";

    // 1. Cập nhật ý kiến và trạng thái của riêng người duyệt này trong recipientReviews
    if (!record.recipientReviews) {
      record.recipientReviews = [];
    }

    let reviewItem = record.recipientReviews.find(
      (r) => String(r.user) === String(currentUserId)
    );

    if (reviewItem) {
      reviewItem.status = status;
      reviewItem.reviewOpinion = reviewOpinion || "";
      reviewItem.reviewedAt = new Date();
    } else {
      // Nếu là Admin/Manager duyệt mà không nằm trong recipients ban đầu
      record.recipientReviews.push({
        user: currentUserId,
        userName: reviewerName,
        userRole: reviewerRole,
        status: status,
        reviewOpinion: reviewOpinion || "",
        reviewedAt: new Date(),
      });
    }

    // 2. Tính toán lại trạng thái tổng thể của hồ sơ
    // Nếu có ít nhất 1 người REJECTED -> hồ sơ tổng thể REJECTED
    // Nếu tất cả người nhận đều APPROVED (hoặc Admin/Manager duyệt APPROVED) -> APPROVED
    // Ngược lại nếu có người PROCESSING hoặc APPROVED một phần -> PROCESSING
    const reviews = record.recipientReviews || [];
    const hasRejected = reviews.some((r) => r.status === "REJECTED");
    const allApproved =
      reviews.length > 0 && reviews.every((r) => r.status === "APPROVED");
    const hasApprovedOrProcessing = reviews.some(
      (r) => r.status === "APPROVED" || r.status === "PROCESSING"
    );

    if (hasRejected) {
      record.status = "REJECTED";
    } else if (allApproved || (isAdminOrManager && status === "APPROVED")) {
      record.status = "APPROVED";
    } else if (hasApprovedOrProcessing) {
      record.status = "PROCESSING";
    } else {
      record.status = "PENDING";
    }

    record.reviewOpinion = reviewOpinion || "";
    record.reviewedBy = currentUserId;
    record.reviewedByName = reviewerName;
    record.reviewedAt = new Date();

    const statusMap = {
      PROCESSING: "Đang tiếp nhận xử lý",
      APPROVED: "Đã phê duyệt",
      REJECTED: "Từ chối / Yêu cầu bổ sung",
    };

    const historyEntry = {
      action: status,
      actor: currentUserId,
      actorName: reviewerName,
      actorRole: reviewerRole,
      details: `${reviewerName} (${reviewerRole === "manager" || reviewerRole === "admin" ? "Cấp Quản lý" : "Người nhận"}) ${statusMap[status]}${
        reviewOpinion ? `: ${reviewOpinion}` : ""
      }`,
      timestamp: new Date(),
    };
    record.history.push(historyEntry);

    await record.save();

    res.status(200).json({
      success: true,
      message: `Đã cập nhật trạng thái hồ sơ của bạn: ${statusMap[status]}`,
      data: record,
    });
  } catch (error) {
    console.error("Lỗi reviewRecord:", error);
    res.status(500).json({ success: false, message: "Lỗi xử lý hồ sơ", error: error.message });
  }
};

// Xóa hồ sơ
const deleteRecord = async (req, res) => {
  try {
    const currentUserId = req.user?.userId || req.user?._id;
    const currentUserRole = req.user?.role;
    const { id } = req.params;

    const record = await OnlineRecord.findById(id);
    if (!record) {
      return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ" });
    }

    const isOwner = String(record.sender) === String(currentUserId);
    const isAdmin = currentUserRole === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: "Bạn không có quyền xóa hồ sơ này" });
    }

    await OnlineRecord.findByIdAndDelete(id);

    res.status(200).json({ success: true, message: "Đã xóa hồ sơ thành công" });
  } catch (error) {
    console.error("Lỗi deleteRecord:", error);
    res.status(500).json({ success: false, message: "Lỗi xóa hồ sơ", error: error.message });
  }
};

// Lấy số lượng hồ sơ chờ xử lý (cho chuông thông báo)
const getPendingRecordCount = async (req, res) => {
  try {
    const currentUserId = req.user?.userId || req.user?._id;
    const count = await OnlineRecord.countDocuments({
      recipients: currentUserId,
      status: "PENDING",
    });

    res.status(200).json({ success: true, count });
  } catch (error) {
    console.error("Lỗi getPendingRecordCount:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

module.exports = {
  uploadRecordFile,
  getRecords,
  getRecordById,
  createRecord,
  updateRecord,
  reviewRecord,
  deleteRecord,
  getPendingRecordCount,
};
