const express = require('express');
const router = express.Router();
const { pool } = require('../db/pool');
const { authGuard, adminOnly } = require('../middleware/auth');
const { hasDb } = require('../utils/db');

async function ensureFinancialTable() {
  if (!(await hasDb())) return false;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS financial_records (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        type ENUM('income', 'expense') NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NULL,
        date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_by BIGINT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        status ENUM('approved', 'waiting_add', 'waiting_delete', 'rejected') NOT NULL DEFAULT 'approved',
        INDEX idx_fin_records_type (type),
        INDEX idx_fin_records_date (date)
      )
    `);

    try {
      await pool.query("ALTER TABLE financial_records ADD COLUMN status ENUM('approved', 'waiting_add', 'waiting_delete', 'rejected') NOT NULL DEFAULT 'approved'");
    } catch (ignore) {}

    return true;
  } catch (e) {
    console.error('ensureFinancialTable error:', e.message);
    return false;
  }
}

async function ensureFinancialVisibilityTable() {
  if (!(await hasDb())) return false;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS financial_visibility_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        action ENUM('show', 'hide') NOT NULL,
        requested_by BIGINT NOT NULL,
        status ENUM('approved', 'waiting_approval', 'rejected') NOT NULL DEFAULT 'waiting_approval',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        approved_by BIGINT NULL,
        approved_at TIMESTAMP NULL,
        INDEX idx_fin_vis_status (status)
      )
    `);

    const [rows] = await pool.query('SELECT COUNT(*) as cnt FROM financial_visibility_logs');
    if (rows[0].cnt === 0) {
      const [admins] = await pool.query("SELECT id FROM accounts WHERE role = 'superadmin' LIMIT 1");
      const creatorId = admins.length > 0 ? admins[0].id : 1;
      await pool.query(
        "INSERT INTO financial_visibility_logs (action, requested_by, status) VALUES ('hide', ?, 'approved')",
        [creatorId]
      );
    }
    return true;
  } catch (e) {
    console.error('ensureFinancialVisibilityTable error:', e.message);
    return false;
  }
}

const unifiedTransactionsSql = `
  SELECT 
    f.id, 
    f.type, 
    f.amount, 
    f.title, 
    f.description, 
    f.date, 
    'manual' AS source,
    a.full_name AS creator_name,
    f.status
  FROM financial_records f
  LEFT JOIN accounts a ON f.created_by = a.id

  UNION ALL

  SELECT 
    id, 
    'income' AS type, 
    amount, 
    CONCAT('ค่าส่วนกลางบ้าน ', COALESCE(house_number, 'ไม่ระบุ')) AS title, 
    paid_note AS description, 
    paid_at AS date, 
    'installment' AS source,
    NULL AS creator_name,
    'approved' AS status
  FROM payment_installments 
  WHERE status = 'paid' AND paid_at IS NOT NULL
`;

