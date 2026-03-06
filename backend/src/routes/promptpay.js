const generatePayload = require('promptpay-qr');
const { PROMPTPAY_ID, PROMPTPAY_DEFAULT_AMOUNT } = require('../config/env');
const { qrCache, isExpired, createAndCacheQR, buildQrResponse } = require('../utils/qr');
const { pool } = require('../db/pool');
const { buildBatchInsert } = require('../utils/pgHelper');
const { authGuard } = require('../middleware/auth');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');

// Configure Multer
const uploadDir = path.join(__dirname, '../../uploads/proofs');
fs.ensureDirSync(uploadDir);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'proof-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage: storage });

async function ensureProofImageColumn() {
  try {
    // Check if column exists
    const [rows] = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'payment_installments' AND column_name = 'proof_image'`
    );
    if (rows.length === 0) {
      await pool.query(`ALTER TABLE payment_installments ADD COLUMN proof_image VARCHAR(255) NULL`);
      console.log('Added proof_image column to payment_installments');
    }
    
    // Check for paid_by column
    const [rows2] = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'payment_installments' AND column_name = 'paid_by'`
    );
    if (rows2.length === 0) {
      await pool.query(`ALTER TABLE payment_installments ADD COLUMN paid_by VARCHAR(100) NULL`);
      console.log('Added paid_by column to payment_installments');
    }

    // Check for approved_by column
    const [rows3] = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'payment_installments' AND column_name = 'approved_by'`
    );
    if (rows3.length === 0) {
      await pool.query(`ALTER TABLE payment_installments ADD COLUMN approved_by VARCHAR(100) NULL`);
      console.log('Added approved_by column to payment_installments');
    }

  } catch (e) {
    console.error('Ensure columns failed:', e.message);
  }
}
async function refreshInstallmentStatuses() {
  try {
    const [result] = await pool.query(
      `UPDATE payment_installments
       SET status = 'overdue'
       WHERE status <> 'paid' AND period_end < CURRENT_DATE`
    );
    console.log('[installments] refresh overdue:', result?.length ?? 0);
  } catch (err) {
    console.error('[installments] refresh error:', err);
  }
}

// ตั้ง job ให้รันทุกวันหลังเที่ยงคืน (00:10 น.) ตามเวลาเครื่องเซิร์ฟเวอร์
function startDailyInstallmentStatusJob() {
  const scheduleNext = () => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 10, 0);
    const delay = Math.max(5_000, next.getTime() - now.getTime());
    setTimeout(async () => {
      await refreshInstallmentStatuses();
      scheduleNext();
    }, delay);
  };
  // รันครั้งแรกตอนบูต
  refreshInstallmentStatuses().finally(scheduleNext);
}

// helper เพิ่มเดือนแบบปลอดภัย (ปลายเดือน)
function addMonthsSafe(date, months) {
  const d = new Date(date.getTime());
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
}

function toPostgresDateTime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function toPostgresDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function generateInstallmentsForPayment(paymentId) {
  const [rows] = await pool.query(
    `SELECT id, house_number, months, amount_per_month, total_amount, created_at
     FROM payments WHERE id = $1`,
    [paymentId]
  );
  if (!rows || rows.length === 0) throw new Error('payment not found');
  const p = rows[0];

  const months = Number(p.months) || 0;
  if (![1, 3, 6, 12].includes(months)) throw new Error('months must be 1,3,6,12');

  const createdAt = new Date(p.created_at);
  const count = 12 / months; // จำนวนงวดใน 1 ปี
  const amountPerInstallment = Number(p.amount_per_month) * months; // งวดละ = ต่อเดือน × เดือนที่เลือก

  await pool.query('DELETE FROM payment_installments WHERE payment_id = $1', [paymentId]);

  const valuesArray = [];
  for (let i = 1; i <= count; i++) {
    const due = addMonthsSafe(createdAt, months * i);
    const periodStart = addMonthsSafe(createdAt, months * (i - 1));
    const periodEnd = addMonthsSafe(createdAt, months * i);
    valuesArray.push([
      paymentId,
      p.house_number,
      i,                 // installment_no
      months,            // months_span
      toPostgresDateTime(due),
      amountPerInstallment,
      'pending',
      null,              // paid_at
      toPostgresDate(periodStart),
      toPostgresDate(periodEnd),
    ]);
  }

  if (valuesArray.length) {
    const columns = ['payment_id', 'house_number', 'installment_no', 'months_span', 'due_date', 'amount', 'status', 'paid_at', 'period_start', 'period_end'];
    const { sql, params } = buildBatchInsert('payment_installments', columns, valuesArray);
    await pool.query(sql, params);
  }
  return { payment_id: paymentId, count, amount_per_installment: amountPerInstallment };
}

function registerPromptPayRoutes(app) {
  // Ensure new columns exist on startup
  ensureProofImageColumn().catch(e => console.error('ensureProofImageColumn on boot:', e.message));

  app.get('/promptpay-qr', async (req, res) => {
    try {
      if (!PROMPTPAY_ID) return res.status(500).json({ message: 'ยังไม่ได้ตั้ง PROMPTPAY_ID ใน .env' });

      const forceRefresh = String(req.query.refresh || '0') === '1';
      const key = 'default';
      const cached = qrCache.get(key);

      const amount = PROMPTPAY_DEFAULT_AMOUNT > 0 ? PROMPTPAY_DEFAULT_AMOUNT : null;
      const payload = amount != null
        ? generatePayload(PROMPTPAY_ID, { amount })
        : generatePayload(PROMPTPAY_ID);

      if (!forceRefresh && cached && !isExpired(cached.expiresAt)) {
        return res.json(buildQrResponse(cached, { id: PROMPTPAY_ID, amount, payload }));
      }

      const record = await createAndCacheQR(key, { amount, prefix: 'pp-default', payload });
      return res.json(buildQrResponse(record, { id: PROMPTPAY_ID, amount, payload }));
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'สร้าง/ดึง QR ไม่สำเร็จ', error: err.message });
    }
  });

  app.get('/promptpay-qr/user/:userId', async (req, res) => {
    try {
      if (!PROMPTPAY_ID) return res.status(500).json({ message: 'ยังไม่ได้ตั้ง PROMPTPAY_ID ใน .env' });
      const { userId } = req.params;
      const forceRefresh = String(req.query.refresh || '0') === '1';

      const [userRows] = await pool.query('SELECT amount FROM users WHERE id = $1', [userId]);
      const amount = userRows[0]?.amount;
      if (!amount || Number(amount) <= 0) {
        return res.status(404).json({ message: 'ไม่พบจำนวนเงินสำหรับ userId นี้' });
      }

      const key = userId;
      const cached = qrCache.get(key);

      if (!forceRefresh && cached && !isExpired(cached.expiresAt) && Number(cached.amount) === Number(amount)) {
        return res.json(buildQrResponse(cached, {
          userId,
          id: PROMPTPAY_ID,
          amount: Number(amount),
          payload: cached.payload,
        }));
      }

      const payload = generatePayload(PROMPTPAY_ID, { amount: Number(amount) });
      const record = await createAndCacheQR(key, {
        amount: Number(amount),
        prefix: `pp-${userId}`,
        payload,
      });

      // รับ intentId จาก query
      const intentId = req.query.intentId ? Number(req.query.intentId) : null;
      // หลังสร้าง QR สำเร็จ (ได้ qrId/url/payload) ให้ update intent (ถ้ามี)
      if (intentId) {
        try {
          await pool.query(
            `UPDATE payment_intents SET qr_id = $1, updated_at = NOW() WHERE id = $2`,
            [record.filename || record.id || null, intentId]
          );
        } catch (e) {
          console.warn('update intent qr_id failed', e.message);
        }
      }

      return res.json(buildQrResponse(record, {
        userId,
        id: PROMPTPAY_ID,
        amount: Number(amount),
        payload,
      }));
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'สร้าง/ดึง QR ไม่สำเร็จ', error: err.message });
    }
  });

  // GET /payments/latest?house_number=xxx หรือ ?house_id=123
  app.get('/payments/latest', async (req, res) => {
    try {
      const houseNumber = String(req.query.house_number || '').trim();
      const houseId = req.query.house_id != null && String(req.query.house_id).trim() !== ''
        ? Number(req.query.house_id)
        : null;
      if (!houseNumber && !houseId) {
        return res.status(400).json({ ok: false, message: 'ต้องระบุ house_number หรือ house_id' });
      }
      let sql = 'SELECT id, house_number, house_id, months, amount_per_month, total_amount, created_at, cover_until FROM payments WHERE ';
      const params = [];
      if (houseId != null && Number.isFinite(houseId)) { sql += 'house_id = $1'; params.push(houseId); }
      else { sql += 'house_number = $1'; params.push(houseNumber); }
      sql += ' ORDER BY created_at DESC, id DESC LIMIT 1';

      const [rows] = await pool.query(sql, params);
      if (!rows || rows.length === 0) return res.status(404).json({ ok: false, message: 'ไม่พบข้อมูลการชำระล่าสุด' });
      const r = rows[0];
      return res.json({
        ok: true,
        data: {
          id: r.id,
          house_number: r.house_number,
          house_id: r.house_id,
          months: Number(r.months) || 0,
          amount_per_month: r.amount_per_month != null ? Number(r.amount_per_month) : null,
          total_amount: r.total_amount != null ? Number(r.total_amount) : null,
          created_at: r.created_at,
          cover_until: r.cover_until,
        },
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ ok: false, message: 'ดึงข้อมูล payments ไม่สำเร็จ', error: err.message });
    }
  });

  // POST /payments/:id/installments/regenerate
  app.post('/payments/:id/installments/regenerate', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: 'invalid payment id' });
      const out = await generateInstallmentsForPayment(id);
      return res.json({ ok: true, data: out });
    } catch (err) {
      console.error(err);
      res.status(500).json({ ok: false, message: 'สร้างงวดไม่สำเร็จ', error: err.message });
    }
  });

  app.patch('/payment-installments/:id', authGuard, upload.single('file'), async (req, res) => {
    try {
      await ensureProofImageColumn(); // Ensure column exists before update

      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: 'invalid id' });

      const allowed = new Set(['paid', 'pending', 'overdue', 'waiting_approval']);
      const status = String(req.body?.status || '').toLowerCase();
      if (!allowed.has(status)) return res.status(400).json({ ok: false, message: 'status must be paid|pending|overdue|waiting_approval' });

      const methodRaw = req.body?.paid_method ? String(req.body.paid_method).toLowerCase() : null;
      const methodAllowed = new Set(['cash', 'promptpay', 'bank_transfer']);
      const method = methodRaw && methodAllowed.has(methodRaw) ? methodRaw : null;
      const note = req.body?.paid_note ? String(req.body.paid_note) : null;
      const paidBy = req.user?.username || 'System'; // Get username from token
      
      let proofPath = null;
      if (req.file) {
        // Save relative path
        proofPath = 'uploads/proofs/' + req.file.filename;
      }

      let sql, params;
      if (status === 'paid') {
        // เมื่ออนุมัติ (paid): เก็บ approved_by = คนที่กดอนุมัติ, คง paid_by เดิม (ถ้ามี)
        // ถ้า paid_by ยังว่างอยู่ (จ่ายเงินสดตรง ไม่ผ่าน waiting) ให้ใช้ paidBy
        if (proofPath) {
             sql = `
            UPDATE payment_installments
            SET status='paid', paid_at = NOW(), paid_method = COALESCE($1, paid_method),
                paid_note = COALESCE($2, paid_note), proof_image = $3,
                paid_by = COALESCE(paid_by, $4), approved_by = $4
            WHERE id = $5
          `;
          params = [method, note, proofPath, paidBy, id];
        } else {
             sql = `
            UPDATE payment_installments
            SET status='paid', paid_at = NOW(), paid_method = COALESCE($1, paid_method),
                paid_note = COALESCE($2, paid_note),
                paid_by = COALESCE(paid_by, $3), approved_by = $3
            WHERE id = $4
          `;
          params = [method, note, paidBy, id];
        }
      } else if (status === 'waiting_approval') {
        // ผู้ใช้ส่งหลักฐาน: เก็บ paid_by = คนที่ส่ง
        const updateParams = [method, note, paidBy, id];
        let proofSql = '';
        if (proofPath) {
          proofSql = ', proof_image = $5';
          updateParams.push(proofPath);
        }
        
        sql = `
          UPDATE payment_installments
          SET status='waiting_approval', paid_method = $1, paid_note = $2, paid_by = $3 ${proofSql}
          WHERE id = $4
        `;
        params = updateParams;
      } else {
        sql = `
          UPDATE payment_installments
          SET status = $1, paid_at = NULL, paid_method = NULL, paid_note = NULL, proof_image = NULL, paid_by = NULL, approved_by = NULL
          WHERE id = $2
        `;
        params = [status, id];
      }
      const [r] = await pool.query(sql, params);
      return res.json({ ok: true, affected: r?.length || 0, proof: proofPath });
    } catch (err) {
      console.error(err);
      res.status(500).json({ ok: false, message: 'update status failed', error: err.message });
    }
  });

  // ensure installments API returns paid_method/paid_note
  app.get('/payments/:id/installments', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [rows] = await pool.query(
        `SELECT id, payment_id, house_number, installment_no, months_span, due_date, amount, status,
                paid_at, paid_method, paid_note, period_start, period_end, proof_image, paid_by, approved_by
         FROM payment_installments
         WHERE payment_id = $1
         ORDER BY installment_no ASC`,
        [id]
      );
      res.json({ ok: true, data: rows || [] });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'fetch installments failed' });
    }
  });

  // POST /payments/installments/regenerate-latest?house_number=H001
  app.post('/payments/installments/regenerate-latest', async (req, res) => {
    try {
      const houseNumber = String(req.query.house_number || '').trim();
      if (!houseNumber) return res.status(400).json({ ok: false, message: 'ต้องระบุ house_number' });
      const [rows] = await pool.query(
        `SELECT id FROM payments WHERE house_number = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
        [houseNumber]
      );
      if (!rows || rows.length === 0) return res.status(404).json({ ok: false, message: 'ไม่พบ payment ล่าสุด' });
      const out = await generateInstallmentsForPayment(rows[0].id);
      return res.json({ ok: true, data: out });
    } catch (err) {
      console.error(err);
      res.status(500).json({ ok: false, message: 'สร้างงวด (ล่าสุด) ไม่สำเร็จ', error: err.message });
    }
  });

  // GET /payment-installments/latest?search=587&limit=300
  // ดึงงวดล่าสุด (recent) ของแต่ละบ้านจากตาราง payment_installments
  app.get('/payment-installments/latest', async (req, res) => {
    try {
      const search = String(req.query.search || '').trim();
      const limit = Math.max(1, Math.min(1000, Number(req.query.limit || 300)));
      const month = req.query.month ? Number(req.query.month) : null; // 1-12
      const year = req.query.year ? Number(req.query.year) : null;    // YYYY

      // เงื่อนไข Filter เพิ่มเติม
      const conditions = [];
      const params = [];
      let paramIdx = 1;

      if (search) {
        conditions.push(`pi.house_number LIKE $${paramIdx++}`);
        params.push(`%${search}%`);
      }

      // ถ้ามี month/year: กรองเฉพาะ installment ที่ครอบคลุมช่วงเวลานั้น
      // period_start <= LastDayOfMonth AND period_end >= FirstDayOfMonth
      if (month && year) {
        // หาวันแรกและวันสุดท้ายของเดือนที่เลือก
        // แต่ใน DB เก็บเป็น period_start, period_end (DATE)
        // Logic: Installment ครอบคลุมเดือน M ปี Y ถ้า:
        //  - period_start <= Y-M-[EndDay]
        //  - period_end >= Y-M-01
        
        // สร้าง string วันที่ YYYY-MM-DD สำหรับ query
        const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
        // หาวันสุดท้าย: ใช้ JS Date
        const lastDateObj = new Date(year, month, 0); // month is 1-based, so Date(y, m, 0) gives last day of prev month? No, Date(y, m, 0) gives last day of month 'm' if m is 1-based?? 
        // Wait, new Date(2026, 1, 1) is Feb 1st. new Date(2026, 2, 0) is Last day of Feb.
        // req.query.month 1-12. 
        // new Date(year, month, 0) -> gives last day of `month`. e.g. month=1 (Jan), new Date(2026, 1, 0) = Jan 31. Correct.
        const lastDayVal = lastDateObj.getDate();
        const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(lastDayVal).padStart(2, '0')}`;

        conditions.push(`pi.period_start <= $${paramIdx++}::DATE`);
        params.push(lastDay);
        conditions.push(`pi.period_end >= $${paramIdx++}::DATE`);
        params.push(firstDay);
      }

      const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

      // PostgreSQL: window function logic
      // ใช้ ROW_NUMBER() เพื่อเลือก "1 รายการ" ต่อ 1 บ้าน
      // กรณีระบุเดือน/ปี: เราหวังผลให้ได้งวดที่ตรงกับเดือนนั้นที่สุด (ซึ่งตาม Logic ควรมีแค่งวดเดียวที่ cover)
      // กรณีไม่ระบุ: เอาตัวล่าสุด (ตาม due_date/id)
      
      let sql = `
        WITH ranked AS (
          SELECT
            pi.id,
            pi.payment_id,
            pi.house_number,
            pi.installment_no,
            pi.months_span,
            pi.due_date,
            pi.amount,
            pi.status,
            pi.paid_at,
            ROW_NUMBER() OVER (
              PARTITION BY pi.house_number
              ORDER BY pi.due_date DESC, pi.installment_no DESC, pi.id DESC
            ) AS rn
          FROM payment_installments pi
          ${whereClause}
        )
        SELECT
          house_number,
          payment_id,
          installment_no,
          months_span,
          due_date,
          amount,
          status
        FROM ranked
        WHERE rn = 1
        ORDER BY house_number ASC
        LIMIT $${paramIdx}
      `;
      // params already filled, just add limit
      params.push(limit);

      const [rows] = await pool.query(sql, params);
      return res.json({ ok: true, data: rows || [] });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ ok: false, message: 'ดึงข้อมูลงวดล่าสุดไม่สำเร็จ', error: err.message });
    }
  });

  // Fallback query for older PostgreSQL versions (without window function)
  app.get('/payment-installments/latest/fallback', async (req, res) => {
    try {
      const search = String(req.query.search || '').trim();
      const limit = Math.max(1, Math.min(1000, Number(req.query.limit || 300)));

      let sql = `
        SELECT
          pi1.house_number,
          pi1.payment_id,
          pi1.installment_no,
          pi1.months_span,
          pi1.due_date,
          pi1.amount,
          pi1.status
        FROM payment_installments pi1
        INNER JOIN (
          SELECT house_number, MAX(due_date) AS max_due_date
          FROM payment_installments
          ${search ? 'WHERE house_number LIKE $1' : ''}
          GROUP BY house_number
        ) pi2 ON pi1.house_number = pi2.house_number AND pi1.due_date = pi2.max_due_date
        ORDER BY pi1.house_number ASC
        LIMIT ${search ? '$2' : '$1'}
      `;
      const params = [];
      if (search) params.push(`%${search}%`);
      params.push(limit);

      const [rows] = await pool.query(sql, params);
      return res.json({ ok: true, data: rows || [] });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ ok: false, message: 'ดึงข้อมูลงวดล่าสุด (fallback) ไม่สำเร็จ', error: err.message });
    }
  });

  // สร้าง intent เมื่อผู้ใช้กดงวด
  app.post('/payment-intents', async (req, res) => {
    try {
      const { installment_id, payment_id, house_number, amount, method = 'promptpay' } = req.body || {};
      if (!installment_id || !payment_id || !house_number || !Number(amount))
        return res.status(400).json({ ok: false, message: 'missing fields' });

      const [result] = await pool.query(
        `INSERT INTO payment_intents (installment_id, payment_id, house_number, amount, method)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [installment_id, payment_id, String(house_number), Number(amount), String(method)]
      );
      res.json({ ok: true, data: { id: result[0]?.id } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'create intent failed' });
    }
  });

  // GET: สร้าง/ดึง QR โดยอิงจากตาราง payment_installments ตาม installment_id
  app.get('/promptpay-qr/installment/:installmentId', async (req, res) => {
    try {
      if (!PROMPTPAY_ID) return res.status(500).json({ message: 'ยังไม่ได้ตั้ง PROMPTPAY_ID ใน .env' });

      const installmentId = Number(req.params.installmentId);
      if (!Number.isFinite(installmentId)) {
        return res.status(400).json({ ok: false, message: 'invalid installment id' });
      }
      const forceRefresh = String(req.query.refresh || '0') === '1';
      const intentId = req.query.intentId ? Number(req.query.intentId) : null;

      // ดึงข้อมูลงวดจากตารางโดยตรง
      const [rows] = await pool.query(
        `SELECT id, payment_id, house_number, amount, status, due_date
         FROM payment_installments WHERE id = $1 LIMIT 1`,
        [installmentId]
      );
      if (!rows || rows.length === 0) {
        return res.status(404).json({ ok: false, message: 'ไม่พบงวดที่ระบุ' });
      }
      const inst = rows[0];
      const amount = Number(inst.amount);
      if (!(amount > 0)) {
        return res.status(400).json({ ok: false, message: 'amount ของงวดนี้ไม่ถูกต้อง' });
      }

      // แยก cache ต่อ installment และจำนวน
      const key = `ins:${installmentId}:${amount}`;
      const cached = qrCache.get(key);

      if (!forceRefresh && cached && !isExpired(cached.expiresAt) && Number(cached.amount) === amount) {
        // ผูก intent กับ QR ที่ cache ไว้ (ถ้าส่งมา)
        if (intentId) {
          try {
            await pool.query(
              `UPDATE payment_intents SET qr_id = $1, updated_at = NOW() WHERE id = $2`,
              [cached.filename || cached.id || null, intentId]
            );
          } catch (e) {
            console.warn('update intent (cached) failed', e.message);
          }
        }
        return res.json(
          buildQrResponse(cached, {
            id: PROMPTPAY_ID,
            amount,
            payload: cached.payload,
            installmentId,
            paymentId: inst.payment_id,
            houseNumber: inst.house_number,
          })
        );
      }

      // สร้าง payload และ cache
      const payload = generatePayload(PROMPTPAY_ID, { amount });
      const record = await createAndCacheQR(key, {
        amount,
        prefix: `pp-ins-${installmentId}`,
        payload,
      });

      // อัปเดต intent ด้วยข้อมูลไฟล์/ID ของ QR ที่เพิ่งสร้าง (ถ้าให้มา)
      if (intentId) {
        try {
          await pool.query(
            `UPDATE payment_intents SET qr_id = $1, updated_at = NOW() WHERE id = $2`,
            [record.filename || record.id || null, intentId]
          );
        } catch (e) {
          console.warn('update intent qr_id failed', e.message);
        }
      }

      return res.json(
        buildQrResponse(record, {
          id: PROMPTPAY_ID,
          amount,
          payload,
          installmentId,
          paymentId: inst.payment_id,
          houseNumber: inst.house_number,
        })
      );
    } catch (err) {
      console.error(err);
      res.status(500).json({ ok: false, message: 'สร้าง/ดึง QR ไม่สำเร็จ', error: err.message });
    }
  });

  // ...existing routes remain...
  // GET /payment-installments/logs
  app.get('/payment-installments/logs', authGuard, async (req, res) => {
    try {
      const search = String(req.query.search || '').trim();
      const limit = Math.max(1, Math.min(100, Number(req.query.limit || 50)));
      
      const conditions = [];
      const params = [];
      let paramIdx = 1;

      // Filter: Show only relevant logs (paid, waiting, or has proof)
      // If you want ALL history including pending, remove this condition or make it optional.
      // Usually "logs" implies something happened.
      conditions.push(`(pi.status IN ('paid', 'waiting_approval') OR pi.proof_image IS NOT NULL OR pi.paid_at IS NOT NULL)`);

      if (search) {
        conditions.push(`(pi.house_number ILIKE $${paramIdx} OR pi.paid_by ILIKE $${paramIdx} OR pi.approved_by ILIKE $${paramIdx})`);
        params.push(`%${search}%`);
        paramIdx++;
      }

      const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

      const sql = `
        SELECT pi.id, pi.payment_id, pi.house_number, pi.installment_no, pi.months_span, 
               pi.due_date, pi.amount, pi.status, pi.paid_at, pi.paid_method, pi.paid_note, pi.proof_image, pi.paid_by, pi.approved_by
        FROM payment_installments pi
        ${whereClause}
        ORDER BY pi.paid_at DESC NULLS LAST, pi.due_date DESC, pi.id DESC
        LIMIT $${paramIdx}
      `;
      params.push(limit);

      const [rows] = await pool.query(sql, params);
      return res.json({ ok: true, data: rows || [] });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ ok: false, message: 'Failed to fetch payment logs', error: err.message });
    }
  });

  // GET /payment-installments/waiting-approval
  app.get('/payment-installments/waiting-approval', authGuard, async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT pi.id, pi.payment_id, pi.house_number, pi.installment_no, pi.months_span, 
                pi.due_date, pi.amount, pi.status, pi.paid_at, pi.paid_method, pi.paid_note, pi.proof_image, pi.paid_by, pi.approved_by
         FROM payment_installments pi
         WHERE pi.status::text = 'waiting_approval'
         ORDER BY pi.due_date ASC, pi.id ASC`
      );
      return res.json({ ok: true, data: rows || [] });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ ok: false, message: 'Failed to fetch waiting approval items', error: err.message });
    }
  });
}

module.exports = { registerPromptPayRoutes, startDailyInstallmentStatusJob, refreshInstallmentStatuses };