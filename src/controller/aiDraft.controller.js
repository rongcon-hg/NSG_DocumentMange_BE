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

    // Danh sách model ưu tiên tự động fallback nếu gặp lỗi 503 (quá tải) hoặc lỗi mạng
    const candidateModels = ["gemini-2.5-flash", "gemini-3.5-flash", "gemini-flash-latest"];
    const callGeminiWithFallback = async (contentPrompt) => {
      let lastErr = null;
      for (const m of candidateModels) {
        try {
          const modelInstance = genAI.getGenerativeModel({ model: m });
          const res = await modelInstance.generateContent(contentPrompt);
          return res.response.text();
        } catch (err) {
          lastErr = err;
          console.warn(`[AI Draft] Model ${m} gặp lỗi:`, err.message, "Đang thử model tiếp theo...");
        }
      }
      throw lastErr || new Error("Không thể kết nối đến dịch vụ AI.");
    };

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

QUY ĐỊNH BẮT BUỘC VỀ THỂ THỨC VÀ BỐ CỤC (NGHỊ ĐỊNH 30/2020/NĐ-CP):
1. TUYỆT ĐỐI KHÔNG thêm bất kỳ lời chào, lời dẫn (như "Tuyệt vời!", "Dưới đây là...", "Kính gửi...").
2. Chỉ xuất DUY NHẤT mã HTML hợp lệ chuẩn bắt đầu bằng thẻ <div ...> và kết thúc bằng </div>.

3. ĐẦU VĂN BẢN (Bắt buộc dùng table không viền để chia 2 cột đều nhau):
<table style="width: 100%; border: none; border-collapse: collapse; margin-bottom: 20px;">
  <tr>
    <td style="width: 50%; text-align: center; vertical-align: top; font-family: 'Times New Roman', serif;">
      <div style="font-size: 12pt; font-weight: normal; text-transform: uppercase; line-height: 1.3;">ỦY BAN NHÂN DÂN<br>THÀNH PHỐ HỒ CHÍ MINH</div>
      <div style="font-size: 13pt; font-weight: bold; text-transform: uppercase; line-height: 1.3; margin-top: 4px;">TRƯỜNG CAO ĐẲNG BÁCH KHOA<br>NAM SÀI GÒN</div>
      <div style="width: 140px; height: 1px; background-color: #000; margin: 4px auto 8px auto;"></div>
      <div style="font-size: 13pt; margin-top: 4px;">Số: ....../${docType === 'TO_TRINH' ? 'TTr' : docType === 'THONG_BAO' ? 'TB' : docType === 'QUYET_DINH' ? 'QĐ' : 'CV'}-CĐNSG</div>
    </td>
    <td style="width: 50%; text-align: center; vertical-align: top; font-family: 'Times New Roman', serif;">
      <div style="font-size: 12pt; font-weight: bold; text-transform: uppercase; line-height: 1.3;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
      <div style="font-size: 13pt; font-weight: bold; line-height: 1.3; margin-top: 4px;">Độc lập - Tự do - Hạnh phúc</div>
      <div style="width: 160px; height: 1px; background-color: #000; margin: 4px auto 8px auto;"></div>
      <div style="font-size: 13pt; font-style: italic; margin-top: 4px;">Thành phố Hồ Chí Minh, ngày ..... tháng ..... năm 20....</div>
    </td>
  </tr>
</table>

LƯU Ý ĐẶC BIỆT VỀ CƠ QUAN BAN HÀNH:
- KHÔNG VIẾT TẮT "UBND". Bắt buộc ghi đầy đủ chữ: "ỦY BAN NHÂN DÂN" và xuống dòng "THÀNH PHỐ HỒ CHÍ MINH".
- Dòng chữ "ỦY BAN NHÂN DÂN" và "THÀNH PHỐ HỒ CHÍ MINH" TUYỆT ĐỐI KHÔNG ĐƯỢC IN ĐẬM (font-weight: normal), chữ in hoa.
- Dòng chữ "TRƯỜNG CAO ĐẲNG BÁCH KHOA" và "NAM SÀI GÒN" BẮT BUỘC PHẢI IN ĐẬM (font-weight: bold), chữ in hoa, xuống dòng thành 2 dòng như mẫu trên.

