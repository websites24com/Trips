const express = require('express');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const path = require('path');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const qs = require('qs');
const hpp = require('hpp');
const xssSanitize = require('xss-sanitize');
const AppError = require('./utils/appError');
const globalErrorHandler = require('./controllers/errorController');
const tourRouter = require('./routes/tourRoutes');
const userRouter = require('./routes/userRoutes');
const reviewRouter = require('./routes/reviewRoutes');
const viewRouter = require('./routes/viewRoutes');
const bookingRouter = require('./routes/bookingRoutes');
const bookingController = require('./controllers/bookingController');
const cors = require('cors');

// Creating exprersss app
const app = express();

// Template engine

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// Implement CORS

app.use(cors);
app.options('*', cors());

// Serving static files
app.use(express.static(path.join(__dirname, 'public')));

// Set Security HTTP headers

// --------------------
// 🔒 HELMET CONFIG
// --------------------
const commonDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: [
    "'self'",
    'https://api.mapbox.com',
    'https://cdn.jsdelivr.net',
    'https://cdnjs.cloudflare.com',
    'https://js.stripe.com',
  ],
  styleSrc: [
    "'self'",
    'https:',
    "'unsafe-inline'", // Mapbox GL CSS needs inline styles
    'https://api.stripe.com',
  ],
  connectSrc: ["'self'", 'https://api.mapbox.com', 'https://events.mapbox.com'],
  imgSrc: [
    "'self'",
    'data:',
    'blob:',
    'https://api.mapbox.com',
    'https://*.tiles.mapbox.com',
    'https://js.stripe.com',
  ],
  frameSrc: [
    "'self'",
    'https://js.stripe.com', // 👈 for Stripe-hosted iframes/checkout
  ],
  workerSrc: ["'self'", 'blob:'],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  frameAncestors: ["'self'"],
};

// ✅ Development: allows Parcel HMR and source maps
if (process.env.NODE_ENV === 'development') {
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          ...commonDirectives,
          scriptSrc: [...commonDirectives.scriptSrc, "'unsafe-eval'"],
          connectSrc: [...commonDirectives.connectSrc, 'ws://localhost:1234'],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
} else {
  // ✅ Production: strict CSP, no unsafe-eval or websocket
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: commonDirectives,
      },
    }),
  );
}
// Development logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Limiter -> limit request from same IP

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes).
  message: 'Too many request from this IP, please try again in an hour',
});

// Apply the rate limiting middleware to all requests.
app.use('/api/', limiter);

// Stripe Webhooks - it must be above body parser as we need STRING  not the JSON

app.post(
  '/webhook-checkout',
  express.raw({ type: 'application/json' }),
  bookingController.webhookCheckout,
);

// qs allows you to create nested objects within your query strings, by surrounding the name of sub-keys with square brackets []. eg. [gte]=5
app.set('query parser', (str) =>
  qs.parse(str, {
    /* custom options */
  }),
);

// Body parser, reading data from body into req.body
app.use(express.json());

// ✅ parses form posts & FormData
app.use(express.urlencoded({ extended: true }));

// Reading data from cookies

app.use(cookieParser());

// Data sanitization against NoSQL query incjection

// Data sanitization

app.use(xssSanitize());

// Express middleware to protect against HTTP Parameter Pollution attacks
app.use(
  hpp({
    whitelist: [
      'duration',
      'ratingsQuantity',
      'ratingsAverage',
      'maxGroupSize',
      'difficulty',
    ],
  }),
);

// Test middleware

app.use((req, res, next) => {
  req.requestTime = new Date().toISOString();
  // console.log(req.cookies);
  next();
});

// Compression

app.use(compression());

// Users routes
app.use('/api/v1/users', userRouter);

// Tours routes
app.use('/api/v1/tours', tourRouter);

// Review routes
app.use('/api/v1/reviews', reviewRouter);

// Booking routes
app.use('/api/v1/bookings', bookingRouter);

// Rendering routes (views) should always be last
app.use('/', viewRouter);

// all stands for all HTTP methods /{*splat} means any route
// if nothing has been reached before, we run below middleware!
app.all('/{*splat}', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on tis server!`), 404);
});

app.use(globalErrorHandler);

module.exports = app;
