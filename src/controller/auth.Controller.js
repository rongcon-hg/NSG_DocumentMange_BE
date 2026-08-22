const User = require("../models/user.model");
const Position = require("../models/position.model");
const Department = require("../models/department.model");
const jwt = require("jsonwebtoken");
const { generateToken } = require("../service/Token.service/Token");
const crypto = require("crypto");
const{sentTempPassword} = require("../service/NodeMailer.service/email")
const dotenv = require("dotenv");
const { read } = require("fs");
dotenv.config();
const characters = process.env.CHARACTERS;
const VALID_ROLES = ["staff", "manager", "cappho", "chuyenvien"];

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
        const user = await User.create({ email,password,name,mobile,position,department,description,role});
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
      .select("_id name email mobile position department role")
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
  
      // Chặn người không phải admin cập nhật role
      if (updatedData.role && !["admin", "manager"].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: "Only admin or manager can update user roles.",
        });
      }
  
      // Cập nhật các trường hợp lệ
      Object.keys(updatedData).forEach((key) => {
        if (updatedData[key] !== undefined) {
          user[key] = updatedData[key];
        }
      });
  
      await user.save();
  
      res.status(200).json({
        success: true,
        message: "User information updated successfully.",
        data: user,
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
  
      user.role = null;
      await user.save();
  
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
  
      user.role = role;
      await user.save();
  
      return res.status(200).json({
        success: true,
        message: "User account has been restored.",
        user,
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

module.exports = {
    signin,
    createUser,
    reqResetPass,
    verrifyCode,
    resetPassword,
    getAllUser,
    getUserInfo,
    upadteInfo,
    disableUser,
    restoreUser,
    deleteUser
}