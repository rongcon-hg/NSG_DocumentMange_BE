const Notification = require("../models/notification.model");

/**
 * Lấy danh sách thông báo của người dùng hiện tại
 */
const getMyNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [notifications, totalUnread, total] = await Promise.all([
      Notification.find({ recipient: userId })
        .populate("sender", "name avatar")
        .populate("task", "title status priority")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments({ recipient: userId, isRead: false }),
      Notification.countDocuments({ recipient: userId }),
    ]);

    res.status(200).json({
      success: true,
      data: notifications,
      unreadCount: totalUnread,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    console.error("Lỗi getMyNotifications:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

/**
 * Lấy số lượng thông báo chưa đọc
 */
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user._id;
    const unreadCount = await Notification.countDocuments({ recipient: userId, isRead: false });
    res.status(200).json({ success: true, count: unreadCount });
  } catch (error) {
    console.error("Lỗi getUnreadCount:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

/**
 * Đánh dấu một thông báo là đã đọc
 */
const markAsRead = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const notification = await Notification.findOneAndUpdate(
      { _id: id, recipient: userId },
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: "Không tìm thấy thông báo" });
    }

    const unreadCount = await Notification.countDocuments({ recipient: userId, isRead: false });

    res.status(200).json({ success: true, data: notification, unreadCount });
  } catch (error) {
    console.error("Lỗi markAsRead:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

/**
 * Đánh dấu tất cả thông báo của người dùng là đã đọc
 */
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user._id;

    await Notification.updateMany(
      { recipient: userId, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    res.status(200).json({ success: true, message: "Đã đánh dấu tất cả thông báo là đã đọc", unreadCount: 0 });
  } catch (error) {
    console.error("Lỗi markAllAsRead:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

/**
 * Đánh dấu các thông báo đã được hiển thị popup (để tránh hiển thị lại nhiều lần)
 */
const markPopupShown = async (req, res) => {
  try {
    const userId = req.user._id;
    const { ids } = req.body;

    if (Array.isArray(ids) && ids.length > 0) {
      await Notification.updateMany(
        { _id: { $in: ids }, recipient: userId },
        { isPopupShown: true }
      );
    }

    res.status(200).json({ success: true, message: "Cập nhật trạng thái popup thành công" });
  } catch (error) {
    console.error("Lỗi markPopupShown:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
  }
};

module.exports = {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  markPopupShown,
};
