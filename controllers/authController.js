const { promisify } = require('util');

const crypto = require('crypto');

const jwt = require('jsonwebtoken');

const User = require('../models/userModel');

const AppError = require('../utils/appError');

const catchAsync = require('../utils/catchAsync');

const sendEmail = require('../utils/email');

//Here, because there’s no { } block, the value of jwt.sign(...) is automatically returned — that’s called an implicit return.

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);

  const cookieOptions = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000,
    ),

    httpOnly: true,
  };

  if (process.env.NODE_ENV === 'production') cookieOptions.secure = true;
  res.cookie('jwt', token, cookieOptions);

  user.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user,
    },
  });
};

exports.signup = catchAsync(async (req, res, next) => {
  const { name, email, password, passwordConfirm, role, photo } = req.body;
  const newUser = await User.create({
    name,
    email,
    password,
    passwordConfirm,
    photo,
    role,
  });

  // jwt.sign(payload, secretOrPrivateKey, [options, callback])

  createSendToken(newUser, 201, res);
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  // 1) Check if email and password exist
  if (!email || !password) {
    return next(new AppError('Please provide email and password', 400));
  }

  // 2) Check if user exists && password is correct

  const user = await User.findOne({ email: email }).select('+password');

  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError('Incorrect email or password', 401));
  }

  // 3) if above is true, send token to client
  createSendToken(user, 200, res);
});

exports.protect = catchAsync(async (req, res, next) => {
  // 1) Get token and check it
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }
  if (!token) {
    return next(new AppError('You are not logged in! Please log in.', 401));
  }

  // 2) Verify token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  console.log(decoded);

  // 3) Check if user still exists
  const currentUser = await User.findById(decoded.id).select(
    '+passwordChangedAt',
  );
  if (!currentUser)
    return next(
      new AppError('The user belonging to this token no longer exists.', 401),
    );

  // 4) Check if user changed password after token was issued
  if (currentUser.changedPasswordAfter(decoded.iat)) {
    // NEW
    return next(
      new AppError('Password was changed. Please log in again.', 401),
    ); // NEW
  }

  // 5) Grant access
  req.user = currentUser; // NEW
  res.locals.user = currentUser;
  next();
});

// Only for rendered pages

exports.logout = (req, res) => {
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });
  res.status(200).json({ status: 'success' });
};

exports.isLoggedIn = async (req, res, next) => {
  if (req.cookies.jwt) {
    try {
      // 1) verify token
      const decoded = await promisify(jwt.verify)(
        req.cookies.jwt,
        process.env.JWT_SECRET,
      );

      // 2) Check if user still exists
      const currentUser = await User.findById(decoded.id);
      if (!currentUser) {
        return next();
      }

      // 3) Check if user changed password after the token was issued
      if (currentUser.changedPasswordAfter(decoded.iat)) {
        return next();
      }

      // THERE IS A LOGGED IN USER
      res.locals.user = currentUser;
      return next();
    } catch (err) {
      return next();
    }
  }
  next();
};

exports.restrictTo =
  (...roles) =>
  // arrow function does not need to use word return
  (req, res, next) => {
    if (!roles.includes(req.user.role))
      return next(
        new AppError('You do not have permission to perfom this action', 403),
      );

    next();
  };

exports.forgotPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on Posted
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    return next(new AppError('There is no user with email address', 404));
  }
  // 2) Generate the random token

  const resetToken = user.createPasswordResetToken();
  // it deactivate all validators in the schema
  await user.save({ validateBeforeSave: false });
  // 3) Send it to user's email

  const restURL = `${req.protocol}://${req.get('host')}/api/v1/users/resetPassword/${resetToken}`;

  const message = `Forgot your password? Please click the link to reset your password ${restURL}. Hurry up! Your link is valid only 10 minutes. \n If you did not forget your password, please ignore this message!`;

  try {
    await sendEmail({
      email: user.email,
      subject: 'Your password reset token ( vailid for 10 minutes)',
      text: message,
    });

    res.status(200).json({
      status: 'success',
      message: 'Token send to email',
    });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });
    return next(
      new AppError('Ther was an error sending the email. Try again!', 500),
    );
  }
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  // 1) the user based on token
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });
  // 2) if token has not expired, and there is user, set the new password
  if (!user) {
    return next(new AppError('Token is invalid or has expired!', 400));
  }
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  // here we does not switch off validators they must work!
  await user.save();

  // 3) Update changePasswordAt property for the user
  // 4) Log the user in, send JWT
  createSendToken(user, 200, res);
});

exports.updatePassword = catchAsync(async (req, res, next) => {
  // 1) Get user from collection
  console.log('req.user:', req.user);
  const user = await User.findById(req.user.id).select('+password');
  console.log('fetched user:', user);
  // 2) Check if posted current password is correct
  if (!(await user.correctPassword(req.body.passwordCurrent, user.password))) {
    return next(new AppError('Your current password is wrong!'));
  }
  // 3) if current password is correct, update
  console.log(
    'Updating password:',
    req.body.password,
    'Confirm:',
    req.body.passwordConfirm,
  );

  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  await user.save();
  // 4) Log user in, send JWT

  createSendToken(user, 201, res);
});
