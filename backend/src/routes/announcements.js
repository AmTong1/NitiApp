const { pool } = require('../db/pool');
const { authGuard, adminOnly } = require('../middleware/auth');
const { hasDb, tableExists, columnExists } = require('../utils/db');
const { HOST, PORT } = require('../config/env');

let mockAnnouncements = (global.mockAnnouncements ?? [
  { id: 1, title: 'จะมีการประชุมหมู่บ้าน', date: '01/10/2025', image: 'https://cdn-icons-png.flaticon.com/512/2983/2983701.png', important: true,  description: 'เชิญประชุมใหญ่สามัญประจำปี ณ ศาลาชุมชน', created_by: 1, updated_by: null },
  { id: 2, title: 'กีฬาและออกกำลังกาย',   date: '05/10/2025', image: 'https://cdn-icons-png.flaticon.com/512/2784/2784459.png', important: false, description: 'กิจกรรมออกกำลังกายทุกเย็นที่สนามหมู่บ้าน', created_by: 1, updated_by: null },
  { id: 3, title: 'กิจกรรมพัฒนาชุมชน',     date: '12/10/2025', image: 'https://cdn-icons-png.flaticon.com/512/201/201818.png', important: false, description: 'ร่วมกันทำความสะอาดพื้นที่ส่วนกลาง', created_by: 2, updated_by: null },
]);
global.mockAnnouncements = mockAnnouncements;

async function dbReady() {
  if (!(await hasDb())) return false;
  if (!(await tableExists('announcements'))) return false;
  return true;
}

function toAbsolute(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  const base = `http://${HOST}:${PORT}`;
  return u.startsWith('/') ? `${base}${u}` : `${base}/${u}`;
}

function mapImage(item) {
  if (!item) return item;
  const out = { ...item };
  out.image = toAbsolute(out.image);
  out.important = !!out.important;
  return out;
}

