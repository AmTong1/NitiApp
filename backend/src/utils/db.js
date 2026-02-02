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
    // PostgreSQL: use information_schema with current_database() and current_schema()
    const [rows] = await pool.query(
      `SELECT 1 FROM information_schema.tables 
       WHERE table_name = $1 AND table_catalog = current_database()`,
      [name]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

const columnCache = new Map(); // "table.column" => boolean
async function columnExists(table, column) {
  const key = `${table}.${column}`;
  if (columnCache.has(key)) return columnCache.get(key);
  try {
    // PostgreSQL: use information_schema with current_database()
    const [rows] = await pool.query(
      `SELECT 1
         FROM information_schema.columns
        WHERE table_catalog = current_database()
          AND table_name = $1
          AND column_name = $2
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

module.exports = { hasDb, tableExists, columnExists };
