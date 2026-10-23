const mysql = require('mysql2/promise');
const mongoose = require('mongoose');
require('dotenv').config();

// MySQL Connection Pool (Default / Fallback)
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '',
  database: process.env.DB_NAME || 'loanwise',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// MongoDB Atlas Mongoose Connection Helper
async function connectMongo(uri) {
  const mongoUri = uri || process.env.MONGODB_URI;
  if (!mongoUri) return null;
  return mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 8000
  });
}

module.exports = {
  pool,
  connectMongo,
  mongoose
};
