const { pool } = require('../src/db/pool');

async function check() {
  try {
    const client = await pool.raw().connect();
    console.log('--- DEBUG START ---');
    console.log('Database Name:', client.database);
    
    // Check current enum values
    const res = await client.query(`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = 'pay_status_type'
    `);
    
    console.log('Enum Values:', JSON.stringify(res.rows.map(r => r.enumlabel)));
    console.log('--- DEBUG END ---');
    client.release();
  } catch (err) {
    console.error('Check failed:', err.message);
  } finally {
    process.exit();
  }
}

check();
