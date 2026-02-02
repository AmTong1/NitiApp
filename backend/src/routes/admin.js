const { adminAuth } = require('../middleware/auth');
const { pool } = require('../db/pool');
const { qrCache } = require('../utils/qr');

function registerAdminRoutes(app) {
  app.post('/admin/users', adminAuth, async (req, res) => {
    try {
      const { userId, amount } = req.body || {};
      if (!userId || amount === undefined) {
        return res.status(400).json({ message: 'ต้องมี userId และ amount' });
      }
      const a = Number(amount);
      // PostgreSQL: ON CONFLICT instead of ON DUPLICATE KEY
      await pool.query(
        `INSERT INTO users (id, amount) VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, updated_at = CURRENT_TIMESTAMP`,
        [userId, a]
      );
      qrCache.delete(userId);
      res.json({ message: 'บันทึกสำเร็จ', userId, amount: a });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: 'เกิดข้อผิดพลาด', error: e.message });
    }
  });

  app.put('/admin/users/:userId/amount', adminAuth, async (req, res) => {
    try {
      const { userId } = req.params;
      const { amount } = req.body || {};
      if (amount === undefined) return res.status(400).json({ message: 'ต้องมี amount' });
      const a = Number(amount);
      const [result] = await pool.query('UPDATE users SET amount = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [a, userId]);
      // PostgreSQL: result is actually the rows, check length for affected
      if (!result || result.length === 0) {
        // Try to check if row exists first - if not, insert
        const [existing] = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
        if (!existing || existing.length === 0) {
          await pool.query('INSERT INTO users (id, amount) VALUES ($1, $2)', [userId, a]);
        }
      }
      qrCache.delete(userId);
      res.json({ message: 'ตั้งค่ายอดสำเร็จ', userId, amount: a });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: 'เกิดข้อผิดพลาด', error: e.message });
    }
  });

  app.post('/admin/users/:userId/amount/add', adminAuth, async (req, res) => {
    try {
      const { userId } = req.params;
      const { delta } = req.body || {};
      if (delta === undefined) return res.status(400).json({ message: 'ต้องมี delta' });
      const d = Number(delta);

      // PostgreSQL: INSERT ... ON CONFLICT DO NOTHING instead of INSERT IGNORE
      await pool.query('INSERT INTO users (id, amount) VALUES ($1, 0.00) ON CONFLICT (id) DO NOTHING', [userId]);
      await pool.query('UPDATE users SET amount = amount + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [d, userId]);

      qrCache.delete(userId);

      const [rows] = await pool.query('SELECT amount FROM users WHERE id = $1', [userId]);
      res.json({ message: 'เพิ่มเงินสำเร็จ', userId, amount: Number(rows[0].amount) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: 'เกิดข้อผิดพลาด', error: e.message });
    }
  });

  app.get('/admin/users/:userId', adminAuth, async (req, res) => {
    try {
      const { userId } = req.params;
      const [rows] = await pool.query('SELECT id, amount, updated_at FROM users WHERE id = $1', [userId]);
      if (rows.length === 0) return res.status(404).json({ message: 'ไม่พบผู้ใช้' });
      res.json(rows[0]);
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: 'เกิดข้อผิดพลาด', error: e.message });
    }
  });
}

module.exports = { registerAdminRoutes };
