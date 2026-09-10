const EmulationDocumentType = require("../models/emulationDocumentType.model");
const EmulationTitle = require("../models/emulationTitle.model");

// Lấy danh sách loại hồ sơ
const getAllDocumentTypes = async (req, res) => {
  try {
    const { activeOnly } = req.query;
    const filter = {};
    if (activeOnly === "true") {
      filter.isActive = true;
    }

    const docTypes = await EmulationDocumentType.find(filter)
      .populate("applicableTitles", "code name level")
      .sort({ displayOrder: 1, createdAt: 1 });

    res.status(200).json({ success: true, data: docTypes });
  } catch (error) {
    console.error("Lỗi getAllDocumentTypes:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

// Tạo mới loại hồ sơ
const createDocumentType = async (req, res) => {
  try {
    const {
      code,
      name,
      isRequired,
      applicableTitles,
      description,
      sampleFileUrl,
      displayOrder,
      isActive,
    } = req.body;

    if (!code || !name) {
      return res.status(400).json({ success: false, message: "Mã và Tên loại hồ sơ là bắt buộc" });
    }

    const cleanCode = code.trim().toUpperCase();
    const existing = await EmulationDocumentType.findOne({ code: cleanCode });
    if (existing) {
      return res.status(400).json({ success: false, message: "Mã loại hồ sơ đã tồn tại trong hệ thống" });
    }

    const docType = await EmulationDocumentType.create({
      code: cleanCode,
      name: name.trim(),
      isRequired: Boolean(isRequired),
      applicableTitles: Array.isArray(applicableTitles) ? applicableTitles : [],
      description: description || "",
      sampleFileUrl: sampleFileUrl || "",
      displayOrder: Number(displayOrder) || 0,
      isActive: isActive !== undefined ? isActive : true,
    });

    res.status(201).json({ success: true, message: "Thêm loại hồ sơ thành công", data: docType });
  } catch (error) {
    console.error("Lỗi createDocumentType:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

// Cập nhật loại hồ sơ
const updateDocumentType = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      code,
      name,
      isRequired,
      applicableTitles,
      description,
      sampleFileUrl,
      displayOrder,
      isActive,
    } = req.body;

    const docType = await EmulationDocumentType.findById(id);
    if (!docType) {
      return res.status(404).json({ success: false, message: "Không tìm thấy loại hồ sơ" });
    }

    if (code) {
      const cleanCode = code.trim().toUpperCase();
      const existing = await EmulationDocumentType.findOne({
        code: cleanCode,
        _id: { $ne: id },
      });
      if (existing) {
        return res.status(400).json({ success: false, message: "Mã loại hồ sơ đã bị trùng lặp" });
      }
      docType.code = cleanCode;
    }

    if (name) docType.name = name.trim();
    if (isRequired !== undefined) docType.isRequired = Boolean(isRequired);
    if (applicableTitles !== undefined) {
      docType.applicableTitles = Array.isArray(applicableTitles) ? applicableTitles : [];
    }
    if (description !== undefined) docType.description = description;
    if (sampleFileUrl !== undefined) docType.sampleFileUrl = sampleFileUrl;
    if (displayOrder !== undefined) docType.displayOrder = Number(displayOrder);
    if (isActive !== undefined) docType.isActive = isActive;

    await docType.save();
    res.status(200).json({ success: true, message: "Cập nhật loại hồ sơ thành công", data: docType });
  } catch (error) {
    console.error("Lỗi updateDocumentType:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

// Xóa loại hồ sơ
const deleteDocumentType = async (req, res) => {
  try {
    const { id } = req.params;
    const docType = await EmulationDocumentType.findByIdAndDelete(id);
    if (!docType) {
      return res.status(404).json({ success: false, message: "Không tìm thấy loại hồ sơ" });
    }
    res.status(200).json({ success: true, message: "Xóa loại hồ sơ thành công" });
  } catch (error) {
    console.error("Lỗi deleteDocumentType:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

// Khởi tạo danh mục hồ sơ mẫu
const initDefaultDocumentTypes = async (req, res) => {
  try {
    const defaultDocTypes = [
      {
        code: "BAN_DANG_KY",
        name: "Bản giao ước đăng ký thi đua cá nhân",
        isRequired: true,
        description: "Bản đăng ký mục tiêu, chỉ tiêu phấn đấu trong năm học (File PDF / DOCX có ký tên)",
        displayOrder: 1,
      },
      {
        code: "BC_THANH_TICH",
        name: "Báo cáo thành tích cá nhân",
        isRequired: true,
        description: "Báo cáo kết quả công tác giảng dạy, phục vụ giảng dạy và hoạt động kiêm nhiệm",
        displayOrder: 2,
      },
      {
        code: "SKKN",
        name: "Báo cáo Sáng kiến kinh nghiệm / Đề tài NCKH",
        isRequired: false,
        description: "Áp dụng cho đăng ký danh hiệu Chiến sĩ thi đua các cấp (kèm Quyết định công nhận SKKN)",
        displayOrder: 3,
      },
      {
        code: "MINH_CHUNG_KHAC",
        name: "Hồ sơ / Bằng chứng khen thưởng kèm theo",
        isRequired: false,
        description: "Các chứng nhận, bằng khen, quyết định khen thưởng các năm trước hoặc thành tích đột xuất",
        displayOrder: 4,
      },
    ];

    let createdCount = 0;
    for (const item of defaultDocTypes) {
      const exists = await EmulationDocumentType.findOne({ code: item.code });
      if (!exists) {
        await EmulationDocumentType.create(item);
        createdCount++;
      }
    }

    const all = await EmulationDocumentType.find().sort({ displayOrder: 1 });
    res.status(200).json({
      success: true,
      message: `Đã khởi tạo xong. Bổ sung mới: ${createdCount} loại hồ sơ.`,
      data: all,
    });
  } catch (error) {
    console.error("Lỗi initDefaultDocumentTypes:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

module.exports = {
  getAllDocumentTypes,
  createDocumentType,
  updateDocumentType,
  deleteDocumentType,
  initDefaultDocumentTypes,
};
