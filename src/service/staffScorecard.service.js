const Task = require('../models/task.model');
const User = require('../models/user.model');
const Document = require('../models/document.model');
const EmulationAchievement = require('../models/emulationAchievement.model');
const TrainingRegistration = require('../models/trainingRegistration.model');
require('../models/department.model');
require('../models/position.model');
const ExcelJS = require('exceljs');

/**
 * Phân tích và xác định khoảng thời gian theo Năm học hoặc Năm dương lịch
 */
const parseDateRange = (year, customFromDate, customToDate) => {
    if (customFromDate && customToDate) {
        return {
            startDate: new Date(customFromDate),
            endDate: new Date(customToDate),
            label: `Từ ${new Date(customFromDate).toLocaleDateString('vi-VN')} đến ${new Date(customToDate).toLocaleDateString('vi-VN')}`,
            isAll: false
        };
    }

    if (year === 'ALL') {
        return {
            startDate: null,
            endDate: null,
            label: 'Tất cả thời gian',
            isAll: true
        };
    }

    const currentYear = new Date().getFullYear();
    const targetYearStr = String(year || `${currentYear - 1}-${currentYear}`);

    if (targetYearStr.includes('-')) {
        const [y1, y2] = targetYearStr.split('-').map(Number);
        if (!isNaN(y1) && !isNaN(y2)) {
            // Năm học từ 01/09/Y1 đến 31/08/Y2
            const start = new Date(y1, 8, 1, 0, 0, 0);
            const end = new Date(y2, 7, 31, 23, 59, 59);
            return {
                startDate: start,
                endDate: end,
                label: `Năm học ${targetYearStr}`,
                isAll: false
            };
        }
    }

    const singleYear = parseInt(targetYearStr, 10) || currentYear;
    return {
        startDate: new Date(singleYear, 0, 1, 0, 0, 0),
        endDate: new Date(singleYear, 11, 31, 23, 59, 59),
        label: `Năm ${singleYear}`,
        isAll: false
    };
};

/**
 * Tổng hợp dữ liệu Hồ sơ Đóng góp Số (Digital Staff Scorecard)
 */
