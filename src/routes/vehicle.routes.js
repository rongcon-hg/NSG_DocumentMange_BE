const express = require("express");
const router = express.Router();
const vehicleController = require("../controller/vehicle.controller");
const middlewareController = require("../middleware/authMiddleware");

// Tất cả các route đều yêu cầu đăng nhập
router.use(middlewareController.verifyToken);

// ==========================================
// 1. Quản lý Phương tiện (Vehicles)
// ==========================================
router.get("/vehicles", vehicleController.getAllVehicles);
router.post("/vehicles", vehicleController.createVehicle);
router.put("/vehicles/:id", vehicleController.updateVehicle);
router.delete("/vehicles/:id", vehicleController.deleteVehicle);

// ==========================================
// 2. Quản lý Tài xế (Drivers)
// ==========================================
router.get("/drivers", vehicleController.getAllDrivers);
router.post("/drivers", vehicleController.createDriver);
router.put("/drivers/:id", vehicleController.updateDriver);
router.delete("/drivers/:id", vehicleController.deleteDriver);

// ==========================================
// 3. Quy trình Đăng ký & Điều xe công tác
// ==========================================
router.post("/bookings", vehicleController.createBooking);
router.get("/bookings", vehicleController.getBookings);
router.get("/bookings/:id", vehicleController.getBookingById);
router.put("/bookings/:id/review", vehicleController.reviewBookingByBGH); // BGH duyệt/từ chối
router.put("/bookings/:id/dispatch", vehicleController.dispatchVehicleAndDriver); // Phân bổ xe/tài xế
router.put("/bookings/:id/trip-status", vehicleController.updateTripStatus); // Đang đi, hoàn thành
router.put("/bookings/:id/cancel", vehicleController.cancelBooking); // Hủy đơn
router.delete("/bookings/:id", vehicleController.deleteBooking); // Xóa đơn (Admin)

module.exports = router;
