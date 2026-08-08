const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { exec } = require("child_process");
const mongoose = require("mongoose");
const RepliedDoc = require("../models/repliedDoc.model");
const Document = require("../models/document.model");
const User = require("../models/user.model");
const dotenv = require("dotenv");
const { Readable } = require("stream");
dotenv.config();

// Google Drive Authentication
async function authorize() {
    const adminEmail = process.env.GOOGLE_ADMIN_EMAIL || 'qlvb@nsgpc.edu.vn';
    const user = await User.findOne({ email: adminEmail, 'google.refreshToken': { $ne: null } });
    
    if (!user) {
      throw new Error(`Admin account (${adminEmail}) has not authorized Google Drive.`);
    }

    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
        access_token: user.google.accessToken,
        refresh_token: user.google.refreshToken,
    });
    
    return oauth2Client;
}

// Helper function to get or create a folder like "YYYY-MM"
async function getOrCreateMonthFolder(drive) {
  const date = new Date();
  const folderName = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const parentId = process.env.DRIVE_FOLDER_ID;

  const query = `name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const response = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (response.data.files && response.data.files.length > 0) {
    return response.data.files[0].id;
  }

  const folderMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentId],
  };

  const createResponse = await drive.files.create({
    resource: folderMetadata,
    fields: 'id',
  });

  return createResponse.data.id;
}

const replyDoc = async (req, res) => {
    try {
        const parseJSON = (data) => {
            try {
                return typeof data === "string" ? JSON.parse(data) : data;
            } catch (error) {
                throw new Error(`Invalid JSON format for: ${data}`);
            }
        };

        let {
            replyBy,
            status,
            representFor,
            docVariant,
            repliedDoc,
            shortDescription,
            replyAt,
            intendedRecipient, // FE gửi lên, luôn là mảng
        } = req.body;

        if (!replyBy) {
            return res.status(400).json({ message: "Missing required field: replyBy" });
        }

        let finalRecipientIds = [];

        // Nếu có repliedDoc thì lấy sentBy từ văn bản gốc
        if (repliedDoc) {
            const originalDocument = await Document.findById(repliedDoc).select("sentBy");
            if (!originalDocument) {
                return res.status(404).json({ message: "Original document not found" });
            }
            if (originalDocument.sentBy) {
                finalRecipientIds.push(originalDocument.sentBy.toString());
            }
        }

        // Nếu FE có gửi intendedRecipient thì thêm vào
        if (intendedRecipient) {
            const parsedRecipients = parseJSON(intendedRecipient);
            if (!Array.isArray(parsedRecipients)) {
                return res.status(400).json({ message: "intendedRecipient must be an array" });
            }
            finalRecipientIds.push(...parsedRecipients.map(id => id.toString()));
        }

        // Loại trùng
        finalRecipientIds = [...new Set(finalRecipientIds)];

        if (finalRecipientIds.length === 0) {
            return res.status(400).json({ message: "No intendedRecipient provided or resolved" });
        }

        // Ủy quyền Google Drive
        const auth = await authorize();
        const drive = google.drive({ version: "v3", auth });

        const parsedRepresentFor = parseJSON(representFor);
        if (!Array.isArray(parsedRepresentFor) || parsedRepresentFor.length === 0) {
            return res.status(400).json({ message: "Invalid representFor data" });
        }

        const validatedRepresentFor = parsedRepresentFor.map((item, index) => {
            if (!item.representForType || !item.representForId) {
                throw new Error(`Missing required fields in representFor at index ${index}`);
            }

            if (!["User", "Department"].includes(item.representForType)) {
                throw new Error(`Invalid representForType at index ${index}`);
            }

            return {
                representForType: item.representForType,
                representForId: item.representForId,
            };
        });

        const monthFolderId = await getOrCreateMonthFolder(drive);

        const uploadPromises = req.files.map(async (file) => {
            const fileMetadata = {
                name: file.originalname,
                parents: [monthFolderId],
            };

            const media = {
                mimeType: file.mimetype,
                body: Readable.from(file.buffer),
            };

            const response = await drive.files.create({
                resource: fileMetadata,
                media: media,
                fields: "id, name, mimeType, size",
            });

            return {
                fileId: response.data.id,
                fileName: response.data.name,
                mimeType: response.data.mimeType,
                size: response.data.size,
                uploadedByName: req.user?.name || "Người dùng",
                uploadDate: new Date()
            };
        });

        const uploadedFiles = await Promise.all(uploadPromises);

        const newReplyDoc = new RepliedDoc({
            replyBy,
            status,
            representFor: validatedRepresentFor,
            docVariant,
            repliedDoc: repliedDoc || null,
            shortDescription,
            replyAt,
            files: uploadedFiles,
            intendedRecipient: finalRecipientIds,
        });

        await newReplyDoc.save();
        res.status(201).json({ message: "ReplyDoc created successfully" });

    } catch (error) {
        console.error("Error in replyDoc: ", error);
        res.status(500).json({ message: "Error in replyDoc", error: error.message });
    }
};



const updateReplyDocStatus = async (req, res) => {
    try {
      const { repliedDocId, action } = req.body;
  
      // Kiểm tra tính hợp lệ của repliedDocId
      if (!mongoose.Types.ObjectId.isValid(repliedDocId)) {
        return res.status(400).json({ message: "Invalid repliedDoc ID" });
      }
  
      // Kiểm tra action hợp lệ (chỉ chấp nhận 'approve' hoặc 'reject')
      if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ message: "Invalid action. Use 'approve' or 'reject' only." });
      }
  
      // Xác định status mới dựa trên action
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
  
      // Tìm document bằng findById để có thể gọi save() sau đó
      const repliedDoc = await RepliedDoc.findById(repliedDocId);
      if (!repliedDoc) {
        return res.status(404).json({ message: "RepliedDoc not found" });
      }
  
      // Cập nhật các trường cần thiết
      repliedDoc.status = newStatus;
      // Cập nhật trường 'action' để middleware pre-save tự động xử lý thời gian (approvalTime hoặc rejectionTime)
      repliedDoc.action = newStatus;
      
      // Nếu là rejected và có rejectionReason được gửi kèm, cập nhật rejectionReason
      if (newStatus === 'rejected' && req.body.rejectionReason) {
        repliedDoc.rejectionReason = req.body.rejectionReason;
      }
  
      // Lưu document để kích hoạt middleware pre-save
      await repliedDoc.save();
  
      res.status(200).json({
        message: `Document has been ${newStatus} successfully`,
        data: repliedDoc,
      });
    } catch (error) {
      console.error("Error in updateReplyDocStatus: ", error);
      res.status(500).json({ message: "Internal server error" });
    }
  };
  

  const getAllRepliedDocs = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * parseInt(limit);
        const parsedLimit = parseInt(limit);

        const docs = await RepliedDoc.find()
            .sort({ replyAt: -1 })
            .skip(skip)
            .limit(parsedLimit);

        const total = await RepliedDoc.countDocuments();
            
        res.status(200).json({ data: docs, total });
    } catch (error) {
        console.error("Error in getAllRepliedDocs: ", error);
        res.status(500).json({ message: "Error in getAllRepliedDocs", error });
    }
};

const getRepliedDocsByUser = async (req, res) => {
    try {
        const { userID } = req.params;
        const { page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * parseInt(limit);
        const parsedLimit = parseInt(limit);

        // Lấy danh sách văn bản với phân trang
        const docs = await RepliedDoc.find({ replyBy: userID })
            .sort({ replyAt: -1 })
            .skip(skip)
            .limit(parsedLimit);

        // Tính tổng số văn bản theo userID
        const total = await RepliedDoc.countDocuments({ replyBy: userID });

        res.status(200).json({
            data: docs,
            total: total,
        });
    } catch (error) {
        console.error("Error in getRepliedDocsByUser: ", error);
        res.status(500).json({ message: "Error in getRepliedDocsByUser", error });
    }
};
const getRepliedDocById = async (req, res) => {
    try {
        const { repliedDocId } = req.params;
        const doc = await RepliedDoc.findById(repliedDocId)
            .populate('docVariant', 'docVariantName') // Nếu cần thông tin loại văn bản 
            .populate('repliedDoc', 'shortDescription docCode') // Nếu cần thông tin văn bản gốc
            .populate('replyBy', 'name'); // Nếu cần thông tin người trả lời

        if (!doc) {
            return res.status(404).json({ message: "Replied document not found" });
        }

        res.status(200).json(doc);
    } catch (error) {
        console.error("Error in getRepliedDocById: ", error);
        res.status(500).json({ message: "Error fetching replied document", error: error.message });
    }
};


const updateRepliedDoc = async (req, res) => {
    try {
      const { repliedDocId } = req.params;
      if (!repliedDocId) {
        return res.status(400).json({ message: "Missing replied document ID" });
      }
  
      let existingDoc = await RepliedDoc.findById(repliedDocId);
      if (!existingDoc) {
        return res.status(404).json({ message: "Replied document not found" });
      }
  
      const auth = await authorize();
      const drive = google.drive({ version: "v3", auth });
  
      const fieldsToUpdate = [
        "representFor",
        "docVariant",
        "shortDescription",
        "replyAt",
      ];
  
      // Cập nhật các trường thông thường
      for (const field of fieldsToUpdate) {
        if (req.body[field] !== undefined) {
          if (field === "representFor" && typeof req.body[field] === "string") {
            try {
              req.body[field] = JSON.parse(req.body[field]);
            } catch (error) {
              return res.status(400).json({ message: "Invalid format for representFor" });
            }
            if (!Array.isArray(req.body[field])) {
              return res.status(400).json({ message: "representFor must be an array" });
            }
          }
  
          existingDoc[field] = req.body[field];
        }
      }
  
      // ✅ Cho phép cập nhật intendedRecipient nếu có truyền lên
      if (req.body.intendedRecipient !== undefined) {
        let parsedRecipients = req.body.intendedRecipient;
  
        if (typeof parsedRecipients === "string") {
          try {
            parsedRecipients = JSON.parse(parsedRecipients);
          } catch (err) {
            return res.status(400).json({
              message: "Invalid JSON format for intendedRecipient",
            });
          }
        }
  
        if (
          !Array.isArray(parsedRecipients) ||
          !parsedRecipients.every((id) => mongoose.Types.ObjectId.isValid(id))
        ) {
          return res.status(400).json({
            message: "Invalid format for intendedRecipient (must be array of ObjectId)",
          });
        }
  
        existingDoc.intendedRecipient = parsedRecipients;
      }
  
      // 🧠 Xử lý cập nhật file
      const existingFiles = req.body.existingFiles ? JSON.parse(req.body.existingFiles) : [];
  
      // 1. Xoá file cũ khỏi Drive nếu không còn trong danh sách existingFiles
      if (existingDoc.files && Array.isArray(existingDoc.files)) {
        for (const oldFile of existingDoc.files) {
          const stillExists = existingFiles.find(f => f.fileId === oldFile.fileId);
          if (!stillExists) {
            try {
              await drive.files.delete({ fileId: oldFile.fileId });
            } catch (err) {
              console.warn(`Failed to delete file ${oldFile.fileId}:`, err.message);
            }
          }
        }
      }
  
      // 2. Giữ lại file cũ vẫn còn
      const keptOldFiles = existingFiles;
  
      // 3. Upload file mới
      const monthFolderId = await getOrCreateMonthFolder(drive);
      const uploadedFiles = [];
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const fileMetadata = {
            name: file.originalname,
            parents: [monthFolderId],
          };
          const media = {
            mimeType: file.mimetype,
            body: Readable.from(file.buffer),
          };
  
          const response = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: "id, name, mimeType, size",
          });
  
          uploadedFiles.push({
            fileId: response.data.id,
            fileName: response.data.name,
            mimeType: response.data.mimeType,
            size: response.data.size,
            uploadedByName: req.user?.name || "Người dùng",
            uploadDate: new Date()
          });
        }
      }
  
      // 4. Gộp lại
      existingDoc.files = [...keptOldFiles, ...uploadedFiles];
  
      existingDoc.status = "pending";
      await existingDoc.save();
  
      res.status(200).json({
        message: "Replied document updated successfully!",
        document: existingDoc,
      });
    } catch (error) {
      console.error("Error in updateRepliedDoc:", error);
      res.status(500).json({ message: "Error updating replied document", error: error.message });
    }
};
  
const deleteRepliedDoc = async (req, res) => {
    try {
        const { repliedDocId } = req.params;
        const { replyBy } = req.body;

        const doc = await RepliedDoc.findOneAndDelete({ _id: repliedDocId, replyBy });
        const auth = await authorize();
        const drive = google.drive({ version: "v3", auth });
        if (!doc) {
            return res.status(404).json({ message: "Document not found or permission denied" });
        }
           
        if (doc.files && Array.isArray(doc.files) && doc.files.length > 0) {
            for (const file of doc.files) {
                try {
                    await drive.files.delete({ fileId: file.fileId });
                    console.log(`Deleted file from Drive: ${file.fileId}`);
                } catch (err) {
                    console.warn(`Failed to delete file ${file.fileId} on Drive:`, err.message);
                }
            }
        }

        res.status(200).json({ message: "Reply document deleted successfully" });
    } catch (error) {
        console.error("Error in deleteRepliedDoc: ", error);
        res.status(500).json({ message: "Error in deleteRepliedDoc", error });
    }
};
const getPendingReplyCountForUser = async (req, res) => {
    try {
      const { userID } = req.params;
  
      // Kiểm tra userID có hợp lệ không (giả sử dùng mongoose ObjectId)
      if (!mongoose.Types.ObjectId.isValid(userID)) {
        return res.status(400).json({ message: "Invalid User ID format" });
      }
  
      // Đếm số văn bản có trạng thái 'pending' hoặc 'rejected' của userID
      const count = await RepliedDoc.countDocuments({
        replyBy: userID,
        status: { $in: ["pending", "rejected"] }, // Bao gồm cả pending và rejected
      });
  
      res.status(200).json({ pendingAndRejectedCount: count });
    } catch (error) {
      console.error("Error in getPendingReplyCountForUser: ", error);
      res.status(500).json({
        message: "Error getting pending and rejected reply count for user",
        error: error.message,
      });
    }
};

const getPendingRepliesForRecipient = async (req, res) => {
    try {
        const { recipientID } = req.params; // Lấy ID của manager/admin từ route

        if (!mongoose.Types.ObjectId.isValid(recipientID)) {
             return res.status(400).json({ message: "Invalid Recipient ID format" });
        }

        const count = await RepliedDoc.countDocuments({
            intendedRecipient: recipientID, // <--- Lọc theo người nhận dự kiến
            status: 'pending'
        });

        res.status(200).json({ pendingCount: count });
    } catch (error) {
        console.error("Error in getPendingRepliesForRecipient: ", error);
        res.status(500).json({ message: "Error getting pending reply count for recipient", error: error.message });
    }
};

const getPendingRepliesListForRecipient = async (req, res) => {
    try {
        const { recipientID } = req.params; // Lấy ID của manager/admin từ route
        const { page = 1, limit = 10 } = req.query; // Lấy tham số phân trang
        const skip = (page - 1) * parseInt(limit);
        const parsedLimit = parseInt(limit);

        // Kiểm tra recipientID hợp lệ
        if (!mongoose.Types.ObjectId.isValid(recipientID)) {
             return res.status(400).json({ message: "Invalid Recipient ID format" });
        }

        // Điều kiện lọc
        const filter = {
            intendedRecipient: recipientID,
          
        };

        // Lấy danh sách văn bản với phân trang
        const docs = await RepliedDoc.find(filter)
            .populate('docVariant', 'docVariantName') // Populate nếu cần hiển thị tên loại VB
            .populate('repliedDoc', 'shortDescription docCode docNum') // Populate nếu cần hiển thị thông tin VB gốc
            .populate('replyBy', 'name email') // Populate để biết ai đã gửi trả lời
            .sort({ replyAt: -1 }) // Sắp xếp theo ngày trả lời mới nhất
            .skip(skip)
            .limit(parsedLimit);

        // Tính tổng số văn bản thỏa mãn điều kiện lọc
        const total = await RepliedDoc.countDocuments(filter);

        res.status(200).json({
            data: docs,
            total: total,
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parsedLimit)
        });
    } catch (error) {
        console.error("Error in getPendingRepliesListForRecipient: ", error);
        res.status(500).json({ message: "Error fetching pending replies list for recipient", error: error.message });
    }
};


const searchRepliedDocs = async (req, res) => {
  try {
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

    // --- Lọc theo intendedRecipient / replyBy ---
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      if (searchAs === "user") {
        matchStage.replyBy = new mongoose.Types.ObjectId(userId);
      } else {
        matchStage.intendedRecipient = new mongoose.Types.ObjectId(userId);
      }
    }

    // --- Lọc theo ngày phản hồi ---
    if (replyAtFrom || replyAtTo) {
      matchStage.replyAt = {};
      if (replyAtFrom) matchStage.replyAt.$gte = new Date(replyAtFrom);
      if (replyAtTo) {
        const endOfDay = new Date(replyAtTo);
        endOfDay.setHours(23, 59, 59, 999);
        matchStage.replyAt.$lte = endOfDay;
      }
    }

    // --- Lọc theo replyBy ---
    if (replyBy && mongoose.Types.ObjectId.isValid(replyBy)) {
      matchStage.replyBy = new mongoose.Types.ObjectId(replyBy);
    }

    // --- Lọc theo status ---
    if (status) matchStage.status = status;

    // --- Lọc theo docVariant ---
    if (docVariant && mongoose.Types.ObjectId.isValid(docVariant)) {
      matchStage.docVariant = new mongoose.Types.ObjectId(docVariant);
    }

    // === PIPELINE ===
    const pipeline = [
      { $match: matchStage },

      // --- Join sang Document ---
      {
        $lookup: {
          from: "documents",
          localField: "repliedDoc",
          foreignField: "_id",
          as: "repliedDoc",
        },
      },
      { $unwind: { path: "$repliedDoc", preserveNullAndEmptyArrays: true } },

      // --- Lọc thêm theo soKyHieu, year, deadlineDay ---
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
                    "repliedDoc.docCode": new RegExp(escapeRegex(soKyHieu), "i"),
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

      // --- Populate replyBy ---
      {
        $lookup: {
          from: "users",
          localField: "replyBy",
          foreignField: "_id",
          as: "replyBy",
        },
      },
      { $unwind: { path: "$replyBy", preserveNullAndEmptyArrays: true } },

      // --- Populate docVariant ---
      {
        $lookup: {
          from: "docvariants",
          localField: "docVariant",
          foreignField: "_id",
          as: "docVariant",
        },
      },
      { $unwind: { path: "$docVariant", preserveNullAndEmptyArrays: true } },

      // --- Project kết quả đầy đủ ---
      {
        $project: {
          _id: 1,
          replyAt: 1,
          status: 1,
          shortDescription: 1,
          intendedRecipient: 1,
          representFor: 1,
          files: 1,
          createdAt: 1,
          updatedAt: 1,
          action: 1,
          approvalTime: 1,
          rejectionTime: 1,        
          rejectionReason: 1,
          replyBy: { _id: 1, name: 1, email: 1 },
          docVariant: { _id: 1, docVariantName: 1 },
          repliedDoc: {
            _id: 1,
            docNum: 1,
            docCode: 1,
            shortDescription: 1,
          },
        },
      },
      { $sort: { replyAt: -1 } },
    ];

    const results = await RepliedDoc.aggregate(pipeline);

    res.status(200).json({
      total: results.length,
      data: results,
    });
  } catch (error) {
    console.error("Error in searchRepliedDocs:", error);
    res.status(500).json({
      message: "Error searching replied documents",
      error: error.message,
    });
  }
};

const sentToReview = async (req, res) => {
  try {
    const { id, reviewerId } = req.body;

    if (!id || !reviewerId) {
      return res.status(400).json({
        isSuccess: false,
        message: "Missing required fields: id or reviewerId",
      });
    }

    const repliedDoc = await RepliedDoc.findById(id);
    if (!repliedDoc) {
      return res.status(404).json({
        isSuccess: false,
        message: "Replied document not found",
      });
    }
    repliedDoc.status = "inReview";
    repliedDoc.action = "inReview";
    repliedDoc.reviewer = new mongoose.Types.ObjectId(reviewerId);
    await repliedDoc.save();

    return res.json({
      isSuccess: true,
      message: "Document sent to reviewer successfully",
      data: repliedDoc,
    });
  } catch (error) {
    console.error("❌ sentToReview error:", error);
    return res.status(500).json({
      isSuccess: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};


const getReviewedDoc = async (req, res) => {
  try {
    const { reviewerUser, status } = req.query;

    // Mặc định: lọc theo các status liên quan đến review và lịch sử
    const filter = {
      status: { $in: ["inReview", "rejectedByReviewer", "approvedByReviewer", "approved", "rejected"] },
    };

    // Nếu truyền reviewerUser → lọc theo reviewer
    if (reviewerUser && mongoose.Types.ObjectId.isValid(reviewerUser)) {
      filter.reviewer = reviewerUser;
    }

    // Nếu có truyền status (lọc chính xác)
    if (status) {
      filter.status = status;
    }

    const docs = await RepliedDoc.find(filter)
      .populate("reviewer", "name ")
      .populate("replyBy", "name")
      .populate("repliedDoc", "title code")
      .populate('docVariant', 'docVariantName') // Populate nếu cần hiển thị tên loại VB
      .populate('repliedDoc', 'shortDescription docCode docNum') // Populate nếu cần hiển thị thông tin VB gốc
      .populate('replyBy', 'name email') // Populate để biết ai đã gửi trả lời;
      .sort({ createdAt: -1 })
      .limit(50);

    return res.json({
      isSuccess: true,
      message: "Fetched reviewed documents successfully",
      data: docs,
      // filterUsed: filter, // tiện debug
    });
  } catch (error) {
    console.error("❌ getReviewedDoc error:", error);
    return res.status(500).json({
      isSuccess: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};


const reviewerAction = async (req, res) => {
  try {
    const { id, action, reviewerNotes } = req.body;

    if (!id || !action) {
      return res.status(400).json({
        isSuccess: false,
        message: "Missing required fields: id or action",
      });
    }

    if (!["approvedByReviewer", "rejectedByReviewer"].includes(action)) {
      return res.status(400).json({
        isSuccess: false,
        message: "Invalid action. Must be 'approvedByReviewer' or 'rejectedByReviewer'",
      });
    }

    const repliedDoc = await RepliedDoc.findById(id);
    if (!repliedDoc) {
      return res.status(404).json({
        isSuccess: false,
        message: "Replied document not found",
      });
    }

    // Nếu reject thì bắt buộc ghi chú
    if (action === "rejectedByReviewer" && !reviewerNotes) {
      return res.status(400).json({
        isSuccess: false,
        message: "Reviewer notes are required when rejecting",
      });
    }

    // Cập nhật action + status
    repliedDoc.action = action;
    repliedDoc.status = action;

    // Nếu reject: lưu thời gian reject + ghi chú
    if (action === "rejectedByReviewer") {
      repliedDoc.reviewRejectionTime = new Date();
      if (reviewerNotes) repliedDoc.reviewerNotes = reviewerNotes;

      // Xóa thời gian approve nếu có
      repliedDoc.reviewTime = null;
    }

    // Nếu approve: lưu thời gian approve
    if (action === "approvedByReviewer") {
      repliedDoc.reviewTime = new Date();

      // Xóa thời gian reject nếu có
      repliedDoc.reviewRejectionTime = null;
    }

    await repliedDoc.save();

    return res.json({
      isSuccess: true,
      message: `Reviewer has ${action === "approvedByReviewer" ? "approved" : "rejected"} the document.`,
      data: repliedDoc,
    });
  } catch (error) {
    console.error("❌ reviewerAction error:", error);
    return res.status(500).json({
      isSuccess: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const countInReviewReplyDocs = async (req, res) => {
  try {
    const { reviewerId } = req.query;

    if (!reviewerId) {
      return res.status(400).json({
        isSuccess: false,
        message: "Missing required field: reviewerId",
      });
    }

    // Lấy thông tin user để kiểm tra role
    const user = await User.findById(reviewerId).select("role");

    if (!user) {
      return res.status(404).json({
        isSuccess: false,
        message: "User not found",
      });
    }

    let filter = { status: "inReview" };

    // Nếu user là manager hoặc admin → lấy tất cả
    if (["manager", "admin"].includes(user.role)) {
      // filter giữ nguyên → lấy ALL inReview
    } else if (user.role === "staff") {
      // User thường → chỉ lấy những gì họ xét duyệt
      filter.reviewer = reviewerId;
    } else {
      return res.status(403).json({
        isSuccess: false,
        message: "User does not have permission to view this data.",
      });
    }

    // Đếm văn bản theo điều kiện
    const count = await RepliedDoc.countDocuments(filter);

    return res.json({
      isSuccess: true,
      message: "Counted in-review reply docs successfully",
      count,
    });

  } catch (error) {
    console.error("❌ countInReviewReplyDocs error:", error);
    return res.status(500).json({
      isSuccess: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const downloadDocument = async (req, res) => {
    try {
        const { fileId } = req.params;
        if (!fileId) {
            return res.status(400).json({ isSuccess: false, message: "Missing fileId" });
        }

        const auth = await authorize();
        const drive = google.drive({ version: "v3", auth });

        // Lấy thông tin metadata của file để set header (tên file, mimetype)
        const fileMeta = await drive.files.get({
            fileId: fileId,
            fields: 'name, mimeType'
        });

        const driveRes = await drive.files.get(
            { fileId: fileId, alt: 'media' },
            { responseType: 'stream' }
        );

        res.setHeader('Content-disposition', `attachment; filename="${encodeURIComponent(fileMeta.data.name)}"`);
        res.setHeader('Content-type', fileMeta.data.mimeType);

        driveRes.data
            .on('error', err => {
                console.error("Lỗi khi stream file từ Drive:", err);
                res.status(500).end();
            })
            .pipe(res);

    } catch (error) {
        console.error("❌ downloadDocument error:", error);
        return res.status(500).json({
            isSuccess: false,
            message: "Lỗi khi tải file",
            error: error.message,
        });
    }
};

module.exports = {
    replyDoc, //Trình ký văn bản
    updateReplyDocStatus, //Cập nhật trạng thái văn bản đã trình ký
    getAllRepliedDocs, //Lấy tất cả văn bản đã trình ký
    getRepliedDocsByUser, //Lấy văn bản đã trình ký theo người
    getRepliedDocById, //lấy văn bản đã trình ký theo id
    updateRepliedDoc, //Cập nhật văn bản đã trình ký
    deleteRepliedDoc, //Xóa văn bản đã trình ký
    getPendingReplyCountForUser, // đếm số pending cho người gửi replyereplye
    getPendingRepliesForRecipient,// đếm số pending cho người nhận của repliedreplied
    getPendingRepliesListForRecipient, // lấy theo người nhận của repliedd
    searchRepliedDocs, // Tìm kiếm văn bản đã trình ký với nhiều điều kiện
    sentToReview, // Gửi văn bản đã trình ký cho ban giám hiệu
    reviewerAction, // Hành động của người duyệt
    getReviewedDoc, // Lấy văn bản đã duyệt
    countInReviewReplyDocs, // Đếm số văn bản đang chờ duyệt của người duyệt
    downloadDocument // Tải file về Frontend để gửi cho Local Service
}