const { pool } = require('../src/db/pool');

async function migrate() {
  try {
    console.log('Adding "waiting_approval" to pay_status_type enum...');
    await pool.query(`ALTER TYPE pay_status_type ADD VALUE IF NOT EXISTS 'waiting_approval'`);
    console.log('Migration successful!');
  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    process.exit();
  }
}

migrate();
