const mongoose = require("mongoose");

const positionSchema = new mongoose.Schema({
    positionCode: {
        type:String,
        unique: true,
        required: [true, "Position Code is required"],

    },
    positionName: {
        type:String,
        required: [true, "Position Name is required"],
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
const Position = mongoose.model("Position", positionSchema)
module.exports = Position; 