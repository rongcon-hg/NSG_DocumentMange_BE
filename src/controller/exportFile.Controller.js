const ExcelJS = require("exceljs");
const mongoose = require("mongoose");
const Document = require("../models/document.model");
const RepliedDoc = require("../models/repliedDoc.model");
const Reply = require("../models/repliedDoc.model");
const { file } = require("googleapis/build/src/apis/file");
const User = mongoose.model("User");
const Department = mongoose.model("Department");

//Controller của báo cáo
async function exportDocumentsToExcel(req, res) {
  try {
    //nhận thông tin fillter từ request
    const {
      year,
      docType,
      docVariant,
      fromDate,
      toDate,
      executorId,
      fromDeadline,
      toDeadline
    } = req.query;

    // Tạo filter object
    const filter = {};

    if (year) {
      filter.year = parseInt(year);
    }

    if (docType) {
      filter.docType = docType;
    }
    if (docVariant) {
      filter.docVariant = docVariant;
    }

    if (fromDate || toDate) {
      filter.createAt = {};
      if (fromDate) {
        filter.createAt.$gte = new Date(fromDate);
      }
      if (toDate) {
        filter.createAt.$lte = new Date(toDate);
      }
    }

    if (executorId) {
      // executorId có thể là người hoặc đơn vị nhận
      filter["assignedToUsers.userId"] = executorId;
    }

    if(fromDeadline|| toDeadline)
      {
        filter.deadlineDay = {};
        if(fromDeadline){
          filter.deadlineDay.$gte = new Date(fromDeadline);
        }
        if(toDeadline){
          filter.deadlineDay.$lte = new Date(toDeadline);
        }

    }
    // Truy vấn thô
    const documents = await Document.find(filter)
    .sort({ createdAt: -1 })   
    .populate([
        { path: "assignedToUsers.userId", select: "name" },
        { path: "unit", select: "unitName" },
        { path: "signer", select: "name" },
        { path: "docVariant", select: "docVariantName" },
      ])
      .lean();

    // Tập hợp ID executor cần truy vấn
    const userIds = [];
    const departmentIds = [];
    for (let doc of documents) {
      for (let executor of doc.executors) {
        if (executor.executorType === "User") {
          userIds.push(executor.executorId);
        } else if (executor.executorType === "Department") {
          departmentIds.push(executor.executorId);
        }
      }
    }

    // Truy vấn batch
    const users = await User.find({ _id: { $in: userIds } }, "name").lean();
    const departments = await Department.find(
      { _id: { $in: departmentIds } },
      "departmentName"
    ).lean();

    const userMap = new Map(users.map((u) => [u._id.toString(), u.name]));
    const deptMap = new Map(
      departments.map((d) => [d._id.toString(), d.departmentName])
    );

    // Gán tên executor
    for (let doc of documents) {
      for (let executor of doc.executors) {
        const id = executor.executorId?.toString();
        executor.executorId =
          executor.executorType === "User"
            ? userMap.get(id) || ""
            : deptMap.get(id) || "";
      }
    }

    // Truy vấn toàn bộ reply một lần
    const docUserPairs = [];
    for (const doc of documents) {
      for (const assigned of doc.assignedToUsers) {
        if (assigned.onTime != null && assigned.userId?._id) {
          docUserPairs.push({
            docId: doc._id.toString(),
            userId: assigned.userId._id.toString(),
          });
        }
      }
    }

    const docIds = [...new Set(docUserPairs.map(p => p.docId))];
    const userIdsForReply = [...new Set(docUserPairs.map(p => p.userId))];

    const replies = await Reply.find(
      {
        repliedDoc: { $in: docIds },
        replyBy: { $in: userIdsForReply },
      },
      "repliedDoc replyBy replyAt"
    ).lean();

    const replyMap = new Map();
    for (const reply of replies) {
      replyMap.set(`${reply.repliedDoc}_${reply.replyBy}`, reply.replyAt);
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Văn bản");

    worksheet.columns = [
      { header: "STT", key: "index", width: 5 },
      { header: "KIỂU VĂN BẢN", key: "docType", width: 20 },
      { header: "LOẠI VĂN BẢN", key: "docCategory", width: 20 },
      { header: "NĂM VĂN BẢN", key: "docYear", width: 15 },
      { header: "CƠ QUAN BAN HÀNH", key: "unit", width: 30 }, 
      { header: "SỐ KÝ HIỆU", key: "symbol", width: 20 },
      { header: "NGÀY VĂN BẢN", key: "docDate", width: 15 },
      { header: "NGÀY BAN HÀNH", key: "issuedDate", width: 15 },
      { header: "HẠN XỬ LÝ", key: "deadline", width: 15 },
      { header: "TRÍCH YẾU", key: "shortDesc", width: 40 },
      { header: "NGƯỜI KÝ", key: "signer", width: 25 },
      { header: "BÚT PHÊ", key: "principalIdea", width: 30 },
      { header: "ĐƠN VỊ / NGƯỜI NHẬN", key: "recipients", width: 30 },
      { header: "NGƯỜI CHỦ TRÌ", key: "mainExecutor", width: 25 },
      { header: "NGÀY HOÀN THÀNH", key: "replyAt", width: 20 },
      { header: "TRẠNG THÁI", key: "status", width: 15 },
    ];

    worksheet.columns.forEach((col) => {
      col.alignment = {
        vertical: "middle",
        horizontal: "center",
        wrapText: true,
      };
    });

    let index = 1;

    for (const doc of documents) {
      const recipients = doc.executors
        .filter(Boolean)
        .map((e) => e.executorId)
        .filter(Boolean)
        .join(", ");
      const assignedUsers = doc.assignedToUsers.filter((a) => a.onTime != null);

      let isFirstRow = true;
      for (const assigned of assignedUsers) {
        const key = `${doc._id.toString()}_${assigned.userId?._id?.toString()}`;
        const replyAt = replyMap.get(key);

        let statusText = "";
        switch (assigned.onTime) {
          case "soon":
            statusText = "Trước hạn";
            break;
          case "onTime":
            statusText = "Đúng hạn";
            break;
          case "late":
            statusText = "Trễ hạn";
            break;
          case "pending":
            statusText = "Đang chờ";
            break;
        }

        worksheet.addRow({
          index: isFirstRow ? index : "",
          docType: isFirstRow
            ? doc.docType === "received"
              ? "Văn bản đến"
              : "Văn bản đi"
            : "",
          docCategory: isFirstRow ? doc.docVariant?.docVariantName || "" : "",
          docYear: isFirstRow ? doc.year || "" : "",
          unit: isFirstRow ? doc.unit?.unitName || "" : "",
          symbol: isFirstRow ? `${doc.docNum}/${doc.docCode}` : "",
          docDate: isFirstRow
            ? new Date(doc.createAt).toLocaleDateString("vi-VN")
            : "",
          issuedDate: isFirstRow
            ? new Date(doc.createdAt).toLocaleDateString("vi-VN")
            : "",
          deadline: isFirstRow
            ? doc.deadlineDay
              ? new Date(doc.deadlineDay).toLocaleDateString("vi-VN")
              : ""
            : "",
          shortDesc: isFirstRow ? doc.shortDescription || "" : "",
          signer: isFirstRow ? doc.signer?.name || "" : "",
          principalIdea: isFirstRow ? doc.principalIdea || "" : "",
          recipients: isFirstRow ? recipients : "",
          mainExecutor: assigned.userId?.name || "",
          replyAt: replyAt ? new Date(replyAt).toLocaleDateString("vi-VN") : "",
          status: statusText,
        });

        isFirstRow = false;
      }

      // Nếu không có assignedUsers
      if (!assignedUsers.length) {
        worksheet.addRow({
          index,
          docType: doc.docType === "received" ? "Văn bản đến" : "Văn bản đi",
          docCategory: doc.docVariant?.docVariantName || "",
          docYear: doc.year || "",
          unit: doc.unit?.unitName || "",
          symbol: `${doc.docNum}/${doc.docCode}`,
          docDate: new Date(doc.createAt).toLocaleDateString("vi-VN"),
          issuedDate: new Date(doc.createdAt).toLocaleDateString("vi-VN"),
          deadline: doc.deadlineDay
            ? new Date(doc.deadlineDay).toLocaleDateString("vi-VN")
            : "",
          shortDesc: doc.shortDescription || "",
          signer: doc.signer?.name || "",
          principalIdea: doc.principalIdea || "",
          recipients,
          mainExecutor: "",
          replyAt: "",
          status: "",
        });
      }

      index++;
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=vanban.xlsx");
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Lỗi khi xuất file Excel:", error);
    res.status(500).json({ error: "Không thể xuất file Excel" });
  }
}


async function exportAllUserStatistics(req, res) {
  try {
    const { year, docVariantId, fromDate, toDate, userId } = req.query;

    const query = { role: { $in: ['manager', 'staff'] } };
    if (userId) {
      query._id = new mongoose.Types.ObjectId(String(userId));
    }

    const users = await User.find(query).lean();

    if (!users.length) {
      return res.status(404).json({ message: "Không tìm thấy người dùng." });
    }

    const docMatch = {};
    if (year) docMatch.year = parseInt(year);
    if (docVariantId)
      docMatch.docVariant = new mongoose.Types.ObjectId(docVariantId);
    if (fromDate || toDate) {
      docMatch.createAt = {};
      if (fromDate) docMatch.createAt.$gte = new Date(fromDate);
      if (toDate) docMatch.createAt.$lte = new Date(toDate);
    }

    const documents = await Document.find(docMatch).lean();

    const replyMatch = { replyBy: { $ne: null } };
    if (year) {
      const startOfYear = new Date(`${year}-01-01T00:00:00.000Z`);
      const endOfYear = new Date(`${parseInt(year) + 1}-01-01T00:00:00.000Z`);
      replyMatch.replyAt = { $gte: startOfYear, $lt: endOfYear };
    }

    const replies = await Reply.find(replyMatch, "replyBy").lean();
    const replyCountMap = {};
    replies.forEach((r) => {
      const uid = r.replyBy.toString();
      replyCountMap[uid] = (replyCountMap[uid] || 0) + 1;
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Thống kê người dùng");

    // Header
    const headerRow = worksheet.addRow([
      "STT",
      "Tên nhân viên",
      "Tổng số văn bản đến",
      "Tổng số văn bản đi",
      "Tổng số văn bản trình ký",
      "Tổng số văn chưa xem",
      "Số lượng văn bản đúng hạn",
      "Số lượng văn bản trước hạn",
      "Số lượng văn bản trễ hạn",
      "Số lượng văn bản đang xử lý",
      "Số lượng văn bản chưa xử lý (quá hạn)",
    ]);

    headerRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });

    let stt = 1;
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

          if (doc.docType === "received") totalReceived++;
          if (doc.docType === "sent") totalSent++;
          if (assigned.isRead === false) totalUnread++;

          if (assigned.onTime === "onTime") onTimeCount++;
          if (assigned.onTime === "soon") soonCount++;
          if (assigned.onTime === "late") lateCount++;

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


      const row = worksheet.addRow([
        stt++,
        user.name,
        totalReceived,
        totalSent,
        replyCountMap[userIdStr] || 0,
        totalUnread,
        onTimeCount,
        soonCount,
        lateCount,
        pendingCount,
        unhandledCount,
      ]);

      row.eachCell((cell) => {
        cell.alignment = { horizontal: "center", vertical: "middle" };
      });
    }

    worksheet.columns.forEach((column) => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const value = cell.value ? cell.value.toString() : "";
        maxLength = Math.max(maxLength, value.length);
      });
      column.width = maxLength + 2;
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=thongke-nguoidung.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Lỗi khi xuất file Excel:", err);
    return res.status(500).json({ message: "Lỗi xuất Excel." });
  }
}



