const express = require('express');
const router = express.Router();
const { executeTaskReminders, executeAutoBackup } = require('../service/TaskCron.service');
const { executeRecurringTasksGeneration } = require('../service/recurringTask.service');
const { executeQuarterlyPlanReminders } = require('../service/quarterlyPlanCron.service');

// Middleware xác thực Cron: Chấp nhận header Authorization (CRON_SECRET hoặc Vercel Cron header) hoặc Admin token
const verifyCronSecret = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  // Nếu hệ thống có cấu hình CRON_SECRET, kiểm tra Secret
  if (cronSecret) {
    if (authHeader === `Bearer ${cronSecret}` || req.headers['x-cron-secret'] === cronSecret) {
      return next();
    }
  }

  // Chấp nhận request từ Vercel Cron nếu chạy trên hạ tầng Vercel
  if (req.headers['user-agent']?.includes('vercel-cron')) {
    return next();
  }

  // Hoặc chấp nhận từ localhost/internal VPS
  const clientIp = req.ip || req.connection.remoteAddress || '';
  if (clientIp.includes('127.0.0.1') || clientIp === '::1' || clientIp.includes('localhost')) {
    return next();
  }

  return res.status(401).json({ success: false, message: "Unauthorized cron request" });
};

// API endpoint cho Vercel Cron
// GET /api/cron/reminders
router.get('/reminders', verifyCronSecret, async (req, res) => {
  try {
    await executeTaskReminders();
    await executeQuarterlyPlanReminders();
    await executeAutoBackup();
    await executeRecurringTasksGeneration();
    return res.status(200).json({ success: true, message: 'Cron jobs executed successfully' });
  } catch (error) {
    console.error('Error executing cron reminder:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Endpoint riêng để kích hoạt quét công việc định kỳ
// GET /api/cron/recurring-tasks
router.get('/recurring-tasks', verifyCronSecret, async (req, res) => {
  try {
    const count = await executeRecurringTasksGeneration();
    return res.status(200).json({ success: true, message: `Recurring tasks executed successfully. Generated: ${count}` });
  } catch (error) {
    console.error('Error executing recurring tasks cron:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

module.exports = router;
