const express = require('express');
const router = express.Router();
const { pool } = require('../db/pool');
const { hasDb } = require('../utils/db');
const { authGuard, adminOnly } = require('../middleware/auth');

// Helper: log month changes to resident_logs table
async function logMonthChange({ houseNumber, oldMonths, newMonths, user }) {
  try {
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
    // Get resident name
    let residentName = null;
    const [rRows] = await pool.query(
      "SELECT id, TRIM(CONCAT_WS(' ', NULLIF(title,''), NULLIF(first_name,''), NULLIF(last_name,''))) AS name FROM residents WHERE house_number = $1 LIMIT 1",
      [houseNumber]
    );
    const r = rRows?.[0];
    residentName = r?.name || null;

    await pool.query(
      `INSERT INTO resident_logs (action, resident_id, house_number, resident_name, changes, performed_by, performed_by_name, performed_by_role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        'update_months', r?.id || null, houseNumber, residentName,
        JSON.stringify({ pay_months: { old: oldMonths, new: newMonths } }),
        user?.id || null, user?.full_name || user?.username || null, user?.role || null
      ]
    );
  } catch (e) {
    console.warn('logMonthChange error:', e.message);
  }
}

async function tableExists(table) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_catalog = current_database() AND table_name = $1`,
    [table]
  );
  return (Number(rows?.[0]?.c) || 0) > 0;
}
async function columnExists(table, col) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.columns WHERE table_catalog = current_database() AND table_name = $1 AND column_name = $2`,
    [table, col]
  );
  return (Number(rows?.[0]?.c) || 0) > 0;
}
async function addColumn(table, col, typeSql) {
  try {
    if (!(await columnExists(table, col))) {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN ${col} ${typeSql}`);
    }
  } catch (e) {
    // PostgreSQL: duplicate_column error code is 42701
    if (e?.code === '42701') return;
    throw e;
  }
}

