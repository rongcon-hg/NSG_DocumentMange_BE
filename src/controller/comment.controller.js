const mongoose = require("mongoose");
const Comment = require("../models/comment.model");
const Task = require("../models/task.model");
const Document = require("../models/document.model");
const User = require("../models/user.model");
const Notification = require("../models/notification.model");
const { google } = require("googleapis");
const { Readable } = require("stream");
const { authorize, getOrCreateMonthFolder, sanitizeFileName } = require("./uploadfile.Controller");

/**
 * Lấy danh sách bình luận theo targetType và targetId
 */
const getComments = async (req, res) => {
  try {
    const { targetType, targetId } = req.query;

    if (!targetType || !targetId) {
      return res.status(400).json({ success: false, message: "Thiếu targetType hoặc targetId" });
    }

    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ success: false, message: "targetId không hợp lệ" });
    }

    const comments = await Comment.find({
      targetType,
      targetId,
    })
      .populate("sender", "name email role avatar department position")
      .populate("mentions", "name email")
      .sort({ createdAt: 1 })
      .lean();

    res.status(200).json({
      success: true,
      data: comments,
    });
  } catch (error) {
    console.error("Lỗi getComments:", error);
    res.status(500).json({ success: false, message: "Lỗi khi lấy danh sách trao đổi", error: error.message });
  }
};

/**
 * Tạo bình luận mới (hỗ trợ mention và đính kèm file Drive)
 */
const createComment = async (req, res) => {
  try {
    const senderId = req.user?._id || req.user?.id;
    const { targetType, targetId, content, mentions, parentId } = req.body;

    if (!targetType || !targetId || !content || !content.trim()) {
      return res.status(400).json({ success: false, message: "Vui lòng nhập đầy đủ nội dung trao đổi" });
    }

    // Xử lý file đính kèm nếu có upload qua multer
    let attachments = [];
    if (req.files && req.files.length > 0) {
      try {
        const auth = await authorize();
        const drive = google.drive({ version: "v3", auth });
        const folderId = await getOrCreateMonthFolder(drive);

        for (const file of req.files) {
          const sanitizedName = sanitizeFileName(file.originalname);
          const fileMetadata = {
            name: `comment_${Date.now()}_${sanitizedName}`,
            parents: [folderId],
          };

          const media = {
            mimeType: file.mimetype,
            body: Readable.from(file.buffer),
          };

          const driveRes = await drive.files.create({
            requestBody: fileMetadata,
            media,
            fields: "id, name, mimeType, webViewLink",
            supportsAllDrives: true,
          });

          try {
            await drive.permissions.create({
              fileId: driveRes.data.id,
              requestBody: { role: "reader", type: "anyone" },
              supportsAllDrives: true,
            });
          } catch (pErr) {
            // Ignore if restricted
          }

          attachments.push({
            fileId: driveRes.data.id,
            fileName: file.originalname,
            fileUrl: `https://drive.google.com/file/d/${driveRes.data.id}/view`,
            mimeType: file.mimetype,
            size: `${(file.size / 1024).toFixed(1)} KB`,
          });
        }
      } catch (uploadErr) {
        console.error("Lỗi upload file bình luận lên Drive:", uploadErr);
      }
    }

    // Parse mentions nếu truyền dạng chuỗi JSON
    let parsedMentions = [];
    if (mentions) {
      parsedMentions = typeof mentions === "string" ? JSON.parse(mentions) : mentions;
    }

    const newComment = await Comment.create({
      targetType,
      targetId,
      sender: senderId,
      content: content.trim(),
      mentions: parsedMentions,
      attachments,
      parentId: parentId || null,
    });

    const populated = await Comment.findById(newComment._id)
      .populate("sender", "name email role avatar department position")
      .populate("mentions", "name email")
      .lean();

    // Gửi thông báo đến những người được tag (@mention)
    if (parsedMentions && parsedMentions.length > 0) {
      const senderUser = await User.findById(senderId).select("name");
      const senderName = senderUser?.name || "Một cán bộ";

      for (const mentionId of parsedMentions) {
        if (mentionId.toString() !== senderId.toString()) {
          await Notification.create({
            recipient: mentionId,
            sender: senderId,
            type: "COMMENT_MENTION",
            title: "Bạn được nhắc đến trong trao đổi",
            message: `${senderName} đã nhắc đến bạn trong một trao đổi trên ${targetType === "Document" ? "văn bản" : "công việc"}: "${content.substring(0, 60)}..."`,
            link: targetType === "Document" ? `/documents/ReceivedDocumentList` : `/schedule`,
          });
        }
      }
    }

    res.status(201).json({
      success: true,
      message: "Đã gửi ý kiến trao đổi",
      data: populated,
    });
  } catch (error) {
    console.error("Lỗi createComment:", error);
    res.status(500).json({ success: false, message: "Lỗi khi gửi trao đổi", error: error.message });
  }
};

/**
 * Xóa bình luận (chỉ chính người tạo hoặc Admin mới được xóa)
 */
const deleteComment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id || req.user?.id;
    const userRole = req.user?.role;

    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({ success: false, message: "Không tìm thấy bình luận" });
    }

    const isOwner = comment.sender.toString() === userId.toString();
    const isAdmin = userRole === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: "Bạn không có quyền xóa bình luận này" });
    }

    await Comment.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Đã xóa bình luận thành công",
    });
  } catch (error) {
    console.error("Lỗi deleteComment:", error);
    res.status(500).json({ success: false, message: "Lỗi khi xóa bình luận", error: error.message });
  }
};

module.exports = {
  getComments,
  createComment,
  deleteComment,
};
