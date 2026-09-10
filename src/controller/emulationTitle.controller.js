const EmulationTitle = require("../models/emulationTitle.model");
const EmulationRegistration = require("../models/emulationRegistration.model");

// Lấy danh sách danh hiệu thi đua
const getAllTitles = async (req, res) => {
  try {
    const { activeOnly, targetType, level } = req.query;
    const filter = {};

    if (activeOnly === "true") {
      filter.isActive = true;
    }
    if (targetType) {
      filter.targetType = { $in: [targetType, "CA_HAI"] };
    }
    if (level) {
      filter.level = level;
    }

    const titles = await EmulationTitle.find(filter).sort({
      displayOrder: 1,
      createdAt: 1,
    });
    res.status(200).json({ success: true, data: titles });
  } catch (error) {
    console.error("Lỗi getAllTitles:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

// Tạo mới danh hiệu
const createTitle = async (req, res) => {
  try {
    const { code, name, level, targetType, description, displayOrder, isActive } = req.body;

    if (!code || !name) {
      return res.status(400).json({ success: false, message: "Mã và Tên danh hiệu là bắt buộc" });
    }

    const cleanCode = code.trim().toUpperCase();
    const existing = await EmulationTitle.findOne({ code: cleanCode });
    if (existing) {
      return res.status(400).json({ success: false, message: "Mã danh hiệu đã tồn tại trong hệ thống" });
    }

    const title = await EmulationTitle.create({
      code: cleanCode,
      name: name.trim(),
      level: level || "CO_SO",
      targetType: targetType || "CA_NHAN",
      description: description || "",
      displayOrder: Number(displayOrder) || 0,
      isActive: isActive !== undefined ? isActive : true,
    });

    res.status(201).json({ success: true, message: "Thêm danh hiệu thành công", data: title });
  } catch (error) {
    console.error("Lỗi createTitle:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

// Cập nhật danh hiệu
const updateTitle = async (req, res) => {
  try {
    const { id } = req.params;
    const { code, name, level, targetType, description, displayOrder, isActive } = req.body;

    const title = await EmulationTitle.findById(id);
    if (!title) {
      return res.status(404).json({ success: false, message: "Không tìm thấy danh hiệu" });
    }

    if (code) {
      const cleanCode = code.trim().toUpperCase();
      const existing = await EmulationTitle.findOne({ code: cleanCode, _id: { $ne: id } });
      if (existing) {
        return res.status(400).json({ success: false, message: "Mã danh hiệu đã bị trùng lặp" });
      }
      title.code = cleanCode;
    }

    if (name) title.name = name.trim();
    if (level) title.level = level;
    if (targetType) title.targetType = targetType;
    if (description !== undefined) title.description = description;
    if (displayOrder !== undefined) title.displayOrder = Number(displayOrder);
    if (isActive !== undefined) title.isActive = isActive;

    await title.save();
    res.status(200).json({ success: true, message: "Cập nhật danh hiệu thành công", data: title });
  } catch (error) {
    console.error("Lỗi updateTitle:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

// Xóa danh hiệu
const deleteTitle = async (req, res) => {
  try {
    const { id } = req.params;

    // Kiểm tra xem đã có hồ sơ đăng ký nào dùng danh hiệu này chưa
    const inUseCount = await EmulationRegistration.countDocuments({ titles: id });
    if (inUseCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Không thể xóa vì đã có ${inUseCount} hồ sơ đăng ký sử dụng danh hiệu này. Bạn có thể chuyển trạng thái sang ngưng áp dụng.`,
      });
    }

    const title = await EmulationTitle.findByIdAndDelete(id);
    if (!title) {
      return res.status(404).json({ success: false, message: "Không tìm thấy danh hiệu" });
    }

    res.status(200).json({ success: true, message: "Xóa danh hiệu thành công" });
  } catch (error) {
    console.error("Lỗi deleteTitle:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

// Khởi tạo danh mục danh hiệu mẫu
const initDefaultTitles = async (req, res) => {
  try {
    const defaultTitles = [
      {
        code: "LDTT",
        name: "Lao động tiên tiến",
        level: "CO_SO",
        targetType: "CA_NHAN",
        description: "Đạt danh hiệu cá nhân hoàn thành tốt nhiệm vụ trong năm học",
        displayOrder: 1,
      },
      {
        code: "CSTDCS",
        name: "Chiến sĩ thi đua cơ sở",
        level: "CO_SO",
        targetType: "CA_NHAN",
        description: "Đạt danh hiệu Lao động tiên tiến và có sáng kiến kinh nghiệm được Hội đồng khoa học công nhận",
        displayOrder: 2,
      },
      {
        code: "TTLĐTT",
        name: "Tập thể lao động tiên tiến",
        level: "CO_SO",
        targetType: "TAP_THE",
        description: "Đạt danh hiệu tập thể hoàn thành tốt nhiệm vụ",
        displayOrder: 3,
      },
      {
        code: "TTLĐXS",
        name: "Tập thể lao động xuất sắc",
        level: "CAP_TP",
        targetType: "TAP_THE",
        description: "Đạt danh hiệu tập thể hoàn thành xuất sắc nhiệm vụ tiêu biểu cấp Thành phố",
        displayOrder: 4,
      },
      {
        code: "CSTDTP",
        name: "Chiến sĩ thi đua cấp Thành phố",
        level: "CAP_TP",
        targetType: "CA_NHAN",
        description: "Có 03 lần liên tục đạt danh hiệu Chiến sĩ thi đua cơ sở",
        displayOrder: 5,
      },
      {
        code: "BKUBND",
        name: "Bằng khen Chủ tịch UBND Thành phố",
        level: "CAP_TP",
        targetType: "CA_HAI",
        description: "Có 02 năm học liên tục đạt danh hiệu hoàn thành xuất sắc nhiệm vụ",
        displayOrder: 6,
      },
      {
        code: "BKBGD",
        name: "Bằng khen của Bộ Giáo dục và Đào tạo",
        level: "CAP_BO",
        targetType: "CA_HAI",
        description: "Thành tích tiêu biểu xuất sắc trong công tác giảng dạy và đào tạo",
        displayOrder: 7,
      },
    ];

    let createdCount = 0;
    for (const item of defaultTitles) {
      const exists = await EmulationTitle.findOne({ code: item.code });
      if (!exists) {
        await EmulationTitle.create(item);
        createdCount++;
      }
    }

    const allTitles = await EmulationTitle.find().sort({ displayOrder: 1 });
    res.status(200).json({
      success: true,
      message: `Đã khởi tạo xong. Bổ sung mới: ${createdCount} danh hiệu.`,
      data: allTitles,
    });
  } catch (error) {
    console.error("Lỗi initDefaultTitles:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

module.exports = {
  getAllTitles,
  createTitle,
  updateTitle,
  deleteTitle,
  initDefaultTitles,
};
