const LegalBasis = require("../models/legalBasis.model");
const User = require("../models/user.model");
const Notification = require("../models/notification.model");
const { sendLegalBasisStatusEmail } = require("../service/NodeMailer.service/email");
const zaloOAService = require("../services/zaloOA.service");

/**
 * Helper: Lấy danh sách toàn bộ tài khoản thuộc nhóm:
 * - Manager (và Admin)
 * - Ban Giám hiệu (Hiệu trưởng, Phó Hiệu trưởng, Quyền Hiệu trưởng, phòng BGH)
 * - Cấp trưởng (Trưởng phòng/khoa/ban/trung tâm, Giám đốc, Bí thư, role 'staff' / 'captruong')
 * - Cấp phó (Phó trưởng phòng/khoa/ban/trung tâm, Phó Giám đốc, role 'cappho')
 */
const getTargetLeadershipRecipients = async () => {
  try {
    const allActiveUsers = await User.find({
      role: { $nin: [null, ""] },
    })
      .populate("department", "departmentCode departmentName")
      .populate("position", "positionName positionCode abbreviation code")
      .select("_id name email mobile zaloId role department position emailNotifications zaloNotifications")
      .lean();

    const targetUsers = allActiveUsers.filter((u) => {
      if (!u) return false;
      const role = String(u.role || "").toLowerCase();
      const deptCode = String(u.department?.departmentCode || "").toUpperCase();
      const deptName = String(u.department?.departmentName || "").toLowerCase();
      const posName = String(u.position?.positionName || "").toLowerCase();
      const posCode = String(
        u.position?.positionCode || u.position?.abbreviation || u.position?.code || ""
      ).toUpperCase();

      // 1. Manager & Admin
      if (role === "manager" || role === "admin") return true;

      // 2. Ban Giám hiệu
      if (
        deptCode === "BGH" ||
        deptName.includes("ban giám hiệu") ||
        ["HT", "QHT", "PHT", "NHT"].includes(posCode) ||
        posName.includes("hiệu trưởng")
      ) {
        return true;
      }

      // 3. Cấp trưởng & Cấp phó
      if (
        ["staff", "captruong", "cappho"].includes(role) ||
        ["TP", "TK", "GD", "BT", "PTP", "PTK", "PGD", "PBT"].includes(posCode) ||
        posName.includes("trưởng") ||
        posName.includes("phó") ||
        posName.includes("giám đốc")
      ) {
        return true;
      }

      return false;
    });

    return targetUsers;
  } catch (error) {
    console.error("Lỗi lấy danh sách lãnh đạo nhận thông báo căn cứ pháp luật:", error);
    return [];
  }
};

/**
 * Helper: Gửi đồng bộ Email, Bot Zalo (Nhóm + Cá nhân) và Thông báo trên hệ thống (Chuông)
 * về trạng thái hiệu lực của văn bản Căn cứ pháp luật
 */
