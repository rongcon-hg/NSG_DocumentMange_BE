const { GoogleGenerativeAI } = require("@google/generative-ai");
const Document = require("../models/document.model");
const ChatbotConfig = require("../models/chatbotConfig.model");

/**
 * Trợ lý AI Tóm tắt văn bản thông minh (AI Document Summarizer)
 */
const summarizeDocumentWithAI = async (documentId, forceRefresh = false) => {
    try {
        const doc = await Document.findById(documentId)
            .populate('docVariant', 'variantName')
            .populate('unit', 'unitName')
            .populate('signer', 'name')
            .populate('departments', 'departmentName');

        if (!doc) {
            throw new Error("Không tìm thấy văn bản để tóm tắt");
        }

        // Nếu đã có bản tóm tắt trước đó và không yêu cầu làm mới thì trả về ngay (Cache hit)
        if (!forceRefresh && doc.aiSummary && doc.aiSummary.summaryText) {
            return {
                isCached: true,
                aiSummary: doc.aiSummary
            };
        }

        // Lấy API Key từ cấu hình Chatbot / Hệ thống
        const config = await ChatbotConfig.findOne();
        const apiKey = config?.geminiApiKey || process.env.GEMINI_API_KEY;

        if (!apiKey) {
            throw new Error("Hệ thống chưa được cấu hình Google Gemini API Key. Vui lòng liên hệ Quản trị viên.");
        }

        const genAI = new GoogleGenerativeAI(apiKey);

        // Chuẩn bị thông tin bối cảnh văn bản
        const docInfo = {
            docCode: doc.docCode || "Chưa có",
            docNum: doc.docNum || "Chưa có",
            docType: doc.docType === 'received' ? 'Văn bản đến (từ bên ngoài/cấp trên)' : 'Văn bản đi / ban hành',
            variant: doc.docVariant?.variantName || "Văn bản hành chính",
            issuingUnit: doc.unit?.unitName || "Trường Cao đẳng Bách khoa Nam Sài Gòn",
            signer: doc.signer?.name || "Lãnh đạo",
            principalIdea: doc.principalIdea || "",
            shortDescription: doc.shortDescription || "",
            note: doc.note || "",
            deadlineDay: doc.deadlineDay ? new Date(doc.deadlineDay).toLocaleDateString('vi-VN') : "Không có thời hạn cụ thể",
            urgency: doc.urgency === 'immediately' ? 'Hỏa tốc' : doc.urgency === 'high' ? 'Khẩn' : 'Bình thường',
            targetDepartments: (doc.departments || []).map(d => d.departmentName).join(', '),
            files: (doc.files || []).map(f => f.fileName).join(', ')
        };

        const prompt = `Bạn là Trợ lý AI Hành chính Trường học chuyên nghiệp của Trường Cao đẳng Bách khoa Nam Sài Gòn.
Nhiệm vụ của bạn là phân tích và TÓM TẮT VĂN BẢN HÀNH CHÍNH dưới đây theo thể thức súc tích, mạch lạc, thực tế cho Lãnh đạo và Giảng viên, Cán bộ theo dõi:

THÔNG TIN VĂN BẢN:
- Số hiệu / Ký hiệu: ${docInfo.docCode}
- Loại văn bản: ${docInfo.variant} (${docInfo.docType})
- Cơ quan / Đơn vị ban hành: ${docInfo.issuingUnit}
- Người ký / Chức vụ: ${docInfo.signer}
- Độ khẩn: ${docInfo.urgency}
- Hạn xử lý ghi nhận: ${docInfo.deadlineDay}
- Đơn vị nhận trong trường: ${docInfo.targetDepartments}
- Trích yếu / Nội dung chính: ${docInfo.principalIdea}
- Tóm tắt sơ bộ / Ghi chú: ${docInfo.shortDescription} ${docInfo.note}
- Tệp đính kèm: ${docInfo.files}

YÊU CẦU:
Hãy phân tích và trả về định dạng JSON thuần túy (không dùng markdown code fence, chỉ chuỗi JSON hợp lệ) với cấu trúc sau:
{
  "summaryText": "1 hoặc 2 câu tóm tắt cốt lõi nhất về mục đích, bản chất của văn bản này đối với Nhà trường.",
  "keyPoints": [
    "Điểm trọng tâm 1",
    "Điểm trọng tâm 2",
    "Điểm trọng tâm 3"
  ],
  "suggestedDepartments": [
    "Tên phòng ban / khoa phù hợp nhất cần chủ trì thực hiện (ví dụ: Phòng Đào tạo, Phòng CTSV, Phòng TCKT...)"
  ],
  "deadlineNote": "Tóm tắt rõ mốc thời hạn báo cáo / hoàn thành hoặc 'Không quy định hạn chót cụ thể'",
  "recommendedActions": [
    "Gợi ý việc cụ thể cần làm 1",
    "Gợi ý việc cụ thể cần làm 2"
  ]
}`;

        let model;
        try {
            model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        } catch (e) {
            model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        }

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let responseText = response.text().trim();

        // Xử lý nếu model trả về bọc trong ```json ... ```
        if (responseText.startsWith("```json")) {
            responseText = responseText.replace(/^```json/, "").replace(/```$/, "").trim();
        } else if (responseText.startsWith("```")) {
            responseText = responseText.replace(/^```/, "").replace(/```$/, "").trim();
        }

        let parsedData;
        try {
            parsedData = JSON.parse(responseText);
        } catch (jsonErr) {
            console.error("[AI Summarizer] Lỗi parse JSON từ Gemini, fallback text:", responseText);
            parsedData = {
                summaryText: responseText.slice(0, 300),
                keyPoints: [docInfo.principalIdea || "Nội dung theo trích yếu văn bản"],
                suggestedDepartments: [docInfo.targetDepartments || "Bộ phận chuyên môn"],
                deadlineNote: docInfo.deadlineDay,
                recommendedActions: ["Rà soát và thực hiện theo đúng nội dung chỉ đạo trong văn bản"]
            };
        }

        const aiSummary = {
            summaryText: parsedData.summaryText || docInfo.principalIdea || "Tóm tắt văn bản",
            keyPoints: Array.isArray(parsedData.keyPoints) ? parsedData.keyPoints : [],
            suggestedDepartments: Array.isArray(parsedData.suggestedDepartments) ? parsedData.suggestedDepartments : [],
            deadlineNote: parsedData.deadlineNote || docInfo.deadlineDay,
            recommendedActions: Array.isArray(parsedData.recommendedActions) ? parsedData.recommendedActions : [],
            generatedAt: new Date()
        };

        // Lưu vào document để cache cho các lần xem tiếp theo
        doc.aiSummary = aiSummary;
        await doc.save();

        return {
            isCached: false,
            aiSummary
        };
    } catch (err) {
        console.error("[AI Summarizer] Lỗi tóm tắt văn bản bằng AI:", err);
        throw err;
    }
};

module.exports = {
    summarizeDocumentWithAI
};
