const FocusAxis = require("../models/focusAxis.model");

// Danh sách 6 trục chuẩn mặc định theo yêu cầu
const DEFAULT_FOCUS_AXES = [
  {
    code: "TRUC_1",
    name: "TRỤC 1 - THỰC HIỆN MỤC TIÊU PHÁT TRIỂN KINH TẾ - XÃ HỘI VÀ NHIỆM VỤ CHÍNH TRỊ ĐƯỢC GIAO",
    shortName: "Trục 1",
    color: "blue",
    displayOrder: 1,
    description: "Thực hiện mục tiêu phát triển kinh tế - xã hội và nhiệm vụ chính trị được giao",
    isActive: true,
  },
  {
    code: "TRUC_2",
    name: "TRỤC 2 - HOÀN THIỆN THỂ CHẾ, ĐẨY MẠNH PHÂN CẤP, PHÂN QUYỀN GẮN VỚI KIỂM TRA, GIÁM SÁT",
    shortName: "Trục 2",
    color: "cyan",
    displayOrder: 2,
    description: "Hoàn thiện thể chế, đẩy mạnh phân cấp, phân quyền gắn với kiểm tra, giám sát",
    isActive: true,
  },
  {
    code: "TRUC_3",
    name: "TRỤC 3 - THÚC ĐẨY PHÁT TRIỂN KHOA HỌC, CÔNG NGHỆ, ĐỔI MỚI SÁNG TẠO VÀ CHUYỂN ĐỔI SỐ",
    shortName: "Trục 3",
    color: "purple",
    displayOrder: 3,
    description: "Thúc đẩy phát triển khoa học, công nghệ, đổi mới sáng tạo và chuyển đổi số",
    isActive: true,
  },
  {
    code: "TRUC_4",
    name: "TRỤC 4 - XÂY DỰNG ĐẢNG VÀ HỆ THỐNG CHÍNH TRỊ TRONG SẠCH, VỮNG MẠNH; GIỮ GÌN ĐOÀN KẾT, THỐNG NHẤT NỘI BỘ; PHÒNG, CHỐNG THAM NHŨNG, LÃNG PHÍ, TIÊU CỰC",
    shortName: "Trục 4",
    color: "red",
    displayOrder: 4,
    description: "Xây dựng Đảng và hệ thống chính trị trong sạch, vững mạnh; giữ gìn đoàn kết, thống nhất nội bộ; phòng, chống tham nhũng, lãng phí, tiêu cực",
    isActive: true,
  },
  {
    code: "TRUC_5",
    name: "TRỤC 5 - PHÁT TRIỂN VĂN HÓA, CON NGƯỜI, BẢO ĐẢM AN SINH XÃ HỘI, NÂNG CAO ĐỜI SỐNG NHÂN DÂN",
    shortName: "Trục 5",
    color: "green",
    displayOrder: 5,
    description: "Phát triển văn hóa, con người, bảo đảm an sinh xã hội, nâng cao đời sống nhân dân",
    isActive: true,
  },
  {
    code: "TRUC_6",
    name: "TRỤC 6 - CỦNG CỐ QUỐC PHÒNG, AN NINH, GIỮ VỮNG ỔN ĐỊNH CHÍNH TRỊ - XÃ HỘI, NÂNG CAO HIỆU QUẢ ĐỐI NGOẠI VÀ HỘI NHẬP QUỐC TẾ",
    shortName: "Trục 6",
    color: "gold",
    displayOrder: 6,
    description: "Củng cố quốc phòng, an ninh, giữ vững ổn định chính trị - xã hội, nâng cao hiệu quả đối ngoại và hội nhập quốc tế",
    isActive: true,
  },
];

// Tự động khởi tạo dữ liệu mẫu nếu chưa có dữ liệu trong DB
const ensureDefaultData = async () => {
  try {
    const count = await FocusAxis.countDocuments();
    if (count === 0) {
      await FocusAxis.insertMany(DEFAULT_FOCUS_AXES);
      console.log("Đã tự động khởi tạo 6 trục kết quả trọng tâm mặc định");
    }
  } catch (err) {
    console.error("Lỗi ensureDefaultData FocusAxis:", err);
  }
};

