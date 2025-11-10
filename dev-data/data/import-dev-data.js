const dotenv = require('dotenv');

const mongoose = require('mongoose');

const fs = require('fs');

const DB = require('../../config/database');

const Tour = require('../../models/tourModel');
const Review = require('../../models/reviewModel');
const User = require('../../models/userModel');

// dotenv.config({ path: './config.env' });

mongoose.connect(DB).then(() => {
  console.log('DB connection successful!');
});

// READ JSON FILE

const fileTours = `${__dirname}/tours.json`;
const fileUsers = `${__dirname}/users.json`;
const fileReviews = `${__dirname}/reviews.json`;

// we must convert it in JS object

const tours = JSON.parse(fs.readFileSync(fileTours, 'utf-8'));
const users = JSON.parse(fs.readFileSync(fileUsers, 'utf-8'));
const reviews = JSON.parse(fs.readFileSync(fileReviews, 'utf-8'));

// Import Data into DB

const importData = async () => {
  try {
    await Tour.create(tours);
    await User.create(users, { validateBeforeSave: false });
    await Review.create(reviews, { validateBeforeSave: false });
    console.log('Data successfully imported from JSON file');
    process.exit();
  } catch (err) {
    console.log(err);
  }
};

// Delete all data from db

const deleteData = async () => {
  try {
    await Tour.deleteMany();
    await User.deleteMany();
    await Review.deleteMany();
    console.log('Data successfully deleted from DB');
    process.exit();
  } catch (err) {
    console.log(err);
  }
};
// to run it:
// node dev-data/data/import-dev-data.js --delete
// node dev-data/data/import-dev-data.js --import
if (process.argv[2] === '--import') {
  importData();
} else if (process.argv[2] === '--delete') {
  deleteData();
}

console.log(process.argv);
