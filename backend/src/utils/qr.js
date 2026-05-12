const path = require('path');
const fs = require('fs-extra');
const QRCode = require('qrcode');
const { HOST, PORT } = require('../config/env');
const { QR_DIR } = require('../config/paths');

const qrCache = new Map(); // key => record
const QR_EXPIRY_MINUTES = 15;
const QR_EXPIRY_MS = QR_EXPIRY_MINUTES * 60 * 1000;

function isQrExpired(record, nowMs = Date.now()) {
  if (!record) return true;
  const expiresAtMs = Number(record.expiresAtMs || 0);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= 0) return true;
  return nowMs >= expiresAtMs;
}

async function removeQrFile(filename) {
  if (!filename) return;
  const safeName = path.basename(String(filename));
  const filePath = path.join(QR_DIR, safeName);
  try {
    await fs.remove(filePath);
  } catch (e) {
    console.warn('[qr] remove file failed:', e.message);
  }
}

async function removeCachedQR(key) {
  const existing = qrCache.get(key);
  if (!existing) return false;
  qrCache.delete(key);
  await removeQrFile(existing.filename);
  return true;
}

async function removeCachedQRByFilename(filename) {
  const safeName = path.basename(String(filename || ''));
  if (!safeName) return false;

  let removedAny = false;
  for (const [key, record] of qrCache.entries()) {
    if (String(record?.filename || '') === safeName) {
      qrCache.delete(key);
      removedAny = true;
    }
  }

  await removeQrFile(safeName);
  return removedAny;
}

async function purgeExpiredQRCodes() {
  const nowMs = Date.now();
  const tasks = [];
  for (const [key, record] of qrCache.entries()) {
    if (isQrExpired(record, nowMs)) {
      tasks.push(removeCachedQR(key));
    }
  }
  if (tasks.length > 0) {
    await Promise.allSettled(tasks);
  }
  return tasks.length;
}

async function createAndCacheQR(key, { amount, prefix, payload }) {
  await removeCachedQR(key);

  const createdAtMs = Date.now();
  const expiresAtMs = createdAtMs + QR_EXPIRY_MS;
  const filename = `${prefix}-${Date.now()}.png`;
  const filePath = path.join(QR_DIR, filename);
  await QRCode.toFile(filePath, payload, { width: 512, margin: 1 });
  const url = `http://${HOST}:${PORT}/qrs/${filename}`;
  const record = { key, amount, payload, filename, url, createdAtMs, expiresAtMs };
  qrCache.set(key, record);
  return record;
}

function buildQrResponse(base, extra) {
  const nowMs = Date.now();
  const expiresInSec = Math.max(0, Math.floor((Number(base.expiresAtMs || 0) - nowMs) / 1000));
  return {
    ...extra,
    url: base.url,
    filename: base.filename,
    createdAt: Number(base.createdAtMs || 0) > 0 ? new Date(base.createdAtMs).toISOString() : null,
    expiresAt: Number(base.expiresAtMs || 0) > 0 ? new Date(base.expiresAtMs).toISOString() : null,
    expiresInSeconds: expiresInSec,
  };
}

module.exports = {
  qrCache,
  QR_EXPIRY_MINUTES,
  QR_EXPIRY_MS,
  isQrExpired,
  removeQrFile,
  removeCachedQR,
  removeCachedQRByFilename,
  purgeExpiredQRCodes,
  createAndCacheQR,
  buildQrResponse,
};