const getStaffScorecardData = async ({ userId, year, fromDate, toDate }) => {
    try {
        const user = await User.findById(userId)
            .populate('department', 'departmentName')
            .populate('position', 'positionName');

        if (!user) {
            throw new Error("Không tìm thấy thông tin cán bộ");
        }

        const dateRange = parseDateRange(year, fromDate, toDate);
        const { startDate, endDate, isAll } = dateRange;

        // 1. TỔNG HỢP CÔNG VIỆC & ĐÁNH GIÁ KPI
        // Cán bộ là người nhận việc (assignee), phối hợp (collaborator) hoặc thực hiện việc con (subtask)
        const userCondition = {
            $or: [
                { assignees: userId },
                { collaborators: userId },
                { "subtasks.assignee": userId }
            ]
        };

        const queryParts = [userCondition];

        if (!isAll && startDate && endDate) {
            queryParts.push({
                $or: [
                    { createdAt: { $gte: startDate, $lte: endDate } },
                    { startDate: { $gte: startDate, $lte: endDate } },
                    { endDate: { $gte: startDate, $lte: endDate } }
                ]
            });
        }

        const taskQuery = { $and: queryParts };

        const tasks = await Task.find(taskQuery)
            .populate('assignees', 'name')
            .populate('collaborators', 'name')
            .populate('evaluation.evaluatedBy', 'name');

        let totalTasks = tasks.length;
        let completedTasks = 0;
        let inProgressTasks = 0;
        let todoTasks = 0;
        let onTimeTasks = 0;
        let lateTasks = 0;
        let totalScore = 0;
        let totalRating = 0;
        let evaluatedCount = 0;
        let bonusScoreTotal = 0;
        let regularCount = 0;
        let urgentCount = 0;
        let focusAxisMap = {};
        let difficultyMap = { '1.0': 0, '1.1': 0, '1.2': 0 };

        tasks.forEach(t => {
            if (t.status === 'DONE') {
                completedTasks++;
                // Kiểm tra hoàn thành đúng hạn
                if (t.endDate) {
                    const deadline = new Date(t.endDate);
                    const finishDate = t.completedAt ? new Date(t.completedAt) : new Date(t.updatedAt);
                    if (finishDate.getTime() <= deadline.getTime() + (24 * 3600 * 1000)) {
                        onTimeTasks++;
                    } else {
                        lateTasks++;
                    }
                } else {
                    onTimeTasks++;
                }

                // Điểm đánh giá KPI
                if (t.evaluation && typeof t.evaluation.score === 'number') {
                    totalScore += t.evaluation.score;
                    totalRating += (t.evaluation.rating || 4);
                    bonusScoreTotal += (t.evaluation.bonusScore || 0);
                    evaluatedCount++;
                }
            } else if (t.status === 'IN_PROGRESS') {
                inProgressTasks++;
            } else {
                todoTasks++;
            }

            if (t.taskType === 'URGENT') urgentCount++;
            else regularCount++;

            if (t.focusAxis) {
                focusAxisMap[t.focusAxis] = (focusAxisMap[t.focusAxis] || 0) + 1;
            }

            const diffKey = String(t.difficultyRate || 1.0);
            if (difficultyMap[diffKey] !== undefined) {
                difficultyMap[diffKey]++;
            } else {
                difficultyMap[diffKey] = 1;
            }
        });

        const onTimeRate = completedTasks > 0 ? Math.round((onTimeTasks / completedTasks) * 100) : 100;
        const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
        const avgKpiScore = evaluatedCount > 0 ? +(totalScore / evaluatedCount).toFixed(1) : 0;
        const avgRating = evaluatedCount > 0 ? +(totalRating / evaluatedCount).toFixed(1) : 0;

        // 2. TỔNG HỢP THI ĐUA KHEN THƯỞNG
        let emulationAchievements = [];
        try {
            const emQuery = { user: userId };
            if (!isAll && startDate && endDate) {
                emQuery.$or = [
                    { createdAt: { $gte: startDate, $lte: endDate } },
                    { decisionDate: { $gte: startDate, $lte: endDate } },
                    { schoolYear: String(year) }
                ];
            }
            emulationAchievements = await EmulationAchievement.find(emQuery).sort({ createdAt: -1 });
        } catch (emErr) {
            console.warn('[StaffScorecard] Không lấy được thi đua:', emErr.message);
        }

        // 3. TỔNG HỢP HỌC TẬP BỒI DƯỠNG
        let trainingCourses = [];
        try {
            const trQuery = { user: userId };
            if (!isAll && startDate && endDate) {
                trQuery.$or = [
                    { createdAt: { $gte: startDate, $lte: endDate } },
                    { startDate: { $gte: startDate, $lte: endDate } },
                    { endDate: { $gte: startDate, $lte: endDate } },
                    { year: String(year) }
                ];
            }
            trainingCourses = await TrainingRegistration.find(trQuery).sort({ createdAt: -1 });
        } catch (trErr) {
            console.warn('[StaffScorecard] Không lấy được bồi dưỡng:', trErr.message);
        }

        // 4. TỔNG HỢP VĂN BẢN
        let sentDocsCount = 0;
        let signedDocsCount = 0;
        try {
            const docSentQuery = { sentBy: userId };
            const docSignQuery = { signer: userId };
            if (!isAll && startDate && endDate) {
                docSentQuery.createdAt = { $gte: startDate, $lte: endDate };
                docSignQuery.createdAt = { $gte: startDate, $lte: endDate };
            }
            sentDocsCount = await Document.countDocuments(docSentQuery);
            signedDocsCount = await Document.countDocuments(docSignQuery);
        } catch (docErr) {
            console.warn('[StaffScorecard] Không đếm được văn bản:', docErr.message);
        }

        // 5. XẾP LOẠI TỔNG THỂ (Staff Grade)
        let overallGrade = "Hoàn thành nhiệm vụ";
        let gradeBadgeColor = "blue";
        if (completionRate >= 90 && onTimeRate >= 90 && (avgKpiScore >= 85 || evaluatedCount === 0)) {
            overallGrade = "Hoàn thành xuất sắc nhiệm vụ";
            gradeBadgeColor = "gold";
        } else if (completionRate >= 80 && onTimeRate >= 80) {
            overallGrade = "Hoàn thành tốt nhiệm vụ";
            gradeBadgeColor = "green";
        } else if (completionRate < 60 || onTimeRate < 60) {
            overallGrade = "Không hoàn thành nhiệm vụ";
            gradeBadgeColor = "red";
        }

        const doneTasks = tasks.filter(t => t.status === 'DONE');

        return {
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                avatar: user.avatar,
                department: user.department?.departmentName || "Chưa phân bổ",
                position: user.position?.positionName || "Cán bộ"
            },
            period: dateRange,
            summary: {
                overallGrade,
                gradeBadgeColor,
                totalTasks,
                completedTasks,
                inProgressTasks,
                todoTasks,
                onTimeTasks,
                lateTasks,
                completionRate,
                onTimeRate,
                avgKpiScore,
                avgRating,
                evaluatedCount,
                bonusScoreTotal,
                sentDocsCount,
                signedDocsCount,
                emulationCount: emulationAchievements.length,
                trainingCount: trainingCourses.length
            },
            breakdowns: {
                taskType: { regular: regularCount, urgent: urgentCount },
                focusAxis: focusAxisMap,
                difficulty: difficultyMap
            },
            emulationAchievements: emulationAchievements.map(e => ({
                _id: e._id,
                titleName: e.titleName || e.achievementContent || e.decisionNumber || "Danh hiệu thi đua",
                targetType: e.targetType,
                rewardLevel: e.decisionAgency || e.rewardLevel || (e.targetType === 'TAP_THE' ? 'Tập thể' : 'Cá nhân'),
                decisionNumber: e.decisionNumber || '—',
                decisionDate: e.decisionDate,
                status: 'Đã công nhận'
            })),
            trainingCourses: trainingCourses.map(t => ({
                _id: t._id,
                courseName: t.trainingContent || "Khóa bồi dưỡng nghiệp vụ",
                organizer: t.trainingLocation || "Nhà trường",
                completionDate: t.endDate || t.startDate || t.createdAt,
                result: t.status === 'APPROVED' ? 'Đạt yêu cầu' : (t.status === 'PENDING' ? 'Chờ duyệt' : 'Hoàn thành')
            })),
            keyCompletedTasks: doneTasks
                .sort((a, b) => new Date(b.completedAt || b.updatedAt) - new Date(a.completedAt || a.updatedAt))
                .map(t => ({
                    _id: t._id,
                    title: t.title,
                    taskType: t.taskType,
                    difficultyRate: t.difficultyRate,
                    outputResult: t.outputResult,
                    completedAt: t.completedAt || t.updatedAt,
                    evaluation: t.evaluation ? {
                        score: t.evaluation.score,
                        rating: t.evaluation.rating,
                        bonusScore: t.evaluation.bonusScore,
                        evaluatedBy: t.evaluation.evaluatedBy ? {
                            _id: t.evaluation.evaluatedBy._id,
                            name: t.evaluation.evaluatedBy.name
                        } : null
                    } : null
                })),
            topTasks: doneTasks
                .sort((a, b) => (b.evaluation?.score || 0) - (a.evaluation?.score || 0))
                .slice(0, 10)
                .map(t => ({
                    _id: t._id,
                    title: t.title,
                    taskType: t.taskType,
                    difficultyRate: t.difficultyRate,
                    outputResult: t.outputResult,
                    kpiScore: t.evaluation?.score || null,
                    completedAt: t.completedAt || t.updatedAt
                }))
        };
    } catch (err) {
        console.error('[StaffScorecard] Lỗi tổng hợp hồ sơ số cán bộ:', err);
        throw err;
    }
};

