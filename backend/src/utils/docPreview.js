const path = require('path');
const fs = require('fs-extra');
const mammoth = require('mammoth');
const puppeteer = require('puppeteer');
const { HEADLESS_MODE, PUPPETEER_EXECUTABLE_PATH } = require('../config/env');
const { UPLOAD_DIR, TEMP_PDF_CACHE_DIR } = require('../config/paths');

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const convertJobs = new Map();
let browserPromise = null;
let browserWarmupStarted = false;
let cleanupTimeout = null;
let cleanupInterval = null;

function decodeMaybe(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function normalizeUploadRelativePath(fileInput) {
  let raw = decodeMaybe(fileInput);
  if (!raw) return '';

  if (/^https?:\/\//i.test(raw)) {
    try {
      raw = new URL(raw).pathname;
    } catch {
    }
  }

  raw = raw.replace(/\\/g, '/').replace(/\/+$/, '');
  if (!raw) return '';

  if (raw.startsWith('/uploads/')) raw = raw.slice('/uploads/'.length);
  else if (raw.startsWith('uploads/')) raw = raw.slice('uploads/'.length);
  else if (raw.startsWith('/')) raw = raw.slice(1);

  const normalized = path.posix.normalize(raw);
  if (!normalized || normalized.startsWith('..')) return '';
  return normalized;
}

function isDocxRelativePath(relativePath) {
  return /\.docx$/i.test(String(relativePath || ''));
}

function toSafePreviewBase(relativePath) {
  return String(relativePath || '')
    .replace(/\.docx$/i, '')
    .replace(/[^a-zA-Z0-9/_-]/g, '_')
    .replace(/\/+/g, '__');
}

function toPreviewRelativePath(relativePath) {
  return `temp_pdf/${toSafePreviewBase(relativePath)}.pdf`;
}

function toPublicUploadUrl(relativePath) {
  return `/uploads/${String(relativePath || '').replace(/^\/+/, '')}`;
}

function getPreviewInfoFromRelativePath(relativePath) {
  const normalized = normalizeUploadRelativePath(relativePath);
  if (!normalized || !isDocxRelativePath(normalized)) return null;

  const sourceAbsPath = path.join(UPLOAD_DIR, normalized);
  const previewRelativePath = toPreviewRelativePath(normalized);
  const previewAbsPath = path.join(UPLOAD_DIR, previewRelativePath);

  return {
    sourceRelativePath: normalized,
    sourceAbsPath,
    sourceUrl: toPublicUploadUrl(normalized),
    previewRelativePath,
    previewAbsPath,
    previewUrl: toPublicUploadUrl(previewRelativePath),
  };
}

async function resolveUploadRelativePath(fileInput) {
  const normalized = normalizeUploadRelativePath(fileInput);
  if (!normalized) return null;

  const candidates = [];
  if (normalized.startsWith('uploads/')) {
    candidates.push(normalized.slice('uploads/'.length));
  } else {
    candidates.push(normalized);
  }

  if (!normalized.includes('/')) {
    candidates.push(`documents/${normalized}`);
  }

  const uniqueCandidates = Array.from(new Set(candidates));
  for (const candidate of uniqueCandidates) {
    const abs = path.join(UPLOAD_DIR, candidate);
    if (await fs.pathExists(abs)) return candidate;
  }

  return null;
}

async function getPdfBrowser() {
  if (!browserPromise) {
    const launchOptions = {
      headless: HEADLESS_MODE || 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    };
    if (PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = PUPPETEER_EXECUTABLE_PATH;
    }

    browserPromise = puppeteer.launch(launchOptions).catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildDocxHtml(contentHtml, sourceRelativePath) {
  const title = escapeHtml(path.basename(sourceRelativePath).replace(/\.docx$/i, ''));
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body {
      font-family: "TH Sarabun New", "Noto Sans Thai", Arial, sans-serif;
      font-size: 15px;
      line-height: 1.55;
      color: #1f2937;
      margin: 0;
      padding: 24px;
      background: #ffffff;
      word-wrap: break-word;
    }
    img, table {
      max-width: 100%;
    }
    table {
      border-collapse: collapse;
    }
    td, th {
      border: 1px solid #d1d5db;
      padding: 6px 8px;
    }
    p { margin: 0 0 8px; }
  </style>
</head>
<body>
${contentHtml || '<p></p>'}
</body>
</html>`;
}

async function convertDocxToPdf(previewInfo) {
  if (!previewInfo) return null;

  const sourceExists = await fs.pathExists(previewInfo.sourceAbsPath);
  if (!sourceExists) return null;

  const [sourceStat, existingPdfStat] = await Promise.all([
    fs.stat(previewInfo.sourceAbsPath),
    fs.pathExists(previewInfo.previewAbsPath).then(async (exists) => {
      if (!exists) return null;
      return fs.stat(previewInfo.previewAbsPath);
    }),
  ]);

  const canReuse = !!existingPdfStat
    && Number(existingPdfStat.size || 0) > 0
    && Number(existingPdfStat.mtimeMs || 0) >= Number(sourceStat.mtimeMs || 0);
  if (canReuse) return previewInfo;

  const docxResult = await mammoth.convertToHtml({ path: previewInfo.sourceAbsPath });
  const html = buildDocxHtml(docxResult?.value || '', previewInfo.sourceRelativePath);

  await fs.ensureDir(path.dirname(previewInfo.previewAbsPath));

  const browser = await getPdfBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1240, height: 1754 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: previewInfo.previewAbsPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '12mm',
        right: '10mm',
        bottom: '12mm',
        left: '10mm',
      },
    });
  } finally {
    await page.close().catch(() => {});
  }

  return previewInfo;
}

async function queueDocxPreviewConversion(sourceRelativePath, options = {}) {
  const waitForCompletion = !!options.waitForCompletion;
  const info = getPreviewInfoFromRelativePath(sourceRelativePath);
  if (!info) return null;

  const key = info.previewAbsPath;
  const existingJob = convertJobs.get(key);
  if (existingJob) {
    if (waitForCompletion) return existingJob;
    return info;
  }

  const job = (async () => {
    try {
      return await convertDocxToPdf(info);
    } catch (e) {
      console.warn('doc preview convert failed:', e?.message || e);
      return null;
    } finally {
      convertJobs.delete(key);
    }
  })();

  convertJobs.set(key, job);
  if (waitForCompletion) return job;
  job.catch(() => {});
  return info;
}

function scheduleDocxPreviewConversionFromUploadUrl(uploadUrl) {
  const relativePath = normalizeUploadRelativePath(uploadUrl);
  if (!relativePath || !isDocxRelativePath(relativePath)) return null;
  queueDocxPreviewConversion(relativePath, { waitForCompletion: false }).catch(() => {});
  return getPreviewInfoFromRelativePath(relativePath);
}

async function resolveDocxPreviewByInput(fileInput, options = {}) {
  const waitForCompletion = options.waitForCompletion !== false;
  const resolvedRelativePath = await resolveUploadRelativePath(fileInput);
  if (!resolvedRelativePath || !isDocxRelativePath(resolvedRelativePath)) return null;

  const info = getPreviewInfoFromRelativePath(resolvedRelativePath);
  if (!info) return null;

  const result = await queueDocxPreviewConversion(resolvedRelativePath, { waitForCompletion });
  if (!result) return null;

  const ready = await fs.pathExists(info.previewAbsPath);
  return ready ? info : null;
}

async function resolveOriginalDownloadByInput(fileInput) {
  const resolvedRelativePath = await resolveUploadRelativePath(fileInput);
  if (!resolvedRelativePath) return null;

  const sourceAbsPath = path.join(UPLOAD_DIR, resolvedRelativePath);
  const exists = await fs.pathExists(sourceAbsPath);
  if (!exists) return null;

  return {
    sourceRelativePath: resolvedRelativePath,
    sourceAbsPath,
    sourceFileName: path.basename(resolvedRelativePath),
    sourceUrl: toPublicUploadUrl(resolvedRelativePath),
  };
}

async function cleanupTempPdfOlderThan(maxAgeMs = ONE_DAY_MS) {
  await fs.ensureDir(TEMP_PDF_CACHE_DIR);

  const now = Date.now();
  const files = await fs.readdir(TEMP_PDF_CACHE_DIR);
  let removed = 0;

  for (const fileName of files) {
    if (!/\.pdf$/i.test(fileName)) continue;
    const abs = path.join(TEMP_PDF_CACHE_DIR, fileName);

    let st;
    try {
      st = await fs.stat(abs);
    } catch {
      continue;
    }

    if (!st.isFile()) continue;
    if (now - Number(st.mtimeMs || 0) < maxAgeMs) continue;

    await fs.remove(abs).catch(() => {});
    removed += 1;
  }

  return removed;
}

function msUntilNextMidnight() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return Math.max(1000, next.getTime() - now.getTime());
}

function startTempPdfCleanupScheduler() {
  if (!browserWarmupStarted) {
    browserWarmupStarted = true;
    setTimeout(() => {
      getPdfBrowser().catch((e) => {
        console.warn('doc preview browser warmup failed:', e?.message || e);
      });
    }, 1000);
  }

  if (cleanupTimeout || cleanupInterval) return;

  cleanupTempPdfOlderThan().catch((e) => {
    console.warn('temp pdf initial cleanup failed:', e?.message || e);
  });

  cleanupTimeout = setTimeout(() => {
    cleanupTimeout = null;
    cleanupTempPdfOlderThan().catch((e) => {
      console.warn('temp pdf midnight cleanup failed:', e?.message || e);
    });

    cleanupInterval = setInterval(() => {
      cleanupTempPdfOlderThan().catch((e) => {
        console.warn('temp pdf scheduled cleanup failed:', e?.message || e);
      });
    }, ONE_DAY_MS);
  }, msUntilNextMidnight());
}

module.exports = {
  normalizeUploadRelativePath,
  isDocxRelativePath,
  scheduleDocxPreviewConversionFromUploadUrl,
  resolveDocxPreviewByInput,
  resolveOriginalDownloadByInput,
  startTempPdfCleanupScheduler,
};
