const mysql = require("mysql2/promise");
const { DB } = require("../config/env");

let pool;
let poolSessionTzAttached = false;
const RETRYABLE_DB_ERROR_CODES = new Set([
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "PROTOCOL_CONNECTION_LOST",
  "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR",
  "PROTOCOL_ENQUEUE_AFTER_QUIT",
]);

function isRetryableDbError(err) {
  const code = String(err?.code || "");
  return RETRYABLE_DB_ERROR_CODES.has(code);
}

async function resetPool(reason) {
  const oldPool = pool;
  pool = undefined;
  poolSessionTzAttached = false;
  if (!oldPool) return;
  try {
    await oldPool.end();
  } catch (e) {
    console.warn("[DB] Failed to close old pool:", e?.message || e);
  }
  if (reason) {
    console.warn(`[DB] Pool reset due to transient error: ${reason}`);
  }
}

function getPool() {
  if (!pool) {
    const connectionLimit = Number.isFinite(Number(DB.connectionLimit))
      ? Math.max(1, Math.trunc(Number(DB.connectionLimit)))
      : 30;
    const queueLimit = Number.isFinite(Number(DB.queueLimit))
      ? Math.max(0, Math.trunc(Number(DB.queueLimit)))
      : 0;

    pool = mysql.createPool({
      host: DB.host || "localhost",
      port: DB.port || 3306,
      user: DB.user || "root",
      password: DB.password || "",
      database: DB.database || "upgit",
      waitForConnections: DB.waitForConnections !== false,
      queueLimit,
      connectionLimit,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      connectTimeout: 10000,
      timezone: '+07:00'
    });

    if (!poolSessionTzAttached) {
      pool.on('connection', (conn) => {
        conn.query("SET time_zone = '+07:00'", (err) => {
          if (err) {
            console.warn('[DB] Failed to set session time_zone to +07:00:', err?.message || err);
          }
        });
      });
      poolSessionTzAttached = true;
    }

    console.log(`[DB] Pool created (MySQL) connectionLimit=${connectionLimit} queueLimit=${queueLimit}`);
  }
  return pool;
}

async function withTransientRetry(operation, { retries = 1, label = "query" } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (err) {
      lastErr = err;
      if (!isRetryableDbError(err) || attempt === retries) {
        break;
      }
      console.warn(`[DB] ${label} failed with ${err.code}, retrying (${attempt + 1}/${retries})`);
      await resetPool(err.code);
    }
  }
  throw lastErr;
}

// Keep the same export structure to minimize refactoring
const poolWrapper = {
  async query(text, params) {
    // SQL placeholders use mysql2 style: ?
    const [rows, fields] = await withTransientRetry(
      () => getPool().query(text, params),
      { retries: 1, label: "query" }
    );
    return [rows, fields];
  },
  getClient: async () =>
    withTransientRetry(
      () => getPool().getConnection(),
      { retries: 1, label: "getConnection" }
    ),
  raw: () => getPool(),
};

module.exports = {
  pool: poolWrapper,
};
