const { GoogleGenerativeAI, SchemaType } = require("@google/generative-ai");
const ChatbotConfig = require("../models/chatbotConfig.model");
const Task = require("../models/task.model");
const Document = require("../models/document.model");
const User = require("../models/user.model");

// Hàm tạo Regex để tìm kiếm tiếng Việt không dấu/có dấu
const createVietnameseRegex = (term) => {
  const chars = {
    'a': '[aAàÀảẢãÃáÁạẠăĂằẰẳẲẵẴắẮặẶâÂầẦẩẨẫẪấẤậẬ]',
    'e': '[eEèÈẻẺẽẼéÉẹẸêÊềỀểỂễỄếẾệỆ]',
    'i': '[iIìÌỉỈĩĨíÍịỊ]',
    'o': '[oOòÒỏỎõÕóÓọỌôÔồỒổỔỗỖốỐộỘơƠờỜởỞỡỠớỚợỢ]',
    'u': '[uUùÙủỦũŨúÚụỤưƯừỪửỬữỮứỨựỰ]',
    'y': '[yYỳỲỷỶỹỸýÝỵỴ]',
    'd': '[dDđĐ]'
  };
  
  // Loại bỏ dấu để đưa về ký tự latin cơ bản
  let normalized = term.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  
  let regexStr = '';
  for (let char of normalized) {
    if (chars[char]) {
      regexStr += chars[char];
    } else {
      // Escape special regex chars just in case
      if (/[.*+?^${}()|[\]\\]/.test(char)) {
        regexStr += '\\' + char;
      } else {
        regexStr += char;
      }
    }
  }
  return regexStr;
};

