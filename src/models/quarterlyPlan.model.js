const mongoose = require("mongoose");

const quarterlyPlanSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    academicYear: {
      type: String,
      required: true,
      default: "2026-2027",
    },
    year: {
      type: Number,
      required: true,
      default: () => new Date().getFullYear(),
    },
    quarter: {
      type: Number,
      required: true,
      enum: [1, 2, 3, 4],
      default: 1,
    },
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: ["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"],
      default: "ACTIVE",
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    note: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Tạo index hỗ trợ tìm kiếm nhanh theo năm học và quý
quarterlyPlanSchema.index({ academicYear: 1, quarter: 1 });

module.exports = mongoose.model("QuarterlyPlan", quarterlyPlanSchema);
