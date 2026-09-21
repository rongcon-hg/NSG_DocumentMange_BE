const mongoose = require("mongoose");
const Task = require("../models/task.model");
const Document = require("../models/document.model");
const User = require("../models/user.model");
const HandoverLog = require("../models/handoverLog.model");

/**
 * Xem trước số lượng và danh sách công việc, văn bản tồn đọng của nhân sự cần bàn giao
 */
const previewHandover = async (req, res) => {
  try {
    const { fromUserId } = req.query;
    if (!fromUserId || !mongoose.Types.ObjectId.isValid(fromUserId)) {
      return res.status(400).json({ success: false, message: "ID người bàn giao không hợp lệ" });
    }

    const fromUser = await User.findById(fromUserId).select("name email department position");
    if (!fromUser) {
      return res.status(404).json({ success: false, message: "Không tìm thấy người dùng" });
    }

    // 1. Tìm các công việc chưa hoàn thành (TODO, IN_PROGRESS) mà fromUserId là Người chịu trách nhiệm hoặc cộng tác
    const tasks = await Task.find({
      status: { $in: ["TODO", "IN_PROGRESS"] },
      $or: [
        { assignees: fromUserId },
        { collaborators: fromUserId }
      ]
    })
      .select("title status priority endDate assignees collaborators")
      .populate("assignees", "name")
      .lean();

    // 2. Tìm các văn bản được giao xử lý chưa xong
    const pendingDocs = await Document.find({
      "assignedToUsers.userId": fromUserId,
      "assignedToUsers.onTime": { $in: ["pending", "onTime"] }
    })
      .select("docCode docNum year shortDescription deadlineDay urgency")
      .lean();

    res.status(200).json({
      success: true,
      data: {
        fromUser,
        activeTasksCount: tasks.length,
        tasks,
        pendingDocsCount: pendingDocs.length,
        pendingDocs
      }
    });
  } catch (error) {
    console.error("Lỗi previewHandover:", error);
    res.status(500).json({ success: false, message: error.message || "Lỗi khi kiểm tra dữ liệu bàn giao" });
  }
};

/**
 * Thực hiện bàn giao công việc & văn bản tự động từ fromUserId sang toUserId
 */