const dispatchLegalBasisNotification = async (legalDoc, statusType = "ACTIVE", actorUser = null) => {
  try {
    if (!legalDoc) return { success: false, recipientCount: 0 };
    const recipients = await getTargetLeadershipRecipients();
    if (!recipients || recipients.length === 0) {
      return { success: false, recipientCount: 0 };
    }

    const actorName = actorUser?.name || "Hệ thống Văn phòng số";
    const isExpired =
      statusType === "EXPIRED" ||
      statusType === "PARTIALLY_EXPIRED" ||
      legalDoc.status === "EXPIRED" ||
      legalDoc.status === "PARTIALLY_EXPIRED";
    const isPartial = statusType === "PARTIALLY_EXPIRED" || legalDoc.status === "PARTIALLY_EXPIRED";

    const statusLabel = isExpired
      ? isPartial
        ? "Hết hiệu lực một phần"
        : "Đã hết hiệu lực"
      : "Bắt đầu có hiệu lực (Còn hiệu lực)";

    // 1. Gửi Email thông báo
    const emailSuccess = await sendLegalBasisStatusEmail(recipients, legalDoc, statusType, actorName).catch((err) => {
      console.error("Lỗi gửi email thông báo căn cứ pháp luật:", err);
      return false;
    });

    // 2. Gửi thông báo qua Zalo Bot (Nhóm Zalo + Zalo cá nhân của các tài khoản đã liên kết)
    await zaloOAService
      .notifyLegalBasisStatus({
        legalDoc,
        statusType,
        actorName,
        recipientUsers: recipients,
      })
      .catch((err) => console.error("Lỗi gửi Zalo thông báo căn cứ pháp luật:", err));

    // 3. Tạo thông báo trên chuông hệ thống (In-app Notification)
    const notifTitle = isExpired
      ? `⚠️ Cảnh báo văn bản hết hiệu lực: ${legalDoc.code}`
      : `✅ Văn bản bắt đầu có hiệu lực: ${legalDoc.code}`;

    const notifMessage = isExpired
      ? `Văn bản "${legalDoc.title}" (${legalDoc.code}) hiện ở trạng thái: ${statusLabel}.${
          legalDoc.replacedBy ? ` Văn bản thay thế: ${legalDoc.replacedBy}.` : ""
        }`
      : `Văn bản "${legalDoc.title}" (${legalDoc.code}) đã bắt đầu có hiệu lực thi hành.`;

    const notificationsToInsert = recipients.map((r) => ({
      recipient: r._id,
      sender: actorUser?._id || null,
      type: "GENERAL",
      title: notifTitle,
      message: notifMessage,
      link: "/legal-bases",
      isRead: false,
      isPopupShown: false,
      metadata: {
        legalBasisId: legalDoc._id,
        code: legalDoc.code,
        status: legalDoc.status,
      },
    }));

    if (notificationsToInsert.length > 0) {
      await Notification.insertMany(notificationsToInsert).catch((e) =>
        console.warn("Lỗi lưu in-app notification cho legalBasis:", e.message)
      );
    }

    // Cập nhật mốc đã gửi thông báo trên bản ghi LegalBasis
    await LegalBasis.findByIdAndUpdate(legalDoc._id, {
      $set: {
        lastNotifiedStatus: legalDoc.status,
        lastNotifiedAt: new Date(),
      },
    });

    return {
      success: true,
      emailSent: !!emailSuccess,
      recipientCount: recipients.length,
      statusLabel,
    };
  } catch (error) {
    console.error("Lỗi dispatchLegalBasisNotification:", error);
    return { success: false, recipientCount: 0, error: error.message };
  }
};

/**
 * Hàm tiện ích tự động chuẩn hóa trạng thái hiệu lực theo ngày:
 * Nếu trạng thái là PENDING mà ngày hiện tại >= ngày có hiệu lực -> tự động chuyển thành ACTIVE (Còn hiệu lực)
 * và tự động gửi Email + Zalo Bot thông báo văn bản bắt đầu có hiệu lực đến Manager, BGH, Cấp trưởng, Cấp phó.
 */
