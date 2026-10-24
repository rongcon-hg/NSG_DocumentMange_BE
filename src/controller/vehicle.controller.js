const Vehicle = require("../models/vehicle.model");
const Driver = require("../models/driver.model");
const VehicleBooking = require("../models/vehicleBooking.model");
const User = require("../models/user.model");
const Department = require("../models/department.model");
const emailService = require("../service/NodeMailer.service/email");

// -------------------------------------------------------------
// Helper: Gửi email thông báo đơn đăng ký xe cho BGH
// -------------------------------------------------------------
const sendVehicleBookingRegistrationEmail = async (booking, creatorUser, approverUser) => {
  try {
    if (!approverUser || !approverUser.email) return false;
    const { getTransporterAndSender, formatVietnameseDateTime, applySystemBranding } = emailService;
    // Sử dụng getTransporterAndSender từ email.js nếu có export
    // Hoặc gửi qua service
    if (typeof emailService.sendVehicleBookingNotificationEmail === "function") {
      return await emailService.sendVehicleBookingNotificationEmail(booking, creatorUser, approverUser);
    }
    return true;
  } catch (err) {
    console.error("Lỗi gửi email đăng ký xe:", err);
    return false;
  }
};

// =============================================================
// I. QUẢN LÝ DANH MỤC PHƯƠNG TIỆN (VEHICLE)
// =============================================================

// Lấy danh sách phương tiện
const getAllVehicles = async (req, res) => {
  try {
    const { status, search } = req.query;
    const query = { isActive: true };
    if (status && status !== "ALL") query.status = status;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { licensePlate: { $regex: search, $options: "i" } },
      ];
    }
    const vehicles = await Vehicle.find(query).populate("defaultDriver").sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: vehicles });
  } catch (error) {
    console.error("Lỗi lấy danh sách xe:", error);
    return res.status(500).json({ success: false, message: "Lỗi hệ thống khi tải danh sách xe" });
  }
};

// Tạo phương tiện mới (Admin/Manager/Quản lý xe)
const createVehicle = async (req, res) => {
  try {
    const { name, licensePlate, seats, vehicleType, defaultDriver, notes, currentMileage } = req.body;
    if (!name || !licensePlate || !seats) {
      return res.status(400).json({ success: false, message: "Vui lòng nhập đầy đủ tên xe, biển số và số chỗ" });
    }

    const existing = await Vehicle.findOne({ licensePlate: licensePlate.trim().toUpperCase() });
    if (existing) {
      return res.status(400).json({ success: false, message: "Biển số xe này đã tồn tại trong hệ thống" });
    }

    const newVehicle = new Vehicle({
      name: name.trim(),
      licensePlate: licensePlate.trim().toUpperCase(),
      seats: Number(seats),
      vehicleType: vehicleType || "van",
      defaultDriver: defaultDriver || null,
      notes: notes || "",
      currentMileage: Number(currentMileage) || 0,
    });

    await newVehicle.save();
    return res.status(201).json({ success: true, message: "Thêm phương tiện thành công", data: newVehicle });
  } catch (error) {
    console.error("Lỗi tạo xe:", error);
    return res.status(500).json({ success: false, message: error.message || "Lỗi tạo phương tiện" });
  }
};