const executeHandover = async (req, res) => {
  try {
    const { fromUserId, toUserId, reason, transferTasks = true, transferDocuments = true, taskIds = [], docIds = [] } = req.body;
    const performedBy = req.user?.id || req.user?._id;

    if (!fromUserId || !toUserId) {
      return res.status(400).json({ success: false, message: "Vui lòng chọn đầy đủ người bàn giao và người tiếp nhận" });
    }

    if (fromUserId === toUserId) {
      return res.status(400).json({ success: false, message: "Người bàn giao và người nhận không được trùng nhau" });
    }

    const [fromUser, toUser] = await Promise.all([
      User.findById(fromUserId),
      User.findById(toUserId)
    ]);

    if (!fromUser || !toUser) {
      return res.status(404).json({ success: false, message: "Người dùng không tồn tại trong hệ thống" });
    }

    let transferredTasks = [];
    let transferredDocs = [];

    // 1. Chuyển giao công việc (Tasks)
    if (transferTasks) {
      const taskQuery = {
        status: { $in: ["TODO", "IN_PROGRESS"] },
        $or: [
          { assignees: fromUserId },
          { collaborators: fromUserId }
        ]
      };
      if (Array.isArray(taskIds) && taskIds.length > 0) {
        taskQuery._id = { $in: taskIds };
      }

      const tasksToTransfer = await Task.find(taskQuery);

      for (const t of tasksToTransfer) {
        let modified = false;

        // Thay thế trong assignees
        if (t.assignees && t.assignees.some(id => id.toString() === fromUserId)) {
          t.assignees = t.assignees.filter(id => id.toString() !== fromUserId);
          if (!t.assignees.some(id => id.toString() === toUserId)) {
            t.assignees.push(toUserId);
          }
          modified = true;
        }

        // Thay thế trong collaborators
        if (t.collaborators && t.collaborators.some(id => id.toString() === fromUserId)) {
          t.collaborators = t.collaborators.filter(id => id.toString() !== fromUserId);
          if (!t.collaborators.some(id => id.toString() === toUserId)) {
            t.collaborators.push(toUserId);
          }
          modified = true;
        }

        if (modified) {
          t.notes = (t.notes ? `${t.notes}\n` : "") + `[Bàn giao tự động ${new Date().toLocaleDateString('vi-VN')}]: Chuyển từ ${fromUser.name} sang ${toUser.name}. Lý do: ${reason || "Điều động / Chuyển vị trí"}`;
          await t.save();
          transferredTasks.push(t._id);
        }
      }
    }

    // 2. Chuyển giao văn bản đang xử lý (assignedToUsers)
    if (transferDocuments) {
      const docQuery = {
        "assignedToUsers.userId": fromUserId
      };
      if (Array.isArray(docIds) && docIds.length > 0) {
        docQuery._id = { $in: docIds };
      }

      const docsToTransfer = await Document.find(docQuery);

      for (const doc of docsToTransfer) {
        let docModified = false;
        const assignedItem = doc.assignedToUsers.find(a => a.userId.toString() === fromUserId);

        if (assignedItem) {
          // Thêm toUser nếu chưa có
          const alreadyAssignedToReceiver = doc.assignedToUsers.some(a => a.userId.toString() === toUserId);
          if (!alreadyAssignedToReceiver) {
            doc.assignedToUsers.push({
              userId: toUserId,
              status: "received",
              onTime: assignedItem.onTime || "pending",
              isRead: false,
              receivedDate: null
            });
            docModified = true;
          }

          // Cập nhật lịch sử văn bản
          if (!doc.history) doc.history = [];
          doc.history.push({
            action: "Handover",
            actor: performedBy || fromUserId,
            forwardedTo: [toUserId],
            date: new Date(),
            note: `Bàn giao theo dõi xử lý từ ${fromUser.name} sang ${toUser.name}. Lý do: ${reason || ""}`
          });

          await doc.save();
          transferredDocs.push(doc._id);
        }
      }
    }

    // 3. Ghi lại nhật ký bàn giao (HandoverLog)
    const log = new HandoverLog({
      fromUser: fromUserId,
      toUser: toUserId,
      handoverReason: reason || "Bàn giao nhiệm vụ công việc",
      transferredTasksCount: transferredTasks.length,
      transferredTasks,
      transferredDocsCount: transferredDocs.length,
      transferredDocs,
      performedBy: performedBy || fromUserId,
      notes: `Đã bàn giao thành công ${transferredTasks.length} công việc và ${transferredDocs.length} văn bản tồn đọng.`
    });

    await log.save();

    res.status(200).json({
      success: true,
      message: `Đã bàn giao thành công ${transferredTasks.length} công việc và ${transferredDocs.length} văn bản sang cho ${toUser.name}!`,
      data: {
        logId: log._id,
        transferredTasksCount: transferredTasks.length,
        transferredDocsCount: transferredDocs.length
      }
    });
  } catch (error) {
    console.error("Lỗi executeHandover:", error);
    res.status(500).json({ success: false, message: error.message || "Lỗi khi thực hiện bàn giao" });
  }
};

/**
 * Lịch sử các đợt bàn giao
 */
const getHandoverLogs = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [logs, total] = await Promise.all([
      HandoverLog.find()
        .populate("fromUser", "name email department position")
        .populate("toUser", "name email department position")
        .populate("performedBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      HandoverLog.countDocuments()
    ]);

    res.status(200).json({
      success: true,
      data: logs,
      total,
      currentPage: Number(page),
      totalPages: Math.ceil(total / Number(limit))
    });
  } catch (error) {
    console.error("Lỗi getHandoverLogs:", error);
    res.status(500).json({ success: false, message: error.message || "Lỗi tải lịch sử bàn giao" });
  }
};

module.exports = {
  previewHandover,
  executeHandover,
  getHandoverLogs
};
