const { GoogleGenerativeAI } = require("@google/generative-ai");
const Document = require("../models/document.model");
const ChatbotConfig = require("../models/chatbotConfig.model");
require("../models/docVariant.model");
require("../models/unit.model");
require("../models/user.model");
require("../models/department.model");
const { google } = require("googleapis");
const unzipper = require("unzipper");
const DriveConfig = require("../models/driveConfig.model");

/**
 * Helper: Xác thực Google Drive qua Service Account (Tránh circular dependency)
 */
const getDriveAuth = async () => {
    const config = await DriveConfig.findOne();
    if (config && config.clientEmail && config.privateKey) {
        return new google.auth.JWT({
            email: config.clientEmail,
            key: config.privateKey.replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/drive'],
        });
    }
    if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
        return new google.auth.JWT({
            email: process.env.GOOGLE_CLIENT_EMAIL,
            key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/drive'],
        });
    }
    throw new Error("Chưa cấu hình Google Drive Service Account");
};

// Danh sách tất cả các model Gemini khả dụng được Google hỗ trợ cho phương thức generateContent:
// Bắt đầu từ model mới nhất gemini-3.8-flash, tự động fallback xuống các model ổn định cao.
const GEMINI_MODELS = [
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest",
    "gemini-flash-lite-latest",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-pro"
];

/**
 * Helper: Trích xuất văn bản từ tệp Word (.docx) qua unzipper
 */
const extractDocxText = async (buffer) => {
    try {
        const directory = await unzipper.Open.buffer(buffer);
        const documentXmlFile = directory.files.find(f => f.path === "word/document.xml");
        if (!documentXmlFile) return "";
        const contentBuffer = await documentXmlFile.buffer();
        const xml = contentBuffer.toString("utf-8");
        // Giữ lại dấu ngắt đoạn
        const withParagraphs = xml.replace(/<\/w:p>/g, "\n");
        // Bóc tách tag XML
        const text = withParagraphs.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        return text.slice(0, 40000);
    } catch (err) {
        console.warn("[AI Summarizer] Không thể đọc nội dung file Word (.docx):", err.message);
        return "";
    }
};

/**
 * Helper: Xác định tệp đính kèm chính cần đọc (Ưu tiên PDF, kế đến DOCX)
 */
const getPrimaryAttachment = (files) => {
    if (!Array.isArray(files) || files.length === 0) return null;

    // 1. Ưu tiên cao nhất: Tệp PDF (đã ký số hoặc đính kèm văn bản gốc)
    const pdf = files.find(f => {
        const mime = (f.mimeType || "").toLowerCase();
        const name = (f.fileName || "").toLowerCase();
        return mime === "application/pdf" || name.endsWith(".pdf");
    });
    if (pdf) {
        const obj = pdf.toObject ? pdf.toObject() : pdf;
        return { ...obj, isPdf: true };
    }

    // 2. Ưu tiên thứ hai: Tệp Word DOCX
    const docx = files.find(f => {
        const mime = (f.mimeType || "").toLowerCase();
        const name = (f.fileName || "").toLowerCase();
        return mime.includes("wordprocessingml") || name.endsWith(".docx");
    });
    if (docx) {
        const obj = docx.toObject ? docx.toObject() : docx;
        return { ...obj, isDocx: true };
    }

    return null;
};

/**
 * Helper: Tải tệp từ Google Drive về Buffer
 */
const downloadDriveBuffer = async (fileId) => {
    const auth = await getDriveAuth();
    const drive = google.drive({ version: "v3", auth });
    const res = await drive.files.get(
        { fileId, alt: "media", supportsAllDrives: true },
        { responseType: "arraybuffer" }
    );
    return Buffer.from(res.data);
};

