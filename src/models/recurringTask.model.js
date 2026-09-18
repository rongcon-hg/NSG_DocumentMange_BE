const mongoose = require("mongoose");

const recurringTaskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    notes: {
      type: String,
      default: "",
    },
    taskType: {
      type: String,
      enum: ["REGULAR", "URGENT"],
      default: "REGULAR",
    },
    baseScore: {
      type: Number,
      default: 10,
    },
    outputResult: {
      type: String,
      default: "",
    },
    focusAxis: {
      type: String,
      default: "",
    },
    difficultyRate: {
      type: Number,
      default: 1.0,
    },
    priority: {
      type: String,
      enum: ["NORMAL", "URGENT", "FLASH"],
      default: "NORMAL",
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
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    subtasks: [
      {
        title: { type: String, required: true },
        assignee: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      },
    ],
    // Chu kỳ lặp: DAILY (Hàng ngày), WEEKLY (Hàng tuần), MONTHLY (Hàng tháng), QUARTERLY (Hàng quý), SEMESTER (Học kỳ), YEARLY (Hàng năm)
    frequency: {
      type: String,
      enum: ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "SEMESTER", "YEARLY"],
      default: "WEEKLY",
      required: true,
    },
    // Các ngày trong tuần (1 = Thứ 2, 2 = Thứ 3, ..., 7 = Chủ nhật) đối với WEEKLY
    repeatDaysOfWeek: {
      type: [Number],
      default: [1], // Mặc định Thứ 2 hàng tuần
    },
    // Ngày trong tháng (1 - 31) đối với MONTHLY, QUARTERLY và YEARLY
    repeatDayOfMonth: {
      type: Number,
      default: 1, // Mặc định ngày 1
    },
    // Tháng trong quý (1: Tháng đầu, 2: Tháng giữa, 3: Tháng cuối) đối với QUARTERLY
    repeatQuarterMonth: {
      type: Number,
      default: 1, // Mặc định tháng đầu quý (Tháng 1, 4, 7, 10)
    },
    // Tháng trong năm (1 - 12) đối với YEARLY
    repeatMonthOfYear: {
      type: Number,
      default: 1, // Mặc định Tháng 1
    },
    // Tệp đính kèm mẫu (được sao chép sang Task khi tự động sinh việc)
    files: [
      {
        fileId: { type: String },
        fileName: { type: String },
        fileMimeType: { type: String },
      },
    ],
    // Giờ bắt đầu & kết thúc mặc định trong ngày: ['08:00', '17:00']
    times: {
      type: [String],
      default: ["08:00", "17:00"],
    },
    // Thời hạn hoàn thành tính từ ngày sinh việc (số ngày)
    durationDays: {
      type: Number,
      default: 3,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastGeneratedAt: {
      type: Date,
    },
    nextRunDate: {
      type: Date,
    },
    totalGeneratedCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

const RecurringTask = mongoose.model("RecurringTask", recurringTaskSchema);
module.exports = RecurringTask;