// Cập nhật phương tiện
const updateVehicle = async (req, res) => {
  try {
    const { id } = req.params;
    const vehicle = await Vehicle.findById(id);
    if (!vehicle) {
      return res.status(404).json({ success: false, message: "Không tìm thấy phương tiện" });
    }

    const { name, licensePlate, seats, vehicleType, status, defaultDriver, notes, currentMileage } = req.body;

    if (licensePlate && licensePlate.trim().toUpperCase() !== vehicle.licensePlate) {
      const existing = await Vehicle.findOne({ licensePlate: licensePlate.trim().toUpperCase() });
      if (existing) {
        return res.status(400).json({ success: false, message: "Biển số xe đã được sử dụng bởi phương tiện khác" });
      }
      vehicle.licensePlate = licensePlate.trim().toUpperCase();
    }

    if (name) vehicle.name = name.trim();
    if (seats) vehicle.seats = Number(seats);
    if (vehicleType) vehicle.vehicleType = vehicleType;
    if (status) vehicle.status = status;
    if (defaultDriver !== undefined) vehicle.defaultDriver = defaultDriver || null;
    if (notes !== undefined) vehicle.notes = notes;
    if (currentMileage !== undefined) vehicle.currentMileage = Number(currentMileage);

    await vehicle.save();
    return res.status(200).json({ success: true, message: "Cập nhật phương tiện thành công", data: vehicle });
  } catch (error) {
    console.error("Lỗi cập nhật xe:", error);
    return res.status(500).json({ success: false, message: error.message || "Lỗi cập nhật xe" });
  }
};

// Xóa (vô hiệu hóa) phương tiện
const deleteVehicle = async (req, res) => {
  try {
    const { id } = req.params;
    const vehicle = await Vehicle.findById(id);
    if (!vehicle) return res.status(404).json({ success: false, message: "Không tìm thấy xe" });

    vehicle.isActive = false;
    await vehicle.save();
    return res.status(200).json({ success: true, message: "Xóa phương tiện thành công" });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Lỗi xóa xe" });
  }
};

// =============================================================
// II. QUẢN LÝ DANH MỤC TÀI XẾ (DRIVER)
// =============================================================

// Lấy danh sách tài xế
const getAllDrivers = async (req, res) => {
  try {
    const { status, search } = req.query;
    const query = { isActive: true };
    if (status && status !== "ALL") query.status = status;
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }
    const drivers = await Driver.find(query).populate("userAccount", "userName email").sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: drivers });
  } catch (error) {
    console.error("Lỗi lấy danh sách tài xế:", error);
    return res.status(500).json({ success: false, message: "Lỗi hệ thống khi tải danh sách tài xế" });
  }
};

// Thêm tài xế mới
const createDriver = async (req, res) => {
  try {
    const { fullName, phone, licenseClass, licenseNumber, userAccount, notes } = req.body;
    if (!fullName || !phone) {
      return res.status(400).json({ success: false, message: "Vui lòng nhập họ tên và số điện thoại tài xế" });
    }

    const newDriver = new Driver({
      fullName: fullName.trim(),
      phone: phone.trim(),
      licenseClass: licenseClass || "D",
      licenseNumber: licenseNumber || "",
      userAccount: userAccount || null,
      notes: notes || "",
    });

    await newDriver.save();
    return res.status(201).json({ success: true, message: "Thêm tài xế thành công", data: newDriver });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Lỗi tạo tài xế" });
  }
};

// Cập nhật tài xế
const updateDriver = async (req, res) => {
  try {
    const { id } = req.params;
    const driver = await Driver.findById(id);
    if (!driver) return res.status(404).json({ success: false, message: "Không tìm thấy tài xế" });

    const { fullName, phone, licenseClass, licenseNumber, userAccount, status, notes } = req.body;
    if (fullName) driver.fullName = fullName.trim();
    if (phone) driver.phone = phone.trim();
    if (licenseClass) driver.licenseClass = licenseClass;
    if (licenseNumber !== undefined) driver.licenseNumber = licenseNumber;
    if (userAccount !== undefined) driver.userAccount = userAccount || null;
    if (status) driver.status = status;
    if (notes !== undefined) driver.notes = notes;

    await driver.save();
    return res.status(200).json({ success: true, message: "Cập nhật thông tin tài xế thành công", data: driver });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Lỗi cập nhật tài xế" });
  }
};

// Xóa tài xế
const deleteDriver = async (req, res) => {
  try {
    const { id } = req.params;
    const driver = await Driver.findById(id);
    if (!driver) return res.status(404).json({ success: false, message: "Không tìm thấy tài xế" });

    driver.isActive = false;
    await driver.save();
    return res.status(200).json({ success: true, message: "Xóa tài xế thành công" });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Lỗi xóa tài xế" });
  }
};

