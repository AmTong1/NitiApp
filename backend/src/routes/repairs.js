const path = require('path');
const fs = require('fs-extra');
const multer = require('multer');
const sharp = require('sharp');
const { pool } = require('../db/pool');
const { authGuard } = require('../middleware/auth');
const { hasDb, tableExists, columnExists } = require('../utils/db');
const { nowIso2, rand3, isAdmin, isSuperAdmin } = require('../utils/misc');
const { UPLOAD_DIR, PROCESSED_DIR } = require('../config/paths');
const { buildBatchInsert } = require('../utils/pgHelper');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const fileFilter = (req, file, cb) => cb(null, true);
const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

let memRepairs = []; // {id,user_id,title,detail,house_number,status,created_at, photos?:[{id,url}]}
let memPhotos  = [];
let memPhotoSeq = 1;

// Ensure house_number column exists in repairs table
async function ensureRepairsHouseNumberColumn() {
  if (!(await hasDb())) return;
  if (!(await tableExists('repairs'))) return;
  if (!(await columnExists('repairs', 'house_number'))) {
    try {
      await pool.query(`ALTER TABLE repairs ADD COLUMN house_number VARCHAR(32) NULL`);
      console.log('[repairs] Added house_number column');
    } catch (e) {
      console.warn('ensureRepairsHouseNumberColumn error:', e.message);
    }
  }
}

// Ensure done_at column exists in repairs table (tracks when status changed to 'done')
async function ensureRepairsDoneAtColumn() {
  if (!(await hasDb())) return;
  if (!(await tableExists('repairs'))) return;
  if (!(await columnExists('repairs', 'done_at'))) {
    try {
      await pool.query(`ALTER TABLE repairs ADD COLUMN done_at TIMESTAMP NULL`);
      console.log('[repairs] Added done_at column');
    } catch (e) {
      console.warn('ensureRepairsDoneAtColumn error:', e.message);
    }
  }
}

// Ensure repair_delete_logs table exists
async function ensureRepairDeleteLogsTable() {
  if (!(await hasDb())) return;
  if (await tableExists('repair_delete_logs')) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS repair_delete_logs (
        id SERIAL PRIMARY KEY,
        repair_id INTEGER NOT NULL,
        repair_title VARCHAR(255),
        repair_detail TEXT,
        repair_house_number VARCHAR(32),
        repair_status VARCHAR(32),
        deleted_by INTEGER NOT NULL,
        delete_reason TEXT,
        deleted_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('[repairs] Created repair_delete_logs table');
  } catch (e) {
    console.warn('ensureRepairDeleteLogsTable error:', e.message);
  }
}

// Ensure repair_edit_logs table exists
async function ensureRepairEditLogsTable() {
  if (!(await hasDb())) return;
  if (await tableExists('repair_edit_logs')) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS repair_edit_logs (
        id BIGSERIAL PRIMARY KEY,
        repair_id INTEGER NOT NULL,
        action VARCHAR(32) NOT NULL,
        changes JSONB NULL,
        performed_by INTEGER NULL,
        performed_by_name VARCHAR(255) NULL,
        performed_by_role VARCHAR(32) NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_repair_edit_logs_repair ON repair_edit_logs(repair_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_repair_edit_logs_created ON repair_edit_logs(created_at)`);
    console.log('[repairs] Created repair_edit_logs table');
  } catch (e) {
    console.warn('ensureRepairEditLogsTable error:', e.message);
  }
}

async function insertRepairEditLog(repairId, action, changes, user) {
  try {
    await ensureRepairEditLogsTable();
    await pool.query(
      `INSERT INTO repair_edit_logs (repair_id, action, changes, performed_by, performed_by_name, performed_by_role)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        repairId, action,
        changes ? JSON.stringify(changes) : null,
        user?.id || null,
        user?.full_name || user?.username || null,
        user?.role || null
      ]
    );
  } catch (e) {
    console.warn('insertRepairEditLog error:', e.message);
  }
}

// Ensure allow_user_edit column exists (default true)
async function ensureRepairsAllowUserEditColumn() {
  if (!(await hasDb())) return;
  if (!(await tableExists('repairs'))) return;
  if (!(await columnExists('repairs', 'allow_user_edit'))) {
    try {
      await pool.query(`ALTER TABLE repairs ADD COLUMN allow_user_edit BOOLEAN DEFAULT TRUE`);
      console.log('[repairs] Added allow_user_edit column');
    } catch (e) {
      console.warn('ensureRepairsAllowUserEditColumn error:', e.message);
    }
  }
}

