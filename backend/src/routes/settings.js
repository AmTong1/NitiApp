const { pool } = require('../db/pool');
const { authGuard } = require('../middleware/auth');
const { encrypt, decrypt } = require('../utils/crypto');

const ENCRYPTED_KEYS = ['slip2go_api', 'slip2go_secret', 'slipok_api', 'slipok_key', 'promptpay_id'];

const DEFAULT_SETTINGS = {
  rate_per_sqm: process.env.RATE_PER_SQM || '10.00',
  slip2go_api: process.env.SLIP2GO_API || process.env.SLIPOK_API || '',
  slip2go_secret: process.env.SLIP2GO_SECRET || process.env.SLIPOK_KEY || '',
  slipok_api: process.env.SLIPOK_API || '',
  slipok_key: process.env.SLIPOK_KEY || '',
  promptpay_id: process.env.PROMPTPAY_ID || '',
  receiver_name: process.env.RECEIVER_NAME || '',
  qr_expiry_days: process.env.QR_RETENTION_DAYS || '3',
  installment_rollover_before_days: process.env.INSTALLMENT_ROLLOVER_BEFORE_DAYS || '0',
};

let settingsTableReady = false;

async function ensureSettingsTable() {
  if (settingsTableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      \`key\` VARCHAR(64) PRIMARY KEY,
      value TEXT NOT NULL,
      is_encrypted BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      updated_by BIGINT NULL
    )
  `);
  settingsTableReady = true;
}