// =============================================================
// III. ĐĂNG KÝ VÀ QUY TRÌNH ĐIỀU XE (VEHICLE BOOKING)
// =============================================================

// Tạo đơn đăng ký xe
const createBooking = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const user = await User.findById(userId).populate("department");
    if (!user) return res.status(401).json({ success: false, message: "Không tìm thấy thông tin người dùng" });

    const {
      contactPhone,
      passengersCount,
      passengerNames,
      purpose,
      route,
      departureLocation,
      destination,
      departureTime,
      departureHour,
      estimatedReturnTime,
      vehicleType,
      requiredSeats,
      notes,
      targetApprover,
    } = req.body;

    if (!purpose || !route || !departureTime || !estimatedReturnTime || !targetApprover) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng điền đầy đủ các thông tin bắt buộc: Mục đích, Lộ trình, Ngày xuất phát, Ngày về và BGH duyệt",
      });
    }

    const approver = await User.findById(targetApprover);
    if (!approver) {
      return res.status(400).json({ success: false, message: "Người duyệt (BGH) được chọn không tồn tại" });
    }

    const booking = new VehicleBooking({
      requester: userId,
      requesterName: user.name || user.fullName || user.userName || "",
      department: user.department?._id || user.department,
      departmentName: user.department?.departmentName || user.department?.name || "",
      contactPhone: contactPhone || user.mobile || user.phone || "",
      passengersCount: Number(passengersCount) || 1,
      passengerNames: passengerNames || "",
      purpose: purpose.trim(),
      route: route.trim(),
      departureLocation: departureLocation || "Trường CĐ Bách Khoa Nam Sài Gòn",
      destination: destination || "",
      departureTime: new Date(departureTime),
      departureHour: departureHour || "",
      estimatedReturnTime: new Date(estimatedReturnTime),
      vehicleType: vehicleType || "SCHOOL_VEHICLE",
      requiredSeats: Number(requiredSeats) || 7,
      notes: notes || "",
      targetApprover,
      approvalStatus: "PENDING",
      dispatchStatus: "UNASSIGNED",
    });

    await booking.save();

    // Gửi email thông báo cho BGH
    try {
      if (typeof emailService.sendVehicleBookingNotificationEmail === "function") {
        emailService.sendVehicleBookingNotificationEmail(booking, user, approver);
      }
    } catch (e) {
      console.warn("Lỗi gửi mail thông báo xe:", e);
    }

    return res.status(201).json({
      success: true,
      message: "Tạo đơn đăng ký xe thành công! Yêu cầu đã được chuyển tới BGH phê duyệt.",
      data: booking,
    });
  } catch (error) {
    console.error("Lỗi tạo đơn đăng ký xe:", error);
    return res.status(500).json({ success: false, message: error.message || "Lỗi tạo đơn đăng ký xe" });
  }
};

