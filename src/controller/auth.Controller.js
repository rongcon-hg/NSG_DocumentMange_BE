const User = require("../models/user.model");
const Position = require("../models/position.model");
const Department = require("../models/department.model");
const jwt = require("jsonwebtoken");
const { generateToken } = require("../service/Token.service/Token");
const crypto = require("crypto");
const { sentTempPassword } = require("../service/NodeMailer.service/email");
const dotenv = require("dotenv");
const { read } = require("fs");
const { google } = require("googleapis");
const { Readable } = require("stream");
const { authorize, getOrCreateMonthFolder, sanitizeFileName } = require("./uploadfile.Controller");
dotenv.config();
const characters = process.env.CHARACTERS;
const VALID_ROLES = ["staff", "manager", "cappho", "chuyenvien"];

/**
 * Tự động xác định vai trò (role) chính xác dựa trên Chức vụ (Position)
 * - Admin giữ nguyên vai trò admin
 * - Cấp phó (PTK, PTP, PBT, PGĐ, các chức vụ có chữ 'phó'): luôn có vai trò 'cappho'
 * - Cấp trưởng (TP, TK, GD, BT, các chức vụ có chữ 'trưởng', 'giám đốc', 'bí thư đoàn'): vai trò 'staff' (hoặc 'manager' nếu là quản lý)
 * - Ban Giám hiệu (HT, PHT, QHT, hiệu trưởng): giữ 'manager' hoặc 'staff'
 * - Giảng viên, Chuyên viên, Nhân viên (GV, CV, NV,...): vai trò 'chuyenvien'
 */
const determineRoleByPosition = (posDoc, currentRole = "staff") => {
  if (currentRole === "admin") return "admin";
  if (!posDoc) return currentRole || "staff";

  const posCode = (posDoc.positionCode || "").toUpperCase();
  const posName = (posDoc.positionName || "").toLowerCase();

  // 1. Kiểm tra Cấp phó trước (ưu tiên cao nhất để không bị nhầm bởi chữ 'trưởng' trong 'phó trưởng phòng/khoa')
  const isPho =
    ["PTK", "PTP", "PBT", "PGD"].includes(posCode) ||
    posName.includes("phó") ||
    /phó\s+(trưởng|giám đốc|bí thư|khoa|phòng)/i.test(posName);

  if (isPho) {
    return "cappho";
  }

  // 2. Ban Giám hiệu: nếu đang là manager thì giữ manager, còn lại staff
  const isBgh = ["HT", "PHT", "QHT"].includes(posCode) || posName.includes("hiệu trưởng");
  if (isBgh) {
    return currentRole === "manager" ? "manager" : "staff";
  }

  // 3. Cấp trưởng đơn vị (Trưởng phòng, Trưởng khoa, Giám đốc, Bí thư Đoàn)
  const isTruong =
    ["TP", "TK", "GD", "BT"].includes(posCode) ||
    /^(trưởng\s+(phòng|khoa|ban|trung tâm)|giám đốc|bí thư\s+đoàn)/i.test(posName);

  if (isTruong) {
    return currentRole === "manager" ? "manager" : "staff";
  }

  // 4. Các vị trí chuyên môn / nhân viên / giảng viên
  const isChuyenVienOrGiangVien =
    ["GV", "CV", "NV"].includes(posCode) ||
    /^(giảng viên|chuyên viên|nhân viên|viên chức)/i.test(posName);

  if (isChuyenVienOrGiangVien) {
    return "chuyenvien";
  }

  // Nếu người dùng đang là manager thì giữ manager, ngược lại giữ nguyên hoặc staff
  if (currentRole === "manager") return "manager";
  return currentRole || "staff";
};

