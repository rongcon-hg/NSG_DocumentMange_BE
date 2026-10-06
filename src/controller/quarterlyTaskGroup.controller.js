const QuarterlyTaskGroup = require("../models/quarterlyTaskGroup.model");

// Danh sách 8 nhóm nhiệm vụ chuẩn mặc định theo yêu cầu của nhà trường
const DEFAULT_QUARTERLY_TASK_GROUPS = [
  {
    code: "NHOM_I",
    name: "I. CÔNG TÁC CHÍNH TRỊ - TƯ TƯỞNG",
    shortName: "Nhóm I",
    color: "blue",
    displayOrder: 1,
    description: "Công tác chính trị, tư tưởng, giáo dục truyền thống",
    isActive: true,
  },
  {
    code: "NHOM_II",
    name: "II. CÔNG TÁC QUẢN LÝ CHIẾN LƯỢC",
    shortName: "Nhóm II",
    color: "cyan",
    displayOrder: 2,
    description: "Công tác quy hoạch, chiến lược và định hướng phát triển",
    isActive: true,
  },
  {
    code: "NHOM_III",
    name: "III. QUẢN LÝ CHUYÊN MÔN",
    shortName: "Nhóm III",
    color: "purple",
    displayOrder: 3,
    description: "Công tác đào tạo, quản lý chuyên môn và nghiên cứu khoa học",
    isActive: true,
  },
  {
    code: "NHOM_IV",
    name: "IV. QUẢN LÝ TÀI LỰC",
    shortName: "Nhóm IV",
    color: "gold",
    displayOrder: 4,
    description: "Quản lý tài chính, ngân sách và nguồn lực đầu tư",
    isActive: true,
  },
  {
    code: "NHOM_V",
    name: "V. QUẢN LÝ VẬT LỰC",
    shortName: "Nhóm V",
    color: "orange",
    displayOrder: 5,
    description: "Cơ sở vật chất, trang thiết bị và hạ tầng kỹ thuật",
    isActive: true,
  },
  {
    code: "NHOM_VI",
    name: "VI. QUẢN LÝ HỌC SINH SINH VIÊN",
    shortName: "Nhóm VI",
    color: "green",
    displayOrder: 6,
    description: "Công tác quản lý, hỗ trợ và phong trào học sinh sinh viên",
    isActive: true,
  },
  {
    code: "NHOM_VII",
    name: "VII. QUẢN LÝ NHÂN LỰC",
    shortName: "Nhóm VII",
    color: "geekblue",
    displayOrder: 7,
    description: "Tổ chức cán bộ, nhân sự, đào tạo bồi dưỡng đội ngũ",
    isActive: true,
  },
  {
    code: "NHOM_VIII",
    name: "VIII. HOẠT ĐỘNG ĐOÀN THỂ",
    shortName: "Nhóm VIII",
    color: "magenta",
    displayOrder: 8,
    description: "Hoạt động công đoàn, đoàn thanh niên và các tổ chức đoàn thể",
    isActive: true,
  },
];

// Tự động khởi tạo dữ liệu mẫu nếu chưa có dữ liệu trong DB
const ensureDefaultData = async () => {
  try {
    const count = await QuarterlyTaskGroup.countDocuments();
    if (count === 0) {
      await QuarterlyTaskGroup.insertMany(DEFAULT_QUARTERLY_TASK_GROUPS);
      console.log("Đã tự động khởi tạo 8 nhóm nhiệm vụ kế hoạch quý mặc định");
    }
  } catch (err) {
    console.error("Lỗi ensureDefaultData QuarterlyTaskGroup:", err);
  }
};

