const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../db/pool');
const { authGuard } = require('../middleware/auth');
const { JWT_SECRET, JWT_EXPIRES } = require('../config/env');
const { isSuperAdmin } = require('../utils/misc');

// Helper: parse Thai full name into { title, firstName, lastName }
function parseThaiFullName(raw) {
  if (!raw || typeof raw !== 'string') return { title: null, firstName: null, lastName: null };
  let s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return { title: null, firstName: null, lastName: null };
  const titles = [
    'นาย','นาง','นางสาว','ด.ช.','ด.ญ.','คุณ','Mr.','Mrs.','Ms.','Miss','Dr.','ศ.','ผศ.','ร.ศ.'
  ];
  let title = null;
  let firstName = null;
  let lastName = null;
  for (const t of titles) {
    if (s.startsWith(t + ' ')) {
      title = t;
      s = s.slice(t.length).trim();
      break;
    }
    if (s === t) {
      title = t; s = ''; break;
    }
  }
  if (!s) return { title, firstName: null, lastName: null };
  const parts = s.split(' ');
  if (parts.length === 1) {
    firstName = parts[0];
  } else {
    firstName = parts.shift();
    lastName = parts.join(' ');
  }
  return { title, firstName, lastName };
}

function registerAuthRoutes(app) {
  app.post('/auth/register', async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username and password are required' });
    const hash = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO accounts (username, password_hash) VALUES ($1, $2)', [username, hash]);
    res.json({ message: 'User registered' });
  });

  app.post('/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body || {};
      if (!username || !password) {
        return res.status(400).json({ error: 'username and password are required' });
      }
      const [rows] = await pool.query('SELECT * FROM accounts WHERE username = $1', [username]);
      const acc = rows[0];
      if (!acc) return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
      const ok = await bcrypt.compare(password, acc.password_hash);
      if (!ok) return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
      const token = jwt.sign(
        { id: acc.id, username: acc.username, role: acc.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES }
      );
      res.json({
        token,
        user: { id: acc.id, username: acc.username, full_name: acc.full_name, role: acc.role }
      });
    } catch (e) {
      console.error('Login error:', e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/auth/me', authGuard, async (req, res) => {
    try {
      const { id } = req.user;
      const [rows] = await pool.query(
        'SELECT id, username, full_name, role, created_at FROM accounts WHERE id = $1',
        [id]
      );
      const acc = rows[0] || null;
      if (acc) {
        // เพิ่ม house_number และ ชื่อจาก residents table
        const [resRows] = await pool.query(
          'SELECT house_number, title, first_name, last_name, phone FROM residents WHERE account_id = $1 LIMIT 1',
          [id]
        );
        const resident = resRows[0];
        acc.house_number = resident?.house_number || null;
        
        // ส่ง title, first_name, last_name แยกกัน
        // ถ้า residents มีข้อมูล ใช้จาก residents
        if (resident?.title || resident?.first_name || resident?.last_name) {
          acc.title = resident?.title || '';
          acc.first_name = resident?.first_name || '';
          acc.last_name = resident?.last_name || '';
        } else if (acc.full_name) {
          // ถ้า residents ไม่มี แต่ accounts.full_name มี ให้ parse ออกมา
          const parsed = parseThaiFullName(acc.full_name);
          acc.title = parsed.title || '';
          acc.first_name = parsed.firstName || '';
          acc.last_name = parsed.lastName || '';
        } else {
          acc.title = '';
          acc.first_name = '';
          acc.last_name = '';
        }
        
        // ถ้า accounts.full_name ว่าง ให้ใช้ชื่อจาก residents แทน
        if (!acc.full_name && resident) {
          const parts = [resident.title, resident.first_name, resident.last_name].filter(Boolean);
          acc.full_name = parts.join(' ') || null;
        }
        
        // เพิ่ม phone ด้วย
        acc.phone = resident?.phone || null;
      }
      res.json(acc);
    } catch (e) {
      console.error('Me error:', e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Update profile (title, first_name, last_name, phone)
  app.put('/auth/me', authGuard, async (req, res) => {
    try {
      const { id } = req.user;
      const { title, first_name, last_name, phone } = req.body || {};
      
      // Update residents (title, first_name, last_name, phone)
      const [resRows] = await pool.query('SELECT id FROM residents WHERE account_id = $1 LIMIT 1', [id]);
      const resident = resRows[0];
      
      if (resident) {
        // อัพเดท title, first_name, last_name ถ้ามีส่งมา
        if (title !== undefined || first_name !== undefined || last_name !== undefined) {
          await pool.query(
            'UPDATE residents SET title = COALESCE($1, title), first_name = COALESCE($2, first_name), last_name = COALESCE($3, last_name), updated_at = CURRENT_TIMESTAMP WHERE id = $4', 
            [title || null, first_name || null, last_name || null, resident.id]
          );
          
          // อัพเดท accounts.full_name ด้วย
          const fullName = [title, first_name, last_name].filter(Boolean).join(' ') || null;
          await pool.query('UPDATE accounts SET full_name = $1 WHERE id = $2', [fullName, id]);
        }
        
        if (phone !== undefined) {
          await pool.query(
            'UPDATE residents SET phone = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [phone || null, resident.id]
          );
        }
      }
      
      // Return updated data
      const [rows] = await pool.query(
        'SELECT id, username, full_name, role, created_at FROM accounts WHERE id = $1',
        [id]
      );
      const acc = rows[0] || null;
      if (acc) {
        const [resData] = await pool.query(
          'SELECT house_number, title, first_name, last_name, phone FROM residents WHERE account_id = $1 LIMIT 1',
          [id]
        );
        const rd = resData[0];
        acc.house_number = rd?.house_number || null;
        acc.phone = rd?.phone || null;
        acc.title = rd?.title || '';
        acc.first_name = rd?.first_name || '';
        acc.last_name = rd?.last_name || '';
        if (!acc.full_name && rd) {
          const parts = [rd.title, rd.first_name, rd.last_name].filter(Boolean);
          acc.full_name = parts.join(' ') || null;
        }
      }
      
      res.json({ ok: true, data: acc });
    } catch (e) {
      console.error('Update me error:', e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Change password
  app.put('/auth/me/password', authGuard, async (req, res) => {
    try {
      const { id } = req.user;
      const { current_password, new_password } = req.body || {};
      if (!new_password) {
        return res.status(400).json({ error: 'new_password required' });
      }
      if (String(new_password).length < 6) {
        return res.status(400).json({ error: 'PASSWORD_TOO_SHORT' });
      }
      const [rows] = await pool.query('SELECT password_hash FROM accounts WHERE id = $1', [id]);
      const acc = rows[0];
      if (!acc) return res.status(404).json({ error: 'NOT_FOUND' });
      if (current_password) {
        const ok = await bcrypt.compare(String(current_password), acc.password_hash);
        if (!ok) return res.status(401).json({ error: 'INVALID_CURRENT_PASSWORD' });
      }
      const newHash = await bcrypt.hash(String(new_password), 10);
      await pool.query('UPDATE accounts SET password_hash = $1 WHERE id = $2', [newHash, id]);
      return res.json({ ok: true });
    } catch (e) {
      console.error('Change password error:', e);
      return res.status(500).json({ error: 'SERVER_ERROR' });
    }
  });

  app.get('/profile', authGuard, (req, res) => {
    res.json({ message: 'Protected route', user: req.user });
  });

  // ===== SuperAdmin: Create Admin =====
  app.post('/auth/create-admin', authGuard, async (req, res) => {
    try {
      // Only superadmin can create admin
      if (!isSuperAdmin(req.user)) {
        return res.status(403).json({ error: 'SUPERADMIN_ONLY' });
      }

      const { username, password, full_name } = req.body || {};
      if (!username || !password) {
        return res.status(400).json({ error: 'username and password are required' });
      }
      if (String(password).length < 6) {
        return res.status(400).json({ error: 'PASSWORD_TOO_SHORT' });
      }

      // Check if username already exists
      const [existing] = await pool.query('SELECT id FROM accounts WHERE username = $1', [username]);
      if (existing.length > 0) {
        return res.status(409).json({ error: 'USERNAME_EXISTS' });
      }

      const hash = await bcrypt.hash(password, 10);
      const [result] = await pool.query(
        'INSERT INTO accounts (username, password_hash, full_name, role) VALUES ($1, $2, $3, $4) RETURNING id, username, full_name, role, created_at',
        [username, hash, full_name || null, 'admin']
      );

      res.status(201).json({ ok: true, admin: result[0] });
    } catch (e) {
      console.error('Create admin error:', e);
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  });

  // ===== SuperAdmin: List all admins =====
  app.get('/auth/admins', authGuard, async (req, res) => {
    try {
      if (!isSuperAdmin(req.user)) {
        return res.status(403).json({ error: 'SUPERADMIN_ONLY' });
      }

      const [admins] = await pool.query(
        "SELECT id, username, full_name, role, created_at FROM accounts WHERE role IN ('admin', 'superadmin') ORDER BY created_at DESC"
      );

      res.json(admins);
    } catch (e) {
      console.error('List admins error:', e);
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  });

  // ===== SuperAdmin: Delete admin =====
  app.delete('/auth/admins/:id', authGuard, async (req, res) => {
    try {
      if (!isSuperAdmin(req.user)) {
        return res.status(403).json({ error: 'SUPERADMIN_ONLY' });
      }

      const adminId = Number(req.params.id);
      
      // Cannot delete self
      if (adminId === req.user.id) {
        return res.status(400).json({ error: 'CANNOT_DELETE_SELF' });
      }

      // Check if target is superadmin (cannot delete superadmin)
      const [target] = await pool.query('SELECT role FROM accounts WHERE id = $1', [adminId]);
      if (!target[0]) {
        return res.status(404).json({ error: 'NOT_FOUND' });
      }
      if (target[0].role === 'superadmin') {
        return res.status(403).json({ error: 'CANNOT_DELETE_SUPERADMIN' });
      }

      await pool.query('DELETE FROM accounts WHERE id = $1', [adminId]);
      res.json({ ok: true });
    } catch (e) {
      console.error('Delete admin error:', e);
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  });
  // ===== SuperAdmin: Update admin =====
  app.put('/auth/admins/:id', authGuard, async (req, res) => {
    try {
      if (!isSuperAdmin(req.user)) {
        return res.status(403).json({ error: 'SUPERADMIN_ONLY' });
      }

      const adminId = Number(req.params.id);
      const { full_name, password } = req.body || {};

      // Check if target exists
      const [target] = await pool.query('SELECT role FROM accounts WHERE id = $1', [adminId]);
      if (!target[0]) {
        return res.status(404).json({ error: 'NOT_FOUND' });
      }
      
      // Prevent modifying other SuperAdmins (unless self, but usually superadmin edits self via /me)
      if (target[0].role === 'superadmin' && adminId !== req.user.id) {
        return res.status(403).json({ error: 'CANNOT_EDIT_SUPERADMIN' });
      }

      // Update full_name
      if (full_name !== undefined) {
         await pool.query('UPDATE accounts SET full_name = $1 WHERE id = $2', [full_name, adminId]);
      }

      // Update password if provided
      if (password && String(password).length >= 6) {
        const hash = await bcrypt.hash(String(password), 10);
        await pool.query('UPDATE accounts SET password_hash = $1 WHERE id = $2', [hash, adminId]);
      }

      // Return updated info
      const [updated] = await pool.query('SELECT id, username, full_name, role, created_at FROM accounts WHERE id = $1', [adminId]);
      res.json({ ok: true, admin: updated[0] });

    } catch (e) {
      console.error('Update admin error:', e);
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  });

}

module.exports = { registerAuthRoutes };