const handleChat = async (req, res) => {
  try {
    const { message, isInit, history } = req.body;
    const userId = req.user?.id || req.body.userId;

    if (!message && !isInit) {
      return res.status(400).json({ success: false, message: "Tin nhắn không được để trống" });
    }

    // Clean up history to meet Gemini requirements (must start with user, must alternate)
    let validHistory = [];
    if (Array.isArray(history)) {
        let lastRole = null;
        for (const msg of history) {
            // Ignore bot's initial greeting if it's the first message
            if (msg.role === 'model' && validHistory.length === 0) continue;
            // Ignore consecutive messages from the same role
            if (msg.role === lastRole) continue;
            
            validHistory.push(msg);
            lastRole = msg.role;
        }
        // If the last message is from user (meaning the API failed previously), remove it so we end with 'model'
        if (validHistory.length > 0 && validHistory[validHistory.length - 1].role === 'user') {
            validHistory.pop();
        }
    }

    const config = await ChatbotConfig.findOne();
    if (!config || !config.isActive || !config.geminiApiKey) {
      return res.status(403).json({ success: false, message: "Chatbot hiện đang bảo trì hoặc chưa được cấu hình." });
    }

    const genAI = new GoogleGenerativeAI(config.geminiApiKey);

    let userName = "Người dùng";
    let userDataContext = "";
    let todoTaskCount = 0;
    let unreadDocCount = 0;

    if (userId) {
      const user = await User.findById(userId);
      if (user) {
        userName = user.name || "Người dùng";
        
        todoTaskCount = await Task.countDocuments({
          $or: [ { assignees: userId }, { collaborators: userId } ],
          status: { $in: ['TODO', 'IN_PROGRESS'] }
        });

        unreadDocCount = await Document.countDocuments({
          "assignedToUsers": { $elemMatch: { userId: userId, isRead: false } }
        });

        userDataContext = `Thông tin cá nhân: Tên bạn là ${userName}. Hiện có ${todoTaskCount} công việc cần xử lý và ${unreadDocCount} văn bản mới chưa xem. ID người dùng là ${userId}.`;
      }
    }

    if (isInit) {
      return res.status(200).json({ 
        success: true, 
        reply: `👋 Chào ${userName}, Em là Chatbot AI QLVB NSG! Hôm nay em có thể giúp gì cho mình ạ? ✨\n\n📌 Hiện tại, bạn đang có **${todoTaskCount}** công việc cần xử lý và **${unreadDocCount}** văn bản mới chưa xem đó.`,
        suggestions: ["Tôi có văn bản nào chưa xem?", "Liệt kê công việc chưa làm", "Tìm văn bản về trí tuệ nhân tạo"]
      });
    }

    // Tools definition
    const tools = [{
      functionDeclarations: [
        {
          name: "searchUserDocuments",
          description: "Tìm kiếm văn bản đến, đi hoặc nội bộ của người dùng. Gọi hàm này khi người dùng hỏi danh sách văn bản, hoặc văn bản chưa xem, văn bản khẩn, hoặc tìm văn bản theo từ khoá.",
          parameters: {
            type: SchemaType ? SchemaType.OBJECT : "object",
            properties: {
              keyword: {
                type: SchemaType ? SchemaType.STRING : "string",
                description: "Từ khoá tìm kiếm (trích yếu, số hiệu). KHÔNG điền các từ chỉ trạng thái (như 'chưa xem', 'khẩn') vào đây. Bỏ qua trường này nếu người dùng chỉ muốn liệt kê văn bản nói chung."
              },
              isRead: {
                type: SchemaType ? SchemaType.BOOLEAN : "boolean",
                description: "Truyền false nếu người dùng muốn tìm văn bản CHƯA ĐỌC/CHƯA XEM. Truyền true nếu tìm văn bản đã đọc. Bỏ qua nếu không quan tâm."
              },
              urgency: {
                type: SchemaType ? SchemaType.STRING : "string",
                description: "Mức độ khẩn. Nếu người dùng hỏi văn bản khẩn cấp, truyền 'high' hoặc 'immediately'. Bình thường truyền 'normal'. Bỏ qua nếu không quan tâm."
              }
            }
          }
        },
        {
          name: "searchUserTasks",
          description: "Tìm kiếm danh sách công việc của người dùng.",
          parameters: {
            type: SchemaType ? SchemaType.OBJECT : "object",
            properties: {
              keyword: {
                type: SchemaType ? SchemaType.STRING : "string",
                description: "Từ khoá tìm kiếm (tên, mô tả công việc). KHÔNG ĐIỀN các từ chỉ trạng thái (như 'cần xử lý', 'chưa làm', 'hoàn thành') vào đây. Để trống nếu không tìm từ khoá cụ thể."
              },
              status: {
                type: SchemaType ? SchemaType.STRING : "string",
                description: "Trạng thái công việc. Truyền 'PENDING' (nếu hỏi các việc đang cần xử lý, chưa làm, đang làm), 'DONE' (nếu hỏi đã hoàn thành). Bỏ qua nếu không quan tâm."
              }
            }
          }
        }
      ]
    }];

    const systemInstruction = `Bạn là trợ lý ảo thông minh của Hệ thống Quản lý Văn bản NSG.
Nhiệm vụ của bạn là trả lời các câu hỏi dựa trên thông tin cá nhân của người dùng.
${userDataContext}
Trả lời ngắn gọn, súc tích, lịch sự và chính xác. Không bịa đặt.
Nếu cần tìm chi tiết văn bản hay công việc, hãy sử dụng các công cụ tìm kiếm (tools) được cung cấp.
Khi trả lời về văn bản/công việc có Tệp đính kèm, HÃY CHÈN ĐƯỜNG LINK THEO CÚ PHÁP MARKDOWN để người dùng click vào xem, dạng: [Tên file](https://drive.google.com/file/d/MÃ_FILE/view).
Ví dụ: [Văn bản.pdf](https://drive.google.com/file/d/1abc.../view)`;

    let model;
    try {
      model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash",
        systemInstruction,
        tools 
      });
    } catch (e) {
      model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-pro",
        systemInstruction,
        tools 
      });
    }

    const chat = model.startChat({ history: validHistory });
    const result = await chat.sendMessage(message);
    const response = await result.response;
    let finalAnswer = response.text();

    const functionCalls = response.functionCalls();
    
    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      let functionResponseData = { result: "Không tìm thấy dữ liệu phù hợp." };
      
      try {
        if (call.name === "searchUserDocuments" && userId) {
          const args = call.args || {};
          const kw = args.keyword || "";
          
          let query = {
             $or: [ { "assignedToUsers.userId": userId }, { sentBy: userId } ] 
          };

          if (kw) {
            const matchNum = kw.match(/\d+/);
            const numToSearch = matchNum ? parseInt(matchNum[0], 10) : null;
            
            // Tách từ khóa thành các từ đơn để tìm kiếm linh hoạt hơn (giống Google Search)
            const terms = kw.split(/\s+/).filter(t => t.trim() !== "");
            
            const buildRegexArray = (field) => {
              return { $and: terms.map(t => ({ [field]: { $regex: createVietnameseRegex(t), $options: "i" } })) };
            };

            const orConditions = [
              buildRegexArray('docCode'),
              buildRegexArray('shortDescription'),
              buildRegexArray('principalIdea')
            ];
            
            if (numToSearch) {
              orConditions.push({ docNum: numToSearch });
            }
            query.$and = query.$and || [];
            query.$and.push({ $or: orConditions });
          }

          if (args.isRead !== undefined) {
             query.$and = query.$and || [];
             query.$and.push({
                 "assignedToUsers": { $elemMatch: { userId: userId, isRead: args.isRead } }
             });
          }

          if (args.urgency) {
              query.urgency = args.urgency;
          }

          const docs = await Document.find(query).sort({ createdAt: -1 }).limit(10);
          
          if (docs.length > 0) {
            functionResponseData = docs.map(d => ({
              soHieu: (d.docNum && d.docCode) ? `${d.docNum}/${d.docCode}` : (d.docCode || d.docNum || 'N/A'),
              trichYeu: d.shortDescription,
              trangThaiDoc: d.assignedToUsers.find(u => u.userId.toString() === userId.toString())?.isRead ? 'Đã xem' : 'Chưa xem',
              mucDoKhan: d.urgency,
              tepDinhKem: d.files?.map(f => ({ ten: f.fileName, link: `https://drive.google.com/file/d/${f.fileId}/view` })) || []
            }));
          } else {
             functionResponseData = { result: "Không tìm thấy văn bản nào." };
          }
        } else if (call.name === "searchUserTasks" && userId) {
          const args = call.args || {};
          const kw = args.keyword || "";
          
          let query = {
            $or: [ { assignees: userId }, { collaborators: userId }, { createdBy: userId } ]
          };

          if (kw) {
             const terms = kw.split(/\s+/).filter(t => t.trim() !== "");
             const buildRegexArray = (field) => {
               return { $and: terms.map(t => ({ [field]: { $regex: createVietnameseRegex(t), $options: "i" } })) };
             };

             query.$and = query.$and || [];
             query.$and.push({
                $or: [
                  buildRegexArray('title'),
                  buildRegexArray('description')
                ]
             });
          }

          if (args.status === 'PENDING') {
             query.status = { $in: ['TODO', 'IN_PROGRESS'] };
          } else if (args.status) {
             query.status = args.status;
          }

          const tasks = await Task.find(query).sort({ createdAt: -1 }).limit(10);
          
          if (tasks.length > 0) {
            functionResponseData = tasks.map(t => ({
              tieuDe: t.title,
              trangThai: t.status,
              mucDo: t.priority,
              hanChot: t.endDate || t.dueDate,
              tepDinhKem: t.files?.map(f => ({ ten: f.fileName, link: `https://drive.google.com/file/d/${f.fileId}/view` })) || []
            }));
          } else {
             functionResponseData = { result: "Không tìm thấy công việc nào." };
          }
        }
        
        // Send the function response back to the model
        const functionResponseResult = await chat.sendMessage([{
          functionResponse: {
            name: call.name,
            response: { results: functionResponseData }
          }
        }]);
        
        finalAnswer = functionResponseResult.response.text();
        
      } catch (err) {
        console.error("Function call error:", err);
      }
    }

    res.status(200).json({ success: true, reply: finalAnswer });
  } catch (error) {
    console.error("Chatbot error:", error);
    res.status(500).json({ success: false, message: "Lỗi kết nối tới AI Chatbot.", error: error.message });
  }
};

module.exports = {
  handleChat
};
