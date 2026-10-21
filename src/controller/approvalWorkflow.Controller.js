const mongoose = require("mongoose");
const ApprovalWorkflowConfig = require("../models/approvalWorkflow.model");
const User = require("../models/user.model");
const Department = require("../models/department.model");

// Khởi tạo tuyến mặc định nếu chưa có
const ensureDefaultWorkflow = async () => {
    try {
        const count = await ApprovalWorkflowConfig.countDocuments();
        if (count === 0) {
            await ApprovalWorkflowConfig.create({
                workflowCode: "WF_STANDARD_NSG",
                workflowName: "Quy trình trình ký chuẩn cấp Trường (4 bước)",
                description: "GV-CV tham mưu -> Cấp trưởng/phó đơn vị thẩm định & ký nháy -> Quản trị/Manager thẩm định & ký nháy -> Ban Giám hiệu ký duyệt -> Manager vào số ban hành",
                isDefault: true,
                isActive: true,
                steps: [
                    {
                        stepIndex: 1,
                        stepName: "Cấp trưởng/phó đơn vị thẩm định & ký nháy",
                        actionType: "REVIEW",
                        targetType: "UNIT_LEADER",
                        description: "Trưởng phòng, Trưởng khoa hoặc Cấp phó phụ trách của đơn vị người tạo thẩm định và ký nháy"
                    },
                    {
                        stepIndex: 2,
                        stepName: "Quản trị / Manager thẩm định & ký nháy",
                        actionType: "REVIEW",
                        targetType: "MANAGER",
                        description: "Phòng Tổ chức - Hành chính / Quản trị hệ thống kiểm tra thể thức và ký nháy"
                    },
                    {
                        stepIndex: 3,
                        stepName: "Ban Giám hiệu ký duyệt",
                        actionType: "SIGN",
                        targetType: "BGH",
                        description: "Ban Giám hiệu phụ trách thẩm quyền ký duyệt chính thức (ký số / chữ ký điện tử)"
                    },
                    {
                        stepIndex: 4,
                        stepName: "Manager vào số & Ban hành hồ sơ",
                        actionType: "ISSUE",
                        targetType: "MANAGER",
                        description: "Hồ sơ chuyển về Manager để cấp số văn bản, phát hành và gửi các đơn vị liên quan"
                    }
                ]
            });
            console.log("Đã khởi tạo quy trình trình ký chuẩn mặc định");
        }
    } catch (e) {
        console.warn("ensureDefaultWorkflow error:", e.message);
    }
};

ensureDefaultWorkflow();

// 1. Lấy danh sách quy trình tuyến ký duyệt
const getWorkflows = async (req, res) => {
    try {
        const workflows = await ApprovalWorkflowConfig.find().populate("steps.defaultAssignee", "name email role position department").sort({ isDefault: -1, createdAt: -1 });
        res.status(200).json({ success: true, data: workflows });
    } catch (error) {
        console.error("Error getWorkflows:", error);
        res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
    }
};

// 2. Tạo mới quy trình tuyến ký duyệt (Chỉ Admin / Manager)
const createWorkflow = async (req, res) => {
    try {
        const { workflowCode, workflowName, description, isDefault, steps } = req.body;
        if (!workflowCode || !workflowName || !Array.isArray(steps) || steps.length === 0) {
            return res.status(400).json({ success: false, message: "Vui lòng nhập đầy đủ mã, tên quy trình và các bước" });
        }

        const exists = await ApprovalWorkflowConfig.findOne({ workflowCode });
        if (exists) {
            return res.status(400).json({ success: false, message: "Mã quy trình đã tồn tại" });
        }

        if (isDefault) {
            await ApprovalWorkflowConfig.updateMany({}, { isDefault: false });
        }

        const newWf = await ApprovalWorkflowConfig.create({
            workflowCode,
            workflowName,
            description,
            isDefault: !!isDefault,
            steps
        });

        res.status(201).json({ success: true, message: "Tạo tuyến ký duyệt thành công", data: newWf });
    } catch (error) {
        console.error("Error createWorkflow:", error);
        res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
    }
};

// 3. Cập nhật quy trình tuyến ký duyệt (Chỉ Admin / Manager)
const updateWorkflow = async (req, res) => {
    try {
        const { id } = req.params;
        const { workflowName, description, isDefault, isActive, steps } = req.body;

        const wf = await ApprovalWorkflowConfig.findById(id);
        if (!wf) {
            return res.status(404).json({ success: false, message: "Không tìm thấy tuyến ký duyệt" });
        }

        if (isDefault) {
            await ApprovalWorkflowConfig.updateMany({ _id: { $ne: id } }, { isDefault: false });
        }

        if (workflowName) wf.workflowName = workflowName;
        if (description !== undefined) wf.description = description;
        if (isDefault !== undefined) wf.isDefault = isDefault;
        if (isActive !== undefined) wf.isActive = isActive;
        if (Array.isArray(steps) && steps.length > 0) wf.steps = steps;

        await wf.save();
        res.status(200).json({ success: true, message: "Cập nhật tuyến ký duyệt thành công", data: wf });
    } catch (error) {
        console.error("Error updateWorkflow:", error);
        res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
    }
};