// Lấy danh sách đơn đăng ký xe (phân quyền theo vai trò và bộ lọc tab)
const getBookings = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const userRole = (req.user?.role || "").toUpperCase();
    const { tab, approvalStatus, dispatchStatus, vehicleType, search, startDate, endDate, page = 1, limit = 20 } = req.query;

    const query = {};

    // 1. Phân quyền lọc theo tab:
    // Tab "my": Các đơn do chính user tạo
    if (tab === "my") {
      query.requester = userId;
    }
    // Tab "pending_approval": Dành cho BGH duyệt (Admin/Manager xem được tất cả đơn PENDING, còn BGH xem các đơn gửi đích danh mình hoặc toàn bộ đơn chờ duyệt)
    else if (tab === "pending_approval") {
      const isAdminOrManager = userRole === "ADMIN" || userRole === "MANAGER";
      if (!isAdminOrManager) {
        query.$or = [
          { targetApprover: userId },
          { targetApprover: null },
        ];
      }
      query.approvalStatus = "PENDING";
    }
    // Tab "dispatch": Dành cho người được giao nhiệm vụ phân bổ xe hoặc QTTB/Admin/Manager
    else if (tab === "dispatch") {
      query.approvalStatus = "APPROVED";
      // Đơn xe công nghệ thì không cần phân bổ xe (trừ khi xem ở tab all)
      query.vehicleType = { $ne: "RIDE_HAILING" };
      // Nếu không phải ADMIN hoặc MANAGER, chỉ thấy các đơn được BGH giao cho mình hoặc đơn chưa gán ai
      const isAdminOrManager = userRole === "ADMIN" || userRole === "MANAGER";
      if (!isAdminOrManager) {
        query.$or = [
          { assignedDispatcher: userId },
          { assignedDispatcher: null },
        ];
      }
    }
    // Tab "assigned_driver": Lịch phân công của riêng tài xế
    else if (tab === "assigned_driver") {
      // Tìm driver liên kết với user này
      const driverRecord = await Driver.findOne({ userAccount: userId, isActive: true });
      if (driverRecord) {
        query.assignedDriver = driverRecord._id;
      } else {
        query.requester = userId; // fallback
      }
    }
    // Tab "all": Cho Admin/Manager hoặc xem tổng hợp
    else {
      // Nếu không phải admin/manager và không phải BGH, chỉ xem đơn liên quan đến mình
      const isAdminOrManager = userRole === "ADMIN" || userRole === "MANAGER";
      const isBGH = ["HIỆU TRƯỞNG", "Q.HIỆU TRƯỞNG", "PHÓ HIỆU TRƯỞNG", "BGH"].some((r) =>
        userRole.includes(r.toUpperCase())
      );
      if (!isAdminOrManager && !isBGH) {
        // Kiểm tra xem user có phải tài xế không
        const driverRecord = await Driver.findOne({ userAccount: userId, isActive: true });
        query.$or = [
          { requester: userId },
          { assignedDispatcher: userId },
          ...(driverRecord ? [{ assignedDriver: driverRecord._id }] : []),
        ];
      }
    }

    // 2. Bộ lọc trạng thái
    if (approvalStatus && approvalStatus !== "ALL") {
      query.approvalStatus = approvalStatus;
    }
    if (dispatchStatus && dispatchStatus !== "ALL") {
      query.dispatchStatus = dispatchStatus;
    }
    if (vehicleType && vehicleType !== "ALL") {
      query.vehicleType = vehicleType;
    }

    // 3. Lọc theo khoảng ngày xuất phát
    if (startDate && endDate) {
      query.departureTime = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    // 4. Tìm kiếm từ khóa
    if (search) {
      query.$or = [
        { bookingCode: { $regex: search, $options: "i" } },
        { purpose: { $regex: search, $options: "i" } },
        { route: { $regex: search, $options: "i" } },
        { requesterName: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [bookings, total] = await Promise.all([
      VehicleBooking.find(query)
        .populate({
          path: "requester",
          select: "name fullName userName email mobile phone department position",
          populate: [
            { path: "department", select: "departmentName departmentCode" },
            { path: "position", select: "positionName name abbreviation" },
          ],
        })
        .populate("department", "departmentName departmentCode name")
        .populate({
          path: "targetApprover",
          select: "name fullName userName position department email",
          populate: { path: "position", select: "positionName name abbreviation" },
        })
        .populate({
          path: "approvedBy",
          select: "name fullName userName position department email",
          populate: { path: "position", select: "positionName name abbreviation" },
        })
        .populate({
          path: "assignedDispatcher",
          select: "name fullName userName position department email",
          populate: [
            { path: "position", select: "positionName name abbreviation" },
            { path: "department", select: "departmentName departmentCode" },
          ],
        })
        .populate("assignedVehicle")
        .populate("assignedDriver")
        .populate("departureConfirmedBy", "name fullName userName mobile phone")
        .populate("returnConfirmedBy", "name fullName userName mobile phone")
        .sort({ departureTime: -1 })
        .skip(skip)
        .limit(Number(limit)),
      VehicleBooking.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: bookings,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Lỗi lấy danh sách đơn đăng ký xe:", error);
    return res.status(500).json({ success: false, message: "Lỗi tải danh sách đơn đăng ký xe" });
  }
};

// Chi tiết 1 đơn đăng ký
const getBookingById = async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await VehicleBooking.findById(id)
      .populate({
        path: "requester",
        select: "name fullName userName email mobile phone department position",
        populate: [
          { path: "department", select: "departmentName departmentCode" },
          { path: "position", select: "positionName name abbreviation" },
        ],
      })
      .populate("department", "departmentName departmentCode name")
      .populate({
        path: "targetApprover",
        select: "name fullName userName position department email",
        populate: { path: "position", select: "positionName name abbreviation" },
      })
      .populate({
        path: "approvedBy",
        select: "name fullName userName position department email",
        populate: { path: "position", select: "positionName name abbreviation" },
      })
      .populate({
        path: "assignedDispatcher",
        select: "name fullName userName position department email",
        populate: [
          { path: "position", select: "positionName name abbreviation" },
          { path: "department", select: "departmentName departmentCode" },
        ],
      })
      .populate("assignedVehicle")
      .populate("assignedDriver")
      .populate("departureConfirmedBy", "name fullName userName mobile phone")
      .populate("returnConfirmedBy", "name fullName userName mobile phone");

    if (!booking) {
      return res.status(404).json({ success: false, message: "Không tìm thấy đơn đăng ký xe" });
    }
    return res.status(200).json({ success: true, data: booking });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Lỗi lấy chi tiết đơn đăng ký" });
  }
};

// Phê duyệt / Từ chối đơn đăng ký (Dành cho Ban Giám Hiệu)
const reviewBookingByBGH = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.user?._id;
    const { action, rejectionReason, approvalNotes, assignedDispatcher } = req.body; // action: "APPROVE" hoặc "REJECT"

    const booking = await VehicleBooking.findById(id)
      .populate("requester", "userName fullName email phone")
      .populate("targetApprover", "userName fullName");

    if (!booking) {
      return res.status(404).json({ success: false, message: "Không tìm thấy đơn đăng ký xe" });
    }

    if (booking.approvalStatus !== "PENDING") {
      return res.status(400).json({ success: false, message: "Đơn đăng ký này đã được xử lý trước đó" });
    }

    const approver = await User.findById(userId);

    if (action === "APPROVE") {
      booking.approvalStatus = "APPROVED";
      booking.approvalDate = new Date();
      booking.approvedBy = userId;
      booking.approvalNotes = approvalNotes || "";
      booking.rejectionReason = "";

      // Nếu là Xe công nghệ: BGH duyệt là xong, hoàn tất luôn quy trình phân bổ
      if (booking.vehicleType === "RIDE_HAILING") {
        booking.assignedDispatcher = null;
        booking.dispatchStatus = "ASSIGNED"; // Đã được duyệt đi xe công nghệ, không cần bước phân bổ xe & tài xế
      } else {
        booking.assignedDispatcher = assignedDispatcher || null; // Lãnh đạo được BGH giao nhiệm vụ phân bổ xe trường
        booking.dispatchStatus = "UNASSIGNED"; // Đưa vào hàng đợi phân bổ xe
      }
    } else if (action === "REJECT") {
      booking.approvalStatus = "REJECTED";
      booking.approvalDate = new Date();
      booking.approvedBy = userId;
      booking.rejectionReason = rejectionReason || "BGH không phê duyệt đơn này.";
      booking.dispatchStatus = "CANCELLED";
    } else {
      return res.status(400).json({ success: false, message: "Hành động phê duyệt không hợp lệ" });
    }

    await booking.save();

    // Lấy thông tin đầy đủ gồm người đăng ký, BGH và lãnh đạo phân bổ để gửi email
    const populatedForEmail = await VehicleBooking.findById(booking._id)
      .populate("requester", "name fullName userName email phone")
      .populate("assignedDispatcher", "name fullName userName email phone position");

    // Gửi email kết quả phê duyệt cho người đăng ký và lãnh đạo được giao xếp xe
    try {
      if (typeof emailService.sendVehicleBookingStatusEmail === "function") {
        emailService.sendVehicleBookingStatusEmail(
          populatedForEmail,
          populatedForEmail.requester,
          approver,
          booking.approvalStatus,
          booking.rejectionReason,
          populatedForEmail.assignedDispatcher
        );
      }
    } catch (e) {
      console.warn("Lỗi gửi mail thông báo kết quả phê duyệt:", e);
    }

    return res.status(200).json({
      success: true,
      message: action === "APPROVE" ? "Đã phê duyệt đơn đăng ký xe thành công!" : "Đã từ chối đơn đăng ký xe.",
      data: booking,
    });
  } catch (error) {
    console.error("Lỗi duyệt đơn xe:", error);
    return res.status(500).json({ success: false, message: error.message || "Lỗi xử lý duyệt đơn xe" });
  }
};

