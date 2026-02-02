const path = require('path');
require('dotenv').config();

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

module.exports = {
  HOST: process.env.HOST || 'localhost',
  PORT: Number(process.env.PORT || 5000),

  // SlipOK
  SLIPOK_API: process.env.SLIPOK_API,
  SLIPOK_KEY: process.env.SLIPOK_KEY,

  // PromptPay
  PROMPTPAY_ID: process.env.PROMPTPAY_ID,
  PROMPTPAY_DEFAULT_AMOUNT: Number(process.env.PROMPTPAY_DEFAULT_AMOUNT || 0),

  // Puppeteer
  HEADLESS_MODE: process.env.PUPPETEER_HEADLESS || 'new',

  // Admin header
  ADMIN_KEY: process.env.ADMIN_KEY || '',

  // JWT
  JWT_SECRET: process.env.JWT_SECRET || 'secret',
  JWT_EXPIRES: process.env.JWT_EXPIRES || '7d',

  // DB
  DB: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
  },

  // QR retention
  QR_RETENTION_DAYS: Number(process.env.QR_RETENTION_DAYS || 3),
  ONE_DAY_MS,
};

