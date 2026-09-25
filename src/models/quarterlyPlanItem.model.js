const mongoose = require("mongoose");

const quarterlyPlanItemSchema = new mongoose.Schema(
  {
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "QuarterlyPlan",
      required: true,
      index: true,
    },
    // Nhóm nhiệm vụ (Ví dụ: "I. CÔNG TÁC ĐÀO TẠO", "II. CÔNG TÁC TUYỂN SINH", "III. CÔNG TÁC QUẢN LÝ HỌC SINH SINH VIÊN"...)
    groupName: {
      type: String,
      required: true,
      trim: true,
    },
    // Số thứ tự hiển thị
    order: {
      type: Number,
      default: 0,
    },
    // Nội dung công việc / nhiệm vụ trọng tâm
    taskContent: {
      type: String,
      required: true,
      trim: true,
    },
    // Sản phẩm dự kiến / Kết quả đầu ra
    expectedOutcome: {
      type: String,
      default: "",
      trim: true,
    },
    // Đơn vị thực hiện (Phòng, Khoa, Trung tâm)
    assignedDepartments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Department",
      },
    ],
    // Đơn vị phối hợp
    coordinatingDepartments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Department",
      },
    ],
    // Ban Giám hiệu phụ trách chỉ đạo (Lấy từ User có chức danh Hiệu trưởng / P.Hiệu trưởng)
    bghInCharge: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    // Mốc thời gian bắt đầu
    startDate: {
      type: Date,
    },
    // Thời gian dự kiến hoàn thành
    expectedDeadline: {
      type: Date,
      required: true,
    },
    // Thời gian thực tế hoàn thành
    actualCompletedDate: {
      type: Date,
      default: null,
    },
    // % Tiến độ (0 - 100)
    progressPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    // Trạng thái công việc
    status: {
      type: String,
      enum: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "OVERDUE", "PAUSED"],
      default: "NOT_STARTED",
    },
    // Đánh giá/Nhận xét tự động (tính toán dựa trên ngày dự kiến vs thực tế)
    autoRemark: {
      type: String,
      default: "",
    },
    // Phân loại màu nhận xét: "ON_TIME" (xanh lá), "EARLY" (xanh lục), "IN_PROGRESS" (xanh lam/vàng), "LATE" (cam), "OVERDUE" (đỏ)
    autoRemarkStatus: {
      type: String,
      enum: ["ON_TIME", "EARLY", "IN_PROGRESS", "LATE", "OVERDUE", "NOT_STARTED"],
      default: "NOT_STARTED",
    },
    // Lý do tạm dừng (khi status === 'PAUSED')
    pauseReason: {
      type: String,
      default: "",
      trim: true,
    },
    // Ghi chú / Nhận xét thêm của Manager hoặc Ban Giám hiệu
    manualRemark: {
      type: String,
      default: "",
    },
    // Lịch sử thay đổi nội dung và trạng thái nhiệm vụ
    history: [
      {
        action: { type: String, default: "UPDATE" }, // "CREATE", "UPDATE", "STATUS_CHANGE", "PROGRESS_UPDATE"
        actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        actorName: { type: String },
        details: { type: String },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    // Danh sách tệp đính kèm / minh chứng kết quả
    files: [
      {
        fileId: { type: String },
        fileName: { type: String },
        fileMimeType: { type: String },
        fileSize: { type: Number },
        webViewLink: { type: String },
      },
    ],
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Hàm helper tự động tính toán autoRemark và autoRemarkStatus
quarterlyPlanItemSchema.methods.calculateAutoRemark = function () {
  // Lấy định dạng YYYY-MM-DD theo giờ địa phương / ISO date part để so sánh chuẩn xác theo ngày
  const toDateOnlyStr = (d) => {
    if (!d) return null;
    const dateObj = new Date(d);
    if (isNaN(dateObj.getTime())) return null;
    // Sử dụng múi giờ Việt Nam (UTC+7) hoặc local
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(dateObj); // Kết quả dạng "YYYY-MM-DD"
  };

  const deadlineStr = toDateOnlyStr(this.expectedDeadline);
  const completedStr = toDateOnlyStr(this.actualCompletedDate);
  const todayStr = toDateOnlyStr(new Date());

  if (!deadlineStr) {
    this.autoRemark = "Chưa thiết lập hạn dự kiến";
    this.autoRemarkStatus = "NOT_STARTED";
    return;
  }

  // Trường hợp 0: Tạm dừng thực hiện (PAUSED)
  if (this.status === "PAUSED") {
    this.autoRemark = this.pauseReason ? `Tạm dừng (${this.pauseReason})` : "Tạm dừng thực hiện";
    this.autoRemarkStatus = "NOT_STARTED";
    return;
  }

  // Trường hợp 1: Nếu trạng thái được đặt rõ ràng là CHƯA LÀM (NOT_STARTED) hoặc ĐANG THỰC HIỆN (IN_PROGRESS)
  if (this.status === "NOT_STARTED" || this.status === "IN_PROGRESS") {
    this.actualCompletedDate = null;
    const dDeadline = new Date(deadlineStr).getTime();
    const dToday = new Date(todayStr).getTime();
    const diffDays = Math.round((dToday - dDeadline) / (1000 * 3600 * 24));

    if (diffDays > 0) {
      this.autoRemark = `Quá hạn dự kiến (${diffDays} ngày)`;
      this.autoRemarkStatus = "OVERDUE";
      this.status = "OVERDUE";
    } else if (diffDays === 0) {
      this.autoRemark = "Đến hạn hôm nay";
      this.autoRemarkStatus = "IN_PROGRESS";
      this.status = "IN_PROGRESS";
    } else {
      const daysLeft = Math.abs(diffDays);
      this.autoRemark = this.status === "NOT_STARTED" ? `Chưa làm (còn ${daysLeft} ngày)` : `Đang thực hiện (còn ${daysLeft} ngày)`;
      this.autoRemarkStatus = this.status === "NOT_STARTED" ? "NOT_STARTED" : "IN_PROGRESS";
    }
    return;
  }

  // Trường hợp 2: Đã hoàn thành (COMPLETED hoặc có ngày hoàn thành thực tế)
  if (this.status === "COMPLETED" || completedStr) {
    this.status = "COMPLETED";
    this.progressPercent = 100;
    const effectiveCompletedStr = completedStr || todayStr;
    const dDeadline = new Date(deadlineStr).getTime();
    const dCompleted = new Date(effectiveCompletedStr).getTime();
    const diffDays = Math.round((dCompleted - dDeadline) / (1000 * 3600 * 24));

    if (diffDays < 0) {
      this.autoRemark = `Hoàn thành sớm ${Math.abs(diffDays)} ngày`;
      this.autoRemarkStatus = "EARLY";
    } else if (diffDays === 0) {
      this.autoRemark = "Hoàn thành đúng hạn";
      this.autoRemarkStatus = "ON_TIME";
    } else {
      this.autoRemark = `Hoàn thành trễ hạn (${diffDays} ngày)`;
      this.autoRemarkStatus = "LATE";
    }
    return;
  }

  // Trường hợp 3: Mặc định chưa hoàn thành
  const dDeadline = new Date(deadlineStr).getTime();
  const dToday = new Date(todayStr).getTime();
  const diffDays = Math.round((dToday - dDeadline) / (1000 * 3600 * 24));

  if (diffDays > 0) {
    this.autoRemark = `Quá hạn dự kiến (${diffDays} ngày)`;
    this.autoRemarkStatus = "OVERDUE";
    this.status = "OVERDUE";
  } else if (diffDays === 0) {
    this.autoRemark = "Đến hạn hôm nay";
    this.autoRemarkStatus = "IN_PROGRESS";
    this.status = "IN_PROGRESS";
  } else {
    const daysLeft = Math.abs(diffDays);
    this.autoRemark = `Đang thực hiện (còn ${daysLeft} ngày)`;
    this.autoRemarkStatus = "IN_PROGRESS";
    if (this.status === "NOT_STARTED" && this.progressPercent > 0) {
      this.status = "IN_PROGRESS";
    }
  }
};

// Hook trước khi lưu tự động tính toán nhận xét
quarterlyPlanItemSchema.pre("save", function (next) {
  this.calculateAutoRemark();
  next();
});

module.exports = mongoose.model("QuarterlyPlanItem", quarterlyPlanItemSchema);
