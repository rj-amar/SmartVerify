const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Validate environment variables strictly at startup
const requiredEnv = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET'];
const missingEnv = requiredEnv.filter(k => !process.env[k]);
if (missingEnv.length > 0) {
  console.error(`\n[FATAL CONFIG ERROR] Missing required environment variable(s) in .env: ${missingEnv.join(', ')}`);
  console.error('Please configure the .env file in the backend directory before running the application.\n');
  process.exit(1);
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[PostgreSQL Pool Unexpected Error]:', err.message);
});

async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development') {
    console.log(`[SQL Query] (${duration}ms) ${text.replace(/\s+/g, ' ').substring(0, 100)}`);
  }
  return res;
}

async function getClient() {
  return await pool.connect();
}

async function testConnection() {
  try {
    const res = await pool.query('SELECT NOW() as now, current_database() as db');
    return { success: true, db: res.rows[0].db, time: res.rows[0].now };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  pool,
  query,
  getClient,
  testConnection
};
