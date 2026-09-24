const { GoogleGenerativeAI } = require("@google/generative-ai");
const ChatbotConfig = require("../models/chatbotConfig.model");
const DocumentDraft = require("../models/documentDraft.model");
const User = require("../models/user.model");

const DOC_TYPE_LABELS = {
  TO_TRINH: "TỜ TRÌNH",
  THONG_BAO: "THÔNG BÁO",
  QUYET_DINH: "QUYẾT ĐỊNH",
  KE_HOACH: "KẾ HOẠCH",
  CONG_VAN: "CÔNG VĂN",
  BAO_CAO: "BÁO CÁO",
  BIEN_BAN: "BIÊN BẢN",
  KHAC: "VĂN BẢN HÀNH CHÍNH",
};

/**
 * Trợ lý AI Soạn thảo văn bản hành chính theo chuẩn Nghị định 30/2020/NĐ-CP
 */
const generateAIDraft = async (req, res) => {
  try {
    const { docType, title, requestSummary, departmentName, signerPosition } = req.body;
    const userId = req.user?._id || req.user?.id;

    if (!title || !requestSummary) {
      return res.status(400).json({ success: false, message: "Vui lòng nhập trích yếu tiêu đề và nội dung tóm tắt yêu cầu." });
    }

    const config = await ChatbotConfig.findOne();
    if (!config || !config.geminiApiKey) {
      return res.status(400).json({ success: false, message: "Chưa cấu hình Gemini API Key trong hệ thống." });
    }

    const genAI = new GoogleGenerativeAI(config.geminiApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const typeLabel = DOC_TYPE_LABELS[docType] || "VĂN BẢN HÀNH CHÍNH";

    const prompt = `
Bạn là chuyên gia soạn thảo văn bản hành chính nhà nước của Trường Cao đẳng Bách khoa Nam Sài Gòn (NSG).
Nhiệm vụ của bạn là soạn thảo một văn bản hành chính hoàn chỉnh, chuyên nghiệp, chuẩn mực theo đúng quy định tại NGHỊ ĐỊNH 30/2020/NĐ-CP của Chính phủ về công tác văn thư.

Thông tin đầu vào:
- Loại văn bản: ${typeLabel}
- Trích yếu / Tiêu đề: ${title}
- Đơn vị đề xuất / tham mưu: ${departmentName || "Phòng / Khoa"}
- Người ký / Chức danh ký: ${signerPosition || "HIỆU TRƯỞNG"}
- Tóm tắt ý tưởng & nội dung chính cần soạn thảo:
"""
${requestSummary}
"""

Yêu cầu xuất ra:
1. Đảm bảo 100% đầy đủ các thành phần thể thức theo Nghị định 30/2020/NĐ-CP:
   - Quốc hiệu, Tiêu ngữ (CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM / Độc lập - Tự do - Hạnh phúc)
   - Tên cơ quan chủ quản và Tên cơ quan ban hành: UBND THÀNH PHỐ HỒ CHÍ MINH / TRƯỜNG CAO ĐẲNG BÁCH KHOA NAM SÀI GÒN
   - Số, ký hiệu văn bản (để trống placeholder như: .../TTr-CĐNSG, .../TB-CĐNSG hoặc .../QĐ-CĐNSG)
   - Địa danh, ngày tháng năm (Thành phố Hồ Chí Minh, ngày ... tháng ... năm 20...)
   - Tên loại và trích yếu nội dung văn bản
   - Các Căn cứ pháp lý viện dẫn phù hợp (Luật Giáo dục nghề nghiệp, Điều lệ trường, Nghị định 30,...)
   - Nội dung chính: Rõ ràng, hành văn trang trọng, mạch lạc, phân chia các Điều / Mục / Khoản / Điểm logic.
   - Nơi nhận (phù hợp với loại văn bản)
   - Chức vụ, họ tên người ký.
2. Trả về định dạng Markdown/HTML đẹp mắt để hiển thị trực tiếp vào trình soạn thảo.
`;

    const result = await model.generateContent(prompt);
    const generatedText = result.response.text();

    // Lưu bản nháp vào CSDL
    const newDraft = await DocumentDraft.create({
      title,
      docType: docType || "TO_TRINH",
      creator: userId,
      prompt: requestSummary,
      content: generatedText,
      metadata: {
        signerPosition: signerPosition || "HIỆU TRƯỞNG",
        recipient: "Như trên; Lưu: VT.",
      },
      status: "DRAFT",
    });

    return res.json({
      success: true,
      message: "AI đã soạn thảo xong văn bản!",
      data: newDraft,
    });
  } catch (error) {
    console.error("Lỗi generateAIDraft:", error);
    return res.status(500).json({ success: false, message: "Lỗi xử lý AI Soạn thảo văn bản", error: error.message });
  }
};

/**
 * Thẩm định thể thức văn bản theo Nghị định 30/2020/NĐ-CP
 */
const auditDocumentCompliance = async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ success: false, message: "Vui lòng cung cấp nội dung văn bản cần thẩm định." });
    }

    const config = await ChatbotConfig.findOne();
    if (!config || !config.geminiApiKey) {
      return res.status(400).json({ success: false, message: "Chưa cấu hình Gemini API Key." });
    }

    const genAI = new GoogleGenerativeAI(config.geminiApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const auditPrompt = `
Bạn là chuyên gia kiểm tra và thẩm định thể thức văn bản hành chính theo Nghị định 30/2020/NĐ-CP.
Hãy kiểm tra văn bản dưới đây và đưa ra đánh giá:
1. Điểm số chuẩn thể thức (thang điểm 100)
2. Các lỗi hoặc thiếu sót thể thức (Quốc hiệu, tiêu ngữ, trích yếu, căn cứ, căn lề, nơi nhận, chữ ký)
3. Lỗi chính tả, câu từ chưa trang trọng hành chính (nếu có)
4. Đề xuất chỉnh sửa cụ thể.

Văn bản cần thẩm định:
"""
${content}
"""

Trả về kết quả định dạng JSON thuần với cấu trúc:
{
  "score": 95,
  "issues": ["Thiếu địa danh ngày tháng năm", "..."],
  "suggestions": ["Bổ sung 'Thành phố Hồ Chí Minh, ngày ... tháng ... năm ...'", "..."]
}
`;

    const result = await model.generateContent(auditPrompt);
    let auditData = { score: 90, issues: [], suggestions: [] };
    try {
      const cleaned = result.response.text().replace(/```json|```/g, "").trim();
      auditData = JSON.parse(cleaned);
    } catch (e) {
      auditData.suggestions = [result.response.text()];
    }

    return res.json({
      success: true,
      data: auditData,
    });
  } catch (error) {
    console.error("Lỗi auditDocumentCompliance:", error);
    return res.status(500).json({ success: false, message: "Lỗi khi thẩm định văn bản", error: error.message });
  }
};

/**
 * Lấy lịch sử các bản nháp văn bản do người dùng tạo
 */
const getDraftHistory = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const drafts = await DocumentDraft.find({ creator: userId }).sort({ createdAt: -1 }).limit(20);
    return res.json({ success: true, data: drafts });
  } catch (error) {
    console.error("Lỗi getDraftHistory:", error);
    return res.status(500).json({ success: false, message: "Lỗi tải lịch sử bản nháp" });
  }
};

module.exports = {
  generateAIDraft,
  auditDocumentCompliance,
  getDraftHistory,
};
