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
const { registerFinancialRoutes } = require('./routes/financial');

const STATIC_MEDIA_PREFIX_RE = /^\/(uploads|qrs|pdfs)\//i;
const MEDIA_EXT_RE = /\.(?:png|jpe?g|gif|webp|svg|bmp|ico|mp4|m4v|mov|webm|mkv|avi|3gp|mp3|wav|m4a|aac|ogg|pdf)(?:$|\?)/i;

function buildBrowser404Page() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>404 Page Not Found</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #ffffff;
      color: #111111;
      font-family: Arial, Helvetica, sans-serif;
      padding: 24px;
      box-sizing: border-box;
    }
    .box {
      text-align: center;
      width: 100%;
      max-width: 760px;
    }
    .badge {
      display: inline-block;
      padding: 8px 26px;
      border-radius: 999px;
      background: #ef2f36;
      color: #ffffff;
      border: 4px solid #111111;
      font-size: 46px;
      font-weight: 900;
      letter-spacing: 1px;
      line-height: 1;
      text-transform: uppercase;
    }
    .code {
      margin: 20px 0 8px;
      font-size: clamp(130px, 24vw, 260px);
      line-height: 0.9;
      font-weight: 900;
      color: #111111;
      letter-spacing: 2px;
    }
    .line {
      height: 12px;
      background: #111111;
      margin: 0 auto 12px;
      width: min(540px, 88vw);
      border-radius: 6px;
    }
    .label {
      font-size: clamp(34px, 6.2vw, 64px);
      line-height: 1;
      font-weight: 900;
      color: #111111;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="box">
    <div class="badge">Error</div>
    <div class="code">404</div>
    <div class="line"></div>
    <h1 class="label">Page Not Found</h1>
  </div>
</body>
</html>`;
}

function shouldBlockBrowserNavigation(req) {
  const pathWithQuery = String(req.originalUrl || req.url || req.path || '');
  const pathOnly = String(req.path || '');

  if (STATIC_MEDIA_PREFIX_RE.test(pathOnly)) return false;
  if (MEDIA_EXT_RE.test(pathWithQuery)) return false;

  const method = String(req.method || '').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return false;

  const secFetchMode = String(req.get('sec-fetch-mode') || '').toLowerCase();
  const secFetchDest = String(req.get('sec-fetch-dest') || '').toLowerCase();
  if (secFetchMode === 'navigate') return true;
  if (secFetchDest === 'document' || secFetchDest === 'iframe') return true;

  const accept = String(req.get('accept') || '').toLowerCase();
  const userAgent = String(req.get('user-agent') || '').toLowerCase();
  const asksHtml = accept.includes('text/html');
  const looksLikeBrowser = /(mozilla|chrome|safari|firefox|edg)/.test(userAgent);

  return asksHtml && looksLikeBrowser;
}

function buildApp(io) {
  ensureDirs();
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '20mb' }));

  app.use((req, res, next) => {
    if (!shouldBlockBrowserNavigation(req)) return next();
    res.status(404);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(buildBrowser404Page());
  });

  app.use((req, res, next) => {
    if (!/^\/(uploads|pdfs)\/.+/i.test(req.path)) return next();
    if (!req.path.endsWith('/')) return next();

    const cleanedPath = req.path.replace(/\/+$/, '');
    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    return res.redirect(301, `${cleanedPath}${query}`);
  });

  app.get('/pdf-viewer', (req, res) => {
    const rawFile = String(req.query.file || '').trim();
    if (!rawFile) {
      return res.status(400).send('Missing file path');
    }

    let targetPath = rawFile;
    try {
      targetPath = decodeURIComponent(targetPath);
    } catch {
      // Keep original value.
    }

    try {
      if (/^https?:\/\//i.test(targetPath)) {
        const parsed = new URL(targetPath);
        targetPath = `${parsed.pathname}${parsed.search}`;
      }
    } catch {
      // Ignore parse errors and validate below.
    }

    targetPath = targetPath.replace(/\/+$/, '');
    const isAllowedPdfPath = /^\/(uploads|pdfs)\/.+\.pdf(?:$|\?)/i.test(targetPath);
    if (!isAllowedPdfPath) {
      return res.status(400).send('Invalid PDF path');
    }

    const targetLiteral = JSON.stringify(targetPath);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(`<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>PDF Viewer</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: Arial, sans-serif; background: #0f1518; color: #ecf2ef; }
    .top { position: sticky; top: 0; z-index: 9; background: #122027; padding: 10px 12px; border-bottom: 1px solid #20343c; display: flex; align-items: center; gap: 8px; }
    .btn { border: 1px solid #35545f; background: #1a2f37; color: #e8f2ef; border-radius: 8px; height: 34px; padding: 0 12px; cursor: pointer; }
    .btn:disabled { opacity: 0.45; cursor: default; }
    .meta { margin-left: auto; font-size: 13px; color: #b5c7c1; }
    .status { padding: 10px 12px; font-size: 13px; color: #b8c9c3; }
    .wrap { display: flex; justify-content: center; padding: 8px 8px 16px; }
    canvas { background: #fff; border-radius: 8px; box-shadow: 0 4px 22px rgba(0,0,0,0.35); max-width: calc(100vw - 16px); }
    a { color: #7dc5ff; }
  </style>
</head>
<body>
  <div class="top">
    <button id="prev" class="btn">ก่อนหน้า</button>
    <button id="next" class="btn">ถัดไป</button>
    <span id="meta" class="meta">กำลังโหลด...</span>
  </div>
  <div id="status" class="status">กำลังเปิดเอกสาร PDF...</div>
  <div class="wrap"><canvas id="pdf-canvas"></canvas></div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <script>
    const filePath = ${targetLiteral};
    const statusEl = document.getElementById('status');
    const metaEl = document.getElementById('meta');
    const prevBtn = document.getElementById('prev');
    const nextBtn = document.getElementById('next');
    const canvas = document.getElementById('pdf-canvas');
    const ctx = canvas.getContext('2d', { alpha: false });

    let pdfDoc = null;
    let pageNum = 1;
    let totalPages = 0;
    let rendering = false;

    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    function updateControls() {
      prevBtn.disabled = pageNum <= 1 || rendering;
      nextBtn.disabled = pageNum >= totalPages || rendering;
      metaEl.textContent = totalPages > 0 ? ('หน้า ' + pageNum + '/' + totalPages) : 'กำลังโหลด...';
    }

    async function renderPage(num) {
      if (!pdfDoc) return;
      rendering = true;
      updateControls();
      try {
        const page = await pdfDoc.getPage(num);
        const base = page.getViewport({ scale: 1 });
        const maxWidth = Math.max(320, document.documentElement.clientWidth - 16);
        const scale = maxWidth / base.width;
        const viewport = page.getViewport({ scale });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        statusEl.textContent = '';
      } catch (err) {
        statusEl.innerHTML = 'ไม่สามารถแสดง PDF ได้ <a href="' + filePath + '">กดเปิดไฟล์โดยตรง</a>';
      } finally {
        rendering = false;
        updateControls();
      }
    }

    prevBtn.addEventListener('click', async () => {
      if (pageNum <= 1 || rendering) return;
      pageNum -= 1;
      await renderPage(pageNum);
    });

    nextBtn.addEventListener('click', async () => {
      if (pageNum >= totalPages || rendering) return;
      pageNum += 1;
      await renderPage(pageNum);
    });

    window.addEventListener('resize', () => {
      if (!pdfDoc || rendering) return;
      renderPage(pageNum).catch(() => {});
    });

    (async () => {
      try {
        const task = pdfjsLib.getDocument({ url: filePath, withCredentials: false });
        pdfDoc = await task.promise;
        totalPages = pdfDoc.numPages || 0;
        pageNum = 1;
        await renderPage(pageNum);
      } catch (err) {
        statusEl.innerHTML = 'เปิดพรีวิวไม่ได้ <a href="' + filePath + '">ลองเปิดไฟล์โดยตรง</a>';
        metaEl.textContent = 'โหลดไม่สำเร็จ';
        prevBtn.disabled = true;
        nextBtn.disabled = true;
      }
    })();
  </script>
</body>
</html>`);
  });

  const setInlinePdfHeaders = (res, filePath) => {
    if (path.extname(filePath).toLowerCase() !== '.pdf') return;
    const safeName = path.basename(filePath).replace(/["\r\n]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
  };

  // static
  app.use('/uploads', express.static(UPLOAD_DIR, { setHeaders: setInlinePdfHeaders }));
  app.use('/qrs', express.static(QR_DIR));
  app.use('/pdfs', express.static(PDF_DIR, { setHeaders: setInlinePdfHeaders }));

  // routes
  registerSettingsRoutes(app);
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
  registerFinancialRoutes(app);

  return app;
}

module.exports = { buildApp };
