const { pool } = require('../src/db/pool');

async function check() {
  try {
    const client = await pool.raw().connect();
    console.log('--- DEBUG QUERY ---');
    
    // Check specifically for waiting_approval with cast
    const res = await client.query(`
      SELECT id, status, house_number 
      FROM payment_installments 
      WHERE status::text = 'waiting_approval'
    `);
    console.log('Waiting Approval Rows:', JSON.stringify(res.rows));

    // Check distribution
    const dist = await client.query(`
      SELECT status, COUNT(*) as cnt 
      FROM payment_installments 
      GROUP BY status
    `);
    console.log('Status Distribution:', JSON.stringify(dist.rows));

    client.release();
  } catch (err) {
    console.error('Query failed:', err.message);
  } finally {
    process.exit();
  }
}

check();
