const mongoose = require("mongoose");

const signStepSchema = new mongoose.Schema({
    stepIndex: {
        type: Number,
        required: true,
        default: 1
    },
    stepName: {
        type: String,
        required: true,
        trim: true
    },
    assignee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    action: {
        type: String,
        enum: ["PENDING", "APPROVED", "REJECTED", "TRANSFERRED"],
        default: "PENDING"
    },
    actionType: {
        type: String,
        enum: ["SIGN", "REVIEW"], // SIGN: Ký và duyệt, REVIEW: Thẩm định / Cho ý kiến
        default: "SIGN"
    },
    comment: {
        type: String,
        trim: true,
        default: ""
    },
    actionAt: {
        type: Date
    },
    signaturePositions: [
        {
            pageNum: { type: Number, required: true },
            x: { type: Number, required: true },
            y: { type: Number, required: true },
            width: { type: Number, required: true },
            height: { type: Number, required: true }
        }
    ]
}, { _id: true, timestamps: true });

const approvalDocumentSchema = new mongoose.Schema({
    documentCode: {
        type: String,
        unique: true,
        trim: true
    },
    title: {
        type: String,
        required: [true, "Tiêu đề hồ sơ trình ký không được để trống"],
        trim: true
    },
    description: {
        type: String,
        trim: true,
        default: ""
    },
    creator: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Department"
    },
    docVariant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "DocVariant"
    },
    urgency: {
        type: String,
        enum: ["NORMAL", "URGENT", "VERY_URGENT"],
        default: "NORMAL"
    },
    originalFile: {
        fileName: { type: String, required: true },
        fileId: { type: String, required: true }, // Google Drive file ID
        mimeType: { type: String, required: true },
        fileSize: { type: Number }
    },
    currentFile: {
        fileName: { type: String },
        fileId: { type: String }, // File PDF cập nhật sau mỗi bước ký
        mimeType: { type: String, default: "application/pdf" }
    },
    attachments: [
        {
            fileName: { type: String },
            fileId: { type: String },
            mimeType: { type: String }
        }
    ],
    status: {
        type: String,
        enum: ["DRAFT", "IN_PROGRESS", "APPROVED", "REJECTED", "ISSUED"],
        default: "IN_PROGRESS"
    },
    currentStepIndex: {
        type: Number,
        default: 1
    },
    signSteps: [signStepSchema],
    rejectionReason: {
        type: String,
        default: ""
    },
    rejectedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    issuedNumber: {
        type: String,
        trim: true
    },
    issuedAt: {
        type: Date
    },
    verificationCode: {
        type: String,
        unique: true,
        sparse: true
    }
}, {
    timestamps: true
});

// Tự động tạo mã hồ sơ nếu chưa có
approvalDocumentSchema.pre("save", async function(next) {
    if (!this.documentCode) {
        const year = new Date().getFullYear();
        const count = await mongoose.model("ApprovalDocument").countDocuments();
        this.documentCode = `TK-${year}/${String(count + 1).padStart(4, "0")}`;
    }
    if (!this.verificationCode) {
        this.verificationCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    }
    next();
});

module.exports = mongoose.model("ApprovalDocument", approvalDocumentSchema);