// Điều phối xe & phân bổ tài xế (Dành cho Đơn vị Quản lý xe / Admin)
const dispatchVehicleAndDriver = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.user?._id;
    const { assignedVehicle, assignedDriver, dispatchNotes, rideHailingDetails } = req.body;

    const booking = await VehicleBooking.findById(id).populate("requester", "userName fullName email phone");
    if (!booking) {
      return res.status(404).json({ success: false, message: "Không tìm thấy đơn đăng ký xe" });
    }

    if (booking.approvalStatus !== "APPROVED") {
      return res.status(400).json({ success: false, message: "Chỉ có thể điều phối những đơn đã được BGH phê duyệt" });
    }

    // Nếu chọn xe trường: Cần có phương tiện và tài xế
    if (booking.vehicleType === "SCHOOL_VEHICLE") {
      if (!assignedVehicle || !assignedDriver) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng chọn cả Phương tiện của trường và Tài xế phân bổ",
        });
      }
      booking.assignedVehicle = assignedVehicle;
      booking.assignedDriver = assignedDriver;
    } else {
      // Xe công nghệ
      if (rideHailingDetails) {
        booking.rideHailingDetails = {
          ...booking.rideHailingDetails,
          ...rideHailingDetails,
        };
      }
    }

    booking.dispatchNotes = dispatchNotes || "";
    booking.dispatchStatus = "ASSIGNED";
    booking.dispatchedBy = userId;
    booking.dispatchedAt = new Date();

    await booking.save();

    const populated = await VehicleBooking.findById(id)
      .populate("assignedVehicle")
      .populate({
        path: "assignedDriver",
        populate: { path: "userAccount", select: "name fullName userName email" },
      })
      .populate("requester", "userName fullName name email phone");

    // Gửi email thông báo điều phối xe thành công cho người đăng ký và tài xế
    try {
      if (typeof emailService.sendVehicleDispatchedEmail === "function") {
        emailService.sendVehicleDispatchedEmail(populated);
      }
    } catch (e) {
      console.warn("Lỗi gửi mail điều xe:", e);
    }

    return res.status(200).json({
      success: true,
      message: "Phân bổ phương tiện và tài xế thành công!",
      data: populated,
    });
  } catch (error) {
    console.error("Lỗi điều phối xe:", error);
    return res.status(500).json({ success: false, message: error.message || "Lỗi điều phối phương tiện" });
  }
};

