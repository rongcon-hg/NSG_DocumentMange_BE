const mongoose = require("mongoose");

const recurringWorkScheduleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Tiêu đề mẫu lịch là bắt buộc"],
      trim: true,
    },
    content: {
      type: String,
      required: [true, "Nội dung công tác là bắt buộc"],
      trim: true,
    },
    participants: {
      type: String,
      default: "",
      trim: true,
    },
    location: {
      type: String,
      default: "",
      trim: true,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    host: {
      type: String,
      default: "Ban Giám Hiệu",
      trim: true,
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Giờ bắt đầu & kết thúc: e.g. "08:00", "10:30"
    startTime: {
      type: String,
      default: "08:00",
    },
    endTime: {
      type: String,
      default: "10:30",
    },
    // Số ngày kéo dài của sự kiện (1 = trong ngày, > 1 = nhiều ngày)
    durationDays: {
      type: Number,
      default: 1,
    },
    // Chu kỳ lặp: WEEKLY (Hàng tuần), MONTHLY (Hàng tháng), QUARTERLY (Hàng quý), YEARLY (Hàng năm)
    frequency: {
      type: String,
      enum: ["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"],
      default: "WEEKLY",
      required: true,
    },
    // Thứ trong tuần đối với WEEKLY: 1 = Thứ 2, 2 = Thứ 3, ..., 7 = Chủ nhật
    repeatDaysOfWeek: {
      type: [Number],
      default: [1], // Mặc định Thứ 2
    },
    // Ngày trong tháng (1 - 31) đối với MONTHLY, QUARTERLY, YEARLY
    repeatDayOfMonth: {
      type: Number,
      default: 1,
    },
    // Tháng trong quý đối với QUARTERLY (1: Tháng đầu, 2: Tháng giữa, 3: Tháng cuối)
    repeatQuarterMonth: {
      type: Number,
      default: 1,
    },
    // Quý áp dụng [1, 2, 3, 4] đối với QUARTERLY
    repeatQuarters: {
      type: [Number],
      default: [1, 2, 3, 4],
    },
    // Tháng trong năm (1 - 12) đối với YEARLY
    repeatMonthOfYear: {
      type: Number,
      default: 1,
    },
    // Trạng thái bật / tắt kích hoạt tự động sinh lịch
    isActive: {
      type: Boolean,
      default: true,
    },
    // Lần sinh lịch gần nhất
    lastGeneratedAt: {
      type: Date,
    },
    // Ngày tiếp theo sẽ được sinh lịch
    nextRunDate: {
      type: Date,
    },
    // Tổng số lịch đã sinh tự động từ mẫu này
    totalGeneratedCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

recurringWorkScheduleSchema.index({ isActive: 1, nextRunDate: 1 });

const RecurringWorkSchedule = mongoose.model(
  "RecurringWorkSchedule",
  recurringWorkScheduleSchema
);

module.exports = RecurringWorkSchedule;