const createUser = async (req,res)=>{
    const {email,password,name,mobile,position,department,description,role} = req.body;

    try {
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: "User already exists" });
        }
        else if (role == "admin") {
            return res.status(403).json({message:"cannot create admin"})
        }

        // Tự động chuẩn hóa vai trò theo chức vụ nếu có chọn chức vụ
        let finalRole = role;
        if (position) {
          const posDoc = await Position.findById(position);
          if (posDoc) {
            finalRole = determineRoleByPosition(posDoc, role);
          }
        }

        const user = await User.create({ email,password,name,mobile,position,department,description,role: finalRole});
        const { accessToken} = generateToken(user._id);
        res.status(200).json({
            accessToken: accessToken,
            message: "user created successfully",
        });
    } catch (error) {
        console.log("Error in signup controller: ", error.message);
        res.status(500).json({ message: "Server Error!", error: error.message });
    }
}
const signin = async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });
        if (user && (await user.comparePassword(password)))
            {
                if (user.role === null) {
                    return res.status(403).json({ message: "Tài khoản đang bị vô hiệu hóa vui lòng liên hệ quản trị viên để được hỗ trợ, hướng dẫn, Xin cảm ơn!" });
                  }
                const { accessToken} = generateToken(user._id,user.role);
                return res.status(200).json({
                    accessToken:accessToken,
                    name: user.name,
                });            
            }  
        const message = "Invalid email or password";
        return res.status(400).json({ message });
    } catch (error) {
        console.log("Error in signin controller: ", error.message);
        res.status(500).json({ message: "Server Error!", error: error.message });
    }
}

const reqResetPass = async (req, res) => {
    const {email} = req.body;

    try {
        const userExists = await User.findOne({ email });
        if (!userExists) {
            return res.status(400).json({ message: "User doesn't exists" });
        }
         
        let verificationCode = "";
        for (let i = 0; i < 6; i++) {
            const randomIndex = Math.floor(Math.random() * characters.length);
            verificationCode += characters[randomIndex];
        }
        console.log(verificationCode)
        const resetPasswordExpire = Date.now() + 60 * 1000 * 3; // 3 minutes
        

       
        userExists.resetPasswordToken = verificationCode;
        userExists.resetPasswordExpire = resetPasswordExpire;
        userExists.isVerifiedForReset = false;
        await userExists.save();

        await sentTempPassword(email, verificationCode);
        return res.status(200).json({message:"check your email"})
    } catch (error) { 
        console.log("Error in request ResetPass controller: ", error.message);
        res.status(500).json({ message: "Server Error!", error: error.message });
    }
}

const verrifyCode = async (req,res) =>{
    const { email, code } = req.body
    try {
        const userExists = await User.findOne({ 
            email, 
            resetPasswordToken: code, 
            resetPasswordExpire: { $gt: Date.now() } 
        });

        if (!userExists) {
            return res.status(400).json({ message: "Invalid or expired token" });
        }

        // Cập nhật trạng thái đã xác minh
        userExists.isVerifiedForReset = true;
        await userExists.save();

        return res.status(200).json({message:"please enter new password"})

    } catch (error) {
        console.log("Error in verrify Code controller: ", error.message);
        res.status(500).json({ message: "Server Error!", error: error.message });
    }
}
const resetPassword = async (req, res) => {
    const { email, newPassword } = req.body;  

    try {
        
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(400).json({ message: "User does not exist." });
        }

        if (!user.isVerifiedForReset) {
            return res.status(400).json({ message: "Session expired or unauthorized. Please verify your code again." });
        }



        user.password = newPassword
        user.resetPasswordToken = null;
        user.resetPasswordExpire = null;
        user.isVerifiedForReset = false;
        await user.save();

        return res.status(200).json({ message: "Password updated successfully." });
    } catch (error) {
        console.error("Error in resetPassword controller: ", error.message);
        res.status(500).json({ message: "Server Error!", error: error.message });
    }
};
const getAllUser = async (req, res) => {
  try {
    const { positionCode, departmentCode } = req.query;

    const filter = { role: { $ne: "admin" } };

    // --- Lọc theo positionCode ---
    if (positionCode) {
      const codes = positionCode.split(",").map((c) => c.trim());
      const positions = await Position.find({ positionCode: { $in: codes } }).select("_id");
      const positionIds = positions.map((p) => p._id);
      filter.position = { $in: positionIds };
    }

    // --- Lọc theo departmentCode ---
    if (departmentCode) {
      const codes = departmentCode.split(",").map((c) => c.trim());
      const departments = await Department.find({ departmentCode: { $in: codes } }).select("_id");
      const departmentIds = departments.map((d) => d._id);
      filter.department = { $in: departmentIds };
    }

    const users = await User.find(filter)
      .select("_id name email mobile position department role signature")
      .populate("position", "_id positionName positionCode")
      .populate("department", "_id departmentName departmentCode")
      .sort({ createdAt: -1 });

    res.status(200).json({ users });
  } catch (error) {
    console.error("Error in getAllUser controller:", error.message);
    res.status(500).json({ message: "Server Error!", error: error.message });
  }
};

