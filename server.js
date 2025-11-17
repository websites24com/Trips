const dotenv = require('dotenv');
const mongoose = require('mongoose');
const DB = require('./config/database');

// Catching Errors

process.on('uncaughtException', (err) => {
  console.log(err.name, err.message, err);
  console.log('UNCAUGHTEXCEPTION ✴️, Shutting down...');
  process.exit(1);
});

const app = require('./app');

mongoose.connect(DB).then(() => {
  console.log('DB connection successful!');
});

// console.log(app.get('env'));
// console.log(process.env);
// Define port
const port = process.env.PORT || 3000;
// Start server
const server = app.listen(port, () => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`Server is running on port ${port} in development mode`);
  } else {
    console.log('app is running in production...');
  }
});

process.on('unhandledRejection', (err) => {
  console.log(err.name, err.message);
  console.log('UNHANDLER REJECTION ✴️, Shutting down...');
  server.close(() => {
    process.exit(1);
  });
});
