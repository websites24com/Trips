// controllers/tourController.js

// Import Node & app utilities
const fs = require('fs'); // classic fs (used only for existence checks fallback)
const fsp = require('fs/promises'); // promise-based fs for non-blocking deletes/writes
const path = require('path'); // safe path joins
const multer = require('multer'); // multipart/form-data parsing
const sharp = require('sharp'); // image processing
const Tour = require('../models/tourModel'); // Mongoose model
const AppError = require('../utils/appError'); // custom HTTP error
const catchAsync = require('../utils/catchAsync'); // async error wrapper
const factory = require('./handleFactory'); // generic CRUD factory (kept for other handlers)

// -----------------------------
// Configuration for Multer (kept the same fields & behavior)
// -----------------------------

// Store uploads in memory so Sharp can read buffers directly (fast & avoids temp files)
const multerStorage = multer.memoryStorage();

// Only allow images based on MIME type; otherwise reject with 400
const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) cb(null, true);
  else cb(new AppError('Not an image! Please upload only images.', 400), false);
};

// Create the Multer instance with our memory storage + filter
const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter,
});

// Expect a single cover image (imageCover) and up to 3 additional images (images)
// ⚠️ Field names unchanged to avoid breaking other code.
exports.uploadTourImages = upload.fields([
  { name: 'imageCover', maxCount: 1 },
  { name: 'images', maxCount: 3 },
]);

// -----------------------------
// Helper paths & safe file utilities
// -----------------------------

// Absolute base folder where tour images live (kept original relative folder)
const TOURS_DIR = path.join(process.cwd(), 'public', 'img', 'tours');

// Resolve a filename to a safe absolute path under TOURS_DIR.
// This prevents path traversal and accidentally deleting other folders.
const safeJoinInTours = (filename) =>
  path.join(TOURS_DIR, path.basename(filename || ''));

// Check if a file exists (non-throwing). Uses fs.promises.access.
const fileExists = async (fullPath) => {
  try {
    await fsp.access(fullPath);
    return true;
  } catch {
    return false;
  }
};

// Delete a file if it exists. Never throws: errors are swallowed after logging.
// We return a small result object for diagnostics.
const safeUnlink = async (fullPath) => {
  try {
    // Skip empty names or directories
    if (!fullPath) return { ok: true, skipped: true };
    const exists = await fileExists(fullPath);
    if (!exists) return { ok: true, skipped: true };
    await fsp.unlink(fullPath);
    return { ok: true };
  } catch (err) {
    // Log but don't fail the request — non-blocking and resilient
    console.error('[unlink failed]', fullPath, err.message);
    return { ok: false, error: err.message };
  }
};

