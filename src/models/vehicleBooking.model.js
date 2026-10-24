const mongoose = require("mongoose");

const vehicleBookingSchema = new mongoose.Schema(
  {
    bookingCode: {
      type: String, // Mã phiếu tự sinh DX-20261024-001
      unique: true,
      index: true,
    },
    // Người đăng ký
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    requesterName: {
      type: String,
      default: "",
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
    },
    departmentName: {
      type: String,
      default: "",
    },
    contactPhone: {
      type: String,
      required: [true, "Số điện thoại liên hệ là bắt buộc"],
      trim: true,
    },
    passengersCount: {
      type: Number,
      default: 1,
      min: 1,
    },
    passengerNames: {
      type: String, // Danh sách người đi cùng
      default: "",
      trim: true,
    },

    // Thông tin công tác
    purpose: {
      type: String, // Nội dung đi công tác
      required: [true, "Nội dung đi công tác là bắt buộc"],
      trim: true,
    },
    route: {
      type: String, // Lộ trình đi
      required: [true, "Lộ trình đi là bắt buộc"],
      trim: true,
    },
    departureLocation: {
      type: String,
      default: "Trường CĐ Bách Khoa Nam Sài Gòn",
      trim: true,
    },
    destination: {
      type: String,
      default: "",
      trim: true,
    },
    departureTime: {
      type: Date, // Thời gian xuất phát
      required: [true, "Thời gian xuất phát là bắt buộc"],
      index: true,
    },
    departureHour: {
      type: String, // Giờ xuất phát (ví dụ: "07:30", "14:00")
      default: "",
      trim: true,
    },
    estimatedReturnTime: {
      type: Date, // Thời gian kết thúc dự kiến
      required: [true, "Thời gian kết thúc là bắt buộc"],
      index: true,
    },
    actualReturnTime: {
      type: Date,
      default: null,
    },

    // Loại phương tiện yêu cầu
    vehicleType: {
      type: String, // SCHOOL_VEHICLE (Xe trường) hoặc RIDE_HAILING (Xe công nghệ)
      enum: ["SCHOOL_VEHICLE", "RIDE_HAILING"],
      default: "SCHOOL_VEHICLE",
      index: true,
    },
    requiredSeats: {
      type: Number,
      default: 7,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },

    // Phê duyệt của Ban Giám Hiệu
    targetApprover: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // BGH được chọn phê duyệt
      required: true,
      index: true,
    },
    approvalStatus: {
      type: String, // PENDING, APPROVED, REJECTED, CANCELLED
      enum: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"],
      default: "PENDING",
      index: true,
    },
    approvalDate: {
      type: Date,
      default: null,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    approvalNotes: {
      type: String, // Ý kiến chỉ đạo của BGH khi duyệt
      default: "",
      trim: true,
    },
    assignedDispatcher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Lãnh đạo/nhân sự được BGH giao nhiệm vụ phân bổ xe (thường thuộc P.QTTB-CSVC)
      default: null,
      index: true,
    },
    rejectionReason: {
      type: String,
      default: "",
      trim: true,
    },

    // Điều phối xe & phân bổ tài xế (Đơn vị quản lý xe thực hiện sau khi BGH duyệt)
    dispatchStatus: {
      type: String, // UNASSIGNED (chưa xếp xe), ASSIGNED (đã xếp xe), IN_PROGRESS (đang đi), COMPLETED (hoàn thành), CANCELLED
      enum: ["UNASSIGNED", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
      default: "UNASSIGNED",
      index: true,
    },
    assignedVehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
      default: null,
    },
    assignedDriver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
      default: null,
    },
    dispatchNotes: {
      type: String, // Ghi chú của bộ phận điều xe
      default: "",
      trim: true,
    },
    dispatchedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    dispatchedAt: {
      type: Date,
      default: null,
    },

    // Dành cho trường hợp Xe công nghệ (Grab, Be, Taxi...)
    rideHailingDetails: {
      bookingCode: { type: String, default: "" }, // Mã đặt xe
      serviceProvider: { type: String, default: "" }, // Grab, Be, Taxi Mai Linh, Vinasun...
      estimatedCost: { type: Number, default: 0 },
      actualCost: { type: Number, default: 0 },
      receiptImage: { type: String, default: "" }, // Hóa đơn/biên lai
    },
  },
  {
    timestamps: true,
  }
);

// Tự động tạo mã bookingCode trước khi lưu nếu chưa có
vehicleBookingSchema.pre("save", async function (next) {
  if (!this.bookingCode) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const datePrefix = `DX-${yyyy}${mm}${dd}`;

    const count = await this.constructor.countDocuments({
      createdAt: {
        $gte: new Date(yyyy, today.getMonth(), today.getDate()),
        $lt: new Date(yyyy, today.getMonth(), today.getDate() + 1),
      },
    });

    const sequence = String(count + 1).padStart(3, "0");
    this.bookingCode = `${datePrefix}-${sequence}`;
  }
  next();
});

module.exports = mongoose.model("VehicleBooking", vehicleBookingSchema);
