const { google } = require("googleapis");
const { Readable } = require("stream");
const SystemConfig = require("../models/systemConfig.model");
const { authorize, getDriveFolderId, sanitizeFileName } = require("./uploadfile.Controller");

// Lấy thông tin cấu hình hệ thống (Public API)
const getSystemConfig = async (req, res) => {
  try {
    let config = await SystemConfig.findOne();
    if (!config) {
      config = await SystemConfig.create({});
    }
    return res.status(200).json({
      success: true,
      data: config,
    });
  } catch (error) {
    console.error("Lỗi getSystemConfig:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy cấu hình hệ thống",
      error: error.message,
    });
  }
};

// Cập nhật thông tin cấu hình văn bản (Chỉ Admin)
const updateSystemConfig = async (req, res) => {
  try {
    const {
      siteName,
      shortName,
      siteDescription,
      organizationName,
      address,
      hotline,
      email,
      websiteUrl,
    } = req.body;

    let config = await SystemConfig.findOne();
    if (!config) {
      config = new SystemConfig();
    }

    if (siteName !== undefined) config.siteName = siteName.trim();
    if (shortName !== undefined) config.shortName = shortName.trim();
    if (siteDescription !== undefined) config.siteDescription = siteDescription.trim();
    if (organizationName !== undefined) config.organizationName = organizationName.trim();
    if (address !== undefined) config.address = address.trim();
    if (hotline !== undefined) config.hotline = hotline.trim();
    if (email !== undefined) config.email = email.trim();
    if (websiteUrl !== undefined) config.websiteUrl = websiteUrl.trim();

    await config.save();

    return res.status(200).json({
      success: true,
      message: "Cập nhật cấu hình đơn vị thành công!",
      data: config,
    });
  } catch (error) {
    console.error("Lỗi updateSystemConfig:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi cập nhật cấu hình hệ thống",
      error: error.message,
    });
  }
};

// Tải lên hình ảnh hệ thống (ảnh nền đăng nhập, logo, favicon) và đồng bộ Google Drive
const uploadSystemImage = async (req, res) => {
  try {
    const { type } = req.body; // 'loginBackground' | 'logo' | 'favicon'
    const file = req.file;

    if (!['loginBackground', 'logo', 'favicon'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Loại ảnh không hợp lệ (hỗ trợ: loginBackground, logo, favicon)",
      });
    }

    if (!file) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng chọn tệp hình ảnh để tải lên",
      });
    }

    let config = await SystemConfig.findOne();
    if (!config) {
      config = new SystemConfig();
    }

    const auth = await authorize();
    const drive = google.drive({ version: "v3", auth });
    const folderId = await getDriveFolderId();

    // Nếu đã có ảnh cũ trên Google Drive thì xóa file cũ
    const oldFileId = config[type]?.fileId;
    if (oldFileId) {
      try {
        await drive.files.delete({ fileId: oldFileId, supportsAllDrives: true });
      } catch (delErr) {
        console.warn(`Không thể xóa ảnh cũ ${type} trên Drive:`, delErr.message);
      }
    }

    // Đặt tên file an toàn
    const originalName = file.originalname || `${type}.png`;
    const sanitized = sanitizeFileName(originalName);
    const fileName = `system_${type}_${Date.now()}_${sanitized}`;

    const fileMetadata = {
      name: fileName,
      parents: folderId ? [folderId] : undefined,
    };

    const media = {
      mimeType: file.mimetype,
      body: Readable.from(file.buffer),
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id, name, mimeType",
      supportsAllDrives: true,
    });

    // Cấp quyền đọc công khai nếu Drive cho phép
    try {
      await drive.permissions.create({
        fileId: response.data.id,
        requestBody: { role: "reader", type: "anyone" },
        supportsAllDrives: true,
      });
    } catch (permErr) {
      // Bỏ qua nếu tổ chức chặn share public
    }

    const fileData = {
      fileId: response.data.id,
      fileName: response.data.name,
      mimeType: response.data.mimeType || file.mimetype,
      url: `/api/system-config/image/${response.data.id}`,
    };

    config[type] = fileData;
    await config.save();

    return res.status(200).json({
      success: true,
      message: `Tải lên và đồng bộ ${
        type === "loginBackground"
          ? "ảnh nền đăng nhập"
          : type === "logo"
          ? "logo trang web"
          : "favicon"
      } thành công!`,
      data: config,
      image: fileData,
    });
  } catch (error) {
    console.error("Lỗi uploadSystemImage:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi tải lên và đồng bộ ảnh vào Google Drive: " + error.message,
    });
  }
};

// Stream hình ảnh từ Google Drive về client (Public endpoint)
const getSystemImage = async (req, res) => {
  try {
    const { fileId } = req.params;
    if (!fileId) {
      return res.status(400).json({ message: "Thiếu fileId" });
    }

    const auth = await authorize();
    const drive = google.drive({ version: "v3", auth });

    let mimeType = "image/png";
    try {
      const meta = await drive.files.get({
        fileId,
        fields: "mimeType",
        supportsAllDrives: true,
      });
      if (meta.data && meta.data.mimeType) {
        mimeType = meta.data.mimeType;
      }
    } catch (e) {
      // fallback default
    }

    const response = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" }
    );
    const buffer = Buffer.from(response.data);

    res.set({
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=604800, immutable",
    });
    return res.send(buffer);
  } catch (error) {
    console.error("Lỗi getSystemImage:", error.message);
    return res.status(404).json({ message: "Không tìm thấy hình ảnh hệ thống" });
  }
};

// Đặt lại ảnh về mặc định hệ thống
const resetSystemImage = async (req, res) => {
  try {
    const { type } = req.body;
    if (!['loginBackground', 'logo', 'favicon'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Loại ảnh không hợp lệ",
      });
    }

    let config = await SystemConfig.findOne();
    if (!config) {
      config = new SystemConfig();
    }

    const oldFileId = config[type]?.fileId;
    if (oldFileId) {
      try {
        const auth = await authorize();
        const drive = google.drive({ version: "v3", auth });
        await drive.files.delete({ fileId: oldFileId, supportsAllDrives: true });
      } catch (delErr) {
        console.warn(`Không thể xóa ảnh cũ ${type} trên Drive:`, delErr.message);
      }
    }

    config[type] = { fileId: "", fileName: "", mimeType: "", url: "" };
    await config.save();

    return res.status(200).json({
      success: true,
      message: `Đã khôi phục ${
        type === "loginBackground"
          ? "ảnh nền đăng nhập"
          : type === "logo"
          ? "logo trang web"
          : "favicon"
      } về mặc định!`,
      data: config,
    });
  } catch (error) {
    console.error("Lỗi resetSystemImage:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi đặt lại ảnh mặc định",
      error: error.message,
    });
  }
};

module.exports = {
  getSystemConfig,
  updateSystemConfig,
  uploadSystemImage,
  getSystemImage,
  resetSystemImage,
};
