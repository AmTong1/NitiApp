const express = require('express');
const router = express.Router();
const { pool } = require('../db/pool');
const { authGuard, adminOnly } = require('../middleware/auth');

const VALID_CYCLES = [3, 6, 12];
const CYCLE_LABELS = { 3: 'ราย 3 เดือน', 6: 'ราย 6 เดือน', 12: 'รายปี' };

async function ensureDiscountTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS discount_configs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      cycle_months INT NOT NULL,
      discount_type ENUM('percentage', 'fixed') NOT NULL DEFAULT 'percentage',
      discount_value DECIMAL(12,2) NOT NULL DEFAULT 0,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      updated_by BIGINT NULL,
      UNIQUE KEY uq_dc_cycle (cycle_months),
      INDEX idx_dc_enabled (enabled)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS discount_requests (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      action ENUM('create', 'update', 'delete') NOT NULL,
      cycle_months INT NOT NULL,
      discount_type ENUM('percentage', 'fixed') NULL,
      discount_value DECIMAL(12,2) NULL,
      old_discount_type ENUM('percentage', 'fixed') NULL,
      old_discount_value DECIMAL(12,2) NULL,
      requested_by BIGINT NOT NULL,
      requested_by_name VARCHAR(255) NULL,
      requested_by_role VARCHAR(32) NULL,
      status ENUM('approved', 'waiting_approval', 'rejected') NOT NULL DEFAULT 'waiting_approval',
      approved_by BIGINT NULL,
      approved_by_name VARCHAR(255) NULL,
      approved_at TIMESTAMP NULL,
      reject_reason VARCHAR(500) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_dr_status (status),
      INDEX idx_dr_cycle (cycle_months),
      INDEX idx_dr_created (created_at)
    )
  `);
}

async function getUserName(userId) {
  try {
    const [rows] = await pool.query(
      "SELECT full_name, username FROM accounts WHERE id = ? LIMIT 1",
      [userId]
    );
    const u = rows?.[0];
    return u?.full_name || u?.username || 'Unknown';
  } catch { return 'Unknown'; }
}

async function applyDiscount(cycleMonths, discountType, discountValue, userId) {
  await pool.query(
    `INSERT INTO discount_configs (cycle_months, discount_type, discount_value, enabled, updated_by)
     VALUES (?, ?, ?, TRUE, ?)
     ON DUPLICATE KEY UPDATE
       discount_type = VALUES(discount_type),
       discount_value = VALUES(discount_value),
       enabled = TRUE,
       updated_by = VALUES(updated_by)`,
    [cycleMonths, discountType, discountValue, userId]
  );
}

async function removeDiscount(cycleMonths) {
  await pool.query(
    `DELETE FROM discount_configs WHERE cycle_months = ?`,
    [cycleMonths]
  );
}

function registerDiscountRoutes(app) {
  ensureDiscountTables().catch(e => console.warn('[discount] ensureDiscountTables failed:', e.message));

  app.get('/discount/configs', authGuard, adminOnly, async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT id, cycle_months, discount_type, discount_value, enabled, updated_at
         FROM discount_configs
         WHERE enabled = TRUE
         ORDER BY cycle_months ASC`
      );
      const [pendingRows] = await pool.query(
        `SELECT id, action, cycle_months, discount_type, discount_value,
                old_discount_type, old_discount_value,
                requested_by_name, requested_by_role, created_at
         FROM discount_requests
         WHERE status = 'waiting_approval'
         ORDER BY created_at DESC`
      );
      res.json({ ok: true, data: rows || [], pending: pendingRows || [] });
    } catch (e) {
      console.error('[discount] GET /discount/configs error:', e);
      res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
    }
  });

  app.post('/discount/configs', authGuard, adminOnly, async (req, res) => {
    try {
      const { cycle_months, discount_type, discount_value } = req.body;
      const cycle = Number(cycle_months);
      const value = Number(discount_value);
      const type = String(discount_type || 'percentage');

      if (!VALID_CYCLES.includes(cycle)) {
        return res.status(400).json({ ok: false, error: 'INVALID_CYCLE', message: 'cycle_months ต้องเป็น 3, 6 หรือ 12' });
      }
      if (!['percentage', 'fixed'].includes(type)) {
        return res.status(400).json({ ok: false, error: 'INVALID_TYPE', message: 'discount_type ต้องเป็น percentage หรือ fixed' });
      }
      if (!Number.isFinite(value) || value <= 0) {
        return res.status(400).json({ ok: false, error: 'INVALID_VALUE', message: 'discount_value ต้อง > 0' });
      }
      if (type === 'percentage' && value > 100) {
        return res.status(400).json({ ok: false, error: 'INVALID_PERCENTAGE', message: 'ส่วนลดร้อยละต้อง ≤ 100' });
      }

      const userName = await getUserName(req.user.id);
      const role = req.user.role;

      const [existing] = await pool.query(
        `SELECT id, discount_type, discount_value FROM discount_configs WHERE cycle_months = ? LIMIT 1`,
        [cycle]
      );
      const isUpdate = existing && existing.length > 0;
      const action = isUpdate ? 'update' : 'create';
      const oldType = isUpdate ? existing[0].discount_type : null;
      const oldValue = isUpdate ? existing[0].discount_value : null;

      if (role === 'superadmin') {
        await applyDiscount(cycle, type, value, req.user.id);
        await pool.query(
          `INSERT INTO discount_requests
            (action, cycle_months, discount_type, discount_value, old_discount_type, old_discount_value,
             requested_by, requested_by_name, requested_by_role, status, approved_by, approved_by_name, approved_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, NOW())`,
          [action, cycle, type, value, oldType, oldValue,
           req.user.id, userName, role, req.user.id, userName]
        );
        return res.json({ ok: true, status: 'approved', message: 'บันทึกส่วนลดเรียบร้อย' });
      }

      const [pendingExist] = await pool.query(
        `SELECT id FROM discount_requests WHERE cycle_months = ? AND status = 'waiting_approval' LIMIT 1`,
        [cycle]
      );
      if (pendingExist && pendingExist.length > 0) {
        return res.status(409).json({ ok: false, error: 'PENDING_EXISTS', message: 'มีคำขอที่รออนุมัติอยู่แล้วสำหรับรอบนี้' });
      }

      await pool.query(
        `INSERT INTO discount_requests
          (action, cycle_months, discount_type, discount_value, old_discount_type, old_discount_value,
           requested_by, requested_by_name, requested_by_role, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting_approval')`,
        [action, cycle, type, value, oldType, oldValue,
         req.user.id, userName, role]
      );
      return res.json({ ok: true, status: 'waiting_approval', message: 'ส่งคำขออนุมัติแล้ว กรุณารอ SuperAdmin ตรวจสอบ' });
    } catch (e) {
      console.error('[discount] POST /discount/configs error:', e);
      res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
    }
  });

  app.delete('/discount/configs/:cycle', authGuard, adminOnly, async (req, res) => {
    try {
      const cycle = Number(req.params.cycle);
      if (!VALID_CYCLES.includes(cycle)) {
        return res.status(400).json({ ok: false, error: 'INVALID_CYCLE' });
      }

      const [existing] = await pool.query(
        `SELECT id, discount_type, discount_value FROM discount_configs WHERE cycle_months = ? LIMIT 1`,
        [cycle]
      );
      if (!existing || existing.length === 0) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND', message: 'ไม่พบส่วนลดสำหรับรอบนี้' });
      }

      const userName = await getUserName(req.user.id);
      const role = req.user.role;
      const oldType = existing[0].discount_type;
      const oldValue = existing[0].discount_value;

      if (role === 'superadmin') {
        await removeDiscount(cycle);
        await pool.query(
          `INSERT INTO discount_requests
            (action, cycle_months, discount_type, discount_value, old_discount_type, old_discount_value,
             requested_by, requested_by_name, requested_by_role, status, approved_by, approved_by_name, approved_at)
           VALUES ('delete', ?, NULL, NULL, ?, ?, ?, ?, ?, 'approved', ?, ?, NOW())`,
          [cycle, oldType, oldValue, req.user.id, userName, role, req.user.id, userName]
        );
        return res.json({ ok: true, status: 'approved', message: 'ลบส่วนลดเรียบร้อย' });
      }

      const [pendingExist] = await pool.query(
        `SELECT id FROM discount_requests WHERE cycle_months = ? AND status = 'waiting_approval' LIMIT 1`,
        [cycle]
      );
      if (pendingExist && pendingExist.length > 0) {
        return res.status(409).json({ ok: false, error: 'PENDING_EXISTS', message: 'มีคำขอที่รออนุมัติอยู่แล้วสำหรับรอบนี้' });
      }

      await pool.query(
        `INSERT INTO discount_requests
          (action, cycle_months, discount_type, discount_value, old_discount_type, old_discount_value,
           requested_by, requested_by_name, requested_by_role, status)
         VALUES ('delete', ?, NULL, NULL, ?, ?, ?, ?, ?, 'waiting_approval')`,
        [cycle, oldType, oldValue, req.user.id, userName, role]
      );
      return res.json({ ok: true, status: 'waiting_approval', message: 'ส่งคำขอลบส่วนลดแล้ว กรุณารอ SuperAdmin ตรวจสอบ' });
    } catch (e) {
      console.error('[discount] DELETE /discount/configs error:', e);
      res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
    }
  });

  app.get('/discount/requests', authGuard, adminOnly, async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT id, action, cycle_months, discount_type, discount_value,
                old_discount_type, old_discount_value,
                requested_by, requested_by_name, requested_by_role,
                status, approved_by, approved_by_name, approved_at, reject_reason,
                created_at
         FROM discount_requests
         ORDER BY created_at DESC
         LIMIT 100`
      );
      res.json({ ok: true, data: rows || [] });
    } catch (e) {
      console.error('[discount] GET /discount/requests error:', e);
      res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
    }
  });

  app.get('/discount/requests/waiting', authGuard, adminOnly, async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT id, action, cycle_months, discount_type, discount_value,
                old_discount_type, old_discount_value,
                requested_by, requested_by_name, requested_by_role,
                created_at
         FROM discount_requests
         WHERE status = 'waiting_approval'
         ORDER BY created_at DESC`
      );
      res.json({ ok: true, data: rows || [] });
    } catch (e) {
      console.error('[discount] GET /discount/requests/waiting error:', e);
      res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
    }
  });

  app.patch('/discount/requests/:id/status', authGuard, async (req, res) => {
    try {
      if (req.user.role !== 'superadmin') {
        return res.status(403).json({ ok: false, error: 'FORBIDDEN', message: 'เฉพาะ SuperAdmin เท่านั้น' });
      }

      const requestId = Number(req.params.id);
      const { status, reason } = req.body;
      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ ok: false, error: 'INVALID_STATUS' });
      }

      const [rows] = await pool.query(
        `SELECT * FROM discount_requests WHERE id = ? AND status = 'waiting_approval' LIMIT 1`,
        [requestId]
      );
      if (!rows || rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND', message: 'ไม่พบคำขอหรือคำขอถูกดำเนินการแล้ว' });
      }

      const request = rows[0];
      const userName = await getUserName(req.user.id);

      if (status === 'approved') {
        if (request.action === 'create' || request.action === 'update') {
          await applyDiscount(request.cycle_months, request.discount_type, request.discount_value, req.user.id);
        } else if (request.action === 'delete') {
          await removeDiscount(request.cycle_months);
        }
      }

      await pool.query(
        `UPDATE discount_requests
         SET status = ?, approved_by = ?, approved_by_name = ?, approved_at = NOW(),
             reject_reason = ?
         WHERE id = ?`,
        [status, req.user.id, userName, reason || null, requestId]
      );

      const msg = status === 'approved' ? 'อนุมัติคำขอเรียบร้อย' : 'ปฏิเสธคำขอเรียบร้อย';
      res.json({ ok: true, message: msg });
    } catch (e) {
      console.error('[discount] PATCH /discount/requests/:id/status error:', e);
      res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
    }
  });
}

async function getDiscountForCycle(cycleMonths) {
  try {
    const [rows] = await pool.query(
      `SELECT discount_type, discount_value FROM discount_configs WHERE cycle_months = ? AND enabled = TRUE LIMIT 1`,
      [cycleMonths]
    );
    if (!rows || rows.length === 0) return null;
    return { type: rows[0].discount_type, value: Number(rows[0].discount_value) };
  } catch { return null; }
}

function applyDiscountToAmount(baseAmount, discount) {
  if (!discount || !discount.value || discount.value <= 0) return baseAmount;
  if (discount.type === 'percentage') {
    return Math.round((baseAmount * (1 - discount.value / 100)) * 100) / 100;
  }
  return Math.max(0, Math.round((baseAmount - discount.value) * 100) / 100);
}

module.exports = { registerDiscountRoutes, getDiscountForCycle, applyDiscountToAmount };