// Lấy danh sách Trục kết quả
const getAllFocusAxes = async (req, res) => {
  try {
    await ensureDefaultData();

    const { activeOnly } = req.query;
    const filter = {};
    if (activeOnly === "true") {
      filter.isActive = true;
    }

    const items = await FocusAxis.find(filter).sort({ displayOrder: 1, createdAt: 1 });
    res.status(200).json({ success: true, data: items });
  } catch (error) {
    console.error("Lỗi getAllFocusAxes:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

// Tạo mới Trục kết quả
const createFocusAxis = async (req, res) => {
  try {
    const { code, name, shortName, color, description, displayOrder, isActive } = req.body;

    if (!code || !name) {
      return res.status(400).json({ success: false, message: "Mã và Tên trục kết quả là bắt buộc" });
    }

    const cleanCode = code.trim().toUpperCase();
    const existing = await FocusAxis.findOne({ code: cleanCode });
    if (existing) {
      return res.status(400).json({ success: false, message: "Mã trục kết quả này đã tồn tại trong hệ thống" });
    }

    const newItem = await FocusAxis.create({
      code: cleanCode,
      name: name.trim(),
      shortName: shortName ? shortName.trim() : "",
      color: color || "blue",
      description: description ? description.trim() : "",
      displayOrder: Number(displayOrder) || 0,
      isActive: isActive !== undefined ? isActive : true,
      createdBy: req.user?.userId || req.user?._id,
    });

    res.status(201).json({ success: true, message: "Thêm trục kết quả thành công", data: newItem });
  } catch (error) {
    console.error("Lỗi createFocusAxis:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

// Cập nhật Trục kết quả
const updateFocusAxis = async (req, res) => {
  try {
    const { id } = req.params;
    const { code, name, shortName, color, description, displayOrder, isActive } = req.body;

    const item = await FocusAxis.findById(id);
    if (!item) {
      return res.status(404).json({ success: false, message: "Không tìm thấy trục kết quả" });
    }

    if (code) {
      const cleanCode = code.trim().toUpperCase();
      const existing = await FocusAxis.findOne({
        code: cleanCode,
        _id: { $ne: id },
      });
      if (existing) {
        return res.status(400).json({ success: false, message: "Mã trục kết quả này đã tồn tại" });
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

    res.status(200).json({ success: true, message: "Cập nhật trục kết quả thành công", data: item });
  } catch (error) {
    console.error("Lỗi updateFocusAxis:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

// Xóa Trục kết quả
const deleteFocusAxis = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await FocusAxis.findById(id);
    if (!item) {
      return res.status(404).json({ success: false, message: "Không tìm thấy trục kết quả" });
    }

    await FocusAxis.findByIdAndDelete(id);
    res.status(200).json({ success: true, message: "Đã xóa trục kết quả thành công" });
  } catch (error) {
    console.error("Lỗi deleteFocusAxis:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

// Khôi phục 6 trục chuẩn mặc định
const resetDefaultFocusAxes = async (req, res) => {
  try {
    for (const axis of DEFAULT_FOCUS_AXES) {
      await FocusAxis.findOneAndUpdate(
        { code: axis.code },
        { $set: axis },
        { upsert: true, new: true }
      );
    }
    const all = await FocusAxis.find().sort({ displayOrder: 1, createdAt: 1 });
    res.status(200).json({
      success: true,
      message: "Đã đồng bộ lại 6 trục kết quả chuẩn mặc định",
      data: all,
    });
  } catch (error) {
    console.error("Lỗi resetDefaultFocusAxes:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

module.exports = {
  getAllFocusAxes,
  createFocusAxis,
  updateFocusAxis,
  deleteFocusAxis,
  resetDefaultFocusAxes,
};
