const { pool } = require('../db/pool');
const { authGuard, adminOnly } = require('../middleware/auth');
const { hasDb, tableExists } = require('../utils/db');

let mockContacts = (global.mockContacts ?? [
  { id: 1, title: 'ตำรวจ', number: '191', created_by: 1, updated_by: null },
  { id: 2, title: 'ดับเพลิง', number: '199', created_by: 1, updated_by: null },
  { id: 3, title: 'กู้ชีพฉุกเฉิน', number: '1669', created_by: 2, updated_by: null },
]);
global.mockContacts = mockContacts;

function registerContactRoutes(app) {
  app.get('/contacts', async (req, res) => {
    if (await hasDb()) {
      try {
        const [rows] = await pool.query(
          `SELECT c.*,
                  a1.full_name AS created_by_name,
                  a2.full_name AS updated_by_name
             FROM contacts c
        LEFT JOIN accounts a1 ON a1.id = c.created_by
        LEFT JOIN accounts a2 ON a2.id = c.updated_by
         ORDER BY c.id DESC`
        );
        return res.json({ ok: true, data: rows });
      } catch (e) {
        console.error('GET /contacts DB error:', e);
        return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
      }
    } else {
      return res.json({ ok: true, data: mockContacts });
    }
  });

  app.get('/contacts/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (await hasDb()) {
      try {
        const [rows] = await pool.query(
          `SELECT c.*,
                  a1.full_name AS created_by_name,
                  a2.full_name AS updated_by_name
             FROM contacts c
        LEFT JOIN accounts a1 ON a1.id = c.created_by
        LEFT JOIN accounts a2 ON a2.id = c.updated_by
            WHERE c.id = $1`,
          [id]
        );
        if (!rows[0]) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
        return res.json({ ok: true, data: rows[0] });
      } catch (e) {
        console.error('GET /contacts/:id DB error:', e);
        return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
      }
    } else {
      const found = mockContacts.find(c => c.id === id);
      if (!found) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      return res.json({ ok: true, data: found });
    }
  });

  app.post('/contacts', authGuard, adminOnly, async (req, res) => {
    const { title, number } = req.body || {};
    if (!title || !number) return res.status(400).json({ ok: false, error: 'INVALID_BODY' });

    if (await hasDb()) {
      try {
        const [result] = await pool.query(
          `INSERT INTO contacts (title, number, created_by, updated_by)
           VALUES ($1, $2, $3, NULL) RETURNING id`,
          [title, number, req.user.id]
        );
        const insertId = result[0]?.id;
        const [rows] = await pool.query(
          `SELECT c.*,
                  a1.full_name AS created_by_name,
                  a2.full_name AS updated_by_name
             FROM contacts c
        LEFT JOIN accounts a1 ON a1.id = c.created_by
        LEFT JOIN accounts a2 ON a2.id = c.updated_by
            WHERE c.id = $1`,
          [insertId]
        );
        return res.status(201).json({ ok: true, data: rows[0] });
      } catch (e) {
        console.error('POST /contacts DB error:', e);
        return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
      }
    } else {
      const newId = mockContacts.length > 0 ? Math.max(...mockContacts.map(c => c.id)) + 1 : 1;
      const newContact = { id: newId, title, number, created_by: req.user.id, updated_by: null };
      mockContacts.push(newContact);
      return res.status(201).json({ ok: true, data: newContact });
    }
  });

  app.put('/contacts/:id', authGuard, adminOnly, async (req, res) => {
    const id = Number(req.params.id);
    const { title, number } = req.body || {};
    if (await hasDb()) {
      try {
        const fields = [];
        const params = [];
        let paramIdx = 1;
        if (title !== undefined) { fields.push(`title = $${paramIdx++}`); params.push(String(title)); }
        if (number !== undefined) { fields.push(`number = $${paramIdx++}`); params.push(String(number)); }
        fields.push(`updated_by = $${paramIdx++}`);
        params.push(req.user.id);
        params.push(id);
        await pool.query(
          `UPDATE contacts SET ${fields.join(', ')} WHERE id = $${paramIdx}`,
          params
        );
        const [rows] = await pool.query(
          `SELECT c.*,
                  a1.full_name AS created_by_name,
                  a2.full_name AS updated_by_name
             FROM contacts c
        LEFT JOIN accounts a1 ON a1.id = c.created_by
        LEFT JOIN accounts a2 ON a2.id = c.updated_by
            WHERE c.id = $1`,
          [id]
        );
        return res.json({ ok: true, data: rows[0] });
      } catch (e) {
        console.error('PUT /contacts/:id DB error:', e);
        return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
      }
    } else {
      const idx = mockContacts.findIndex(c => c.id === id);
      if (idx === -1) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      const c = mockContacts[idx];
      if (title !== undefined) c.title = String(title);
      if (number !== undefined) c.number = String(number);
      mockContacts[idx] = c;
      return res.json({ ok: true, data: c });
    }
  });

  app.delete('/contacts/:id', authGuard, adminOnly, async (req, res) => {
    const id = Number(req.params.id);
    if (await hasDb()) {
      try {
        await pool.query('DELETE FROM contacts WHERE id = $1', [id]);
        return res.json({ ok: true });
      } catch (e) {
        console.error('DELETE /contacts/:id DB error:', e);
        return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
      }
    } else {
      mockContacts = mockContacts.filter(c => c.id !== id);
      global.mockContacts = mockContacts;
      return res.json({ ok: true });
    }
  });
}

module.exports = { registerContactRoutes };
