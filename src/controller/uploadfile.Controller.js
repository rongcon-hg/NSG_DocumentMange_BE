const { google } = require("googleapis");
const fs = require("fs");
const Document = require("../models/document.model");
const User = require("../models/user.model") // Your Mongoose model
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const { Readable } = require("stream");
const { sign } = require("crypto");

dotenv.config();

const DriveConfig = require('../models/driveConfig.model');

// Lấy Folder ID từ DB, nếu không có lấy từ .env
async function getDriveFolderId() {
    const config = await DriveConfig.findOne();
    if (config && config.folderId) return config.folderId;
    return process.env.DRIVE_FOLDER_ID;
}

// Google Drive Authentication using Service Account
async function authorize() {
    const config = await DriveConfig.findOne();
    if (!config || !config.clientEmail || !config.privateKey) {
      throw new Error(`Chưa cấu hình Service Account cho Google Drive. Vui lòng vào Cấu hình Google Drive để thiết lập.`);
    }

    const auth = new google.auth.JWT({
        email: config.clientEmail,
        key: config.privateKey.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/drive'],
    });
    
    return auth;
}

// Helper function to sanitize file names
function sanitizeFileName(str) {
  if (!str) return "";
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
  str = str.replace(/đ/g, "d");
  str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
  str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
  str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
  str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
  str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
  str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
  str = str.replace(/Đ/g, "D");
  str = str.replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, ""); // ̀ ́ ̃ ̉ ̣  huyền, sắc, ngã, hỏi, nặng
  str = str.replace(/\u02C6|\u0306|\u031B/g, ""); // ˆ ̆ ̛  Â, Ê, Ă, Ơ, Ư
  // Remove special characters, replace spaces with hyphens
  str = str.replace(/!|@|%|\^|\*|\(|\)|\+|\=|\<|\>|\?|\/|,|\:|\;|\'|\"|\&|\#|\[|\]|~|\$|_|`|{|}|\||\\/g, "-");
  str = str.replace(/ +/g, " ");
  str = str.trim();
  str = str.replace(/\s+/g, '-');
  str = str.replace(/-+/g, '-');
  return str;
}

