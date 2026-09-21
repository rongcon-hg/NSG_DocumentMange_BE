const mongoose = require("mongoose");

const handoverLogSchema = new mongoose.Schema(
  {
    fromUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    toUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    handoverReason: {
      type: String,
      default: "",
    },
    transferredTasksCount: {
      type: Number,
      default: 0,
    },
    transferredTasks: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Task",
      },
    ],
    transferredDocsCount: {
      type: Number,
      default: 0,
    },
    transferredDocs: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Document",
      },
    ],
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    notes: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("HandoverLog", handoverLogSchema);
