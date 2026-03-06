const bcrypt = require('bcrypt');   // ใช้แพ็กเกจที่มีอยู่แล้ว
const { authGuard, adminOnly } = require('../middleware/auth');
const { pool } = require('../db/pool');
const { hasDb, columnExists } = require('../utils/db');

// ============ Resident Logs ============
async function ensureResidentLogsTable() {
  if (!(await hasDb())) return false;
  await pool.query(`CREATE TABLE IF NOT EXISTS resident_logs (
    id BIGSERIAL PRIMARY KEY,
    action VARCHAR(32) NOT NULL,
    resident_id BIGINT NULL,
    house_number VARCHAR(32) NULL,
    resident_name VARCHAR(255) NULL,
    changes JSONB NULL,
    performed_by BIGINT NULL,
    performed_by_name VARCHAR(255) NULL,
    performed_by_role VARCHAR(32) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  return true;
}

async function insertResidentLog(action, { residentId, houseNumber, residentName, changes, user }) {
  try {
    await ensureResidentLogsTable();
    const performedBy = user?.id || null;
    const performedByName = user?.full_name || user?.username || null;
    const performedByRole = user?.role || null;
    await pool.query(
      `INSERT INTO resident_logs (action, resident_id, house_number, resident_name, changes, performed_by, performed_by_name, performed_by_role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [action, residentId || null, houseNumber || null, residentName || null,
       changes ? JSON.stringify(changes) : null, performedBy, performedByName, performedByRole]
    );
  } catch (e) {
    console.warn('insertResidentLog error:', e.message);
  }
}
// ============ End Resident Logs ============

let mockResidents = (global.mockResidents ?? [
  { id: 1, house_number: '101', title: 'นาย', first_name: 'สมชาย', last_name: 'ใจดี', phone: '0812345678', household_count: 3, car_count: 1 },
  { id: 2, house_number: '102', title: 'นางสาว', first_name: 'สมหญิง', last_name: 'สุขสันต์', phone: '0899998888', household_count: 2, car_count: 0 },
]);
let mockSeq = mockResidents.length ? Math.max(...mockResidents.map(r => r.id)) : 0;
global.mockResidents = mockResidents;

// เช็กว่ามี index อยู่หรือยัง - PostgreSQL version
async function indexExists(table, indexName) {
  const [rows] = await pool.query(
    `SELECT COUNT(1) AS c FROM pg_indexes WHERE tablename = $1 AND indexname = $2`,
    [table, indexName]
  );
  return (Number(rows?.[0]?.c) || 0) > 0;
}

// ✅ เพิ่มคอลัมน์ pay_months ถ้ายังไม่มี
async function ensureResidentsTable() {
  if (!(await hasDb())) return false;
  await pool.query(`CREATE TABLE IF NOT EXISTS residents (
    id SERIAL PRIMARY KEY,
    house_number VARCHAR(32) NOT NULL,
    title VARCHAR(32) NULL,
    first_name VARCHAR(64) NOT NULL,
    last_name VARCHAR(64) NULL,
    phone VARCHAR(32) NULL,
    household_count INT NOT NULL DEFAULT 1,
    car_count INT NOT NULL DEFAULT 0,
    pay_months INT NULL,
    account_id BIGINT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL
  )`);
  // ให้แน่ใจว่ามีคอลัมน์ phone
  if (!(await columnExists('residents', 'phone'))) {
    await pool.query(`ALTER TABLE residents ADD COLUMN phone VARCHAR(32) NULL`);
  }
  // เพิ่ม unique index
  try {
    if (!(await indexExists('residents', 'uniq_residents_phone'))) {
      await pool.query(`CREATE UNIQUE INDEX uniq_residents_phone ON residents (phone)`);
    }
  } catch (e) {
    console.warn('ensureResidentsTable: phone unique index', e.message);
  }
  return true;
}

async function ensureHousesTable() {
  if (!(await hasDb())) return false;
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS houses (
      id SERIAL PRIMARY KEY,
      house_number VARCHAR(32) NOT NULL UNIQUE,
      owner_name VARCHAR(128) NULL,
      area_sq_m DECIMAL(10,2) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    return true;
  } catch (e) {
    console.warn('ensureHousesTable error:', e.message);
    return false;
  }
}

async function ensureAccountsTable() {
  if (!(await hasDb())) return false;
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS accounts (
      id BIGSERIAL PRIMARY KEY,
      username VARCHAR(64) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      full_name VARCHAR(255) NULL,
      role VARCHAR(10) NOT NULL DEFAULT 'user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    return true;
  } catch (e) {
    console.warn('ensureAccountsTable error:', e.message);
    return false;
  }
}

