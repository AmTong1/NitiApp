const path = require('path');
const fs = require('fs-extra');
const multer = require('multer');
const { execFile } = require('child_process');
const { promisify } = require('util');
const ffmpegPath = require('ffmpeg-static');
const { pool } = require('../db/pool');
const { authGuard } = require('../middleware/auth');
const { columnExists, tableExists } = require('../utils/db');
const { UPLOAD_DIR, DOCUMENT_UPLOAD_DIR } = require('../config/paths');
const {
  scheduleDocxPreviewConversionFromUploadUrl,
  resolveDocxPreviewByInput,
  resolveOriginalDownloadByInput,
  startTempPdfCleanupScheduler,
} = require('../utils/docPreview');

function isDocumentUploadFile(file) {
  const mime = String(file?.mimetype || '').toLowerCase();
  const ext = path.extname(file?.originalname || '').toLowerCase();
  if (ext === '.pdf') return false;
  if (mime.startsWith('image/')) return false;
  return ['.doc', '.docx', '.xls', '.xlsx', '.csv', '.ppt', '.pptx', '.txt'].includes(ext);
}

function isDocxLikeFile(file) {
  const mime = String(file?.mimetype || '').toLowerCase();
  const ext = path.extname(file?.originalname || '').toLowerCase();
  return ext === '.docx' || mime.includes('wordprocessingml');
}

const chatStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const destination = isDocumentUploadFile(file) ? DOCUMENT_UPLOAD_DIR : UPLOAD_DIR;
    cb(null, destination);
  },
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
  'video/mp4','video/quicktime','video/x-msvideo','video/x-ms-wmv','video/webm','video/3gpp','video/x-matroska',
  'text/plain'
]);
const CHAT_MAX_FILE_SIZE_MB = (() => {
  const raw = Number(process.env.CHAT_MAX_FILE_SIZE_MB);
  return Number.isFinite(raw) && raw > 0 ? raw : 10;
})();
const CHAT_MAX_FILE_SIZE_BYTES = Math.trunc(CHAT_MAX_FILE_SIZE_MB * 1024 * 1024);
const uploadChat = multer({
  storage: chatStorage,
  limits: { fileSize: CHAT_MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    CHAT_ALLOW.has(file.mimetype) ? cb(null, true) : cb(new Error('FILE_TYPE_NOT_ALLOWED'));
  }
});
const uploadImagesMulti = multer({
  storage: chatStorage,
  limits: { fileSize: CHAT_MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    CHAT_ALLOW.has(file.mimetype) ? cb(null, true) : cb(new Error('FILE_TYPE_NOT_ALLOWED'));
  }
}).array('files', 15);

const execFileAsync = promisify(execFile);
const VIDEO_THUMB_SUBDIR = 'video_thumbs';
const VIDEO_THUMB_DIR = path.join(UPLOAD_DIR, VIDEO_THUMB_SUBDIR);
const VIDEO_THUMB_FRAME_AT_SEC = '0.8';
const VIDEO_THUMB_TIMEOUT_MS = 15_000;
const VIDEO_THUMB_INFLIGHT = new Map();

const ROOM_CACHE_TTL_MS = 15_000;
const MEMBER_CACHE_TTL_MS = 10_000;
const CACHE_CLEANUP_INTERVAL_MS = 60_000;
const roomCache = new Map();
const memberCache = new Map();
let lastCacheCleanupAt = 0;

const RATE_LIMIT_RULES = {
  message: { max: 50, windowMs: 60_000 },
  upload: { max: 25, windowMs: 60_000 },
  reaction: { max: 120, windowMs: 60_000 },
};
const rateLimitState = new Map();
let lastRateCleanupAt = 0;

function toPositiveInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return i > 0 ? i : null;
}

function decodeDisplayFileName(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return decodeURIComponent(raw.replace(/\+/g, '%20'));
  } catch {
    return raw;
  }
}