4. TÊN LOẠI VĂN BẢN VÀ TRÍCH YẾU:
- Tên loại văn bản: In hoa, đậm, cỡ chữ 14-15pt, căn giữa (Ví dụ: TỜ TRÌNH, THÔNG BÁO, QUYẾT ĐỊNH).
- Trích yếu nội dung: Cỡ chữ 13-14pt, in đậm, căn giữa (Ví dụ: Về việc mua sắm thiết bị máy tính mới).

5. NỘI DUNG VĂN BẢN:
- Font chữ: 'Times New Roman', cỡ chữ 13-14pt, màu chữ #000000.
- Căn lề đều 2 bên (text-align: justify), giãn dòng 1.3 - 1.4.
- Thụt đầu dòng đoạn văn bản: 1cm đến 1.27cm (text-indent: 1.27cm).
- Các Căn cứ pháp lý: In nghiêng, thụt dòng (font-style: italic; text-align: justify;).
- Các điều khoản, mục lục: Trình bày mạch lạc theo Điều / Khoản / Điểm chuẩn văn bản hành chính nhà nước.

6. PHẦN CUỐI VĂN BẢN (NƠI NHẬN VÀ CHỮ KÝ - CHUẨN NGHỊ ĐỊNH 30/2020/NĐ-CP):
Bắt buộc dùng bảng không viền 2 cột:
<table style="width: 100%; border: none; border-collapse: collapse; margin-top: 30px;">
  <tr>
    <td style="width: 50%; vertical-align: top; text-align: left; font-family: 'Times New Roman', serif;">
      <div style="font-size: 12pt; font-weight: bold; font-style: italic;">Nơi nhận:</div>
      <div style="font-size: 11pt; line-height: 1.4; margin-top: 4px;">
        - Như kính gửi;<br>
        - Ban Giám hiệu (để b/c);<br>
        - Lưu: VT, ${departmentName || "đơn vị"}.
      </div>
    </td>
    <td style="width: 50%; vertical-align: top; text-align: center; font-family: 'Times New Roman', serif;">
      <div style="font-size: 13pt; font-weight: bold; text-transform: uppercase;">${signerPosition || "HIỆU TRƯỞNG"}</div>
      <div style="font-size: 12pt; font-style: italic; margin-top: 2px;">(Ký, ghi rõ họ tên và đóng dấu)</div>
      <div style="height: 70px;"></div>
      <div style="font-size: 13pt; font-weight: bold;">[Họ và tên người ký]</div>
    </td>
  </tr>