const getUserInfo = async(req,res)=>{
    const { userId } = req.params;
    try {
        const user = await User.findById(userId).populate("position department");
        if(!user){
           return res.status(404).json({message: "user not found"})
        }
        res.status(200).json({
            success: true,
            data: user,
          })
    } catch (error) {
        console.error("Error in getUserInfo controller: ", error.message);
        res.status(500).json({ message: "Server Error!", error: error.message });
    }
}
const upadteInfo = async (req, res) => {
    const { userId } = req.params;
    const updatedData = req.body;
  
    try {
      const user = await User.findById(userId);
  
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }
      else if (user.role === null) {
        return res.status(403).json({ message: "Your account has been disabled." });
      }

      // Kiểm tra quyền: Chỉ cho phép tự cập nhật tài khoản của chính mình hoặc admin/manager
      const isSelf = req.user?._id?.toString() === userId.toString() || req.user?.id?.toString() === userId.toString();
      const isAdminOrManager = ["admin", "manager"].includes(req.user?.role);
      if (!isSelf && !isAdminOrManager) {
        return res.status(403).json({
          success: false,
          message: "Bạn không có quyền chỉnh sửa thông tin của người dùng khác.",
        });
      }
  
      // Chặn người không phải admin/manager cập nhật role
      if (updatedData.role && !isAdminOrManager) {
        return res.status(403).json({
          success: false,
          message: "Only admin or manager can update user roles.",
        });
      }

      // Kiểm tra trùng lặp email nếu có thay đổi email
      if (updatedData.email && updatedData.email.trim().toLowerCase() !== user.email.toLowerCase()) {
        const existingEmail = await User.findOne({
          email: updatedData.email.trim().toLowerCase(),
          _id: { $ne: userId }
        });
        if (existingEmail) {
          return res.status(400).json({
            success: false,
            message: "Email này đã được sử dụng bởi tài khoản khác trong hệ thống."
          });
        }
        user.email = updatedData.email.trim().toLowerCase();
      }

      if (updatedData.name && updatedData.name.trim()) {
        user.name = updatedData.name.trim();
      }

      if (updatedData.mobile !== undefined) {
        user.mobile = typeof updatedData.mobile === 'string' ? updatedData.mobile.trim() : String(updatedData.mobile || '');
      }

      if (updatedData.zaloId !== undefined) {
        user.zaloId = typeof updatedData.zaloId === 'string' ? updatedData.zaloId.trim() : String(updatedData.zaloId || '');
      }

      if (updatedData.zaloNotifications && typeof updatedData.zaloNotifications === 'object') {
        user.zaloNotifications = {
          ...(user.zaloNotifications?.toObject ? user.zaloNotifications.toObject() : (user.zaloNotifications || {})),
          ...updatedData.zaloNotifications
        };
      }

      // Chỉ cập nhật mật khẩu khi có nhập chuỗi mật khẩu mới
      if (updatedData.password && typeof updatedData.password === 'string' && updatedData.password.trim() !== '') {
        user.password = updatedData.password;
      }

      // Cập nhật thông báo email
      if (updatedData.emailNotifications && typeof updatedData.emailNotifications === 'object') {
        user.emailNotifications = {
          ...(user.emailNotifications?.toObject ? user.emailNotifications.toObject() : (user.emailNotifications || {})),
          ...updatedData.emailNotifications
        };
      }

      // Cập nhật tùy biến giao diện màu sắc cho người dùng
      if (updatedData.themePreference && typeof updatedData.themePreference === 'object') {
        user.themePreference = {
          ...(user.themePreference?.toObject ? user.themePreference.toObject() : (user.themePreference || {})),
          ...updatedData.themePreference
        };
      }

      // Cho phép cập nhật phòng ban/chức vụ nếu là admin/manager và có truyền lên
      if (["admin", "manager"].includes(req.user?.role)) {
        if (updatedData.position !== undefined) {
          user.position = updatedData.position || null;
        }
        if (updatedData.department !== undefined) {
          user.department = updatedData.department || null;
        }

        if (updatedData.role !== undefined) {
          // Chỉ admin mới được gán quyền admin cho người khác
          if (updatedData.role === "admin" && req.user?.role !== "admin") {
            return res.status(403).json({
              success: false,
              message: "Chỉ quản trị viên cấp cao (Admin) mới có quyền gán vai trò Admin.",
            });
          }
          user.role = updatedData.role;
        }

        // TỰ ĐỘNG CẬP NHẬT / ĐỒNG BỘ VAI TRÒ DỰA VÀO CHỨC VỤ:
        // Đảm bảo Cấp phó -> cappho, Cấp trưởng -> staff, Giảng viên/chuyên viên -> chuyenvien
        if (user.role !== "admin") {
          const effectivePositionId = updatedData.position !== undefined ? updatedData.position : user.position;
          if (effectivePositionId) {
            const posDoc = await Position.findById(effectivePositionId);
            if (posDoc) {
              const suggestedRole = determineRoleByPosition(posDoc, user.role);
              // Nếu vai trò hiện tại không tương thích với chức vụ mới, tự động đồng bộ
              if (suggestedRole && suggestedRole !== user.role) {
                user.role = suggestedRole;
              }
            }
          }
        }
      }
  
      await user.save();

      const userResponse = user.toObject();
      delete userResponse.password;
  
      res.status(200).json({
        success: true,
        message: "User information updated successfully.",
        data: userResponse,
      });
    } catch (error) {
      console.error("Error in upadteInfo controller: ", error.message);
      res.status(500).json({ message: "Server Error!", error: error.message });
    }
};
  
