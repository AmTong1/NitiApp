const path = require('path');
const fs = require('fs-extra');
const multer = require('multer');
const axios = require('axios');
const sharp = require('sharp');
const FormData = require('form-data');
const { HOST, PORT, SLIPOK_API, SLIPOK_KEY, PROMPTPAY_ID } = require('../config/env');
const { UPLOAD_DIR, PROCESSED_DIR } = require('../config/paths');
const { pool } = require('../db/pool');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const fileFilter = (req, file, cb) => {
  if (/^image\/(jpeg|jpg|png|webp|heic|heif)$/i.test(file.mimetype)) cb(null, true);
  else cb(new Error('รองรับเฉพาะไฟล์รูป jpeg/png/webp/heic/heif'), false);
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

const normalize = (u) => String(u || '').replace(/\/+$/,'');
// ต้องเป็นรูปแบบ: https://api.slipok.com/api/line/apikey/{branchId}
const resolveSlipOkUrl = () => {
  const base = normalize(SLIPOK_API || '');
  if (/\/api\/line\/apikey\/\w+$/i.test(base)) return base;
  // เผื่อเผลอใส่ base แบบ /api เฉยๆ
  return `${normalize(base || 'https://api.slipok.com/api')}/line/apikey/${process.env.SLIPOK_BRANCH_ID || ''}`;
};

function registerSlipOkRoutes(app) {
  app.post('/upload-and-check', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ ok: false, message: 'ไม่ได้ส่งไฟล์มา' });
      if (!SLIPOK_KEY) return res.status(500).json({ ok: false, message: 'ยังไม่ได้ตั้ง SLIPOK_KEY' });

      // 1) บีบอัดภาพก่อนส่ง
      const originalPath = path.join(UPLOAD_DIR, req.file.filename);
      const baseName = path.parse(req.file.filename).name;
      const compressedName = `${baseName}-compressed.jpg`;
      const compressedPath = path.join(PROCESSED_DIR, compressedName);

      await sharp(originalPath)
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80, mozjpeg: true })
        .toFile(compressedPath);

      // 2) สร้าง multipart/form-data: field "files"
      const fd = new FormData();
      fd.append('files', fs.createReadStream(compressedPath), {
        filename: compressedName,
        contentType: 'image/jpeg',
      });
      fd.append('log', 'true');
      if (req.body?.amount) fd.append('amount', String(req.body.amount));

      const url = resolveSlipOkUrl();
      let resp;
      try {
        resp = await axios.post(url, fd, {
          headers: {
            ...fd.getHeaders(),
            'x-authorization': SLIPOK_KEY,
            Accept: 'application/json',
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 20000,
        });
      } catch (err) {
        const payload = err?.response?.data || {};
        // SlipOK: code 1012 = Duplicate slip
        if (payload?.code === 1012) {
          return res.status(409).json({
            ok: false,
            code: 'SLIP_DUPLICATE',
            message: 'สลิปซ้ำ กรุณาแจ้งเจ้าหน้าที่',
            provider: payload,
          });
        }
        // SlipOK: code 1011 = expired or no transaction
        if (payload?.code === 1011) {
          return res.status(400).json({
            ok: false,
            code: 'SLIP_EXPIRED_OR_NO_TXN',
            message: 'สลิปหมดอายุ หรือ ไม่มีรายการ',
            provider: payload,
          });
        }
        // SlipOK: code 1014 = invalid receiver account
        if (payload?.code === 1014) {
          return res.status(400).json({
            ok: false,
            code: 'INVALID_RECEIVER',
            message: 'บัญชีผู้รับไม่ถูกต้อง กรุณาติดต่อเจ้าหน้าที่',
            provider: payload,
          });
        }
        // SlipOK: code 1007 = No QR code in image
        if (payload?.code === 1007) {
          return res.status(400).json({
            ok: false,
            code: 'NO_QR_IN_IMAGE',
            message: 'รูปภาพไม่มี QR Code',
            provider: payload,
          });
        }
        // อื่นๆ ส่งต่อเป็น error ปกติ
        console.error('[slipok] error(post):', payload || err.message);
        return res.status(502).json({
          ok: false,
          message: 'ตรวจสลิปไม่สำเร็จ',
          error: payload || err.message,
        });
      }

      const originalUrl = `http://${HOST}:${PORT}/uploads/${req.file.filename}`;
      const compressedUrl = `http://${HOST}:${PORT}/uploads/repairs/${compressedName}`;

      // ===== ดึงค่าที่ต้องการ =====
      const payload = resp?.data || {};
      const d = payload?.data || {};
      const slipSuccess = payload?.success === true || d?.success === true;

      // อ่าน intentId ที่ส่งมาด้วย (multipart field: intentId หรือ intent_id)
      const intentId =
        Number(req.body?.intentId || req.body?.intent_id || req.query?.intentId || 0) || null;

      // amount บนสลิป (ถ้ามี) หรือจากฟอร์ม
       const amount =
         d?.amount != null && !Number.isNaN(Number(d.amount))
           ? Number(d.amount)
           : req.body?.amount != null && !Number.isNaN(Number(req.body.amount))
           ? Number(req.body.amount)
           : null;

       const qrcodeData =
         req.body?.qrcodeData ||
         d?.qrString ||
         d?.qrstring ||
         d?.qr_code ||
         d?.qr ||
         null;
       const sendingBank = d?.sendingBank || null;
       const transDate = d?.transDate || null;
       const transTime = d?.transTime || null;

      // ===== Validation เมื่อ success:true =====
      if (slipSuccess) {
        // 1) ตรวจจำนวนเงินตรงกับ payment_intents (ถ้าระบุ intentId)
        if (intentId) {
          const [rows] = await pool.query(
            'SELECT id, amount FROM payment_intents WHERE id = $1 LIMIT 1',
            [intentId]
          );
          const intent = Array.isArray(rows) && rows[0] ? rows[0] : null;
          if (!intent) {
            return res.status(404).json({
              ok: false,
              code: 'INTENT_NOT_FOUND',
              message: 'ไม่พบรายการชำระ กรุณาติดต่อเจ้าหน้าที่',
            });
          }
          if (amount != null && Number(amount).toFixed(2) !== Number(intent.amount).toFixed(2)) {
            return res.status(400).json({
              ok: false,
              code: 'AMOUNT_MISMATCH',
              message: 'จำนวนเงินไม่ถูกต้อง กรุณาติดต่อเจ้าหน้าที่',
              expected: Number(intent.amount),
              actual: Number(amount),
            });
          }
        }

        // 2) ตรวจเลขปลายทาง PromptPay จากสลิป (4 ตัวท้าย)
        const ppLast4 = String(PROMPTPAY_ID || '').replace(/\D/g, '').slice(-4);
        const recvVal = String(d?.receiver?.proxy?.value || '');
        const recvDigits = recvVal.replace(/\D/g, '');
        const recvLast4 = recvDigits.slice(-4);
        if (ppLast4 && recvLast4 && recvLast4 !== ppLast4) {
          return res.status(400).json({
            ok: false,
            code: 'DEST_MISMATCH',
            message: 'หมายเลขปลายทางไม่ถูกต้อง กรุณาติดต่อเจ้าหน้าที่',
            expectedLast4: ppLast4,
            actualLast4: recvLast4,
          });
        }
        if (ppLast4 && !recvLast4) {
          return res.status(400).json({
            ok: false,
            code: 'DEST_NOT_FOUND',
            message: 'ไม่พบหมายเลขปลายทางในสลิป กรุณาติดต่อเจ้าหน้าที่',
          });
        }
      }
      // ===== End Validation =====

      // เช็คซ้ำด้วย qrcodeData ก่อนบันทึก
      const qrKey = (qrcodeData || '').trim();
      if (qrKey) {
        try {
          const [dup] = await pool.query(
            `SELECT id, amount, sending_bank, trans_date, trans_time, created_at
             FROM slipok_verifications WHERE qrcode_data = $1 LIMIT 1`,
            [qrKey]
          );
          if (Array.isArray(dup) && dup.length > 0) {
            return res.status(409).json({
              ok: false,
              code: 'DUPLICATE_QRCODE_DATA',
              message: 'สลิปนี้เคยอัปโหลดแล้ว',
              duplicate: dup[0],
            });
          }
        } catch (e) {
          console.warn('[slipok] duplicate check error:', e.message);
        }
      }

      // บันทึกลง DB
      let insertedId = null;
      try {
        const [r] = await pool.query(
          `INSERT INTO slipok_verifications
             (amount, qrcode_data, sending_bank, trans_date, trans_time, raw_json)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [amount, qrcodeData, sendingBank, transDate, transTime, JSON.stringify(payload)]
        );
        insertedId = r?.[0]?.id || null;
      } catch (e) {
        console.error('[slipok] insert db error:', e.message);
      }

      return res.json({
        ok: true,
        message: 'อัปโหลด + ตรวจสลิป สำเร็จ',
        file: {
          original: { filename: req.file.filename, url: originalUrl },
          compressed: { filename: compressedName, url: compressedUrl },
        },
        slipok: resp?.data || null,
        saved: { id: insertedId, amount, qrcodeData, sendingBank, transDate, transTime },
      });
    } catch (err) {
      console.error('[slipok] upload-and-check error:', err.message);
      return res.status(500).json({ ok: false, message: 'เซิร์ฟเวอร์ผิดพลาด กรุณาลองใหม่อีกครั้ง' });
    }
  });
}

module.exports = { registerSlipOkRoutes, resolveSlipOkUrl };
