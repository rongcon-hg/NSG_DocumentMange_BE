const express = require('express');
const router = express.Router();
const { executeTaskReminders, executeAutoBackup } = require('../service/TaskCron.service');

// API endpoint cho Vercel Cron
// GET /api/cron/reminders
router.get('/reminders', async (req, res) => {
  try {
    await executeTaskReminders();
    await executeAutoBackup();
    return res.status(200).json({ success: true, message: 'Cron job executed successfully' });
  } catch (error) {
    console.error('Error executing cron reminder:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

module.exports = router;