// PostgreSQL: duplicate key error code is 23505
function isDup(err) { return err?.code === '23505'; }
function dupField(err) {
  const m = String(err?.detail || err?.message || '').toLowerCase();
  if (m.includes('house_number')) return 'house_number';
  if (m.includes('username')) return 'username';
  if (m.includes('phone')) return 'phone';
  return undefined;
}

/**
 * บันทึกประวัติชำระครั้งแรกแบบยืดหยุ่นกับ schema (ถ้าไม่ครบจะข้าม)
 * ใช้ connection ที่รับมา (db = pool หรือ client ใน transaction)
 */
async function insertInitialPayment(db, { houseNumber, months, areaProvided }) {
  const monthsNum = Number(months || 0);
  if (!Number.isInteger(monthsNum) || monthsNum <= 0) return;
  try {
    // sync houses table
    let area = areaProvided != null ? Number(areaProvided) : null;
    let houseId = null;
    const hResult = await db.query(
      'SELECT id, area_sq_m FROM houses WHERE house_number = $1 LIMIT 1',
      [String(houseNumber)]
    );
    const hrows = hResult.rows || hResult[0];
    if (hrows && hrows[0]) {
      houseId = hrows[0].id ?? null;
      if (area == null && hrows[0].area_sq_m != null) area = Number(hrows[0].area_sq_m);
    }

    // ถ้ายังไม่มีบ้าน ให้สร้างจากข้อมูลใน residents
    if (!houseId) {
      const rResult = await db.query(
        'SELECT title, first_name, last_name, house_number FROM residents WHERE house_number = $1 LIMIT 1',
        [String(houseNumber)]
      );
      const rrows = rResult.rows || rResult[0];
      const r = rrows?.[0];
      const ownerName = r ? [r.title, r.first_name, r.last_name].filter(Boolean).join(' ').trim() || null : null;
      await db.query(
        `INSERT INTO houses (house_number, owner_name, area_sq_m)
         VALUES ($1, $2, $3)
         ON CONFLICT (house_number) DO UPDATE SET
           owner_name = COALESCE(EXCLUDED.owner_name, houses.owner_name),
           area_sq_m = COALESCE(EXCLUDED.area_sq_m, houses.area_sq_m)`,
        [String(houseNumber), ownerName, Number.isFinite(area) ? area : null]
      );
      // ดึง id อีกรอบ
      const againResult = await db.query('SELECT id, area_sq_m FROM houses WHERE house_number = $1 LIMIT 1', [String(houseNumber)]);
      const again = againResult.rows || againResult[0];
      if (again && again[0]) {
        houseId = again[0].id ?? null;
        if (area == null && again[0].area_sq_m != null) area = Number(again[0].area_sq_m);
      }
    }

    if (!Number.isFinite(area)) return;

  // Get rate from settings or default 10
  let rate = 10;
  try {
    const resOrRows = await db.query("SELECT value FROM system_settings WHERE key = 'rate_per_sqm'");
    // Handle both pool wrapper ([rows]) and pg client ({rows})
    const rows = Array.isArray(resOrRows) ? resOrRows[0] : (resOrRows.rows || []);
    if (rows && rows.length > 0) {
      const val = rows[0].value;
      if (val && !isNaN(val)) rate = Number(val);
    }
  } catch (e) { console.warn('get rate error', e.message); }


    const perMonth = area * rate;
    const total = perMonth * monthsNum;

    // ตรวจคอลัมน์ที่มีจริงใน payments
    const colsResult = await db.query(
      `SELECT column_name FROM information_schema.columns WHERE table_catalog = current_database() AND table_name = 'payments'`
    );
    const colsRows = colsResult.rows || colsResult[0] || [];
    const colSet = new Set((colsRows || []).map(r => String(r.column_name).toLowerCase()));

    const cols = [];
    const vals = [];

    // ถ้ามี house_id (FK) ต้องใส่ และต้องมีค่า
    if (colSet.has('house_id')) {
      if (!houseId) {
        console.warn('insertInitialPayment: missing houseId for', houseNumber);
        return;
      }
      cols.push('house_id'); vals.push(houseId);
    }
    if (colSet.has('house_number')) { cols.push('house_number'); vals.push(String(houseNumber)); }
    if (colSet.has('area_sq_m')) { cols.push('area_sq_m'); vals.push(area); }
    if (colSet.has('rate_per_sqm')) { cols.push('rate_per_sqm'); vals.push(rate); }
    if (colSet.has('months')) { cols.push('months'); vals.push(monthsNum); }
    if (colSet.has('amount_per_month')) { cols.push('amount_per_month'); vals.push(perMonth); }
    if (colSet.has('total_amount')) { cols.push('total_amount'); vals.push(total); }
    if (colSet.has('note')) { cols.push('note'); vals.push('Initial payment'); }

    if (!cols.length) return;
    const ph = cols.map((_, i) => `$${i + 1}`).join(', ');

    console.log(`[payments] insert: house=${houseNumber}, house_id=${houseId}, area=${area}, months=${monthsNum}, per=${perMonth}, total=${total}`);
    await db.query(`INSERT INTO payments (${cols.join(', ')}) VALUES (${ph})`, vals);
  } catch (e) {
    console.warn('insertInitialPayment warn:', e.message);
  }
}

