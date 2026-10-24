const mongoose = require("mongoose");

const driverSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, "Họ và tên tài xế là bắt buộc"],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, "Số điện thoại là bắt buộc"],
      trim: true,
    },
    licenseClass: {
      type: String, // B2, C, D, E
      default: "D",
      trim: true,
    },
    licenseNumber: {
      type: String,
      default: "",
      trim: true,
    },
    userAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null, // Liên kết tài khoản nếu tài xế có dùng app
    },
    status: {
      type: String, // AVAILABLE, ON_TRIP, OFF_DUTY, INACTIVE
      enum: ["AVAILABLE", "ON_TRIP", "OFF_DUTY", "INACTIVE"],
      default: "AVAILABLE",
      index: true,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Driver", driverSchema);
