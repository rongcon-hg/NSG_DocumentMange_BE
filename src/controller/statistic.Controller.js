const Document = require('../models/document.model');
const Reply = require('../models/repliedDoc.model');
const User = require('../models/user.model');
const mongoose = require("mongoose");

//Controller của thống kê
async function getUserStatistics(req, res) {
  try {
    const {
      year,
      docVariantId,
      fromDate,
      toDate,
      userId
    } = req.query;

    const query = { role: { $in: ['manager', 'staff'] } };
    if (userId) {
      query._id = new mongoose.Types.ObjectId(String(userId));
    }

    const users = await User.find(query).select('name _id').lean();

    if (users.length === 0) {
      return res.status(404).json({ message: "No users found matching the query." });
    }

    // --- Xây dựng Object Map để tra cứu tốc độ O(1) ---
    const userStatsMap = {};
    users.forEach(u => {
      userStatsMap[u._id.toString()] = {
        userId: u._id,
        userName: u.name,
        totalReceived: 0,
        totalSent: 0,
        totalUnread: 0,
        onTimeCount: 0,
        soonCount: 0,
        lateCount: 0,
        pendingCount: 0,
        unhandledCount: 0,
        totalReplied: 0
      };
    });

    // --- build match cho Document ---
    let docMatch = {};
    if (docVariantId) docMatch.docVariant = new mongoose.Types.ObjectId(docVariantId);
    
    // Nếu có userId, chỉ lọc những văn bản mà user đó có liên quan (tăng tốc độ DB query)
    if (userId) {
      docMatch['assignedToUsers.userId'] = new mongoose.Types.ObjectId(String(userId));
    }

    // Lọc theo ngày
    let dateFilter = {};
    if (fromDate || toDate) {
      if (fromDate) dateFilter.$gte = new Date(fromDate);
      if (toDate) {
        // Tới cuối ngày của toDate
        const endDate = new Date(toDate);
        endDate.setUTCHours(23, 59, 59, 999);
        dateFilter.$lte = endDate;
      }
    } else if (year) {
      dateFilter.$gte = new Date(`${year}-01-01T00:00:00.000Z`);
      dateFilter.$lte = new Date(`${year}-12-31T23:59:59.999Z`);
    }

    if (Object.keys(dateFilter).length > 0) {
      docMatch.createAt = dateFilter;
    }

    // Tối ưu RAM: Chỉ lấy các trường cần thiết
    const documents = await Document.find(docMatch)
      .select('assignedToUsers docType deadlineDay')
      .lean();

    // --- Tính toán thống kê trên RAM (O(N)) thay vì vòng lặp lồng nhau O(N*M) ---
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);

    for (const doc of documents) {
      let isOverdue = false;
      if (doc.deadlineDay) {
        const deadline = new Date(doc.deadlineDay);
        deadline.setUTCHours(0, 0, 0, 0);
        if (deadline < now) {
          isOverdue = true;
        }
      }

      for (const assigned of doc.assignedToUsers || []) {
        const userIdStr = assigned.userId.toString();
        const stat = userStatsMap[userIdStr];
        if (!stat) continue; // Bỏ qua nếu user không nằm trong query hiện tại

        if (doc.docType === 'received') stat.totalReceived++;
        if (doc.docType === 'sent') stat.totalSent++;
        if (assigned.isRead === false) stat.totalUnread++;

        if (assigned.onTime === 'onTime') stat.onTimeCount++;
        else if (assigned.onTime === 'soon') stat.soonCount++;
        else if (assigned.onTime === 'late') stat.lateCount++;
        else if (assigned.onTime === 'pending') {
          if (isOverdue) stat.unhandledCount++;
          else stat.pendingCount++;
        }
      }
    }

    // --- build match cho Reply ---
    let replyMatch = { replyBy: { $ne: null } };
    if (userId) {
      replyMatch.replyBy = new mongoose.Types.ObjectId(String(userId));
    }
    
    if (Object.keys(dateFilter).length > 0) {
      replyMatch.replyAt = dateFilter;
    }

    const replies = await Reply.find(replyMatch).select('replyBy').lean();

    for (const r of replies) {
      const userIdStr = r.replyBy.toString();
      const stat = userStatsMap[userIdStr];
      if (stat) {
        stat.totalReplied++;
      }
    }

    // --- build kết quả ---
    const result = users.map(u => userStatsMap[u._id.toString()]);

    return res.json(result);

  } catch (error) {
    console.error("Lỗi khi thống kê tài liệu:", error);
    return res.status(500).json({ message: "Không thể thống kê tài liệu. Vui lòng thử lại sau." });
  }
}

module.exports = { getUserStatistics };
