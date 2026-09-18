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
        let totalConvertedScore = 0; // Điểm quy đổi theo hệ số độ khó
        let regularCount = 0;
        let urgentCount = 0;

        let focusAxisMap = {
            'TRUC_1': 0,
            'TRUC_2': 0,
            'TRUC_3': 0,
            'TRUC_4': 0
        };

        let difficultyMap = {
            '1.0': 0,
            '1.1': 0,
            '1.2': 0
        };

        tasks.forEach(t => {
            const isDone = t.status === 'DONE';
            const isInProgress = t.status === 'IN_PROGRESS';

            if (isDone) {
                completedTasks++;
                // Kiểm tra hoàn thành đúng hạn (cho phép ân hạn đến hết ngày deadline)
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

                    const base = t.baseScore || (t.taskType === 'URGENT' ? 12 : 10);
                    const diff = Number(t.difficultyRate || 1.0);
                    const convScore = (base * (t.evaluation.score / 100) * diff) + (t.evaluation.bonusScore || 0);
                    totalConvertedScore += convScore;

                    evaluatedCount++;
                }
            } else if (isInProgress) {
                inProgressTasks++;
                // Kiểm tra nếu việc đang làm đã quá hạn
                if (t.endDate && new Date(t.endDate).getTime() < Date.now()) {
                    lateTasks++;
                }
            } else {
                todoTasks++;
                if (t.endDate && new Date(t.endDate).getTime() < Date.now()) {
                    lateTasks++;
                }
            }

            if (t.taskType === 'URGENT') urgentCount++;
            else regularCount++;

            // Phân loại vào 4 Trục trọng tâm
            if (t.focusAxis) {
                const axisStr = String(t.focusAxis).toUpperCase();
                if (axisStr.includes('TRỤC 1') || axisStr.includes('TRUC_1') || axisStr.includes('TRUC 1') || axisStr.startsWith('1') || axisStr.includes('KINH TẾ') || axisStr.includes('CHÍNH TRỊ')) {
                    focusAxisMap['TRUC_1']++;
                } else if (axisStr.includes('TRỤC 2') || axisStr.includes('TRUC_2') || axisStr.includes('TRUC 2') || axisStr.startsWith('2') || axisStr.includes('THỂ CHẾ') || axisStr.includes('PHÂN CẤP')) {
                    focusAxisMap['TRUC_2']++;
                } else if (axisStr.includes('TRỤC 3') || axisStr.includes('TRUC_3') || axisStr.includes('TRUC 3') || axisStr.startsWith('3') || axisStr.includes('KHOA HỌC') || axisStr.includes('CÔNG NGHỆ') || axisStr.includes('ĐỔI MỚI SÁNG TẠO') || axisStr.includes('CHUYỂN ĐỔI SỐ')) {
                    focusAxisMap['TRUC_3']++;
                } else if (axisStr.includes('TRỤC 4') || axisStr.includes('TRUC_4') || axisStr.includes('TRUC 4') || axisStr.startsWith('4') || axisStr.includes('HẠ TẦNG') || axisStr.includes('ĐÔ THỊ') || axisStr.includes('GIÁO DỤC')) {
                    focusAxisMap['TRUC_4']++;
                }
            }

            // Chuẩn hóa Độ khó (1.0, 1.1, 1.2)
            const rate = Number(t.difficultyRate !== undefined && t.difficultyRate !== null ? t.difficultyRate : 1.0);
            let diffKey = rate.toFixed(1);
            if (!['1.0', '1.1', '1.2'].includes(diffKey)) {
                diffKey = '1.0';
            }
            difficultyMap[diffKey] = (difficultyMap[diffKey] || 0) + 1;
        });

        const onTimeRate = completedTasks > 0 ? Math.round((onTimeTasks / completedTasks) * 100) : 100;
        const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
        const avgKpiScore = evaluatedCount > 0 ? +(totalScore / evaluatedCount).toFixed(1) : 0;
        const avgRating = evaluatedCount > 0 ? +(totalRating / evaluatedCount).toFixed(1) : 0;
        const avgConvertedScore = evaluatedCount > 0 ? +(totalConvertedScore / evaluatedCount).toFixed(1) : 0;

        // 2. TỔNG HỢP THI ĐUA KHEN THƯỞNG
        let emulationAchievements = [];
        try {
            const userFilter = [{ user: userId }];
            if (user.name) {
                userFilter.push({ fullName: new RegExp('^' + user.name.trim() + '$', 'i') });
            }

            const emQuery = { $or: userFilter };
            if (!isAll && startDate && endDate) {
                emQuery.$and = [
                    {
                        $or: [
                            { createdAt: { $gte: startDate, $lte: endDate } },
                            { decisionDate: { $gte: startDate, $lte: endDate } },
                            { schoolYear: String(year) }
                        ]
                    }
                ];
            }
            emulationAchievements = await EmulationAchievement.find(emQuery).sort({ createdAt: -1 });
        } catch (emErr) {
            console.warn('[StaffScorecard] Không lấy được thi đua:', emErr.message);
        }

        // 3. TỔNG HỢP HỌC TẬP BỒI DƯỠNG
        let trainingCourses = [];
        try {
            const trUserFilter = [{ user: userId }];
            if (user.name) {
                trUserFilter.push({ userName: new RegExp('^' + user.name.trim() + '$', 'i') });
            }

            const trQuery = { $or: trUserFilter };
            if (!isAll && startDate && endDate) {
                trQuery.$and = [
                    {
                        $or: [
                            { createdAt: { $gte: startDate, $lte: endDate } },
                            { startDate: { $gte: startDate, $lte: endDate } },
                            { endDate: { $gte: startDate, $lte: endDate } },
                            { year: String(year) }
                        ]
                    }
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

        // 5. XẾP LOẠI TỔNG THỂ (Staff Grade - Chuẩn hóa theo thực tế công tác)
        let overallGrade = "Hoàn thành nhiệm vụ";
        let gradeBadgeColor = "blue";

        if (totalTasks === 0) {
            overallGrade = "Chưa phát sinh nhiệm vụ";
            gradeBadgeColor = "default";
        } else if (completedTasks === 0) {
            if (lateTasks > 0) {
                overallGrade = "Chậm tiến độ thực hiện";
                gradeBadgeColor = "orange";
            } else {
                overallGrade = "Đang thực hiện nhiệm vụ";
                gradeBadgeColor = "blue";
            }
        } else {
            // Đã có công việc hoàn thành
            const effectiveScore = evaluatedCount > 0 ? avgKpiScore : 85;

            // Xuất sắc: Hoàn thành đúng hạn 100% (hoặc onTimeRate >= 95%), không có việc trễ hạn, điểm KPI >= 85
            if (lateTasks === 0 && onTimeRate >= 95 && effectiveScore >= 85) {
                overallGrade = "Hoàn thành xuất sắc nhiệm vụ";
                gradeBadgeColor = "gold";
            }
            // Tốt: Tỷ lệ đúng hạn >= 80%, điểm KPI >= 70, số việc trễ hạn <= 1
            else if (onTimeRate >= 80 && effectiveScore >= 70 && lateTasks <= 1) {
                overallGrade = "Hoàn thành tốt nhiệm vụ";
                gradeBadgeColor = "green";
            }
            // Không hoàn thành: Trễ hạn nhiều (onTimeRate < 60% và có từ 2 việc trễ trở lên) hoặc điểm KPI < 50
            else if ((onTimeRate < 60 && lateTasks >= 2) || (evaluatedCount > 0 && avgKpiScore < 50)) {
                overallGrade = "Không hoàn thành nhiệm vụ";
                gradeBadgeColor = "red";
            }
            // Mặc định còn lại: Hoàn thành nhiệm vụ
            else {
                overallGrade = "Hoàn thành nhiệm vụ";
                gradeBadgeColor = "blue";
            }
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
                avgConvertedScore,
                evaluatedCount,
                unEvaluatedCount: Math.max(0, completedTasks - evaluatedCount),
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