// ฟังก์ชัน upsertPayment - PostgreSQL version
async function upsertPayment(db, { houseNumber, months, areaProvided }) {
  const m = Number(months);
  if (!Number.isInteger(m) || m < 0) return;
  let area = areaProvided != null ? Number(areaProvided) : null;
  if (!Number.isFinite(area)) {
    const hResult = await db.query('SELECT area_sq_m FROM houses WHERE house_number = $1 LIMIT 1', [String(houseNumber)]);
    const h = hResult.rows || hResult[0];
    if (h?.[0]?.area_sq_m != null) area = Number(h[0].area_sq_m);
  }
  if (!Number.isFinite(area)) return;
  // Get rate from settings or default 10
  let rate = 10;
  try {
    const resOrRows = await db.query("SELECT value FROM system_settings WHERE key = 'rate_per_sqm'");
    const rows = Array.isArray(resOrRows) ? resOrRows[0] : (resOrRows.rows || []);
    if (rows && rows.length > 0) {
      const val = rows[0].value;
      if (val && !isNaN(val)) rate = Number(val);
    }
  } catch (e) { console.warn('get rate error', e.message); }

  const per = area * rate;
  const total = per * m;

  const existResult = await db.query('SELECT id, created_at FROM payments WHERE house_number = $1 LIMIT 1', [String(houseNumber)]);
  const existRows = existResult.rows || existResult[0];
  if (existRows[0]) {
    // PostgreSQL: use INTERVAL and EXTRACT instead of DATE_ADD/TIMESTAMPDIFF
    await db.query(
      `UPDATE payments
         SET area_sq_m = $1,
             rate_per_sqm = $2,
             months = $3,
             amount_per_month = $4,
             total_amount = $5,
             note = 'Current',
             cover_until = created_at + ($6 || ' months')::INTERVAL,
             pay_status = (CASE
               WHEN $7 > 0 AND (created_at + ($8 || ' months')::INTERVAL) > NOW() THEN 'paid'
               WHEN $9 > 0 THEN 'pending'
               ELSE 'overdue'
             END)::pay_status_type,
             remaining_days = CASE
               WHEN $10 > 0 AND (created_at + ($11 || ' months')::INTERVAL) > NOW()
                 THEN GREATEST(0, EXTRACT(DAY FROM ((created_at + ($12 || ' months')::INTERVAL) - NOW())))::INT
               ELSE 0
             END
       WHERE house_number = $13`,
      [area, rate, m, per, total,
       m,
       m, m,
       m,
       m, m, m,
       String(houseNumber)]
    );
  } else {
    await db.query(
      `INSERT INTO payments
        (house_number, area_sq_m, rate_per_sqm, months, amount_per_month, total_amount, note,
         cover_until, pay_status, remaining_days)
       VALUES ($1, $2, $3, $4, $5, $6, 'Current',
         NOW() + ($7 || ' months')::INTERVAL,
         (CASE WHEN $8 > 0 THEN 'paid' ELSE 'overdue' END)::pay_status_type,
         CASE WHEN $9 > 0 THEN GREATEST(0, EXTRACT(DAY FROM ((NOW() + ($10 || ' months')::INTERVAL) - NOW())))::INT ELSE 0 END
       )
       ON CONFLICT (house_number) DO UPDATE SET
         area_sq_m = EXCLUDED.area_sq_m,
         rate_per_sqm = EXCLUDED.rate_per_sqm,
         months = EXCLUDED.months,
         amount_per_month = EXCLUDED.amount_per_month,
         total_amount = EXCLUDED.total_amount,
         note = 'Current',
         cover_until = EXCLUDED.cover_until,
         pay_status = EXCLUDED.pay_status,
         remaining_days = CASE
           WHEN EXCLUDED.months > 0 AND EXCLUDED.cover_until > NOW()
             THEN GREATEST(0, EXTRACT(DAY FROM (EXCLUDED.cover_until - NOW())))::INT
           ELSE 0
         END`,
      [String(houseNumber), area, rate, m, per, total,
       m,
       m,
       m, m]
    );
  }

  // หลังอัปเดต ถ้า cover_until ผ่านไปแล้วให้ปรับเป็น pending
  await db.query(
    `UPDATE payments
       SET pay_status = (CASE
             WHEN months > 0 AND cover_until > NOW() THEN 'paid'
             WHEN months > 0 THEN 'pending'
             ELSE 'overdue'
           END)::pay_status_type,
           remaining_days = CASE
             WHEN months > 0 AND cover_until > NOW()
               THEN GREATEST(0, EXTRACT(DAY FROM (cover_until - NOW())))::INT
             ELSE 0
           END
     WHERE house_number = $1`,
    [String(houseNumber)]
  );
}

