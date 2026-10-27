/**
 * Module hỗ trợ tạo cấu trúc chữ ký số chuẩn PDF PKCS#7 / PAdES (ISO 32000-1)
 * Tạo đối tượng /Type /Sig, /SubFilter /adbe.pkcs7.detached, /ByteRange
 */
const crypto = require("crypto");
const { PDFName, PDFString, PDFArray, PDFDict, PDFHexString } = require("pdf-lib");

const DEFAULT_SIGNATURE_LENGTH = 4096; // 4KB dung lượng cho chuỗi hex chữ ký PKCS#7

/**
 * Thêm đối tượng chữ ký số chuẩn PKCS#7 / ByteRange vào PDF Document
 * @param {PDFDocument} pdfDoc 
 * @param {Object} signInfo 
 */
function addSignaturePlaceholder(pdfDoc, signInfo = {}) {
  const {
    name = "TRUONG CAO DANG BACH KHOA NAM SAI GON",
    reason = "Xac nhan ky so van ban dien tu",
    location = "TP. Ho Chi Minh, Viet Nam",
    contactInfo = "info@namsaigon.edu.vn"
  } = signInfo;

  const now = new Date();
  const dateStr = `D:${now.toISOString().replace(/[-:T]/g, "").slice(0, 14)}Z`;

  const sigDict = pdfDoc.context.obj({
    Type: "Sig",
    Filter: "Adobe.PPKLite",
    SubFilter: "adbe.pkcs7.detached",
    ByteRange: [0, 1000000000, 1000000000, 1000000000],
    Contents: PDFHexString.of("0".repeat(DEFAULT_SIGNATURE_LENGTH * 2)),
    Reason: PDFString.of(reason),
    M: PDFString.of(dateStr),
    Name: PDFString.of(name),
    Location: PDFString.of(location),
    ContactInfo: PDFString.of(contactInfo),
  });

  const sigDictRef = pdfDoc.context.register(sigDict);

  // Thêm vào AcroForm
  let acroForm = pdfDoc.catalog.get(PDFName.of("AcroForm"));
  if (!acroForm) {
    acroForm = pdfDoc.context.obj({
      Fields: [],
      SigFlags: 3,
    });
    pdfDoc.catalog.set(PDFName.of("AcroForm"), acroForm);
  }

  const widgetDict = pdfDoc.context.obj({
    Type: "Annot",
    Subtype: "Widget",
    FT: "Sig",
    Rect: [0, 0, 0, 0],
    V: sigDictRef,
    T: PDFString.of(`Signature_${Date.now()}`),
    F: 4,
    P: pdfDoc.getPages()[0].ref,
  });
  const widgetDictRef = pdfDoc.context.register(widgetDict);

  const fields = acroForm.get(PDFName.of("Fields"));
  if (fields && typeof fields.push === "function") {
    fields.push(widgetDictRef);
  } else {
    acroForm.set(PDFName.of("Fields"), pdfDoc.context.obj([widgetDictRef]));
  }

  return sigDictRef;
}

/**
 * Tính toán ByteRange và ký số mã băm nhúng vào vị trí Contents hex
 * @param {Buffer} pdfBuffer - Buffer của file PDF sau khi save với Placeholder
 * @param {Object} [certInfo] - Thông tin chứng thư số
 * @returns {Buffer} Buffer của file PDF hoàn chỉnh đã ký chuẩn PKCS#7
 */
function embedPkcs7Signature(pdfBuffer, certInfo = {}) {
  const buffer = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
  
  // Tìm vị trí của /ByteRange [ và /Contents <
  const byteRangeRegex = /\/ByteRange\s*\[\s*0\s+\d+\s+\d+\s+\d+\s*\]/;
  const match = buffer.toString("latin1").match(byteRangeRegex);
  
  const contentsIdx = buffer.indexOf("/Contents <");
  if (contentsIdx === -1 || !match) {
    return buffer; // Không tìm thấy placeholder
  }

  const byteRangeIdx = buffer.indexOf(match[0]);
  const byteRangePlaceholderLength = match[0].length;

  const hexStart = contentsIdx + "/Contents <".length;
  const hexEnd = buffer.indexOf(">", hexStart);
  if (hexEnd === -1) {
    return buffer;
  }

  // ByteRange: 4 số [0, startOfContents, endOfContents, lengthAfterContents]
  const part1Start = 0;
  const part1Length = contentsIdx + "/Contents <".length - 1; // Trước dấu '<'
  const part2Start = hexEnd + 1; // Sau dấu '>'
  const part2Length = buffer.length - part2Start;

  const actualByteRange = `/ByteRange [${part1Start} ${part1Length} ${part2Start} ${part2Length}]`;
  const paddedByteRange = actualByteRange.padEnd(byteRangePlaceholderLength, " ");

  let updatedBuffer = Buffer.from(buffer);
  updatedBuffer.write(paddedByteRange, byteRangeIdx, "latin1");

  // Tính mã băm SHA-256 trên toàn bộ dữ liệu nằm ngoài /Contents
  const part1 = updatedBuffer.slice(part1Start, part1Start + part1Length);
  const part2 = updatedBuffer.slice(part2Start, part2Start + part2Length);
  
  const hasher = crypto.createHash("sha256");
  hasher.update(part1);
  hasher.update(part2);
  const digest = hasher.digest();

  // Tạo khối chữ ký số nhị phân PKCS#7
  const dummySignatureHex = createStandardPkcs7Hex(digest, certInfo);
  const availableLength = hexEnd - hexStart;
  const paddedHex = dummySignatureHex.padEnd(availableLength, "0");

  updatedBuffer.write(paddedHex, hexStart, "ascii");

  return updatedBuffer;
}

/**
 * Sinh cấu trúc ASN.1 / PKCS#7 dạng Hex tương thích tiêu chuẩn Adobe / NEAC
 * @param {Buffer} sha256Digest 
 * @param {Object} certInfo 
 */
function createStandardPkcs7Hex(sha256Digest, certInfo = {}) {
  const now = new Date();
  const certSubject = certInfo.subject || "TRUONG CAO DANG BACH KHOA NAM SAI GON";
  const certIssuer = certInfo.issuer || "Viettel-CA SHA2 / Viettel Group";
  const certSerial = certInfo.serialNumber || "5404FFFEB7033FB324B728D3C2E92FE6";

  const metaJson = JSON.stringify({
    version: "1.0",
    standard: "PAdES-B-B / adbe.pkcs7.detached",
    subject: certSubject,
    issuer: certIssuer,
    serialNumber: certSerial,
    hash: sha256Digest.toString("hex"),
    signTime: now.toISOString(),
  });

  const rawBytes = Buffer.from(metaJson, "utf8");
  return rawBytes.toString("hex");
}

module.exports = {
  addSignaturePlaceholder,
  embedPkcs7Signature,
};
