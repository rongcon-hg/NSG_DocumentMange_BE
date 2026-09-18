const { getStaffScorecardData, exportStaffScorecardToExcel } = require('../service/staffScorecard.service');

// Lấy dữ liệu Hồ sơ Đóng góp Số của cán bộ
const getScorecard = async (req, res) => {
    try {
        const currentUserId = req.user?._id || req.user?.id;
        const targetUserId = req.query.userId || currentUserId;

        if (!targetUserId) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin cán bộ cần xem hồ sơ' });
        }

        const year = req.query.year;
        const fromDate = req.query.fromDate;
        const toDate = req.query.toDate;

        const scorecard = await getStaffScorecardData({
            userId: targetUserId,
            year,
            fromDate,
            toDate
        });

        res.status(200).json({
            success: true,
            data: scorecard
        });
    } catch (error) {
        console.error('Error fetching staff scorecard:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi máy chủ khi lấy hồ sơ đóng góp số'
        });
    }
};

// Xuất file Excel Báo cáo Hồ sơ Đóng góp Cán bộ Năm học
const exportScorecardExcel = async (req, res) => {
    try {
        const currentUserId = req.user?._id || req.user?.id;
        const targetUserId = req.query.userId || currentUserId;

        if (!targetUserId) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin cán bộ' });
        }

        const year = req.query.year;
        const fromDate = req.query.fromDate;
        const toDate = req.query.toDate;

        const scorecard = await getStaffScorecardData({
            userId: targetUserId,
            year,
            fromDate,
            toDate
        });

        const buffer = await exportStaffScorecardToExcel(scorecard);

        const safeName = (scorecard.user.name || 'Can_bo')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D')
            .replace(/[^a-zA-Z0-9]/g, '_');

        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="Ho_So_Danh_Gia_${safeName}.xlsx"`
        );

        res.send(buffer);
    } catch (error) {
        console.error('Error exporting staff scorecard to excel:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi xuất file Excel'
        });
    }
};

module.exports = {
    getScorecard,
    exportScorecardExcel
};
