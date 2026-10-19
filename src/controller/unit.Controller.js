const Unit = require("../models/unit.model");

const createUnit = async (req, res) => {
    try {
        const { unitCode, unitName } = req.body;
        const codeExists = await Unit.findOne({ unitCode });
        const nameExists = await Unit.findOne({ unitName });
        if (codeExists || nameExists) {
            return res.status(400).json({ message: "Unit already exists" });
        }
        await Unit.create({ unitCode, unitName });
        return res.status(200).json({ message: "Unit created successfully" });
    } catch (error) {
        console.log("Error in create Unit controller: ", error.message);
        res.status(500).json({ message: "Server Error!", error: error.message });
    }
}
const getAllUnit = async (req, res) => {
    try {
        const { onlyActive } = req.query;
        const query = {};
        if (onlyActive === "true") {
            query.isActive = { $ne: false };
        }
        const Units = await Unit.find(query)
        .sort({ createdAt: -1 });

        res.status(200).json({ Units });
    } catch (error) {
        console.log("Error in get all Unit controller: ", error.message);
        res.status(500).json({ message: "Server Error!", error: error.message });
    }
}
const deleteUnit = async (req, res) => {
    try {
        const { unitID } = req.body;
        const deletedUnit = await Unit.findByIdAndDelete(unitID);
        if (!deletedUnit) {
            return res.status(404).json({ message: "Unit not found" });
        }
        return res.status(200).json({ message: "Unit deleted successfully" });        
    } catch (error) {
        console.log("Error in delete Unit controller: ", error.message);
        res.status(500).json({ message: "Server Error!", error: error.message });
    }
}
const updateUnit = async (req, res) => {
    try {
        const { unitID, unitCode, unitName, isActive } = req.body;
        const existingUnit = await Unit.findById(unitID);
        if (!existingUnit) {
            return res.status(404).json({ message: "Unit not found" });
        }

        const codeExists = await Unit.findOne({ 
            unitCode, 
            _id: { $ne: unitID } 
        });
        if (codeExists) {
            return res.status(400).json({ message: "Unit code already exists" });
        }

        const nameExists = await Unit.findOne({ 
            unitName, 
            _id: { $ne: unitID } 
        });
        if (nameExists) {
            return res.status(400).json({ message: "Unit name already exists" });
        }

        existingUnit.unitCode = unitCode || existingUnit.unitCode;
        existingUnit.unitName = unitName || existingUnit.unitName;
        if (typeof isActive === "boolean") {
            existingUnit.isActive = isActive;
        }
        await existingUnit.save();

        return res.status(200).json({ message: "Unit updated successfully", unit: existingUnit });
    } catch (error) {
        console.log("Error in update Unit controller: ", error.message);
        res.status(500).json({ message: "Server Error!", error: error.message });
    }
};

const toggleUnitStatus = async (req, res) => {
    try {
        const { unitID, isActive } = req.body;
        const existingUnit = await Unit.findById(unitID);
        if (!existingUnit) {
            return res.status(404).json({ message: "Unit not found" });
        }
        existingUnit.isActive = typeof isActive === "boolean" ? isActive : !existingUnit.isActive;
        await existingUnit.save();
        return res.status(200).json({
            message: `Đã ${existingUnit.isActive ? "kích hoạt" : "vô hiệu hóa"} cơ quan ban hành thành công`,
            unit: existingUnit
        });
    } catch (error) {
        console.log("Error in toggleUnitStatus controller: ", error.message);
        res.status(500).json({ message: "Server Error!", error: error.message });
    }
};

module.exports = {
    createUnit,
    getAllUnit,
    deleteUnit,
    updateUnit,
    toggleUnitStatus
}                                  