const fs = require('fs-extra');
const path = require('path');
const QRCode = require('qrcode');
const { HOST, PORT, QR_RETENTION_DAYS, ONE_DAY_MS } = require('../config/env');
const { QR_DIR } = require('../config/paths');

const QR_EXPIRE_MS = QR_RETENTION_DAYS * ONE_DAY_MS;

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return 'หมดอายุแล้ว';
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m ${secs.toString().padStart(2, '0')}s`;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
function nowIso() { return new Date().toISOString(); }

const qrCache = new Map(); // key => record
function isExpired(expiresAtIso) {
  const t = new Date(expiresAtIso).getTime();
  return !Number.isFinite(t) || Date.now() >= t;
}
function remainingMs(expiresAtIso) {
  const t = new Date(expiresAtIso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, t - Date.now());
}
async function createAndCacheQR(key, { amount, prefix, payload }) {
  const created = Date.now();
  const createdAt = new Date(created).toISOString();
  const expiresAt = new Date(created + QR_EXPIRE_MS).toISOString();
  const filename = `${prefix}-${created}.png`;
  const filePath = path.join(QR_DIR, filename);
  await QRCode.toFile(filePath, payload, { width: 512, margin: 1 });
  const url = `http://${HOST}:${PORT}/qrs/${filename}`;
  const record = { key, amount, payload, filename, url, createdAt, expiresAt };
  qrCache.set(key, record);
  return record;
}
function buildQrResponse(base, extra) {
  const ms = remainingMs(base.expiresAt);
  return {
    ...extra,
    url: base.url,
    filename: base.filename,
    createdAt: base.createdAt,
    expiresAt: base.expiresAt,
    serverNow: nowIso(),
    expiresInMs: ms,
    expiresInSec: Math.ceil(ms / 1000),
    countdownText: formatDuration(ms),
    retentionDays: QR_RETENTION_DAYS,
  };
}

async function cleanupQrDir() {
  try {
    const files = await fs.readdir(QR_DIR);
    const now = Date.now();
    await Promise.all(files.map(async (name) => {
      const full = path.join(QR_DIR, name);
      const st = await fs.stat(full);
      if (now - st.mtimeMs > QR_EXPIRE_MS) {
        await fs.remove(full);
      }
    }));
  } catch (e) {
    console.error('cleanup error:', e.message);
  }
}

function scheduleQrCleanup() {
  setInterval(cleanupQrDir, 60 * 60 * 1000);
}

module.exports = {
  QR_EXPIRE_MS,
  qrCache,
  isExpired,
  remainingMs,
  createAndCacheQR,
  buildQrResponse,
  cleanupQrDir,
  scheduleQrCleanup,
};

