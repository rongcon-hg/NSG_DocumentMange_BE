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
    history: [
      {
        action: String,
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        details: String,
        timestamp: { type: Date, default: Date.now }
      }
    ],
  },
  {
    timestamps: true,
  }
);

const Task = mongoose.model("Task", taskSchema);
module.exports = Task;
