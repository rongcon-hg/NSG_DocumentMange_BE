const DirectMessage = require("../models/directMessage.model");
const User = require("../models/user.model");

// Gửi tin nhắn cá nhân
const sendMessage = async (req, res) => {
  try {
    const senderId = req.user._id;
    const { recipientId, content } = req.body;

    if (!recipientId || !content || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập người nhận và nội dung tin nhắn!",
      });
    }

    if (String(senderId) === String(recipientId)) {
      return res.status(400).json({
        success: false,
        message: "Bạn không thể gửi tin nhắn cho chính mình!",
      });
    }

    // Kiểm tra người nhận có tồn tại không
    const recipient = await User.findById(recipientId).select("_id name");
    if (!recipient) {
      return res.status(404).json({
        success: false,
        message: "Người nhận không tồn tại trong hệ thống!",
      });
    }

    const newMessage = await DirectMessage.create({
      sender: senderId,
      recipient: recipientId,
      content: content.trim(),
    });

    const populated = await DirectMessage.findById(newMessage._id)
      .populate("sender", "name avatar role")
      .populate("recipient", "name avatar role");

    return res.status(201).json({
      success: true,
      message: "Đã gửi tin nhắn thành công",
      data: populated,
    });
  } catch (error) {
    console.error("Lỗi sendMessage:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống khi gửi tin nhắn",
      error: error.message,
    });
  }
};

// Lấy lịch sử tin nhắn giữa 2 người dùng và tự động đánh dấu đã đọc
const getConversation = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const { partnerId } = req.params;

    if (!partnerId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu partnerId",
      });
    }

    // Tự động đánh dấu tất cả tin nhắn gửi cho currentUserId từ partnerId là đã đọc
    await DirectMessage.updateMany(
      {
        sender: partnerId,
        recipient: currentUserId,
        isRead: false,
      },
      {
        $set: { isRead: true, readAt: new Date() },
      }
    );

    // Lấy 80 tin nhắn gần nhất
    const messages = await DirectMessage.find({
      $or: [
        { sender: currentUserId, recipient: partnerId },
        { sender: partnerId, recipient: currentUserId },
      ],
    })
      .sort({ createdAt: 1 })
      .limit(80)
      .populate("sender", "name avatar role")
      .populate("recipient", "name avatar role")
      .lean();

    return res.status(200).json({
      success: true,
      data: messages,
    });
  } catch (error) {
    console.error("Lỗi getConversation:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống khi lấy đoạn hội thoại",
      error: error.message,
    });
  }
};

// Thống kê số tin nhắn chưa đọc
const getUnreadSummary = async (req, res) => {
  try {
    const currentUserId = req.user._id;

    const unreadMessages = await DirectMessage.aggregate([
      {
        $match: {
          recipient: currentUserId,
          isRead: false,
        },
      },
      {
        $group: {
          _id: "$sender",
          count: { $sum: 1 },
        },
      },
    ]);

    let totalUnread = 0;
    const unreadByPartner = {};

    unreadMessages.forEach((item) => {
      totalUnread += item.count;
      unreadByPartner[item._id.toString()] = item.count;
    });

    return res.status(200).json({
      success: true,
      totalUnread,
      unreadByPartner,
    });
  } catch (error) {
    console.error("Lỗi getUnreadSummary:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi lấy thống kê tin nhắn chưa đọc",
      error: error.message,
    });
  }
};

module.exports = {
  sendMessage,
  getConversation,
  getUnreadSummary,
};
