// routes/userRoutes.js
const express = require('express');

const xssSanitize = require('xss-sanitize');
const userController = require('../controllers/userController');
const authController = require('../controllers/authController');

const router = express.Router();

// Authentication (no params here)
router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.get('/logout', authController.logout);
router.post('/forgotPassword', authController.forgotPassword);

// sanitize the token param
router.patch(
  '/resetPassword/:token',

  xssSanitize.paramSanitize(),
  authController.resetPassword,
);

// it protects all routes below
router.use(authController.protect);

router.patch('/updateMyPassword', authController.updatePassword);

router.get('/me', userController.getMe, userController.getUser);
router.patch(
  '/updateMe',
  userController.uploadUserPhoto,
  userController.resizeUserPhoto,
  userController.updateMe,
);
router.delete('/deleteMe', userController.deleteMe);

router.use(authController.restrictTo('admin'));

// Routes that use :id — sanitize params for these
router
  .route('/')
  .get(userController.getAllUsers)
  .post(userController.createUser);

router
  .route('/:id')
  .get(xssSanitize.paramSanitize(), userController.getUser)
  .patch(xssSanitize.paramSanitize(), userController.updateUser)
  .delete(xssSanitize.paramSanitize(), userController.deleteUser);

module.exports = router;