const autoUpdateEffectiveStatuses = async () => {
  try {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    // Tìm các văn bản đang PENDING mà ngày có hiệu lực <= ngày hôm nay
    const duePendingDocs = await LegalBasis.find({
      status: "PENDING",
      effectiveDate: { $lte: today },
    });

    if (duePendingDocs.length > 0) {
      for (const doc of duePendingDocs) {
        doc.status = "ACTIVE";
        await doc.save();
        // Tự động gửi Email + Zalo Bot thông báo văn bản bắt đầu có hiệu lực
        if (doc.lastNotifiedStatus !== "ACTIVE") {
          await dispatchLegalBasisNotification(doc, "ACTIVE", { name: "Hệ thống tự động" });
        }
      }
    }
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

    // Nếu văn bản đang là PENDING mà đã đến ngày có hiệu lực thì cập nhật thành ACTIVE và gửi thông báo
    if (item.status === "PENDING" && item.effectiveDate && new Date(item.effectiveDate) <= new Date()) {
      item.status = "ACTIVE";
      await item.save();
      if (item.lastNotifiedStatus !== "ACTIVE") {
        await dispatchLegalBasisNotification(item, "ACTIVE", { name: "Hệ thống tự động" });
      }
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
    const { code, title, docType, issuingAuthority, issuedDate, effectiveDate, status, replacedBy, documentUrl, notes, sendNotification } = req.body;
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

    // Tự động xác định Tình trạng hiệu lực dựa vào ngày có hiệu lực khi thêm mới:
    // Nếu có ngày hiệu lực và ngày đó ở tương lai (> hôm nay) -> Sắp hiệu lực (PENDING)
    // Nếu ngày hiệu lực <= hôm nay và không thuộc diện hết hiệu lực -> Còn hiệu lực (ACTIVE)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (effDateObj) {
      const effZero = new Date(effDateObj);
      effZero.setHours(0, 0, 0, 0);
      if (effZero.getTime() > today.getTime()) {
        finalStatus = "PENDING";
      } else if (finalStatus === "PENDING") {
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

    // Mặc định gửi Email & Zalo Bot khi văn bản ở trạng thái bắt đầu có hiệu lực (ACTIVE) hoặc hết hiệu lực (EXPIRED / PARTIALLY_EXPIRED)
    // trừ khi người dùng chủ động tắt sendNotification = false
    let notifyResult = null;
    if (sendNotification !== false && ["ACTIVE", "EXPIRED", "PARTIALLY_EXPIRED"].includes(finalStatus)) {
      notifyResult = await dispatchLegalBasisNotification(newItem, finalStatus, req.user);
    }

    return res.status(201).json({
      success: true,
      message: notifyResult?.success
        ? `Thêm mới căn cứ pháp luật thành công và đã gửi thông báo Email/Zalo tới ${notifyResult.recipientCount} lãnh đạo!`
        : "Thêm mới căn cứ pháp luật thành công",
      data: newItem,
      notifyResult,
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
    const oldDoc = await LegalBasis.findById(id).lean();
    if (!oldDoc) {
      return res.status(404).json({ success: false, message: "Không tìm thấy căn cứ pháp luật" });
    }

    const { sendNotification, ...restBody } = req.body;
    const updateData = { ...restBody };
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

    // Nếu trạng thái hiệu lực thay đổi sang ACTIVE / EXPIRED / PARTIALLY_EXPIRED hoặc người dùng bật gửi thông báo (sendNotification === true)
    const statusChangedToActionable =
      oldDoc.status !== updated.status &&
      ["ACTIVE", "EXPIRED", "PARTIALLY_EXPIRED"].includes(updated.status);
    const shouldNotify =
      sendNotification === true || (sendNotification !== false && statusChangedToActionable);

    let notifyResult = null;
    if (shouldNotify && ["ACTIVE", "EXPIRED", "PARTIALLY_EXPIRED"].includes(updated.status)) {
      notifyResult = await dispatchLegalBasisNotification(updated, updated.status, req.user);
    }

    return res.json({
      success: true,
      message: notifyResult?.success
        ? `Cập nhật thành công và đã gửi thông báo Email/Zalo (${notifyResult.statusLabel}) tới ${notifyResult.recipientCount} lãnh đạo!`
        : "Cập nhật căn cứ pháp luật thành công",
      data: updated,
      notifyResult,
    });
  } catch (error) {
    console.error("Lỗi updateLegalBasis:", error);
    return res.status(500).json({ success: false, message: "Lỗi khi cập nhật căn cứ pháp luật" });
  }
};

/**
 * Chủ động gửi thông báo Email & Bot Zalo về trạng thái hiệu lực của 1 văn bản căn cứ pháp luật
 * đến toàn bộ nhóm tài khoản Manager, Ban Giám hiệu, Cấp trưởng và Cấp phó
 */
const notifyLegalBasis = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await LegalBasis.findById(id);
    if (!item) {
      return res.status(404).json({ success: false, message: "Không tìm thấy văn bản căn cứ pháp luật" });
    }

    // Nếu văn bản đang ở trạng thái PENDING nhưng ngày hiệu lực <= hôm nay thì cập nhật sang ACTIVE trước khi gửi
    if (item.status === "PENDING" && item.effectiveDate) {
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (new Date(item.effectiveDate) <= today) {
        item.status = "ACTIVE";
        await item.save();
      }
    }

    const notifyType = ["EXPIRED", "PARTIALLY_EXPIRED"].includes(item.status) ? item.status : "ACTIVE";
    const result = await dispatchLegalBasisNotification(item, notifyType, req.user);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.error || "Không thể gửi thông báo lúc này",
      });
    }

    return res.json({
      success: true,
      message: `Đã gửi thông báo Email & Bot Zalo (${result.statusLabel}) cho văn bản "${item.code}" tới ${result.recipientCount} tài khoản (Manager, Ban Giám hiệu, Cấp trưởng, Cấp phó)!`,
      data: result,
    });
  } catch (error) {
    console.error("Lỗi notifyLegalBasis:", error);
    return res.status(500).json({ success: false, message: "Lỗi khi gửi thông báo căn cứ pháp luật" });
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
  notifyLegalBasis,
  autoUpdateEffectiveStatuses,
};