// -----------------------------
// Image processing middleware
// -----------------------------
//
// Purpose:
// 1) If new files are uploaded, process them with Sharp and save with unique names.
// 2) Put the new names into req.body so the *next* middleware (updateTour) updates the DB.
// 3) We do NOT delete here; we delete old files only after DB update succeeds.
//
// Why this order?
// - We first ensure the new files are written successfully.
// - Then we update the DB atomically with those names.
// - Only after a successful DB update do we delete old files.
//   (So we never end up with "no images" if something fails in the middle.)
//
exports.resizeTourImages = catchAsync(async (req, _res, next) => {
  // If no files provided, just move on — nothing to do here
  if (!req.files || (!req.files.imageCover && !req.files.images)) return next();

  // Prepare arrays to collect new filenames we’ll set on req.body
  // (Keeping the same fields so later factory/update code keeps working)
  const newBody = {};

  // A timestamp to help uniqueness; combined with index to avoid collisions
  const now = Date.now();

  // 1) Handle the cover image if present
  if (req.files.imageCover && req.files.imageCover[0]) {
    // Build a deterministic filename: tour-<id>-<timestamp>-cover.jpeg
    const coverName = `tour-${req.params.id}-${now}-cover.jpeg`;

    // Process with Sharp: resize, convert to JPEG, set quality, write to disk
    await sharp(req.files.imageCover[0].buffer)
      .resize(2000, 1333) // keep your original aspect/size
      .toFormat('jpeg')
      .jpeg({ quality: 90 })
      .toFile(path.join(TOURS_DIR, coverName));

    // Put the new filename into the body so updateTour writes it to DB
    newBody.imageCover = coverName;
  }

  // 2) Handle the gallery images if present
  if (req.files.images && req.files.images.length) {
    // We’ll build a fresh array of image names. Replaces old array entirely.
    newBody.images = [];

    // Process all images in parallel — non-blocking & scalable under load
    await Promise.all(
      req.files.images.map(async (file, i) => {
        // Unique filename per image: tour-<id>-<timestamp>-<index>.jpeg
        const filename = `tour-${req.params.id}-${now}-${i + 1}.jpeg`;

        // Sharp pipeline: resize/convert/write
        await sharp(file.buffer)
          .resize(2000, 1333)
          .toFormat('jpeg')
          .jpeg({ quality: 90 })
          .toFile(path.join(TOURS_DIR, filename));

        // Push into the array that will overwrite the DB field
        newBody.images.push(filename);
      }),
    );
  }

  // Merge the new image fields into req.body while preserving any other fields user sent
  // This way, the subsequent update handler can update everything in one DB call.
  req.body = { ...req.body, ...newBody };

  // Continue to the next middleware (which performs the DB update + cleanup)
  next();
});

// -----------------------------
// CRUD & aliasing routes (kept as-is where possible)
// -----------------------------

// Pre-fill query for "Top 5 tours" endpoint; unchanged
exports.aliasTopTours = (req, _res, next) => {
  const merged = {
    ...req.query,
    limit: '5',
    sort: '-ratingsAverage,price',
    fields: 'name,price,ratingsAverage,difficulty',
  };

  // Define req.query as a normal, writable prop to avoid mutation issues
  Object.defineProperty(req, 'query', {
    value: merged,
    writable: true,
    enumerable: true,
    configurable: true,
  });

  next();
};

// Get all tours — uses generic factory, unchanged
exports.getAllTours = factory.getAll(Tour);

// Get single tour with reviews populated — unchanged
exports.getTour = factory.getOne(Tour, { path: 'reviews' });

// -----------------------------
// Update with safe replacement of old images
// -----------------------------
//
// We replace factory.updateOne(Tour) with a custom implementation that:
// 1) Reads the *current* filenames from the DB.
// 2) Applies requested updates (including any new image names produced earlier).
// 3) After the DB update succeeds, deletes the *old* files on disk that were replaced.
// 4) Responds with the updated document.
//
// Fields & response format remain consistent with your previous code.
//
exports.updateTour = catchAsync(async (req, res, next) => {
  // 1) Load the current document so we know which files to delete later
  const before = await Tour.findById(req.params.id).select('imageCover images');
  if (!before) return next(new AppError('No tour found with that ID', 404));

  // 2) Perform the update (this writes the new filenames that resizeTourImages put in req.body)
  //    - new: true  -> return the updated document
  //    - runValidators: true -> keep Mongoose validation
  const updated = await Tour.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  // If for some reason it disappeared between steps (very rare), guard again
  if (!updated) return next(new AppError('Failed to update the tour', 500));

  // 3) Decide what to delete:
  //    - If a *new* cover was uploaded (req.body.imageCover is set),
  //      delete the *old* cover (before.imageCover).
  //    - If *new* gallery images were uploaded (req.body.images exists),
  //      delete the *old* gallery array entirely (before.images).
  //
  // Rationale: Your requirement says "whenever user upload a new file to given path
  // the old pic must be deleted ... and replaced by new one".
  // So we fully replace the old set with the new set when present.
  const toDelete = [];

  if (Object.prototype.hasOwnProperty.call(req.body, 'imageCover')) {
    if (before.imageCover && before.imageCover !== updated.imageCover) {
      toDelete.push(safeJoinInTours(before.imageCover));
    }
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'images')) {
    if (Array.isArray(before.images) && before.images.length) {
      // Delete every old gallery image; new array is already saved in DB
      for (const oldName of before.images) {
        if (oldName && !updated.images.includes(oldName)) {
          // Only delete names that actually changed (extra safety)
          toDelete.push(safeJoinInTours(oldName));
        }
      }
    }
  }

  // 4) Delete old files on disk, non-blocking & resilient
  //    - We use Promise.allSettled so a single failure doesn’t crash the whole request.
  //    - We *await* here to ensure cleanup completes before responding,
  //      keeping the system tidy without background workers.
  if (toDelete.length) {
    await Promise.allSettled(toDelete.map((absPath) => safeUnlink(absPath)));
  }

  // 5) Respond with the updated document (same response shape as factory.updateOne)
  res.status(200).json({
    status: 'success',
    data: {
      data: updated,
    },
  });
});

