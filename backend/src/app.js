const express = require('express');
const cors = require('cors');
const path = require('path');
const { ensureDirs, UPLOAD_DIR, QR_DIR, PDF_DIR } = require('./config/paths');
const { registerAuthRoutes } = require('./routes/auth');
const { registerSlipOkRoutes } = require('./routes/slipok');
const { registerPromptPayRoutes } = require('./routes/promptpay');
const { registerAdminRoutes } = require('./routes/admin');
const { registerPdfRoutes } = require('./routes/pdf');
const { registerContactRoutes } = require('./routes/contacts');
const { registerAnnouncementRoutes } = require('./routes/announcements');
const { registerRepairRoutes } = require('./routes/repairs');
const { registerChatRoutes } = require('./routes/chat');
const { registerPaymentRoutes } = require('./routes/payments');
const { registerResidentRoutes } = require('./routes/residents');
const { registerSettingsRoutes } = require('./routes/settings');

function buildApp(io) {
  ensureDirs();
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // static
  app.use('/uploads', express.static(UPLOAD_DIR));
  app.use('/qrs', express.static(QR_DIR));
  app.use('/pdfs', express.static(PDF_DIR));

  // routes
  registerAuthRoutes(app);
  registerSlipOkRoutes(app);
  registerPromptPayRoutes(app);
  registerAdminRoutes(app);
  registerPdfRoutes(app);
  registerContactRoutes(app);
  registerAnnouncementRoutes(app);
  registerRepairRoutes(app);
  registerChatRoutes(app, io);
  registerPaymentRoutes(app);
  registerResidentRoutes(app);
  registerSettingsRoutes(app);

  return app;
}

module.exports = { buildApp };
