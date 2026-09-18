const express = require('express');
const router = express.Router();
const recurringTaskController = require('../controller/recurringTask.Controller');
const upload = require('../middleware/multer');
const { verifyToken } = require('../middleware/authMiddleware');

router.get('/', verifyToken, recurringTaskController.getRecurringTasks);
router.post('/', verifyToken, upload.array('files', 10), recurringTaskController.createRecurringTask);
router.get('/:id', verifyToken, recurringTaskController.getRecurringTaskById);
router.put('/:id', verifyToken, upload.array('files', 10), recurringTaskController.updateRecurringTask);
router.delete('/:id', verifyToken, recurringTaskController.deleteRecurringTask);
router.patch('/:id/toggle', verifyToken, recurringTaskController.toggleRecurringTask);
router.post('/:id/run-now', verifyToken, recurringTaskController.runRecurringTaskNow);

module.exports = router;
