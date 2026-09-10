const mongoose = require("mongoose");

const emulationDocumentTypeSchema = new mongoose.Schema(
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
    isRequired: {
      type: Boolean,
      default: false,
    },
    applicableTitles: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "EmulationTitle",
      },
    ],
    description: {
      type: String,
      default: "",
    },
    sampleFileUrl: {
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

const EmulationDocumentType = mongoose.model(
  "EmulationDocumentType",
  emulationDocumentTypeSchema
);
module.exports = EmulationDocumentType;
