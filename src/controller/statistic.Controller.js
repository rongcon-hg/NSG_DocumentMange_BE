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

    const users = await User.find(query).lean();

    if (users.length === 0) {
      return res.status(404).json({ message: "No users found matching the query." });
    }

    // --- build match cho Document ---
    let docMatch = {};
    if (docVariantId) docMatch.docVariant = new mongoose.Types.ObjectId(docVariantId);

    const createAtExpr = { $dateToString: { format: "%m-%d", date: "$createAt" } };
    let docExpr = [];

    if (year) {
      docExpr.push({ $eq: [{ $year: "$createAt" }, parseInt(year)] });
    }

    if (fromDate || toDate) {
      const fromMD = fromDate ? new Date(fromDate).toISOString().slice(5, 10) : null;
      const toMD = toDate ? new Date(toDate).toISOString().slice(5, 10) : null;

      if (fromMD && toMD) {
        docExpr.push({ $and: [
          { $gte: [createAtExpr, fromMD] },
          { $lte: [createAtExpr, toMD] }
        ] });
      } else if (fromMD) {
        docExpr.push({ $gte: [createAtExpr, fromMD] });
      } else if (toMD) {
        docExpr.push({ $lte: [createAtExpr, toMD] });
      }
    }

    if (docExpr.length > 0) {
      docMatch.$expr = docExpr.length === 1 ? docExpr[0] : { $and: docExpr };
    }

    const documents = await Document.find(docMatch).lean();

    // --- build match cho Reply ---
    let replyMatch = { replyBy: { $ne: null } };
    const replyAtExpr = { $dateToString: { format: "%m-%d", date: "$replyAt" } };
    let replyExpr = [];

    if (year) {
      replyExpr.push({ $eq: [{ $year: "$replyAt" }, parseInt(year)] });
    }

    if (fromDate || toDate) {
      const fromMD = fromDate ? new Date(fromDate).toISOString().slice(5, 10) : null;
      const toMD = toDate ? new Date(toDate).toISOString().slice(5, 10) : null;

      if (fromMD && toMD) {
        replyExpr.push({ $and: [
          { $gte: [replyAtExpr, fromMD] },
          { $lte: [replyAtExpr, toMD] }
        ] });
      } else if (fromMD) {
        replyExpr.push({ $gte: [replyAtExpr, fromMD] });
      } else if (toMD) {
        replyExpr.push({ $lte: [replyAtExpr, toMD] });
      }
    }

    if (replyExpr.length > 0) {
      replyMatch.$expr = replyExpr.length === 1 ? replyExpr[0] : { $and: replyExpr };
    }

    const replies = await Reply.find(replyMatch, 'replyBy replyAt').lean();

    const replyCountMap = {};
    replies.forEach(r => {
      const userIdStr = r.replyBy.toString();
      replyCountMap[userIdStr] = (replyCountMap[userIdStr] || 0) + 1;
    });

    // --- build kết quả ---
    const result = [];

    for (const user of users) {
      const userIdStr = user._id.toString();

      let totalReceived = 0;
      let totalSent = 0;
      let totalUnread = 0;
      let onTimeCount = 0;
      let soonCount = 0;
      let lateCount = 0;
      let pendingCount = 0;
      let unhandledCount = 0;

      for (const doc of documents) {
        for (const assigned of doc.assignedToUsers || []) {
          if (assigned.userId.toString() !== userIdStr) continue;

          if (doc.docType === 'received') totalReceived++;
          if (doc.docType === 'sent') totalSent++;
          if (assigned.isRead === false) totalUnread++;

          if (assigned.onTime === 'onTime') onTimeCount++;
          if (assigned.onTime === 'soon') soonCount++;
          if (assigned.onTime === 'late') lateCount++;
          if (assigned.onTime === "pending") {
            let isOverdue = false;

            if (doc.deadlineDay) {
              const deadline = new Date(doc.deadlineDay);
              const now = new Date();

              deadline.setUTCHours(0, 0, 0, 0);
              now.setUTCHours(0, 0, 0, 0);

              if (deadline < now) {
                unhandledCount++;
                isOverdue = true;
              }
            }

            if (!isOverdue) {
              pendingCount++;
            }
          }
        }
      }

      result.push({
        userId: user._id,
        userName: user.name,
        totalReceived,
        totalSent,
        totalUnread,
        onTimeCount,
        soonCount,
        lateCount,
        pendingCount,
        unhandledCount,
        totalReplied: replyCountMap[userIdStr] || 0
      });
    }

    return res.json(result);

  } catch (error) {
    console.error("Lỗi khi thống kê tài liệu:", error);
    return res.status(500).json({ message: "Không thể thống kê tài liệu. Vui lòng thử lại sau." });
  }
}



module.exports = { getUserStatistics };