// Lấy danh sách Trục công việc / Nhóm nhiệm vụ cho Kế hoạch quý
const getAllQuarterlyTaskGroups = async (req, res) => {
  try {
    await ensureDefaultData();

    const { activeOnly } = req.query;
    const filter = {};
    if (activeOnly === "true") {
      filter.isActive = true;
    }

    const items = await QuarterlyTaskGroup.find(filter).sort({ displayOrder: 1, createdAt: 1 });
    res.status(200).json({ success: true, data: items });
  } catch (error) {
    console.error("Lỗi getAllQuarterlyTaskGroups:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

// Tạo mới Trục công việc / Nhóm nhiệm vụ
const createQuarterlyTaskGroup = async (req, res) => {
  try {
    const { code, name, shortName, color, description, displayOrder, isActive } = req.body;

    if (!code || !name) {
      return res.status(400).json({ success: false, message: "Mã và Tên nhóm nhiệm vụ là bắt buộc" });
    }

    const cleanCode = code.trim().toUpperCase();
    const existing = await QuarterlyTaskGroup.findOne({ code: cleanCode });
    if (existing) {
      return res.status(400).json({ success: false, message: "Mã nhóm nhiệm vụ này đã tồn tại trong hệ thống" });
    }

    const newItem = await QuarterlyTaskGroup.create({
      code: cleanCode,
      name: name.trim(),
      shortName: shortName ? shortName.trim() : "",
      color: color || "blue",
      description: description ? description.trim() : "",
      displayOrder: Number(displayOrder) || 0,
      isActive: isActive !== undefined ? isActive : true,
      createdBy: req.user?.userId || req.user?._id,
    });

    res.status(201).json({ success: true, message: "Thêm nhóm nhiệm vụ thành công", data: newItem });
  } catch (error) {
    console.error("Lỗi createQuarterlyTaskGroup:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

// Cập nhật Trục công việc / Nhóm nhiệm vụ
const updateQuarterlyTaskGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const { code, name, shortName, color, description, displayOrder, isActive } = req.body;

    const item = await QuarterlyTaskGroup.findById(id);
    if (!item) {
      return res.status(404).json({ success: false, message: "Không tìm thấy nhóm nhiệm vụ" });
    }

    if (code) {
      const cleanCode = code.trim().toUpperCase();
      const existing = await QuarterlyTaskGroup.findOne({
        code: cleanCode,
        _id: { $ne: id },
      });
      if (existing) {
        return res.status(400).json({ success: false, message: "Mã nhóm nhiệm vụ này đã tồn tại" });
      }
      item.code = cleanCode;
    }

    if (name) item.name = name.trim();
    if (shortName !== undefined) item.shortName = shortName.trim();
    if (color !== undefined) item.color = color;
    if (description !== undefined) item.description = description.trim();
    if (displayOrder !== undefined) item.displayOrder = Number(displayOrder);
    if (isActive !== undefined) item.isActive = isActive;

    await item.save();

    res.status(200).json({ success: true, message: "Cập nhật nhóm nhiệm vụ thành công", data: item });
  } catch (error) {
    console.error("Lỗi updateQuarterlyTaskGroup:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

// Xóa Trục công việc / Nhóm nhiệm vụ
const deleteQuarterlyTaskGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await QuarterlyTaskGroup.findById(id);
    if (!item) {
      return res.status(404).json({ success: false, message: "Không tìm thấy nhóm nhiệm vụ" });
    }

    await QuarterlyTaskGroup.findByIdAndDelete(id);
    res.status(200).json({ success: true, message: "Đã xóa nhóm nhiệm vụ thành công" });
  } catch (error) {
    console.error("Lỗi deleteQuarterlyTaskGroup:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

// Khôi phục 8 nhóm chuẩn mặc định
const resetDefaultQuarterlyTaskGroups = async (req, res) => {
  try {
    for (const group of DEFAULT_QUARTERLY_TASK_GROUPS) {
      await QuarterlyTaskGroup.findOneAndUpdate(
        { code: group.code },
        { $set: group },
        { upsert: true, new: true }
      );
    }
    const all = await QuarterlyTaskGroup.find().sort({ displayOrder: 1, createdAt: 1 });
    res.status(200).json({
      success: true,
      message: "Đã đồng bộ lại 8 nhóm nhiệm vụ chuẩn mặc định",
      data: all,
    });
  } catch (error) {
    console.error("Lỗi resetDefaultQuarterlyTaskGroups:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

module.exports = {
  getAllQuarterlyTaskGroups,
  createQuarterlyTaskGroup,
  updateQuarterlyTaskGroup,
  deleteQuarterlyTaskGroup,
  resetDefaultQuarterlyTaskGroups,
};
