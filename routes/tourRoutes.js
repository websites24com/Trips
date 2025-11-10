// routes/tourRoutes.js
const express = require('express');

const xssSanitize = require('xss-sanitize');
const reviewRouter = require('./reviewRoutes');
const tourController = require('../controllers/tourController');
const authController = require('../controllers/authController');

const router = express.Router();

//nested routes. They are redirected to reviewRoutes
router.use('/:tourId/reviews', reviewRouter);

// Top 5 cheap tours — no params
router
  .route('/top-5-cheap')
  .get(tourController.aliasTopTours, tourController.getAllTours);

// Tour stats — no params
router.route('/tour-stats').get(tourController.getTourStats);

// Monthly plan — sanitize :year param
router
  .route('/monthly-plan/:year')
  .get(
    xssSanitize.paramSanitize(),
    authController.protect,
    authController.restrictTo('admin', 'lead-guide', 'guides'),
    tourController.getMonthlyPlan,
  );

router
  .route('/tours-within/:distance/center/:latlng/unit/:unit')
  .get(tourController.getToursWithin);

router.route('/distances/:latlng/unit/:unit').get(tourController.getDistances);

// All tours — no params for GET, POST
router
  .route('/')
  .get(tourController.getAllTours)
  .post(
    authController.protect,
    authController.restrictTo('admin', 'lead-guide'),
    tourController.createTour,
  );

// Routes with :id param — sanitize params
router
  .route('/:id')
  .get(xssSanitize.paramSanitize(), tourController.getTour)
  .patch(
    xssSanitize.paramSanitize(),
    authController.protect,
    authController.restrictTo('admin', 'lead-guide'),
    tourController.updateTour,
  )
  .delete(
    authController.protect,
    authController.restrictTo('admin', 'leader-guide'),

    xssSanitize.paramSanitize(),
    tourController.deleteTour,
  );

module.exports = router;
