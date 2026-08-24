const { verifySocketToken } = require('../middleware/auth');
const { pool } = require('../db/pool');

const MEMBER_CACHE_TTL_MS = 10_000;
const MEMBER_CACHE_CLEANUP_MS = 60_000;
const TYPING_EMIT_MIN_MS = 800;
const memberCache = new Map();
let lastMemberCacheCleanupAt = 0;

function toPositiveInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return i > 0 ? i : null;
}

function memberKey(roomId, userId) {
  return `${roomId}:${userId}`;
}

function cleanupMemberCache() {
  const now = Date.now();
  if (now - lastMemberCacheCleanupAt < MEMBER_CACHE_CLEANUP_MS) return;
  lastMemberCacheCleanupAt = now;
  for (const [key, entry] of memberCache.entries()) {
    if (!entry || entry.expiresAt <= now) memberCache.delete(key);
  }
}

function readMemberCache(roomId, userId) {
  cleanupMemberCache();
  const key = memberKey(roomId, userId);
  const entry = memberCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    memberCache.delete(key);
    return undefined;
  }
  return entry.value;
}

function writeMemberCache(roomId, userId, value) {
  memberCache.set(memberKey(roomId, userId), {
    value,
    expiresAt: Date.now() + MEMBER_CACHE_TTL_MS,
  });
}

async function canAccessRoom(roomId, userId) {
  const normalizedRoomId = toPositiveInt(roomId);
  const normalizedUserId = toPositiveInt(userId);
  if (!normalizedRoomId || !normalizedUserId) return false;

  const [roomRows] = await pool.query(
    'SELECT room_type FROM chat_rooms WHERE id = ? LIMIT 1',
    [normalizedRoomId]
  );
  const room = roomRows[0];
  if (!room) return false;
  if (room.room_type === 'public') return true;

  const cached = readMemberCache(normalizedRoomId, normalizedUserId);
  if (cached !== undefined) return cached;

  const [memberRows] = await pool.query(
    'SELECT 1 FROM chat_members WHERE room_id = ? AND user_id = ? LIMIT 1',
    [normalizedRoomId, normalizedUserId]
  );
  const ok = memberRows.length > 0;
  writeMemberCache(normalizedRoomId, normalizedUserId, ok);
  return ok;
}

async function hydrateSocketProfile(socket) {
  const uid = toPositiveInt(socket.user?.id);
  if (!uid) return;
  const [rows] = await pool.query(
    'SELECT username, full_name FROM accounts WHERE id = ? LIMIT 1',
    [uid]
  );
  const account = rows[0] || null;
  socket.data.userProfile = {
    username: account?.username || socket.user?.username,
    full_name: account?.full_name || null,
  };
}

function setupSocket(io) {
  io.use((socket, next) => {
    try {
      const headerToken = socket.handshake.headers.authorization || '';
      const authToken = socket.handshake.auth?.token || '';
      const token = headerToken || authToken;
      socket.user = verifySocketToken(token);
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    socket.data.joinedRooms = new Set();
    socket.data.lastTypingEmitByRoom = new Map();

    const uid = toPositiveInt(socket.user?.id);
    if (uid) {
      socket.join(`user:${uid}`);
    }

    hydrateSocketProfile(socket).catch((e) => {
      console.warn('socket profile hydrate failed:', e?.message || e);
    });

    socket.on('join_room', async (payload = {}) => {
      try {
        const roomId = toPositiveInt(payload.room_id);
        const uid = toPositiveInt(socket.user?.id);
        if (!roomId || !uid) return;

        const ok = await canAccessRoom(roomId, uid);
        if (!ok) {
          socket.emit('room_error', { room_id: roomId, error: 'FORBIDDEN' });
          return;
        }

        socket.join(`room:${roomId}`);
        socket.data.joinedRooms.add(roomId);
        socket.emit('room_joined', { room_id: roomId });
      } catch (e) {
        console.error('join_room error:', e?.message || e);
      }
    });

    socket.on('typing', async (payload = {}) => {
      try {
        const roomId = toPositiveInt(payload.room_id);
        if (!roomId) return;

        const uid = toPositiveInt(socket.user?.id);
        if (!uid) return;

        const joinedRooms = socket.data.joinedRooms || new Set();
        if (!joinedRooms.has(roomId)) {
          const canJoin = await canAccessRoom(roomId, uid);
          if (!canJoin) return;
          socket.join(`room:${roomId}`);
          joinedRooms.add(roomId);
          socket.data.joinedRooms = joinedRooms;
        }

        const now = Date.now();
        const lastEmitMap = socket.data.lastTypingEmitByRoom || new Map();
        const lastEmittedAt = Number(lastEmitMap.get(roomId) || 0);
        const typing = !!payload.typing;

        if (typing && now - lastEmittedAt < TYPING_EMIT_MIN_MS) {
          return;
        }
        lastEmitMap.set(roomId, now);
        socket.data.lastTypingEmitByRoom = lastEmitMap;

        const profile = socket.data.userProfile || {
          username: socket.user?.username,
          full_name: null,
        };

        socket.to(`room:${roomId}`).emit('typing', {
          room_id: roomId,
          user_id: uid,
          username: profile.username,
          full_name: profile.full_name,
          typing,
        });
      } catch (e) {
        console.error('typing relay error:', e?.message);
      }
    });

    socket.on('leave_room', (payload = {}) => {
      const roomId = toPositiveInt(payload.room_id);
      if (!roomId) return;
      socket.leave(`room:${roomId}`);
      socket.data.joinedRooms?.delete(roomId);
      socket.data.lastTypingEmitByRoom?.delete(roomId);
    });

    socket.on('disconnect', () => {
      socket.data.joinedRooms?.clear?.();
      socket.data.lastTypingEmitByRoom?.clear?.();
    });
  });
}

module.exports = { setupSocket };