// Cập nhật trạng thái chuyến đi (IN_PROGRESS, COMPLETED, CANCELLED)
const updateTripStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, actualDepartureTime, actualReturnTime, actualCost } = req.body;
    const currentUserId = req.user?.id || req.user?._id;

    const booking = await VehicleBooking.findById(id);
    if (!booking) return res.status(404).json({ success: false, message: "Không tìm thấy đơn điều xe" });

    if (status) {
      booking.dispatchStatus = status;

      // Tự động ghi nhận thời gian và người xác nhận khi bắt đầu đi
      if (status === "IN_PROGRESS") {
        booking.actualDepartureTime = actualDepartureTime ? new Date(actualDepartureTime) : new Date();
        if (currentUserId) booking.departureConfirmedBy = currentUserId;
      }

      // Tự động ghi nhận thời gian và người xác nhận khi đã về (kết thúc)
      if (status === "COMPLETED") {
        booking.actualReturnTime = actualReturnTime ? new Date(actualReturnTime) : new Date();
        if (currentUserId) booking.returnConfirmedBy = currentUserId;
      }
    } else {
      if (actualDepartureTime) booking.actualDepartureTime = new Date(actualDepartureTime);
      if (actualReturnTime) booking.actualReturnTime = new Date(actualReturnTime);
    }

    if (actualCost !== undefined && booking.rideHailingDetails) {
      booking.rideHailingDetails.actualCost = Number(actualCost);
    }

    await booking.save();

    const populatedBooking = await VehicleBooking.findById(booking._id)
      .populate("assignedVehicle")
      .populate("assignedDriver")
      .populate("departureConfirmedBy", "name fullName userName mobile phone")
      .populate("returnConfirmedBy", "name fullName userName mobile phone");

    return res.status(200).json({
      success: true,
      message: "Cập nhật tiến độ chuyến đi thành công",
      data: populatedBooking,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Lỗi cập nhật tiến độ chuyến đi" });
  }
};

