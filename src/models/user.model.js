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
        default: "",
    },
    zaloId: {
        type: String,
        default: "",
        trim: true,
    },
    zaloNotifications: {
        enabled: { type: Boolean, default: true },
        mention: { type: Boolean, default: true },
        urgentTask: { type: Boolean, default: true },
        urgentDoc: { type: Boolean, default: true },
    },
    position: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Position",
        required: function () {
            return this.role !== "admin";
        },
    },
    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Department",
        required: function () {
            return this.role !== "admin";
        },
    },
    role: {
        type: String,
        enum: ["staff", "admin", "manager", "cappho", "chuyenvien"],
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
    avatar: {
        fileId: { type: String },
        fileName: { type: String },
        mimeType: { type: String },
        url: { type: String },
    },
    signature: {
        fileId: { type: String },
        fileName: { type: String },
        mimeType: { type: String },
    },
    emailNotifications: {
        docNew: { type: Boolean, default: true },
        docReview: { type: Boolean, default: true },
        replyDocSubmit: { type: Boolean, default: true },
        replyDocStatus: { type: Boolean, default: true },
        taskAssign: { type: Boolean, default: true },
        taskReminder: { type: Boolean, default: true },
        emulationRegister: { type: Boolean, default: true },
        trainingRegister: { type: Boolean, default: true },
        onlineRecordSubmit: { type: Boolean, default: true },
        onlineRecordStatus: { type: Boolean, default: true },
    },
    themePreference: {
        preset: { type: String, default: "blue_ocean" },
        headerBg: { type: String, default: "" },
        sidebarBg: { type: String, default: "" },
    },
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