// async function exportRepliedDocsToExcel(req, res) {
//   try {
//     // --- Nhận và xử lý query filter ---
//     const {
//       searchAs,
//       userId,
//       soKyHieu,
//       shortDescription,
//       year,
//       replyAtFrom,
//       replyAtTo,
//       deadlineFrom,
//       deadlineTo,
//       replyBy,
//       status,
//       docVariant,
//     } = req.query;

//     const matchStage = {};
//     if (userId && mongoose.Types.ObjectId.isValid(userId)) {
//       if (searchAs === "user") {
//         matchStage.replyBy = new mongoose.Types.ObjectId(userId);
//       } else {
//         matchStage.intendedRecipient = new mongoose.Types.ObjectId(userId);
//       }
//     }
//     if (replyAtFrom || replyAtTo) {
//       matchStage.replyAt = {};
//       if (replyAtFrom) matchStage.replyAt.$gte = new Date(replyAtFrom);
//       if (replyAtTo) {
//         const endOfDay = new Date(replyAtTo);
//         endOfDay.setHours(23, 59, 59, 999);
//         matchStage.replyAt.$lte = endOfDay;
//       }
//     }
//     if (replyBy && mongoose.Types.ObjectId.isValid(replyBy)) {
//       matchStage.replyBy = new mongoose.Types.ObjectId(replyBy);
//     }
//     if (status) matchStage.status = status;
//     if (docVariant && mongoose.Types.ObjectId.isValid(docVariant)) {
//       matchStage.docVariant = new mongoose.Types.ObjectId(docVariant);
//     }

