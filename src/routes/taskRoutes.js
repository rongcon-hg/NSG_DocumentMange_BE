const express = require('express');
const router = express.Router();
const taskController = require('../controller/task.Controller');
const upload = require('../middleware/multer');
const { verifyToken } = require('../middleware/authMiddleware');

router.post('/', verifyToken, upload.array('files', 10), taskController.createTask);
router.get('/', verifyToken, taskController.getTasks);
router.get('/kpi/stats', verifyToken, taskController.getKpiStats);
router.put('/:taskId', verifyToken, upload.array('files', 10), taskController.updateTask);
router.patch('/:taskId/evaluate', verifyToken, taskController.evaluateTask);
router.delete('/:taskId', verifyToken, taskController.deleteTask);

// Routes quản lý công việc con (Subtasks)
router.post('/:taskId/subtasks', verifyToken, taskController.addSubtask);
router.put('/:taskId/subtasks/:subtaskId', verifyToken, taskController.updateSubtask);
router.delete('/:taskId/subtasks/:subtaskId', verifyToken, taskController.deleteSubtask);

module.exports = router;
