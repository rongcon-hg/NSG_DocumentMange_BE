const LegalBasis = require("../models/legalBasis.model");

/**
 * Lấy danh sách căn cứ pháp luật (hỗ trợ phân trang, lọc theo trạng thái, cơ quan, tìm kiếm)
 */
const getLegalBases = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, docType, search } = req.query;
    const query = {};

    if (status) query.status = status;
    if (docType) query.docType = docType;
    if (search) {
      query.$or = [
        { code: { $regex: search, $options: "i" } },
        { title: { $regex: search, $options: "i" } },
        { issuingAuthority: { $regex: search, $options: "i" } },
        { replacedBy: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [items, total] = await Promise.all([
      LegalBasis.find(query)
        .populate("createdBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      LegalBasis.countDocuments(query),
    ]);

    return res.json({
      success: true,
      data: items,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Lỗi getLegalBases:", error);
    return res.status(500).json({ success: false, message: "Lỗi khi lấy danh sách căn cứ pháp luật" });
  }
};

/**
 * Lấy chi tiết một căn cứ pháp luật
 */
const getLegalBasisById = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await LegalBasis.findById(id).populate("createdBy", "name email");
    if (!item) {
      return res.status(404).json({ success: false, message: "Không tìm thấy căn cứ pháp luật" });
    }
    return res.json({ success: true, data: item });
  } catch (error) {
    console.error("Lỗi getLegalBasisById:", error);
    return res.status(500).json({ success: false, message: "Lỗi khi lấy chi tiết căn cứ pháp luật" });
  }
};

/**
 * Tạo mới căn cứ pháp luật
 */
const createLegalBasis = async (req, res) => {
  try {
    const { code, title, docType, issuingAuthority, issuedDate, effectiveDate, status, replacedBy, documentUrl, notes } = req.body;
    const userId = req.user?._id || req.user?.id;

    if (!code || !title) {
      return res.status(400).json({ success: false, message: "Vui lòng nhập Số/Ký hiệu và Tên văn bản pháp luật" });
    }

    const existing = await LegalBasis.findOne({ code: code.trim() });
    if (existing) {
      return res.status(400).json({ success: false, message: `Văn bản có số hiệu "${code}" đã tồn tại trong cơ sở dữ liệu!` });
    }

    const newItem = await LegalBasis.create({
      code: code.trim(),
      title: title.trim(),
      docType: docType || "NGHI_DINH",
      issuingAuthority: issuingAuthority || "",
      issuedDate: issuedDate ? new Date(issuedDate) : null,
      effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
      status: status || "ACTIVE",
      replacedBy: replacedBy || "",
      documentUrl: documentUrl || "",
      notes: notes || "",
      createdBy: userId,
    });

    return res.status(201).json({
      success: true,
      message: "Thêm mới căn cứ pháp luật thành công",
      data: newItem,
    });
  } catch (error) {
    console.error("Lỗi createLegalBasis:", error);
    return res.status(500).json({ success: false, message: "Lỗi khi thêm căn cứ pháp luật" });
  }
};

/**
 * Cập nhật căn cứ pháp luật
 */
const updateLegalBasis = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    delete updateData._id;
    delete updateData.createdBy;

    const updated = await LegalBasis.findByIdAndUpdate(id, updateData, { new: true });
    if (!updated) {
      return res.status(404).json({ success: false, message: "Không tìm thấy căn cứ pháp luật" });
    }

    return res.json({
      success: true,
      message: "Cập nhật căn cứ pháp luật thành công",
      data: updated,
    });
  } catch (error) {
    console.error("Lỗi updateLegalBasis:", error);
    return res.status(500).json({ success: false, message: "Lỗi khi cập nhật căn cứ pháp luật" });
  }
};

/**
 * Xóa căn cứ pháp luật
 */
const deleteLegalBasis = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await LegalBasis.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Không tìm thấy căn cứ pháp luật" });
    }
    return res.json({ success: true, message: "Đã xóa căn cứ pháp luật" });
  } catch (error) {
    console.error("Lỗi deleteLegalBasis:", error);
    return res.status(500).json({ success: false, message: "Lỗi khi xóa căn cứ pháp luật" });
  }
};

/**
 * Tra cứu nhanh trạng thái của danh sách căn cứ pháp luật (dùng cho AI thẩm định hoặc auto-check)
 */
const checkLegalBasesStatus = async (req, res) => {
  try {
    const { codes = [] } = req.body; // mảng số hiệu văn bản: ["30/2020/NĐ-CP", "110/2004/NĐ-CP"]
    if (!Array.isArray(codes) || codes.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const results = await LegalBasis.find({
      code: { $in: codes.map(c => new RegExp(c.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")) }
    });

    return res.json({ success: true, data: results });
  } catch (error) {
    console.error("Lỗi checkLegalBasesStatus:", error);
    return res.status(500).json({ success: false, message: "Lỗi khi kiểm tra trạng thái căn cứ" });
  }
};

module.exports = {
  getLegalBases,
  getLegalBasisById,
  createLegalBasis,
  updateLegalBasis,
  deleteLegalBasis,
  checkLegalBasesStatus,
};