//     // --- Pipeline aggregate ---
//     const pipeline = [
//       { $match: matchStage },
//       {
//         $lookup: {
//           from: "documents",
//           localField: "repliedDoc",
//           foreignField: "_id",
//           as: "repliedDoc",
//         },
//       },
//       { $unwind: { path: "$repliedDoc", preserveNullAndEmptyArrays: true } },
//       {
//         $lookup: {
//           from: "users",
//           localField: "replyBy",
//           foreignField: "_id",
//           as: "replyBy",
//         },
//       },
//       { $unwind: { path: "$replyBy", preserveNullAndEmptyArrays: true } },
//       {
//         $lookup: {
//           from: "users",
//           localField: "intendedRecipient",
//           foreignField: "_id",
//           as: "intendedRecipient",
//         },
//       },
//       {
//         $lookup: {
//           from: "docvariants",
//           localField: "docVariant",
//           foreignField: "_id",
//           as: "docVariant",
//         },
//       },
//       { $unwind: { path: "$docVariant", preserveNullAndEmptyArrays: true } },
//       {
//         $project: {
//           _id: 1,
//           replyBy: { name: 1, email: 1 },
//           intendedRecipient: { _id: 1, name: 1 },
//           docVariant: { docVariantName: 1 },
//           repliedDoc: {
//             docNum: 1,
//             docCode: 1,
//             shortDescription: 1,
//             createAt: 1,
//             deadlineDay: 1,
//           },
//           shortDescription: 1,
//           replyAt: 1,
//           action: 1,
//           approvalTime: 1,
//           rejectionTime: 1,
//           rejectionReason: 1,
//         },
//       },
//       { $sort: { replyAt: -1 } },
//     ];