// Hủy đơn đăng ký (Người đăng ký tự hủy khi chưa điều phối xe, hoặc Admin hủy bất kỳ)
const cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.user?._id;
    const userRole = (req.user?.role || "").toUpperCase();
    const isAdmin = userRole === "ADMIN" || userRole === "MANAGER";

    const booking = await VehicleBooking.findById(id);
    if (!booking) return res.status(404).json({ success: false, message: "Không tìm thấy đơn đăng ký" });

    if (!isAdmin && booking.requester.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "Bạn không có quyền hủy đơn đăng ký của người khác" });
    }

    if (!isAdmin && (booking.dispatchStatus === "IN_PROGRESS" || booking.dispatchStatus === "COMPLETED")) {
      return res.status(400).json({ success: false, message: "Chuyến đi đang thực hiện hoặc đã kết thúc, không thể hủy" });
    }

    booking.approvalStatus = "CANCELLED";
    booking.dispatchStatus = "CANCELLED";
    await booking.save();

    return res.status(200).json({ success: true, message: "Đã hủy đơn đăng ký xe thành công" });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Lỗi hủy đơn đăng ký" });
  }
};

// Xóa hoàn toàn đơn đăng ký xe (Dành riêng cho Admin / Manager)
const deleteBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const userRole = (req.user?.role || "").toUpperCase();
    const isAdmin = userRole === "ADMIN" || userRole === "MANAGER";

    if (!isAdmin) {
      return res.status(403).json({ success: false, message: "Chỉ tài khoản Admin hoặc Manager mới có quyền xóa đơn đăng ký xe" });
    }

    const booking = await VehicleBooking.findByIdAndDelete(id);
    if (!booking) {
      return res.status(404).json({ success: false, message: "Không tìm thấy đơn đăng ký để xóa" });
    }

    return res.status(200).json({ success: true, message: "Đã xóa hoàn toàn đơn đăng ký xe thành công" });
  } catch (error) {
    console.error("Lỗi xóa đơn đăng ký xe:", error);
    return res.status(500).json({ success: false, message: "Lỗi xóa đơn đăng ký xe" });
  }
};

