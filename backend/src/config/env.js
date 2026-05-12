const path = require('path');
require('dotenv').config();

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function toInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function toPositiveInt(value, fallback) {
  const n = toInt(value, fallback);
  return n > 0 ? n : fallback;
}

function toNonNegativeInt(value, fallback) {
  const n = toInt(value, fallback);
  return n >= 0 ? n : fallback;
}

module.exports = {
  HOST: process.env.HOST || 'localhost',
  PORT: Number(process.env.PORT || 5000),

  // Slip2Go (fallback to legacy SlipOK env names)
  SLIP2GO_API: process.env.SLIP2GO_API || process.env.SLIPOK_API,
  SLIP2GO_SECRET: process.env.SLIP2GO_SECRET || process.env.SLIPOK_KEY,

  // Legacy aliases (backward compatibility)
  SLIPOK_API: process.env.SLIPOK_API || process.env.SLIP2GO_API,
  SLIPOK_KEY: process.env.SLIPOK_KEY || process.env.SLIP2GO_SECRET,

  // PromptPay
  PROMPTPAY_ID: process.env.PROMPTPAY_ID,
  PROMPTPAY_DEFAULT_AMOUNT: Number(process.env.PROMPTPAY_DEFAULT_AMOUNT || 0),

  // Puppeteer
  HEADLESS_MODE: process.env.PUPPETEER_HEADLESS || 'new',
  PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH || '',

  // Admin header
  ADMIN_KEY: process.env.ADMIN_KEY || '',

  // JWT
  JWT_SECRET: process.env.JWT_SECRET || 'secret',
  JWT_EXPIRES: process.env.JWT_EXPIRES || '7d',

  // DB
  DB: {
    host: process.env.DB_HOST,
    port: toPositiveInt(process.env.DB_PORT, 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: String(process.env.DB_WAIT_FOR_CONNECTIONS || 'true').toLowerCase() !== 'false',
    connectionLimit: toPositiveInt(process.env.DB_CONNECTION_LIMIT || process.env.DB_POOL_SIZE, 30),
    queueLimit: toNonNegativeInt(process.env.DB_QUEUE_LIMIT, 0),
  },

  // QR retention
  QR_RETENTION_DAYS: Number(process.env.QR_RETENTION_DAYS || 3),
  ONE_DAY_MS,
};

