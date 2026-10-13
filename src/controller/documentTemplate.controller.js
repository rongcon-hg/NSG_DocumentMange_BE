const DocumentTemplate = require("../models/documentTemplate.model");
const Department = require("../models/department.model");

// Danh sách biểu mẫu chuẩn ban đầu (Seed data nếu DB chưa có)
const SEED_TEMPLATES = [
  {
    title: "Mẫu Tờ trình phê duyệt Kế hoạch / Đề án công tác",
    code: "BM-TTR-01",
    category: "HANH_CHINH",
    docType: "TO_TRINH",
    description: "Sử dụng khi các đơn vị, phòng ban trình Ban Giám hiệu phê duyệt kế hoạch, đề xuất kinh phí hoặc chủ trương công tác.",
    content: `<div style="font-family: 'Times New Roman', Times, serif; font-size: 14pt; line-height: 1.5; padding: 20px;">
<table style="width: 100%; border: none;">
  <tr>
    <td style="width: 45%; text-align: center; vertical-align: top;">
      UBND THÀNH PHỐ HỒ CHÍ MINH<br/>
      <strong>TRƯỜNG CĐ BÁCH KHOA NAM SÀI GÒN</strong><br/>
      Đơn vị: <strong>{{DON_VI}}</strong><br/>
      Số: ....../TTr-{{MA_DON_VI}}
    </td>
    <td style="width: 55%; text-align: center; vertical-align: top;">
      <strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong><br/>
      <strong>Độc lập - Tự do - Hạnh phúc</strong><br/>
      <em>Thành phố Hồ Chí Minh, {{NGAY_HIEN_TAI}}</em>
    </td>
  </tr>
</table>

<div style="text-align: center; margin: 30px 0 20px 0;">
  <h2 style="font-size: 15pt; font-weight: bold; margin-bottom: 5px;">TỜ TRÌNH</h2>
  <em>V/v: Về việc phê duyệt kế hoạch thực hiện nhiệm vụ công tác</em>
</div>

<div style="text-align: center; margin-bottom: 20px;">
  <strong>Kính gửi:</strong> Ban Giám hiệu Trường Cao đẳng Bách khoa Nam Sài Gòn
</div>

<p style="text-indent: 1.27cm; text-align: justify;">
Căn cứ chức năng, nhiệm vụ được giao của <strong>{{DON_VI}}</strong> trong năm học;<br/>
Căn cứ tình hình thực tế và yêu cầu triển khai công việc;<br/>
Nay <strong>{{DON_VI}}</strong> kính trình Ban Giám hiệu xem xét, phê duyệt kế hoạch cụ thể như sau:
</p>

<p style="font-weight: bold; margin-top: 15px;">I. MỤC ĐÍCH, YÊU CẦU</p>
<p style="text-indent: 1.27cm; text-align: justify;">1. Mục đích: Đảm bảo tiến độ và nâng cao chất lượng công tác chuyên môn theo đúng chỉ đạo của Nhà trường.</p>
<p style="text-indent: 1.27cm; text-align: justify;">2. Yêu cầu: Triển khai hiệu quả, đúng tiến độ, tiết kiệm và tuân thủ các quy định hiện hành.</p>

<p style="font-weight: bold; margin-top: 15px;">II. NỘI DUNG VÀ THỜI GIAN THỰC HIỆN</p>
<p style="text-indent: 1.27cm; text-align: justify;">- Nội dung thực hiện: ....................................................................................</p>
<p style="text-indent: 1.27cm; text-align: justify;">- Thời gian dự kiến: ....................................................................................</p>

<p style="font-weight: bold; margin-top: 15px;">III. KINH PHÍ DỰ KIẾN (NẾU CÓ)</p>
<p style="text-indent: 1.27cm; text-align: justify;">Kinh phí thực hiện: ......................... đồng (Bằng chữ: .............................).</p>

<p style="text-indent: 1.27cm; text-align: justify;">
Kính trình Ban Giám hiệu xem xét và phê duyệt để đơn vị tiến hành thực hiện./.
</p>

<table style="width: 100%; border: none; margin-top: 30px;">
  <tr>
    <td style="width: 50%; vertical-align: top; font-size: 11pt;">
      <em><strong>Nơi nhận:</strong></em><br/>
      - Như trên;<br/>
      - Lưu: VT, {{MA_DON_VI}}.
    </td>
    <td style="width: 50%; text-align: center; vertical-align: top;">
      <strong>TRƯỞNG ĐƠN VỊ</strong><br/>
      <em>(Ký, ghi rõ họ tên)</em><br/><br/><br/><br/>
      <strong>{{TEN_CAN_BO}}</strong>
    </td>
  </tr>
</table>
</div>`,
  },
  {
    title: "Mẫu Giấy mời họp / Hội nghị",
    code: "BM-GM-02",
    category: "HANH_CHINH",
    docType: "GIAY_MOI",
    description: "Mẫu chuẩn ban hành giấy mời họp giao ban, họp chuyên môn hoặc hội nghị của Nhà trường.",
    content: `<div style="font-family: 'Times New Roman', Times, serif; font-size: 14pt; line-height: 1.5; padding: 20px;">
<table style="width: 100%; border: none;">
  <tr>
    <td style="width: 45%; text-align: center; vertical-align: top;">
      UBND THÀNH PHỐ HỒ CHÍ MINH<br/>
      <strong>TRƯỜNG CĐ BÁCH KHOA NAM SÀI GÒN</strong><br/>
      Số: ....../GM-CĐBNSG
    </td>
    <td style="width: 55%; text-align: center; vertical-align: top;">
      <strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong><br/>
      <strong>Độc lập - Tự do - Hạnh phúc</strong><br/>
      <em>Thành phố Hồ Chí Minh, {{NGAY_HIEN_TAI}}</em>
    </td>
  </tr>
</table>

<div style="text-align: center; margin: 30px 0 20px 0;">
  <h2 style="font-size: 16pt; font-weight: bold; margin-bottom: 5px;">GIẤY MỜI</h2>
  <em>V/v: Tham dự phiên họp chuyên môn</em>
</div>

<p style="text-indent: 1.27cm; text-align: justify;">
Trường Cao đẳng Bách khoa Nam Sài Gòn trân trọng kính mời:
</p>

<p style="text-indent: 1.27cm; margin: 10px 0;">
<strong>Kính gửi:</strong> ............................................................................................
</p>

<p style="text-indent: 1.27cm; text-align: justify;">
<strong>Đến tham dự phiên họp với nội dung:</strong> ........................................................................
</p>
<p style="text-indent: 1.27cm; text-align: justify;">
<strong>Thời gian:</strong> Vào lúc ...... giờ ...... ngày ...... tháng ...... năm 2026.
</p>
<p style="text-indent: 1.27cm; text-align: justify;">
<strong>Địa điểm:</strong> Phòng họp số 1 - Nhà A, Trường Cao đẳng Bách khoa Nam Sài Gòn.
</p>
<p style="text-indent: 1.27cm; text-align: justify;">
<strong>Chủ trì phiên họp:</strong> Ban Giám hiệu Nhà trường.
</p>

<p style="text-indent: 1.27cm; text-align: justify;">
Đề nghị quý Thầy/Cô sắp xếp công việc tham dự đầy đủ và đúng giờ để phiên họp đạt kết quả tốt nhất./.
</p>

<table style="width: 100%; border: none; margin-top: 30px;">
  <tr>
    <td style="width: 50%; vertical-align: top; font-size: 11pt;">
      <em><strong>Nơi nhận:</strong></em><br/>
      - Như trên;<br/>
      - Lưu: VT.
    </td>
    <td style="width: 50%; text-align: center; vertical-align: top;">
      <strong>HIỆU TRƯỞNG</strong><br/>
      <em>(Ký, đóng dấu)</em><br/><br/><br/><br/>
    </td>
  </tr>
</table>
</div>`,
  },
  {
    title: "Mẫu Báo cáo kết quả thực hiện nhiệm vụ",
    code: "BM-BC-03",
    category: "HANH_CHINH",
    docType: "BAO_CAO",
    description: "Mẫu báo cáo định kỳ tháng, quý hoặc báo cáo đột xuất gửi cấp trên và Ban Giám hiệu.",
    content: `<div style="font-family: 'Times New Roman', Times, serif; font-size: 14pt; line-height: 1.5; padding: 20px;">
<table style="width: 100%; border: none;">
  <tr>
    <td style="width: 45%; text-align: center; vertical-align: top;">
      UBND THÀNH PHỐ HỒ CHÍ MINH<br/>
      <strong>TRƯỜNG CĐ BÁCH KHOA NAM SÀI GÒN</strong><br/>
      Đơn vị: <strong>{{DON_VI}}</strong><br/>
      Số: ....../BC-{{MA_DON_VI}}
    </td>
    <td style="width: 55%; text-align: center; vertical-align: top;">
      <strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong><br/>
      <strong>Độc lập - Tự do - Hạnh phúc</strong><br/>
      <em>Thành phố Hồ Chí Minh, {{NGAY_HIEN_TAI}}</em>
    </td>
  </tr>
</table>

<div style="text-align: center; margin: 30px 0 20px 0;">
  <h2 style="font-size: 15pt; font-weight: bold; margin-bottom: 5px;">BÁO CÁO</h2>
  <em>V/v: Kết quả thực hiện nhiệm vụ công tác tháng/quý</em>
</div>

<div style="text-align: center; margin-bottom: 20px;">
  <strong>Kính gửi:</strong> Ban Giám hiệu Trường Cao đẳng Bách khoa Nam Sài Gòn
</div>

<p style="font-weight: bold; margin-top: 15px;">I. CÔNG TÁC ĐÃ THỰC HIỆN</p>
<p style="text-indent: 1.27cm; text-align: justify;">1. Các nhiệm vụ trọng tâm đã hoàn thành: ................................................</p>
<p style="text-indent: 1.27cm; text-align: justify;">2. Đánh giá chất lượng và tiến độ: Đúng tiến độ theo kế hoạch đề ra.</p>

<p style="font-weight: bold; margin-top: 15px;">II. TỒN TẠI, HẠN CHẾ VÀ NGUYÊN NHÂN</p>
<p style="text-indent: 1.27cm; text-align: justify;">- Tồn tại: ............................................................................................</p>
<p style="text-indent: 1.27cm; text-align: justify;">- Nguyên nhân: .......................................................................................</p>

<p style="font-weight: bold; margin-top: 15px;">III. PHƯƠNG HƯỚNG VÀ KIẾN NGHỊ</p>
<p style="text-indent: 1.27cm; text-align: justify;">1. Kế hoạch nhiệm vụ tiếp theo: .............................................................</p>
<p style="text-indent: 1.27cm; text-align: justify;">2. Kiến nghị, đề xuất: ........................................................................</p>

<table style="width: 100%; border: none; margin-top: 30px;">
  <tr>
    <td style="width: 50%; vertical-align: top; font-size: 11pt;">
      <em><strong>Nơi nhận:</strong></em><br/>
      - BGH (để b/c);<br/>
      - Lưu: VT, {{MA_DON_VI}}.
    </td>
    <td style="width: 50%; text-align: center; vertical-align: top;">
      <strong>TRƯỞNG ĐƠN VỊ</strong><br/>
      <em>(Ký, ghi rõ họ tên)</em><br/><br/><br/><br/>
      <strong>{{TEN_CAN_BO}}</strong>
    </td>
  </tr>
</table>
</div>`,
  },
  {
    title: "Mẫu Giấy đi đường / Công tác",
    code: "BM-GDD-04",
    category: "TAI_CHINH",
    docType: "GIAY_DI_DUONG",
    description: "Mẫu giấy đi đường phục vụ công tác thanh quyết toán chế độ công tác phí cho viên chức, người lao động.",
    content: `<div style="font-family: 'Times New Roman', Times, serif; font-size: 14pt; line-height: 1.5; padding: 20px;">
<table style="width: 100%; border: none;">
  <tr>
    <td style="width: 45%; text-align: center; vertical-align: top;">
      UBND THÀNH PHỐ HỒ CHÍ MINH<br/>
      <strong>TRƯỜNG CĐ BÁCH KHOA NAM SÀI GÒN</strong><br/>
      Đơn vị: <strong>{{DON_VI}}</strong>
    </td>
    <td style="width: 55%; text-align: center; vertical-align: top;">
      <strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong><br/>
      <strong>Độc lập - Tự do - Hạnh phúc</strong><br/>
      <em>Thành phố Hồ Chí Minh, {{NGAY_HIEN_TAI}}</em>
    </td>
  </tr>
</table>

<div style="text-align: center; margin: 25px 0 15px 0;">
  <h2 style="font-size: 16pt; font-weight: bold; margin-bottom: 5px;">GIẤY ĐI ĐƯỜNG</h2>
  <em>(Căn cứ Quyết định cử đi công tác số: ....../QĐ-CĐBNSG)</em>
</div>

<p style="text-indent: 1.27cm;">Cấp cho Ông/Bà: <strong>{{TEN_CAN_BO}}</strong></p>
<p style="text-indent: 1.27cm;">Chức vụ/Đơn vị: <strong>{{CHUC_VU}} - {{DON_VI}}</strong></p>
<p style="text-indent: 1.27cm;">Được cử đi công tác tại: ............................................................................</p>
<p style="text-indent: 1.27cm;">Thời gian công tác: Từ ngày ....../....../2026 đến ngày ....../....../2026</p>
<p style="text-indent: 1.27cm;">Phương tiện đi lại: ................................................................................</p>

<table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12pt;" border="1">
  <tr style="text-align: center; font-weight: bold; background-color: #f2f2f2;">
    <td style="padding: 8px;">Nơi đi và nơi đến</td>
    <td style="padding: 8px;">Ngày đi / đến</td>
    <td style="padding: 8px;">Chứng nhận của cơ quan nơi đến</td>
    <td style="padding: 8px;">Ký nhận của người phụ trách</td>
  </tr>
  <tr style="height: 60px;">
    <td style="padding: 8px;">Từ TP.HCM đến ............</td>
    <td></td>
    <td></td>
    <td></td>
  </tr>
  <tr style="height: 60px;">
    <td style="padding: 8px;">Từ ............ về TP.HCM</td>
    <td></td>
    <td></td>
    <td></td>
  </tr>
</table>

<table style="width: 100%; border: none; margin-top: 30px;">
  <tr>
    <td style="width: 50%; text-align: center; vertical-align: top;">
      <strong>TRƯỞNG ĐƠN VỊ</strong><br/>
      <em>(Ký, ghi rõ họ tên)</em>
    </td>
    <td style="width: 50%; text-align: center; vertical-align: top;">
      <strong>HIỆU TRƯỞNG</strong><br/>
      <em>(Ký, đóng dấu duyệt)</em>
    </td>
  </tr>
</table>
</div>`,
  }
];