const disableUser = async (req, res) => {
    const { userId } = req.params;
    try {
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found." });
      }
  
      await User.findByIdAndUpdate(
        userId,
        { $set: { role: null } },
        { runValidators: false, new: true }
      );
  
      res.status(200).json({
        success: true,
        message: "User account has been disabled.",
      });
    } catch (error) {
      console.error("Error disabling user:", error.message);
      res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

const restoreUser = async (req, res) => {
    const { userId } = req.params;
    const { role } = req.body;
  
    try {
      const user = await User.findById(userId);
  
      if (!user) {
        return res.status(404).json({ message: "User not found." });
      }
  
      if (!role || !VALID_ROLES.includes(role)) {
        return res.status(400).json({ message: "Invalid role for restoration." });
      }
  
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: { role: role } },
        { runValidators: false, new: true }
      );
  
      return res.status(200).json({
        success: true,
        message: "User account has been restored.",
        user: updatedUser,
      });
    } catch (error) {
      console.error("Error restoring user:", error.message);
      return res.status(500).json({ message: "Server Error", error: error.message });
    }
};
  
const deleteUser = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    await User.deleteOne({ _id: userId });

    return res.status(200).json({
      success: true,
      message: "User account has been deleted.",
    });
  } catch (error) {
    console.error("Error deleting user:", error.message);
    return res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const uploadAvatar = async (req, res) => {
  try {
    const userId = req.user._id;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ success: false, message: "Vui lòng chọn file ảnh để tải lên" });
    }

    if (!file.mimetype.startsWith("image/")) {
      return res.status(400).json({ success: false, message: "File tải lên phải là định dạng hình ảnh (JPG, PNG, WEBP...)" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "Không tìm thấy người dùng" });
    }

    const auth = await authorize();
    const drive = google.drive({ version: "v3", auth });
    const folderId = await getOrCreateMonthFolder(drive);

    // Xóa file avatar cũ trên Google Drive nếu có
    if (user.avatar && user.avatar.fileId) {
      try {
        await drive.files.delete({ fileId: user.avatar.fileId, supportsAllDrives: true });
      } catch (delErr) {
        console.warn("Could not delete old avatar on Drive:", delErr.message);
      }
    }

    const sanitizedName = sanitizeFileName(file.originalname || "avatar.png");
    const fileMetadata = {
      name: `avatar_${userId}_${Date.now()}_${sanitizedName}`,
      parents: [folderId],
    };

    const media = {
      mimeType: file.mimetype,
      body: Readable.from(file.buffer),
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id, name, mimeType",
      supportsAllDrives: true,
    });

    try {
      await drive.permissions.create({
        fileId: response.data.id,
        requestBody: { role: 'reader', type: 'anyone' },
        supportsAllDrives: true,
      });
    } catch (permErr) {
      // Ignored if domain restricted
    }

    const avatarData = {
      fileId: response.data.id,
      fileName: response.data.name,
      mimeType: response.data.mimeType || file.mimetype,
      url: `/authen/avatar/${response.data.id}`,
    };

    await User.findByIdAndUpdate(
      userId,
      { $set: { avatar: avatarData } },
      { runValidators: false, new: true }
    );

    res.status(200).json({
      success: true,
      message: "Tải ảnh đại diện thành công",
      data: avatarData,
      avatar: avatarData,
    });
  } catch (error) {
    console.error("Error in uploadAvatar controller:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ khi tải ảnh đại diện", error: error.message });
  }
};

