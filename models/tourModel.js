const slugify = require('slugify');

const validator = require('validator');

const mongoose = require('mongoose');

const { Schema } = mongoose;

const tourSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Tour must have a name'],
      unique: true,
      trim: true,
      maxlength: [40, 'A tour must have not more than 40 characters'],
      minlength: [10, 'A tour must have at least 10 characters'],
      // validate: [
      //   validator.isAlpha,
      //   'The tour name must only contain characters',
      // ],
    },
    slug: String,
    duration: {
      type: Number,
      required: [true, ' A tour must have a duration'],
    },
    maxGroupSize: {
      type: Number,
      required: [true, 'A tour must have a group size'],
    },
    difficulty: {
      type: String,
      required: [true, 'A tour must have a difficulty level'],
      trim: true,
      enum: {
        values: ['easy', 'medium', 'difficult'],
        message: 'Difficulty can be: easy, medium, or difficult.',
      },
    },
    ratingsAverage: {
      type: Number,
      default: 4.5,
      min: [1, 'Rating must be above 1.0'],
      max: [5, 'Rating must be equal or less than 5.0'],
      set: (val) => Math.round(val * 10) / 10, // 4.666666, 46.66666, 47, 4.7
    },
    ratingsQuantity: {
      type: Number,
      default: 0,
    },
    price: {
      type: Number,
      required: [true, 'A tour must have a price'],
    },
    priceDiscount: {
      type: Number,
      validate: {
        validator: function (val) {
          return val < this.price;
        },
        message: 'The discount must be smaller than price',
      },
    },
    summary: {
      type: String,
      required: [true, 'A summary is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'A summary is required'],
      trim: true,
    },
    imageCover: {
      type: String,
      required: [true, 'An image is required'],
    },
    images: [String],

    createdAt: {
      type: Date,
      default: Date.now(),
      // we hide the output to the client
      select: false,
    },
    startDates: [Date],
    secretTour: {
      type: Boolean,
      default: false,
    },

    startLocation: {
      // GeoJSON
      type: {
        type: String,
        default: 'Point',
        enum: ['Point'],
      },
      coordinates: [Number],
      // required: true,
      address: String,
      description: String,
    },
    locations: [
      {
        type: {
          type: String,
          default: 'Point',
          enum: ['Point'],
        },
        coordinates: [Number],
        // required: true,
        address: String,
        description: String,
        day: Number,
      },
    ],
    guides: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// tourSchema.index({ price: 1 });
tourSchema.index({ price: 1, ratingsAverage: -1 });
tourSchema.index({ slug: 1 });
tourSchema.index({ 'startLocation.coordinates': '2dsphere' });

// We must add here normal function because arrow function doesn't have access to THIS
// we cannot use virtual in queries because they do not form part of DATA in DB
tourSchema.virtual('durationWeeks').get(function () {
  return this.duration / 7;
});

tourSchema.virtual('reviews', {
  ref: 'Review',
  foreignField: 'tour', // it is called like that in reviewModel
  localField: '_id',
});

// DOCUMENT MIDDLEWARE: runs before .save() and .create()
tourSchema.pre('save', function (next) {
  this.slug = slugify(this.name, { lower: true });
  next();
});

tourSchema.pre(/^find/, function (next) {
  this.populate({
    path: 'guides',
    select: '-__v -passwordChangedAt',
  });
  next();
});

// QUERY MIDDLEWARE

// Regular expression applies to all which starts find
tourSchema.pre(/^find/, function (next) {
  this.find({ secretTour: { $ne: true } });
  this.start = Date.now();
  next();
});

tourSchema.pre('aggregate', function (next) {
  // Hide secret tours if geoNear is NOT used
  if (!(this.pipeline().length > 0 && '$geoNear' in this.pipeline()[0])) {
    this.pipeline().unshift({
      $match: { secretTour: { $ne: true } },
    });
  }
  next();
});

tourSchema.post(/^find/, function (docs, next) {
  console.log(`Query took ${Date.now() - this.start} milliseconds!`);
  // console.log(docs);
  next();
});

const Tour = mongoose.model('Tour', tourSchema);

module.exports = Tour;