// Lấy danh sách mẫu văn bản (có bộ lọc category, docType, search)
exports.getTemplates = async (req, res) => {
  try {
    const { category, docType, search } = req.query;

    // Tự động kiểm tra nếu chưa có dữ liệu mẫu thì nạp ban đầu
    const count = await DocumentTemplate.countDocuments();
    if (count === 0) {
      await DocumentTemplate.insertMany(SEED_TEMPLATES);
    }

    const query = { isActive: true };
    if (category && category !== "ALL") query.category = category;
    if (docType && docType !== "ALL") query.docType = docType;
    if (search) {
      query.$or = [
        { title: { $regex: search.trim(), $options: "i" } },
        { code: { $regex: search.trim(), $options: "i" } },
        { description: { $regex: search.trim(), $options: "i" } },
      ];
    }

    const templates = await DocumentTemplate.find(query)
      .populate("department", "departmentName departmentCode")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: templates,
      total: templates.length,
    });
  } catch (error) {
    console.error("Lỗi getTemplates:", error);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ khi lấy danh sách biểu mẫu" });
  }
};

// Lấy chi tiết mẫu và thay thế biến động (Personalization Tag Replacement)
exports.getTemplateById = async (req, res) => {
  try {
    const { id } = req.params;
    const template = await DocumentTemplate.findById(id)
      .populate("department", "departmentName departmentCode")
      .populate("createdBy", "name email");

    if (!template) {
      return res.status(404).json({ success: false, message: "Không tìm thấy mẫu văn bản" });
    }

    // Tăng lượt tải/sử dụng
    template.downloadCount += 1;
    await template.save();

    // Điền sẵn thông tin người dùng nếu có token
    let personalizedContent = template.content || "";
    if (req.user) {
      const User = require("../models/user.model");
      const currentUser = await User.findById(req.user.userId || req.user.id)
        .populate("department", "departmentName departmentCode")
        .populate("position", "positionName");

      if (currentUser) {
        const userName = currentUser.name || "";
        const deptName = currentUser.department?.departmentName || "Trường CĐ Bách khoa Nam Sài Gòn";
        const deptCode = currentUser.department?.departmentCode || "NSG";
        const posName = currentUser.position?.positionName || "Viên chức";
        const now = new Date();
        const dateStr = `ngày ${String(now.getDate()).padStart(2, "0")} tháng ${String(now.getMonth() + 1).padStart(2, "0")} năm ${now.getFullYear()}`;

        personalizedContent = personalizedContent
          .replace(/{{TEN_CAN_BO}}/g, userName)
          .replace(/{{DON_VI}}/g, deptName)
          .replace(/{{MA_DON_VI}}/g, deptCode)
          .replace(/{{CHUC_VU}}/g, posName)
          .replace(/{{NGAY_HIEN_TAI}}/g, dateStr);
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        ...template.toObject(),
        personalizedContent,
      },
    });
  } catch (error) {
    console.error("Lỗi getTemplateById:", error);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ khi lấy chi tiết biểu mẫu" });
  }
};

