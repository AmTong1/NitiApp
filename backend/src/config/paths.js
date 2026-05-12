const path = require('path');
const fs = require('fs-extra');

// Resolve to backend root (one up from this file)
const ROOT_DIR = path.join(__dirname, '..', '..');
const UPLOAD_DIR = path.join(ROOT_DIR, 'uploads');
const DOCUMENT_UPLOAD_DIR = path.join(UPLOAD_DIR, 'documents');
const TEMP_PDF_CACHE_DIR = path.join(UPLOAD_DIR, 'temp_pdf');
const PROCESSED_DIR = path.join(UPLOAD_DIR, 'repairs');
const QR_DIR = path.join(ROOT_DIR, 'qrs');
const PDF_DIR = path.join(ROOT_DIR, 'pdfs');

function ensureDirs() {
  fs.ensureDirSync(UPLOAD_DIR);
  fs.ensureDirSync(DOCUMENT_UPLOAD_DIR);
  fs.ensureDirSync(TEMP_PDF_CACHE_DIR);
  fs.ensureDirSync(PROCESSED_DIR);
  fs.ensureDirSync(QR_DIR);
  fs.ensureDirSync(PDF_DIR);
}

module.exports = {
  ROOT_DIR,
  UPLOAD_DIR,
  DOCUMENT_UPLOAD_DIR,
  TEMP_PDF_CACHE_DIR,
  PROCESSED_DIR,
  QR_DIR,
  PDF_DIR,
  ensureDirs,
};

