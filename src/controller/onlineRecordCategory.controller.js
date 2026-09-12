const OnlineRecordCategory = require("../models/onlineRecordCategory.model");
const OnlineRecordAttachmentType = require("../models/onlineRecordAttachmentType.model");

// Lấy danh sách danh mục hồ sơ
const getAllCategories = async (req, res) => {
  try {
    const { activeOnly } = req.query;
    const filter = {};
    if (activeOnly === "true") {
      filter.isActive = true;
    }

    const categories = await OnlineRecordCategory.find(filter)
      .sort({ displayOrder: 1, createdAt: 1 });

    res.status(200).json({ success: true, data: categories });
  } catch (error) {
    console.error("Lỗi getAllCategories:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

// Tạo mới danh mục hồ sơ
const createCategory = async (req, res) => {
  try {
    const { code, name, description, displayOrder, isActive } = req.body;

    if (!code || !name) {
      return res.status(400).json({ success: false, message: "Mã và Tên loại hồ sơ là bắt buộc" });
    }

    const cleanCode = code.trim().toUpperCase();
    const existing = await OnlineRecordCategory.findOne({ code: cleanCode });
    if (existing) {
      return res.status(400).json({ success: false, message: "Mã loại hồ sơ đã tồn tại trong hệ thống" });
    }

    const category = await OnlineRecordCategory.create({
      code: cleanCode,
      name: name.trim(),
      description: description || "",
      displayOrder: Number(displayOrder) || 0,
      isActive: isActive !== undefined ? isActive : true,
      createdBy: req.user?.userId || req.user?._id,
    });

    res.status(201).json({ success: true, message: "Thêm danh mục hồ sơ thành công", data: category });
  } catch (error) {
    console.error("Lỗi createCategory:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

// Cập nhật danh mục hồ sơ
const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { code, name, description, displayOrder, isActive } = req.body;

    const category = await OnlineRecordCategory.findById(id);
    if (!category) {
      return res.status(404).json({ success: false, message: "Không tìm thấy loại hồ sơ" });
    }

    if (code) {
      const cleanCode = code.trim().toUpperCase();
      const existing = await OnlineRecordCategory.findOne({
        code: cleanCode,
        _id: { $ne: id },
      });
      if (existing) {
        return res.status(400).json({ success: false, message: "Mã loại hồ sơ đã bị trùng lặp" });
      }
      category.code = cleanCode;
    }

    if (name) category.name = name.trim();
    if (description !== undefined) category.description = description;
    if (displayOrder !== undefined) category.displayOrder = Number(displayOrder);
    if (isActive !== undefined) category.isActive = Boolean(isActive);

    await category.save();

    res.status(200).json({ success: true, message: "Cập nhật loại hồ sơ thành công", data: category });
  } catch (error) {
    console.error("Lỗi updateCategory:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

// Xóa danh mục hồ sơ
const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await OnlineRecordCategory.findById(id);
    if (!category) {
      return res.status(404).json({ success: false, message: "Không tìm thấy loại hồ sơ" });
    }

    await OnlineRecordCategory.findByIdAndDelete(id);

    // Xóa liên kết trong OnlineRecordAttachmentType
    await OnlineRecordAttachmentType.updateMany(
      { applicableCategories: id },
      { $pull: { applicableCategories: id } }
    );

    res.status(200).json({ success: true, message: "Đã xóa loại hồ sơ thành công" });
  } catch (error) {
    console.error("Lỗi deleteCategory:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

// Nạp danh mục mẫu ban đầu nếu chưa có
const initDefaultCategories = async (req, res) => {
  try {
    const defaults = [
      {
        code: "HS_THU_VIEC",
        name: "Hồ sơ đánh giá hết thời gian tập sự / thử việc",
        description: "Hồ sơ dành cho giảng viên, viên chức mới hoàn thành thời gian tập sự",
        displayOrder: 1,
      },
      {
        code: "HS_BOI_DUONG",
        name: "Hồ sơ thanh toán kinh phí đào tạo, bồi dưỡng",
        description: "Hồ sơ đề nghị hỗ trợ học phí, công tác phí đào tạo nâng cao chuyên môn",
        displayOrder: 2,
      },
      {
        code: "HS_NGHI_PHEP",
        name: "Hồ sơ đề nghị nghỉ phép / nghỉ thai sản / nghỉ chế độ",
        description: "Đơn xin nghỉ chế độ và các giấy tờ minh chứng liên quan",
        displayOrder: 3,
      },
      {
        code: "HS_NCKH",
        name: "Hồ sơ đăng ký đề tài Nghiên cứu khoa học & Sáng kiến",
        description: "Thuyết minh đề tài nghiên cứu khoa học, sáng kiến cải tiến kỹ thuật cấp trường",
        displayOrder: 4,
      },
      {
        code: "HS_KHAC",
        name: "Hồ sơ hành chính nghiệp vụ khác",
        description: "Các loại hồ sơ, văn bản nộp trực tuyến khác theo yêu cầu của nhà trường",
        displayOrder: 5,
      },
    ];

    let count = 0;
    for (const item of defaults) {
      const existing = await OnlineRecordCategory.findOne({ code: item.code });
      if (!existing) {
        await OnlineRecordCategory.create(item);
        count++;
      }
    }

    res.status(200).json({
      success: true,
      message: `Đã khởi tạo thành công ${count} danh mục hồ sơ mẫu`,
    });
  } catch (error) {
    console.error("Lỗi initDefaultCategories:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

module.exports = {
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  initDefaultCategories,
};