// Tạo mới mẫu biểu (Dành cho Quản trị viên/Văn thư)
exports.createTemplate = async (req, res) => {
  try {
    const { title, code, category, docType, description, content, file, department } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, message: "Vui lòng nhập tên biểu mẫu!" });
    }

    const templateCode = code || `BM-${Date.now().toString().slice(-6)}`;
    const newTemplate = new DocumentTemplate({
      title,
      code: templateCode,
      category: category || "HANH_CHINH",
      docType: docType || "TO_TRINH",
      description: description || "",
      content: content || "",
      file: file || {},
      department: department || null,
      createdBy: req.user?.userId || req.user?.id,
    });

    await newTemplate.save();
    return res.status(201).json({
      success: true,
      message: "Tạo biểu mẫu thành công!",
      data: newTemplate,
    });
  } catch (error) {
    console.error("Lỗi createTemplate:", error);
    return res.status(500).json({ success: false, message: error.message || "Lỗi máy chủ khi tạo biểu mẫu" });
  }
};

// Cập nhật mẫu biểu
exports.updateTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await DocumentTemplate.findByIdAndUpdate(id, req.body, { new: true });
    if (!updated) {
      return res.status(404).json({ success: false, message: "Không tìm thấy mẫu biểu cần cập nhật" });
    }
    return res.status(200).json({ success: true, message: "Cập nhật biểu mẫu thành công!", data: updated });
  } catch (error) {
    console.error("Lỗi updateTemplate:", error);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ khi cập nhật biểu mẫu" });
  }
};

// Xóa mẫu biểu (Soft delete hoặc hard delete)
exports.deleteTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    await DocumentTemplate.findByIdAndDelete(id);
    return res.status(200).json({ success: true, message: "Đã xóa biểu mẫu thành công!" });
  } catch (error) {
    console.error("Lỗi deleteTemplate:", error);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ khi xóa biểu mẫu" });
  }
};