function registerFinancialRoutes(app) {
  ensureFinancialTable().catch(() => {});
  ensureFinancialVisibilityTable().catch(() => {});

  app.get('/financial/visibility', authGuard, async (req, res) => {
    try {
      const ok = await ensureFinancialVisibilityTable();
      if (!ok) return res.status(500).json({ ok: false, error: 'DB_NOT_READY' });

      const [approvedRows] = await pool.query(
        "SELECT action FROM financial_visibility_logs WHERE status = 'approved' ORDER BY id DESC LIMIT 1"
      );
      const isVisible = approvedRows.length > 0 && approvedRows[0].action === 'show';

      let pendingRequest = null;
      if (req.user?.role === 'admin' || req.user?.role === 'superadmin') {
        const [pendingRows] = await pool.query(
          "SELECT * FROM financial_visibility_logs WHERE status = 'waiting_approval' ORDER BY id DESC LIMIT 1"
        );
        if (pendingRows.length > 0) {
          pendingRequest = pendingRows[0];
        }
      }

      return res.json({ ok: true, data: { isVisible, pendingRequest } });
    } catch (e) {
      console.error('GET /financial/visibility error:', e);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  app.post('/financial/visibility/toggle', authGuard, adminOnly, async (req, res) => {
    try {
      const ok = await ensureFinancialVisibilityTable();
      if (!ok) return res.status(500).json({ ok: false, error: 'DB_NOT_READY' });

      const { action } = req.body;
      if (!['show', 'hide'].includes(action)) {
        return res.status(400).json({ ok: false, error: 'INVALID_ACTION' });
      }

      const role = req.user?.role;
      let status = 'waiting_approval';
      let approvedBy = null;
      let approvedAt = null;

      const [pendingRows] = await pool.query(
        "SELECT id FROM financial_visibility_logs WHERE status = 'waiting_approval' LIMIT 1"
      );
      if (pendingRows.length > 0) {
        return res.status(400).json({ ok: false, error: 'HAS_PENDING_REQUEST' });
      }

      if (role === 'superadmin') {
        status = 'approved';
        approvedBy = req.user.id;
        approvedAt = new Date();
      }

      const [result] = await pool.query(
        "INSERT INTO financial_visibility_logs (action, requested_by, status, approved_by, approved_at) VALUES (?, ?, ?, ?, ?)",
        [action, req.user.id, status, approvedBy, approvedAt]
      );

      return res.json({ ok: true, data: { id: result.insertId, status } });
    } catch (e) {
      console.error('POST /financial/visibility/toggle error:', e);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  app.patch('/financial/visibility/requests/:id/status', authGuard, async (req, res) => {
    try {
      if (req.user?.role !== 'superadmin') {
         return res.status(403).json({ ok: false, error: 'SUPERADMIN_ONLY' });
      }

      const id = Number(req.params.id);
      const { status } = req.body;

      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ ok: false, error: 'INVALID_STATUS' });
      }

      const [result] = await pool.query(
        "UPDATE financial_visibility_logs SET status = ?, approved_by = ?, approved_at = ? WHERE id = ? AND status = 'waiting_approval'",
        [status, req.user.id, new Date(), id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND_OR_NOT_PENDING' });
      }

      return res.json({ ok: true });
    } catch (e) {
      console.error('PATCH /financial/visibility/requests/:id/status error:', e);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  app.get('/financial/visibility/logs', authGuard, adminOnly, async (req, res) => {
    try {
      const ok = await ensureFinancialVisibilityTable();
      if (!ok) return res.status(500).json({ ok: false, error: 'DB_NOT_READY' });

      const [rows] = await pool.query(`
        SELECT 
          l.id, l.action, l.status, l.created_at, l.approved_at,
          r.username as requested_by_username, r.full_name as requested_by_name,
          a.username as approved_by_username, a.full_name as approved_by_name
        FROM financial_visibility_logs l
        LEFT JOIN accounts r ON l.requested_by = r.id
        LEFT JOIN accounts a ON l.approved_by = a.id
        ORDER BY l.id DESC
        LIMIT 50
      `);

      return res.json({ ok: true, data: rows });
    } catch (e) {
      console.error('GET /financial/visibility/logs error:', e);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  app.get('/financial/summary', authGuard, async (req, res) => {
    try {
      const ok = await ensureFinancialTable();
      if (!ok) return res.status(500).json({ ok: false, error: 'DB_NOT_READY' });

      const isAdmin = req.user?.role === 'admin' || req.user?.role === 'superadmin';
      const filterType = req.query.filter || 'all';

      let dateFilter = "WHERE status IN ('approved', 'waiting_delete')";
      if (filterType === 'month') {
        dateFilter += " AND date >= DATE_FORMAT(NOW() ,'%Y-%m-01')";
      } else if (filterType === 'week') {
        dateFilter += " AND date >= DATE_ADD(DATE(NOW()), INTERVAL - WEEKDAY(NOW()) DAY)";
      }

      const sql = `
        SELECT 
          SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS total_income,
          SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS total_expense
        FROM (
          ${unifiedTransactionsSql}
        ) as t
        ${dateFilter}
      `;

      const [rows] = await pool.query(sql);
      const income = Number(rows[0]?.total_income || 0);
      const expense = Number(rows[0]?.total_expense || 0);

      const sqlAllTime = `
        SELECT 
          SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS total_income,
          SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS total_expense
        FROM (
          ${unifiedTransactionsSql}
        ) as t
        WHERE status IN ('approved', 'waiting_delete')
      `;
      const [allTimeRows] = await pool.query(sqlAllTime);
      const allTimeIncome = Number(allTimeRows[0]?.total_income || 0);
      const allTimeExpense = Number(allTimeRows[0]?.total_expense || 0);
      const balance = allTimeIncome - allTimeExpense;

      const summary = {
        total_income: income,
        total_expense: expense,
        balance: balance
      };

      return res.json({ ok: true, data: summary });
    } catch (e) {
      console.error('GET /financial/summary error:', e);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  app.get('/financial/transactions', authGuard, async (req, res) => {
    try {
      const ok = await ensureFinancialTable();
      if (!ok) return res.status(500).json({ ok: false, error: 'DB_NOT_READY' });

      const isAdmin = req.user?.role === 'admin' || req.user?.role === 'superadmin';

      const filterType = req.query.filter || 'all';
      let dateFilter = isAdmin 
        ? "WHERE status IN ('approved', 'waiting_add', 'waiting_delete')" 
        : "WHERE status IN ('approved', 'waiting_delete')";

      if (filterType === 'month') {
        dateFilter += " AND date >= DATE_FORMAT(NOW() ,'%Y-%m-01')";
      } else if (filterType === 'week') {
        dateFilter += " AND date >= DATE_ADD(DATE(NOW()), INTERVAL - WEEKDAY(NOW()) DAY)";
      }

      const sql = `
        SELECT * FROM (
          ${unifiedTransactionsSql}
        ) as t
        ${dateFilter}
        ORDER BY date DESC
        LIMIT 200
      `;

      const [rows] = await pool.query(sql);
      return res.json({ ok: true, data: rows });
    } catch (e) {
      console.error('GET /financial/transactions error:', e);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  app.get('/financial/chart', authGuard, async (req, res) => {
    try {
      const ok = await ensureFinancialTable();
      if (!ok) return res.status(500).json({ ok: false, error: 'DB_NOT_READY' });

      const filterType = req.query.filter || 'month';
      let groupBy = '';
      let dateFilter = "WHERE status IN ('approved', 'waiting_delete')";
      
      if (filterType === 'month') {
        dateFilter += " AND date >= DATE_FORMAT(NOW() ,'%Y-%m-01')";
        groupBy = 'DATE(date)';
      } else {
        dateFilter += " AND date >= DATE_ADD(DATE(NOW()), INTERVAL - WEEKDAY(NOW()) DAY)";
        groupBy = 'DATE(date)';
      }

      const sql = `
        SELECT 
          ${groupBy} as label,
          SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS income,
          SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS expense
        FROM (
          ${unifiedTransactionsSql}
        ) as t
        ${dateFilter}
        GROUP BY ${groupBy}
        ORDER BY ${groupBy} ASC
      `;

      const [rows] = await pool.query(sql);
      return res.json({ ok: true, data: rows });
    } catch (e) {
      console.error('GET /financial/chart error:', e);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  app.post('/financial/records', authGuard, adminOnly, async (req, res) => {
    try {
      const ok = await ensureFinancialTable();
      if (!ok) return res.status(500).json({ ok: false, error: 'DB_NOT_READY' });

      const { type, amount, title, description, date } = req.body;
      
      if (!['income', 'expense'].includes(type)) {
        return res.status(400).json({ ok: false, error: 'INVALID_TYPE' });
      }
      if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
        return res.status(400).json({ ok: false, error: 'INVALID_AMOUNT' });
      }
      if (!title || typeof title !== 'string') {
        return res.status(400).json({ ok: false, error: 'INVALID_TITLE' });
      }

      const recordDate = date ? new Date(date) : new Date();
      
      let status = 'approved';
      if (type === 'expense' && req.user?.role !== 'superadmin') {
        status = 'waiting_add';
      }

      const [result] = await pool.query(
        `INSERT INTO financial_records (type, amount, title, description, date, created_by, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [type, Number(amount), title, description || null, recordDate, req.user?.id || null, status]
      );

      return res.status(201).json({ ok: true, data: { id: result.insertId, status } });
    } catch (e) {
      console.error('POST /financial/records error:', e);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  app.delete('/financial/records/:id', authGuard, adminOnly, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'INVALID_ID' });

      let result;
      let status = 'deleted';
      
      if (req.user?.role === 'superadmin') {
         [result] = await pool.query('DELETE FROM financial_records WHERE id = ?', [id]);
      } else {
         [result] = await pool.query('UPDATE financial_records SET status = ? WHERE id = ?', ['waiting_delete', id]);
         status = 'waiting_delete';
      }
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }

      return res.json({ ok: true, data: { status } });
    } catch (e) {
      console.error('DELETE /financial/records error:', e);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  app.get('/financial/export', authGuard, adminOnly, async (req, res) => {
    try {
      const ok = await ensureFinancialTable();
      if (!ok) return res.status(500).json({ ok: false, error: 'DB_NOT_READY' });

      const filterType = req.query.filter || 'all';
      let dateFilter = "WHERE status IN ('approved', 'waiting_delete')";
      if (filterType === 'month') {
        dateFilter += " AND date >= DATE_FORMAT(NOW() ,'%Y-%m-01')";
      } else if (filterType === 'week') {
        dateFilter += " AND date >= DATE_ADD(DATE(NOW()), INTERVAL - WEEKDAY(NOW()) DAY)";
      }

      const sql = `
        SELECT * FROM (
          ${unifiedTransactionsSql}
        ) as t
        ${dateFilter}
        ORDER BY date DESC
      `;

      const [rows] = await pool.query(sql);

      let htmlContent = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<style>
  th { background-color: #f3f4f6; font-weight: bold; border: 1px solid #ccc; padding: 5px; }
  td { border: 1px solid #ccc; padding: 5px; }
  .income { color: #10B981; }
  .expense { color: #EF4444; }
</style>
</head>
<body>
  <table>
    <tr>
      <th>วันที่</th>
      <th>ประเภท</th>
      <th>รายการ</th>
      <th>จำนวนเงิน (บาท)</th>
      <th>แหล่งที่มา</th>
    </tr>`;

      for (const row of rows) {
        const d = new Date(row.date);
        const dateStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth()+1).toString().padStart(2, '0')}/${d.getFullYear()+543} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        
        const isIncome = row.type === 'income';
        const typeStr = isIncome ? 'รายรับ' : 'รายจ่าย';
        const amountStr = (isIncome ? '+' : '-') + Number(row.amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const titleStr = (row.title || '');
        const sourceStr = row.source === 'installment' ? 'ระบบค่างวด' : 'บันทึกเอง';
        const colorClass = isIncome ? 'income' : 'expense';

        htmlContent += `
    <tr>
      <td>${dateStr}</td>
      <td class="${colorClass}">${typeStr}</td>
      <td>${titleStr}</td>
      <td class="${colorClass}">${amountStr}</td>
      <td>${sourceStr}</td>
    </tr>`;
      }

      htmlContent += `
  </table>
</body>
</html>`;

      res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="financial_export.xls"');
      return res.send(htmlContent);
    } catch (e) {
      console.error('GET /financial/export error:', e);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  app.get('/financial/waiting-approval', authGuard, adminOnly, async (req, res) => {
    try {
      const ok = await ensureFinancialTable();
      if (!ok) return res.status(500).json({ ok: false, error: 'DB_NOT_READY' });

      const sql = `
        SELECT * FROM (
          ${unifiedTransactionsSql}
        ) as t
        WHERE status IN ('waiting_add', 'waiting_delete')
        ORDER BY date DESC
      `;

      const [rows] = await pool.query(sql);
      return res.json({ ok: true, data: rows });
    } catch (e) {
      console.error('GET /financial/waiting-approval error:', e);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  app.patch('/financial/records/:id/status', authGuard, async (req, res) => {
    try {
      if (req.user?.role !== 'superadmin') {
         return res.status(403).json({ ok: false, error: 'SUPERADMIN_ONLY' });
      }
      
      const id = Number(req.params.id);
      const { status } = req.body;
      
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'INVALID_ID' });
      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ ok: false, error: 'INVALID_STATUS' });
      }

      const [rows] = await pool.query('SELECT status FROM financial_records WHERE id = ?', [id]);
      if (rows.length === 0) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      
      const currentStatus = rows[0].status;
      
      if (status === 'approved') {
        if (currentStatus === 'waiting_add') {
           await pool.query('UPDATE financial_records SET status = ? WHERE id = ?', ['approved', id]);
        } else if (currentStatus === 'waiting_delete') {
           await pool.query('DELETE FROM financial_records WHERE id = ?', [id]);
        } else {
           return res.status(400).json({ ok: false, error: 'INVALID_STATE_TRANSITION' });
        }
      } else if (status === 'rejected') {
        if (currentStatus === 'waiting_add') {
           await pool.query('UPDATE financial_records SET status = ? WHERE id = ?', ['rejected', id]);
        } else if (currentStatus === 'waiting_delete') {
           await pool.query('UPDATE financial_records SET status = ? WHERE id = ?', ['approved', id]);
        } else {
           return res.status(400).json({ ok: false, error: 'INVALID_STATE_TRANSITION' });
        }
      }

      return res.json({ ok: true });
    } catch (e) {
      console.error('PATCH /financial/records/:id/status error:', e);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });
}

module.exports = { registerFinancialRoutes };
