const mongoose = require("mongoose");

const onlineRecordCategorySchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, "Mã loại hồ sơ là bắt buộc"],
      unique: true,
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: [true, "Tên loại hồ sơ là bắt buộc"],
      trim: true,
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
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

const OnlineRecordCategory = mongoose.model(
  "OnlineRecordCategory",
  onlineRecordCategorySchema
);

module.exports = OnlineRecordCategory;