//     const results = await RepliedDoc.aggregate(pipeline);

//     // --- Tạo Excel ---
//     const workbook = new ExcelJS.Workbook();
//     const worksheet = workbook.addWorksheet("Báo cáo phản hồi");

//     worksheet.columns = [
//       { header: "STT", key: "index", width: 5 },
//       { header: "Người gửi", key: "sender", width: 25 },
//       { header: "Người nhận", key: "receiver", width: 25 },
//       { header: "Loại văn bản", key: "docVariant", width: 25 },
//       { header: "Số ký hiệu", key: "soKyHieu", width: 20 },
//       { header: "Trích yếu văn bản", key: "repliedDocShort", width: 40 },
//       { header: "Tóm tắt nội dung trả lời", key: "replySummary", width: 40 },
//       { header: "Thời gian ban hành", key: "docCreatedAt", width: 20 },
//       { header: "Hạn xử lý", key: "deadline", width: 20 },
//       { header: "Thời gian trả lời", key: "replyAt", width: 20 },
//       { header: "Thời gian chấp nhận / từ chối", key: "approveRejectTime", width: 25 },
//       { header: "Trạng thái", key: "status", width: 20 },
//       { header: "Lý do", key: "reason", width: 40 },
//     ];

//     worksheet.columns.forEach((col) => {
//       col.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
//     });

//     // --- Hàm format thời gian (GMT+7) ---
//     const formatVNTime = (date) => {
//       if (!date) return "";
//       const vnDate = new Date(date.getTime() + 7 * 60 * 60 * 1000);
//       return vnDate.toLocaleString("vi-VN", {
//         hour12: false,
//         day: "2-digit",
//         month: "2-digit",
//         year: "numeric",
//         hour: "2-digit",
//         minute: "2-digit",
//       });
//     };

//     // --- Ghi dữ liệu ---
//     results.forEach((item, idx) => {
//       const receiver =
//         item.intendedRecipient?.length > 0
//           ? item.intendedRecipient[0].name
//           : "";

//       const actionText =
//         item.action === "approved"
//           ? "Chấp nhận"
//           : item.action === "rejected"
//           ? "Từ chối"
//           : "Đang chờ";

