const slugify = require('slugify');

const validator = require('validator');

const mongoose = require('mongoose');

const Tour = require('./tourModel');

const { Schema } = mongoose;

// review / rating / createdAt / ref to tour / ref to user
// we apply here PARENT referncing as we can have tons of reviews ;)

const reviewSchema = new Schema(
  {
    review: {
      type: String,
      required: [true, 'Review cannot be empty!'],
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
    createAt: {
      type: Date,
      default: Date.now,
    },
    tour: {
      type: Schema.Types.ObjectId,
      ref: 'Tour',
      required: [true, 'Review must belong to a tour'],
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Review must belong to a user'],
    },
  },
  // Make virtual fields (calculated, not stored in DB) appear when converting document to JSON or plain object
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

reviewSchema.index({ tour: 1, user: 1 }, { unique: true });

// it works with all Mongoose methods find....
reviewSchema.pre(/^find/, function (next) {
  this.populate({
    path: 'user',
    select: 'name photo',
  });
  next();
});

reviewSchema.statics.calcAverageRatings = async function (tourId) {
  const stats = await this.aggregate([
    { $match: { tour: tourId } },
    {
      $group: {
        _id: '$tour',
        nRating: { $sum: 1 },
        avgRating: { $avg: '$rating' },
      },
    },
  ]);

  if (!stats.length) {
    await Tour.findByIdAndUpdate(tourId, {
      ratingsQuantity: 0,
      ratingsAverage: 4.5,
    });
    return;
  }

  await Tour.findByIdAndUpdate(tourId, {
    ratingsQuantity: stats[0].nRating,
    ratingsAverage: stats[0].avgRating,
  });
};

reviewSchema.post('save', function () {
  // this point to current review
  this.constructor.calcAverageRatings(this.tour);
});

// ✅ Safe: capture the document BEFORE update/delete
reviewSchema.pre(/^findOneAnd/, async function (next) {
  this.oldReview = await this.model.findOne(this.getQuery());
  next();
});

// ✅ After update/delete: recalc tour averages using the old review’s tour
reviewSchema.post(/^findOneAnd/, async function () {
  if (this.oldReview) {
    await this.oldReview.constructor.calcAverageRatings(this.oldReview.tour);
  }
});

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;
