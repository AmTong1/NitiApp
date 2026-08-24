const { pool } = require('../db/pool');
const { DB } = require('../config/env');

async function hasDb() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

async function tableExists(name) {
  try {
    const [rows] = await pool.query(
      `SELECT 1 FROM information_schema.tables 
       WHERE table_name = ? AND table_schema = DATABASE()`,
      [name]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

const columnCache = new Map();
async function columnExists(table, column) {
  const key = `${table}.${column}`;
  if (columnCache.has(key)) return columnCache.get(key);
  try {
    const [rows] = await pool.query(
      `SELECT 1
         FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = ?
          AND column_name = ?
        LIMIT 1`,
      [table, column]
    );
    const ok = rows.length > 0;
    columnCache.set(key, ok);
    return ok;
  } catch {
    columnCache.set(key, false);
    return false;
  }
}

async function indexExists(table, indexName) {
  try {
    const [rows] = await pool.query(
      `SELECT 1
         FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = ?
          AND index_name = ?
        LIMIT 1`,
      [table, indexName]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

module.exports = { hasDb, tableExists, columnExists, indexExists };
