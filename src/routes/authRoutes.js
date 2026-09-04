const express = require('express');
const router = express.Router();
const authController = require('../controller/auth.Controller');
const {verifyAdmin,verifyManager,verifyToken} = require('../middleware/authMiddleware');
const upload = require('../middleware/multer');

// Avatar routes
router.post('/avatar', verifyToken, upload.single('avatar'), authController.uploadAvatar);
router.get('/avatar/:fileId', authController.getAvatarImage);
router.delete('/avatar', verifyToken, authController.deleteAvatar);

router.post('/createUser',verifyManager,authController.createUser)
router.post('/signin',authController.signin)
router.post('/reqResetPass',authController.reqResetPass)
router.post('/verifyCode',authController.verrifyCode)
router.post('/resetPassword',authController.resetPassword)
router.get('/users',verifyToken,authController.getAllUser)
router.get('/:userId',verifyToken,authController.getUserInfo)
router.post('/update/:userId',verifyToken,authController.upadteInfo)
router.put('/disableUser/:userId',verifyManager,authController.disableUser)
router.put('/restore/:userId',verifyManager,authController.restoreUser)
router.delete('/delete/:userId',verifyManager,authController.deleteUser)
module.exports = router