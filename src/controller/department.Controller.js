
const Department = require("../models/department.model");
const User = require("../models/user.model")

const createDepartment = async (req, res) => {
    const { departmentCode, departmentName } = req.body;

    try {
        const CodeExists = await Department.findOne({ departmentCode }); // Correct Model Reference
        const nameExists = await Department.findOne({ departmentName }); // Correct Model Reference
        if (CodeExists || nameExists) {
            return res.status(400).json({ message: "Department already exists" });
        }
        await Department.create({ departmentCode, departmentName });
        return res.status(200).json({ message: "Department created successfully" });
    } catch (error) {
        console.log("Error in create Department controller: ", error.message);
        res.status(500).json({ message: "Server Error!", error: error.message });
    }
};

const getAllDepartment = async (req, res) => { // Fixed signature
    try {
        const { includeDissolved } = req.query;
        const matchStage = {};
        if (includeDissolved !== "true") {
            matchStage.departmentName = { $not: { $regex: "giải thể", $options: "i" } };
        }

        const alldepartment = await Department.aggregate([
            ...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []),
            {
                $lookup: {
                    from: "users", 
                    localField: "_id",
                    foreignField: "department",
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
        ])
        res.status(200).json({
            AllDepartment: alldepartment,
        });
    } catch (error) {
        console.log("Error in get Department controller: ", error.message);
        res.status(500).json({ message: "Server Error!", error: error.message });
    }
};

const deleteDepartment= async (req, res) =>{

    const {departmentID} = req.body
    try {
        const department = await User.find({'department':departmentID});

        if(department.length >0)
        {
            return res.status(400).json({message:"This department cannot be deleted because it is occupied"})
        }
        await Department.findByIdAndDelete(departmentID)
        return res.status(200).json({message: "delete department successfully"})
    } catch (error) {
        console.log("Error in delete department controller: ", error.message);
        res.status(500).json({ message: "Server Error!", error: error.message });
    }
}
const updateDepartment = async (req, res) => {
    const { departmentID, departmentCode, departmentName } = req.body;

    try {
        const department = await Department.findById(departmentID);
        if (!department) {
            return res.status(404).json({ message: "Department not found" });
        }

        const codeExists = await Department.findOne({
            departmentCode,
            _id: { $ne: departmentID },
        });
        if (codeExists) {
            return res.status(400).json({ message: "Department code already exists" });
        }

        const nameExists = await Department.findOne({
            departmentName,
            _id: { $ne: departmentID }, 
        });
        if (nameExists) {
            return res.status(400).json({ message: "Department name already exists" });
        }

        // Update the department details
        department.departmentCode = departmentCode || department.departmentCode;
        department.departmentName = departmentName || department.departmentName;
        await department.save();

        return res.status(200).json({ message: "Department updated successfully" });
    } catch (error) {
        console.error("Error in update Department controller: ", error.message);
        res.status(500).json({ message: "Server Error!", error: error.message });
    }
};
const getUsersByDepartment = async (req, res) => {
    try {
        const { departmentId } = req.params; // Lấy departmentId từ URL

        // Tìm tất cả user thuộc phòng ban đó và populate vị trí
        const users = await User.find({ department: departmentId }).populate("position", "name");

        if (!users.length) {
            return res.status(404).json({ message: "No users found in this department" });
        }

        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: "Internal server error", error: error.message });
    }
};

module.exports = {
    createDepartment,
    getAllDepartment,
    deleteDepartment,
    updateDepartment,
    getUsersByDepartment
};
