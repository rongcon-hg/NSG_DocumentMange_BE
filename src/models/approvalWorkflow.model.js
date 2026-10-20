const mongoose = require("mongoose");

const workflowStepTemplateSchema = new mongoose.Schema({
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
    actionType: {
        type: String,
        enum: ["SIGN", "REVIEW", "ISSUE"], // SIGN: Ký duyệt, REVIEW: Thẩm định / Ký nháy, ISSUE: Vào số & Ban hành
        default: "REVIEW"
    },
    targetType: {
        type: String,
        enum: ["UNIT_LEADER", "MANAGER", "BGH", "SPECIFIC_USER"],
        required: true,
        default: "UNIT_LEADER"
    },
    defaultAssignee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },
    description: {
        type: String,
        default: ""
    }
}, { _id: true });

const approvalWorkflowConfigSchema = new mongoose.Schema({
    workflowCode: {
        type: String,
        unique: true,
        trim: true,
        required: true
    },
    workflowName: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        default: ""
    },
    isDefault: {
        type: Boolean,
        default: false
    },
    isActive: {
        type: Boolean,
        default: true
    },
    steps: [workflowStepTemplateSchema]
}, { timestamps: true });

module.exports = mongoose.model("ApprovalWorkflowConfig", approvalWorkflowConfigSchema);
