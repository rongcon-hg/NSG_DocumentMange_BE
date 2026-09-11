const multer = require("multer");
const path = require("path");

// Danh sách các định dạng thực thi nguy hiểm bị cấm tải lên
const DANGEROUS_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".sh", ".bash", ".msi", ".dll",
  ".php", ".php3", ".php4", ".php5", ".phtml",
  ".jsp", ".jspx", ".asp", ".aspx", ".cgi",
  ".py", ".pl", ".vbs", ".ps1", ".jar", ".com", ".scr"
]);

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (DANGEROUS_EXTENSIONS.has(ext)) {
    return cb(
      new Error(
        `Tệp tin có phần mở rộng '${ext}' bị cấm tải lên hệ thống để bảo đảm an toàn.`
      ),
      false
    );
  }
  cb(null, true);
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: fileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024, // Giới hạn 500MB
  },
});

module.exports = upload;