async function ensurePaymentsTable() {
  if (!(await hasDb())) return false;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY
    )
  `);
  await addColumn('payments', 'house_id', 'INT NULL');
  await addColumn('payments', 'house_number', 'VARCHAR(32) NULL');
  await addColumn('payments', 'created_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
  await addColumn('payments', 'area_sq_m', 'DECIMAL(10,2) NULL');
  await addColumn('payments', 'rate_per_sqm', 'DECIMAL(10,2) NOT NULL DEFAULT 10.00');
  await addColumn('payments', 'months', 'INT NULL');
  await addColumn('payments', 'amount_per_month', 'DECIMAL(12,2) NULL');
  await addColumn('payments', 'total_amount', 'DECIMAL(12,2) NULL');
  await addColumn('payments', 'note', 'VARCHAR(255) NULL');

  // พยายามสร้าง index / FK (ถ้ามีแล้วจะเงียบ)
  try { await pool.query(`CREATE INDEX IF NOT EXISTS idx_pay_house_id ON payments (house_id)`); } catch {}
  return true;
}

function registerPaymentRoutes(app) {
  // รายการจ่ายทั้งหมดหรือกรองตามบ้าน
  app.get('/payments', authGuard, async (req, res) => {
    try {
      const ok = await ensurePaymentsTable();
      if (!ok) return res.json({ ok: true, data: [] }); // fallback ไม่มี DB

      const isAdmin = req.user?.role === 'admin' || req.user?.role === 'superadmin';
      let house = (req.query.house_number || req.query.house || '').toString().trim();

      if (!isAdmin) {
        // บังคับใช้บ้านของผู้ใช้
        if (!house) house = (req.user?.house_number || '').toString().trim();
        if (!house && req.user?.id) {
          const [r] = await pool.query('SELECT house_number FROM residents WHERE account_id = $1 LIMIT 1', [req.user.id]);
          house = r?.[0]?.house_number ? String(r[0].house_number) : '';
        }
        if (!house) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
      }

      const sql = `SELECT id, house_number, area_sq_m, rate_per_sqm, months, amount_per_month, total_amount, note, created_at
                     FROM payments
                    ${house ? 'WHERE house_number = $1' : ''}
                    ORDER BY id DESC`;
      const params = house ? [house] : [];
      const [rows] = await pool.query(sql, params);
      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error('GET /payments error', e);
      res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  // สถานะบ้าน (admin)
  app.get('/payments/status', authGuard, adminOnly, async (req, res) => {
    try {
      const ok = await ensurePaymentsTable();
      if (!ok) return res.json({ ok: true, data: [] });

      // รวมรายการบ้านจาก houses และ residents
      // PostgreSQL: use CONCAT_WS
      const unions = [];
      unions.push(`SELECT h.id AS hid, h.house_number, h.owner_name FROM houses h`);
      unions.push(`SELECT NULL::INT AS hid, r.house_number, TRIM(CONCAT_WS(' ', NULLIF(r.title, ''), NULLIF(r.first_name, ''), NULLIF(r.last_name, ''))) AS owner_name FROM residents r`);
      const housesSql = unions.join(' UNION ');
      const [houses] = await pool.query(housesSql);

      if (!houses.length) return res.json({ ok: true, data: [] });

      // ดึงสรุปการจ่ายต่อบ้าน: มีสลิปไหม และครอบคลุมถึงปัจจุบันหรือไม่
      // PostgreSQL: DATE_ADD -> + INTERVAL
      const [agg] = await pool.query(`
        SELECT x.house_number,
               MAX(p.created_at) AS last_paid_at,
               MAX(CASE WHEN p.months > 0 AND (p.created_at + (p.months || ' months')::INTERVAL) > NOW() THEN 1 ELSE 0 END) AS covered,
               COUNT(p.id) AS pay_count
        FROM (${housesSql}) x
        LEFT JOIN payments p
          ON (p.house_number = x.house_number)
          OR (p.house_id IS NOT NULL AND p.house_id = x.hid)
        GROUP BY x.house_number
      `);

      const map = new Map(agg.map(r => [String(r.house_number), r]));

      const houseMap = new Map();
      for (const row of houses) {
        const hn = String(row?.house_number ?? '').trim();
        if (!hn) continue;
        const rawId = row?.hid;
        const hid = rawId == null ? null : Number(rawId);
        const hasId = Number.isFinite(hid) && hid > 0;
        const ownerNameRaw = typeof row?.owner_name === 'string' ? row.owner_name.trim() : '';
        const existing = houseMap.get(hn);
        if (!existing) {
          houseMap.set(hn, {
            houseNumber: hn,
            houseId: hasId ? hid : null,
            ownerName: ownerNameRaw || null,
          });
        } else {
          if (hasId && !existing.houseId) existing.houseId = hid;
          if (ownerNameRaw && !existing.ownerName) existing.ownerName = ownerNameRaw;
        }
      }

      const data = Array.from(houseMap.values()).map(entry => {
        const r = map.get(entry.houseNumber) || {};
        const covered = Number(r.covered || 0) === 1;
        const payCount = Number(r.pay_count || 0);
        let status = 'overdue';
        if (covered) status = 'paid';
        else if (payCount > 0) status = 'pending';
        return {
          houseId: entry.houseId ?? null,
          houseNumber: entry.houseNumber,
          ownerName: entry.ownerName ?? null,
          status,
        };
      });
      res.json({ ok: true, data });
    } catch (e) {
      console.error('GET /payments/status error', e);
      res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  // ประวัติการจ่ายต่อบ้าน
  app.get('/payments/history/:house', authGuard, async (req, res) => {
    try {
      const ok = await ensurePaymentsTable();
      if (!ok) return res.json({ ok: true, data: [] });
      const house = String(req.params.house || '').trim();
      const [rows] = await pool.query(
        `SELECT id, house_number, area_sq_m, rate_per_sqm, months, amount_per_month, total_amount, note, created_at
           FROM payments
          WHERE house_number = $1
          ORDER BY id DESC`,
        [house]
      );
      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error('GET /payments/history/:house error', e);
      res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  // ชำระเงิน/เพิ่มเดือนให้บ้าน
  app.post('/payments/charge', authGuard, adminOnly, async (req, res) => {
    const { house_number, months, area_sq_m, note } = req.body || {};
    const hn = String(house_number || '').trim();
    const m = Number(months);
    if (!hn || !Number.isInteger(m) || m <= 0) return res.status(400).json({ ok: false, error: 'INVALID_BODY' });
    try {
      const ok = await ensurePaymentsTable();
      if (!ok) return res.status(500).json({ ok: false, error: 'DB_NOT_READY' });

      // PostgreSQL: use pool.raw() for transaction
      const client = await pool.getClient();
      try {
        await client.query('BEGIN');
        // หา area จาก houses หากไม่ส่งมา
        let area = area_sq_m != null ? Number(area_sq_m) : null;
        if (!Number.isFinite(area)) {
          const h = await client.query('SELECT area_sq_m FROM houses WHERE house_number = $1 LIMIT 1', [hn]);
          if (h?.rows?.[0]?.area_sq_m != null) area = Number(h.rows[0].area_sq_m);
        }
        if (!Number.isFinite(area)) { await client.query('ROLLBACK'); client.release(); return res.status(400).json({ ok: false, error: 'NO_AREA' }); }

        let rate = 10;
        console.log('[Payment] app.getSetting exists:', !!app.getSetting);
        if (app.getSetting) {
          const r = await app.getSetting('rate_per_sqm');
          console.log('[Payment] app.getSetting returned:', r);
          if (r && !isNaN(r)) rate = Number(r);
        } else {
          console.log('[Payment] Fallback to manual query');
          // Fallback if app.getSetting not ready (should not happen)
          const setRows = await client.query("SELECT value FROM system_settings WHERE key = 'rate_per_sqm'");
          if (setRows.rows.length > 0) {
             console.log('[Payment] Manual query returned:', setRows.rows[0].value);
             rate = Number(setRows.rows[0].value);
          }
        }
        console.log('[Payment] Final rate used:', rate);

        const per = area * rate;
        const total = per * m;

        // sync area to houses table (ignore if table missing)
        try {
          await client.query(
            `INSERT INTO houses (house_number, area_sq_m)
             VALUES ($1, $2)
             ON CONFLICT (house_number) DO UPDATE SET area_sq_m = EXCLUDED.area_sq_m`,
            [hn, area]
          );
        } catch (syncErr) {
          // ignore if table doesn't exist
        }

        // insert payments
        await client.query(
          `INSERT INTO payments (house_number, area_sq_m, rate_per_sqm, months, amount_per_month, total_amount, note)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [hn, area, rate, m, per, total, note || 'Manual charge']
        );

        // update residents.pay_months = +months
        await client.query(
          `UPDATE residents SET pay_months = COALESCE(pay_months, 0) + $1 WHERE house_number = $2`,
          [m, hn]
        );

        await client.query('COMMIT');
        client.release();
        return res.status(201).json({ ok: true, data: { house_number: hn, months: m, per_month: per, total } });
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch {}
        client.release();
        throw e;
      }
    } catch (e) {
      console.error('POST /payments/charge error', e);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  // แก้/อัปเดตรายการ payments (เฉพาะแอดมิน)
  app.put('/payments/:id', authGuard, adminOnly, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, error: 'INVALID_ID' });
      const ok = await ensurePaymentsTable();
      if (!ok) return res.status(500).json({ ok: false, error: 'DB_NOT_READY' });

      const {
        area_sq_m,
        rate_per_sqm,
        months,
        note,
      } = req.body || {};

      // ดึงเดิม
      const [oldRows] = await pool.query('SELECT * FROM payments WHERE id = $1 LIMIT 1', [id]);
      const old = oldRows[0];
      if (!old) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

      const area = area_sq_m !== undefined ? Number(area_sq_m) : old.area_sq_m;
      const rate = rate_per_sqm !== undefined ? Number(rate_per_sqm) : old.rate_per_sqm;
      const m = months !== undefined ? Number(months) : old.months;

      if (!Number.isFinite(area) || area < 0) return res.status(400).json({ ok: false, error: 'INVALID_AREA' });
      if (!Number.isFinite(rate) || rate <= 0) return res.status(400).json({ ok: false, error: 'INVALID_RATE' });
      if (!Number.isInteger(m) || m <= 0) return res.status(400).json({ ok: false, error: 'INVALID_MONTHS' });

      const per = area * rate;
      const total = per * m;

      if (old.house_number) {
        try {
          await pool.query(
            `INSERT INTO houses (house_number, area_sq_m)
             VALUES ($1, $2)
             ON CONFLICT (house_number) DO UPDATE SET area_sq_m = EXCLUDED.area_sq_m`,
            [String(old.house_number), area]
          );
        } catch (syncErr) {
          // ignore if table doesn't exist
        }
      }

      // --- เพิ่มการคำนวณปรับลดจำนวนเดือน (ถ้ามี) ---
      const newMonths = m;              // m = months (validated)
      const oldMonths = Number(old.months || 0);
      let diffDecrease = 0;
      if (newMonths < oldMonths) {
        diffDecrease = oldMonths - newMonths;
      }

      // (คงการ update แถวหลัก)
      await pool.query(
        `UPDATE payments
          SET area_sq_m = $1,
              rate_per_sqm = $2,
              months = $3,
              amount_per_month = $4,
              total_amount = $5,
              note = $6
        WHERE id = $7`,
        [area, rate, m, per, total, note ?? old.note, id]
      );

      // ถ้ามีการลดเดือน -> ปรับ residents และบันทึก adjustment ติดลบ
      if (diffDecrease > 0) {
        try {
          const houseNumber = old.house_number;
          if (houseNumber) {
            // อัปเดต resident
            await pool.query(
              `UPDATE residents
                 SET pay_months = GREATEST(0, COALESCE(pay_months,0) - $1)
               WHERE house_number = $2`,
              [diffDecrease, houseNumber]
            );
            // หา house_id + area (ใช้ area ใหม่ถ้าแก้, fallback ของเก่า)
            let areaAdj = Number(old.area_sq_m || 0);
            const [hrows] = await pool.query('SELECT id, area_sq_m FROM houses WHERE house_number = $1 LIMIT 1', [houseNumber]);
            const houseId = hrows?.[0]?.id || null;
            if (!areaAdj && hrows?.[0]?.area_sq_m != null) areaAdj = Number(hrows[0].area_sq_m);

            const rateAdj = Number(old.rate_per_sqm || 10);
            const perAdj = areaAdj * rateAdj;
            const totalAdj = perAdj * (-diffDecrease);

            // ตรวจคอลัมน์
            const [colsRows] = await pool.query(
              `SELECT column_name FROM information_schema.columns WHERE table_catalog = current_database() AND table_name = 'payments'`
            );
            const colSet = new Set(colsRows.map(r => r.column_name.toLowerCase()));
            const cols = [], vals = [];
            let paramIdx = 1;
            if (colSet.has('house_id') && houseId) { cols.push('house_id'); vals.push(houseId); }
            if (colSet.has('house_number')) { cols.push('house_number'); vals.push(houseNumber); }
            if (colSet.has('area_sq_m')) { cols.push('area_sq_m'); vals.push(areaAdj); }
            if (colSet.has('rate_per_sqm')) { cols.push('rate_per_sqm'); vals.push(rateAdj); }
            if (colSet.has('months')) { cols.push('months'); vals.push(-diffDecrease); }
            if (colSet.has('amount_per_month')) { cols.push('amount_per_month'); vals.push(perAdj); }
            if (colSet.has('total_amount')) { cols.push('total_amount'); vals.push(totalAdj); }
            if (colSet.has('note')) { cols.push('note'); vals.push(`Adjustment decrease ${diffDecrease} month(s)`); }
            if (cols.length) {
              const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
              await pool.query(`INSERT INTO payments (${cols.join(', ')}) VALUES (${ph})`, vals);
            }
          }
        } catch (e) {
          console.warn('PUT /payments/:id adjustment decrease warn:', e.message);
        }
      }

      const [rows2] = await pool.query(
        `SELECT id, house_number, area_sq_m, rate_per_sqm, months, amount_per_month, total_amount, note, created_at
         FROM payments WHERE id = $1`,
        [id]
      );

      // Log month change if months changed
      if (months !== undefined && Number(months) !== oldMonths) {
        await logMonthChange({
          houseNumber: old.house_number,
          oldMonths,
          newMonths: m,
          user: req.user,
        });
      }

      return res.json({ ok: true, data: rows2[0] });
    } catch (e) {
      console.error('PUT /payments/:id error', e);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  // ลบรายการ (หากต้องการ)
  app.delete('/payments/:id', authGuard, adminOnly, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, error: 'INVALID_ID' });
      const ok = await ensurePaymentsTable();
      if (!ok) return res.status(500).json({ ok: false, error: 'DB_NOT_READY' });
      const [old] = await pool.query('SELECT id FROM payments WHERE id = $1 LIMIT 1', [id]);
      if (!old[0]) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      await pool.query('DELETE FROM payments WHERE id = $1', [id]);
      return res.json({ ok: true });
    } catch (e) {
      console.error('DELETE /payments/:id error', e);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });
}

module.exports = { registerPaymentRoutes };
