const mongoose = require("mongoose");

const vehicleSchema = new mongoose.Schema(
  {
    name: {
      type: String, // Ví dụ: Ford Transit 16 chỗ, Toyota Fortuner 7 chỗ
      required: [true, "Tên phương tiện là bắt buộc"],
      trim: true,
    },
    licensePlate: {
      type: String, // Biển số xe: 51B-123.45
      required: [true, "Biển số xe là bắt buộc"],
      unique: true,
      trim: true,
      uppercase: true,
    },
    seats: {
      type: Number,
      required: [true, "Số chỗ ngồi là bắt buộc"],
      min: 2,
      max: 60,
      default: 7,
    },
    vehicleType: {
      type: String, // sedan, suv, van, minibus, bus
      default: "van",
    },
    status: {
      type: String, // AVAILABLE (sẵn sàng), IN_USE (đang đi công tác), MAINTENANCE (đang bảo dưỡng), INACTIVE (ngưng dùng)
      enum: ["AVAILABLE", "IN_USE", "MAINTENANCE", "INACTIVE"],
      default: "AVAILABLE",
      index: true,
    },
    defaultDriver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
      default: null,
    },
    currentMileage: {
      type: Number,
      default: 0,
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

module.exports = mongoose.model("Vehicle", vehicleSchema);