// ปรับ ensurePaymentsTable - PostgreSQL version
async function ensurePaymentsTable() {
  if (!(await hasDb())) return false;
  await pool.query(`CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    house_number VARCHAR(32) NOT NULL UNIQUE,
    area_sq_m DECIMAL(10,2) NULL,
    rate_per_sqm DECIMAL(10,2) NOT NULL DEFAULT 10.00,
    months INT NOT NULL DEFAULT 0,
    amount_per_month DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    note VARCHAR(255) NULL,
    cover_until TIMESTAMP NULL,
    pay_status VARCHAR(10) NOT NULL DEFAULT 'overdue',
    remaining_days INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  return true;
}

// helper SQL fragment สำหรับคอลัมน์สถานะ
const COVERAGE_COLUMNS = `
  pay.months AS paid_months,
  pay.cover_until,
  pay.pay_status,
  pay.remaining_days,
  (pay.pay_status = 'paid') AS is_covered
`;

function registerResidentRoutes(app) {
  // Get resident of current account
  app.get('/me/resident', authGuard, async (req, res) => {
    try {
      if (!(await ensureResidentsTable())) return res.status(500).json({ ok: false, error: 'DB_NOT_READY' });
      const accountId = req.user?.id;
      if (!accountId) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      const [rows] = await pool.query(
        `SELECT r.id, r.house_number, r.title, r.first_name, r.last_name, r.phone,
                r.household_count, r.car_count, r.pay_months, r.account_id,
                h.area_sq_m,
                ${COVERAGE_COLUMNS}
           FROM residents r
           LEFT JOIN houses h ON h.house_number = r.house_number
           LEFT JOIN payments pay ON pay.house_number = r.house_number
          WHERE r.account_id = $1
          LIMIT 1`,
        [accountId]
      );
      if (!rows[0]) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      return res.json({ ok: true, data: rows[0] });
    } catch (e) {
      console.error('GET /me/resident error:', e);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });
  
  // Update phone of current resident
  app.put('/me/resident/phone', authGuard, async (req, res) => {
    try {
      if (!(await ensureResidentsTable())) return res.status(500).json({ ok: false, error: 'DB_NOT_READY' });
      const accountId = req.user?.id;
      if (!accountId) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      const { phone } = req.body || {};
      if (phone != null && !/^\d{6,20}$/.test(String(phone))) {
        return res.status(400).json({ ok: false, error: 'INVALID_PHONE' });
      }
      // Find resident linked to account
      const [rows] = await pool.query('SELECT id FROM residents WHERE account_id = $1 LIMIT 1', [accountId]);
      const r = rows[0];
      if (!r) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      await pool.query('UPDATE residents SET phone = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [phone ? String(phone) : null, r.id]);
      const [refetch] = await pool.query('SELECT id, house_number, title, first_name, last_name, phone, household_count, car_count, account_id FROM residents WHERE id = $1', [r.id]);
      return res.json({ ok: true, data: refetch[0] || null });
    } catch (e) {
      console.error('PUT /me/resident/phone error:', e);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  // GET /residents
  app.get('/residents', async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (await ensureResidentsTable()) {
      try {
        try { await ensurePaymentsTable(); } catch (e) { console.warn('ensurePaymentsTable in /residents warn:', e.message); }

        const where = [];
        const params = [];
        let paramIdx = 1;
        if (q) {
          where.push(`(r.house_number LIKE $${paramIdx} OR r.first_name LIKE $${paramIdx + 1} OR r.last_name LIKE $${paramIdx + 2} OR r.phone LIKE $${paramIdx + 3} OR r.title LIKE $${paramIdx + 4})`);
          params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
          paramIdx += 5;
        }
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const [rows] = await pool.query(
          `SELECT DISTINCT ON (r.house_number) r.id, r.house_number, r.title, r.first_name, r.last_name, r.phone,
                  r.household_count, r.car_count, r.pay_months,
                  h.area_sq_m,
                  ${COVERAGE_COLUMNS}
             FROM residents r
             LEFT JOIN houses h ON h.house_number = r.house_number
             LEFT JOIN payments pay ON pay.house_number = r.house_number
             ${whereSql}
             ORDER BY r.house_number ASC, pay.id DESC`,
          params
        );
        return res.json({ ok: true, data: rows });
      } catch (e) {
        console.error('GET /residents DB error:', e);
        return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
      }
    } else {
      const data = mockResidents
        .filter(r => !q || [r.house_number, r.first_name, r.last_name, r.phone].some(x => String(x || '').includes(q)))
        .sort((a, b) => a.house_number.localeCompare(b.house_number));
      return res.json({ ok: true, data });
    }
  });

  // Create (รองรับ pay_months)
  app.post('/residents', authGuard, adminOnly, async (req, res) => {
    const { house_number, title, first_name, last_name, phone, household_count, car_count, area_sq_m, pay_months } = req.body || {};
    if (!house_number || !first_name) return res.status(400).json({ ok: false, error: 'INVALID_BODY' });
    if (await ensureResidentsTable()) {
      try {
        await ensureHousesTable();
        const phoneDigits = String(phone || '').replace(/\D/g, '') || null;
        const monthsVal = normalizeMonths(pay_months);
        await pool.query(
          `INSERT INTO residents (house_number, title, first_name, last_name, phone, household_count, car_count, pay_months)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [house_number, title ?? null, first_name, last_name ?? null, phoneDigits, Number(household_count ?? 1), Number(car_count ?? 0), monthsVal]
        );
        // sync houses table
        const ownerName = [title, first_name, last_name].filter(Boolean).join(' ').trim() || null;
        await pool.query(
          `INSERT INTO houses (house_number, owner_name, area_sq_m)
           VALUES ($1, $2, $3)
           ON CONFLICT (house_number) DO UPDATE SET owner_name = EXCLUDED.owner_name, area_sq_m = COALESCE(EXCLUDED.area_sq_m, houses.area_sq_m)`,
          [String(house_number), ownerName, area_sq_m != null ? Number(area_sq_m) : null]
        );

        // บันทึกประวัติการชำระ
        try {
          await ensurePaymentsTable();
          if (monthsVal != null) {
            await upsertPayment(pool, { houseNumber: house_number, months: monthsVal, areaProvided: area_sq_m });
          }
        } catch (e) { console.warn('create resident: insert payment error:', e.message); }

        const [rows] = await pool.query(
          `SELECT r.*, h.area_sq_m, ${COVERAGE_COLUMNS}
             FROM residents r
             LEFT JOIN houses h ON h.house_number = r.house_number
             LEFT JOIN payments pay ON pay.house_number = r.house_number
           WHERE r.house_number = $1 ORDER BY r.id DESC LIMIT 1`,
          [house_number]
        );

        // Log create
        const created = rows[0];
        await insertResidentLog('create', {
          residentId: created?.id,
          houseNumber: house_number,
          residentName: [title, first_name, last_name].filter(Boolean).join(' '),
          changes: { house_number, title, first_name, last_name, phone, household_count, car_count, area_sq_m, pay_months },
          user: req.user,
        });

        return res.status(201).json({ ok: true, data: rows[0] });
      } catch (e) {
        if (isDup(e)) {
          const field = dupField(e);
          if (field === 'house_number') return res.status(409).json({ ok: false, error: 'DUPLICATE_HOUSE_NUMBER', field });
          if (field === 'phone') return res.status(409).json({ ok: false, error: 'DUPLICATE_PHONE', field });
        }
        console.error('POST /residents error:', e);
        return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
      }
    } else {
      const exists = mockResidents.find(r => r.house_number === String(house_number));
      if (exists) return res.status(409).json({ ok: false, error: 'DUPLICATE_HOUSE' });
      const item = {
        id: ++mockSeq,
        house_number: String(house_number),
        first_name: String(first_name),
        last_name: last_name ? String(last_name) : '',
        phone: phone ? String(phone) : '',
        household_count: Number(household_count || 1),
        car_count: Number(car_count || 0),
      };
      mockResidents.push(item);
      global.mockResidents = mockResidents;
      return res.status(201).json({ ok: true, data: item });
    }
  });

  // Create Resident + Account (username/password)
  app.post('/residents/register', authGuard, adminOnly, async (req, res) => {
    const {
      house_number, title, first_name, last_name, phone,
      household_count, car_count, area_sq_m,
      pay_months, username, password
    } = req.body || {};

    const monthsVal = normalizeMonths(pay_months);

    if (!house_number || !first_name || !username || !password) return res.status(400).json({ ok: false, error: 'INVALID_BODY' });

    const okRes = await ensureResidentsTable();
    const okAcc = await ensureAccountsTable();
    const okHouse = await ensureHousesTable();
    if (!okRes || !okAcc || !okHouse) return res.status(500).json({ ok: false, error: 'DB_NOT_READY' });

    const client = await pool.getClient();
    try {
      await client.query('BEGIN');
      // accounts
      let accId;
      try {
        const accResult = await client.query(
          `INSERT INTO accounts (username, password_hash, role) VALUES ($1, $2, 'user') RETURNING id`,
          [String(username).trim(), await bcrypt.hash(String(password), 10)]
        );
        accId = accResult.rows[0]?.id;
      } catch (e) {
        if (isDup(e)) { await client.query('ROLLBACK'); client.release(); return res.status(409).json({ ok: false, error: 'DUPLICATE_USERNAME', field: 'username' }); }
        throw e;
      }

      // insert residents
      await client.query(
        `INSERT INTO residents
           (house_number, title, first_name, last_name, phone, household_count, car_count, pay_months, account_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          house_number, title ?? null, first_name, last_name ?? null,
          String(phone || '').replace(/\D/g, '') || null,
          Number(household_count ?? 1), Number(car_count ?? 0),
          monthsVal,
          accId
        ]
      );

      // sync houses table
      const ownerName = [title, first_name, last_name]
        .filter(Boolean)
        .map((part) => String(part).trim())
        .filter((part) => part.length > 0)
        .join(' ') || null;
      await client.query(
        `INSERT INTO houses (house_number, owner_name, area_sq_m)
         VALUES ($1, $2, $3)
         ON CONFLICT (house_number) DO UPDATE SET
           owner_name = COALESCE(EXCLUDED.owner_name, houses.owner_name),
           area_sq_m = COALESCE(EXCLUDED.area_sq_m, houses.area_sq_m)`,
        [String(house_number), ownerName, area_sq_m != null ? Number(area_sq_m) : null]
      );
      
      // บันทึก payments เริ่มต้น
      await ensurePaymentsTable();
      // Note: upsertPayment needs wrapper for client
      const clientWrapper = {
        async query(text, values) {
          const result = await client.query(text, values);
          return [result.rows, result.fields];
        }
      };
      await upsertPayment(clientWrapper, { houseNumber: house_number, months: monthsVal, areaProvided: area_sq_m });

      await client.query('COMMIT');
      client.release();

      const [rows] = await pool.query(
        `SELECT r.*, h.area_sq_m, ${COVERAGE_COLUMNS}
           FROM residents r
           LEFT JOIN houses h ON h.house_number = r.house_number
           LEFT JOIN payments pay ON pay.house_number = r.house_number
          WHERE r.house_number = $1 ORDER BY r.id DESC LIMIT 1`,
        [house_number]
      );

      // Log register (create with account)
      const created = rows[0];
      await insertResidentLog('create', {
        residentId: created?.id,
        houseNumber: house_number,
        residentName: [title, first_name, last_name].filter(Boolean).join(' '),
        changes: { house_number, title, first_name, last_name, phone, household_count, car_count, area_sq_m, pay_months, username },
        user: req.user,
      });

      return res.status(201).json({ ok: true, data: rows[0] });
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch {}
      client.release();
      console.error('POST /residents/register error:', e);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  // Update (รองรับแก้ pay_months)
  app.put('/residents/:id', authGuard, adminOnly, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, error: 'INVALID_ID' });

      const {
        house_number,
        title,
        first_name,
        last_name,
        phone,
        household_count,
        car_count,
        area_sq_m,
        pay_months,
      } = req.body || {};

      const okRes = await ensureResidentsTable();
      const okHouse = await ensureHousesTable();
      if (!okRes || !okHouse) return res.status(500).json({ ok: false, error: 'DB_NOT_READY' });

      // ดึงข้อมูลเดิม
      const [oldRows] = await pool.query(
        'SELECT id, house_number, title, first_name, last_name, phone, household_count, car_count, pay_months FROM residents WHERE id = $1 LIMIT 1',
        [id]
      );
      const old = oldRows[0];
      if (!old) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

      // ดึง area_sq_m เดิมจาก houses
      let oldAreaSqM = null;
      try {
        const [hRows] = await pool.query('SELECT area_sq_m FROM houses WHERE house_number = $1 LIMIT 1', [old.house_number]);
        if (hRows[0]?.area_sq_m != null) oldAreaSqM = Number(hRows[0].area_sq_m);
      } catch {}
      old.area_sq_m = oldAreaSqM;

      const phoneDigits = phone === undefined ? undefined : (String(phone || '').replace(/\D/g, '') || null);
      const fields = [];
      const params = [];
      let paramIdx = 1;
      if (house_number !== undefined) { fields.push(`house_number = $${paramIdx++}`); params.push(String(house_number)); }
      if (title !== undefined) { fields.push(`title = $${paramIdx++}`); params.push(title ?? null); }
      if (first_name !== undefined) { fields.push(`first_name = $${paramIdx++}`); params.push(first_name || old.first_name); }
      if (last_name !== undefined) { fields.push(`last_name = $${paramIdx++}`); params.push(last_name ?? null); }
      if (phoneDigits !== undefined) { fields.push(`phone = $${paramIdx++}`); params.push(phoneDigits); }
      if (household_count !== undefined) { fields.push(`household_count = $${paramIdx++}`); params.push(Number(household_count || 0) || 0); }
      if (car_count !== undefined) { fields.push(`car_count = $${paramIdx++}`); params.push(Number(car_count || 0) || 0); }
      if (pay_months !== undefined) {
        const n = Number(pay_months);
        fields.push(`pay_months = $${paramIdx++}`);
        params.push(Number.isInteger(n) && n > 0 ? n : null);
      }
      if (fields.length === 0) return res.json({ ok: true, data: old });

      fields.push(`updated_at = CURRENT_TIMESTAMP`);
      params.push(id);
      await pool.query(`UPDATE residents SET ${fields.join(', ')} WHERE id = $${paramIdx}`, params);

      // อัปเดต / สร้างข้อมูลบ้าน (area ถ้าส่งมา)
      if (area_sq_m !== undefined || house_number !== undefined) {
        const hn = house_number !== undefined ? String(house_number) : String(old.house_number);
        await pool.query(
          `INSERT INTO houses (house_number, owner_name, area_sq_m)
           VALUES ($1, NULL, $2)
           ON CONFLICT (house_number) DO UPDATE SET
             area_sq_m = COALESCE(EXCLUDED.area_sq_m, houses.area_sq_m)`,
          [hn, area_sq_m != null ? Number(area_sq_m) : null]
        );
      }

      // อัปเดต snapshot payments ให้ตรงกับค่าใหม่
      if (pay_months !== undefined) {
        try {
          await ensurePaymentsTable();
          const newValNum = normalizeMonths(pay_months) ?? 0;
          await upsertPayment(pool, {
            houseNumber: (house_number !== undefined ? house_number : old.house_number),
            months: newValNum,
            areaProvided: area_sq_m
          });
        } catch (e) {
          console.warn('update resident upsertPayment error:', e.message);
        }
      }

      try { await ensurePaymentsTable(); } catch {}

      const [rows2] = await pool.query(
        `SELECT r.*, h.area_sq_m, ${COVERAGE_COLUMNS}
           FROM residents r
           LEFT JOIN houses h ON h.house_number = r.house_number
          LEFT JOIN payments pay ON pay.house_number = r.house_number
          WHERE r.id = $1 LIMIT 1`,
        [id]
      );

      // Build change diff and log
      const updated = rows2[0];
      const changes = {};
      const fieldMap = { house_number, title, first_name, last_name, phone, household_count, car_count, pay_months, area_sq_m };
      for (const [key, newVal] of Object.entries(fieldMap)) {
        if (newVal !== undefined) {
          const oldVal = old[key] ?? null;
          const nv = newVal ?? null;
          if (String(oldVal) !== String(nv)) {
            changes[key] = { old: oldVal, new: nv };
          }
        }
      }

      // Determine action: if only pay_months changed, mark as 'update_months'
      const changedKeys = Object.keys(changes);
      const action = changedKeys.length === 1 && changedKeys[0] === 'pay_months' ? 'update_months' : 'update';
      if (changedKeys.length > 0) {
        await insertResidentLog(action, {
          residentId: id,
          houseNumber: updated?.house_number || old.house_number,
          residentName: [updated?.title, updated?.first_name, updated?.last_name].filter(Boolean).join(' '),
          changes,
          user: req.user,
        });
      }

      return res.json({ ok: true, data: rows2[0] || null });
    } catch (e) {
      if (isDup(e)) {
        const f = dupField(e);
        if (f === 'house_number') return res.status(409).json({ ok: false, error: 'DUPLICATE_HOUSE_NUMBER', field: f });
        if (f === 'phone') return res.status(409).json({ ok: false, error: 'DUPLICATE_PHONE', field: f });
      }
      console.error('PUT /residents/:id error', e);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  // Delete
  app.delete('/residents/:id', authGuard, adminOnly, async (req, res) => {
    const id = Number(req.params.id);
    if (await ensureResidentsTable()) {
      try {
        await ensureHousesTable();
        const [rows] = await pool.query('SELECT id, house_number, title, first_name, last_name, phone, household_count, car_count, pay_months FROM residents WHERE id = $1 LIMIT 1', [id]);
        const deleted = rows[0];
        const hn = deleted?.house_number ? String(deleted.house_number) : null;

        const client = await pool.getClient();
        try {
          await client.query('BEGIN');
          await client.query('DELETE FROM residents WHERE id = $1', [id]);
          if (hn) {
            // Delete house; payments has FK ON DELETE CASCADE
            await client.query('DELETE FROM houses WHERE house_number = $1', [hn]);
          }
          await client.query('COMMIT');
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        } finally {
          client.release();
        }

        // Log delete
        if (deleted) {
          await insertResidentLog('delete', {
            residentId: id,
            houseNumber: hn,
            residentName: [deleted.title, deleted.first_name, deleted.last_name].filter(Boolean).join(' '),
            changes: {
              house_number: deleted.house_number,
              title: deleted.title,
              first_name: deleted.first_name,
              last_name: deleted.last_name,
              phone: deleted.phone,
              household_count: deleted.household_count,
              car_count: deleted.car_count,
              pay_months: deleted.pay_months,
            },
            user: req.user,
          });
        }

        return res.json({ ok: true, house_deleted: !!hn });
      } catch (e) {
        console.error('DELETE /residents/:id DB error:', e);
        return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
      }
    } else {
      mockResidents = mockResidents.filter(r => r.id !== id);
      global.mockResidents = mockResidents;
      return res.json({ ok: true });
    }
  });

  // GET /houses - ดึงรายการบ้านเลขที่ทั้งหมด (สำหรับ dropdown)
  app.get('/houses', authGuard, async (req, res) => {
    try {
      await ensureHousesTable();
      const [rows] = await pool.query(
        `SELECT house_number FROM houses ORDER BY house_number ASC`
      );
      const houseNumbers = rows.map(r => r.house_number);
      return res.json({ ok: true, data: houseNumbers });
    } catch (e) {
      console.error('GET /houses error:', e);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  // GET /houses/validate/:houseNumber - ตรวจสอบว่าบ้านเลขที่มีอยู่ในระบบหรือไม่
  app.get('/houses/validate/:houseNumber', authGuard, async (req, res) => {
    try {
      await ensureHousesTable();
      const hn = String(req.params.houseNumber).trim();
      if (!hn) return res.status(400).json({ ok: false, error: 'INVALID_HOUSE_NUMBER' });
      const [rows] = await pool.query(
        `SELECT house_number FROM houses WHERE house_number = $1 LIMIT 1`,
        [hn]
      );
      const exists = rows.length > 0;
      return res.json({ ok: true, exists, house_number: hn });
    } catch (e) {
      console.error('GET /houses/validate error:', e);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  // ============ Resident Logs API ============
  app.get('/resident-logs', authGuard, adminOnly, async (req, res) => {
    try {
      const ok = await ensureResidentLogsTable();
      if (!ok) return res.json({ ok: true, data: [], hasMore: false });

      const q = String(req.query.q || '').trim();
      const action = String(req.query.action || '').trim();
      const limit = Math.min(parseInt(req.query.limit) || 50, 200);
      const offset = Math.max(parseInt(req.query.offset) || 0, 0);
      const where = [];
      const params = [];
      let idx = 1;

      if (q) {
        where.push(`(rl.house_number LIKE $${idx} OR rl.resident_name LIKE $${idx + 1} OR rl.performed_by_name LIKE $${idx + 2})`);
        params.push(`%${q}%`, `%${q}%`, `%${q}%`);
        idx += 3;
      }
      if (action) {
        where.push(`rl.action = $${idx}`);
        params.push(action);
        idx++;
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const [rows] = await pool.query(
        `SELECT rl.* FROM resident_logs rl ${whereSql} ORDER BY rl.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit + 1, offset]
      );
      const hasMore = rows.length > limit;
      if (hasMore) rows.pop();
      return res.json({ ok: true, data: rows, hasMore });
    } catch (e) {
      console.error('GET /resident-logs error:', e);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });
}

// helper แปลงเดือน
function normalizeMonths(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

module.exports = { registerResidentRoutes };