function registerSettingsRoutes(app) {
  (async () => {
    try {
      await ensureSettingsTable();

      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        const isEncrypted = ENCRYPTED_KEYS.includes(key);
        const storedValue = isEncrypted ? encrypt(value) : value;
        
        await pool.query(
          'INSERT IGNORE INTO system_settings (`key`, value, is_encrypted) VALUES (?, ?, ?)',
          [key, storedValue, isEncrypted]
        );
      }
    } catch (e) {
      console.error('Failed to init settings:', e.message);
    }
  })();

  app.get('/settings', authGuard, async (req, res) => {
    try {
      await ensureSettingsTable();

      if (req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'SUPERADMIN_ONLY' });
      }

      const [rows] = await pool.query('SELECT `key`, value, is_encrypted FROM system_settings');
      
      const settings = {};
      if (rows && Array.isArray(rows)) {
        for (const row of rows) {
          if (row.is_encrypted) {
            settings[row.key] = decrypt(row.value);
          } else {
            settings[row.key] = row.value;
          }
        }
      }

      if (!settings.slip2go_api && settings.slipok_api) {
        settings.slip2go_api = settings.slipok_api;
      }
      if (!settings.slip2go_secret && settings.slipok_key) {
        settings.slip2go_secret = settings.slipok_key;
      }

      res.json(settings);
    } catch (e) {
      console.error('Get settings error:', e);
      res.status(500).json({ error: 'SETTINGS_FETCH_FAILED' });
    }
  });

  app.put('/settings', authGuard, async (req, res) => {
    try {
      await ensureSettingsTable();

      if (req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'SUPERADMIN_ONLY' });
      }

      const { update_all_payments: updateExisting, ...updates } = req.body || {};
      console.log('[Settings] Received updates:', updates, 'updateExisting:', updateExisting);
      const allowedKeys = Object.keys(DEFAULT_SETTINGS);

      if (Object.prototype.hasOwnProperty.call(updates, 'slip2go_api')
        && !Object.prototype.hasOwnProperty.call(updates, 'slipok_api')) {
        updates.slipok_api = updates.slip2go_api;
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'slip2go_secret')
        && !Object.prototype.hasOwnProperty.call(updates, 'slipok_key')) {
        updates.slipok_key = updates.slip2go_secret;
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'slipok_api')
        && !Object.prototype.hasOwnProperty.call(updates, 'slip2go_api')) {
        updates.slip2go_api = updates.slipok_api;
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'slipok_key')
        && !Object.prototype.hasOwnProperty.call(updates, 'slip2go_secret')) {
        updates.slip2go_secret = updates.slipok_key;
      }

      if (Object.prototype.hasOwnProperty.call(updates, 'promptpay_id')) {
        const promptpay = String(updates.promptpay_id || '').trim();
        if (!/^\d{10}$/.test(promptpay)) {
          return res.status(400).json({
            error: 'INVALID_PROMPTPAY_ID',
            message: 'PromptPay ID must be exactly 10 digits',
          });
        }
        updates.promptpay_id = promptpay;
      }

      if (Object.prototype.hasOwnProperty.call(updates, 'installment_rollover_before_days')) {
        const raw = String(updates.installment_rollover_before_days ?? '').trim();
        if (!/^\d+$/.test(raw)) {
          return res.status(400).json({
            error: 'INVALID_ROLLOVER_DAYS',
            message: 'installment_rollover_before_days must be a non-negative integer',
          });
        }
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 0 || n > 365) {
          return res.status(400).json({
            error: 'INVALID_ROLLOVER_DAYS_RANGE',
            message: 'installment_rollover_before_days must be between 0 and 365',
          });
        }
        updates.installment_rollover_before_days = String(n);
      }

      for (const [key, value] of Object.entries(updates)) {
        if (!allowedKeys.includes(key)) continue;
        
        const isEncrypted = ENCRYPTED_KEYS.includes(key);
        const storedValue = isEncrypted ? encrypt(String(value)) : String(value);
        console.log(`[Settings] Saving ${key} = ${isEncrypted ? '[ENCRYPTED]' : storedValue}`);

        await pool.query(
          'INSERT INTO system_settings (`key`, value, is_encrypted, updated_at, updated_by) ' +
          'VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?) ' +
          'ON DUPLICATE KEY UPDATE ' +
          'value = VALUES(value), ' +
          'is_encrypted = VALUES(is_encrypted), ' +
          'updated_at = CURRENT_TIMESTAMP, ' +
          'updated_by = VALUES(updated_by)',
          [key, storedValue, isEncrypted, req.user.id]
        );
      }

      if (updateExisting && updates.rate_per_sqm) {
        const newRate = parseFloat(updates.rate_per_sqm);
        console.log(`[Settings] Updating all payments with new rate: ${newRate}`);
        
        await pool.query(
          'UPDATE payments ' +
          'SET rate_per_sqm = ?, ' +
          'amount_per_month = area_sq_m * ?, ' +
          'total_amount = area_sq_m * ? * months',
          [newRate, newRate, newRate]
        );
        
        await pool.query(
          `UPDATE payment_installments pi
           JOIN payments p ON pi.payment_id = p.id
           LEFT JOIN discount_configs dc ON dc.cycle_months = pi.months_span AND dc.enabled = TRUE
           SET pi.original_amount = p.amount_per_month * pi.months_span,
               pi.amount = CASE
                 WHEN dc.id IS NOT NULL AND dc.discount_type = 'percentage' THEN ROUND(p.amount_per_month * pi.months_span * (1 - dc.discount_value / 100), 2)
                 WHEN dc.id IS NOT NULL AND dc.discount_type = 'fixed' THEN GREATEST(0, ROUND(p.amount_per_month * pi.months_span - dc.discount_value, 2))
                 ELSE p.amount_per_month * pi.months_span
               END,
               pi.discount_amount = CASE
                 WHEN dc.id IS NOT NULL THEN ROUND(p.amount_per_month * pi.months_span - CASE
                   WHEN dc.discount_type = 'percentage' THEN ROUND(p.amount_per_month * pi.months_span * (1 - dc.discount_value / 100), 2)
                   WHEN dc.discount_type = 'fixed' THEN GREATEST(0, ROUND(p.amount_per_month * pi.months_span - dc.discount_value, 2))
                   ELSE p.amount_per_month * pi.months_span
                 END, 2)
                 ELSE 0
               END
           WHERE pi.status NOT IN ('paid', 'waiting_approval')`
        );
        
        console.log('[Settings] All payments and pending installments updated with new rate (with discounts)');
      }

      console.log('[Settings] All settings saved successfully');
      res.json({ success: true, message: 'Settings updated' });
    } catch (e) {
      console.error('Update settings error:', e);
      res.status(500).json({ error: 'SETTINGS_UPDATE_FAILED' });
    }
  });

  app.getSetting = async (key) => {
    try {
      await ensureSettingsTable();

      const [rows] = await pool.query(
        'SELECT value, is_encrypted FROM system_settings WHERE `key` = ?',
        [key]
      );
      if (!rows.length) return DEFAULT_SETTINGS[key] || null;
      
      const row = rows[0];
      return row.is_encrypted ? decrypt(row.value) : row.value;
    } catch (e) {
      console.error('Get setting error:', e);
      return DEFAULT_SETTINGS[key] || null;
    }
  };
}

module.exports = { registerSettingsRoutes };
