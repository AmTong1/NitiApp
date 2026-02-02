const path = require('path');
const fs = require('fs-extra');

// Resolve to backend root (one up from this file)
const ROOT_DIR = path.join(__dirname, '..', '..');
const UPLOAD_DIR = path.join(ROOT_DIR, 'uploads');
const PROCESSED_DIR = path.join(UPLOAD_DIR, 'repairs');
const QR_DIR = path.join(ROOT_DIR, 'qrs');
const PDF_DIR = path.join(ROOT_DIR, 'pdfs');

function ensureDirs() {
  fs.ensureDirSync(UPLOAD_DIR);
  fs.ensureDirSync(PROCESSED_DIR);
  fs.ensureDirSync(QR_DIR);
  fs.ensureDirSync(PDF_DIR);
}

module.exports = {
  ROOT_DIR,
  UPLOAD_DIR,
  PROCESSED_DIR,
  QR_DIR,
  PDF_DIR,
  ensureDirs,
};

