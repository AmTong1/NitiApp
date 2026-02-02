const { Pool } = require("pg");
const { DB } = require("../config/env");

let pool;
function getPool() {
  if (!pool) {
    pool = new Pool({
      host: DB.host || "localhost",
      port: DB.port || 5432,
      user: DB.user || "postgres",
      password: DB.password || "",
      database: DB.database || "testproj",
      max: DB.connectionLimit || 10,
    });
    console.log("[DB] Pool created");
    // Set timezone for this session
    pool.on("connect", (client) => {
      client.query("SET TIME ZONE 'Asia/Bangkok'");
    });
  }
  return pool;
}

// Wrapper to make pg compatible with mysql2 destructuring pattern: const [rows] = await pool.query(...)
const poolWrapper = {
  async query(text, params) {
    const result = await getPool().query(text, params);
    // Return [rows, fields] like mysql2 for backward compatibility
    return [result.rows, result.fields];
  },
  // Expose raw pool for direct access if needed
  getClient: () => getPool().connect(),
  raw: () => getPool(),
};

module.exports = {
  pool: poolWrapper,
};