// 4. Xóa quy trình tuyến ký duyệt
const deleteWorkflow = async (req, res) => {
    try {
        const { id } = req.params;
        const wf = await ApprovalWorkflowConfig.findById(id);
        if (!wf) {
            return res.status(404).json({ success: false, message: "Không tìm thấy tuyến ký duyệt" });
        }
        await ApprovalWorkflowConfig.findByIdAndDelete(id);
        res.status(200).json({ success: true, message: "Đã xóa tuyến ký duyệt" });
    } catch (error) {
        console.error("Error deleteWorkflow:", error);
        res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
    }
};

// 5. Sinh danh sách các bước ký duyệt cụ thể cho người tạo dựa theo vai trò, đơn vị
const generateStepsForUser = async (req, res) => {
    try {
        const creatorId = req.query.creatorId || req.user._id;
        const workflowId = req.query.workflowId;

        const creator = await User.findById(creatorId).populate("department").populate("position");
        if (!creator) {
            return res.status(404).json({ success: false, message: "Không tìm thấy người tạo" });
        }

        let workflow = null;
        if (workflowId) {
            workflow = await ApprovalWorkflowConfig.findById(workflowId);
        }
        if (!workflow) {
            workflow = await ApprovalWorkflowConfig.findOne({ isDefault: true, isActive: true }) || await ApprovalWorkflowConfig.findOne({ isActive: true });
        }

        if (!workflow) {
            return res.status(404).json({ success: false, message: "Chưa có quy trình tuyến ký duyệt nào được kích hoạt" });
        }

        // Lấy danh sách lãnh đạo đơn vị của người tạo (staff, cappho)
        let unitLeaders = [];
        if (creator.department) {
            unitLeaders = await User.find({
                department: creator.department._id,
                role: { $in: ["staff", "cappho"] },
                _id: { $ne: creator._id }
            }).populate("position").lean();
        }

        // Ưu tiên chọn Cấp trưởng đơn vị (staff), nếu không có lấy Cấp phó (cappho)
        const defaultUnitLeader = unitLeaders.find(u => u.role === "staff") || unitLeaders[0] || null;

        // Lấy danh sách Managers (Tổ chức - Hành chính / Quản trị)
        const managers = await User.find({
            role: "manager",
            email: { $ne: "qlvb@nsgpc.edu.vn" }
        }).populate("department").populate("position").lean();
        const defaultManager = managers[0] || null;

        // Lấy danh sách Ban Giám hiệu
        const bghDept = await Department.findOne({ departmentName: /Giám hiệu/i });
        let bghMembers = [];
        if (bghDept) {
            bghMembers = await User.find({ department: bghDept._id }).populate("position").lean();
        }
        if (bghMembers.length === 0) {
            // Fallback nếu không có Ban Giám hiệu riêng
            bghMembers = await User.find({ role: { $in: ["staff", "admin"] } }).populate("position").lean();
        }
        const defaultBgh = bghMembers[0] || null;

        // Sinh danh sách bước thực tế
        const generatedSteps = [];
        let currentIndex = 1;

        for (const stepTpl of workflow.steps) {
            let assignee = null;
            let candidateList = [];

            if (stepTpl.targetType === "UNIT_LEADER") {
                // Nếu bản thân người tạo đã là Cấp trưởng (staff) hoặc Ban Giám hiệu, có thể bỏ qua bước lãnh đạo đơn vị duyệt
                if (creator.role === "staff" || (creator.department?.departmentName || "").includes("Ban Giám hiệu")) {
                    continue; // Bỏ qua bước cấp trưởng vì chính họ là cấp trưởng
                }
                assignee = defaultUnitLeader ? defaultUnitLeader._id : null;
                candidateList = unitLeaders;
            } else if (stepTpl.targetType === "MANAGER") {
                assignee = stepTpl.defaultAssignee || (defaultManager ? defaultManager._id : null);
                candidateList = managers;
            } else if (stepTpl.targetType === "BGH") {
                assignee = stepTpl.defaultAssignee || (defaultBgh ? defaultBgh._id : null);
                candidateList = bghMembers;
            } else if (stepTpl.targetType === "SPECIFIC_USER") {
                assignee = stepTpl.defaultAssignee || null;
            }

            generatedSteps.push({
                stepIndex: currentIndex++,
                stepName: stepTpl.stepName,
                actionType: stepTpl.actionType,
                targetType: stepTpl.targetType,
                assignee: assignee,
                candidateList: candidateList.map(c => ({
                    _id: c._id,
                    name: c.name,
                    email: c.email,
                    role: c.role,
                    positionName: c.position?.positionName || ""
                }))
            });
        }

        res.status(200).json({
            success: true,
            workflow: {
                _id: workflow._id,
                workflowCode: workflow.workflowCode,
                workflowName: workflow.workflowName,
                description: workflow.description
            },
            creator: {
                _id: creator._id,
                name: creator.name,
                role: creator.role,
                departmentName: creator.department?.departmentName || "NSG"
            },
            steps: generatedSteps,
            candidateGroups: {
                unitLeaders: unitLeaders.map(u => ({ _id: u._id, name: u.name, position: u.position?.positionName })),
                managers: managers.map(u => ({ _id: u._id, name: u.name, position: u.position?.positionName })),
                bghMembers: bghMembers.map(u => ({ _id: u._id, name: u.name, position: u.position?.positionName }))
            }
        });

    } catch (error) {
        console.error("Error generateStepsForUser:", error);
        res.status(500).json({ success: false, message: "Lỗi máy chủ", error: error.message });
    }
};

module.exports = {
    getWorkflows,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
    generateStepsForUser
};