const getAvatarImage = async (req, res) => {
  try {
    const { fileId } = req.params;
    if (!fileId) {
      return res.status(400).json({ message: "FileId is required" });
    }

    const auth = await authorize();
    const drive = google.drive({ version: "v3", auth });

    let mimeType = "image/jpeg";
    try {
      const meta = await drive.files.get({ fileId, fields: "mimeType", supportsAllDrives: true });
      if (meta.data && meta.data.mimeType) {
        mimeType = meta.data.mimeType;
      }
    } catch (e) {
      // fallback
    }

    const response = await drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
    const buffer = Buffer.from(response.data);

    res.set({
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=604800, immutable",
    });
    res.send(buffer);
  } catch (error) {
    console.error("Error fetching avatar image:", error);
    res.status(404).json({ message: "Không tìm thấy ảnh đại diện" });
  }
};

const deleteAvatar = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.avatar && user.avatar.fileId) {
      try {
        const auth = await authorize();
        const drive = google.drive({ version: "v3", auth });
        await drive.files.delete({ fileId: user.avatar.fileId, supportsAllDrives: true });
      } catch (driveErr) {
        console.warn("Could not delete avatar from Drive:", driveErr.message);
      }
    }

    await User.findByIdAndUpdate(
      userId,
      { $unset: { avatar: 1 } },
      { runValidators: false, new: true }
    );

    res.status(200).json({
      success: true,
      message: "Xóa ảnh đại diện thành công",
    });
  } catch (error) {
    console.error("Error deleting avatar:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ khi xóa ảnh đại diện", error: error.message });
  }
};