// Delete one tour — unchanged
exports.deleteTour = factory.deleteOne(Tour);

// Create a new tour — unchanged
exports.createTour = factory.createOne(Tour);

// -----------------------------
// Stats & Plans (unchanged)
// -----------------------------
exports.getTourStats = catchAsync(async (req, res, next) => {
  const stats = await Tour.aggregate([
    { $match: { ratingsAverage: { $gte: 4.5 } } },
    {
      $group: {
        _id: { $toUpper: '$difficulty' },
        numTours: { $sum: 1 },
        numRatings: { $sum: '$ratingsQuantity' },
        avgRating: { $avg: '$ratingsAverage' },
        avgPrice: { $avg: '$price' },
        minPrice: { $min: '$price' },
        maxPrice: { $max: '$price' },
      },
    },
    { $sort: { avgPrice: 1 } },
  ]);
  res.status(200).json({
    status: 'success',
    data: { stats },
  });
});

exports.getMonthlyPlan = async (req, res, next) => {
  // sanitize and coerce year param
  const year = req.params.year * 1;

  const plan = await Tour.aggregate([
    { $unwind: '$startDates' },
    {
      $match: {
        startDates: {
          $gte: new Date(`${year}-01-01`),
          $lte: new Date(`${year}-12-31`),
        },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: '%B', date: '$startDates' } },
        numTourStarts: { $sum: 1 },
        tours: { $push: '$name' },
      },
    },
    { $addFields: { month: '$_id' } },
    { $project: { _id: 0 } },
    { $sort: { numTourStarts: -1 } },
    { $limit: 9 },
  ]);

  res.status(200).json({
    status: 'success',
    data: { plan },
  });
};

// -----------------------------
// Geo queries (unchanged)
// -----------------------------
exports.getToursWithin = catchAsync(async (req, res, next) => {
  const { distance, latlng, unit } = req.params;
  const [lat, lng] = latlng.split(',');

  const radius = unit === 'mi' ? distance / 3963.2 : distance / 6378.1;

  if (!lat || !lng) {
    return next(
      new AppError(
        'Please provide latitude and longitude in the format lat, lng.',
        400,
      ),
    );
  }

  const tours = await Tour.find({
    startLocation: { $geoWithin: { $centerSphere: [[lng, lat], radius] } },
  });

  res.status(200).json({
    status: 'success',
    results: tours.length,
    data: tours,
  });
});

exports.getDistances = catchAsync(async (req, res, next) => {
  const { latlng, unit } = req.params;
  const [lat, lng] = latlng.split(',');

  const multiplier = unit === 'mi' ? 0.000621371 : 0.001;

  if (!lat || !lng) {
    return next(
      new AppError(
        'Please provide latitude and longitude in the format lat, lng.',
        400,
      ),
    );
  }

  const distances = await Tour.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [lng * 1, lat * 1] },
        distanceField: 'distance',
        distanceMultiplier: multiplier,
      },
    },
    { $project: { distance: 1, name: 1 } },
  ]);

  res.status(200).json({
    status: 'success',
    data: distances,
  });
});
