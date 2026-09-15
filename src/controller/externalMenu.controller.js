const ExternalMenu = require("../models/externalMenu.model");

// Lấy danh sách menu liên kết
// Người dùng thông thường chỉ lấy isActive = true
// Admin có thể truyền ?all=true để lấy tất cả bao gồm menu đang ẩn
const getExternalMenus = async (req, res) => {
  try {
    const { all } = req.query;
    const filter = {};

    // Nếu không yêu cầu lấy tất cả (hoặc không phải admin), chỉ lấy các menu đang kích hoạt
    if (all !== "true") {
      filter.isActive = true;
    }

    const menus = await ExternalMenu.find(filter)
      .sort({ order: 1, createdAt: 1 })
      .lean();

    res.status(200).json({
      success: true,
      data: menus,
    });
  } catch (error) {
    console.error("Lỗi getExternalMenus:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi lấy danh sách menu liên kết",
      error: error.message,
    });
  }
};

// Tạo mới menu liên kết (Admin)
const createExternalMenu = async (req, res) => {
  try {
    const { title, url, icon, openInNewTab, order, isActive, description } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "Tên menu liên kết là bắt buộc",
      });
    }

    if (!url || !url.trim()) {
      return res.status(400).json({
        success: false,
        message: "Đường link liên kết là bắt buộc",
      });
    }

    let formattedUrl = url.trim();
    if (!/^https?:\/\//i.test(formattedUrl) && !formattedUrl.startsWith("/")) {
      formattedUrl = `https://${formattedUrl}`;
    }

    const newMenu = await ExternalMenu.create({
      title: title.trim(),
      url: formattedUrl,
      icon: icon && icon.trim() ? icon.trim() : "GlobalOutlined",
      openInNewTab: openInNewTab !== undefined ? Boolean(openInNewTab) : true,
      order: Number(order) || 0,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      description: description ? description.trim() : "",
      createdBy: req.user?.userId || req.user?._id,
    });

    res.status(201).json({
      success: true,
      message: "Thêm menu liên kết thành công",
      data: newMenu,
    });
  } catch (error) {
    console.error("Lỗi createExternalMenu:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi tạo menu liên kết",
      error: error.message,
    });
  }
};

// Cập nhật thông tin menu liên kết (Admin)
const updateExternalMenu = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, url, icon, openInNewTab, order, isActive, description } = req.body;

    const menu = await ExternalMenu.findById(id);
    if (!menu) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy menu liên kết",
      });
    }

    if (title !== undefined) {
      if (!title.trim()) {
        return res.status(400).json({
          success: false,
          message: "Tên menu liên kết không được để trống",
        });
      }
      menu.title = title.trim();
    }

    if (url !== undefined) {
      if (!url.trim()) {
        return res.status(400).json({
          success: false,
          message: "Đường link liên kết không được để trống",
        });
      }
      let formattedUrl = url.trim();
      if (!/^https?:\/\//i.test(formattedUrl) && !formattedUrl.startsWith("/")) {
        formattedUrl = `https://${formattedUrl}`;
      }
      menu.url = formattedUrl;
    }

    if (icon !== undefined) menu.icon = icon.trim() || "GlobalOutlined";
    if (openInNewTab !== undefined) menu.openInNewTab = Boolean(openInNewTab);
    if (order !== undefined) menu.order = Number(order) || 0;
    if (isActive !== undefined) menu.isActive = Boolean(isActive);
    if (description !== undefined) menu.description = description ? description.trim() : "";

    await menu.save();

    res.status(200).json({
      success: true,
      message: "Cập nhật menu liên kết thành công",
      data: menu,
    });
  } catch (error) {
    console.error("Lỗi updateExternalMenu:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi cập nhật menu liên kết",
      error: error.message,
    });
  }
};

// Bật/tắt nhanh trạng thái hiển thị (Admin)
const toggleExternalMenuStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const menu = await ExternalMenu.findById(id);
    if (!menu) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy menu liên kết",
      });
    }

    menu.isActive = !menu.isActive;
    await menu.save();

    res.status(200).json({
      success: true,
      message: `Đã ${menu.isActive ? "kích hoạt" : "ẩn"} menu liên kết`,
      data: menu,
    });
  } catch (error) {
    console.error("Lỗi toggleExternalMenuStatus:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi đổi trạng thái menu",
      error: error.message,
    });
  }
};

// Xóa menu liên kết (Admin)
const deleteExternalMenu = async (req, res) => {
  try {
    const { id } = req.params;
    const menu = await ExternalMenu.findByIdAndDelete(id);
    if (!menu) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy menu liên kết để xóa",
      });
    }

    res.status(200).json({
      success: true,
      message: "Xóa menu liên kết thành công",
      data: menu,
    });
  } catch (error) {
    console.error("Lỗi deleteExternalMenu:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi xóa menu liên kết",
      error: error.message,
    });
  }
};

module.exports = {
  getExternalMenus,
  createExternalMenu,
  updateExternalMenu,
  toggleExternalMenuStatus,
  deleteExternalMenu,
};
