const express = require('express');
const router = express.Router();
const { executeTaskReminders, executeAutoBackup } = require('../service/TaskCron.service');
const { executeRecurringTasksGeneration } = require('../service/recurringTask.service');

// API endpoint cho Vercel Cron
// GET /api/cron/reminders
router.get('/reminders', async (req, res) => {
  try {
    await executeTaskReminders();
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
router.get('/recurring-tasks', async (req, res) => {
  try {
    const count = await executeRecurringTasksGeneration();
    return res.status(200).json({ success: true, message: `Recurring tasks executed successfully. Generated: ${count}` });
  } catch (error) {
    console.error('Error executing recurring tasks cron:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

module.exports = router;
