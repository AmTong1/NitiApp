const path = require('path');
const multer = require('multer');
const { pool } = require('../db/pool');
const { authGuard } = require('../middleware/auth');
const { columnExists } = require('../utils/db');
const { UPLOAD_DIR } = require('../config/paths');

const chatStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.bin';
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const CHAT_ALLOW = new Set([
  'image/jpeg','image/png','image/webp','image/gif',
  'application/pdf',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain'
]);
const uploadChat = multer({
  storage: chatStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    CHAT_ALLOW.has(file.mimetype) ? cb(null, true) : cb(new Error('FILE_TYPE_NOT_ALLOWED'));
  }
});
const uploadImagesMulti = multer({
  storage: chatStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    CHAT_ALLOW.has(file.mimetype) ? cb(null, true) : cb(new Error('FILE_TYPE_NOT_ALLOWED'));
  }
}).array('files', 15);

async function getFirstAdminId() {
  const [rows] = await pool.query("SELECT id FROM accounts WHERE role = 'admin' ORDER BY id ASC LIMIT 1");
  return rows[0]?.id || null;
}
async function requireRoom(roomId) {
  const [rows] = await pool.query('SELECT * FROM chat_rooms WHERE id=$1', [roomId]);
  return rows[0] || null;
}
async function isMember(roomId, userId) {
  const [rows] = await pool.query('SELECT 1 FROM chat_members WHERE room_id=$1 AND user_id=$2', [roomId, userId]);
  return rows.length > 0;
}

