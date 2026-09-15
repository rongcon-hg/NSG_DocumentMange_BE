const mongoose = require("mongoose");

const externalMenuSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Tên menu liên kết là bắt buộc"],
      trim: true,
    },
    url: {
      type: String,
      required: [true, "Đường link liên kết là bắt buộc"],
      trim: true,
    },
    icon: {
      type: String,
      default: "GlobalOutlined",
      trim: true,
    },
    openInNewTab: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
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

const ExternalMenu = mongoose.model("ExternalMenu", externalMenuSchema);

module.exports = ExternalMenu;
