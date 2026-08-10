const mongoose = require("mongoose");
const User = require("./user.model");

const documentSchema = new mongoose.Schema(
  {
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    docType: {
      type: String,
      enum: ["sent","received"],
      default: "sent",
      required: true
    },
    docVariant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DocVariant",
      required: true
    },
    year: {
      type: String,
      required: true
    },
    deadlineDay: {
      type: Date,
      default: null
    },
    docNum:{
      type: Number,
      required: true
    },
    docCode: {
      type: String,
      required: true,
    },
    unit:{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Unit"
    },
    signer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    position: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Position",
      required: true
    },
    departments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Department",
        required: true
      },
    ],
    executors: [
      {
        executorId: { type: mongoose.Schema.Types.ObjectId, required: true },
        executorType: {
          type: String,
          enum: ["User", "Department"],
        },
      },
    ],
    assignedToUsers: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        status: {
          type: String,
          enum: ["sent", "received"],
          default: "received",
        },
        onTime: { 
          type: String,
          enum: ["soon", "pending", "late", "onTime"],
          default: "pending" 
        },
        isRead: {
          type: Boolean,
          default: false,
        },
        receivedDate: { type: Date },
      },
    ],
    principalIdea: {
      type: String,
    },
    numOfPages: {
      type: Number,
      default: 1,
    },
    shortDescription: {
      type: String,
    },
    note: {
      type: String,
    },
    urgency:{
      type: String,
      enum: [ "normal", "high","immediately"],
      default: "normal",
      required: true
    },
    saveAt: {
      type: String,
    },
    files: [
      {
        fileId: {
          type: String, // Google Drive file ID
          required: true,
        },
        fileName: {
          type: String,
        },
        mimeType: {
          type: String,
        },
        uploadDate: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    createAt:{
    type : Date,
    default: Date.now
    },
    receivedAt :{
      type: Date,
    },
    addedToCalendarBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }
    ],
  },
  {
    timestamps: true,
    indexes: [
      { key: { createdAt: 1 } },
      { key: { "assignedToUsers.userId": 1 } },
      { key: { sentBy: 1 } }
    ]
  }
);

documentSchema.index(
  { shortDescription: "text", docCode: "text" },
  { name: "TextIndex", default_language: "none" }
);

documentSchema.pre('save', async function (next) {
  try {
    const autoAssignedUsers = new Map();

    // Bước 1: Xử lý assignedToUsers ban đầu (ưu tiên giữ nguyên thông tin)
    if (Array.isArray(this.assignedToUsers)) {
      this.assignedToUsers.forEach(user => {
        const preparedUser = {
          ...user._doc, // giữ tất cả field gốc
          onTime: this.deadlineDay ? "pending" : "onTime", // gán onTime ban đầu
        };
        autoAssignedUsers.set(user.userId.toString(), preparedUser);
      });
    }

    // Bước 2: Xử lý executors
    if (Array.isArray(this.executors)) {
      for (const executor of this.executors) {
        let usersToAdd = [];

        if (executor.executorType === 'Department') {
          const usersInDepartment = await User.find({ department: executor.executorId, role: { $ne: null } }).select('_id');
          usersToAdd = usersInDepartment.map(user => user._id.toString());
        } else if (executor.executorType === 'User') {
          usersToAdd.push(executor.executorId.toString());
        }

        usersToAdd.forEach(userIdStr => {
          if (!autoAssignedUsers.has(userIdStr)) {
            // Nếu user chưa tồn tại → thêm mới với onTime: null
            autoAssignedUsers.set(userIdStr, {
              userId: userIdStr,
              status: "received",
              isRead: false,
              receivedDate: null,
              onTime: null,
            });
          }
          // Nếu đã có rồi thì giữ nguyên onTime ban đầu, KHÔNG override thành null nữa
        });
      }
    }

    // Bước 3: Chuẩn hóa lại mảng assignedToUsers trước khi lưu
    this.assignedToUsers = Array.from(autoAssignedUsers.values()).map(user => {
      let userId;
      if (user.userId instanceof mongoose.Types.ObjectId) {
        userId = user.userId;
      } else if (mongoose.Types.ObjectId.isValid(user.userId)) {
        userId = new mongoose.Types.ObjectId(user.userId);
      } else {
        throw new Error(`Invalid ObjectId: ${user.userId}`);
      }
      return {
        ...user,
        userId,
      };
    });

    next();
  } catch (error) {
    next(error);
  }
});
const Document = mongoose.model("Document", documentSchema);
module.exports = Document;
