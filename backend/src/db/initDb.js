const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { DB } = require('../config/env');

const dbName = DB.database || 'upgit';

async function indexExists(connection, tableName, indexName) {
  const [rows] = await connection.query(
    `SELECT 1
       FROM information_schema.statistics
      WHERE table_schema = ?
        AND table_name = ?
        AND index_name = ?
      LIMIT 1`,
    [dbName, tableName, indexName]
  );
  return rows.length > 0;
}

async function ensureIndex(connection, tableName, indexName, columnsSql) {
  const exists = await indexExists(connection, tableName, indexName);
  if (exists) return;
  await connection.query(`ALTER TABLE \`${tableName}\` ADD INDEX \`${indexName}\` (${columnsSql})`);
  console.log(`[initDb] Added index ${indexName} on ${tableName}`);
}

async function ensureCriticalIndexes(connection) {
  try {
    await ensureIndex(connection, 'chat_messages', 'idx_chat_messages_room_id_id', '`room_id`, `id`');
    await ensureIndex(connection, 'chat_messages', 'idx_chat_messages_reply_to', '`reply_to_id`');
    await ensureIndex(connection, 'chat_room_reads', 'idx_chat_room_reads_user', '`user_id`');
    await ensureIndex(connection, 'chat_room_pins', 'idx_chat_room_pins_user', '`user_id`, `pinned_at`');
    await ensureIndex(connection, 'chat_room_admin_pins', 'idx_chat_room_admin_pins_time', '`pinned_at`');
    await ensureIndex(connection, 'chat_message_pins', 'idx_chat_message_pins_user_room', '`user_id`, `room_id`, `pinned_at`');
  } catch (e) {
    console.warn('[initDb] Failed to ensure critical indexes:', e?.message || e);
  }
}

async function ensureDatabase() {
  const adminConnection = await mysql.createConnection({
    host: DB.host || 'localhost',
    port: DB.port || 3306,
    user: DB.user || 'root',
    password: DB.password || '',
  });

  try {
    console.log('[initDb] Connected to MySQL server');
    
    await adminConnection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    console.log(`[initDb] Database '${dbName}' ensured`);
    
  } catch (err) {
    console.error('[initDb] Error ensuring database:', err.message || err);
    throw err;
  } finally {
    await adminConnection.end();
  }
}

async function runSchema() {
  const schemaPath = path.join(__dirname, '..', '..', 'schema.sql');
  
  if (!fs.existsSync(schemaPath)) {
    console.warn('[initDb] schema.sql not found at:', schemaPath);
    return;
  }

  const dbConnection = await mysql.createConnection({
    host: DB.host || 'localhost',
    port: DB.port || 3306,
    user: DB.user || 'root',
    password: DB.password || '',
    database: dbName,
    multipleStatements: true
  });

  try {
    console.log(`[initDb] Connected to database '${dbName}'`);

    const schemaSql = fs.readFileSync(schemaPath, 'utf8').replace(/\\`/g, '`');
    
    console.log('[initDb] Running schema.sql...');
    await dbConnection.query(schemaSql);
    console.log('[initDb] Schema applied successfully');
    await ensureCriticalIndexes(dbConnection);

    try {
      await dbConnection.query(
        `ALTER TABLE slipok_verifications MODIFY COLUMN sending_bank VARCHAR(128) NULL`
      ).catch(() => {});

      const addColIfMissing = async (col, definition, after) => {
        const [cols] = await dbConnection.query(
          `SELECT 1 FROM information_schema.columns
           WHERE table_schema = ? AND table_name = 'slipok_verifications' AND column_name = ?
           LIMIT 1`,
          [dbName, col]
        );
        if (!cols.length) {
          await dbConnection.query(
            `ALTER TABLE slipok_verifications ADD COLUMN ${col} ${definition} AFTER ${after}`
          );
          console.log(`[initDb] Added ${col} column to slipok_verifications`);
        }
      };

      await addColIfMissing('sender_name', 'VARCHAR(255) NULL', 'sending_bank');
      await addColIfMissing('slip_datetime', 'DATETIME NULL', 'trans_time');
      await addColIfMissing('paid_at', 'DATETIME NULL', 'slip_datetime');
    } catch (e) {
      console.warn('[initDb] Migration warning:', e?.message || e);
    }

  } catch (err) {
    console.error('[initDb] Error running schema:', err.message);
  } finally {
    await dbConnection.end();
  }
}

async function initDatabase() {
  console.log('[initDb] Initializing database...');
  
  try {
    await ensureDatabase();
    await runSchema();
    console.log('[initDb] Database initialization complete');
    return true;
  } catch (err) {
    console.error('[initDb] Database initialization failed:', err.message);
    console.warn('[initDb] Server will continue, but some features may not work without database');
    return false;
  }
}

module.exports = { initDatabase, ensureDatabase, runSchema };
