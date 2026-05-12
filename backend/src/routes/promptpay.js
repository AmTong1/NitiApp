const generatePayload = require('promptpay-qr');
const jwt = require('jsonwebtoken');
const { PROMPTPAY_ID: ENV_PROMPTPAY_ID, PROMPTPAY_DEFAULT_AMOUNT } = require('../config/env');
const { JWT_SECRET } = require('../config/env');
const {
  qrCache,
  QR_EXPIRY_MINUTES,
  isQrExpired,
  removeCachedQR,
  purgeExpiredQRCodes,
  createAndCacheQR,
  buildQrResponse,
} = require('../utils/qr');
const { pool } = require('../db/pool');
const { buildBatchInsert } = require('../utils/pgHelper');
const { authGuard } = require('../middleware/auth');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');
const { regenerateInstallmentsForPayment } = require('./payments');
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

const normalizePromptPayId = (v) => String(v || '').replace(/\D/g, '').trim();

async function getRuntimePromptPayId(app) {
  let rawSetting = '';
  try {
    if (typeof app?.getSetting === 'function') {
      rawSetting = String(await app.getSetting('promptpay_id') || '').trim();
    }
  } catch (e) {
    console.warn('[promptpay] getSetting(promptpay_id) failed:', e.message);
  }
  if (rawSetting) {
    const fromSettings = normalizePromptPayId(rawSetting);
    if (/^\d{10}$/.test(fromSettings)) return fromSettings;
    return '';
  }

  const fromEnv = normalizePromptPayId(ENV_PROMPTPAY_ID);
  if (/^\d{10}$/.test(fromEnv)) return fromEnv;

  return '';
}

function getRequestRole(req) {
  try {
    const auth = String(req.headers?.authorization || '');
    if (!auth.startsWith('Bearer ')) return null;
    const token = auth.slice(7).trim();
    if (!token) return null;
    const payload = jwt.verify(token, JWT_SECRET);
    return String(payload?.role || '').toLowerCase() || null;
  } catch {
    return null;
  }
}

function promptPayConfigMessageByRole(role) {
  if (role === 'admin' || role === 'superadmin') {
    return 'โปรดตั้งค่า PromptPay ID ให้ถูกต้อง (10 หลัก)';
  }
  return 'กรุณาติดต่อเจ้าหน้าที่';
}

function sendInvalidPromptPayConfig(req, res) {
  const role = getRequestRole(req);
  return res.status(500).json({
    code: 'PROMPTPAY_CONFIG_INVALID',
    message: promptPayConfigMessageByRole(role),
  });
}

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
    console.log('[installments] refresh overdue:', Number(result?.affectedRows || 0));
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
  const result = await regenerateInstallmentsForPayment(paymentId);
  if (!result.regenerated && result.reason !== 'fully_paid') {
    throw new Error(result.reason);
  }
  return { payment_id: paymentId, count: result.count || 0, amount_per_installment: result.amount_per_installment || 0 };
}

