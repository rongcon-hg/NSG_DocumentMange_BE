const LegalBasis = require("../models/legalBasis.model");

/**
 * Hàm tiện ích tự động chuẩn hóa trạng thái hiệu lực theo ngày:
 * Nếu trạng thái là PENDING mà ngày hiện tại >= ngày có hiệu lực -> tự động chuyển thành ACTIVE (Còn hiệu lực).
 * Hoặc nếu trạng thái là ACTIVE mà ngày có hiệu lực ở tương lai -> có thể gợi ý/chuyển thành PENDING.
 */
const autoUpdateEffectiveStatuses = async () => {
  try {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    // Tìm các văn bản đang PENDING mà ngày có hiệu lực <= ngày hôm nay
    await LegalBasis.updateMany(
      {
        status: "PENDING",
        effectiveDate: { $lte: today },
      },
      {
        $set: { status: "ACTIVE" },
      }
    );
  } catch (err) {
    console.error("Lỗi autoUpdateEffectiveStatuses:", err);
  }
};

/**
 * Lấy danh sách căn cứ pháp luật (hỗ trợ phân trang, lọc theo trạng thái, cơ quan, tìm kiếm)
 */
const getLegalBases = async (req, res) => {
  try {
    // Tự động kiểm tra và chuyển các văn bản Sắp hiệu lực thành Còn hiệu lực nếu đã đến ngày có hiệu lực
    await autoUpdateEffectiveStatuses();

    const { page = 1, limit = 15, status, docType, search } = req.query;
    const query = {};

    if (status) query.status = status;
    if (docType) query.docType = docType;
    if (search && search.trim()) {
      const cleanSearch = search.trim();
      const escapedSearch = cleanSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { code: { $regex: escapedSearch, $options: "i" } },
        { title: { $regex: escapedSearch, $options: "i" } },
        { issuingAuthority: { $regex: escapedSearch, $options: "i" } },
        { replacedBy: { $regex: escapedSearch, $options: "i" } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [items, total, statsAggregation] = await Promise.all([
      LegalBasis.find(query)
        .populate("createdBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      LegalBasis.countDocuments(query),
      LegalBasis.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const stats = {
      total: 0,
      ACTIVE: 0,
      PENDING: 0,
      EXPIRED: 0,
      PARTIALLY_EXPIRED: 0,
    };

    if (Array.isArray(statsAggregation)) {
      statsAggregation.forEach((s) => {
        if (s._id && stats[s._id] !== undefined) {
          stats[s._id] = s.count;
        }
        stats.total += s.count;
      });
    }

    return res.json({
      success: true,
      data: items,
      stats,
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
    let item = await LegalBasis.findById(id).populate("createdBy", "name email");
    if (!item) {
      return res.status(404).json({ success: false, message: "Không tìm thấy căn cứ pháp luật" });
    }

    // Nếu văn bản đang là PENDING mà đã đến ngày có hiệu lực thì cập nhật thành ACTIVE
    if (item.status === "PENDING" && item.effectiveDate && new Date(item.effectiveDate) <= new Date()) {
      item.status = "ACTIVE";
      await item.save();
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

    const effDateObj = effectiveDate ? new Date(effectiveDate) : null;
    let finalStatus = status || "ACTIVE";

    // Tự động kiểm tra: Nếu chọn PENDING nhưng ngày có hiệu lực đã đến (<= hôm nay) thì chuyển luôn thành ACTIVE
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (finalStatus === "PENDING" && effDateObj) {
      const effZero = new Date(effDateObj);
      effZero.setHours(0, 0, 0, 0);
      if (effZero.getTime() <= today.getTime()) {
        finalStatus = "ACTIVE";
      }
    }

    const newItem = await LegalBasis.create({
      code: code.trim(),
      title: title.trim(),
      docType: docType || "NGHI_DINH",
      issuingAuthority: issuingAuthority || "",
      issuedDate: issuedDate ? new Date(issuedDate) : null,
      effectiveDate: effDateObj,
      status: finalStatus,
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

    if (updateData.code) {
      const existing = await LegalBasis.findOne({
        code: updateData.code.trim(),
        _id: { $ne: id },
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: `Văn bản có số hiệu "${updateData.code}" đã có trong CSDL!`,
        });
      }
      updateData.code = updateData.code.trim();
    }

    if (updateData.effectiveDate) {
      updateData.effectiveDate = new Date(updateData.effectiveDate);
      // Nếu trạng thái đang là PENDING mà ngày hiệu lực <= hôm nay thì tự chuyển thành ACTIVE
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const effZero = new Date(updateData.effectiveDate);
      effZero.setHours(0, 0, 0, 0);
      if (updateData.status === "PENDING" && effZero.getTime() <= today.getTime()) {
        updateData.status = "ACTIVE";
      }
    }

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
  autoUpdateEffectiveStatuses,
};
