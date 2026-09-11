const mongoose = require("mongoose");

const imageFileSchema = new mongoose.Schema(
  {
    fileId: { type: String, default: "" },
    fileName: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    url: { type: String, default: "" },
  },
  { _id: false }
);

const systemConfigSchema = new mongoose.Schema(
  {
    siteName: {
      type: String,
      default: "HỆ THỐNG QUẢN LÝ VĂN BẢN",
      trim: true,
    },
    shortName: {
      type: String,
      default: "QLVB",
      trim: true,
    },
    siteDescription: {
      type: String,
      default: "Trường Cao Đẳng Bách Khoa Nam Sài Gòn",
      trim: true,
    },
    organizationName: {
      type: String,
      default: "TRƯỜNG CAO ĐẲNG BÁCH KHOA NAM SÀI GÒN",
      trim: true,
    },
    address: {
      type: String,
      default: "Số 47 Cao Lỗ, Phường Chánh Hưng, TP. Hồ Chí Minh",
      trim: true,
    },
    hotline: {
      type: String,
      default: "",
      trim: true,
    },
    email: {
      type: String,
      default: "chuyendoiso@nsgpc.edu.vn",
      trim: true,
    },
    websiteUrl: {
      type: String,
      default: "https://namsaigon.edu.vn",
      trim: true,
    },
    loginBackground: {
      type: imageFileSchema,
      default: () => ({ fileId: "", fileName: "", mimeType: "", url: "" }),
    },
    logo: {
      type: imageFileSchema,
      default: () => ({ fileId: "", fileName: "", mimeType: "", url: "" }),
    },
    favicon: {
      type: imageFileSchema,
      default: () => ({ fileId: "", fileName: "", mimeType: "", url: "" }),
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SystemConfig", systemConfigSchema);