async function ensureNextYearInstallments(paymentId, app) {
  const [rows] = await pool.query(
    `SELECT id, house_number, months, amount_per_month, created_at
     FROM payments WHERE id = ? LIMIT 1`,
    [paymentId]
  );
  if (!rows || rows.length === 0) return { ok: false, reason: 'payment_not_found' };

  const p = rows[0];
  const months = Number(p.months) || 0;
  if (![1, 3, 6, 12].includes(months)) return { ok: false, reason: 'invalid_months' };

  const [statRows] = await pool.query(
    `SELECT COUNT(*) AS c,
            MAX(installment_no) AS max_no,
            MAX(period_end) AS max_period_end,
            MAX(due_date) AS max_due_date
       FROM payment_installments
      WHERE payment_id = ?`,
    [paymentId]
  );

  const stat = statRows?.[0] || {};
  const countRows = Number(stat.c || 0);
  if (countRows <= 0) {
    await generateInstallmentsForPayment(paymentId);
    return { ok: true, appended: 0, seeded: true };
  }

  const lastPeriodEnd = new Date(stat.max_period_end || stat.max_due_date || p.created_at);
  const lastDueDate = new Date(stat.max_due_date || stat.max_period_end || p.created_at);
  if (isNaN(lastPeriodEnd.getTime()) || isNaN(lastDueDate.getTime())) {
    return { ok: false, reason: 'invalid_anchor_dates' };
  }

  let leadDays = 0;
  try {
    if (typeof app?.getSetting === 'function') {
      const raw = await app.getSetting('installment_rollover_before_days');
      const n = Number(raw);
      if (Number.isFinite(n)) leadDays = Math.max(0, Math.min(365, Math.floor(n)));
    }
  } catch (e) {
    // fallback to default 0 days
  }

  const today = new Date();
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const lastPeriodOnly = new Date(lastPeriodEnd.getFullYear(), lastPeriodEnd.getMonth(), lastPeriodEnd.getDate());
  const triggerDate = new Date(todayOnly.getTime());
  triggerDate.setDate(triggerDate.getDate() + leadDays);

  // ยังไม่เข้าเงื่อนไข (ภายใน leadDays) ไม่ต้องสร้างงวดเพิ่ม
  if (lastPeriodOnly > triggerDate) {
    return { ok: true, appended: 0, seeded: false };
  }

  const count = 12 / months;
  const amountPerInstallment = Number(p.amount_per_month || 0) * months;
  const currentMaxNo = Number(stat.max_no || 0);

  const valuesArray = [];
  for (let i = 1; i <= count; i++) {
    const due = addMonthsSafe(lastDueDate, months * i);
    const periodStart = addMonthsSafe(lastPeriodEnd, months * (i - 1));
    const periodEnd = addMonthsSafe(lastPeriodEnd, months * i);
    valuesArray.push([
      paymentId,
      p.house_number,
      currentMaxNo + i,
      months,
      toPostgresDateTime(due),
      amountPerInstallment,
      'pending',
      null,
      toPostgresDate(periodStart),
      toPostgresDate(periodEnd),
    ]);
  }

  if (valuesArray.length) {
    const columns = ['payment_id', 'house_number', 'installment_no', 'months_span', 'due_date', 'amount', 'status', 'paid_at', 'period_start', 'period_end'];
    const { sql, params } = buildBatchInsert('payment_installments', columns, valuesArray);
    await pool.query(sql, params);
  }

  return { ok: true, appended: valuesArray.length, seeded: false };
}

