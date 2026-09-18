const express = require('express');
const router = express.Router();
const recurringTaskController = require('../controller/recurringTask.Controller');
const { verifyToken } = require('../middleware/authMiddleware');

router.get('/', verifyToken, recurringTaskController.getRecurringTasks);
router.post('/', verifyToken, recurringTaskController.createRecurringTask);
router.get('/:id', verifyToken, recurringTaskController.getRecurringTaskById);
router.put('/:id', verifyToken, recurringTaskController.updateRecurringTask);
router.delete('/:id', verifyToken, recurringTaskController.deleteRecurringTask);
router.patch('/:id/toggle', verifyToken, recurringTaskController.toggleRecurringTask);
router.post('/:id/run-now', verifyToken, recurringTaskController.runRecurringTaskNow);

module.exports = router;