/**
 * Trợ lý AI Tóm tắt văn bản thông minh (Hỗ trợ đọc sâu file đính kèm & Tự động chuyển đổi Model)
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

        // Chuẩn bị thông tin bối cảnh văn bản từ metadata
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

        // Tiến hành tải và đọc trực tiếp file đính kèm chính nếu có
        let filePart = null;
        let docxExtraText = "";
        let analyzedFile = "";

        const attachment = getPrimaryAttachment(doc.files);
        if (attachment && attachment.fileId) {
            try {
                const fileBuffer = await downloadDriveBuffer(attachment.fileId);
                if (attachment.isPdf) {
                    // Giới hạn 15MB để truyền an toàn qua inlineData của Gemini
                    if (fileBuffer.length <= 15 * 1024 * 1024) {
                        filePart = {
                            inlineData: {
                                data: fileBuffer.toString("base64"),
                                mimeType: "application/pdf"
                            }
                        };
                        analyzedFile = attachment.fileName || "Tệp PDF đính kèm";
                    } else {
                        console.warn("[AI Summarizer] Tệp PDF vượt quá 15MB, dùng metadata tóm tắt.");
                    }
                } else if (attachment.isDocx) {
                    const extracted = await extractDocxText(fileBuffer);
                    if (extracted) {
                        docxExtraText = extracted;
                        analyzedFile = attachment.fileName || "Tệp Word đính kèm";
                    }
                }
            } catch (driveErr) {
                console.warn(`[AI Summarizer] Không thể tải file ${attachment.fileName} từ Drive: ${driveErr.message}. Tiếp tục tóm tắt bằng metadata.`);
            }
        }

        let prompt = `Bạn là Trợ lý AI Hành chính Trường học chuyên nghiệp của Trường Cao đẳng Bách khoa Nam Sài Gòn.
Nhiệm vụ của bạn là phân tích và TÓM TẮT VĂN BẢN HÀNH CHÍNH dưới đây theo thể thức súc tích, mạch lạc, thực tế cho Ban Giám hiệu, Lãnh đạo các đơn vị và Cán bộ theo dõi:

THÔNG TIN HÀNH CHÍNH CỦA VĂN BẢN:
- Số hiệu / Ký hiệu: ${docInfo.docCode}
- Loại văn bản: ${docInfo.variant} (${docInfo.docType})
- Cơ quan / Đơn vị ban hành: ${docInfo.issuingUnit}
- Người ký / Chức vụ: ${docInfo.signer}
- Độ khẩn: ${docInfo.urgency}
- Hạn xử lý ghi nhận trên hệ thống: ${docInfo.deadlineDay}
- Đơn vị nhận trong trường: ${docInfo.targetDepartments}
- Trích yếu / Nội dung chính ghi nhận: ${docInfo.principalIdea || "(Người nhập chưa điền trích yếu, hãy đọc kỹ toàn văn tệp đính kèm để tóm tắt chính xác)"}
- Tóm tắt sơ bộ / Ghi chú: ${docInfo.shortDescription} ${docInfo.note}
- Tệp đính kèm: ${docInfo.files}`;

        if (docxExtraText) {
            prompt += `\n\nNỘI DUNG TOÀN VĂN TRÍCH XUẤT TỪ TỆP ĐÍNH KÈM (${analyzedFile}):\n${docxExtraText}`;
        }

        if (filePart) {
            prompt += `\n\nLƯU Ý ĐẶC BIỆT: Bạn được cung cấp trực tiếp tệp PDF gốc của văn bản (${analyzedFile}). Hãy đọc trực tiếp toàn văn nội dung tệp PDF này (bao gồm cả bảng biểu, căn cứ pháp lý, nội dung chỉ đạo, thời hạn và phân công trách nhiệm) để đưa ra bản tóm tắt chân thực, chính xác nhất.`;
        }

        prompt += `\n\nYÊU CẦU:
Hãy phân tích và trả về định dạng JSON thuần túy (không dùng markdown code fence, chỉ chuỗi JSON hợp lệ) với cấu trúc sau:
{
  "summaryText": "1 hoặc 2 câu tóm tắt cốt lõi nhất về mục đích, bản chất và đối tượng áp dụng của văn bản này đối với Nhà trường.",
  "keyPoints": [
    "Điểm trọng tâm 1 (nêu rõ số liệu, quy định hoặc mốc chính)",
    "Điểm trọng tâm 2",
    "Điểm trọng tâm 3"
  ],
  "suggestedDepartments": [
    "Tên phòng ban / khoa phù hợp nhất cần chủ trì thực hiện (ví dụ: Phòng Đào tạo, Phòng Công tác Học sinh - Sinh viên, Phòng Kế hoạch - Tài chính, Phòng Tổ chức - Hành chính...)"
  ],
  "deadlineNote": "Tóm tắt rõ mốc thời hạn báo cáo / hoàn thành hoặc 'Không quy định hạn chót cụ thể'",
  "recommendedActions": [
    "Gợi ý việc cụ thể cần làm 1",
    "Gợi ý việc cụ thể cần làm 2"
  ]
}`;

        const contents = filePart ? [prompt, filePart] : [prompt];

        let responseText = null;
        let usedModel = "";
        let lastError = null;

        // Vòng lặp tự động chuyển đổi Model nếu model gặp lỗi hoặc không khả dụng
        for (const modelName of GEMINI_MODELS) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(contents);
                const response = await result.response;
                responseText = response.text().trim();
                usedModel = modelName;
                break; // Thành công, thoát vòng lặp
            } catch (modelErr) {
                console.warn(`[AI Summarizer] Model ${modelName} gặp lỗi: ${modelErr.message}. Đang chuyển sang model tiếp theo...`);
                lastError = modelErr;
            }
        }

        // Nếu tất cả model đều lỗi khi gửi kèm file (ví dụ lỗi 503 do lưu lượng mạng hoặc file lớn), tự động dự phòng gửi bằng prompt metadata
        if (!responseText && filePart) {
            console.warn("[AI Summarizer] Thử nghiệm lại với metadata do gửi kèm file bị quá tải...");
            for (const modelName of ["gemini-3.5-flash-lite", "gemini-flash-latest", "gemini-2.5-flash"]) {
                try {
                    const model = genAI.getGenerativeModel({ model: modelName });
                    const result = await model.generateContent([prompt]);
                    const response = await result.response;
                    responseText = response.text().trim();
                    usedModel = modelName;
                    analyzedFile = ""; // Fallback sang metadata
                    break;
                } catch (retryErr) {
                    lastError = retryErr;
                }
            }
        }

        if (!responseText) {
            throw new Error(`Tất cả các model Gemini đều không phản hồi: ${lastError?.message || "Lỗi AI"}`);
        }

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
            analyzedFile: analyzedFile || "",
            usedModel: usedModel || "",
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

/**
 * Trích xuất siêu dữ liệu (metadata) từ tệp văn bản (PDF / ảnh / Word) bằng AI Gemini
 */
