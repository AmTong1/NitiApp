/**
 * Database initialization script
 * Auto-creates database and runs schema.sql if tables don't exist
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { DB } = require('../config/env');

// Get database name from config
const dbName = DB.database || 'upgit';

/**
 * Connect to PostgreSQL without specifying database (connect to 'postgres')
 * to check/create the target database
 */
async function ensureDatabase() {
  const adminClient = new Client({
    host: DB.host,
    port: DB.port || 5432,
    user: DB.user,
    password: DB.password,
    database: 'postgres', // connect to default postgres database
    connectionTimeoutMillis: 5000, // 5 second timeout
  });

  try {
    await adminClient.connect();
    console.log('[initDb] Connected to PostgreSQL server');

    // Check if database exists
    const checkResult = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );

    if (checkResult.rows.length === 0) {
      // Database doesn't exist, create it
      console.log(`[initDb] Database '${dbName}' not found, creating...`);
      // Note: CREATE DATABASE cannot be in a transaction
      await adminClient.query(`CREATE DATABASE "${dbName}"`);
      console.log(`[initDb] Database '${dbName}' created successfully`);
    } else {
      console.log(`[initDb] Database '${dbName}' already exists`);
    }
  } catch (err) {
    console.error('[initDb] Error ensuring database:', err.message || err);
    if (err.code) console.error('[initDb] Error code:', err.code);
    throw err;
  } finally {
    await adminClient.end();
  }
}

/**
 * Run schema.sql to create all tables
 */
async function runSchema() {
  const schemaPath = path.join(__dirname, '..', '..', 'schema.sql');
  
  if (!fs.existsSync(schemaPath)) {
    console.warn('[initDb] schema.sql not found at:', schemaPath);
    return;
  }

  const dbClient = new Client({
    host: DB.host,
    port: DB.port || 5432,
    user: DB.user,
    password: DB.password,
    database: dbName,
  });

  try {
    await dbClient.connect();
    console.log(`[initDb] Connected to database '${dbName}'`);

    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('[initDb] Running schema.sql...');
    await dbClient.query(schemaSql);
    console.log('[initDb] Schema applied successfully');

  } catch (err) {
    // Ignore "already exists" errors for types and tables
    if (err.code === '42710' || err.code === '42P07') {
      console.log('[initDb] Schema already exists (some objects skipped)');
    } else {
      console.error('[initDb] Error running schema:', err.message);
      // Don't throw - allow server to continue even if schema has issues
    }
  } finally {
    await dbClient.end();
  }
}

/**
 * Initialize database - call this before starting the server
 */
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
