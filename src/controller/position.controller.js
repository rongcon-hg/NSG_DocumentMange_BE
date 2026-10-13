const Position = require("../models/position.model");
const User = require("../models/user.model")

const createPosition = async (req, res) => {
    const { positionCode, positionName } = req.body;
    try {
        const CodeExists = await Position.findOne({ positionCode });
        const nameExists = await Position.findOne({ positionName });

        if (CodeExists || nameExists) {
            return res.status(400).json({ message: "Position already exists" });
        }
        await Position.create({ positionCode, positionName });
        return res.status(200).json({
            message: "Position created successfully",
        });
    } catch (error) {
        console.log("Error in create Position controller: ", error.message);
        res.status(500).json({ message: "Server Error!", error: error.message });
    }
};

const getAllPosition = async (req, res) => {
    try {
        const { positionCode, positionName } = req.query;

        const matchStage = {};
        if (positionCode) {
        matchStage.positionCode = positionCode; 
        }
        if (positionName) {
        matchStage.positionName = positionName;
        }

        const allPosition = await Position.aggregate([
            {
                $match: matchStage, 
            },
            {
                $lookup: {
                from: "users",
                localField: "_id",
                foreignField: "position",
                as: "users",
                },
            },
            {
                $addFields: {
                userCount: { $size: "$users" },
                },
            },
            {
                $sort: { createdAt: -1 },
            },
            {
                $project: {
                users: 0,
                },
            },
        ]);

        res.status(200).json({
            AllPosition: allPosition,
        });
    } catch (error) {
        console.log("Error in get Position controller: ", error.message);
        res.status(500).json({ message: "Server Error!", error: error.message });
    }
};
const deletePosition = async (req, res) =>{

    const {positionID} = req.body
    try {
        const position = await User.find({'position':positionID});

        if(position.length >0)
        {
            return res.status(400).json({message:"This position cannot be deleted because it is occupied"})
        }
        await Position.findByIdAndDelete(positionID)
        return res.status(200).json({message: "delete position successfully"})
    } catch (error) {
        console.log("Error in delete Position controller: ", error.message);
        res.status(500).json({ message: "Server Error!", error: error.message });
    }
}
const updatePosition = async (req, res) => {
    const { positionID, positionCode, positionName } = req.body;

    try {
        const position = await Position.findById(positionID);
        if (!position) {
            return res.status(404).json({ message: "Position not found" });
        }

        const codeExists = await Position.findOne({
            positionCode,
            _id: { $ne: positionID },
        });
        if (codeExists) {
            return res.status(400).json({ message: "Position code already exists" });
        }

        const nameExists = await Position.findOne({
            positionName,
            _id: { $ne: positionID }, 
        });
        if (nameExists) {
            return res.status(400).json({ message: "Position name already exists" });
        }

        position.positionCode = positionCode || position.positionCode;
        position.positionName = positionName || position.positionName;
        await position.save();

        // Tự động rà soát & cập nhật vai trò cho những người dùng đang giữ chức vụ này
        try {
          const { determineRoleByPosition } = require("./auth.Controller");
          const affectedUsers = await User.find({ position: positionID, role: { $ne: "admin" } });
          for (const u of affectedUsers) {
            const targetRole = determineRoleByPosition(position, u.role);
            if (targetRole && targetRole !== u.role) {
              u.role = targetRole;
              await u.save();
            }
          }
        } catch (syncErr) {
          console.error("Lỗi tự động đồng bộ vai trò khi sửa chức vụ:", syncErr);
        }

        return res.status(200).json({ message: "Position updated successfully" });
    } catch (error) {
        console.error("Error in update Position controller: ", error.message);
        res.status(500).json({ message: "Server Error!", error: error.message });
    }
};


module.exports = {
    createPosition,
    getAllPosition,
    deletePosition,
    updatePosition
};
