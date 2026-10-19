const express = require('express');
const router = express.Router();
const departmentController = require('../controller/department.Controller')
const {verifyManager,verifyToken} = require('../middleware/authMiddleware');

router.post('/create',verifyManager,departmentController.createDepartment)
router.get('/getAll',verifyToken,departmentController.getAllDepartment)
router.post('/delete',verifyManager,departmentController.deleteDepartment)
router.post('/update',verifyManager,departmentController.updateDepartment)
router.post('/toggle-status',verifyManager,departmentController.toggleDepartmentStatus)
router.get('/:departmentId',verifyManager,departmentController.getUsersByDepartment)
module.exports = router