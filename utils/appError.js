class AppError extends Error {
  constructor(message, statusCode) {
    super(message);

    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    // Built-in Node.js function that records where the error happened
    // "this" The current error object being created
    // this.constructor
    // it save the place where the error actually happened,
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
