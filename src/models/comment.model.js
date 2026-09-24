const mongoose = require("mongoose");

const commentAttachmentSchema = new mongoose.Schema(
  {
    fileId: { type: String, required: true },
    fileName: { type: String, required: true },
    fileUrl: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    size: { type: String, default: "" },
  },
  { _id: true }
);

const commentSchema = new mongoose.Schema(
  {
    // Đối tượng thảo luận: "Document" hoặc "Task"
    targetType: {
      type: String,
      enum: ["Document", "Task"],
      required: true,
      index: true,
    },
    // ID của Document hoặc Task
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    // Người gửi bình luận
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Nội dung thảo luận (hỗ trợ text, link)
    content: {
      type: String,
      required: true,
      trim: true,
    },
    // Danh sách cán bộ được tag tên (@mention)
    mentions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    // Tệp hoặc hình ảnh đính kèm trong trao đổi
    attachments: [commentAttachmentSchema],
    // Trả lời theo luồng (Thread reply cấp 2)
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Comment",
      default: null,
      index: true,
    },
    // Ghi chú nếu là thông báo hệ thống tự sinh
    isSystemLog: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Comment", commentSchema);