/**
 * Xuất file Excel Báo cáo Đánh giá Đóng góp Cán bộ Năm học
 */
const exportStaffScorecardToExcel = async (scorecardData) => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Hồ sơ Đóng góp Cán bộ', {
        pageSetup: { paperSize: 9, orientation: 'portrait' }
    });

    const { user, period, summary, topTasks, emulationAchievements, trainingCourses } = scorecardData;

    // Header Trường
    sheet.mergeCells('A1:F1');
    sheet.getCell('A1').value = 'TRƯỜNG CAO ĐẲNG BÁCH KHOA NAM SÀI GÒN';
    sheet.getCell('A1').font = { bold: true, size: 12, color: { argb: '003366' } };
    sheet.getCell('A1').alignment = { horizontal: 'center' };

    sheet.mergeCells('A2:F2');
    sheet.getCell('A2').value = `HỒ SƠ ĐÓNG GÓP SỐ & ĐÁNH GIÁ KẾT QUẢ NĂM HỌC (${period.label.toUpperCase()})`;
    sheet.getCell('A2').font = { bold: true, size: 14, color: { argb: 'D32F2F' } };
    sheet.getCell('A2').alignment = { horizontal: 'center' };

    sheet.addRow([]);

    // Thông tin cán bộ
    sheet.addRow(['Họ và tên:', user.name, '', 'Đơn vị:', user.department]);
    sheet.addRow(['Chức vụ:', user.position, '', 'Email:', user.email]);
    sheet.addRow(['Kỳ đánh giá:', period.label, '', 'Xếp loại dự kiến:', summary.overallGrade]);

    sheet.addRow([]);

    // Bảng 1: Chỉ số tổng hợp
    sheet.addRow(['I. CHỈ SỐ THỰC HIỆN CÔNG VIỆC & KPI']);
    sheet.getCell('A7').font = { bold: true, color: { argb: '003366' } };

    sheet.addRow(['Chỉ số', 'Giá trị', 'Chỉ số', 'Giá trị', 'Chỉ số', 'Giá trị']);
    sheet.getRow(8).font = { bold: true };
    sheet.addRow([
        'Tổng số việc được giao', summary.totalTasks,
        'Số việc đã hoàn thành', `${summary.completedTasks} (${summary.completionRate}%)`,
        'Tỷ lệ đúng hạn', `${summary.onTimeRate}%`
    ]);
    sheet.addRow([
        'Điểm KPI trung bình', `${summary.avgKpiScore} / 100đ`,
        'Đánh giá sao trung bình', `${summary.avgRating} / 5 ⭐`,
        'Văn bản đã ban hành', `${summary.sentDocsCount} văn bản`
    ]);

    sheet.addRow([]);

    // Bảng 2: Thi đua & Bồi dưỡng
    sheet.addRow(['II. THI ĐUA KHEN THƯỞNG & ĐÀO TẠO BỒI DƯỠNG']);
    sheet.getRow(12).font = { bold: true, color: { argb: '003366' } };

    sheet.addRow(['STT', 'Loại hình', 'Nội dung danh hiệu / Khóa học', 'Số QĐ / Địa điểm', 'Trạng thái / Kết quả']);
    sheet.getRow(13).font = { bold: true };

    let rowIndex = 1;
    emulationAchievements.forEach(e => {
        sheet.addRow([rowIndex++, 'Thi đua', e.titleName, e.decisionNumber || 'N/A', e.status || 'Công nhận']);
    });
    trainingCourses.forEach(t => {
        sheet.addRow([rowIndex++, 'Bồi dưỡng', t.courseName || t.trainingContent, t.organizer || t.trainingLocation || 'N/A', t.result || t.status || 'Hoàn thành']);
    });

    if (emulationAchievements.length === 0 && trainingCourses.length === 0) {
        sheet.addRow(['-', 'Không có dữ liệu thi đua hoặc bồi dưỡng ghi nhận trong kỳ']);
    }

    sheet.addRow([]);

    // Bảng 3: Các công việc tiêu biểu
    sheet.addRow(['III. CÁC CÔNG VIỆC HOÀN THÀNH TIÊU BIỂU TRONG NĂM']);
    const curLastRow = sheet.lastRow.number;
    sheet.getRow(curLastRow).font = { bold: true, color: { argb: '003366' } };

    sheet.addRow(['STT', 'Tên công việc', 'Loại việc', 'Độ khó', 'Kết quả đầu ra', 'Điểm KPI']);
    sheet.getRow(curLastRow + 1).font = { bold: true };

    let taskIdx = 1;
    topTasks.forEach(t => {
        sheet.addRow([
            taskIdx++,
            t.title,
            t.taskType === 'URGENT' ? 'Đột xuất (12đ)' : 'Thường xuyên (10đ)',
            `Hệ số ${t.difficultyRate || 1.0}`,
            t.outputResult || 'Đạt yêu cầu',
            t.kpiScore ? `${t.kpiScore}đ` : 'Chưa chấm'
        ]);
    });

    sheet.addRow([]);
    sheet.addRow(['', '', '', `TP. Hồ Chí Minh, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}`]);
    sheet.addRow(['', 'CÁN BỘ ĐƯỢC ĐÁNH GIÁ', '', '', 'THỦ TRƯỞNG ĐƠN VỊ']);
    sheet.addRow(['', '(Ký và ghi rõ họ tên)', '', '', '(Ký và ghi rõ họ tên)']);

    // Tự động căn chỉnh độ rộng cột
    sheet.columns.forEach(column => {
        column.width = 22;
    });
    sheet.getColumn(2).width = 38;

    return await workbook.xlsx.writeBuffer();
};

module.exports = {
    getStaffScorecardData,
    exportStaffScorecardToExcel
};
