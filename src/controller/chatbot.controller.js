const { GoogleGenerativeAI, SchemaType } = require("@google/generative-ai");
const ChatbotConfig = require("../models/chatbotConfig.model");
const Task = require("../models/task.model");
const Document = require("../models/document.model");
const User = require("../models/user.model");
const SystemConfig = require("../models/systemConfig.model");
const OnlineRecord = require("../models/onlineRecord.model");
const EmulationRegistration = require("../models/emulationRegistration.model");
const EmulationAchievement = require("../models/emulationAchievement.model");
const TrainingRegistration = require("../models/trainingRegistration.model");
const WorkSchedule = require("../models/workSchedule.model");

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
      if (/[.*+?^${}()|[\]\\]/.test(char)) {
        regexStr += '\\' + char;
      } else {
        regexStr += char;
      }
    }
  }
  return regexStr;
};

// Loại bỏ các từ dừng thông dụng trong câu hỏi tự nhiên tiếng Việt để tìm từ khóa cốt lõi
const cleanSearchKeywords = (rawText) => {
  if (!rawText) return [];
  const stopWords = new Set([
    "tim", "kiem", "tra", "cuu", "xem", "co", "nhung", "cac", "nhung", "cai", "la", 
    "gi", "sao", "nao", "giup", "toi", "minh", "em", "ban", "cho", "ve", "cua", 
    "va", "trong", "tai", "theo", "voi", "nhu", "hay", "liet", "ke", "danh", "sach",
    "van", "ban", "cong", "viec", "ho", "so", "thi", "dua", "khen", "thuong", "tap",
    "huan", "boi", "duong", "lich", "tuan", "cong", "tac"
  ]);

  const words = rawText.split(/\s+/).filter(w => w.trim() !== "");
  const meaningfulWords = words.filter(w => !stopWords.has(w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')));
  
  // Nếu loại hết thì fallback về danh sách ban đầu để không rỗng
  return (meaningfulWords.length > 0 ? meaningfulWords : words);
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
        if (msg.role === 'model' && validHistory.length === 0) continue;
        if (msg.role === lastRole) continue;
        
        validHistory.push(msg);
        lastRole = msg.role;
      }
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
    let userDepartmentId = null;

    if (userId) {
      const user = await User.findById(userId);
      if (user) {
        userName = user.name || "Người dùng";
        userDepartmentId = user.department;
        
        todoTaskCount = await Task.countDocuments({
          $or: [ { assignees: userId }, { collaborators: userId } ],
          status: { $in: ['TODO', 'IN_PROGRESS'] }
        });

        unreadDocCount = await Document.countDocuments({
          "assignedToUsers": { $elemMatch: { userId: userId, isRead: false } }
        });

        userDataContext = `Thông tin người dùng: Tên là "${userName}", ID: "${userId}". Hiện có ${todoTaskCount} công việc cần xử lý và ${unreadDocCount} văn bản chưa xem.`;
      }
    }

    if (isInit) {
      return res.status(200).json({ 
        success: true, 
        reply: `👋 Chào ${userName}, Em là Trợ lý AI Hệ thống! Em có thể tra cứu toàn bộ thông tin tài khoản của bạn:\n\n` +
               `📄 **Văn bản**: Tra cứu văn bản đến/đi/nội bộ, văn bản chưa đọc, văn bản khẩn, số hiệu...\n` +
               `📋 **Công việc**: Nhiệm vụ cần làm, đang xử lý, deadline, công việc phối hợp...\n` +
               `📂 **Hồ sơ trực tuyến**: Tiến độ duyệt hồ sơ cá nhân, hồ sơ đã nộp/cần duyệt...\n` +
               `🏆 **Thi đua khen thưởng**: Danh hiệu thi đua đăng ký, thành tích, khen thưởng...\n` +
               `🎓 **Bồi dưỡng tập huấn**: Các khóa đào tạo/tập huấn đã đăng ký, trạng thái duyệt...\n` +
               `📅 **Lịch công tác**: Lịch họp, sự kiện công tác trong tuần của trường.\n\n` +
               `📌 Hiện tại, bạn đang có **${todoTaskCount}** công việc cần xử lý và **${unreadDocCount}** văn bản mới chưa xem. Hãy cho em biết bạn cần tìm gì nhé!`,
        suggestions: [
          "Tôi có văn bản nào chưa xem?", 
          "Liệt kê công việc cần làm", 
          "Hồ sơ trực tuyến của tôi thế nào?", 
          "Danh hiệu thi đua tôi đã đăng ký", 
          "Lịch công tác tuần này"
        ]
      });
    }

    // Tools definition
    const tools = [{
      functionDeclarations: [
        {
          name: "searchUserDocuments",
          description: "Tra cứu văn bản (đến, đi, nội bộ) liên quan đến tài khoản người dùng hoặc toàn trường. Dùng khi hỏi văn bản chưa xem, văn bản khẩn, tìm trích yếu, số hiệu.",
          parameters: {
            type: SchemaType ? SchemaType.OBJECT : "object",
            properties: {
              keyword: {
                type: SchemaType ? SchemaType.STRING : "string",
                description: "Từ khoá trích yếu, số hiệu văn bản (ví dụ: 'thông báo', 'kế hoạch 2026', '154'). Để trống nếu chỉ muốn liệt kê văn bản."
              },
              isRead: {
                type: SchemaType ? SchemaType.BOOLEAN : "boolean",
                description: "false nếu hỏi văn bản chưa đọc/chưa xem; true nếu hỏi đã đọc. Bỏ qua nếu không phân biệt."
              },
              urgency: {
                type: SchemaType ? SchemaType.STRING : "string",
                description: "Mức độ khẩn: 'high', 'immediately' hoặc 'normal'."
              }
            }
          }
        },
        {
          name: "searchUserTasks",
          description: "Tra cứu công việc/nhiệm vụ của người dùng (được giao, phối hợp, tự tạo).",
          parameters: {
            type: SchemaType ? SchemaType.OBJECT : "object",
            properties: {
              keyword: {
                type: SchemaType ? SchemaType.STRING : "string",
                description: "Từ khoá tên hoặc nội dung công việc. Để trống nếu chỉ liệt kê danh sách."
              },
              status: {
                type: SchemaType ? SchemaType.STRING : "string",
                description: "'PENDING' (việc cần làm / đang làm), 'DONE' (hoàn thành), 'CANCELLED'. Bỏ qua nếu tìm tất cả."
              }
            }
          }
        },
        {
          name: "searchOnlineRecords",
          description: "Tra cứu hồ sơ trực tuyến một cửa của người dùng (hồ sơ do người dùng nộp hoặc người dùng được phân công tiếp nhận/phê duyệt).",
          parameters: {
            type: SchemaType ? SchemaType.OBJECT : "object",
            properties: {
              keyword: {
                type: SchemaType ? SchemaType.STRING : "string",
                description: "Từ khoá tiêu đề hồ sơ, mã hồ sơ (ví dụ: 'nghỉ phép', 'HS-2026', 'xác nhận')."
              },
              status: {
                type: SchemaType ? SchemaType.STRING : "string",
                description: "Trạng thái hồ sơ: 'PENDING' (chờ duyệt), 'PROCESSING' (đang xử lý), 'APPROVED' (đã duyệt), 'REJECTED' (từ chối)."
              }
            }
          }
        },
        {
          name: "searchEmulationRecords",
          description: "Tra cứu thông tin thi đua khen thưởng của người dùng (danh hiệu đã đăng ký, kết quả khen thưởng, sáng kiến).",
          parameters: {
            type: SchemaType ? SchemaType.OBJECT : "object",
            properties: {
              keyword: {
                type: SchemaType ? SchemaType.STRING : "string",
                description: "Tên danh hiệu hoặc nội dung thành tích thi đua (ví dụ: 'Chiến sĩ thi đua', 'Lao động tiên tiến')."
              },
              year: {
                type: SchemaType ? SchemaType.STRING : "string",
                description: "Năm học hoặc năm thi đua (ví dụ: '2025-2026', '2026')."
              }
            }
          }
        },
        {
          name: "searchTrainingRegistrations",
          description: "Tra cứu danh sách đăng ký bồi dưỡng, tập huấn, khóa học nghiệp vụ của người dùng.",
          parameters: {
            type: SchemaType ? SchemaType.OBJECT : "object",
            properties: {
              keyword: {
                type: SchemaType ? SchemaType.STRING : "string",
                description: "Nội dung khóa bồi dưỡng, tên chứng chỉ hoặc địa điểm đào tạo."
              },
              status: {
                type: SchemaType ? SchemaType.STRING : "string",
                description: "Trạng thái: 'PENDING' (chờ duyệt), 'APPROVED' (được duyệt), 'REJECTED'."
              }
            }
          }
        },
        {
          name: "searchWorkSchedules",
          description: "Tra cứu lịch công tác, lịch họp, sự kiện của nhà trường hoặc phòng ban trong tuần/tháng.",
          parameters: {
            type: SchemaType ? SchemaType.OBJECT : "object",
            properties: {
              keyword: {
                type: SchemaType ? SchemaType.STRING : "string",
                description: "Nội dung cuộc họp, thành phần tham gia hoặc địa điểm."
              },
              timeRange: {
                type: SchemaType ? SchemaType.STRING : "string",
                description: "'this_week' (tuần này), 'next_week' (tuần tới), 'today' (hôm nay). Mặc định là tuần này."
              }
            }
          }
        }
      ]
    }];

    let systemBrand = "Hệ thống Quản lý Văn bản và Điều hành - NSG-Office";
    try {
      const sys = await SystemConfig.findOne().lean();
      if (sys && sys.siteName && sys.siteName.trim()) {
        systemBrand = sys.siteName.trim();
      }
    } catch (e) {
      console.warn("Lỗi lấy brandName trong chatbot:", e.message);
    }

    const systemInstruction = `Bạn là trợ lý ảo AI thông minh và tận tâm của ${systemBrand}.
Nhiệm vụ của bạn là giải đáp và tra cứu mọi thông tin liên quan đến tài khoản người dùng:
- Văn bản (văn bản đến, đi, nội bộ, văn bản chưa xem, văn bản khẩn)
- Công việc (nhiệm vụ cần làm, tiến độ, thời hạn deadline)
- Hồ sơ trực tuyến (tiến độ xử lý hồ sơ, tình trạng duyệt)
- Thi đua khen thưởng (danh hiệu thi đua đã đăng ký, khen thưởng)
- Đào tạo bồi dưỡng (các lớp tập huấn, khóa bồi dưỡng chuyên môn)
- Lịch công tác (lịch họp, sự kiện của trường)

${userDataContext}

NGUYÊN TẮC TRẢ LỜI:
1. Khi người dùng hỏi về bất kỳ dữ liệu nào ở trên, HÃY CHỦ ĐỘNG GỌI CÔNG CỤ (tool) phù hợp nhất để lấy dữ liệu thực tế trước khi trả lời.
2. Trả lời mạch lạc, rõ ràng, gạch đầu dòng các mục quan trọng. Nếu có ngày tháng, hãy định dạng kiểu dd/mm/yyyy.
3. Nếu mục đó có Tệp đính kèm (Drive file), BẮT BUỘC chèn đường link dạng Markdown: [Tên file](https://drive.google.com/file/d/MÃ_FILE/view) để người dùng có thể nhấp vào xem trực tiếp.
4. Tuyệt đối không bịa đặt dữ liệu. Nếu không tìm thấy, hãy thông báo lịch sự rằng không tìm thấy kết quả phù hợp.`;

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
          const kw = (args.keyword || "").trim();
          
          let query = {
             $or: [ 
               { "assignedToUsers.userId": userId }, 
               { sentBy: userId },
               { signer: userId },
               ...(userDepartmentId ? [{ departments: userDepartmentId }] : [])
             ] 
          };

          if (kw) {
            const matchNum = kw.match(/\d+/);
            const numToSearch = matchNum ? parseInt(matchNum[0], 10) : null;
            const terms = cleanSearchKeywords(kw);
            
            const orConditions = [];
            
            // Tìm theo số hiệu văn bản
            if (numToSearch) {
              orConditions.push({ docNum: numToSearch });
            }
            orConditions.push({ docCode: { $regex: createVietnameseRegex(kw), $options: "i" } });

            // Tìm theo trích yếu và ý kiến chỉ đạo
            if (terms.length > 0) {
              terms.forEach(t => {
                const termRegex = createVietnameseRegex(t);
                orConditions.push({ shortDescription: { $regex: termRegex, $options: "i" } });
                orConditions.push({ principalIdea: { $regex: termRegex, $options: "i" } });
              });
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
              loaiVanBan: d.docType === 'received' ? 'Văn bản đến' : 'Văn bản đi/nội bộ',
              trangThaiDoc: d.assignedToUsers.find(u => u.userId?.toString() === userId.toString())?.isRead ? 'Đã xem' : 'Chưa xem',
              mucDoKhan: d.urgency === 'immediately' ? 'Hỏa tốc' : (d.urgency === 'high' ? 'Khẩn' : 'Bình thường'),
              tepDinhKem: d.files?.map(f => ({ ten: f.fileName, link: `https://drive.google.com/file/d/${f.fileId}/view` })) || []
            }));
          } else {
             functionResponseData = { result: "Không tìm thấy văn bản nào phù hợp." };
          }
        } else if (call.name === "searchUserTasks" && userId) {
          const args = call.args || {};
          const kw = (args.keyword || "").trim();
          
          let query = {
            $or: [ { assignees: userId }, { collaborators: userId }, { createdBy: userId } ]
          };

          if (kw) {
             const terms = cleanSearchKeywords(kw);
             const orConditions = [];
             terms.forEach(t => {
               const termRegex = createVietnameseRegex(t);
               orConditions.push({ title: { $regex: termRegex, $options: "i" } });
               orConditions.push({ description: { $regex: termRegex, $options: "i" } });
             });

             if (orConditions.length > 0) {
               query.$and = query.$and || [];
               query.$and.push({ $or: orConditions });
             }
          }

          if (args.status === 'PENDING') {
             query.status = { $in: ['TODO', 'IN_PROGRESS'] };
          } else if (args.status) {
             query.status = args.status;
          }

          const tasks = await Task.find(query).sort({ createdAt: -1 }).limit(10);
          
          if (tasks.length > 0) {
            const statusMap = {
              'TODO': 'Cần làm (Chưa bắt đầu)',
              'IN_PROGRESS': 'Đang thực hiện',
              'REVIEW': 'Chờ duyệt',
              'DONE': 'Đã hoàn thành',
              'CANCELLED': 'Đã hủy'
            };
            functionResponseData = tasks.map(t => ({
              tieuDe: t.title,
              trangThai: statusMap[t.status] || t.status,
              mucDoUuTien: t.priority === 'HIGH' ? 'Cao' : (t.priority === 'URGENT' ? 'Khẩn cấp' : 'Bình thường'),
              hanChot: (t.endDate || t.dueDate) ? new Date(t.endDate || t.dueDate).toLocaleDateString("vi-VN") : "Không có",
              tepDinhKem: t.files?.map(f => ({ ten: f.fileName, link: `https://drive.google.com/file/d/${f.fileId}/view` })) || []
            }));
          } else {
             functionResponseData = { result: "Không tìm thấy công việc nào phù hợp." };
          }
        } else if (call.name === "searchOnlineRecords" && userId) {
          const args = call.args || {};
          const kw = (args.keyword || "").trim();

          let query = {
            $or: [ { sender: userId }, { recipients: userId } ]
          };

          if (kw) {
            const terms = cleanSearchKeywords(kw);
            const orConditions = [
              { recordCode: { $regex: createVietnameseRegex(kw), $options: "i" } },
              { title: { $regex: createVietnameseRegex(kw), $options: "i" } },
              { categoryName: { $regex: createVietnameseRegex(kw), $options: "i" } }
            ];
            terms.forEach(t => {
              const termRegex = createVietnameseRegex(t);
              orConditions.push({ title: { $regex: termRegex, $options: "i" } });
              orConditions.push({ note: { $regex: termRegex, $options: "i" } });
            });
            query.$and = query.$and || [];
            query.$and.push({ $or: orConditions });
          }

          if (args.status) {
            query.status = args.status;
          }

          const records = await OnlineRecord.find(query).sort({ createdAt: -1 }).limit(10);
          if (records.length > 0) {
            const statusMap = {
              'PENDING': 'Chờ tiếp nhận/duyệt',
              'PROCESSING': 'Đang xử lý',
              'APPROVED': 'Đã duyệt thành công',
              'REJECTED': 'Bị từ chối',
              'CANCELLED': 'Đã hủy'
            };
            functionResponseData = records.map(r => ({
              maHoSo: r.recordCode,
              tieuDe: r.title,
              danhMuc: r.categoryName,
              nguoiNop: r.fullName,
              trangThai: statusMap[r.status] || r.status,
              yKienXuLy: r.reviewOpinion || 'Chưa có ý kiến',
              ngayNop: r.createdAt ? new Date(r.createdAt).toLocaleDateString("vi-VN") : 'N/A',
              tepDinhKem: r.attachedFiles?.map(f => ({ ten: f.fileName, link: `https://drive.google.com/file/d/${f.fileId}/view` })) || []
            }));
          } else {
            functionResponseData = { result: "Không tìm thấy hồ sơ trực tuyến nào." };
          }
        } else if (call.name === "searchEmulationRecords" && userId) {
          const args = call.args || {};
          const kw = (args.keyword || "").trim();

          // Tìm cả đăng ký danh hiệu (EmulationRegistration) và thành tích khen thưởng (EmulationAchievement)
          const regQuery = { user: userId };
          if (args.year) {
            regQuery.schoolYear = { $regex: createVietnameseRegex(args.year), $options: "i" };
          }

          const achQuery = { user: userId };
          if (args.year) {
            achQuery.schoolYear = { $regex: createVietnameseRegex(args.year), $options: "i" };
          }

          if (kw) {
            const termRegex = createVietnameseRegex(kw);
            regQuery.$or = [
              { "members.titleNames": { $regex: termRegex, $options: "i" } },
              { notes: { $regex: termRegex, $options: "i" } }
            ];
            achQuery.$or = [
              { titleName: { $regex: termRegex, $options: "i" } },
              { achievementContent: { $regex: termRegex, $options: "i" } },
              { decisionNumber: { $regex: termRegex, $options: "i" } }
            ];
          }

          const [registrations, achievements] = await Promise.all([
            EmulationRegistration.find(regQuery).sort({ createdAt: -1 }).limit(5),
            EmulationAchievement.find(achQuery).sort({ createdAt: -1 }).limit(5)
          ]);

          const statusRegMap = {
            'PENDING': 'Chờ duyệt',
            'SUBMITTED_TO_BGH': 'Đã gửi BGH duyệt',
            'SCHOOL_APPROVED': 'Nhà trường đã phê duyệt',
            'REJECTED': 'Từ chối'
          };

          const regResults = registrations.map(r => ({
            loai: 'Đăng ký danh hiệu thi đua',
            namHoc: r.schoolYear,
            danhHieu: r.members?.flatMap(m => m.titleNames).join(", ") || 'N/A',
            trangThai: statusRegMap[r.status] || r.status,
            ghiChu: r.notes,
            tepDinhKem: r.attachedFiles?.map(f => ({ ten: f.fileName, link: `https://drive.google.com/file/d/${f.fileId}/view` })) || []
          }));

          const achResults = achievements.map(a => ({
            loai: 'Khen thưởng / Thành tích đã đạt',
            namHoc: a.schoolYear,
            danhHieu: a.titleName,
            noiDung: a.achievementContent,
            soQuyetDinh: a.decisionNumber ? `${a.decisionNumber} (${a.decisionAgency || ''})` : 'N/A',
            tepDinhKem: a.attachedFiles?.map(f => ({ ten: f.fileName, link: `https://drive.google.com/file/d/${f.fileId}/view` })) || []
          }));

          const combined = [...regResults, ...achResults];
          functionResponseData = combined.length > 0 ? combined : { result: "Không tìm thấy thông tin thi đua khen thưởng nào." };

        } else if (call.name === "searchTrainingRegistrations" && userId) {
          const args = call.args || {};
          const kw = (args.keyword || "").trim();

          let query = {
            $or: [ { user: userId }, { createdByUser: userId } ]
          };

          if (kw) {
            const terms = cleanSearchKeywords(kw);
            const orConditions = [
              { trainingContent: { $regex: createVietnameseRegex(kw), $options: "i" } },
              { trainingLocation: { $regex: createVietnameseRegex(kw), $options: "i" } }
            ];
            terms.forEach(t => {
              const termRegex = createVietnameseRegex(t);
              orConditions.push({ trainingContent: { $regex: termRegex, $options: "i" } });
            });
            query.$and = query.$and || [];
            query.$and.push({ $or: orConditions });
          }

          if (args.status) {
            query.status = args.status;
          }

          const trainings = await TrainingRegistration.find(query).sort({ createdAt: -1 }).limit(10);
          if (trainings.length > 0) {
            const statusMap = {
              'PENDING': 'Chờ duyệt',
              'APPROVED': 'Đã duyệt cho phép tham gia',
              'REJECTED': 'Không duyệt'
            };
            functionResponseData = trainings.map(t => ({
              noiDungKhoaHoc: t.trainingContent,
              nam: t.year,
              hinhThuc: t.trainingForm,
              diaDiem: t.trainingLocation || 'Không ghi',
              thoiGian: `${t.startDate ? new Date(t.startDate).toLocaleDateString("vi-VN") : ''} - ${t.endDate ? new Date(t.endDate).toLocaleDateString("vi-VN") : ''}`,
              chiPhiDuKien: t.estimatedCost ? `${t.estimatedCost.toLocaleString("vi-VN")} đ` : '0 đ',
              trangThaiDuyet: statusMap[t.status] || t.status,
              ketQuaSauHoc: t.reportResult?.status === 'REPORTED' ? 'Đã hoàn thành và nộp báo cáo' : 'Chưa báo cáo kết quả'
            }));
          } else {
            functionResponseData = { result: "Không tìm thấy thông tin đăng ký bồi dưỡng, tập huấn nào." };
          }
        } else if (call.name === "searchWorkSchedules") {
          const args = call.args || {};
          const kw = (args.keyword || "").trim();
          const timeRange = args.timeRange || "this_week";

          const now = new Date();
          let startRange = new Date(now);
          let endRange = new Date(now);

          if (timeRange === "today") {
            startRange.setHours(0, 0, 0, 0);
            endRange.setHours(23, 59, 59, 999);
          } else if (timeRange === "next_week") {
            const dayOfWeek = now.getDay() || 7;
            startRange.setDate(now.getDate() + (8 - dayOfWeek));
            startRange.setHours(0, 0, 0, 0);
            endRange.setDate(startRange.getDate() + 6);
            endRange.setHours(23, 59, 59, 999);
          } else {
            // this_week (default): từ Thứ 2 đến Chủ Nhật tuần này
            const dayOfWeek = now.getDay() || 7;
            startRange.setDate(now.getDate() - dayOfWeek + 1);
            startRange.setHours(0, 0, 0, 0);
            endRange.setDate(now.getDate() + (7 - dayOfWeek));
            endRange.setHours(23, 59, 59, 999);
          }

          let query = {
            startDate: { $gte: startRange, $lte: endRange },
            status: "APPROVED"
          };

          if (kw) {
            const terms = cleanSearchKeywords(kw);
            const orConditions = [
              { content: { $regex: createVietnameseRegex(kw), $options: "i" } },
              { host: { $regex: createVietnameseRegex(kw), $options: "i" } },
              { location: { $regex: createVietnameseRegex(kw), $options: "i" } }
            ];
            terms.forEach(t => {
              const termRegex = createVietnameseRegex(t);
              orConditions.push({ content: { $regex: termRegex, $options: "i" } });
            });
            query.$and = query.$and || [];
            query.$and.push({ $or: orConditions });
          }

          const schedules = await WorkSchedule.find(query).sort({ startDate: 1, startTime: 1 }).limit(10);
          if (schedules.length > 0) {
            functionResponseData = schedules.map(s => ({
              thoiGian: `${s.startTime || ''} - ${s.endTime || ''} ngày ${new Date(s.startDate).toLocaleDateString("vi-VN")}`,
              noiDung: s.content,
              chuTri: s.host || 'Ban Giám Hiệu',
              diaDiem: s.location || 'Tại trường',
              thanhPhan: s.participants || 'Toàn thể'
            }));
          } else {
            functionResponseData = { result: "Không có lịch công tác hoặc sự kiện họp nào trong khoảng thời gian này." };
          }
        }
        
        // Gửi kết quả tool về cho Gemini để sinh câu trả lời tự nhiên
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
