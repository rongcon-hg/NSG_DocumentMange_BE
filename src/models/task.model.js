const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    notes: {
      type: String,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    assignees: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    collaborators: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    files: [
      {
        fileId: { type: String },
        fileName: { type: String },
        fileMimeType: { type: String },
      },
    ],
    status: {
      type: String,
      enum: ["TODO", "IN_PROGRESS", "DONE"],
      default: "TODO",
    },
    priority: {
      type: String,
      enum: ["NORMAL", "URGENT", "FLASH"],
      default: "NORMAL",
    },
    relatedDocument: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    overdueReminderSent: {
      type: Boolean,
      default: false,
    },
    nearDeadlineReminderSent: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
    },
    taskType: {
      type: String,
      enum: ["REGULAR", "URGENT"],
      default: "REGULAR", // REGULAR: Thường xuyên (10đ), URGENT: Đột xuất (12đ)
    },
    baseScore: {
      type: Number,
      default: 10,
    },
    outputResult: {
      type: String,
      default: "", // Kết quả đầu ra: báo cáo, công văn, đề án, hồ sơ, dữ liệu...
    },
    difficultyRate: {
      type: Number,
      default: 1.0, // 1.0: 100% (thông thường), 1.1: 110% (phối hợp <= 3 người), 1.2: 120% (phối hợp >= 4 người)
    },
    evaluation: {
      score: { type: Number, min: 0, max: 100 },
      rating: { type: Number, min: 1, max: 5 },
      qualityRate: { type: Number, min: 0, max: 100 }, // 100%, 80%, 60%, 0%
      progressRate: { type: Number, min: 0, max: 100 }, // 100%, 80%, 60%, 0%
      isExceeded: { type: Boolean, default: false }, // Hoàn thành sớm và đạt chất lượng 100% (đánh dấu X cột 10)
      bonusScore: { type: Number, default: 0 }, // Điểm thưởng đề xuất
      feedback: { type: String },
      evaluatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      evaluatedAt: { type: Date },
    },
    weight: {
      type: Number,
      default: 1,
    },
    timeChangeReason: {
      type: String,
    },
    history: [
      {
        action: String,
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        details: String,
        timestamp: { type: Date, default: Date.now }
      }
    ],
    subtasks: [
      {
        title: { type: String, required: true },
        assignee: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        startDate: { type: Date },
        endDate: { type: Date },
        status: {
          type: String,
          enum: ["TODO", "IN_PROGRESS", "DONE"],
          default: "TODO",
        },
        completedAt: { type: Date },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        createdAt: { type: Date, default: Date.now },
        evaluation: {
          qualityRate: { type: Number, min: 0, max: 100 },
          progressRate: { type: Number, min: 0, max: 100 },
          evaluatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          evaluatedAt: { type: Date }
        }
      },
    ],
  },
  {
    timestamps: true,
  }
);

const Task = mongoose.model("Task", taskSchema);
module.exports = Task;
