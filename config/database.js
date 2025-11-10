// Load environment variables from config.env
const dotenv = require('dotenv');

dotenv.config({ path: 'config.env' });

// Build DB connection string
const DB =
  // process.env.NODE_ENV === 'development'
  // ? process.env.DATABASE_LOCAL :
  process.env.DATABASE_CONNECTION.replace('<USER>', process.env.DATABASE_USER)
    .replace('<PASSWORD>', process.env.DATABASE_PASSWORD)
    .replace('<DATABASE_NAME>', process.env.DATABASE_NAME);

module.exports = DB;