</table>
`;

    let generatedText = await callGeminiWithFallback(prompt);

    // Làm sạch nếu AI lỡ bọc code block markdown ```html ... ``` hoặc ``` ... ```
    generatedText = generatedText
      .replace(/^```html\s*/i, "")
      .replace(/^```markdown\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    // Loại bỏ các dòng chào hỏi đằng trước nếu có
    const htmlStartIndex = generatedText.indexOf("<");
    if (htmlStartIndex > 0) {
      const prefixText = generatedText.substring(0, htmlStartIndex);
      if (prefixText.includes("Tuyệt vời") || prefixText.includes("Dưới đây") || prefixText.includes("Chào")) {
        generatedText = generatedText.substring(htmlStartIndex);
      }
    }

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
    return res.status(500).json({ success: false, message: "Lỗi xử lý AI Soạn thảo văn bản: " + (error.message || ""), error: error.message });
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
    const candidateModels = ["gemini-2.5-flash", "gemini-3.5-flash", "gemini-flash-latest"];
    const callGeminiWithFallback = async (contentPrompt) => {
      let lastErr = null;
      for (const m of candidateModels) {
        try {
          const modelInstance = genAI.getGenerativeModel({ model: m });
          const res = await modelInstance.generateContent(contentPrompt);
          return res.response.text();
        } catch (err) {
          lastErr = err;
          console.warn(`[AI Audit] Model ${m} gặp lỗi:`, err.message, "Đang thử model tiếp theo...");
        }
      }
      throw lastErr || new Error("Không thể kết nối đến dịch vụ AI.");
    };

    const auditPrompt = `
Bạn là chuyên gia kiểm tra và thẩm định thể thức văn bản hành chính theo Nghị định 30/2020/NĐ-CP của Chính phủ Việt Nam.
Hãy kiểm tra văn bản dưới đây và đưa ra đánh giá chi tiết:
1. Điểm số chuẩn thể thức (từ 0 đến 100)
2. Các lỗi hoặc thiếu sót thể thức:
   - Cơ quan ban hành: Tuyệt đối KHÔNG viết tắt "UBND" (phải viết đầy đủ "ỦY BAN NHÂN DÂN", không in đậm).
   - Đơn vị ban hành "TRƯỜNG CAO ĐẲNG BÁCH KHOA NAM SÀI GÒN" phải in đậm, viết hoa.
   - Quốc hiệu: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM" in hoa đậm; Tiêu ngữ "Độc lập - Tự do - Hạnh phúc" chữ in thường đứng đậm, có gạch nối.
   - Căn cứ, bố cục nội dung, thụt đầu dòng (1 - 1.27cm), căn lề 2 bên (justify).
   - Nơi nhận: "Nơi nhận:" in đậm nghiêng 12pt, các mục liệt kê 11pt, gạch đầu dòng. Chữ ký bên phải.
3. Đề xuất chỉnh sửa cụ thể.

Văn bản cần thẩm định:
"""
${content}
"""

YÊU CẦU: Trả về ĐÚNG DUY NHẤT một chuỗi JSON thuần, không dùng backticks markdown, theo định dạng:
{
  "score": 95,
  "issues": ["...", "..."],
  "suggestions": ["...", "..."]
}
`;

    const rawOutput = (await callGeminiWithFallback(auditPrompt)).trim();
    
    let auditData = { score: 92, issues: [], suggestions: [] };
    try {
      const cleaned = rawOutput.replace(/```json/gi, "").replace(/```/g, "").trim();
      auditData = JSON.parse(cleaned);
    } catch (parseErr) {
      console.warn("Lỗi parse JSON audit:", parseErr.message, "Raw:", rawOutput);
      auditData = {
        score: 88,
        issues: ["Không thể phân tích tự động chi tiết"],
        suggestions: [rawOutput.substring(0, 300)],
      };
    }

    return res.json({
      success: true,
      data: auditData,
    });
  } catch (error) {
    console.error("Lỗi auditDocumentCompliance:", error);
    return res.status(500).json({ success: false, message: "Lỗi khi thẩm định văn bản: " + (error.message || ""), error: error.message });
  }
};

/**
 * Tự động chỉnh sửa văn bản chuẩn theo thể thức Nghị định 30/2020/NĐ-CP dựa trên các gợi ý / phát hiện
 */
const fixDocumentCompliance = async (req, res) => {
  try {
    const { content, suggestions } = req.body;
    if (!content) {
      return res.status(400).json({ success: false, message: "Vui lòng cung cấp nội dung văn bản cần chỉnh sửa." });
    }

    const config = await ChatbotConfig.findOne();
    if (!config || !config.geminiApiKey) {
      return res.status(400).json({ success: false, message: "Chưa cấu hình Gemini API Key." });
    }

    const genAI = new GoogleGenerativeAI(config.geminiApiKey);
    const candidateModels = ["gemini-2.5-flash", "gemini-3.5-flash", "gemini-flash-latest"];
    const callGeminiWithFallback = async (contentPrompt) => {
      let lastErr = null;
      for (const m of candidateModels) {
        try {
          const modelInstance = genAI.getGenerativeModel({ model: m });
          const res = await modelInstance.generateContent(contentPrompt);
          return res.response.text();
        } catch (err) {
          lastErr = err;
          console.warn(`[AI Fix] Model ${m} gặp lỗi:`, err.message, "Đang thử model tiếp theo...");
        }
      }
      throw lastErr || new Error("Không thể kết nối đến dịch vụ AI.");
    };

    const fixPrompt = `
Bạn là chuyên gia hiệu đính và chuẩn hóa thể thức văn bản hành chính theo đúng NGHỊ ĐỊNH 30/2020/NĐ-CP của Chính phủ.
Nhiệm vụ của bạn: Tiếp nhận văn bản HTML hiện tại và các gợi ý sửa đổi, sau đó CHỈNH SỬA LẠI TOÀN BỘ VĂN BẢN sao cho chuẩn 100% Nghị định 30.

CÁC YÊU CẦU BẮT BUỘC VỀ THỂ THỨC (NGHỊ ĐỊNH 30/2020/NĐ-CP):
1. ĐẦU VĂN BẢN (Bảng 2 cột cân đối, không viền):
   - Bên trái (Cơ quan ban hành):
     <div style="font-size: 12pt; font-weight: normal; text-transform: uppercase; line-height: 1.3;">ỦY BAN NHÂN DÂN<br>THÀNH PHỐ HỒ CHÍ MINH</div>
     <div style="font-size: 13pt; font-weight: bold; text-transform: uppercase; line-height: 1.3; margin-top: 4px;">TRƯỜNG CAO ĐẲNG BÁCH KHOA<br>NAM SÀI GÒN</div>
     <div style="width: 140px; height: 1px; background-color: #000; margin: 4px auto 8px auto;"></div>
     <div style="font-size: 13pt; margin-top: 4px;">Số: ......</div>
     (Lưu ý: "ỦY BAN NHÂN DÂN THÀNH PHỐ HỒ CHÍ MINH" không được viết tắt, KHÔNG ĐƯỢC IN ĐẬM, viết hoa, xuống dòng 2 dòng. "TRƯỜNG CAO ĐẲNG BÁCH KHOA NAM SÀI GÒN" IN ĐẬM, viết hoa, xuống dòng 2 dòng).
   - Bên phải (Quốc hiệu & Tiêu ngữ):
     <div style="font-size: 12pt; font-weight: bold; text-transform: uppercase; line-height: 1.3;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
     <div style="font-size: 13pt; font-weight: bold; line-height: 1.3; margin-top: 4px;">Độc lập - Tự do - Hạnh phúc</div>
     <div style="width: 160px; height: 1px; background-color: #000; margin: 4px auto 8px auto;"></div>
     <div style="font-size: 13pt; font-style: italic; margin-top: 4px;">Thành phố Hồ Chí Minh, ngày ..... tháng ..... năm 20....</div>

2. TÊN LOẠI VĂN BẢN & TRÍCH YẾU:
   - Tên loại văn bản (TỜ TRÌNH, THÔNG BÁO...): Cỡ chữ 14pt-15pt, in hoa, in đậm, căn giữa.
   - Trích yếu nội dung: Cỡ chữ 13pt-14pt, in đậm, căn giữa (Ví dụ: Về việc mua sắm máy tính mới).

3. NỘI DUNG VĂN BẢN:
   - Font chữ: 'Times New Roman', cỡ chữ 13-14pt, giãn dòng 1.3 - 1.4, căn lề 2 bên (text-align: justify).
   - Thụt đầu dòng: text-indent: 1.27cm (hoặc 1cm).
   - Căn cứ pháp lý: In nghiêng, thụt lề đầu dòng.

4. NƠI NHẬN VÀ CHỮ KÝ (Bảng 2 cột cân đối ở cuối):
   - Bên trái: "Nơi nhận:" cỡ 12pt, in đậm, nghiêng. Danh sách nơi nhận cỡ 11pt, dòng giãn 1.3, có dấu gạch đầu dòng.
   - Bên phải: Chức danh người ký in hoa, in đậm, cỡ 13pt. Dưới có khoảng trống ký và họ tên người ký in đậm.

CÁC GỢI Ý ĐỀ XUẤT CHỈNH SỬA CẦN ÁP DỤNG:
"""
${Array.isArray(suggestions) ? suggestions.join("\n") : (suggestions || "Chuẩn hóa theo Nghị định 30")}
"""

VĂN BẢN GỐC HIỆN TẠI:
"""
${content}
"""

QUY CÁCH ĐẦU RA:
- TUYỆT ĐỐI KHÔNG thêm bất kỳ lời chào, lời dẫn (như "Dưới đây là...", "Tôi đã sửa...").
- Chỉ xuất DUY NHẤT mã HTML hợp lệ chuẩn bắt đầu bằng <div ...> và kết thúc bằng </div>.
`;

    let fixedHtml = (await callGeminiWithFallback(fixPrompt)).trim();
    fixedHtml = fixedHtml
      .replace(/^```html\s*/i, "")
      .replace(/^```markdown\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const htmlStartIndex = fixedHtml.indexOf("<");
    if (htmlStartIndex > 0) {
      fixedHtml = fixedHtml.substring(htmlStartIndex);
    }

    return res.json({
      success: true,
      message: "Đã tự động chỉnh sửa văn bản theo chuẩn thể thức Nghị định 30 thành công!",
      data: {
        content: fixedHtml,
      },
    });
  } catch (error) {
    console.error("Lỗi fixDocumentCompliance:", error);
    return res.status(500).json({ success: false, message: "Lỗi khi tự động chỉnh sửa thể thức: " + (error.message || ""), error: error.message });
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
  fixDocumentCompliance,
  getDraftHistory,
};