// Lấy số lượng thông báo / việc cần xử lý về điều xe theo vai trò người dùng
const getVehiclePendingCounts = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const userRole = (req.user?.role || "").toUpperCase();
    const isAdminOrManager = userRole === "ADMIN" || userRole === "MANAGER";

    // 1. Kiểm tra vai trò BGH
    const user = await User.findById(userId).populate("position").populate("department");
    const posCode = (user?.position?.positionCode || user?.position?.abbreviation || "").toUpperCase();
    const deptCode = (user?.department?.departmentCode || "").toUpperCase();
    const deptName = (user?.department?.departmentName || "").toLowerCase();
    const isBgh =
      isAdminOrManager ||
      deptCode === "BGH" ||
      deptName.includes("giám hiệu") ||
      ["HT", "PHT", "QHT"].includes(posCode) ||
      ["HIỆU TRƯỞNG", "Q.HIỆU TRƯỞNG", "PHÓ HIỆU TRƯỞNG"].some((r) => userRole.includes(r));

    // 2. Số lượng đơn chờ BGH duyệt
    let bghPendingCount = 0;
    if (isBgh) {
      const bghQuery = { approvalStatus: "PENDING" };
      if (!isAdminOrManager) {
        bghQuery.$or = [{ targetApprover: userId }, { targetApprover: null }];
      }
      bghPendingCount = await VehicleBooking.countDocuments(bghQuery);
    }

    // 3. Số lượng đơn chờ Lãnh đạo phân bổ xe (Đơn đã duyệt, là xe trường, chưa xếp xe)
    let dispatchPendingCount = 0;
    const dispatchQuery = {
      approvalStatus: "APPROVED",
      dispatchStatus: "UNASSIGNED",
      vehicleType: { $ne: "RIDE_HAILING" },
    };
    if (!isAdminOrManager) {
      dispatchQuery.$or = [{ assignedDispatcher: userId }, { assignedDispatcher: null }];
    }
    dispatchPendingCount = await VehicleBooking.countDocuments(dispatchQuery);

    // 4. Số lượng chuyến xe của Tài xế (Được gán xe mà chưa chạy hoặc đang đi)
    let driverTripCount = 0;
    const driverRecord = await Driver.findOne({
      $or: [
        { userAccount: userId },
        ...(user?.mobile ? [{ phone: user.mobile }] : []),
        ...(user?.phone ? [{ phone: user.phone }] : []),
      ],
      isActive: true,
    });

    if (driverRecord) {
      driverTripCount = await VehicleBooking.countDocuments({
        assignedDriver: driverRecord._id,
        dispatchStatus: { $in: ["ASSIGNED", "IN_PROGRESS"] },
      });
    }

    // 5. Tổng số sự kiện cần xử lý cho người dùng này:
    let totalPending = 0;
    if (isBgh) totalPending += bghPendingCount;
    // Nếu là người được giao phân bổ hoặc admin/manager
    if (isAdminOrManager || dispatchPendingCount > 0) {
      // Nếu user có nhiệm vụ phân bổ cụ thể
      const myDispatchCount = await VehicleBooking.countDocuments({
        approvalStatus: "APPROVED",
        dispatchStatus: "UNASSIGNED",
        assignedDispatcher: userId,
        vehicleType: { $ne: "RIDE_HAILING" },
      });
      totalPending += isAdminOrManager ? dispatchPendingCount : myDispatchCount;
    }
    if (driverRecord) totalPending += driverTripCount;

    return res.status(200).json({
      success: true,
      data: {
        total: totalPending,
        bghPendingCount,
        dispatchPendingCount,
        driverTripCount,
        isBgh,
        isDriver: !!driverRecord,
      },
    });
  } catch (error) {
    console.error("Lỗi lấy vehicle pending counts:", error);
    return res.status(500).json({ success: false, message: "Lỗi tải số thông báo điều xe" });
  }
};

module.exports = {
  // Vehicle CRUD
  getAllVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,

  // Driver CRUD
  getAllDrivers,
  createDriver,
  updateDriver,
  deleteDriver,

  // Booking & Dispatch
  createBooking,
  getBookings,
  getBookingById,
  reviewBookingByBGH,
  dispatchVehicleAndDriver,
  updateTripStatus,
  cancelBooking,
  deleteBooking,
  getVehiclePendingCounts,
};