function hasVideoSuffix(value) {
  const raw = decodeDisplayFileName(value).toLowerCase();
  if (!raw) return false;
  return /\.(mp4|m4v|mov|avi|wmv|webm|mkv|3gp)(?:$|[?#])/i.test(raw);
}

function isVideoMessage(message) {
  const mime = String(message?.mime_type || '').toLowerCase();
  if (mime.startsWith('video/')) return true;
  return hasVideoSuffix(message?.file_name)
    || hasVideoSuffix(message?.file_url)
    || hasVideoSuffix(message?.text);
}

function normalizeUploadUrl(uploadUrl) {
  const raw = String(uploadUrl || '').trim();
  if (!raw) return '';
  const clean = raw.split('?')[0].split('#')[0].replace(/\\/g, '/').replace(/\/+$/, '');
  if (!clean.startsWith('/uploads/')) return '';
  return clean;
}

function uploadUrlToAbsoluteFile(uploadUrl) {
  const normalized = normalizeUploadUrl(uploadUrl);
  if (!normalized) return '';

  const relative = normalized.replace(/^\/uploads\//i, '');
  const sourcePath = path.resolve(UPLOAD_DIR, relative);
  const root = path.resolve(UPLOAD_DIR);
  if (!sourcePath.startsWith(root)) return '';
  return sourcePath;
}

function buildVideoThumbFileName(uploadUrl) {
  const normalized = normalizeUploadUrl(uploadUrl);
  if (!normalized) return '';

  const noUploadsPrefix = normalized.replace(/^\/uploads\//i, '');
  const withoutExt = noUploadsPrefix.replace(/\.[^.\/]+$/, '');
  const safeBase = withoutExt
    .replace(/[\\/]+/g, '__')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(-180);

  if (!safeBase) return '';
  return `${safeBase}_thumb.jpg`;
}

function getVideoThumbInfo(uploadUrl) {
  const fileName = buildVideoThumbFileName(uploadUrl);
  if (!fileName) return null;

  return {
    absolutePath: path.join(VIDEO_THUMB_DIR, fileName),
    uploadUrl: `/uploads/${VIDEO_THUMB_SUBDIR}/${fileName}`,
  };
}

async function ensureVideoThumbForUploadUrl(uploadUrl) {
  if (!ffmpegPath) return null;

  const sourcePath = uploadUrlToAbsoluteFile(uploadUrl);
  const thumbInfo = getVideoThumbInfo(uploadUrl);
  if (!sourcePath || !thumbInfo) return null;

  const inflightKey = thumbInfo.absolutePath;
  if (VIDEO_THUMB_INFLIGHT.has(inflightKey)) {
    return VIDEO_THUMB_INFLIGHT.get(inflightKey);
  }

  const task = (async () => {
    try {
      const sourceExists = await fs.pathExists(sourcePath);
      if (!sourceExists) return null;

      await fs.ensureDir(VIDEO_THUMB_DIR);

      const existing = await fs.pathExists(thumbInfo.absolutePath);
      if (existing) {
        const st = await fs.stat(thumbInfo.absolutePath).catch(() => null);
        if (st && Number(st.size || 0) > 0) {
          return thumbInfo.uploadUrl;
        }
        await fs.remove(thumbInfo.absolutePath).catch(() => {});
      }

      const tempPath = `${thumbInfo.absolutePath}.tmp`;
      await fs.remove(tempPath).catch(() => {});

      const ffmpegArgs = [
        '-hide_banner',
        '-loglevel', 'error',
        '-y',
        '-ss', VIDEO_THUMB_FRAME_AT_SEC,
        '-i', sourcePath,
        '-frames:v', '1',
        '-q:v', '3',
        tempPath,
      ];

      await execFileAsync(ffmpegPath, ffmpegArgs, {
        windowsHide: true,
        timeout: VIDEO_THUMB_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
      });

      const st = await fs.stat(tempPath).catch(() => null);
      if (!st || Number(st.size || 0) <= 0) {
        await fs.remove(tempPath).catch(() => {});
        return null;
      }

      await fs.move(tempPath, thumbInfo.absolutePath, { overwrite: true });
      return thumbInfo.uploadUrl;
    } catch {
      return null;
    }
  })();

  VIDEO_THUMB_INFLIGHT.set(inflightKey, task);
  try {
    return await task;
  } finally {
    VIDEO_THUMB_INFLIGHT.delete(inflightKey);
  }
}

async function attachVideoThumbToMessage(message, options = {}) {
  const input = message;
  if (!input || !isVideoMessage(input) || !input.file_url) return input;

  const thumbInfo = getVideoThumbInfo(input.file_url);
  if (!thumbInfo) return input;

  const existing = await fs.pathExists(thumbInfo.absolutePath);
  if (existing) {
    const st = await fs.stat(thumbInfo.absolutePath).catch(() => null);
    if (st && Number(st.size || 0) > 0) {
      input.video_thumb_url = thumbInfo.uploadUrl;
      return input;
    }
    await fs.remove(thumbInfo.absolutePath).catch(() => {});
  }

  if (options.generateIfMissing) {
    const generated = await ensureVideoThumbForUploadUrl(input.file_url);
    if (generated) input.video_thumb_url = generated;
  } else if (options.scheduleIfMissing) {
    ensureVideoThumbForUploadUrl(input.file_url).catch(() => {});
  }

  return input;
}

async function attachVideoThumbToMessages(messages, options = {}) {
  if (!Array.isArray(messages) || !messages.length) return messages;
  for (const message of messages) {
    await attachVideoThumbToMessage(message, options);
  }
  return messages;
}

function getCacheKey(roomId, userId) {
  return `${roomId}:${userId}`;
}

function maybeCleanupCaches() {
  const now = Date.now();
  if (now - lastCacheCleanupAt < CACHE_CLEANUP_INTERVAL_MS) return;
  lastCacheCleanupAt = now;

  for (const [key, entry] of roomCache.entries()) {
    if (!entry || entry.expiresAt <= now) roomCache.delete(key);
  }
  for (const [key, entry] of memberCache.entries()) {
    if (!entry || entry.expiresAt <= now) memberCache.delete(key);
  }
}

function readCached(map, key) {
  maybeCleanupCaches();
  const now = Date.now();
  const entry = map.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= now) {
    map.delete(key);
    return undefined;
  }
  return entry.value;
}

function writeCached(map, key, value, ttlMs) {
  map.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function maybeCleanupRateLimit() {
  const now = Date.now();
  if (now - lastRateCleanupAt < CACHE_CLEANUP_INTERVAL_MS) return;
  lastRateCleanupAt = now;
  for (const [key, entry] of rateLimitState.entries()) {
    if (!entry || entry.resetAt <= now) rateLimitState.delete(key);
  }
}

function consumeRateLimit(scope, userId) {
  const rule = RATE_LIMIT_RULES[scope];
  if (!rule) return { limited: false, retryAfterSeconds: 0 };

  maybeCleanupRateLimit();

  const now = Date.now();
  const key = `${scope}:${userId}`;
  const existing = rateLimitState.get(key);

  if (!existing || existing.resetAt <= now) {
    rateLimitState.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { limited: false, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  rateLimitState.set(key, existing);

  if (existing.count <= rule.max) {
    return { limited: false, retryAfterSeconds: 0 };
  }

  return {
    limited: true,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

async function getFirstAdminId() {
  const [rows] = await pool.query(
    "SELECT id FROM accounts WHERE role IN ('admin', 'superadmin') ORDER BY CASE WHEN role='admin' THEN 0 ELSE 1 END, id ASC LIMIT 1"
  );
  return rows[0]?.id || null;
}

async function getAllAdminIds() {
  const [rows] = await pool.query(
    "SELECT id FROM accounts WHERE role IN ('admin', 'superadmin') ORDER BY id ASC"
  );
  return rows
    .map((row) => toPositiveInt(row?.id))
    .filter((id) => !!id);
}

async function ensureAllAdminsMember(roomId) {
  const normalizedRoomId = toPositiveInt(roomId);
  if (!normalizedRoomId) return;

  const adminIds = await getAllAdminIds();
  for (const adminId of adminIds) {
    await ensureMember(normalizedRoomId, adminId, 'admin');
  }
}

async function requireRoom(roomId) {
  const normalizedRoomId = toPositiveInt(roomId);
  if (!normalizedRoomId) return null;

  const cached = readCached(roomCache, normalizedRoomId);
  if (cached !== undefined) return cached;

  const [rows] = await pool.query('SELECT * FROM chat_rooms WHERE id=?', [normalizedRoomId]);
  const room = rows[0] || null;
  writeCached(roomCache, normalizedRoomId, room, ROOM_CACHE_TTL_MS);
  return room;
}
async function isMember(roomId, userId) {
  const normalizedRoomId = toPositiveInt(roomId);
  const normalizedUserId = toPositiveInt(userId);
  if (!normalizedRoomId || !normalizedUserId) return false;

  const key = getCacheKey(normalizedRoomId, normalizedUserId);
  const cached = readCached(memberCache, key);
  if (cached !== undefined) return cached;

  const [rows] = await pool.query('SELECT 1 FROM chat_members WHERE room_id=? AND user_id=?', [normalizedRoomId, normalizedUserId]);
  const ok = rows.length > 0;
  writeCached(memberCache, key, ok, MEMBER_CACHE_TTL_MS);
  return ok;
}

async function ensureMember(roomId, userId, role) {
  const normalizedRoomId = toPositiveInt(roomId);
  const normalizedUserId = toPositiveInt(userId);
  if (!normalizedRoomId || !normalizedUserId) return;

  await pool.query(
    `INSERT INTO chat_members (room_id, user_id, role)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE role = VALUES(role)`,
    [normalizedRoomId, normalizedUserId, role]
  );
  writeCached(memberCache, getCacheKey(normalizedRoomId, normalizedUserId), true, MEMBER_CACHE_TTL_MS);
}

function isAdminRole(role) {
  return role === 'admin' || role === 'superadmin';
}

function shouldTrackServerUnread(roomType, role) {
  // Requested behavior:
  // - DM unread: sync across devices for all roles
  // - User public-room unread: sync across devices
  // - Admin public-room unread: local device only
  if (roomType === 'dm') return true;
  if (roomType === 'public' && role === 'user') return true;
  return false;
}

async function getOrCreatePublicRoom() {
  const [existed] = await pool.query("SELECT * FROM chat_rooms WHERE room_type='public' ORDER BY id ASC LIMIT 1");
  let room = existed[0] || null;
  if (room) return room;

  const [insResult] = await pool.query("INSERT INTO chat_rooms (name, room_type) VALUES (?, 'public')", ['ห้องรวม']);
  const [rows] = await pool.query('SELECT * FROM chat_rooms WHERE id=?', [insResult.insertId]);
  room = rows[0] || null;
  return room;
}

async function countUnreadForRoom({ roomId, userId }) {
  const normalizedRoomId = toPositiveInt(roomId);
  const normalizedUserId = toPositiveInt(userId);
  if (!normalizedRoomId || !normalizedUserId) return 0;

  const [rows] = await pool.query(
    `SELECT COUNT(*) AS unread_count
       FROM chat_messages m
       LEFT JOIN chat_room_reads rr
         ON rr.room_id = m.room_id
        AND rr.user_id = ?
      WHERE m.room_id = ?
        AND m.user_id <> ?
        AND m.id > COALESCE(rr.last_read_message_id, 0)`,
    [normalizedUserId, normalizedRoomId, normalizedUserId]
  );
  return Number(rows?.[0]?.unread_count || 0);
}

async function countUnreadByRoomIds({ roomIds, userId }) {
  const normalizedUserId = toPositiveInt(userId);
  if (!normalizedUserId) return new Map();

  const normalizedRoomIds = Array.from(
    new Set((roomIds || []).map((id) => toPositiveInt(id)).filter((id) => !!id))
  );
  if (!normalizedRoomIds.length) return new Map();

  const placeholders = normalizedRoomIds.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT m.room_id, COUNT(*) AS unread_count
       FROM chat_messages m
       LEFT JOIN chat_room_reads rr
         ON rr.room_id = m.room_id
        AND rr.user_id = ?
      WHERE m.room_id IN (${placeholders})
        AND m.user_id <> ?
        AND m.id > COALESCE(rr.last_read_message_id, 0)
      GROUP BY m.room_id`,
    [normalizedUserId, ...normalizedRoomIds, normalizedUserId]
  );

  const byRoom = new Map();
  for (const row of rows) {
    byRoom.set(Number(row.room_id), Number(row.unread_count || 0));
  }
  return byRoom;
}

async function ensureUnreadCursorInitialized({ roomId, userId }) {
  const normalizedRoomId = toPositiveInt(roomId);
  const normalizedUserId = toPositiveInt(userId);
  if (!normalizedRoomId || !normalizedUserId) return 0;

  const [readRows] = await pool.query(
    'SELECT last_read_message_id FROM chat_room_reads WHERE room_id = ? AND user_id = ? LIMIT 1',
    [normalizedRoomId, normalizedUserId]
  );
  if (readRows.length > 0) {
    return Number(readRows[0]?.last_read_message_id || 0);
  }

  // First time in room: baseline at latest message so unread starts from user's own timeline.
  const [maxRows] = await pool.query(
    'SELECT MAX(id) AS max_id FROM chat_messages WHERE room_id = ?',
    [normalizedRoomId]
  );
  const baselineId = Number(maxRows?.[0]?.max_id || 0);

  await pool.query(
    `INSERT INTO chat_room_reads (room_id, user_id, last_read_message_id, last_read_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
       last_read_message_id = COALESCE(chat_room_reads.last_read_message_id, VALUES(last_read_message_id)),
       last_read_at = CURRENT_TIMESTAMP`,
    [normalizedRoomId, normalizedUserId, baselineId]
  );

  return baselineId;
}

async function markRoomRead({ roomId, userId }) {
  const normalizedRoomId = toPositiveInt(roomId);
  const normalizedUserId = toPositiveInt(userId);
  if (!normalizedRoomId || !normalizedUserId) {
    return {
      previousLastReadMessageId: 0,
      lastReadMessageId: 0,
      changed: false,
    };
  }

  const [prevRows] = await pool.query(
    'SELECT last_read_message_id FROM chat_room_reads WHERE room_id = ? AND user_id = ? LIMIT 1',
    [normalizedRoomId, normalizedUserId]
  );
  const previousLastReadMessageId = Number(prevRows?.[0]?.last_read_message_id || 0);

  const [rows] = await pool.query(
    'SELECT MAX(id) AS max_id FROM chat_messages WHERE room_id = ?',
    [normalizedRoomId]
  );
  const lastReadMessageId = Number(rows?.[0]?.max_id || 0);

  await pool.query(
    `INSERT INTO chat_room_reads (room_id, user_id, last_read_message_id, last_read_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
       last_read_message_id = VALUES(last_read_message_id),
       last_read_at = CURRENT_TIMESTAMP`,
    [normalizedRoomId, normalizedUserId, lastReadMessageId]
  );

  return {
    previousLastReadMessageId,
    lastReadMessageId,
    changed: lastReadMessageId > previousLastReadMessageId,
  };
}

async function attachReactionsToMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return messages;

  const messageIds = Array.from(
    new Set(
      messages
        .map((message) => toPositiveInt(message?.id))
        .filter((id) => !!id)
    )
  );

  if (!messageIds.length) {
    for (const message of messages) {
      message.reactions = [];
    }
    return messages;
  }

  const placeholders = messageIds.map(() => '?').join(',');
  try {
    const [reactionRows] = await pool.query(
      `SELECT cr.message_id, cr.user_id, cr.emoji, cr.created_at, a.username, a.full_name
         FROM chat_reactions cr
         JOIN accounts a ON a.id = cr.user_id
        WHERE cr.message_id IN (${placeholders})
        ORDER BY cr.message_id ASC, cr.created_at ASC`,
      messageIds
    );

    const reactionsByMessageId = new Map();
    for (const row of reactionRows) {
      const messageId = Number(row.message_id || 0);
      if (!reactionsByMessageId.has(messageId)) reactionsByMessageId.set(messageId, []);
      reactionsByMessageId.get(messageId).push(row);
    }

    for (const message of messages) {
      const messageId = toPositiveInt(message?.id);
      message.reactions = messageId ? (reactionsByMessageId.get(messageId) || []) : [];
    }
  } catch (e) {
    console.warn('attach reactions failed:', e?.message || e);
    for (const message of messages) {
      if (!Array.isArray(message.reactions)) message.reactions = [];
    }
  }

  return messages;
}

let ensuredMessagePinsTable = false;
async function ensureMessagePinsTable() {
  if (ensuredMessagePinsTable) return;

  const exists = await tableExists('chat_message_pins');
  if (!exists) {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS chat_message_pins (
        message_id BIGINT NOT NULL,
        room_id BIGINT NOT NULL,
        user_id BIGINT NOT NULL,
        pinned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (message_id, user_id),
        FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
        FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES accounts(id) ON DELETE CASCADE,
        INDEX idx_chat_message_pins_user_room (user_id, room_id, pinned_at),
        INDEX idx_chat_message_pins_room (room_id, pinned_at)
      )`
    );
  }

  ensuredMessagePinsTable = true;
}

function registerChatRoutes(app, io) {
  ensureMessagePinsTable().catch((e) => {
    console.warn('ensure chat_message_pins table failed:', e?.message || e);
  });
  startTempPdfCleanupScheduler();

  const parseDownloadName = (input) => {
    const raw = String(input || '').trim();
    if (!raw) return '';
    try {
      return decodeURIComponent(raw.replace(/\+/g, '%20')).replace(/[\\/:*?"<>|]/g, '_');
    } catch {
      return raw.replace(/[\\/:*?"<>|]/g, '_');
    }
  };

  const previewHandler = async (req, res) => {
    try {
      const fileInput = String(req.query.file || req.params.fileName || '').trim();
      if (!fileInput) return res.status(400).json({ error: 'file required' });

      const previewInfo = await resolveDocxPreviewByInput(fileInput, { waitForCompletion: true });
      if (!previewInfo) return res.status(404).json({ error: 'PREVIEW_NOT_FOUND' });

      const displayName = `${path.basename(previewInfo.sourceRelativePath, '.docx')}.pdf`;
      return res.sendFile(previewInfo.previewAbsPath, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${displayName.replace(/["\r\n]/g, '_')}"`,
        },
      });
    } catch (e) {
      console.error('doc preview error:', e);
      return res.status(500).json({ error: 'PREVIEW_FAILED' });
    }
  };

  const downloadHandler = async (req, res) => {
    try {
      const fileInput = String(req.query.file || req.params.fileName || '').trim();
      if (!fileInput) return res.status(400).json({ error: 'file required' });

      const sourceInfo = await resolveOriginalDownloadByInput(fileInput);
      if (!sourceInfo) return res.status(404).json({ error: 'FILE_NOT_FOUND' });

      const requestedName = parseDownloadName(req.query.name);
      const fileName = requestedName || sourceInfo.sourceFileName;
      return res.download(sourceInfo.sourceAbsPath, fileName);
    } catch (e) {
      console.error('doc download error:', e);
      return res.status(500).json({ error: 'DOWNLOAD_FAILED' });
    }
  };

  app.get('/api/preview', previewHandler);
  app.get('/api/preview/:fileName', previewHandler);
  app.get('/api/download', downloadHandler);
  app.get('/api/download/:fileName', downloadHandler);

  const emitRoomPinUpdate = async ({ roomId, scope, pinned, updatedBy }) => {
    try {
      if (scope === 'shared') {
        const adminIds = await getAllAdminIds();
        for (const adminId of adminIds) {
          io.to(`user:${adminId}`).emit('room_pin_update', {
            room_id: roomId,
            scope,
            pinned,
            updated_by: updatedBy,
          });
        }
        return;
      }

      const uid = toPositiveInt(updatedBy);
      if (!uid) return;
      io.to(`user:${uid}`).emit('room_pin_update', {
        room_id: roomId,
        scope,
        pinned,
        updated_by: uid,
      });
    } catch (e) {
      console.warn('emit room pin update failed:', e?.message || e);
    }
  };

  const emitMessagePinUpdate = ({ roomId, messageId, userId, pinned }) => {
    const normalizedRoomId = toPositiveInt(roomId);
    const normalizedMessageId = toPositiveInt(messageId);
    const normalizedUserId = toPositiveInt(userId);
    if (!normalizedRoomId || !normalizedMessageId || !normalizedUserId) return;

    const payload = {
      room_id: normalizedRoomId,
      message_id: normalizedMessageId,
      user_id: normalizedUserId,
      pinned: !!pinned,
    };

    io.to(`user:${normalizedUserId}`).emit('message_pin_update', payload);
    io.to(`room:${normalizedRoomId}`).emit('message_pin_update', payload);
  };

  app.get('/chat/public-room', authGuard, async (_req, res) => {
    const room = await getOrCreatePublicRoom();
    res.json({ data: room });
  });

  app.get('/chat/public-unread', authGuard, async (req, res) => {
    try {
      const user = req.user;
      const room = await getOrCreatePublicRoom();
      if (!room?.id) return res.status(404).json({ error: 'ROOM_NOT_FOUND' });

      if (!shouldTrackServerUnread('public', user.role)) {
        return res.json({ room_id: room.id, unread_count: 0, local_only: true });
      }

      await ensureUnreadCursorInitialized({ roomId: room.id, userId: user.id });

      const unreadCount = await countUnreadForRoom({ roomId: room.id, userId: user.id });
      return res.json({ room_id: room.id, unread_count: unreadCount, local_only: false });
    } catch (e) {
      console.error('public unread error:', e);
      return res.status(500).json({ error: 'SERVER_ERROR' });
    }
  });

  app.post('/chat/rooms/:roomId/read', authGuard, async (req, res) => {
    try {
      const user = req.user;
      const roomId = toPositiveInt(req.params.roomId);
      if (!roomId) return res.status(400).json({ error: 'INVALID_ROOM_ID' });

      const room = await requireRoom(roomId);
      if (!room) return res.status(404).json({ error: 'ROOM_NOT_FOUND' });

      if (room.room_type === 'dm') {
        const ok = await isMember(roomId, user.id);
        if (!ok) return res.status(403).json({ error: 'FORBIDDEN' });
      }

      if (!shouldTrackServerUnread(room.room_type, user.role)) {
        return res.json({ ok: true, local_only: true, room_id: roomId });
      }

      const readResult = await markRoomRead({ roomId, userId: user.id });

      if (readResult.changed && readResult.lastReadMessageId > 0) {
        io.to(`room:${roomId}`).emit('message_status', {
          room_id: roomId,
          message_id: readResult.lastReadMessageId,
          status: 'read',
          reader_user_id: user.id,
        });
      }

      return res.json({
        ok: true,
        local_only: false,
        room_id: roomId,
        last_read_message_id: readResult.lastReadMessageId,
      });
    } catch (e) {
      console.error('mark room read error:', e);
      return res.status(500).json({ error: 'SERVER_ERROR' });
    }
  });

  app.get('/chat/pins', authGuard, async (req, res) => {
    try {
      const user = req.user;
      if (!isAdminRole(user.role)) {
        return res.json({ room_ids: [] });
      }

      const [sharedRows] = await pool.query(
        `SELECT ap.room_id
           FROM chat_room_admin_pins ap
           JOIN chat_rooms r ON r.id = ap.room_id
          WHERE r.room_type = 'dm' AND EXISTS (
            SELECT 1 FROM chat_members m
             WHERE m.room_id = r.id
               AND m.user_id = ?
          )`,
        [user.id]
      );

      const [personalRows] = await pool.query(
        `SELECT rp.room_id
           FROM chat_room_pins rp
           JOIN chat_rooms r ON r.id = rp.room_id
          WHERE rp.user_id = ?
            AND r.room_type = 'dm'
            AND EXISTS (
              SELECT 1 FROM chat_members m
               WHERE m.room_id = r.id
                 AND m.user_id = ?
            )`,
        [user.id, user.id]
      );

      const sharedRoomIds = sharedRows
        .map((row) => toPositiveInt(row?.room_id))
        .filter((id) => !!id);

      const personalRoomIds = personalRows
        .map((row) => toPositiveInt(row?.room_id))
        .filter((id) => !!id);

      const roomIds = Array.from(new Set([...sharedRoomIds, ...personalRoomIds]));

      return res.json({
        room_ids: roomIds,
        shared_room_ids: sharedRoomIds,
        personal_room_ids: personalRoomIds,
      });
    } catch (e) {
      console.error('get pins error:', e);
      return res.status(500).json({ error: 'SERVER_ERROR' });
    }
  });

  app.put('/chat/pins/:roomId', authGuard, async (req, res) => {
    try {
      const user = req.user;
      if (!isAdminRole(user.role)) {
        return res.status(403).json({ error: 'FORBIDDEN' });
      }

      const roomId = toPositiveInt(req.params.roomId);
      if (!roomId) return res.status(400).json({ error: 'INVALID_ROOM_ID' });

      const room = await requireRoom(roomId);
      if (!room) return res.status(404).json({ error: 'ROOM_NOT_FOUND' });

      if (room.room_type !== 'dm') {
        return res.status(400).json({ error: 'PIN_NOT_SUPPORTED_FOR_ROOM' });
      }

      if (room.room_type === 'dm') {
        let ok = await isMember(roomId, user.id);

        // Data-heal for user-owned admin DM: allow pin actions even if chat_members row is missing.
        if (!ok && !isAdminRole(user.role) && Number(room?.owner_id || 0) === Number(user.id)) {
          const [adminRows] = await pool.query(
            `SELECT 1
               FROM chat_members m
               JOIN accounts a ON a.id = m.user_id
              WHERE m.room_id = ?
                AND a.role IN ('admin', 'superadmin')
              LIMIT 1`,
            [roomId]
          );
          if (adminRows.length > 0) {
            await ensureMember(roomId, user.id, 'member');
            ok = true;
          }
        }

        if (!ok) return res.status(403).json({ error: 'FORBIDDEN' });
      }

      const pinned = !!req.body?.pinned;
      const requestedScope = String(req.body?.scope || 'shared').toLowerCase();
      const scope = requestedScope === 'personal' ? 'personal' : 'shared';

      if (scope === 'shared') {
        await ensureAllAdminsMember(roomId);

        if (pinned) {
          await pool.query(
            `INSERT INTO chat_room_admin_pins (room_id, pinned_by, pinned_at)
             VALUES (?, ?, CURRENT_TIMESTAMP)
             ON DUPLICATE KEY UPDATE
               pinned_by = VALUES(pinned_by),
               pinned_at = CURRENT_TIMESTAMP`,
            [roomId, user.id]
          );
        } else {
          await pool.query('DELETE FROM chat_room_admin_pins WHERE room_id = ?', [roomId]);
        }
      } else {
        await ensureMember(roomId, user.id, 'admin');

        if (pinned) {
          await pool.query(
            `INSERT INTO chat_room_pins (room_id, user_id, pinned_at)
             VALUES (?, ?, CURRENT_TIMESTAMP)
             ON DUPLICATE KEY UPDATE pinned_at = CURRENT_TIMESTAMP`,
            [roomId, user.id]
          );
        } else {
          await pool.query('DELETE FROM chat_room_pins WHERE room_id = ? AND user_id = ?', [roomId, user.id]);
        }
      }

      await emitRoomPinUpdate({
        roomId,
        scope,
        pinned,
        updatedBy: user.id,
      });

      return res.json({ ok: true, room_id: roomId, pinned, scope });
    } catch (e) {
      console.error('set pin error:', e);
      return res.status(500).json({ error: 'SERVER_ERROR' });
    }
  });

  app.get('/chat/message-pins', authGuard, async (req, res) => {
    try {
      await ensureMessagePinsTable();

      const user = req.user;
      const roomId = toPositiveInt(req.query.room_id);
      if (!roomId) return res.status(400).json({ error: 'INVALID_ROOM_ID' });

      const room = await requireRoom(roomId);
      if (!room) return res.status(404).json({ error: 'ROOM_NOT_FOUND' });
      if (room.room_type === 'dm') {
        const ok = await isMember(roomId, user.id);
        if (!ok) return res.status(403).json({ error: 'FORBIDDEN' });
      }

      const [rows] = await pool.query(
        `SELECT m.*, a.username, a.full_name, a.role, pins.pinned_at
           FROM (
             SELECT message_id, MAX(pinned_at) AS pinned_at
               FROM chat_message_pins
              WHERE room_id = ?
              GROUP BY message_id
           ) pins
           JOIN chat_messages m ON m.id = pins.message_id
           JOIN accounts a ON a.id = m.user_id
          ORDER BY pins.pinned_at DESC, m.id DESC`,
        [roomId]
      );

      await attachVideoThumbToMessages(rows, { generateIfMissing: true });

      return res.json({ data: rows });
    } catch (e) {
      console.error('get message pins error:', e);
      return res.status(500).json({ error: 'SERVER_ERROR' });
    }
  });

  app.put('/chat/message-pins/:messageId', authGuard, async (req, res) => {
    try {
      await ensureMessagePinsTable();

      const user = req.user;
      const messageId = toPositiveInt(req.params.messageId);
      if (!messageId) return res.status(400).json({ error: 'INVALID_MESSAGE_ID' });

      const pinned = !!req.body?.pinned;

      const [rows] = await pool.query(
        `SELECT m.id, m.room_id, r.room_type
           FROM chat_messages m
           JOIN chat_rooms r ON r.id = m.room_id
          WHERE m.id = ?
          LIMIT 1`,
        [messageId]
      );
      const msg = rows[0];
      if (!msg) return res.status(404).json({ error: 'MESSAGE_NOT_FOUND' });

      const roomId = toPositiveInt(msg.room_id);
      if (!roomId) return res.status(404).json({ error: 'ROOM_NOT_FOUND' });

      if (msg.room_type === 'dm') {
        const ok = await isMember(roomId, user.id);
        if (!ok) return res.status(403).json({ error: 'FORBIDDEN' });
      }

      if (pinned) {
        await pool.query(
          `INSERT INTO chat_message_pins (message_id, room_id, user_id, pinned_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)
           ON DUPLICATE KEY UPDATE pinned_at = CURRENT_TIMESTAMP`,
          [messageId, roomId, user.id]
        );
      } else {
        if (msg.room_type === 'public' && !isAdminRole(user.role)) {
          const [removeOwn] = await pool.query(
            'DELETE FROM chat_message_pins WHERE message_id = ? AND room_id = ? AND user_id = ?',
            [messageId, roomId, user.id]
          );
          if (!Number(removeOwn?.affectedRows || 0)) {
            return res.status(403).json({ error: 'PIN_UNPIN_FORBIDDEN' });
          }
        } else {
          await pool.query(
            'DELETE FROM chat_message_pins WHERE message_id = ? AND room_id = ?',
            [messageId, roomId]
          );
        }
      }

      emitMessagePinUpdate({
        roomId,
        messageId,
        userId: user.id,
        pinned,
      });

      return res.json({ ok: true, room_id: roomId, message_id: messageId, pinned });
    } catch (e) {
      console.error('set message pin error:', e);
      return res.status(500).json({ error: 'SERVER_ERROR' });
    }
  });

  app.get('/chat/unread-summary', authGuard, async (req, res) => {
    try {
      const user = req.user;
      const trackedRoomIds = [];

      if (user.role === 'user') {
        const room = await getOrCreatePublicRoom();
        if (room?.id) {
          trackedRoomIds.push(Number(room.id));
        }

        const [dmRows] = await pool.query(
          `SELECT DISTINCT r.id
             FROM chat_rooms r
             JOIN chat_members m ON m.room_id = r.id
            WHERE r.room_type = 'dm'
              AND m.user_id = ?`,
          [user.id]
        );
        for (const row of dmRows) {
          const roomId = toPositiveInt(row?.id);
          if (roomId) trackedRoomIds.push(roomId);
        }
      } else if (isAdminRole(user.role)) {
        const [dmRows] = await pool.query(
          `SELECT DISTINCT r.id
             FROM chat_rooms r
             JOIN chat_members m ON m.room_id = r.id
            WHERE r.room_type = 'dm'
              AND m.user_id = ?`,
          [user.id]
        );
        for (const row of dmRows) {
          const roomId = toPositiveInt(row?.id);
          if (roomId) trackedRoomIds.push(roomId);
        }
      }

      const uniqueRoomIds = Array.from(new Set(trackedRoomIds));
      for (const roomId of uniqueRoomIds) {
        await ensureUnreadCursorInitialized({ roomId, userId: user.id });
      }

      const unreadByRoomId = await countUnreadByRoomIds({
        roomIds: uniqueRoomIds,
        userId: user.id,
      });

      const byRoom = uniqueRoomIds.map((roomId) => ({
        room_id: roomId,
        unread_count: unreadByRoomId.get(roomId) || 0,
      }));
      const totalUnread = byRoom.reduce((sum, item) => sum + Number(item.unread_count || 0), 0);

      return res.json({
        total_unread: totalUnread,
        tracked_room_ids: uniqueRoomIds,
        by_room: byRoom,
        local_only_public_for_admin: isAdminRole(user.role),
      });
    } catch (e) {
      console.error('unread summary error:', e);
      return res.status(500).json({ error: 'SERVER_ERROR' });
    }
  });

  app.post('/chat/ensure-dm-admin', authGuard, async (req, res) => {
    try {
      const me = req.user;
      const adminId = await getFirstAdminId();
      if (!adminId) return res.status(400).json({ error: 'NO_ADMIN' });

      const [rows] = await pool.query(
        `SELECT r.*
           FROM chat_rooms r
           JOIN chat_members m1 ON m1.room_id = r.id AND m1.user_id = ?
           JOIN chat_members m2 ON m2.room_id = r.id AND m2.user_id = ?
           LEFT JOIN chat_messages cm ON cm.room_id = r.id
          WHERE r.room_type = 'dm'
          GROUP BY r.id
          ORDER BY CASE WHEN MAX(cm.id) IS NULL THEN 1 ELSE 0 END ASC,
                   MAX(cm.id) DESC,
                   r.id DESC
          LIMIT 1`,
        [me.id, adminId]
      );

      let room = rows[0];
      let roomId = room?.id || null;
      if (!roomId) {
        const [insResult] = await pool.query(
          "INSERT INTO chat_rooms (name, room_type, owner_id) VALUES (?, 'dm', ?)",
          ['ติดต่อแอดมิน', me.id]
        );
        roomId = insResult.insertId;
      }

      // Ensure memberships exist even if room already existed or partial data is missing.
      const meRole = Number(me.id) === Number(adminId) ? 'admin' : 'member';
      await ensureMember(roomId, me.id, meRole);
      if (Number(adminId) !== Number(me.id)) {
        await ensureMember(roomId, adminId, 'admin');
      }

      const [r2] = await pool.query('SELECT * FROM chat_rooms WHERE id=?', [roomId]);
      room = r2[0] || null;
      res.json({ data: room });
    } catch (e) {
      console.error('ensure-dm-admin error:', e);
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  });

  app.get('/chat/messages', authGuard, async (req, res) => {
    const user = req.user;
    const roomId = toPositiveInt(req.query.room_id);
    const beforeId = toPositiveInt(req.query.before_id);
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
        SELECT m.*, a.username, a.full_name, a.role,
               CASE WHEN m.reply_to_id IS NOT NULL THEN
                 JSON_OBJECT(
                   'id', r.id,
                   'user_id', r.user_id,
                   'text', r.text,
                   'msg_type', r.msg_type,
                   'file_url', r.file_url,
                   'file_name', r.file_name,
                   'mime_type', r.mime_type,
                   'username', ra.username,
                   'full_name', ra.full_name,
                   'role', ra.role
                 )
               ELSE NULL END as reply_to
          FROM chat_messages m
          JOIN accounts a ON a.id = m.user_id
          LEFT JOIN chat_messages r ON r.id = m.reply_to_id
          LEFT JOIN accounts ra ON ra.id = r.user_id
         WHERE m.room_id = ?
       `;
    } else {
       sql = `
         SELECT m.*, a.username, a.full_name, a.role
           FROM chat_messages m
           JOIN accounts a ON a.id = m.user_id
          WHERE m.room_id = ?
       `;
    }

    if (beforeId) {
      sql += ` AND m.id < ?`;
      params.push(beforeId);
    }
    
    if (hasReplyCol) {
      // keep as-is; client can fetch reply meta as needed
    }
    sql += ` ORDER BY m.id DESC LIMIT ?`;
    params.push(pageLimit);

    const [rows] = await pool.query(sql, params);
    await attachVideoThumbToMessages(rows, { generateIfMissing: true });
    await attachReactionsToMessages(rows);
    res.json({ data: rows });
  });

  app.get('/chat/messages/:messageId', authGuard, async (req, res) => {
    try {
      const user = req.user;
      const messageId = toPositiveInt(req.params.messageId);
      const roomIdFilter = toPositiveInt(req.query.room_id);
      if (!messageId) return res.status(400).json({ error: 'INVALID_MESSAGE_ID' });

      const hasReplyCol = await columnExists('chat_messages', 'reply_to_id');
      let sql = '';
      const params = [messageId];

      if (hasReplyCol) {
        sql = `
          SELECT m.*, a.username, a.full_name, a.role,
                 CASE WHEN m.reply_to_id IS NOT NULL THEN
                   JSON_OBJECT(
                     'id', r.id,
                     'user_id', r.user_id,
                     'text', r.text,
                     'msg_type', r.msg_type,
                     'file_url', r.file_url,
                     'file_name', r.file_name,
                     'mime_type', r.mime_type,
                     'username', ra.username,
                     'full_name', ra.full_name,
                     'role', ra.role
                   )
                 ELSE NULL END as reply_to
            FROM chat_messages m
            JOIN accounts a ON a.id = m.user_id
            LEFT JOIN chat_messages r ON r.id = m.reply_to_id
            LEFT JOIN accounts ra ON ra.id = r.user_id
           WHERE m.id = ?
           LIMIT 1
        `;
      } else {
        sql = `
          SELECT m.*, a.username, a.full_name, a.role
            FROM chat_messages m
            JOIN accounts a ON a.id = m.user_id
           WHERE m.id = ?
           LIMIT 1
        `;
      }

      const [rows] = await pool.query(sql, params);
      if (!rows.length) return res.status(404).json({ error: 'MESSAGE_NOT_FOUND' });

      const msg = rows[0];
      const msgRoomId = toPositiveInt(msg.room_id);
      if (!msgRoomId) return res.status(404).json({ error: 'ROOM_NOT_FOUND' });
      if (roomIdFilter && roomIdFilter !== msgRoomId) {
        return res.status(404).json({ error: 'MESSAGE_NOT_FOUND' });
      }

      const room = await requireRoom(msgRoomId);
      if (!room) return res.status(404).json({ error: 'ROOM_NOT_FOUND' });
      if (room.room_type === 'dm') {
        const ok = await isMember(msgRoomId, user.id);
        if (!ok) return res.status(403).json({ error: 'FORBIDDEN' });
      }

      await attachVideoThumbToMessage(msg, { generateIfMissing: true });
      await attachReactionsToMessages([msg]);

      return res.json({ data: msg });
    } catch (e) {
      console.error('get message by id error:', e);
      return res.status(500).json({ error: 'SERVER_ERROR' });
    }
  });

  app.post('/chat/messages', authGuard, async (req, res) => {
    const user = req.user;
    const { room_id, text, reply_to_id } = req.body || {};
    const roomId = toPositiveInt(room_id);
    const replyToId = toPositiveInt(reply_to_id);
    const trimmedText = typeof text === 'string' ? text.trim() : '';
    if (!roomId || !trimmedText) return res.status(400).json({ error: 'INVALID_BODY' });
    if (trimmedText.length > 4000) return res.status(400).json({ error: 'TEXT_TOO_LONG' });

    const msgRate = consumeRateLimit('message', user.id);
    if (msgRate.limited) {
      return res.status(429).json({ error: 'RATE_LIMITED', retry_after_seconds: msgRate.retryAfterSeconds });
    }

    const room = await requireRoom(roomId);
    if (!room) return res.status(404).json({ error: 'ROOM_NOT_FOUND' });

    if (room.room_type === 'dm') {
      const ok = await isMember(roomId, user.id);
      if (!ok) return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const hasReplyCol = await columnExists('chat_messages', 'reply_to_id');

    let insResult;
    if (hasReplyCol && replyToId) {
      [insResult] = await pool.query(
        `INSERT INTO chat_messages (room_id, user_id, text, msg_type, reply_to_id)
         VALUES (?, ?, ?, 'text', ?)`,
        [roomId, user.id, trimmedText, replyToId]
      );
    } else {
      [insResult] = await pool.query(
        `INSERT INTO chat_messages (room_id, user_id, text, msg_type)
         VALUES (?, ?, ?, 'text')`,
        [roomId, user.id, trimmedText]
      );
    }

    const insertId = insResult.insertId;
    const [rows] = await pool.query(
      `SELECT m.*, a.username, a.full_name, a.role
         FROM chat_messages m
         JOIN accounts a ON a.id = m.user_id
        WHERE m.id = ?`,
      [insertId]
    );
    const msg = rows[0];
    io.to(`room:${roomId}`).emit('new_message', msg);
    res.status(201).json(msg);
  });

  app.post(['/chat/upload', '/api/upload'], authGuard, uploadChat.single('file'), async (req, res) => {
    try {
      const user = req.user;
      const roomId = toPositiveInt(req.body.room_id);
      const replyToId = toPositiveInt(req.body.reply_to_id);

      const uploadRate = consumeRateLimit('upload', user.id);
      if (uploadRate.limited) {
        return res.status(429).json({ error: 'RATE_LIMITED', retry_after_seconds: uploadRate.retryAfterSeconds });
      }

      if (!roomId) return res.status(400).json({ error: 'room_id required' });

      const room = await requireRoom(roomId);
      if (!room) return res.status(404).json({ error: 'ROOM_NOT_FOUND' });

      if (room.room_type === 'dm') {
        const ok = await isMember(roomId, user.id);
        if (!ok) return res.status(403).json({ error: 'FORBIDDEN' });
      }

      if (!req.file) return res.status(400).json({ error: 'file required' });

      const { filename, size, mimetype, originalname } = req.file;
      const relativePath = path.relative(UPLOAD_DIR, req.file.path).replace(/\\/g, '/');
      const url = `/uploads/${relativePath}`;
      const isImage = mimetype.startsWith('image/');
      const msgType = isImage ? 'image' : 'file';

      const hasReplyCol = await columnExists('chat_messages', 'reply_to_id');

      let insResult;
      if (hasReplyCol && replyToId) {
        [insResult] = await pool.query(
          `INSERT INTO chat_messages (room_id, user_id, text, msg_type, file_url, file_name, file_size, mime_type, reply_to_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [roomId, user.id, msgType === 'file' ? originalname : '', msgType, url, originalname, size, mimetype, replyToId]
        );
      } else {
        [insResult] = await pool.query(
          `INSERT INTO chat_messages (room_id, user_id, text, msg_type, file_url, file_name, file_size, mime_type)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [roomId, user.id, msgType === 'file' ? originalname : '', msgType, url, originalname, size, mimetype]
        );
      }

      const insertId = insResult.insertId;
      const [rows] = await pool.query(
        `SELECT m.*, a.username, a.full_name, a.role
           FROM chat_messages m
           JOIN accounts a ON a.id = m.user_id
          WHERE m.id = ?`,
        [insertId]
      );
      const msg = rows[0];
      await attachVideoThumbToMessage(msg, { generateIfMissing: true });
      io.to(`room:${roomId}`).emit('new_message', msg);

      if (isDocxLikeFile(req.file)) {
        scheduleDocxPreviewConversionFromUploadUrl(url);
      }

      res.status(201).json(msg);
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: e.message || 'UPLOAD_FAILED' });
    }
  });

  app.post(['/chat/upload-multi', '/api/upload-multi'], authGuard, (req, res) => {
    uploadImagesMulti(req, res, async (err) => {
      try {
        if (err) return res.status(400).json({ error: err.message || 'UPLOAD_FAILED' });

        const user = req.user;
        const roomId = toPositiveInt(req.body.room_id);
        const caption = (req.body.caption || '').toString().trim();
        const replyToId = toPositiveInt(req.body.reply_to_id);

        const uploadRate = consumeRateLimit('upload', user.id);
        if (uploadRate.limited) {
          return res.status(429).json({ error: 'RATE_LIMITED', retry_after_seconds: uploadRate.retryAfterSeconds });
        }

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
        const insertedIds = [];
        const docxUploadUrls = [];
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          const { filename, size, mimetype, originalname } = f;
          const relativePath = path.relative(UPLOAD_DIR, f.path).replace(/\\/g, '/');
          const url = `/uploads/${relativePath}`;
          const isImage = mimetype.startsWith('image/');
          const msgType = isImage ? 'image' : 'file';

          if (isDocxLikeFile(f)) {
            docxUploadUrls.push(url);
          }
          
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
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [roomId, user.id, textForThis, msgType, url, originalname, size, mimetype, replyToId]
            );
          } else {
            [insResult] = await pool.query(
              `INSERT INTO chat_messages (room_id, user_id, text, msg_type, file_url, file_name, file_size, mime_type)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [roomId, user.id, textForThis, msgType, url, originalname, size, mimetype]
            );
          }

          const insertId = insResult.insertId;
          insertedIds.push(insertId);
        }

        if (insertedIds.length > 0) {
          const placeholders = insertedIds.map(() => '?').join(',');
          const [msgRows] = await pool.query(
            `SELECT m.*, a.username, a.full_name, a.role
               FROM chat_messages m
               JOIN accounts a ON a.id = m.user_id
              WHERE m.id IN (${placeholders})`,
            insertedIds
          );
          await attachVideoThumbToMessages(msgRows, { generateIfMissing: true });
          const byId = new Map(msgRows.map((row) => [Number(row.id), row]));
          for (const id of insertedIds) {
            const msg = byId.get(Number(id));
            if (!msg) continue;
            io.to(`room:${roomId}`).emit('new_message', msg);
            results.push(msg);
          }
        }

        for (const uploadUrl of docxUploadUrls) {
          scheduleDocxPreviewConversionFromUploadUrl(uploadUrl);
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
      const { role, id: adminUserId } = req.user;
      if (role !== 'admin' && role !== 'superadmin') {
        return res.status(403).json({ error: 'Permission denied' });
      }

      const [rooms] = await pool.query(`
        SELECT r.id,
               r.owner_id,
               COALESCE(
                 (SELECT GROUP_CONCAT(house_number SEPARATOR ', ') FROM residents WHERE account_id = a.id),
                 a.full_name,
                 a.username
               ) AS name,
               'dm' AS room_type,
               MAX(m.id) AS last_message_id,
               COALESCE(MAX(m.created_at), r.created_at) AS last_activity
          FROM chat_rooms r
          JOIN accounts a ON r.owner_id = a.id
          LEFT JOIN chat_messages m ON m.room_id = r.id
         WHERE r.room_type = 'dm'
           AND r.owner_id IS NOT NULL
         GROUP BY r.id, r.owner_id, a.id, a.full_name, a.username, r.created_at
      `);

      const byOwner = new Map();
      for (const room of rooms) {
        const ownerId = Number(room.owner_id || 0);
        if (!ownerId) continue;

        const prev = byOwner.get(ownerId);
        if (!prev) {
          byOwner.set(ownerId, room);
          continue;
        }

        const prevMsgId = Number(prev.last_message_id || 0);
        const currMsgId = Number(room.last_message_id || 0);
        if (currMsgId > prevMsgId) {
          byOwner.set(ownerId, room);
          continue;
        }

        if (currMsgId === prevMsgId) {
          const prevTime = new Date(prev.last_activity || 0).getTime();
          const currTime = new Date(room.last_activity || 0).getTime();
          if (currTime > prevTime || (currTime === prevTime && Number(room.id) > Number(prev.id))) {
            byOwner.set(ownerId, room);
          }
        }
      }

      const selected = Array.from(byOwner.values());

      for (const room of selected) {
        // Keep membership consistent for admin list and unread query access.
        await ensureMember(room.id, adminUserId, 'admin');
      }

      const unreadByRoomId = new Map();
      if (selected.length > 0) {
        const roomIds = selected
          .map((room) => toPositiveInt(room.id))
          .filter((id) => !!id);

        if (roomIds.length > 0) {
          for (const roomId of roomIds) {
            await ensureUnreadCursorInitialized({ roomId, userId: adminUserId });
          }

          const counts = await countUnreadByRoomIds({ roomIds, userId: adminUserId });
          for (const [roomId, unreadCount] of counts.entries()) {
            unreadByRoomId.set(Number(roomId), Number(unreadCount || 0));
          }
        }
      }

      selected.sort((a, b) => {
        const aMsg = Number(a.last_message_id || 0);
        const bMsg = Number(b.last_message_id || 0);
        if (aMsg !== bMsg) return bMsg - aMsg;
        const aTime = new Date(a.last_activity || 0).getTime();
        const bTime = new Date(b.last_activity || 0).getTime();
        return bTime - aTime;
      });

      res.json(selected.map(room => ({
        id: room.id,
        name: room.name,
        room_type: 'dm',
        last_message_id: Number(room.last_message_id || 0),
        last_activity: room.last_activity || null,
        unread_count: unreadByRoomId.get(Number(room.id)) || 0,
      })));
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
      const messageId = toPositiveInt(message_id);
      const reactionRate = consumeRateLimit('reaction', user.id);
      if (reactionRate.limited) {
        return res.status(429).json({ error: 'RATE_LIMITED', retry_after_seconds: reactionRate.retryAfterSeconds });
      }
      
      if (!messageId || !emoji) {
        return res.status(400).json({ error: 'message_id and emoji required' });
      }
      if (String(emoji).length > 16) {
        return res.status(400).json({ error: 'INVALID_EMOJI' });
      }

      // Verify message exists and user has access
      const [msgRows] = await pool.query(
        `SELECT m.*, r.room_type FROM chat_messages m
         JOIN chat_rooms r ON r.id = m.room_id
         WHERE m.id = ?`,
        [messageId]
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
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE emoji = VALUES(emoji), created_at = CURRENT_TIMESTAMP`,
        [messageId, user.id, emoji]
      );

      // Fetch all reactions for this message
      const [reactions] = await pool.query(
        `SELECT cr.*, a.username, a.full_name
         FROM chat_reactions cr
         JOIN accounts a ON a.id = cr.user_id
         WHERE cr.message_id = ?
         ORDER BY cr.created_at ASC`,
        [messageId]
      );

      // Emit to room
      io.to(`room:${msg.room_id}`).emit('reaction_update', {
        room_id: Number(msg.room_id),
        message_id: messageId,
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
      const messageId = toPositiveInt(req.params.messageId);
      if (!messageId) return res.status(400).json({ error: 'INVALID_MESSAGE_ID' });

      const reactionRate = consumeRateLimit('reaction', user.id);
      if (reactionRate.limited) {
        return res.status(429).json({ error: 'RATE_LIMITED', retry_after_seconds: reactionRate.retryAfterSeconds });
      }

      // Verify message exists
      const [msgRows] = await pool.query(
        `SELECT m.*, r.room_type FROM chat_messages m
         JOIN chat_rooms r ON r.id = m.room_id
         WHERE m.id = ?`,
        [messageId]
      );
      
      if (!msgRows.length) {
        return res.status(404).json({ error: 'MESSAGE_NOT_FOUND' });
      }
      
      const msg = msgRows[0];
      if (msg.room_type === 'dm') {
        const ok = await isMember(msg.room_id, user.id);
        if (!ok) return res.status(403).json({ error: 'FORBIDDEN' });
      }

      // Delete user's reaction
      await pool.query(
        `DELETE FROM chat_reactions WHERE message_id = ? AND user_id = ?`,
        [messageId, user.id]
      );

      // Fetch remaining reactions
      const [reactions] = await pool.query(
        `SELECT cr.*, a.username, a.full_name
         FROM chat_reactions cr
         JOIN accounts a ON a.id = cr.user_id
         WHERE cr.message_id = ?
         ORDER BY cr.created_at ASC`,
        [messageId]
      );

      // Emit to room
      io.to(`room:${msg.room_id}`).emit('reaction_update', {
        room_id: Number(msg.room_id),
        message_id: messageId,
        reactions
      });

      res.json({ success: true, reactions });
    } catch (e) {
      console.error('Remove reaction error:', e);
      res.status(500).json({ error: e.message || 'REACTION_FAILED' });
    }
  });


  
  // Notification: Send payment status update to resident (Admin only)
  app.post('/chat/notify-payment', authGuard, async (req, res) => {
    try {
      const { role, id: adminId } = req.user;
      if (role !== 'admin' && role !== 'superadmin') {
        return res.status(403).json({ error: 'Permission denied' });
      }

      const { installment_id, status } = req.body;
      if (!installment_id || !status) return res.status(400).json({ error: 'Missing params' });

      // 1. Find resident account_id from installment
      const [rows] = await pool.query(
        `SELECT r.account_id, r.first_name, r.last_name, r.house_number, pi.installment_no, pi.amount
         FROM payment_installments pi
         JOIN payments p ON p.id = pi.payment_id
         JOIN residents r ON r.house_number = p.house_number
         WHERE pi.id = ?
         LIMIT 1`,
        [Number(installment_id)]
      );
      
      const resident = rows[0];
      if (!resident || !resident.account_id) {
        return res.status(404).json({ error: 'Resident account not found or not linked' });
      }

      const targetUserId = resident.account_id;

      // 2. Ensure DM Room exists
      const [roomRows] = await pool.query(
        `SELECT r.id
         FROM chat_rooms r
         JOIN chat_members m1 ON m1.room_id = r.id AND m1.user_id = ?
         JOIN chat_members m2 ON m2.room_id = r.id AND m2.user_id = ?
         WHERE r.room_type = 'dm'
         LIMIT 1`,
        [adminId, targetUserId]
      );

      let roomId = roomRows[0]?.id;
      if (!roomId) {
        // Create new DM room
        const roomName = `DM ${resident.first_name}`;
        const [insRoom] = await pool.query(
          "INSERT INTO chat_rooms (name, room_type, owner_id) VALUES (?, 'dm', ?)",
          [roomName, targetUserId] // Owner is user (usually)
        );
        roomId = insRoom.insertId;
      }

      // Ensure memberships are present every time.
      const targetRole = Number(targetUserId) === Number(adminId) ? 'admin' : 'member';
      await ensureMember(roomId, targetUserId, targetRole);
      if (Number(targetUserId) !== Number(adminId)) {
        await ensureMember(roomId, adminId, 'admin');
      }

      // 3. Construct Message
      const statusText = status === 'pending' ? 'รอชำระ' : status === 'overdue' ? 'ค้างชำระ' : status;
      const amountFmt = Number(resident.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 });
      const message = `🔔 แจ้งเตือนสถานะการชำระเงิน\n\nงวดที่ ${resident.installment_no} (บ้านเลขที่ ${resident.house_number})\nยอดชําระ: ${amountFmt} บาท\nสถานะปัจจุบัน: ${statusText}\n\nกรุณาตรวจสอบและดำเนินการชำระเงิน`;

      // 4. Send Message
      const [insMsg] = await pool.query(
        `INSERT INTO chat_messages (room_id, user_id, text, msg_type)
         VALUES (?, ?, ?, 'text')`,
        [roomId, adminId, message]
      );
      
      const insertId = insMsg.insertId;
      const [msgRows] = await pool.query(
        `SELECT m.*, a.username, a.full_name, a.role
         FROM chat_messages m
         JOIN accounts a ON a.id = m.user_id
         WHERE m.id = ?`,
        [insertId]
      );
      
      const msg = msgRows[0];
      io.to(`room:${roomId}`).emit('new_message', msg);

      return res.json({ ok: true, message: 'Notification sent' });

    } catch (e) {
      console.error('Notify payment error:', e);
      res.status(500).json({ error: e.message || 'Server Error' });
    }
  });

  app.get('/chat/reactions/:messageId', authGuard, async (req, res) => {
    try {
      const user = req.user;
      const messageId = toPositiveInt(req.params.messageId);
      if (!messageId) return res.status(400).json({ error: 'INVALID_MESSAGE_ID' });

      const [msgRows] = await pool.query(
        `SELECT m.room_id, r.room_type
           FROM chat_messages m
           JOIN chat_rooms r ON r.id = m.room_id
          WHERE m.id = ?
          LIMIT 1`,
        [messageId]
      );
      const msg = msgRows[0];
      if (!msg) return res.status(404).json({ error: 'MESSAGE_NOT_FOUND' });
      if (msg.room_type === 'dm') {
        const ok = await isMember(msg.room_id, user.id);
        if (!ok) return res.status(403).json({ error: 'FORBIDDEN' });
      }

      const [reactions] = await pool.query(
        `SELECT cr.*, a.username, a.full_name
         FROM chat_reactions cr
         JOIN accounts a ON a.id = cr.user_id
         WHERE cr.message_id = ?
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
