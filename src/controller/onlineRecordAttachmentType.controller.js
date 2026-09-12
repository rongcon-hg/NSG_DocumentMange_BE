const OnlineRecordAttachmentType = require("../models/onlineRecordAttachmentType.model");
const OnlineRecordCategory = require("../models/onlineRecordCategory.model");

// Lấy danh sách danh mục file đính kèm
const getAllAttachmentTypes = async (req, res) => {
  try {
    const { categoryId, activeOnly } = req.query;
    const filter = {};
    if (activeOnly === "true") {
      filter.isActive = true;
    }

    if (categoryId) {
      // Tìm các loại file áp dụng riêng cho categoryId này HOẶC áp dụng chung cho tất cả (applicableCategories rỗng)
      filter.$or = [
        { applicableCategories: { $size: 0 } },
        { applicableCategories: categoryId },
      ];
    }

    const list = await OnlineRecordAttachmentType.find(filter)
      .populate("applicableCategories", "code name")
      .sort({ displayOrder: 1, createdAt: 1 });

    res.status(200).json({ success: true, data: list });
  } catch (error) {
    console.error("Lỗi getAllAttachmentTypes:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

// Tạo mới danh mục file đính kèm
const createAttachmentType = async (req, res) => {
  try {
    const {
      code,
      name,
      applicableCategories,
      isRequired,
      allowedExtensions,
      description,
      displayOrder,
      isActive,
    } = req.body;

    if (!code || !name) {
      return res.status(400).json({ success: false, message: "Mã và Tên loại file là bắt buộc" });
    }

    const cleanCode = code.trim().toUpperCase();
    const existing = await OnlineRecordAttachmentType.findOne({ code: cleanCode });
    if (existing) {
      return res.status(400).json({ success: false, message: "Mã loại file đã tồn tại trong hệ thống" });
    }

    const newType = await OnlineRecordAttachmentType.create({
      code: cleanCode,
      name: name.trim(),
      applicableCategories: Array.isArray(applicableCategories) ? applicableCategories : [],
      isRequired: Boolean(isRequired),
      allowedExtensions: allowedExtensions || ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg",
      description: description || "",
      displayOrder: Number(displayOrder) || 0,
      isActive: isActive !== undefined ? isActive : true,
      createdBy: req.user?.userId || req.user?._id,
    });

    res.status(201).json({
      success: true,
      message: "Thêm danh mục file đính kèm thành công",
      data: newType,
    });
  } catch (error) {
    console.error("Lỗi createAttachmentType:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

// Cập nhật danh mục file đính kèm
const updateAttachmentType = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      code,
      name,
      applicableCategories,
      isRequired,
      allowedExtensions,
      description,
      displayOrder,
      isActive,
    } = req.body;

    const attachmentType = await OnlineRecordAttachmentType.findById(id);
    if (!attachmentType) {
      return res.status(404).json({ success: false, message: "Không tìm thấy loại file" });
    }

    if (code) {
      const cleanCode = code.trim().toUpperCase();
      const existing = await OnlineRecordAttachmentType.findOne({
        code: cleanCode,
        _id: { $ne: id },
      });
      if (existing) {
        return res.status(400).json({ success: false, message: "Mã loại file đã bị trùng lặp" });
      }
      attachmentType.code = cleanCode;
    }

    if (name) attachmentType.name = name.trim();
    if (applicableCategories !== undefined) {
      attachmentType.applicableCategories = Array.isArray(applicableCategories)
        ? applicableCategories
        : [];
    }
    if (isRequired !== undefined) attachmentType.isRequired = Boolean(isRequired);
    if (allowedExtensions !== undefined) attachmentType.allowedExtensions = allowedExtensions;
    if (description !== undefined) attachmentType.description = description;
    if (displayOrder !== undefined) attachmentType.displayOrder = Number(displayOrder);
    if (isActive !== undefined) attachmentType.isActive = Boolean(isActive);

    await attachmentType.save();

    res.status(200).json({
      success: true,
      message: "Cập nhật loại file thành công",
      data: attachmentType,
    });
  } catch (error) {
    console.error("Lỗi updateAttachmentType:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

// Xóa danh mục file đính kèm
const deleteAttachmentType = async (req, res) => {
  try {
    const { id } = req.params;
    const attachmentType = await OnlineRecordAttachmentType.findById(id);
    if (!attachmentType) {
      return res.status(404).json({ success: false, message: "Không tìm thấy loại file" });
    }

    await OnlineRecordAttachmentType.findByIdAndDelete(id);

    res.status(200).json({ success: true, message: "Đã xóa loại file đính kèm thành công" });
  } catch (error) {
    console.error("Lỗi deleteAttachmentType:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

// Nạp danh mục mẫu file đính kèm ban đầu
const initDefaultAttachmentTypes = async (req, res) => {
  try {
    const defaults = [
      {
        code: "DON_DE_NGHI",
        name: "Đơn đề nghị / Bản khai theo mẫu (PDF/Word)",
        isRequired: true,
        allowedExtensions: ".pdf,.doc,.docx",
        description: "Đơn có chữ ký của người nộp và xác nhận nếu có",
        displayOrder: 1,
      },
      {
        code: "MINH_CHUNG_DUNG_CHUNG",
        name: "Giấy tờ / Hồ sơ minh chứng liên quan",
        isRequired: false,
        allowedExtensions: ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg",
        description: "Các văn bằng, chứng chỉ, quyết định, hóa đơn chứng từ liên quan",
        displayOrder: 2,
      },
      {
        code: "BIEN_BAN_HOP",
        name: "Biên bản họp / Đánh giá nhận xét của đơn vị",
        isRequired: false,
        allowedExtensions: ".pdf,.doc,.docx",
        description: "Biên bản họp lấy ý kiến hoặc đánh giá của lãnh đạo đơn vị trực tiếp",
        displayOrder: 3,
      },
    ];

    let count = 0;
    for (const item of defaults) {
      const existing = await OnlineRecordAttachmentType.findOne({ code: item.code });
      if (!existing) {
        await OnlineRecordAttachmentType.create(item);
        count++;
      }
    }

    res.status(200).json({
      success: true,
      message: `Đã khởi tạo thành công ${count} loại file đính kèm mẫu`,
    });
  } catch (error) {
    console.error("Lỗi initDefaultAttachmentTypes:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

module.exports = {
  getAllAttachmentTypes,
  createAttachmentType,
  updateAttachmentType,
  deleteAttachmentType,
  initDefaultAttachmentTypes,
};