const importUsers = async (req, res) => {
  try {
    const { users } = req.body;
    if (!users || !Array.isArray(users) || users.length === 0) {
      return res.status(400).json({ success: false, message: "Danh sách người dùng không hợp lệ hoặc rỗng" });
    }

    const createdUsers = [];
    const errors = [];

    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      const rowIndex = i + 1;
      const email = u.email ? String(u.email).trim().toLowerCase() : "";
      const name = u.name ? String(u.name).trim() : "";
      const mobile = u.mobile ? String(u.mobile).trim() : "";
      const password = u.password ? String(u.password).trim() : "123456";
      const department = u.department;
      const position = u.position;
      const role = u.role ? String(u.role).trim().toLowerCase() : "staff";
      const description = u.description ? String(u.description).trim() : "";

      if (!name || !email || !mobile) {
        errors.push({ row: rowIndex, email, message: "Thiếu Họ tên, Email hoặc Số điện thoại" });
        continue;
      }

      if (!department) {
        errors.push({ row: rowIndex, email, message: "Chưa xác định Đơn vị / Phòng ban hợp lệ" });
        continue;
      }

      if (!position) {
        errors.push({ row: rowIndex, email, message: "Chưa xác định Chức vụ hợp lệ" });
        continue;
      }

      if (!VALID_ROLES.includes(role)) {
        errors.push({ row: rowIndex, email, message: `Vai trò '${role}' không hợp lệ. Cho phép: ${VALID_ROLES.join(", ")}` });
        continue;
      }

      // Kiểm tra trùng email trong DB
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        errors.push({ row: rowIndex, email, message: `Email '${email}' đã tồn tại trong hệ thống` });
        continue;
      }

      // Kiểm tra trùng email trong cùng danh sách import
      if (createdUsers.some((cu) => cu.email === email)) {
        errors.push({ row: rowIndex, email, message: `Email '${email}' bị trùng lặp trong danh sách import` });
        continue;
      }

      try {
        let finalRole = role;
        if (position) {
          const posDoc = await Position.findById(position);
          if (posDoc) {
            finalRole = determineRoleByPosition(posDoc, role);
          }
        }

        const newUser = await User.create({
          name,
          email,
          password,
          mobile,
          department,
          position,
          role: finalRole,
          description,
        });
        createdUsers.push({ _id: newUser._id, name: newUser.name, email: newUser.email });
      } catch (createErr) {
        errors.push({ row: rowIndex, email, message: createErr.message || "Lỗi khi tạo tài khoản" });
      }
    }

    return res.status(200).json({
      success: true,
      message: `Đã nhập thành công ${createdUsers.length} người dùng${errors.length > 0 ? `, ${errors.length} dòng lỗi` : ""}`,
      createdCount: createdUsers.length,
      errorCount: errors.length,
      createdUsers,
      errors,
    });
  } catch (error) {
    console.error("Lỗi importUsers:", error);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ khi import người dùng", error: error.message });
  }
};

/**
 * Tự động rà soát và đồng bộ toàn bộ vai trò (role) cho tất cả người dùng hiện có trong hệ thống theo chức vụ (position)
 * Dành cho Quản trị viên (Admin/Manager)
 */
const autoSyncAllUserRolesAndPositions = async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: "admin" } }).populate("position");
    let updatedCount = 0;
    const details = [];

    for (const u of users) {
      if (!u.position) continue;
      const targetRole = determineRoleByPosition(u.position, u.role);
      if (targetRole && targetRole !== u.role) {
        const oldRole = u.role;
        u.role = targetRole;
        await u.save();
        updatedCount++;
        details.push({
          name: u.name,
          email: u.email,
          position: u.position.positionName,
          oldRole,
          newRole: targetRole,
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: `Đã đồng bộ thành công vai trò theo chức vụ cho ${updatedCount} người dùng!`,
      updatedCount,
      details,
    });
  } catch (error) {
    console.error("Lỗi autoSyncAllUserRolesAndPositions:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi đồng bộ vai trò theo chức vụ",
      error: error.message,
    });
  }
};

module.exports = {
    signin,
    createUser,
    importUsers,
    reqResetPass,
    verrifyCode,
    resetPassword,
    getAllUser,
    getUserInfo,
    upadteInfo,
    disableUser,
    restoreUser,
    deleteUser,
    uploadAvatar,
    getAvatarImage,
    deleteAvatar,
    autoSyncAllUserRolesAndPositions,
    determineRoleByPosition,
};