//       const actionTime =
//         item.action === "approved"
//           ? item.approvalTime
//           : item.action === "rejected"
//           ? item.rejectionTime
//           : null;

//       worksheet.addRow({
//         index: idx + 1,
//         sender: item.replyBy?.name || "",
//         receiver,
//         docVariant: item.docVariant?.docVariantName || "",
//         soKyHieu: item.repliedDoc
//           ? `${item.repliedDoc.docNum || ""}/${item.repliedDoc.docCode || ""}`
//           : "",
//         repliedDocShort: item.repliedDoc?.shortDescription || "",
//         replySummary: item.shortDescription || "",
//         docCreatedAt: formatVNTime(item.repliedDoc?.createAt),
//         deadline: formatVNTime(item.repliedDoc?.deadlineDay),
//         replyAt: formatVNTime(item.replyAt),
//         approveRejectTime: formatVNTime(actionTime),
//         status: actionText,
//         reason: item.rejectionReason || "",
//       });
//     });

//     // --- Xuất file ---
//     res.setHeader(
//       "Content-Type",
//       "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
//     );
//     res.setHeader(
//       "Content-Disposition",
//       "attachment; filename=bao_cao_phan_hoi.xlsx"
//     );
//     await workbook.xlsx.write(res);
//     res.end();
//   } catch (error) {
//     console.error("❌ Lỗi xuất Excel:", error);
//     res.status(500).json({ error: "Không thể xuất file Excel" });
//   }
// }
async function exportRepliedDocsToExcel(req, res) {
  try {
    // --- Nhận và xử lý query filter ---
    const {
      searchAs,
      userId,
      soKyHieu,
      shortDescription,
      year,
      replyAtFrom,
      replyAtTo,
      deadlineFrom,
      deadlineTo,
      replyBy,
      status,
      docVariant,
    } = req.query;

    const matchStage = {};
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      if (searchAs === "user") {
        matchStage.replyBy = new mongoose.Types.ObjectId(userId);
      } else {
        matchStage.intendedRecipient = new mongoose.Types.ObjectId(userId);
      }
    }
    if (replyAtFrom || replyAtTo) {
      matchStage.replyAt = {};
      if (replyAtFrom) matchStage.replyAt.$gte = new Date(replyAtFrom);
      if (replyAtTo) {
        const endOfDay = new Date(replyAtTo);
        endOfDay.setHours(23, 59, 59, 999);
        matchStage.replyAt.$lte = endOfDay;
      }
    }
    if (replyBy && mongoose.Types.ObjectId.isValid(replyBy)) {
      matchStage.replyBy = new mongoose.Types.ObjectId(replyBy);
    }
    if (status) matchStage.status = status;
    if (docVariant && mongoose.Types.ObjectId.isValid(docVariant)) {
      matchStage.docVariant = new mongoose.Types.ObjectId(docVariant);
    }

    // --- Pipeline aggregate ---
    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: "documents",
          localField: "repliedDoc",
          foreignField: "_id",
          as: "repliedDoc",
        },
      },
      { $unwind: { path: "$repliedDoc", preserveNullAndEmptyArrays: true } },

      // --- Lọc thêm theo soKyHieu, shortDescription, year, deadlineFrom, deadlineTo ---
      {
        $match: {
          ...(soKyHieu
            ? (() => {
                const escapeRegex = (str) =>
                  str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                if (soKyHieu.includes("/")) {
                  const [numPart, codePart] = soKyHieu.split("/");
                  const num = Number(numPart);
                  const codeRegex = new RegExp(
                    "^" + escapeRegex(codePart.trim()),
                    "i"
                  );
                  return {
                    $and: [
                      { "repliedDoc.docNum": num },
                      { "repliedDoc.docCode": codeRegex },
                    ],
                  };
                } else if (!isNaN(Number(soKyHieu))) {
                  return { "repliedDoc.docNum": Number(soKyHieu) };
                } else {
                  return {
                    "repliedDoc.docCode": new RegExp(
                      escapeRegex(soKyHieu),
                      "i"
                    ),
                  };
                }
              })()
            : {}),

          ...(shortDescription
            ? { shortDescription: { $regex: shortDescription, $options: "i" } }
            : {}),

          ...(year ? { "repliedDoc.year": String(year) } : {}),

          ...(deadlineFrom || deadlineTo
            ? (() => {
                const range = {};
                if (deadlineFrom) range.$gte = new Date(deadlineFrom);
                if (deadlineTo) {
                  const endOfDay = new Date(deadlineTo);
                  endOfDay.setHours(23, 59, 59, 999);
                  range.$lte = endOfDay;
                }
                return { "repliedDoc.deadlineDay": range };
              })()
            : {}),
        },
      },

      {
        $lookup: {
          from: "users",
          localField: "replyBy",
          foreignField: "_id",
          as: "replyBy",
        },
      },
      { $unwind: { path: "$replyBy", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "users",
          localField: "intendedRecipient",
          foreignField: "_id",
          as: "intendedRecipient",
        },
      },
      {
        $lookup: {
          from: "docvariants",
          localField: "docVariant",
          foreignField: "_id",
          as: "docVariant",
        },
      },
      { $unwind: { path: "$docVariant", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          replyBy: { name: 1, email: 1 },
          intendedRecipient: { _id: 1, name: 1 },
          docVariant: { docVariantName: 1 },
          repliedDoc: {
            docNum: 1,
            docCode: 1,
            shortDescription: 1,
            createdAt: 1,
            deadlineDay: 1,
          },
          shortDescription: 1,
          replyAt: 1,
          action: 1,
          approvalTime: 1,
          rejectionTime: 1,
          rejectionReason: 1,
        },
      },
      { $sort: { replyAt: -1 } },
    ];

    const results = await RepliedDoc.aggregate(pipeline);

    // --- Tạo Excel ---
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Báo cáo phản hồi");

    worksheet.columns = [
      { header: "STT", key: "index", width: 5 },
      { header: "Người gửi", key: "sender", width: 25 },
      { header: "Người nhận", key: "receiver", width: 25 },
      { header: "Loại văn bản", key: "docVariant", width: 25 },
      { header: "Số ký hiệu", key: "soKyHieu", width: 20 },
      { header: "Trích yếu văn bản", key: "repliedDocShort", width: 40 },
      { header: "Tóm tắt nội dung trả lời", key: "replySummary", width: 40 },
      { header: "Thời gian ban hành", key: "docCreatedAt", width: 20 },
      { header: "Hạn xử lý", key: "deadline", width: 20 },
      { header: "Thời gian trả lời", key: "replyAt", width: 20 },
      { header: "Thời gian chấp nhận / từ chối", key: "approveRejectTime", width: 25 },
      { header: "Trạng thái", key: "status", width: 20 },
      { header: "Lý do", key: "reason", width: 40 },
    ];

    worksheet.columns.forEach((col) => {
      col.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });

    // --- Hàm format thời gian (GMT+7) ---
    const formatVNTime = (date) => {
      if (!date) return "";
      const vnDate = new Date(date.getTime() + 7 * 60 * 60 * 1000);
      return vnDate.toLocaleString("vi-VN", {
        hour12: false,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    };

    // --- Ghi dữ liệu ---
    results.forEach((item, idx) => {
      const receiver =
        item.intendedRecipient?.length > 0
          ? item.intendedRecipient[0].name
          : "";

      const actionText =
        item.action === "approved"
          ? "Chấp nhận"
          : item.action === "rejected"
          ? "Từ chối"
          : "Đang chờ";

      const actionTime =
        item.action === "approved"
          ? item.approvalTime
          : item.action === "rejected"
          ? item.rejectionTime
          : null;

      worksheet.addRow({
        index: idx + 1,
        sender: item.replyBy?.name || "",
        receiver,
        docVariant: item.docVariant?.docVariantName || "",
        soKyHieu: item.repliedDoc
          ? `${item.repliedDoc.docNum || ""}/${item.repliedDoc.docCode || ""}`
          : "",
        repliedDocShort: item.repliedDoc?.shortDescription || "",
        replySummary: item.shortDescription || "",
        docCreatedAt: formatVNTime(item.repliedDoc?.createdAt),
        deadline: formatVNTime(item.repliedDoc?.deadlineDay),
        replyAt: formatVNTime(item.replyAt),
        approveRejectTime: formatVNTime(actionTime),
        status: actionText,
        reason: item.rejectionReason || "",
      });
    });

    // --- Xuất file ---
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=bao_cao_phan_hoi.xlsx"
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("❌ Lỗi xuất Excel:", error);
    res.status(500).json({ error: "Không thể xuất file Excel" });
  }
}

module.exports = { exportDocumentsToExcel, exportAllUserStatistics,exportRepliedDocsToExcel };
