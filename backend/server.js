const http = require('http');
const { Server } = require('socket.io');

// Load env/config early
require('dotenv').config();
const { HOST, PORT } = require('./src/config/env');
const { buildApp } = require('./src/app');
const { setupSocket } = require('./src/socket');
const { scheduleQrCleanup } = require('./src/utils/qr');
const { initDatabase } = require('./src/db/initDb');

// Initialize database and start server
(async () => {
  // Auto-create database and tables if they don't exist
  await initDatabase();

  // Create app + server + socket.io
  const io = new Server({
    cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }
  });
  const app = buildApp(io);
  const server = http.createServer(app);
  io.attach(server);

  // Socket handlers
  setupSocket(io);

  // Background jobs
  scheduleQrCleanup();

  // Start server
  server.listen(PORT, () => {
    console.log(`Backend running at http://${HOST}:${PORT}`);
  });
})();