function registerAnnouncementRoutes(app) {
  // List
  app.get('/announcements', async (req, res) => {
    if (await dbReady()) {
      try {
        const hasImp = await columnExists('announcements', 'important');
        const orderSql = hasImp ? 'ORDER BY a.important DESC, a.id DESC' : 'ORDER BY a.id DESC';
        const sql = `SELECT a.*, acc1.full_name AS created_by_name, acc2.full_name AS updated_by_name
                       FROM announcements a
                 LEFT JOIN accounts acc1 ON acc1.id = a.created_by
                 LEFT JOIN accounts acc2 ON acc2.id = a.updated_by
                      ${orderSql}`;
        let [rows] = await pool.query(sql);
        rows = rows.map(mapImage);
        return res.json({ ok: true, data: rows });
      } catch (e) {
        console.error('GET /announcements DB error:', e);
        return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
      }
    } else {
      const data = mockAnnouncements
        .slice()
        .sort((a, b) => (Number(!!b.important) - Number(!!a.important)) || (b.id - a.id))
        .map(mapImage);
      return res.json({ ok: true, data });
    }
  });

  // Get by id
  app.get('/announcements/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (await dbReady()) {
      try {
        const [rows] = await pool.query(
          `SELECT a.*, acc1.full_name AS created_by_name, acc2.full_name AS updated_by_name
             FROM announcements a
        LEFT JOIN accounts acc1 ON acc1.id = a.created_by
        LEFT JOIN accounts acc2 ON acc2.id = a.updated_by
            WHERE a.id = $1`,
          [id]
        );
        if (!rows[0]) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
        return res.json({ ok: true, data: mapImage(rows[0]) });
      } catch (e) {
        console.error('GET /announcements/:id DB error:', e);
        return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
      }
    } else {
      const found = mockAnnouncements.find(a => a.id === id);
      if (!found) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      return res.json({ ok: true, data: mapImage(found) });
    }
  });

  // Create
  app.post('/announcements', authGuard, adminOnly, async (req, res) => {
    const { title, date, image, important, description } = req.body || {};
    if (!title || !date) return res.status(400).json({ ok: false, error: 'INVALID_BODY' });

    if (await dbReady()) {
      try {
        const colImp = await columnExists('announcements', 'important');
        const colDesc = await columnExists('announcements', 'description');

        const cols = ['title', 'date', 'image'];
        const values = [title, date, image || null];
        if (colDesc) { cols.push('description'); values.push(description || null); }
        if (colImp) { cols.push('important'); values.push(important ? true : false); }
        cols.push('created_by');
        values.push(req.user.id);

        // Build PostgreSQL placeholders
        const placeholders = values.map((_, i) => `$${i + 1}`);
        const sql = `INSERT INTO announcements (${cols.join(', ')}, updated_by)
                     VALUES (${placeholders.join(', ')}, NULL) RETURNING id`;
        const [result] = await pool.query(sql, values);
        const insertId = result[0]?.id;
        const [rows] = await pool.query(
          `SELECT a.*, acc1.full_name AS created_by_name, acc2.full_name AS updated_by_name
             FROM announcements a
        LEFT JOIN accounts acc1 ON acc1.id = a.created_by
        LEFT JOIN accounts acc2 ON acc2.id = a.updated_by
            WHERE a.id = $1`,
          [insertId]
        );
        return res.status(201).json({ ok: true, data: mapImage(rows[0]) });
      } catch (e) {
        console.error('POST /announcements DB error:', e);
        return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
      }
    } else {
      const newId = mockAnnouncements.length > 0 ? Math.max(...mockAnnouncements.map(a => a.id)) + 1 : 1;
      const newItem = { id: newId, title: String(title), date: String(date), image: image || '', important: !!important, description: description || '', created_by: req.user.id, updated_by: null };
      mockAnnouncements.push(newItem);
      global.mockAnnouncements = mockAnnouncements;
      return res.status(201).json({ ok: true, data: mapImage(newItem) });
    }
  });

  // Update
  app.put('/announcements/:id', authGuard, adminOnly, async (req, res) => {
    const id = Number(req.params.id);
    const { title, date, image, important, description } = req.body || {};
    if (await dbReady()) {
      try {
        const fields = [];
        const params = [];
        let paramIdx = 1;
        if (title !== undefined) { fields.push(`title = $${paramIdx++}`); params.push(String(title)); }
        if (date !== undefined) { fields.push(`date = $${paramIdx++}`); params.push(String(date)); }
        if (image !== undefined) { fields.push(`image = $${paramIdx++}`); params.push(String(image)); }
        const colDesc = await columnExists('announcements', 'description');
        const colImp = await columnExists('announcements', 'important');
        if (colDesc && description !== undefined) { fields.push(`description = $${paramIdx++}`); params.push(description === null ? null : String(description)); }
        if (colImp && important !== undefined) { fields.push(`important = $${paramIdx++}`); params.push(important ? true : false); }
        fields.push(`updated_by = $${paramIdx++}`);
        params.push(req.user.id);
        params.push(id);
        await pool.query(
          `UPDATE announcements SET ${fields.join(', ')} WHERE id = $${paramIdx}`,
          params
        );
        const [rows] = await pool.query(
          `SELECT a.*, acc1.full_name AS created_by_name, acc2.full_name AS updated_by_name
             FROM announcements a
        LEFT JOIN accounts acc1 ON acc1.id = a.created_by
        LEFT JOIN accounts acc2 ON acc2.id = a.updated_by
            WHERE a.id = $1`,
          [id]
        );
        return res.json({ ok: true, data: mapImage(rows[0]) });
      } catch (e) {
        console.error('PUT /announcements/:id DB error:', e);
        return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
      }
    } else {
      const idx = mockAnnouncements.findIndex(a => a.id === id);
      if (idx === -1) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      const a = mockAnnouncements[idx];
      if (title !== undefined) a.title = String(title);
      if (date !== undefined) a.date = String(date);
      if (image !== undefined) a.image = String(image);
      if (important !== undefined) a.important = !!important;
      if (description !== undefined) a.description = description === null ? '' : String(description);
      a.updated_by = req.user.id;
      mockAnnouncements[idx] = a;
      return res.json({ ok: true, data: mapImage(a) });
    }
  });

  // Delete
  app.delete('/announcements/:id', authGuard, adminOnly, async (req, res) => {
    const id = Number(req.params.id);
    if (await dbReady()) {
      try {
        await pool.query('DELETE FROM announcements WHERE id = $1', [id]);
        return res.json({ ok: true });
      } catch (e) {
        console.error('DELETE /announcements/:id DB error:', e);
        return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
      }
    } else {
      mockAnnouncements = mockAnnouncements.filter(a => a.id !== id);
      global.mockAnnouncements = mockAnnouncements;
      return res.json({ ok: true });
    }
  });
}

module.exports = { registerAnnouncementRoutes };