const extractDocumentMetadataByAI = async (fileBuffer, mimeType = "application/pdf", originalName = "") => {
    try {
        const config = await ChatbotConfig.findOne();
        const apiKey = config?.geminiApiKey || process.env.GEMINI_API_KEY;

        if (!apiKey) {
            throw new Error("Hệ thống chưa được cấu hình Google Gemini API Key. Vui lòng liên hệ Quản trị viên.");
        }

        const genAI = new GoogleGenerativeAI(apiKey);

        let filePart = null;
        if (fileBuffer && Buffer.isBuffer(fileBuffer)) {
            // Giới hạn 15MB
            if (fileBuffer.length <= 15 * 1024 * 1024) {
                filePart = {
                    inlineData: {
                        data: fileBuffer.toString("base64"),
                        mimeType: mimeType || "application/pdf"
                    }
                };
            }
        }

        const prompt = `Bạn là chuyên gia phân tích và bóc tách văn bản hành chính Việt Nam theo Nghị định 30/2020/NĐ-CP.
Hãy đọc kỹ tệp đính kèm (hoặc trang đầu) và trích xuất chính xác các trường thông tin sau sang định dạng JSON:

{
  "docCode": "Ký hiệu văn bản (Ví dụ: SGDDT-GDTXNNDH, NSG-TCHC, KH-NSG. Không gồm số nếu số tách riêng)",
  "docNum": "Số thứ tự văn bản nếu có (chỉ lấy số nguyên, ví dụ: 328, 9807, 45)",
  "fullDocCode": "Số và ký hiệu hoàn chỉnh (Ví dụ: 328/NSG-TCHC, 9807/SGDDT-GDTXNNDH)",
  "issuedDate": "Ngày tháng năm ban hành văn bản theo định dạng YYYY-MM-DD (Ví dụ: 2026-09-18)",
  "year": "Năm ban hành văn bản (Ví dụ: 2026)",
  "variantName": "Thể loại văn bản (Công văn, Quyết định, Thông báo, Kế hoạch, Tờ trình, Báo cáo, Hướng dẫn, Biên bản, Quy định...)",
  "issuingUnit": "Tên cơ quan/tổ chức/đơn vị ban hành (Ví dụ: Sở Giáo dục và Đào tạo TP.HCM, Bộ Giáo dục và Đào tạo, Trường Cao đẳng Bách khoa Nam Sài Gòn, Ban Giám hiệu...)",
  "signerName": "Họ và tên người ký văn bản",
  "signerPosition": "Chức vụ người ký (Hiệu trưởng, Phó Hiệu trưởng, Giám đốc, Trưởng phòng...)",
  "shortDescription": "Trích yếu nội dung văn bản (văn phong hành chính rõ ràng, súc tích)",
  "urgency": "normal | high | immediately (mặc định normal; nếu có dấu Khẩn thì high; Hỏa tốc/Thượng khẩn thì immediately)",
  "deadlineDay": "Hạn báo cáo/xử lý theo định dạng YYYY-MM-DD nếu trong nội dung có quy định mốc thời gian hoàn thành (hoặc null)",
  "relatedDocReferences": ["Mảng các số hiệu văn bản được viện dẫn hoặc phúc đáp trong văn bản, ví dụ: ['123/NSG-TCHC', '45/KH-SGDDT']"]
}

LƯU Ý CỰC KỲ QUAN TRỌNG:
- Chỉ trả về duy nhất chuỗi JSON hợp lệ.
- TUYỆT ĐỐI KHÔNG thêm markdown \`\`\`json hay bất kỳ văn bản giải thích nào khác.`;

        const contents = filePart ? [filePart, prompt] : [prompt];

        let responseText = "";
        let usedModel = "";
        let lastError = null;

        for (const modelName of GEMINI_MODELS) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(contents);
                const response = await result.response;
                responseText = response.text();
                if (responseText) {
                    usedModel = modelName;
                    break;
                }
            } catch (err) {
                lastError = err;
                console.warn(`[AI OCR] Model ${modelName} thất bại, đang thử model tiếp theo...`);
            }
        }

        if (!responseText) {
            throw new Error(`AI không thể đọc tệp này: ${lastError?.message || "Lỗi xử lý"}`);
        }

        let cleaned = responseText.trim();
        if (cleaned.startsWith("```json")) {
            cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
        } else if (cleaned.startsWith("```")) {
            cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
        }

        let parsed = {};
        try {
            parsed = JSON.parse(cleaned);
        } catch (e) {
            console.error("[AI OCR] Lỗi parse JSON từ Gemini:", cleaned);
        }

        const DocVariant = require("../models/docVariant.model");
        const Unit = require("../models/unit.model");

        let matchedVariant = null;
        if (parsed.variantName) {
            matchedVariant = await DocVariant.findOne({
                $or: [
                    { docVariantName: { $regex: new RegExp(parsed.variantName.trim(), "i") } },
                    { variantName: { $regex: new RegExp(parsed.variantName.trim(), "i") } }
                ]
            });
        }

        let matchedUnit = null;
        if (parsed.issuingUnit) {
            matchedUnit = await Unit.findOne({
                unitName: { $regex: new RegExp(parsed.issuingUnit.trim(), "i") }
            });
        }

        let matchedRelatedDocs = [];
        if (Array.isArray(parsed.relatedDocReferences) && parsed.relatedDocReferences.length > 0) {
            for (const refCode of parsed.relatedDocReferences) {
                const cleanCode = refCode.trim();
                if (cleanCode.length >= 3) {
                    const docs = await Document.find({
                        $or: [
                            { docCode: { $regex: new RegExp(cleanCode.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), "i") } },
                            { verificationCode: cleanCode }
                        ]
                    }).select("_id docCode docNum year shortDescription");
                    if (docs && docs.length > 0) {
                        matchedRelatedDocs.push(...docs);
                    }
                }
            }
        }

        return {
            raw: parsed,
            usedModel,
            extracted: {
                docCode: parsed.docCode || "",
                docNum: parsed.docNum ? Number(parsed.docNum) : null,
                fullDocCode: parsed.fullDocCode || "",
                issuedDate: parsed.issuedDate || null,
                year: parsed.year || new Date().getFullYear().toString(),
                variantName: parsed.variantName || "",
                matchedVariantId: matchedVariant ? matchedVariant._id : null,
                issuingUnit: parsed.issuingUnit || "",
                matchedUnitId: matchedUnit ? matchedUnit._id : null,
                signerName: parsed.signerName || "",
                signerPosition: parsed.signerPosition || "",
                shortDescription: parsed.shortDescription || "",
                urgency: parsed.urgency || "normal",
                deadlineDay: parsed.deadlineDay || null,
                relatedDocReferences: parsed.relatedDocReferences || [],
                matchedRelatedDocs: matchedRelatedDocs
            }
        };
    } catch (err) {
        console.error("[AI OCR] Lỗi extractDocumentMetadataByAI:", err);
        throw err;
    }
};

module.exports = {
    summarizeDocumentWithAI,
    extractDocumentMetadataByAI
};
