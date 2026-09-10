const mongoose = require("mongoose");

const emulationTitleSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, "Mã danh hiệu là bắt buộc"],
      unique: true,
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: [true, "Tên danh hiệu là bắt buộc"],
      trim: true,
    },
    level: {
      type: String,
      enum: ["CO_SO", "CAP_TP", "CAP_BO", "CAP_NHA_NUOC"],
      default: "CO_SO",
    },
    targetType: {
      type: String,
      enum: ["CA_NHAN", "TAP_THE", "CA_HAI"],
      default: "CA_NHAN",
    },
    description: {
      type: String,
      default: "",
    },
    displayOrder: {
      type: Number,
      default: 0,
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

const EmulationTitle = mongoose.model("EmulationTitle", emulationTitleSchema);
module.exports = EmulationTitle;
