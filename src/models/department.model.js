const mongoose = require("mongoose");

const departmentSchema = new mongoose.Schema({
    departmentCode: {
        type:String,
        unique: true,
        required: [true, "Unit Code is required"],

    },
    departmentName: {
        type:String,
        required: [true, "Unit Name is required"],
    },
    isActive: {
        type: Boolean,
        default: true
    }
},
{
    timestamps: true,
  }
)
const Department = mongoose.model("Department", departmentSchema)
module.exports = Department;