function registerPromptPayRoutes(app) {
  // Ensure new columns exist on startup
  ensureProofImageColumn().catch(e => console.error('ensureProofImageColumn on boot:', e.message));
  purgeExpiredQRCodes().catch((e) => console.warn('[qr] initial purge failed:', e.message));
  const purgeTimer = setInterval(() => {
    purgeExpiredQRCodes().catch((e) => console.warn('[qr] scheduled purge failed:', e.message));
  }, 60 * 1000);
  if (typeof purgeTimer.unref === 'function') purgeTimer.unref();

  const getActiveCachedQR = async (key) => {
    const cached = qrCache.get(key);
    if (!cached) return null;
    if (isQrExpired(cached)) {
      await removeCachedQR(key);
      return null;
    }
    return cached;
  };

  const attachIntentToQR = async (intentId, record) => {
    const id = Number(intentId);
    if (!Number.isFinite(id) || id <= 0 || !record) return;
    try {
      const createdAtSec = Number.isFinite(Number(record.createdAtMs))
        ? Math.floor(Number(record.createdAtMs) / 1000)
        : null;
      if (createdAtSec && createdAtSec > 0) {
        await pool.query(
          `UPDATE payment_intents
           SET qr_id = ?, status = 'initiated', updated_at = FROM_UNIXTIME(?)
           WHERE id = ?`,
          [record.filename || record.id || null, createdAtSec, id]
        );
      } else {
        await pool.query(
          `UPDATE payment_intents
           SET qr_id = ?, status = 'initiated', updated_at = NOW()
           WHERE id = ?`,
          [record.filename || record.id || null, id]
        );
      }
    } catch (e) {
      console.warn('update intent qr_id failed', e.message);
    }
  };

  const toClientQrUrl = (req, rawUrl, filename) => {
    const origin = `${req.protocol}://${req.get('host')}`;
    if (filename) return `${origin}/qrs/${filename}`;
    if (!rawUrl) return rawUrl;
    if (String(rawUrl).startsWith('/')) return `${origin}${rawUrl}`;
    try {
      const u = new URL(String(rawUrl));
      return `${origin}${u.pathname}${u.search}`;
    } catch {
      return rawUrl;
    }
  };
  const respondQr = (req, record, extra) => {
    const payload = buildQrResponse(record, extra);
    return {
      ...payload,
      url: toClientQrUrl(req, payload.url, payload.filename),
    };
  };

  app.get('/promptpay-qr', async (req, res) => {
    try {
      const promptpayId = await getRuntimePromptPayId(app);
      if (!promptpayId) return sendInvalidPromptPayConfig(req, res);

      const forceRefresh = String(req.query.refresh || '0') === '1';
      const qAmountRaw = req.query.amount != null ? Number(req.query.amount) : null;
      if (req.query.amount != null && !(Number.isFinite(qAmountRaw) && qAmountRaw > 0)) {
        return res.status(400).json({ message: 'amount must be > 0' });
      }
      const amount = Number.isFinite(qAmountRaw) && qAmountRaw > 0
        ? qAmountRaw
        : (PROMPTPAY_DEFAULT_AMOUNT > 0 ? PROMPTPAY_DEFAULT_AMOUNT : null);
      const key = amount != null ? `default:${Number(amount).toFixed(2)}` : 'default';
      const cached = await getActiveCachedQR(key);

      const payload = amount != null
        ? generatePayload(promptpayId, { amount })
        : generatePayload(promptpayId);

      if (!forceRefresh && cached) {
        return res.json(respondQr(req, cached, { id: promptpayId, amount, payload, expiresAfterMinutes: QR_EXPIRY_MINUTES }));
      }

      const record = await createAndCacheQR(key, { amount, prefix: 'pp-default', payload });
      return res.json(respondQr(req, record, { id: promptpayId, amount, payload, expiresAfterMinutes: QR_EXPIRY_MINUTES }));
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'สร้าง/ดึง QR ไม่สำเร็จ', error: err.message });
    }
  });

  app.get('/promptpay-qr/user/:userId', async (req, res) => {
    try {
      const promptpayId = await getRuntimePromptPayId(app);
      if (!promptpayId) return sendInvalidPromptPayConfig(req, res);
      const { userId } = req.params;
      const forceRefresh = String(req.query.refresh || '0') === '1';

      const [userRows] = await pool.query('SELECT amount FROM users WHERE id = ?', [userId]);
      const amount = userRows[0]?.amount;
      if (!amount || Number(amount) <= 0) {
        return res.status(404).json({ message: 'ไม่พบจำนวนเงินสำหรับ userId นี้' });
      }

      const key = userId;
      const cached = await getActiveCachedQR(key);

      if (!forceRefresh && cached && Number(cached.amount) === Number(amount)) {
        const intentId = req.query.intentId ? Number(req.query.intentId) : null;
        if (intentId) await attachIntentToQR(intentId, cached);
        return res.json(respondQr(req, cached, {
          userId,
          id: promptpayId,
          amount: Number(amount),
          payload: cached.payload,
          expiresAfterMinutes: QR_EXPIRY_MINUTES,
        }));
      }

      if (forceRefresh && cached) {
        await removeCachedQR(key);
      }

      const payload = generatePayload(promptpayId, { amount: Number(amount) });
      const record = await createAndCacheQR(key, {
        amount: Number(amount),
        prefix: `pp-${userId}`,
        payload,
      });

      // รับ intentId จาก query
      const intentId = req.query.intentId ? Number(req.query.intentId) : null;
      // หลังสร้าง QR สำเร็จ (ได้ qrId/url/payload) ให้ update intent (ถ้ามี)
      if (intentId) await attachIntentToQR(intentId, record);

      return res.json(respondQr(req, record, {
        userId,
        id: promptpayId,
        amount: Number(amount),
        payload,
        expiresAfterMinutes: QR_EXPIRY_MINUTES,
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
      if (houseId != null && Number.isFinite(houseId)) { sql += 'house_id = ?'; params.push(houseId); }
      else { sql += 'house_number = ?'; params.push(houseNumber); }
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
      const approvedBy = req.user?.username || req.user?.full_name || (req.user?.id != null ? String(req.user.id) : null);
      
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
            SET status='paid', paid_at = NOW(), paid_method = COALESCE(?, paid_method),
                paid_note = COALESCE(?, paid_note), proof_image = ?,
                paid_by = COALESCE(paid_by, ?), approved_by = ?
            WHERE id = ?
          `;
          params = [method, note, proofPath, paidBy, approvedBy, id];
        } else {
             sql = `
            UPDATE payment_installments
            SET status='paid', paid_at = NOW(), paid_method = COALESCE(?, paid_method),
                paid_note = COALESCE(?, paid_note),
                paid_by = COALESCE(paid_by, ?), approved_by = ?
            WHERE id = ?
          `;
          params = [method, note, paidBy, approvedBy, id];
        }
      } else if (status === 'waiting_approval') {
        // ผู้ใช้ส่งหลักฐาน: เก็บ paid_by = คนที่ส่ง
        const updateParams = [method, note, paidBy];
        let proofSql = '';
        if (proofPath) {
          proofSql = ', proof_image = ?';
          updateParams.push(proofPath);
        }
        
        sql = `
          UPDATE payment_installments
          SET status='waiting_approval', paid_method = ?, paid_note = ?, paid_by = ? ${proofSql}
          WHERE id = ?
        `;
        updateParams.push(id);
        params = updateParams;
      } else {
        sql = `
          UPDATE payment_installments
          SET status = ?, paid_at = NULL, paid_method = NULL, paid_note = NULL, proof_image = NULL, paid_by = NULL, approved_by = NULL
          WHERE id = ?
        `;
        params = [status, id];
      }
      const [r] = await pool.query(sql, params);
      return res.json({ ok: true, affected: Number(r?.affectedRows || 0), proof: proofPath });
    } catch (err) {
      console.error(err);
      res.status(500).json({ ok: false, message: 'update status failed', error: err.message });
    }
  });

  // ensure installments API returns paid_method/paid_note
  app.get('/payments/:id/installments', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, message: 'invalid payment id' });

      // ถ้าครบรอบ 1 ปีล่าสุดแล้ว ให้ต่อชุดงวดปีถัดไปอัตโนมัติ
      try {
        await ensureNextYearInstallments(id, app);
      } catch (e) {
        console.warn('ensureNextYearInstallments failed:', e?.message || e);
      }

      const [rows] = await pool.query(
        `SELECT id, payment_id, house_number, installment_no, months_span, due_date, amount, status,
                paid_at, paid_method, paid_note, period_start, period_end, proof_image, paid_by, approved_by
         FROM payment_installments
         WHERE payment_id = ?
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
        `SELECT id FROM payments WHERE house_number = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
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

      if (search) {
        conditions.push('pi.house_number LIKE ?');
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

        conditions.push('pi.period_start <= ?');
        params.push(lastDay);
        conditions.push('pi.period_end >= ?');
        params.push(firstDay);
      }

      const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

      // ใช้ ROW_NUMBER() เพื่อเลือก "1 รายการ" ต่อ 1 บ้าน
      // กรณีระบุเดือน/ปี: เราหวังผลให้ได้งวดที่ตรงกับเดือนนั้นที่สุด (ซึ่งตาม Logic ควรมีแค่งวดเดียวที่ cover)
      // กรณีไม่ระบุ: เอาตัวล่าสุด (ตาม due_date/id)
      
      let sql = `
        WITH active_houses AS (
          SELECT DISTINCT TRIM(house_number) AS house_number
          FROM residents
          WHERE house_number IS NOT NULL AND TRIM(house_number) <> ''
          UNION
          SELECT DISTINCT TRIM(house_number) AS house_number
          FROM houses
          WHERE house_number IS NOT NULL AND TRIM(house_number) <> ''
        ),
        ranked AS (
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
          INNER JOIN active_houses ah ON ah.house_number = pi.house_number
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
        LIMIT ?
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

  // Fallback query for environments without window functions
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
          ${search ? 'WHERE house_number LIKE ?' : ''}
          GROUP BY house_number
        ) pi2 ON pi1.house_number = pi2.house_number AND pi1.due_date = pi2.max_due_date
        ORDER BY pi1.house_number ASC
        LIMIT ${search ? '?' : '?'}
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
      const { installment_id, method = 'promptpay' } = req.body || {};
      const installmentId = Number(installment_id);
      if (!Number.isFinite(installmentId) || installmentId <= 0) {
        return res.status(400).json({ ok: false, message: 'invalid installment_id' });
      }

      // Trust server-side installment data to avoid inconsistent/null payment_intents rows.
      const [instRows] = await pool.query(
        `SELECT id, payment_id, house_number, amount
           FROM payment_installments
          WHERE id = ?
          LIMIT 1`,
        [installmentId]
      );
      const inst = instRows?.[0];
      if (!inst) {
        return res.status(404).json({ ok: false, message: 'installment not found' });
      }

      const paymentId = Number(inst.payment_id);
      const houseNumber = String(inst.house_number || '').trim();
      const amount = Number(inst.amount);
      if (!Number.isFinite(paymentId) || paymentId <= 0 || !houseNumber || !(amount > 0)) {
        return res.status(400).json({ ok: false, message: 'installment data invalid' });
      }

      const methodRaw = String(method || 'promptpay').toLowerCase();
      const methodAllowed = new Set(['cash', 'promptpay', 'bank_transfer']);
      const safeMethod = methodAllowed.has(methodRaw) ? methodRaw : 'promptpay';

      const [result] = await pool.query(
        `INSERT INTO payment_intents (installment_id, payment_id, house_number, amount, method)
         VALUES (?, ?, ?, ?, ?)`,
        [installmentId, paymentId, houseNumber, amount, safeMethod]
      );
      res.json({ ok: true, data: { id: result.insertId || null } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'create intent failed' });
    }
  });

  // GET: สร้าง/ดึง QR โดยอิงจากตาราง payment_installments ตาม installment_id
  app.get('/promptpay-qr/installment/:installmentId', async (req, res) => {
    try {
      const promptpayId = await getRuntimePromptPayId(app);
      if (!promptpayId) return sendInvalidPromptPayConfig(req, res);

      const installmentId = Number(req.params.installmentId);
      if (!Number.isFinite(installmentId)) {
        return res.status(400).json({ ok: false, message: 'invalid installment id' });
      }
      const forceRefresh = String(req.query.refresh || '0') === '1';
      const intentId = req.query.intentId ? Number(req.query.intentId) : null;

      // ดึงข้อมูลงวดจากตารางโดยตรง
      const [rows] = await pool.query(
        `SELECT id, payment_id, house_number, amount, status, due_date
         FROM payment_installments WHERE id = ? LIMIT 1`,
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
      const cached = await getActiveCachedQR(key);

      if (!forceRefresh && cached && Number(cached.amount) === amount) {
        // ผูก intent กับ QR ที่ cache ไว้ (ถ้าส่งมา)
        if (intentId) await attachIntentToQR(intentId, cached);
        return res.json(
          respondQr(req, cached, {
            id: promptpayId,
            amount,
            payload: cached.payload,
            installmentId,
            paymentId: inst.payment_id,
            houseNumber: inst.house_number,
            expiresAfterMinutes: QR_EXPIRY_MINUTES,
          })
        );
      }

      if (forceRefresh && cached) {
        await removeCachedQR(key);
      }

      // สร้าง payload และ cache
      const payload = generatePayload(promptpayId, { amount });
      const record = await createAndCacheQR(key, {
        amount,
        prefix: `pp-ins-${installmentId}`,
        payload,
      });

      // อัปเดต intent ด้วยข้อมูลไฟล์/ID ของ QR ที่เพิ่งสร้าง (ถ้าให้มา)
      if (intentId) await attachIntentToQR(intentId, record);

      return res.json(
        respondQr(req, record, {
          id: promptpayId,
          amount,
          payload,
          installmentId,
          paymentId: inst.payment_id,
          houseNumber: inst.house_number,
          expiresAfterMinutes: QR_EXPIRY_MINUTES,
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

      // Filter: Show only relevant logs (paid, waiting, or has proof)
      // If you want ALL history including pending, remove this condition or make it optional.
      // Usually "logs" implies something happened.
      conditions.push(`(pi.status IN ('paid', 'waiting_approval') OR pi.proof_image IS NOT NULL OR pi.paid_at IS NOT NULL)`);

      if (search) {
        const q = `%${search.toLowerCase()}%`;
        conditions.push('(LOWER(pi.house_number) LIKE ? OR LOWER(COALESCE(pi.paid_by, \'\')) LIKE ? OR LOWER(COALESCE(pi.approved_by, \'\')) LIKE ?)');
        params.push(q, q, q);
      }

      const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

      const sql = `
         SELECT pi.id, pi.payment_id, pi.house_number, pi.installment_no, pi.months_span, 
           DATE_FORMAT(pi.due_date, '%Y-%m-%d %H:%i:%s') AS due_date,
           pi.amount, pi.status,
           DATE_FORMAT(pi.paid_at, '%Y-%m-%d %H:%i:%s') AS paid_at,
           pi.paid_method, pi.paid_note, pi.proof_image, pi.paid_by,
           COALESCE(NULLIF(acc_approved.username, ''), NULLIF(acc_approved.full_name, ''), pi.approved_by) AS approved_by
        FROM payment_installments pi
         LEFT JOIN accounts acc_approved
           ON (pi.approved_by REGEXP '^[0-9]+$' AND acc_approved.id = CAST(pi.approved_by AS UNSIGNED))
        ${whereClause}
        ORDER BY (pi.paid_at IS NULL) ASC, pi.paid_at DESC, pi.due_date DESC, pi.id DESC
        LIMIT ?
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
        `WITH active_houses AS (
           SELECT DISTINCT TRIM(house_number) AS house_number
           FROM residents
           WHERE house_number IS NOT NULL AND TRIM(house_number) <> ''
           UNION
           SELECT DISTINCT TRIM(house_number) AS house_number
           FROM houses
           WHERE house_number IS NOT NULL AND TRIM(house_number) <> ''
         )
         SELECT pi.id, pi.payment_id, pi.house_number, pi.installment_no, pi.months_span, 
            DATE_FORMAT(pi.due_date, '%Y-%m-%d %H:%i:%s') AS due_date,
            pi.amount, pi.status,
            DATE_FORMAT(pi.paid_at, '%Y-%m-%d %H:%i:%s') AS paid_at,
            pi.paid_method, pi.paid_note, pi.proof_image, pi.paid_by, pi.approved_by
         FROM payment_installments pi
         INNER JOIN active_houses ah ON ah.house_number = pi.house_number
         WHERE pi.status = ?
         ORDER BY pi.due_date ASC, pi.id ASC`,
        ['waiting_approval']
      );
      return res.json({ ok: true, data: rows || [] });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ ok: false, message: 'Failed to fetch waiting approval items', error: err.message });
    }
  });
}

module.exports = { registerPromptPayRoutes, startDailyInstallmentStatusJob, refreshInstallmentStatuses };
