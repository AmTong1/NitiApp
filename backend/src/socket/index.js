const { verifySocketToken } = require('../middleware/auth');
const { pool } = require('../db/pool');

function setupSocket(io) {
  io.use((socket, next) => {
    try {
      const token = socket.handshake.headers.authorization || '';
      socket.user = verifySocketToken(token);
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('join_room', ({ room_id }) => {
      if (!room_id) return;
      socket.join(`room:${room_id}`);
    });

    socket.on('typing', async ({ room_id, typing }) => {
      try {
        if (!room_id) return;
        const uid = socket.user?.id;
        if (!uid) return;

        const [rows] = await pool.query(
          'SELECT username, full_name FROM accounts WHERE id = $1 LIMIT 1',
          [uid]
        );
        const acc = rows[0];

        io.to(`room:${room_id}`).emit('typing', {
          room_id,
          user_id: uid,
          username: acc?.username,
          full_name: acc?.full_name,
          typing: !!typing,
        });
      } catch (e) {
        console.error('typing relay error:', e?.message);
      }
    });
  });
}

module.exports = { setupSocket };

