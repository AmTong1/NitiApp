const { pool } = require('../src/db/pool');

async function check() {
  try {
    const client = await pool.getClient();
    console.log('--- DEBUG QUERY ---');
    
    const [res] = await client.query(`
      SELECT id, status, house_number 
      FROM payment_installments 
      WHERE status = 'waiting_approval'
    `);
    console.log('Waiting Approval Rows:', JSON.stringify(res));

    const [dist] = await client.query(`
      SELECT status, COUNT(*) as cnt 
      FROM payment_installments 
      GROUP BY status
    `);
    console.log('Status Distribution:', JSON.stringify(dist));

    client.release();
  } catch (err) {
    console.error('Query failed:', err.message);
  } finally {
    process.exit();
  }
}

check();