function registerChatRoutes(app, io) {
  app.get('/chat/public-room', authGuard, async (_req, res) => {
    const [existed] = await pool.query("SELECT * FROM chat_rooms WHERE room_type='public' ORDER BY id ASC LIMIT 1");
    let room = existed[0];
    if (!room) {
      const [insResult] = await pool.query("INSERT INTO chat_rooms (name, room_type) VALUES ($1, 'public') RETURNING id", ['ห้องรวม']);
      const newId = insResult[0]?.id;
      const [rows] = await pool.query('SELECT * FROM chat_rooms WHERE id=$1', [newId]);
      room = rows[0];
    }
    res.json({ data: room });
  });

  app.post('/chat/ensure-dm-admin', authGuard, async (req, res) => {
    const me = req.user;
    const adminId = await getFirstAdminId();
    if (!adminId) return res.status(400).json({ error: 'NO_ADMIN' });

    const [rows] = await pool.query(
      `SELECT r.*
         FROM chat_rooms r
         JOIN chat_members m1 ON m1.room_id = r.id AND m1.user_id = $1
         JOIN chat_members m2 ON m2.room_id = r.id AND m2.user_id = $2
        WHERE r.room_type = 'dm'
        LIMIT 1`,
      [me.id, adminId]
    );

    let room = rows[0];
    if (!room) {
      const [insResult] = await pool.query("INSERT INTO chat_rooms (name, room_type, owner_id) VALUES ($1, 'dm', $2) RETURNING id", ['ติดต่อแอดมิน', me.id]);
      const roomId = insResult[0]?.id;
      await pool.query('INSERT INTO chat_members (room_id, user_id, role) VALUES ($1, $2, $3)', [roomId, me.id, 'member']);
      await pool.query('INSERT INTO chat_members (room_id, user_id, role) VALUES ($1, $2, $3)', [roomId, adminId, 'admin']);
      const [r2] = await pool.query('SELECT * FROM chat_rooms WHERE id=$1', [roomId]);
      room = r2[0];
    }
    res.json({ data: room });
  });

  app.get('/chat/messages', authGuard, async (req, res) => {
    const user = req.user;
    const roomId = Number(req.query.room_id);
    const beforeId = req.query.before_id ? Number(req.query.before_id) : null;
    const pageLimit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    
    if (!roomId) return res.status(400).json({ error: 'room_id required' });

    const room = await requireRoom(roomId);
    if (!room) return res.status(404).json({ error: 'ROOM_NOT_FOUND' });

    if (room.room_type === 'dm') {
      const ok = await isMember(roomId, user.id);
      if (!ok) return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const hasReplyCol = await columnExists('chat_messages', 'reply_to_id');

    let sql = '';
    const params = [roomId];
    
    if (hasReplyCol) {
       sql = `
        SELECT m.*, a.username, a.full_name,
               CASE WHEN m.reply_to_id IS NOT NULL THEN
                 json_build_object(
                   'id', r.id,
                   'user_id', r.user_id,
                   'text', r.text,
                   'msg_type', r.msg_type,
                   'file_url', r.file_url,
                   'file_name', r.file_name,
                   'mime_type', r.mime_type,
                   'username', ra.username,
                   'full_name', ra.full_name
                 )
               ELSE NULL END as reply_to
          FROM chat_messages m
          JOIN accounts a ON a.id = m.user_id
          LEFT JOIN chat_messages r ON r.id = m.reply_to_id
          LEFT JOIN accounts ra ON ra.id = r.user_id
         WHERE m.room_id = $1
       `;
    } else {
       sql = `
         SELECT m.*, a.username, a.full_name
           FROM chat_messages m
           JOIN accounts a ON a.id = m.user_id
          WHERE m.room_id = $1
       `;
    }

    if (beforeId) {
      sql += ` AND m.id < $2`;
      params.push(beforeId);
    }
    
    if (hasReplyCol) {
      // keep as-is; client can fetch reply meta as needed
    }
    sql += ` ORDER BY m.created_at DESC, m.id DESC LIMIT $${params.length + 1}`;
    params.push(pageLimit);

    const [rows] = await pool.query(sql, params);
    res.json({ data: rows });
  });

  app.post('/chat/messages', authGuard, async (req, res) => {
    const user = req.user;
    const { room_id, text, reply_to_id } = req.body || {};
    if (!room_id || !text || !text.trim()) return res.status(400).json({ error: 'INVALID_BODY' });

    const room = await requireRoom(room_id);
    if (!room) return res.status(404).json({ error: 'ROOM_NOT_FOUND' });

    if (room.room_type === 'dm') {
      const ok = await isMember(room_id, user.id);
      if (!ok) return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const hasReplyCol = await columnExists('chat_messages', 'reply_to_id');

    let insResult;
    if (hasReplyCol && reply_to_id) {
      [insResult] = await pool.query(
        `INSERT INTO chat_messages (room_id, user_id, text, msg_type, reply_to_id)
         VALUES ($1, $2, $3, 'text', $4) RETURNING id`,
        [room_id, user.id, text.trim(), Number(reply_to_id)]
      );
    } else {
      [insResult] = await pool.query(
        `INSERT INTO chat_messages (room_id, user_id, text, msg_type)
         VALUES ($1, $2, $3, 'text') RETURNING id`,
        [room_id, user.id, text.trim()]
      );
    }

    const insertId = insResult[0]?.id;
    const [rows] = await pool.query(
      `SELECT m.*, a.username, a.full_name
         FROM chat_messages m
         JOIN accounts a ON a.id = m.user_id
        WHERE m.id = $1`,
      [insertId]
    );
    const msg = rows[0];
    io.to(`room:${room_id}`).emit('new_message', msg);
    res.status(201).json(msg);
  });

  app.post('/chat/upload', authGuard, uploadChat.single('file'), async (req, res) => {
    try {
      const user = req.user;
      const roomId = Number(req.body.room_id);
      const replyToId = req.body.reply_to_id ? Number(req.body.reply_to_id) : null;

      if (!roomId) return res.status(400).json({ error: 'room_id required' });

      const room = await requireRoom(roomId);
      if (!room) return res.status(404).json({ error: 'ROOM_NOT_FOUND' });

      if (room.room_type === 'dm') {
        const ok = await isMember(roomId, user.id);
        if (!ok) return res.status(403).json({ error: 'FORBIDDEN' });
      }

      if (!req.file) return res.status(400).json({ error: 'file required' });

      const { filename, size, mimetype, originalname } = req.file;
      const url = `/uploads/${filename}`;
      const isImage = mimetype.startsWith('image/');
      const msgType = isImage ? 'image' : 'file';

      const hasReplyCol = await columnExists('chat_messages', 'reply_to_id');

      let insResult;
      if (hasReplyCol && replyToId) {
        [insResult] = await pool.query(
          `INSERT INTO chat_messages (room_id, user_id, text, msg_type, file_url, file_name, file_size, mime_type, reply_to_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [roomId, user.id, msgType === 'file' ? originalname : '', msgType, url, originalname, size, mimetype, replyToId]
        );
      } else {
        [insResult] = await pool.query(
          `INSERT INTO chat_messages (room_id, user_id, text, msg_type, file_url, file_name, file_size, mime_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [roomId, user.id, msgType === 'file' ? originalname : '', msgType, url, originalname, size, mimetype]
        );
      }

      const insertId = insResult[0]?.id;
      const [rows] = await pool.query(
        `SELECT m.*, a.username, a.full_name
           FROM chat_messages m
           JOIN accounts a ON a.id = m.user_id
          WHERE m.id = $1`,
        [insertId]
      );
      const msg = rows[0];
      io.to(`room:${roomId}`).emit('new_message', msg);
      res.status(201).json(msg);
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: e.message || 'UPLOAD_FAILED' });
    }
  });

  app.post('/chat/upload-multi', authGuard, (req, res) => {
    uploadImagesMulti(req, res, async (err) => {
      try {
        if (err) return res.status(400).json({ error: err.message || 'UPLOAD_FAILED' });

        const user = req.user;
        const roomId = Number(req.body.room_id);
        const caption = (req.body.caption || '').toString().trim();
        const replyToId = req.body.reply_to_id ? Number(req.body.reply_to_id) : null;

        if (!roomId) return res.status(400).json({ error: 'room_id required' });

        const room = await requireRoom(roomId);
        if (!room) return res.status(404).json({ error: 'ROOM_NOT_FOUND' });

        if (room.room_type === 'dm') {
          const ok = await isMember(roomId, user.id);
          if (!ok) return res.status(403).json({ error: 'FORBIDDEN' });
        }

        const files = req.files || [];
        if (!files.length) return res.status(400).json({ error: 'files required' });

        const hasReplyCol = await columnExists('chat_messages', 'reply_to_id');

        const results = [];
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          const { filename, size, mimetype, originalname } = f;
          const url = `/uploads/${filename}`;
          const isImage = mimetype.startsWith('image/');
          const msgType = isImage ? 'image' : 'file';
          
          let textForThis = '';
          if (i === 0 && caption) {
             textForThis = caption;
          } else if (msgType === 'file') {
             textForThis = originalname;
          }

          let insResult;
          if (hasReplyCol && replyToId) {
            [insResult] = await pool.query(
              `INSERT INTO chat_messages (room_id, user_id, text, msg_type, file_url, file_name, file_size, mime_type, reply_to_id)
               VALUES ($1, $2, $3, msgType, $4, $5, $6, $7, $8) RETURNING id`,
              [roomId, user.id, textForThis, url, originalname, size, mimetype, replyToId]
            );
          } else {
            [insResult] = await pool.query(
              `INSERT INTO chat_messages (room_id, user_id, text, msg_type, file_url, file_name, file_size, mime_type)
               VALUES ($1, $2, $3, 'image', $4, $5, $6, $7) RETURNING id`,
              [roomId, user.id, textForThis, url, originalname, size, mimetype]
            );
          }

          const insertId = insResult[0]?.id;
          const [msgRows] = await pool.query(
            `SELECT m.*, a.username, a.full_name
               FROM chat_messages m
               JOIN accounts a ON a.id = m.user_id
              WHERE m.id = $1`,
            [insertId]
          );
          const msg = msgRows[0];
          io.to(`room:${roomId}`).emit('new_message', msg);
          results.push(msg);
        }

        res.status(201).json({ data: results });
      } catch (e) {
        console.error('upload-multi error:', e);
        res.status(500).json({ error: e.message || 'UPLOAD_FAILED' });
      }
    });
  });

  app.get('/chat/admin/user-dms', authGuard, async (req, res) => {
    try {
      const { role } = req.user;
      if (role !== 'admin') {
        return res.status(403).json({ error: 'Permission denied' });
      }

      const [rooms] = await pool.query(`
        SELECT r.id,
               COALESCE(a.full_name, a.username) AS name,
               'dm' AS room_type
          FROM chat_rooms r
          JOIN accounts a ON r.owner_id = a.id
         WHERE r.room_type = 'dm'
           AND r.owner_id IS NOT NULL
         ORDER BY r.created_at DESC
      `);

      res.json(rooms);
    } catch (e) {
      console.error('Admin DMs error:', e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ===== Reactions API =====
  
  // Add or update reaction
  app.post('/chat/reactions', authGuard, async (req, res) => {
    try {
      const user = req.user;
      const { message_id, emoji } = req.body || {};
      
      if (!message_id || !emoji) {
        return res.status(400).json({ error: 'message_id and emoji required' });
      }

      // Verify message exists and user has access
      const [msgRows] = await pool.query(
        `SELECT m.*, r.room_type FROM chat_messages m
         JOIN chat_rooms r ON r.id = m.room_id
         WHERE m.id = $1`,
        [message_id]
      );
      
      if (!msgRows.length) {
        return res.status(404).json({ error: 'MESSAGE_NOT_FOUND' });
      }
      
      const msg = msgRows[0];
      if (msg.room_type === 'dm') {
        const ok = await isMember(msg.room_id, user.id);
        if (!ok) return res.status(403).json({ error: 'FORBIDDEN' });
      }

      // Upsert reaction (one reaction per user per message)
      await pool.query(
        `INSERT INTO chat_reactions (message_id, user_id, emoji)
         VALUES ($1, $2, $3)
         ON CONFLICT (message_id, user_id)
         DO UPDATE SET emoji = $3, created_at = CURRENT_TIMESTAMP`,
        [message_id, user.id, emoji]
      );

      // Fetch all reactions for this message
      const [reactions] = await pool.query(
        `SELECT cr.*, a.username, a.full_name
         FROM chat_reactions cr
         JOIN accounts a ON a.id = cr.user_id
         WHERE cr.message_id = $1
         ORDER BY cr.created_at ASC`,
        [message_id]
      );

      // Emit to room
      io.to(`room:${msg.room_id}`).emit('reaction_update', {
        message_id: Number(message_id),
        reactions
      });

      res.json({ success: true, reactions });
    } catch (e) {
      console.error('Add reaction error:', e);
      res.status(500).json({ error: e.message || 'REACTION_FAILED' });
    }
  });

  // Remove reaction
  app.delete('/chat/reactions/:messageId', authGuard, async (req, res) => {
    try {
      const user = req.user;
      const messageId = Number(req.params.messageId);

      // Verify message exists
      const [msgRows] = await pool.query(
        `SELECT m.*, r.room_type FROM chat_messages m
         JOIN chat_rooms r ON r.id = m.room_id
         WHERE m.id = $1`,
        [messageId]
      );
      
      if (!msgRows.length) {
        return res.status(404).json({ error: 'MESSAGE_NOT_FOUND' });
      }
      
      const msg = msgRows[0];

      // Delete user's reaction
      await pool.query(
        `DELETE FROM chat_reactions WHERE message_id = $1 AND user_id = $2`,
        [messageId, user.id]
      );

      // Fetch remaining reactions
      const [reactions] = await pool.query(
        `SELECT cr.*, a.username, a.full_name
         FROM chat_reactions cr
         JOIN accounts a ON a.id = cr.user_id
         WHERE cr.message_id = $1
         ORDER BY cr.created_at ASC`,
        [messageId]
      );

      // Emit to room
      io.to(`room:${msg.room_id}`).emit('reaction_update', {
        message_id: messageId,
        reactions
      });

      res.json({ success: true, reactions });
    } catch (e) {
      console.error('Remove reaction error:', e);
      res.status(500).json({ error: e.message || 'REACTION_FAILED' });
    }
  });

  // Get reactions for a message
  app.get('/chat/reactions/:messageId', authGuard, async (req, res) => {
    try {
      const messageId = Number(req.params.messageId);

      const [reactions] = await pool.query(
        `SELECT cr.*, a.username, a.full_name
         FROM chat_reactions cr
         JOIN accounts a ON a.id = cr.user_id
         WHERE cr.message_id = $1
         ORDER BY cr.created_at ASC`,
        [messageId]
      );

      res.json({ reactions });
    } catch (e) {
      console.error('Get reactions error:', e);
      res.status(500).json({ error: e.message || 'FETCH_FAILED' });
    }
  });
}

module.exports = { registerChatRoutes };
