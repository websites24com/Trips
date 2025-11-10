const crypto = require('crypto');

const slugify = require('slugify');

const bcrypt = require('bcrypt');

const validator = require('validator');

const mongoose = require('mongoose');
const { default: isEmail } = require('validator/lib/isEmail');

const { Schema } = mongoose;

const userSchema = new Schema({
  name: {
    type: String,
    required: [true, 'Please tell us your name'],
  },
  slug: String,
  email: {
    type: String,
    required: [true, 'Please provide your email'],
    unique: true,
    lowercase: true,
    validate: [validator.isEmail, 'Please provide valid email'],
  },
  photo: {
    type: String,
    default: 'default.jpg',
  },
  role: {
    type: String,
    enum: ['user', 'guide', 'lead-guide', 'admin'],
    default: 'user',
  },

  password: {
    type: String,
    required: [true, 'Please provide password'],
    minlength: 8,
    // never visible to any output
    select: false,
  },
  passwordConfirm: {
    type: String,
    required: [true, 'Please confirm your password'],
    validate: {
      // This only works on save() or create()
      validator: function (el) {
        return el === this.password;
      },
      message: 'Passwords does not match, try again!',
    },
  },

  passwordChangedAt: { type: Date, select: false },
  passwordResetToken: String,
  passwordResetExpires: Date,
  active: {
    type: Boolean,
    default: true,
    select: false,
  },
});

userSchema.pre('save', function (next) {
  if (!this.isModified('password') || this.isNew) return next();
  this.passwordChangedAt = Date.now() - 1000;
  next();
});

// Middlewares

userSchema.pre('save', async function (next) {
  // Pnly run this function if password was actually modified
  if (!this.isModified('password')) return next();
  // Hash the password with cost of 12
  this.password = await bcrypt.hash(this.password, 12);
  // Delete passwordConfirm field ( input )
  this.passwordConfirm = undefined;
  next();
});

// Methods to deleteMe

userSchema.pre(/^find/, function (next) {
  this.find({ active: { $ne: false } });
  next();
});

// Methods to password

userSchema.methods.correctPassword = async function (
  candidatePassword,
  userPassword,
) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

// <<< ADD THIS METHOD BELOW EXISTING METHODS >>>
userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10,
    );
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  this.passwordResetExpires = Date.now() + 30 * 60 * 1000;

  console.log('Reset Token', { resetToken }, this.passwordResetToken);

  return resetToken;
};

const User = mongoose.model('User', userSchema);

module.exports = User;