async function getOrCreateMonthFolder(drive) {
  const date = new Date();
  const folderName = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const parentId = await getDriveFolderId();
  if (!parentId) throw new Error("Thư mục lưu trữ (Folder ID) chưa được cấu hình.");

  try {
    const query = `name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const response = await drive.files.list({
      q: query,
      fields: 'files(id, name)',
      spaces: 'drive',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
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
      supportsAllDrives: true
    });

    return createResponse.data.id;
  } catch (error) {
    if (error.message && error.message.includes("File not found")) {
      throw new Error(`Không tìm thấy thư mục gốc hoặc Service Account không có quyền truy cập vào ID: ${parentId}. Vui lòng kiểm tra Cấu hình Google Drive.`);
    }
    throw error;
  }
}

async function uploadToDrive(req, res) {
  try {
    

    const parseJSON = (data) => {
      try {
        return typeof data === "string" ? JSON.parse(data) : data;
      } catch (error) {
        throw new Error(`Invalid JSON format for: ${data}`);
      }
    };

    let {
      sentBy,
      docType,
      docVariant,
      year,
      deadlineDay,
      docNum,
      docCode,
      unit,
      signer,
      position,
      departments,
      assignedToUsers,
      principalIdea,
      numOfPages,
      shortDescription,
      note,
      urgency,
      saveAt,
      executors,
      createAt,
      receivedAt,
      repliedDocId
    } = req.body;

    if (!sentBy ) {
      return res.status(400).json({ message: "Missing required field: sentBy" });
    }

    if (docType === 'received' && signer == null) 
    {
      const hieuTruongPosition = await mongoose.model('Position').findOne({ positionName: 'Hiệu trưởng' });
      if (!hieuTruongPosition) {
          throw new Error("Không tìm thấy chức vụ Hiệu trưởng trong hệ thống");
      }
      const signerUser = await User.findOne({ position: hieuTruongPosition._id });

      if (!signerUser) {
          throw new Error("Không tìm thấy user với chức vụ = Hiệu trưởng");
      }

      signer = signerUser._id;
    }
    console.log("signer:", signer);

    const auth = await authorize();
    const drive = google.drive({ version: "v3", auth });

    // Parse fields only if they are strings
    const parsedExecutors = parseJSON(executors);
    const parsedAssignedToUsers = parseJSON(assignedToUsers);

    // Xử lý trường departments: nếu là chuỗi JSON thì parse, nếu không thì giữ nguyên
    let parsedDepartments = typeof departments === "string" ? parseJSON(departments) : departments;
    if (!Array.isArray(parsedDepartments)) {
      parsedDepartments = [parsedDepartments];
    }

    const uploadedFiles = [];
      
    // Xử lý existingFiles từ req.body
    if (req.body.existingFiles) {
      try {
        const parsedExistingFiles = JSON.parse(req.body.existingFiles);
        if (Array.isArray(parsedExistingFiles)) {
          uploadedFiles.push(...parsedExistingFiles.map(file => ({
            fileId: file.fileId,
            fileName: file.fileName,
            mimeType: file.mimeType,
            size: file.size || '',
            uploadedByName: file.uploadedByName || "Hệ thống",
            uploadDate: file.uploadDate || new Date()
          })));
        }
      } catch (error) {
        console.error("Invalid format for existingFiles in uploadToDrive", error);
      }
    }

    if (req.body.uploadedFiles) {
      try {
        const parsedUploadedFiles = JSON.parse(req.body.uploadedFiles);
        if (Array.isArray(parsedUploadedFiles)) {
          uploadedFiles.push(...parsedUploadedFiles.map(file => ({
            fileId: file.fileId,
            fileName: file.fileName,
            mimeType: file.mimeType || '',
            size: file.size || '',
            uploadedByName: "Hệ thống",
            uploadDate: new Date()
          })));
        }
      } catch (error) {
        console.error("Invalid format for uploadedFiles in uploadToDrive", error);
      }
    }

    if (req.files && req.files.length > 0) {
      const monthFolderId = await getOrCreateMonthFolder(drive);

      for (const file of req.files) {
        const fileMetadata = {
          name: sanitizeFileName(file.originalname),
          parents: [monthFolderId],
        };

        const media = {
          mimeType: file.mimetype,
          body: Readable.from(file.buffer),
        };

        const response = await drive.files.create({
          requestBody: fileMetadata,
          media: media,
          fields: "id, name, mimeType, size",
          supportsAllDrives: true
        });

        uploadedFiles.push({
          fileId: response.data.id,
          fileName: response.data.name,
          mimeType: response.data.mimeType,
          size: response.data.size,
        });
      }
    }

    // Save document to MongoDB
    const newDocument = new Document({
      sentBy,
      docType,
      docVariant,
      year,
      deadlineDay,
      docNum,
      docCode,
      unit,
      signer,
      position,
      departments: parsedDepartments, // Dùng mảng đã được xử lý
      assignedToUsers: parsedAssignedToUsers,
      principalIdea,
      numOfPages,
      shortDescription,
      note,
      urgency,
      saveAt,
      executors: parsedExecutors,
      createAt: createAt ? new Date(createAt) : undefined,
      unit: docType === 'received' ? unit : undefined,
      files: uploadedFiles,
      receivedAt: receivedAt ? new Date(receivedAt) : undefined,
    });

    await newDocument.save();

    // Nếu văn bản này được phát hành từ một văn bản trình ký, cập nhật trạng thái isIssued
    if (repliedDocId) {
      try {
        const RepliedDoc = require("../models/repliedDoc.model");
        await RepliedDoc.findByIdAndUpdate(repliedDocId, { isIssued: true });
      } catch (err) {
        console.error("Error updating RepliedDoc isIssued state:", err);
      }
    }

    // Trigger notifications for new document
    const { triggerDocumentNotifications } = require("../service/Notification.service");
    triggerDocumentNotifications(newDocument);

    res.status(201).json({
      message: "Files uploaded successfully!",
      document: newDocument,
    });
  } catch (error) {
    console.error("Error in uploadToDrive:", error);
    res.status(500).json({ message: "Error uploading files", error: error.message });
  }
}

const getAllDocuments = async (req, res) => {
  try {
    const { userId, page = 1, limit = 10 } = req.query; // Nhận userId, page, limit từ FE

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required",
      });
    }

    // Tìm thông tin user từ database
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    let filter = {};

    // Nếu user không phải admin/manager thì chỉ lấy document liên quan
    if (user.role !== "admin" && user.role !== "manager") {
      filter = {
        $or: [
          { sentBy: userId },
          { "executors.executorId": userId },
          { "assignedToUsers.userId": userId },
        ],
      };
    }

    // ===== Pagination =====
    const skip = (Number(page) - 1) * Number(limit);

    const [documents, totalDocuments] = await Promise.all([
      Document.find(filter)
        .populate("docVariant")
        .populate("signer", "name email")
        .populate("position", "positionName")
        .populate("departments", "departmentName")
        .populate("executors.executorId", "name")
        .populate("assignedToUsers.userId", "name email")
        .populate("sentBy", "name")
        .populate("urgency", "urgency")
        .populate("docCode", "docCode")
        .populate("saveAt", "saveAt")
        .populate("createAt", "createAt")
        .populate("unit", "unitName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Document.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      totalDocuments,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(totalDocuments / limit),
      data: documents,
    });
  } catch (error) {
    console.error("Error fetching documents:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching documents",
      error: error.message,
    });
  }
};



const getDocumentById = async (req, res) => {
    try {
        const { documentId } = req.params;

        if (!documentId) {
            return res.status(400).json({ success: false, message: "Document ID is required" });
        }

        const document = await Document.findById(documentId)
            .populate("docVariant")
            .populate("signer", "name email")
            .populate("position", "positionName")
            .populate("departments", "departmentName")
            .populate("executors.executorId", "name")
            .populate("assignedToUsers.userId", "name email")
            .populate("sentBy", "name")
            .populate("urgency", "urgency")
            .populate("docCode", "docCode")
            .populate("unit", "unitName")
            .populate("createAt", "createAt")
            .populate("saveAt", "saveAt")
            .populate("receivedAt", "receivedAt");


        if (!document) {
            return res.status(404).json({ success: false, message: "Document not found" });
        }

        res.status(200).json({ success: true, data: document });
    } catch (error) {
        console.error("Error fetching document:", error);
        res.status(500).json({ success: false, message: "Error fetching document", error: error.message });
    }
};
  
const getNextDocNum = async (req, res) => {
    try {
        const { docType,docVariantId, year } = req.params; 

        if (!docVariantId || !year || !docType) {
            return res.status(400).json({ 
                success: false, 
                message: "docVariantId, docType and year are required" 
            });
        }


        const lastDoc = await Document.findOne({ docVariant: docVariantId, docType:docType, year })
          .sort({ docNum: -1 })
          .select("docNum");

        const nextDocNum = lastDoc ? lastDoc.docNum + 1 : 1; // Nếu không có tài liệu nào, bắt đầu từ 1

        res.status(200).json({ 
            success: true, 
            nextDocNum:nextDocNum 
        });
       
    } catch (error) {
        console.error("Error fetching next docNum:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching next document number",
            error: error.message,
        });
    }
};
  
const getDocumentsByUserAndType = async (req, res) => {
    try {
        const { userId, docType } = req.params;
        const { page = 1, limit = 10 } = req.query;

        const pageNumber = parseInt(page);
        const pageSize = parseInt(limit);

        if (!userId || !["sent", "received"].includes(docType)) {
            return res.status(400).json({
                success: false,
                message: "Invalid userId or docType. docType must be 'sent' or 'received'.",
            });
        }

        let filterCondition = {};

        // 🔹 Lọc văn bản theo loại
        if (docType === "sent") {
            filterCondition = { sentBy: userId, docType: "sent" }; // Lọc theo sentBy
        } else if (docType === "received") {
            // filterCondition = {
            //   docType: "received",
            //   assignedToUsers: { $elemMatch: { userId: userId, status: "received" } },
            // };
            filterCondition = {
              $or: [
                { docType: "received" },
                { assignedToUsers: { $elemMatch: { userId: userId, status: "received" } } }
              ]
            };
        }

        // 🔹 Truy vấn văn bản
        const documents = await Document.find(filterCondition)
            .populate("sentBy", "name ")
            .populate("docVariant")
            .populate("signer", "name email")
            .populate("position", "positionName")
            .populate("departments", "departmentName")
            .populate("executors.executorId", "name")
            .populate("assignedToUsers.userId", "name email")
            .populate("sentBy", "name")
            .populate("docCode", "docCode")
            .populate("unit", "unitName")
            .populate("urgency", "urgency")
            .populate("saveAt", "saveAt")
            .populate("createAt", "createAt")
            .sort({ createdAt: -1 })
            .skip((pageNumber - 1) * pageSize)
            .limit(pageSize);

        const totalDocuments = await Document.countDocuments(filterCondition);
        const totalPages = Math.ceil(totalDocuments / pageSize);

        res.status(200).json({
            success: true,
            userId,
            docType,
            currentPage: pageNumber,
            totalPages,
            totalDocuments,
            data: documents,
        });
    } catch (error) {
        console.error("Error fetching documents:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching documents",
            error: error.message,
        });
    }
};
const getFilteredDocuments = async (req, res) => {
    try {
      let { 
        page = 1, 
        limit = 10, 
        docType, 
        docCode, 
        shortDescription, 
        departments, 
        sentBy, 
        docNum, 
        deadlineDay,
        unit
      } = req.query;
  
      const pageNumber = parseInt(page);
      const pageSize = parseInt(limit);
  
      // ✅ Tạo bộ lọc động theo các điều kiện
      let filter = {};
      if (docType) filter.docType = docType;
      if (docCode) filter.docCode = { $regex: docCode, $options: "i" }; // Tìm kiếm gần đúng
      if (shortDescription) filter.shortDescription = { $regex: shortDescription, $options: "i" };
      if (sentBy) filter.sentBy = sentBy;
      if (docNum) filter.docNum = docNum;
      if (deadlineDay) filter.deadlineDay = new Date(deadlineDay);
      if (departments) filter.departments = { $in: departments.split(",") }; // Cho phép chọn nhiều ID phòng ban
      if (unit) filter.unit = unit;
  
      // ✅ Đếm tổng số tài liệu để tính tổng trang
      const totalDocuments = await Document.countDocuments(filter);
      const totalPages = Math.ceil(totalDocuments / pageSize);
  
      // ✅ Lấy dữ liệu với filter, phân trang & sắp xếp
      const documents = await Document.find(filter)
        .populate("docVariant")
        .populate("signer", "name email")
        .populate("position", "positionName")
        .populate("departments", "departmentName")
        .populate("executors.executorId", "name")
        .populate("assignedToUsers.userId", "name email")
        .populate("sentBy", "name")
        .populate("urgency", "urgency")
        .populate("docCode", "docCode")
        .populate("saveAt", "saveAt")
        .populate("createAt", "createAt")
        .populate("unit", "unitName")
        .sort({ createdAt: -1 }) // Sắp xếp theo điều kiện
        .skip((pageNumber - 1) * pageSize) // Áp dụng phân trang
        .limit(pageSize); // Giới hạn số tài liệu mỗi trang
  
      res.status(200).json({
        success: true,
        currentPage: pageNumber,
        totalPages,
        totalDocuments,
        data: documents,
      });
    } catch (error) {
      console.error("Error fetching filtered documents:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching documents",
        error: error.message,
      });
    }
};

const deleteDocument = async (req, res) => {
    try {
        const { documentId, userID } = req.params;

        // Tìm document trước khi xóa
        const document = await Document.findById(documentId);
        const auth = await authorize();
        const drive = google.drive({ version: "v3", auth });
        if (!document) {
            return res.status(404).json({
                success: false,
                message: "Document not found"
            });
        }

        // Lấy thông tin user
        const user = await User.findById(userID);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        // Kiểm tra quyền: nếu không phải admin và cũng không phải người gửi thì từ chối
        if (user.role !== "admin" && document.sentBy.toString() !== userID) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to delete this document",
            });
        }

        // 🧠 Nếu có file Drive, xóa file trước
        if (document.files && Array.isArray(document.files) && document.files.length > 0) {
            for (const file of document.files) {
                try {
                    await drive.files.delete({ 
                        fileId: file.fileId,
                        supportsAllDrives: true 
                    });
                    console.log(`Deleted file from Drive: ${file.fileId}`);
                } catch (err) {
                    console.warn(`Failed to delete file ${file.fileId} on Drive:`, err.message);
                }
            }
        }

        // Xóa document khỏi MongoDB
        await Document.findByIdAndDelete(documentId);

        res.status(200).json({
            success: true,
            message: "Document and associated files deleted successfully"
        });
    } catch (error) {
        console.error("Error deleting document:", error);
        res.status(500).json({
            success: false,
            message: "Error deleting document",
            error: error.message
        });
    }
};

async function isRead(req, res) {
  try {
    const { userId, documentId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(documentId)) {
      return res.status(400).json({ message: "Invalid documentId" });
    }

    // Update trực tiếp vào assignedToUsers.$[elem]
    const result = await Document.updateOne(
      { _id: documentId, "assignedToUsers.userId": userId },
      {
        $set: {
          "assignedToUsers.$.isRead": true,
          "assignedToUsers.$.receivedDate": new Date(),
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "User not found in assignedToUsers" });
    }

    res.status(200).json({
      success: true,
      message: "Marked as read successfully",
    });
  } catch (error) {
    console.error("Error in isRead:", error);
    res.status(500).json({
      success: false,
      message: "Error in isRead",
      error: error.message,
    });
  }
}


async function updateDocument(req, res) {
    try {
      const { documentId } = req.params;
  
      if (!documentId) {
        return res.status(400).json({ message: "Missing document ID" });
      }
  
      let existingDocument = await Document.findById(documentId);
      if (!existingDocument) {
        return res.status(404).json({ message: "Document not found" });
      }
  

  
      const fieldsToUpdate = [
        "sentBy",
        "docType",
        "docVariant",
        "year",
        "deadlineDay",
        "docNum",
        "docCode",
        "unit",
        "signer",
        "position",
        "departments",
        "assignedToUsers",
        "principalIdea",
        "numOfPages",
        "shortDescription",
        "note",
        "urgency",
        "saveAt",
        "executors",
        "createAt",
        "receivedAt",
      ];
  
      for (const field of fieldsToUpdate) {
        if (req.body[field] !== undefined) {
          if (field === "executors") {
            if (typeof req.body.executors === "string") {
              try {
                req.body.executors = JSON.parse(req.body.executors);
              } catch (error) {
                return res.status(400).json({ message: "Invalid format for executors" });
              }
            }
            if (!Array.isArray(req.body.executors)) {
              return res.status(400).json({ message: "Executors must be an array" });
            }
            existingDocument[field] = req.body.executors;
          } else if (field === "assignedToUsers" && typeof req.body.assignedToUsers === "string") {
            try {
              req.body.assignedToUsers = JSON.parse(req.body.assignedToUsers);
            } catch (error) {
              return res.status(400).json({ message: "Invalid format for assignedToUsers" });
            }
            existingDocument[field] = req.body.assignedToUsers;
          } else if (field === "departments") {
            let departments = req.body.departments;
            if (typeof departments === "string") {
              try {
                departments = JSON.parse(departments);
              } catch (error) {
                departments = [departments];
              }
            } else if (!Array.isArray(departments)) {
              departments = [departments];
            }
            existingDocument[field] = departments;
          } else if (field === "deadlineDay") {
            const deadline = req.body.deadlineDay;
            if (deadline === null || deadline === "" || deadline === undefined) {
              existingDocument.deadlineDay = null;
            } else {
              const parsed = new Date(deadline);
              if (!isNaN(parsed)) {
                existingDocument.deadlineDay = parsed;
              } else {
                return res.status(400).json({ message: "Invalid deadlineDay format" });
              }
            }
          } else if (field === "createAt" && typeof req.body.createAt === "string") {
            existingDocument[field] = new Date(req.body.createAt);
          }  else if (field === "receivedAt") {
            const received = req.body.receivedAt;
            if (received === null || received === "" || received === undefined) {
              existingDocument.receivedAt = null;
            } else {
              const parsed = new Date(received);
              if (!isNaN(parsed.getTime())) {
                existingDocument.receivedAt = parsed;
              } else {
                return res.status(400).json({ message: "Invalid receivedAt format" });
              }
            }
          }
           else if (field === "unit") {
            if (existingDocument.docType === 'received') {
              existingDocument[field] = req.body[field] || undefined;
            } else {
              existingDocument[field] = undefined;
            }
          } else {
            existingDocument[field] = req.body[field];
          }
        }
      }
  
      // Handle file updates
      let updatedFiles = existingDocument.files || [];
  
      // Xử lý existingFiles từ req.body
      if (req.body.existingFiles) {
        try {
          const parsedExistingFiles = JSON.parse(req.body.existingFiles);
          if (!Array.isArray(parsedExistingFiles)) {
            return res.status(400).json({ message: "existingFiles must be an array" });
          }
  
          // Chỉ xóa thông tin trên hệ thống, KHÔNG xóa file trên Google Drive
          // theo yêu cầu mới nhất của người dùng.
  
          // Cập nhật danh sách file cũ
          updatedFiles = parsedExistingFiles.map(file => ({
            fileId: file.fileId,
            fileName: file.fileName,
            mimeType: file.mimeType,
            size: file.size || '', // Nếu schema yêu cầu size
          }));
        } catch (error) {
          return res.status(400).json({ message: "Invalid format for existingFiles" });
        }
      }
  
      // Thêm file mới nếu có
      if (req.files && req.files.length > 0) {
        const auth = await authorize();
        const drive = google.drive({ version: "v3", auth });
        const monthFolderId = await getOrCreateMonthFolder(drive);
        for (const file of req.files) {
          const fileMetadata = {
            name: sanitizeFileName(file.originalname),
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
            supportsAllDrives: true
          });
  
          updatedFiles.push({
            fileId: response.data.id,
            fileName: response.data.name,
            mimeType: response.data.mimeType,
            size: response.data.size,
          });
        }
      }
  
      // Cập nhật danh sách file
      existingDocument.files = updatedFiles;
  
      await existingDocument.save();

      const { syncCalendarForDocument } = require("../service/Notification.service");
      await syncCalendarForDocument(existingDocument);
  
      res.status(200).json({
        message: "Document updated successfully!",
        document: existingDocument,
      });
    } catch (error) {
      console.error("Error in updateDocument:", error);
      if (!res.headersSent) {
        if (error.message && error.message.includes("File not found")) {
           return res.status(500).json({ message: "Lỗi kết nối Google Drive: Không tìm thấy thư mục lưu trữ (có thể thư mục gốc đã bị xóa hoặc mất quyền chia sẻ). Vui lòng kiểm tra lại Cấu hình Google Drive.", error: error.message });
        }
        res.status(500).json({ message: "Lỗi cập nhật: " + error.message, error: error.message });
      }
    }
}
  
const getDocumentsBySentBy = async (req, res) => {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 10 } = req.query;
  
      const pageNumber = parseInt(page);
      const pageSize = parseInt(limit);
  
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "userId is required",
        });
      }
  
      const documents = await Document.find({ sentBy: userId })
        .populate("docVariant")
        .populate("signer", "name email")
        .populate("position", "positionName")
        .populate("departments", "departmentName")
        .populate("executors.executorId", "name")
        .populate("assignedToUsers.userId", "name email")
        .populate("sentBy", "name")
        .populate("unit", "unitName")
        .sort({ createdAt: -1 })
        .skip((pageNumber - 1) * pageSize)
        .limit(pageSize);
  
      const totalDocuments = await Document.countDocuments({ sentBy: userId });
      const totalPages = Math.ceil(totalDocuments / pageSize);
  
      res.status(200).json({
        success: true,
        currentPage: pageNumber,
        totalPages,
        totalDocuments,
        data: documents,
      });
    } catch (error) {
      console.error("Error fetching documents by sentBy:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching documents",
        error: error.message,
      });
    }
};
const getDocumentsByAssignedTo = async (req, res) => {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 10 } = req.query;
  
      const pageNumber = parseInt(page);
      const pageSize = parseInt(limit);
  
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "userId is required",
        });
      }
  
      const documents = await Document.find({ "assignedToUsers.userId": userId })
        .populate("docVariant")
        .populate("signer", "name email")
        .populate("position", "positionName")
        .populate("departments", "departmentName")
        .populate("executors.executorId", "name")
        .populate("assignedToUsers.userId", "name email")
        .populate("sentBy", "name")
        .populate("unit", "unitName")
        .sort({ createdAt: -1 })
        .skip((pageNumber - 1) * pageSize)
        .limit(pageSize)
        .lean();
  
      const totalDocuments = await Document.countDocuments({ "assignedToUsers.userId": userId });
      const totalPages = Math.ceil(totalDocuments / pageSize);
  
      res.status(200).json({
        success: true,
        currentPage: pageNumber,
        totalPages,
        totalDocuments,
        data: documents,
      });
    } catch (error) {
      console.error("Error fetching documents by assignedTo:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching documents",
        error: error.message,
      });
    }
};

const getTotalDocNum = async (req, res) => {
    try {
        const { docVariantId , year } = req.params; // Nhận docType và year từ params

        if (!docVariantId || !year) {
            return res.status(400).json({ message: "docVariantId or year are required" });
        }

        const totalDocuments = await Document.countDocuments({ docType: "received" ,docVariant: docVariantId, year });
        const totalNum = totalDocuments + 1; // Tính tổng số tài liệu
        res.status(200).json({
            success: true,
            totalNum,
        });
    } catch (error) {
        console.error("Error fetching total document number:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching total document number",
            error: error.message,
        });
    }
}



const getDeadlineStatusCounts = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid or missing userId" });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const documents = await Document.find({
      "assignedToUsers.userId": new mongoose.Types.ObjectId(userId),
      deadlineDay: { $ne: null }
    });

    let soonCount = 0;
    let dueTodayCount = 0;
    let overdueCount = 0;

    documents.forEach(doc => {
      // Chỉ xử lý nếu user được giao và trạng thái onTime là "pending"
      const assigned = doc.assignedToUsers.find(
        a => a.userId.toString() === userId && a.onTime === "pending"
      );

      if (!assigned) return;

      const deadline = new Date(doc.deadlineDay);
      deadline.setHours(0, 0, 0, 0);

      const diffInDays = Math.floor((deadline - today) / (1000 * 60 * 60 * 24));

      if (diffInDays <= 2 && diffInDays > 0) {
        soonCount++;
      } else if (diffInDays === 0) {
        dueTodayCount++;
      } else if (diffInDays < 0) {
        overdueCount++;
      }
    });

    return res.json({
      soonCount,
      dueTodayCount,
      overdueCount
    });
  } catch (error) {
    console.error("Error fetching deadline counts:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};


function escapeRegex(text = "") {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const removeVietnameseTones = (str) => {
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g,"a"); 
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g,"e"); 
    str = str.replace(/ì|í|ị|ỉ|ĩ/g,"i"); 
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g,"o"); 
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g,"u"); 
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g,"y"); 
    str = str.replace(/đ/g,"d");
    str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
    str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
    str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
    str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
    str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
    str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
    str = str.replace(/Đ/g, "D");
    return str;
};

const createVietnameseRegex = (keyword) => {
    if (!keyword) return '';
    const normalized = removeVietnameseTones(keyword.trim().toLowerCase());
    
    const charMap = {
        'a': '[aAàÀáÁạẠảẢãÃâÂầẦấẤậẬẩẨẫẪăĂằẰắẮặẶẳẲẵẴ]',
        'e': '[eEèÈéÉẹẸẻẺẽẼêÊềỀếẾệỆểỂễỄ]',
        'i': '[iIìÌíÍịỊỉỈĩĨ]',
        'o': '[oOòÒóÓọỌỏỎõÕôÔồỒốỐộỘổỔỗỖơƠờỜớỚợỢởỞỡỠ]',
        'u': '[uUùÙúÚụỤủỦũŨưƯừỪứỨựỰửỬữỮ]',
        'y': '[yYỳỲýÝỵỴỷỶỹỸ]',
        'd': '[dDđĐ]'
    };

    let regexStr = '';
    for (let i = 0; i < normalized.length; i++) {
        const char = normalized[i];
        if (charMap[char]) {
            regexStr += charMap[char];
        } else if (/[a-z0-9]/.test(char)) {
            regexStr += char;
        } else if (char === ' ') {
            regexStr += '\\s+';
        } else {
            regexStr += escapeRegex(char);
        }
    }
    
    regexStr = regexStr.replace(/(?:\\s\+)+/g, '\\s+');
    
    return regexStr;
};

const searchDocuments = async(req, res) => {
  try {
    const {
      keyword,
      executors, // id hoặc danh sách id
      docType,
      docVariant, // loại văn bản
      urgency, // "normal" | "high" | "immediately"
      year,
      status, // trạng thái trong assignedToUsers: "received", "sent",...
      isRead,
      userId,
      unit,
      deadlineFrom,
      deadlineTo,
      createFrom,
      createTo,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortDir = "desc",
    } = req.query;

    const filter = {};

    // ===== Tìm kiếm chung: Số/Ký hiệu & Trích yếu =====
    if (keyword) {
      const regex = new RegExp(createVietnameseRegex(keyword), "i");
      const orConditions = [
        { shortDescription: regex }
      ];
      
      if (keyword.includes("/")) {
        const [numPart, codePart] = keyword.split("/");
        const num = Number(numPart);
        if (!isNaN(num)) {
          const codeRegex = new RegExp("^" + createVietnameseRegex(codePart.trim()), "i");
          orConditions.push({ docNum: num, docCode: codeRegex });
        } else {
          orConditions.push({ docCode: regex });
        }
      } else if (!isNaN(Number(keyword)) && Number(keyword) > 0) {
        orConditions.push({ docNum: Number(keyword) });
        orConditions.push({ docCode: regex });
      } else {
        orConditions.push({ docCode: regex });
      }
      
      if (!filter.$and) filter.$and = [];
      filter.$and.push({ $or: orConditions });
    }

    // ===== Đơn vị/Người nhận (executors) =====
    if (executors) {
      const execArr = Array.isArray(executors)
        ? executors
        : String(executors).split(",").map(s => s.trim());

      const validIds = execArr.filter(id => mongoose.isValidObjectId(id));
      if (validIds.length) {
        filter["executors.executorId"] = { $in: validIds };
      }
    }

    if (userId && mongoose.isValidObjectId(userId)) {
      const elemMatch = { userId: new mongoose.Types.ObjectId(userId) };

      // Nếu có status (vd: received, sent,...)
      if (status) {
        elemMatch.status = status;
      }

      // Nếu có isRead (true / false)
      if (typeof isRead === "string") {
        if (isRead.toLowerCase() === "true") elemMatch.isRead = true;
        else if (isRead.toLowerCase() === "false") elemMatch.isRead = false;
      }

      filter.assignedToUsers = { $elemMatch: elemMatch };
    }

    // ===== Nếu có docType riêng (ngoài user) =====
    if (docType && ["sent", "received"].includes(docType)) {
      filter.docType = docType;
    }
    // ===== Biến thể văn bản (docVariant: ObjectId) =====
    if (docVariant && mongoose.isValidObjectId(docVariant)) {
      filter.docVariant = docVariant;
    }
    
    if (unit) {
      const unitArr = String(unit).split(",").map(u => u.trim());
      const validUnits = unitArr.filter(u => mongoose.isValidObjectId(u));
      if (validUnits.length) {
        filter.unit = { $in: validUnits };
      }
    }

    // ===== Mức độ khẩn (urgency: "normal" | "high" | "immediately") =====
    if (urgency && ["normal", "high", "immediately"].includes(urgency)) {
      filter.urgency = urgency;
    }
    // ===== Năm VB =====
    if (year) {
      filter.year = String(year);
    }

    // ===== Ngày hạn xử lý =====
    if (deadlineFrom || deadlineTo) {
      filter.deadlineDay = {};
      if (deadlineFrom) filter.deadlineDay.$gte = new Date(deadlineFrom);
      if (deadlineTo) filter.deadlineDay.$lte = new Date(deadlineTo);
    }

    // ===== Ngày văn bản (createAt) =====
    if (createFrom || createTo) {
      filter.createAt = {};
      if (createFrom) filter.createAt.$gte = new Date(createFrom);
      if (createTo) filter.createAt.$lte = new Date(createTo);
    }

    // ===== Pagination & Sort =====
    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortDir === "desc" ? -1 : 1 };

    const [items, total] = await Promise.all([
      Document.find(filter)
        .populate("docVariant", "unit")
        .sort(sort)
        .skip(Number(skip))
        .limit(Number(limit))
        .lean(),
      Document.countDocuments(filter),
    ]);

    return res.json({
      ok: true,
      total,
      page: Number(page),
      limit: Number(limit),
      items,
    });
  } catch (err) {
    console.error("searchDocuments error", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
}

const getUnreadDocCount = async (req, res) => {
    try {
        const { userId } = req.params;
        if (!userId) {
            return res.status(400).json({ message: "userId is required" });
        }
        const count = await Document.countDocuments({
            "assignedToUsers": { $elemMatch: { userId: userId, isRead: false } }
        });
        res.status(200).json({ success: true, count });
    } catch (error) {
        console.error("Error fetching unread document count:", error);
        res.status(500).json({ success: false, message: "Error fetching unread document count", error: error.message });
    }
}

module.exports = { 
    uploadToDrive,
    getAllDocuments,
    getNextDocNum,
    // getDocumentsByType,
    getDocumentsByUserAndType,
    getFilteredDocuments,
    deleteDocument,
    updateDocument,
    getDocumentById,
    isRead,
    getDocumentsBySentBy,
    getDocumentsByAssignedTo,
    getTotalDocNum,
    getDeadlineStatusCounts,
    searchDocuments,
    getUnreadDocCount
 };
