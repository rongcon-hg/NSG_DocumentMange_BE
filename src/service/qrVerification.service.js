const QRCode = require("qrcode");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const crypto = require("crypto");

/**
 * Sinh mã tra cứu ngẫu nhiên an toàn (6 ký tự alphanumeric viết hoa)
 */
const generateVerificationCode = () => {
  return "NSG-" + crypto.randomBytes(4).toString("hex").toUpperCase();
};

/**
 * Đóng dấu mã QR tra cứu tính xác thực vào trang đầu tiên của file PDF
 * @param {Buffer} pdfBuffer Buffer của file PDF gốc
 * @param {Object} docInfo Thông tin văn bản { docCode, verificationCode, verifyUrl }
 * @returns {Promise<Buffer>} Buffer của file PDF đã chèn mã QR
 */
const stampQrCodeOnPdf = async (pdfBuffer, docInfo) => {
  try {
    const { docCode, verificationCode, verifyUrl } = docInfo;

    // Tạo Data URL ảnh QR Code
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 250,
      color: {
        dark: "#0f3a6d", // Màu xanh thương hiệu NSG
        light: "#ffffff",
      },
    });

    const qrBase64 = qrDataUrl.replace(/^data:image\/png;base64,/, "");
    const qrImageBuffer = Buffer.from(qrBase64, "base64");

    // Load PDF Document
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    if (pages.length === 0) return pdfBuffer;

    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();

    // Nhúng ảnh QR vào PDF
    const qrImage = await pdfDoc.embedPng(qrImageBuffer);

    // Kích thước khung QR hiển thị trên PDF (chuẩn 62x62 pt)
    const qrSize = 58;
    // Tọa độ góc trên bên phải (cách lề phải 36pt, cách lề trên 36pt)
    const xPos = width - qrSize - 36;
    const yPos = height - qrSize - 32;

    // Vẽ nền mờ/viền nhẹ
    firstPage.drawRectangle({
      x: xPos - 4,
      y: yPos - 14,
      width: qrSize + 8,
      height: qrSize + 18,
      color: rgb(1, 1, 1),
      borderColor: rgb(0.8, 0.85, 0.9),
      borderWidth: 0.75,
      opacity: 0.95,
    });

    // Vẽ QR Code
    firstPage.drawImage(qrImage, {
      x: xPos,
      y: yPos,
      width: qrSize,
      height: qrSize,
    });

    // Vẽ nhãn phụ "QUÉT TRA CỨU"
    try {
      const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      firstPage.drawText("TRA CỨU VB", {
        x: xPos + 4,
        y: yPos - 9,
        size: 7,
        font: font,
        color: rgb(0.06, 0.23, 0.43),
      });
    } catch (fontErr) {
      console.warn("Không thể vẽ nhãn font chuẩn:", fontErr.message);
    }

    const modifiedPdfBytes = await pdfDoc.save();
    return Buffer.from(modifiedPdfBytes);
  } catch (error) {
    console.error("Lỗi stampQrCodeOnPdf:", error);
    // Nếu lỗi, trả về nguyên bản buffer gốc để không ngắt quãng quy trình ban hành
    return pdfBuffer;
  }
};

module.exports = {
  generateVerificationCode,
  stampQrCodeOnPdf,
};
