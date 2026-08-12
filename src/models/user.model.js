const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");


const googleSchema = new mongoose.Schema({
  googleId: { type: String },
  accessToken: { type: String },      // có thể để trống (ngắn hạn)
  refreshToken: { type: String },     // cần lưu (nên mã hoá)
  tokenExpiryDate: { type: Date },
  scope: { type: String },
}, { _id: false });

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Name is required"],
      },
    email: {
        type: String,
        required: [true, "Email is required"],
        unique: true,
        trim: true,
    },
    password: {
        type: String,
        required: [true, "Password is required"],
    },
    mobile: {
        type: String,
        required: [true, "Phone number is required"],
    },
    position: 
    {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Position",
        required: [true, "Position is required"],
    },
    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Department",
        required: [true, "Unit is required"],
        },
    role: {
        type: String,
        enum: ["staff", "admin","manager",],
        default: "staff",
    },
    description: {
        type: String,
    },
    resetPasswordToken: {
        type: String,
    },
    resetPasswordExpire: {
        type: Date,
    },
    isVerifiedForReset: {
        type: Boolean,
        default: false,
    },
    restoreOtp: {
        type: String,
    },
    restoreOtpExpire: {
        type: Date,
    },
    google: googleSchema,
},
{
  timestamps: true,
}
);



userSchema.pre("save", async function (next) {
if (!this.isModified("password")) {
  return next();
}
try {
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
} catch (error) {
  next(error);
}
});

userSchema.methods.comparePassword = async function (enteredPassword) {
return bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model("User", userSchema);
module.exports = User;