async function repairColumns() {
  const cols = ['id','user_id','title','detail','house_number','status','created_at','done_at'];
  if (await hasDb() && await tableExists('repairs')) {
     if (await columnExists('repairs', 'allow_user_edit')) {
       cols.push('allow_user_edit');
     }
  }
  return cols.join(', ');
}
async function getRepairByIdDb(id) {
  const cols = await repairColumns();
  const [rows] = await pool.query(`SELECT ${cols} FROM repairs WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function getPhotos(repairId) {
  const [rows] = await pool.query(
    `SELECT id, url FROM repair_photos WHERE repair_id = $1 ORDER BY id ASC`,
    [repairId]
  );
  return rows;
}
async function getRepairWithPhotos(id) {
  const item = await getRepairByIdDb(id);
  if (!item) return null;
  if (await tableExists('repair_photos')) {
    item.photos = await getPhotos(id);
  } else {
    item.photos = [];
  }
  return item;
}
async function attachPhotosToList(items) {
  if (!Array.isArray(items) || items.length === 0) return items;
  const ids = items.map(r => r.id);
  // PostgreSQL: use ANY($1) for array
  const [ph] = await pool.query(
    `SELECT repair_id, id, url FROM repair_photos WHERE repair_id = ANY($1)`,
    [ids]
  );
  const map = new Map();
  for (const r of items) map.set(r.id, []);
  for (const p of ph) map.get(p.repair_id)?.push({ id: p.id, url: p.url });
  for (const r of items) r.photos = map.get(r.id) || [];
  return items;
}

function registerRepairRoutes(app) {
  // Ensure house_number column on startup
  ensureRepairsHouseNumberColumn().catch(e => console.warn('ensureRepairsHouseNumberColumn:', e.message));
  // Ensure done_at column on startup
  ensureRepairsDoneAtColumn().catch(e => console.warn('ensureRepairsDoneAtColumn:', e.message));
  // Ensure repair_delete_logs table on startup
  ensureRepairDeleteLogsTable().catch(e => console.warn('ensureRepairDeleteLogsTable:', e.message));
  // Ensure allow_user_edit column
  ensureRepairsAllowUserEditColumn().catch(e => console.warn('ensureRepairsAllowUserEditColumn:', e.message));
  // Ensure repair_edit_logs table
  ensureRepairEditLogsTable().catch(e => console.warn('ensureRepairEditLogsTable:', e.message));

  // Upload a generic file (returns processed URL)
  app.post('/upload', authGuard, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'FILE_REQUIRED' });
      const originalPath = path.join(UPLOAD_DIR, req.file.filename);
      const baseName = path.parse(req.file.filename).name;
      const outName = `${baseName}-upload.jpg`;
      const outPath = path.join(PROCESSED_DIR, outName);

      await sharp(originalPath)
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toFile(outPath);

      const url = `/uploads/repairs/${outName}`;
      return res.status(201).json({ url });
    } catch (e) {
      console.error('POST /upload error:', e);
      return res.status(500).json({ error: 'UPLOAD_FAILED', message: e.message });
    }
  });

  // List repairs (+photos)
  app.get('/repairs', authGuard, async (req, res) => {
    try {
      const usable = (await hasDb()) && (await tableExists('repairs'));
      if (!usable) {
        const userId = String(req.user.id);
        let list = isAdmin(req.user) ? memRepairs : memRepairs.filter(r => String(r.user_id) === userId);
        // สำหรับ admin: เรียงให้ done อยู่ล่างสุด
        if (isAdmin(req.user)) {
          list = [...list].sort((a, b) => {
            if (a.status === 'done' && b.status !== 'done') return 1;
            if (a.status !== 'done' && b.status === 'done') return -1;
            return new Date(b.created_at) - new Date(a.created_at);
          });
        } else {
          // สำหรับ user: ซ่อน done ที่เกิน 7 วัน
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          list = list.filter(r => {
            if (r.status !== 'done') return true;
            const doneAt = r.done_at ? new Date(r.done_at) : null;
            return doneAt && doneAt > sevenDaysAgo;
          });
        }
        return res.json(list);
      }

      // ถ้าเป็น admin ดูได้ทั้งหมด ถ้าเป็น user ดูได้เฉพาะที่ user_id ตรง หรือ house_number ที่ user เป็นเจ้าของ
      let userHouseNumbers = [];
      if (!isAdmin(req.user)) {
        // หา house_number ที่ user เป็นเจ้าของ
        const [houseRows] = await pool.query(
          `SELECT house_number FROM residents WHERE account_id = $1`,
          [req.user.id]
        );
        userHouseNumbers = houseRows.map(r => r.house_number);
      }

      const userId = isAdmin(req.user) ? null : String(req.user.id);
      const where = [];
      const params = [];
      
      if (userId) {
        // user เห็นได้ทั้งที่ user_id ตรง และ house_number ที่เป็นเจ้าของ
        if (userHouseNumbers.length > 0) {
          where.push(`(user_id = $1 OR house_number = ANY($2))`);
          params.push(userId, userHouseNumbers);
          // สำหรับ user: ซ่อน done ที่เกิน 7 วัน
          where.push(`(status != 'done' OR (status = 'done' AND done_at > NOW() - INTERVAL '7 days'))`);
        } else {
          where.push('user_id = $1');
          params.push(userId);
          // สำหรับ user: ซ่อน done ที่เกิน 7 วัน
          where.push(`(status != 'done' OR (status = 'done' AND done_at > NOW() - INTERVAL '7 days'))`);
        }
      }
      
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const cols = await repairColumns();

      // สำหรับ admin: ORDER BY เพื่อให้ done อยู่ล่างสุด
      const orderBy = isAdmin(req.user) 
        ? `ORDER BY CASE WHEN status = 'done' THEN 1 ELSE 0 END, created_at DESC`
        : `ORDER BY created_at DESC`;

      const [rows] = await pool.query(
        `SELECT ${cols}
           FROM repairs
         ${whereSql}
         ${orderBy}`,
        params
      );
      if (await tableExists('repair_photos')) await attachPhotosToList(rows);
      res.json(rows);
    } catch (e) {
      console.error('GET /repairs error:', e);
      res.status(500).json({ error: `REPAIRS_LIST_FAILED: ${e.message}` });
    }
  });

  // ===== SuperAdmin: Get all repair logs =====
  app.get('/repairs/logs', authGuard, async (req, res) => {
    try {
      if (!isSuperAdmin(req.user) && !isAdmin(req.user)) {
        return res.status(403).json({ error: 'ADMIN_ONLY' });
      }

      if (!(await hasDb()) || !(await tableExists('repairs'))) {
        return res.json({ ok: true, data: [] });
      }

      const search = String(req.query.search || '').trim();
      const statusFilter = String(req.query.status || '').trim();
      const limit = Math.max(1, Math.min(500, Number(req.query.limit || 200)));

      const conditions = [];
      const params = [];
      let idx = 1;

      if (search) {
        conditions.push(`(r.title ILIKE $${idx} OR r.house_number ILIKE $${idx} OR r.detail ILIKE $${idx} OR a.full_name ILIKE $${idx} OR a.username ILIKE $${idx})`);
        params.push(`%${search}%`);
        idx++;
      }
      if (statusFilter && ['pending', 'in_progress', 'done'].includes(statusFilter)) {
        conditions.push(`r.status = $${idx}::repair_status_type`);
        params.push(statusFilter);
        idx++;
      }

      const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

      const sql = `
        SELECT r.id, r.user_id, r.title, r.detail, r.house_number, r.status,
               r.created_at, r.done_at,
               a.username AS reporter_username,
               a.full_name AS reporter_fullname
        FROM repairs r
        LEFT JOIN accounts a ON r.user_id = a.id
        ${whereClause}
        ORDER BY r.created_at DESC
        LIMIT $${idx}
      `;
      params.push(limit);

      const [rows] = await pool.query(sql, params);

      // Attach photos
      if (rows.length > 0 && await tableExists('repair_photos')) {
        const ids = rows.map(r => r.id);
        const [photos] = await pool.query(
          `SELECT repair_id, id, url FROM repair_photos WHERE repair_id = ANY($1) ORDER BY id ASC`,
          [ids]
        );
        const photoMap = new Map();
        for (const r of rows) photoMap.set(r.id, []);
        for (const p of photos) photoMap.get(p.repair_id)?.push({ id: p.id, url: p.url });
        for (const r of rows) {
          r.photos = photoMap.get(r.id) || [];
          r.photo_count = r.photos.length;
        }
      }

      return res.json({ ok: true, data: rows || [] });
    } catch (e) {
      console.error('GET /repairs/logs error:', e);
      res.status(500).json({ ok: false, message: 'Failed to fetch repair logs', error: e.message });
    }
  });

  // ===== Get edit history for repairs =====
  app.get('/repairs/edit-logs', authGuard, async (req, res) => {
    try {
      if (!isAdmin(req.user) && !isSuperAdmin(req.user)) {
        return res.status(403).json({ error: 'ADMIN_ONLY' });
      }
      await ensureRepairEditLogsTable();

      const repairId = req.query.repair_id ? Number(req.query.repair_id) : null;
      const conditions = [];
      const params = [];
      let idx = 1;

      if (repairId) {
        conditions.push(`el.repair_id = $${idx++}`);
        params.push(repairId);
      }

      const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
      const limit = Math.max(1, Math.min(500, Number(req.query.limit || 200)));

      const [rows] = await pool.query(`
        SELECT el.*, r.title AS repair_title, r.house_number AS repair_house_number
        FROM repair_edit_logs el
        LEFT JOIN repairs r ON r.id = el.repair_id
        ${whereClause}
        ORDER BY el.created_at DESC
        LIMIT $${idx}
      `, [...params, limit]);

      return res.json({ ok: true, data: rows || [] });
    } catch (e) {
      console.error('GET /repairs/edit-logs error:', e);
      res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  // ===== SuperAdmin: Get delete logs ===== (MUST be before /repairs/:id)
  app.get('/repairs/delete-logs', authGuard, async (req, res) => {
    try {
      // Only superadmin can view delete logs
      if (!isSuperAdmin(req.user)) {
        return res.status(403).json({ error: 'SUPERADMIN_ONLY' });
      }
      
      if (!(await hasDb()) || !(await tableExists('repair_delete_logs'))) {
        return res.json([]);
      }

      // Join with accounts to get deleter info, and get house_number from residents
      const [logs] = await pool.query(`
        SELECT 
          dl.id,
          dl.repair_id,
          dl.repair_title,
          dl.repair_detail,
          dl.repair_house_number,
          dl.repair_status,
          dl.deleted_by,
          dl.delete_reason,
          dl.deleted_at,
          a.username as deleted_by_username,
          a.full_name as deleted_by_fullname,
          a.role as deleted_by_role,
          r.house_number as deleted_by_house_number
        FROM repair_delete_logs dl
        LEFT JOIN accounts a ON dl.deleted_by = a.id
        LEFT JOIN residents r ON dl.deleted_by = r.account_id
        ORDER BY dl.deleted_at DESC
        LIMIT 100
      `);
      
      // Format response - ถ้าเป็น admin แสดง "Admin" ถ้าเป็น superadmin แสดง "SuperAdmin"
      const formatted = logs.map(log => ({
        ...log,
        deleted_by_display: log.deleted_by_role === 'superadmin' 
          ? 'SuperAdmin' 
          : (log.deleted_by_role === 'admin' ? 'Admin' : 'User'),
        deleted_by_name: log.deleted_by_fullname || log.deleted_by_username || 'ไม่ทราบ',
      }));
      
      res.json(formatted);
    } catch (e) {
      console.error('GET /repairs/delete-logs error:', e);
      res.status(500).json({ error: `DELETE_LOGS_FAILED: ${e.message}` });
    }
  });

  // Get one repair (+photos)
  app.get('/repairs/:id', authGuard, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'INVALID_ID' });
      const usable = (await hasDb()) && (await tableExists('repairs'));

      if (!usable) {
        const found = memRepairs.find(r => r.id === id);
        if (!found) return res.status(404).json({ error: 'NOT_FOUND' });
        if (!isAdmin(req.user) && String(found.user_id) !== String(req.user.id)) {
          return res.status(403).json({ error: 'FORBIDDEN' });
        }
        return res.json(found);
      }

      const item = await getRepairWithPhotos(id);
      if (!item) return res.status(404).json({ error: 'NOT_FOUND' });
      
      // ตรวจสอบสิทธิ์: admin ดูได้ทั้งหมด, user ดูได้ถ้า user_id ตรง หรือ house_number เป็นของตัวเอง
      if (!isAdmin(req.user)) {
        const isOwnerByUserId = String(item.user_id) === String(req.user.id);
        let isOwnerByHouse = false;
        
        if (item.house_number) {
          const [houseRows] = await pool.query(
            `SELECT account_id FROM residents WHERE house_number = $1`,
            [item.house_number]
          );
          isOwnerByHouse = houseRows.length > 0 && String(houseRows[0].account_id) === String(req.user.id);
        }
        
        if (!isOwnerByUserId && !isOwnerByHouse) {
          return res.status(403).json({ error: 'FORBIDDEN' });
        }
      }
      
      res.json(item);
    } catch (e) {
      console.error('GET /repairs/:id error:', e);
      res.status(500).json({ error: `REPAIRS_GET_FAILED: ${e.message}` });
    }
  });

  // Create repair (supports body.images[])
  app.post('/repairs', authGuard, async (req, res) => {
    try {
      const { title, detail, images, house_number, allow_user_edit } = req.body || {};
      if (!title || !String(title).trim()) {
        return res.status(400).json({ error: 'TITLE_REQUIRED' });
      }
      
      let userId = String(req.user.id);
      const cleanTitle = String(title).trim();
      const cleanDetail = detail ?? null;
      const cleanHouseNumber = house_number ? String(house_number).trim() : null;

      // Allow admin to set allow_user_edit (default true)
      // If NOT admin, force true
      const canSetEdit = isAdmin(req.user);
      const finalAllowEdit = canSetEdit && allow_user_edit === false ? false : true;

      // ถ้า admin สร้างและระบุ house_number → หา account_id ของเจ้าของบ้านมาใช้เป็น user_id
      if (isAdmin(req.user) && cleanHouseNumber) {
        try {
          const [ownerRows] = await pool.query(
            `SELECT account_id FROM residents WHERE house_number = $1`,
            [cleanHouseNumber]
          );
          if (ownerRows.length > 0 && ownerRows[0].account_id) {
            userId = String(ownerRows[0].account_id);
          }
        } catch (e) {
          console.warn('Failed to lookup house owner:', e.message);
        }
      }

      const usable = (await hasDb()) && (await tableExists('repairs'));
      const hasPhotosTable = usable && (await tableExists('repair_photos'));

      if (!usable) {
        let id, tries = 0;
        do { id = rand3(); tries++; if (tries > 1000) return res.status(409).json({ error:'ID_SPACE_EXHAUSTED' }); }
        while (memRepairs.some(r => r.id === id));

        const item = { id, user_id: userId, title: cleanTitle, detail: cleanDetail, house_number: cleanHouseNumber, status: 'pending', created_at: nowIso2(), photos: [], allow_user_edit: finalAllowEdit };
        if (Array.isArray(images) && images.length) {
          for (const u of images.slice(0,10)) {
            const pid = memPhotoSeq++;
            memPhotos.push({ id: pid, repair_id: id, url: u });
            item.photos.push({ id: pid, url: u });
          }
        }
        memRepairs.unshift(item);
        return res.status(201).json(item);
      }

      let attempts = 0;
      while (attempts < 20) {
        const id = rand3();
        try {
          const hasCol = await columnExists('repairs', 'allow_user_edit');
          if (hasCol) {
             await pool.query(
              `INSERT INTO repairs (id, user_id, title, detail, house_number, status, allow_user_edit)
               VALUES ($1, $2, $3, $4, $5, 'pending', $6)`,
              [id, userId, cleanTitle, cleanDetail, cleanHouseNumber, finalAllowEdit]
            );
          } else {
             await pool.query(
              `INSERT INTO repairs (id, user_id, title, detail, house_number, status)
               VALUES ($1, $2, $3, $4, $5, 'pending')`,
              [id, userId, cleanTitle, cleanDetail, cleanHouseNumber]
            );
          }
          if (hasPhotosTable && Array.isArray(images) && images.length) {
            const valuesArray = images.slice(0,10).map(u => [id, u]);
            const { sql, params } = buildBatchInsert('repair_photos', ['repair_id', 'url'], valuesArray);
            await pool.query(sql, params);
          }
          const item = await getRepairWithPhotos(id);
          return res.status(201).json(item);
        } catch (err) {
          // PostgreSQL: duplicate key error code is 23505
          if (err && err.code === '23505') { attempts++; continue; }
          throw err;
        }
      }
      return res.status(409).json({ error: 'ID_SPACE_EXHAUSTED' });
    } catch (e) {
      console.error('POST /repairs error:', e);
      res.status(500).json({ error: `REPAIRS_CREATE_FAILED: ${e.message}` });
    }
  });

  // Update repair
  app.put('/repairs/:id', authGuard, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'INVALID_ID' });
      const { title, detail, status } = req.body || {};
      const usable = (await hasDb()) && (await tableExists('repairs'));

      if (!usable) {
        const idx = memRepairs.findIndex(r => r.id === id);
        if (idx === -1) return res.status(404).json({ error: 'NOT_FOUND' });
        const item = memRepairs[idx];
        const owner = String(item.user_id) === String(req.user.id);
        if (!owner && !isAdmin(req.user)) return res.status(403).json({ error: 'FORBIDDEN' });
        
        // If locked by admin, owner cannot edit
        if (item.allow_user_edit === false && !isAdmin(req.user)) {
             return res.status(403).json({ error: 'LOCKED_BY_ADMIN' });
        }

        if (title  !== undefined) item.title  = String(title);
        if (detail !== undefined) item.detail = detail ?? null;
        if (status !== undefined) {
          if (!isAdmin(req.user)) return res.status(403).json({ error: 'ONLY_ADMIN_CAN_UPDATE_STATUS' });
          const st = String(status);
          if (!['pending','in_progress','done'].includes(st)) return res.status(400).json({ error: 'INVALID_STATUS' });
          // track done_at
          if (st === 'done' && item.status !== 'done') {
            item.done_at = new Date().toISOString();
          } else if (st !== 'done') {
            item.done_at = null;
          }
          item.status = st;
        }
        memRepairs[idx] = item;
        return res.json(item);
      }

      const [rows0] = await pool.query(`SELECT * FROM repairs WHERE id = $1`, [id]);
      const exist = rows0[0];
      if (!exist) return res.status(404).json({ error: 'NOT_FOUND' });
      const owner = String(exist.user_id) === String(req.user.id);
      if (!owner && !isAdmin(req.user)) return res.status(403).json({ error: 'FORBIDDEN' });

      // If locked by admin, owner cannot edit
      if (exist.allow_user_edit === false && !isAdmin(req.user)) {
         return res.status(403).json({ error: 'LOCKED_BY_ADMIN' });
      }

      const fields = [], params = [];
      let paramIdx = 1;
      if (title  !== undefined) { fields.push(`title = $${paramIdx++}`);  params.push(String(title)); }
      if (detail !== undefined) { fields.push(`detail = $${paramIdx++}`); params.push(detail ?? null); }
      if (status !== undefined) {
        if (!isAdmin(req.user)) return res.status(403).json({ error: 'ONLY_ADMIN_CAN_UPDATE_STATUS' });
        const st = String(status);
        if (!['pending','in_progress','done'].includes(st)) return res.status(400).json({ error: 'INVALID_STATUS' });
        fields.push(`status = $${paramIdx++}`); params.push(st);
        // track done_at: set เมื่อเปลี่ยนเป็น done, clear เมื่อเปลี่ยนเป็นอย่างอื่น
        if (st === 'done' && exist.status !== 'done') {
          fields.push(`done_at = NOW()`);
        } else if (st !== 'done' && exist.status === 'done') {
          fields.push(`done_at = NULL`);
        }
      }
      if (fields.length === 0) return res.status(400).json({ error: 'NO_FIELDS_TO_UPDATE' });

      params.push(id);
      await pool.query(`UPDATE repairs SET ${fields.join(', ')} WHERE id = $${paramIdx}`, params);

      // Log edit history
      const editChanges = {};
      if (title !== undefined && String(title) !== String(exist.title)) {
        editChanges.title = { old: exist.title, new: String(title) };
      }
      if (detail !== undefined && String(detail ?? '') !== String(exist.detail ?? '')) {
        editChanges.detail = { old: exist.detail || null, new: detail ?? null };
      }
      if (status !== undefined && String(status) !== String(exist.status)) {
        editChanges.status = { old: exist.status, new: String(status) };
      }
      if (Object.keys(editChanges).length > 0) {
        const action = status !== undefined && Object.keys(editChanges).length === 1 && editChanges.status
          ? 'status_change' : 'edit';
        await insertRepairEditLog(id, action, editChanges, req.user);
      }

      const item = await getRepairWithPhotos(id);
      res.json(item);
    } catch (e) {
      console.error('PUT /repairs/:id error:', e);
      res.status(500).json({ error: `REPAIRS_UPDATE_FAILED: ${e.message}` });
    }
  });

  // Delete repair (cascade photos) - รับ delete_reason สำหรับบันทึก log
  app.delete('/repairs/:id', authGuard, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'INVALID_ID' });
      const { delete_reason } = req.body || {};
      const usable = (await hasDb()) && (await tableExists('repairs'));
      if (!usable) {
        const idx = memRepairs.findIndex(r => r.id === id);
        if (idx === -1) return res.status(404).json({ error: 'NOT_FOUND' });
        const item = memRepairs[idx];
        const owner = String(item.user_id) === String(req.user.id);
        if (!owner && !isAdmin(req.user)) return res.status(403).json({ error: 'FORBIDDEN' });
        memPhotos = memPhotos.filter(p => p.repair_id !== id);
        memRepairs.splice(idx, 1);
        return res.json({ ok: true });
      }

      const [rows0] = await pool.query(`SELECT * FROM repairs WHERE id = $1`, [id]);
      const exist = rows0[0];
      if (!exist) return res.status(404).json({ error: 'NOT_FOUND' });
      const owner = String(exist.user_id) === String(req.user.id);
      if (!owner && !isAdmin(req.user)) return res.status(403).json({ error: 'FORBIDDEN' });

      // บันทึก log การลบ (ถ้ามี delete_reason หรือต้องการเก็บ log ทุกครั้ง)
      if (await tableExists('repair_delete_logs')) {
        await pool.query(
          `INSERT INTO repair_delete_logs (repair_id, repair_title, repair_detail, repair_house_number, repair_status, deleted_by, delete_reason)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, exist.title, exist.detail, exist.house_number, exist.status, req.user.id, delete_reason || null]
        );
      }

      await pool.query(`DELETE FROM repair_photos WHERE repair_id = $1`, [id]);
      await pool.query(`DELETE FROM repairs WHERE id = $1`, [id]);
      res.json({ ok: true });
    } catch (e) {
      console.error('DELETE /repairs/:id error:', e);
      res.status(500).json({ error: `REPAIRS_DELETE_FAILED: ${e.message}` });
    }
  });

  // Upload a photo to a repair
  app.post('/repairs/:id/image', authGuard, upload.single('file'), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'INVALID_ID' });
      if (!req.file) return res.status(400).json({ error: 'FILE_REQUIRED' });

      const usable = (await hasDb()) && (await tableExists('repairs'));

      if (!usable) {
        const item = memRepairs.find(r => r.id === id);
        if (!item) return res.status(404).json({ error: 'NOT_FOUND' });
        const owner = String(item.user_id) === String(req.user.id);
        if (!owner && !isAdmin(req.user)) return res.status(403).json({ error: 'FORBIDDEN' });

        // If locked by admin, owner cannot add photo
        if (item.allow_user_edit === false && !isAdmin(req.user)) {
             return res.status(403).json({ error: 'LOCKED_BY_ADMIN' });
        }

        const originalPath = path.join(UPLOAD_DIR, req.file.filename);
        const baseName = path.parse(req.file.filename).name;
        const outName = `${baseName}-repair.jpg`;
        await sharp(originalPath)
          .rotate()
          .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 82, mozjpeg: true })
          .toFile(path.join(PROCESSED_DIR, outName));

        const url = `/uploads/repairs/${outName}`;
        const pid = memPhotoSeq++;
        memPhotos.push({ id: pid, repair_id: id, url });
        item.photos = [...(item.photos || []), { id: pid, url }];
        return res.json(item);
      }

      const exist = await getRepairByIdDb(id);
      if (!exist) return res.status(404).json({ error: 'NOT_FOUND' });
      const owner = String(exist.user_id) === String(req.user.id);
      if (!owner && !isAdmin(req.user)) return res.status(403).json({ error: 'FORBIDDEN' });

      // If locked by admin, owner cannot add photo
      if (exist.allow_user_edit === false && !isAdmin(req.user)) {
           return res.status(403).json({ error: 'LOCKED_BY_ADMIN' });
      }

      const originalPath = path.join(UPLOAD_DIR, req.file.filename);
      const baseName = path.parse(req.file.filename).name;
      const outName = `${baseName}-repair.jpg`;
      await sharp(originalPath)
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toFile(path.join(PROCESSED_DIR, outName));

      const url = `/uploads/repairs/${outName}`;
      await pool.query(`INSERT INTO repair_photos (repair_id, url) VALUES ($1, $2)`, [id, url]);
      const item = await getRepairWithPhotos(id);
      res.json(item);
    } catch (e) {
      console.error('POST /repairs/:id/image error:', e);
      res.status(500).json({ error: 'REPAIR_IMAGE_UPLOAD_FAILED', message: e.message });
    }
  });

  // Delete one photo from a repair
  app.delete('/repairs/:id/image/:pid', authGuard, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const pid = Number(req.params.pid);
      if (isNaN(id) || isNaN(pid)) return res.status(400).json({ error: 'INVALID_ID' });
      const usable = (await hasDb()) && (await tableExists('repairs'));

      // Helper to remove physical file if it exists
      const removeFileByUrl = async (url) => {
        try {
          if (!url || typeof url !== 'string') return;
          // Expect url like /uploads/repairs/<filename>.jpg
          const base = '/uploads/repairs/';
          if (!url.startsWith(base)) return;
          const filename = path.basename(url);
          const filePath = path.join(PROCESSED_DIR, filename);
          await fs.remove(filePath);
        } catch (e) {
          // ignore file removal errors
        }
      };

      if (!usable) {
        const item = memRepairs.find(r => r.id === id);
        if (!item) return res.status(404).json({ error: 'NOT_FOUND' });
        const owner = String(item.user_id) === String(req.user.id);
        if (!owner && !isAdmin(req.user)) return res.status(403).json({ error: 'FORBIDDEN' });

        // If locked by admin, owner cannot delete photo
        if (item.allow_user_edit === false && !isAdmin(req.user)) {
             return res.status(403).json({ error: 'LOCKED_BY_ADMIN' });
        }

        const idx = memPhotos.findIndex(p => p.id === pid && p.repair_id === id);
        if (idx === -1) return res.status(404).json({ error: 'PHOTO_NOT_FOUND' });
        const photo = memPhotos[idx];
        memPhotos.splice(idx, 1);
        if (Array.isArray(item.photos)) item.photos = item.photos.filter(p => p.id !== pid);
        await removeFileByUrl(photo.url);
        return res.json({ ok: true });
      }

      // DB mode
      const exist = await getRepairByIdDb(id);
      if (!exist) return res.status(404).json({ error: 'NOT_FOUND' });
      const owner = String(exist.user_id) === String(req.user.id);
      if (!owner && !isAdmin(req.user)) return res.status(403).json({ error: 'FORBIDDEN' });

      // If locked by admin, owner cannot delete photo
      if (exist.allow_user_edit === false && !isAdmin(req.user)) {
           return res.status(403).json({ error: 'LOCKED_BY_ADMIN' });
      }

      const [rows] = await pool.query(
        `SELECT id, url FROM repair_photos WHERE id = $1 AND repair_id = $2`,

        [pid, id]
      );
      const photo = rows[0];
      if (!photo) return res.status(404).json({ error: 'PHOTO_NOT_FOUND' });

      await pool.query(`DELETE FROM repair_photos WHERE id = $1 AND repair_id = $2`, [pid, id]);
      await removeFileByUrl(photo.url);
      return res.json({ ok: true });
    } catch (e) {
      console.error('DELETE /repairs/:id/image/:pid error:', e);
      res.status(500).json({ error: `REPAIR_IMAGE_DELETE_FAILED: ${e.message}` });
    }
  });
}

module.exports = { registerRepairRoutes };
