const { pool } = require('../db/pool');
const { authGuard, adminOnly } = require('../middleware/auth');
const { hasDb, tableExists, columnExists } = require('../utils/db');
const { HOST, PORT } = require('../config/env');

// ============ Announcement Logs Helpers ============
async function ensureAnnouncementLogsTable() {
  if (!(await hasDb())) return false;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS announcement_logs (
        id BIGSERIAL PRIMARY KEY,
        action VARCHAR(32) NOT NULL,
        announcement_id INTEGER,
        announcement_title TEXT,
        changes JSONB,
        performed_by INTEGER,
        performed_by_name VARCHAR(255),
        performed_by_role VARCHAR(32),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_announcement_logs_created ON announcement_logs(created_at DESC)');
    return true;
  } catch (e) { console.error('ensureAnnouncementLogsTable error:', e); return false; }
}

async function insertAnnouncementLog(action, announcementId, announcementTitle, changes, user) {
  try {
    await pool.query(
      `INSERT INTO announcement_logs (action, announcement_id, announcement_title, changes, performed_by, performed_by_name, performed_by_role)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [action, announcementId, announcementTitle, JSON.stringify(changes), user.id, user.full_name || user.username, user.role]
    );
  } catch (e) { console.error('insertAnnouncementLog error:', e); }
}

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
  // Init logs table on startup
  ensureAnnouncementLogsTable();

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

        // Log create
        const logChanges = { title: { new: title }, date: { new: date } };
        if (description) logChanges.description = { new: description };
        if (important) logChanges.important = { new: true };
        insertAnnouncementLog('create', insertId, title, logChanges, req.user);

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
        // Fetch old data before update
        const [oldRows] = await pool.query('SELECT * FROM announcements WHERE id = $1', [id]);
        const oldData = oldRows[0] || {};

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

        // Build diff for log
        const diffFields = { title, date, image, description, important };
        const changes = {};
        for (const [k, v] of Object.entries(diffFields)) {
          if (v === undefined) continue;
          const oldVal = oldData[k];
          const newVal = k === 'important' ? !!v : (v === null ? null : String(v));
          const oldCmp = k === 'important' ? !!oldVal : (oldVal === null ? null : String(oldVal));
          if (String(oldCmp) !== String(newVal)) {
            changes[k] = { old: oldVal, new: newVal };
          }
        }
        if (Object.keys(changes).length > 0) {
          insertAnnouncementLog('update', id, oldData.title || title, changes, req.user);
        }

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
        // Fetch old data before delete
        const [oldRows] = await pool.query('SELECT * FROM announcements WHERE id = $1', [id]);
        const oldData = oldRows[0];

        await pool.query('DELETE FROM announcements WHERE id = $1', [id]);

        // Log delete
        if (oldData) {
          const changes = {};
          if (oldData.title) changes.title = { old: oldData.title };
          if (oldData.date) changes.date = { old: oldData.date };
          if (oldData.description) changes.description = { old: oldData.description };
          if (oldData.important) changes.important = { old: oldData.important };
          insertAnnouncementLog('delete', id, oldData.title, changes, req.user);
        }

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

  // ============ Announcement Logs API ============
  app.get('/announcement-logs', authGuard, adminOnly, async (req, res) => {
    try {
      const ok = await ensureAnnouncementLogsTable();
      if (!ok) return res.json({ ok: true, data: [], hasMore: false });

      const q = String(req.query.q || '').trim();
      const action = String(req.query.action || '').trim();
      const limit = Math.min(parseInt(req.query.limit) || 50, 200);
      const offset = Math.max(parseInt(req.query.offset) || 0, 0);
      const where = [];
      const params = [];
      let idx = 1;

      if (q) {
        where.push(`(al.announcement_title ILIKE $${idx} OR al.performed_by_name ILIKE $${idx + 1})`);
        params.push(`%${q}%`, `%${q}%`);
        idx += 2;
      }
      if (action) {
        where.push(`al.action = $${idx}`);
        params.push(action);
        idx++;
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const [rows] = await pool.query(
        `SELECT al.* FROM announcement_logs al ${whereSql} ORDER BY al.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit + 1, offset]
      );
      const hasMore = rows.length > limit;
      if (hasMore) rows.pop();
      return res.json({ ok: true, data: rows, hasMore });
    } catch (e) {
      console.error('GET /announcement-logs error:', e);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });
}

module.exports = { registerAnnouncementRoutes };
