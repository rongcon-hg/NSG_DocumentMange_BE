const mongoose = require("mongoose");

const directMessageSchema = new mongoose.Schema(
  {
    // Người gửi
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Người nhận
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Nội dung tin nhắn
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 3000,
    },
    // Trạng thái đã xem
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Index kép tối ưu hóa truy vấn hội thoại 2 chiều giữa 2 người dùng
directMessageSchema.index({ sender: 1, recipient: 1, createdAt: 1 });
directMessageSchema.index({ recipient: 1, isRead: 1 });

const DirectMessage = mongoose.model("DirectMessage", directMessageSchema);
module.exports = DirectMessage;
