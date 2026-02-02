const { pool } = require('../db/pool');
const { authGuard } = require('../middleware/auth');
const { encrypt, decrypt } = require('../utils/crypto');

// Keys that should be encrypted
const ENCRYPTED_KEYS = ['slipok_api', 'slipok_key', 'promptpay_id'];

// Default settings (from .env or hardcoded defaults)
const DEFAULT_SETTINGS = {
  rate_per_sqm: process.env.RATE_PER_SQM || '10.00',
  slipok_api: process.env.SLIPOK_API || '',
  slipok_key: process.env.SLIPOK_KEY || '',
  promptpay_id: process.env.PROMPTPAY_ID || '',
  qr_expiry_days: process.env.QR_RETENTION_DAYS || '3',
};

function registerSettingsRoutes(app) {
  // Ensure table exists and has default values
  (async () => {
    try {
      // Insert default settings if not exists
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        const isEncrypted = ENCRYPTED_KEYS.includes(key);
        const storedValue = isEncrypted ? encrypt(value) : value;
        
        await pool.query(`
          INSERT INTO system_settings (key, value, is_encrypted)
          VALUES ($1, $2, $3)
          ON CONFLICT (key) DO NOTHING
        `, [key, storedValue, isEncrypted]);
      }
    } catch (e) {
      console.error('Failed to init settings:', e.message);
    }
  })();

  // GET /settings - Get all settings (SuperAdmin only)
  app.get('/settings', authGuard, async (req, res) => {
    try {
      if (req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'SUPERADMIN_ONLY' });
      }

      const result = await pool.query('SELECT key, value, is_encrypted FROM system_settings');
      const rows = Array.isArray(result) ? result[0] : (result.rows || []);
      
      const settings = {};
      if (rows && Array.isArray(rows)) {
        for (const row of rows) {
          // Decrypt if encrypted
          if (row.is_encrypted) {
            settings[row.key] = decrypt(row.value);
          } else {
            settings[row.key] = row.value;
          }
        }
      }

      res.json(settings);
    } catch (e) {
      console.error('Get settings error:', e);
      res.status(500).json({ error: 'SETTINGS_FETCH_FAILED' });
    }
  });

  // PUT /settings - Update settings (SuperAdmin only)
  app.put('/settings', authGuard, async (req, res) => {
    try {
      if (req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'SUPERADMIN_ONLY' });
      }

      const { updateExisting, ...updates } = req.body || {};
      console.log('[Settings] Received updates:', updates, 'updateExisting:', updateExisting);
      const allowedKeys = Object.keys(DEFAULT_SETTINGS);

      for (const [key, value] of Object.entries(updates)) {
        if (!allowedKeys.includes(key)) continue;
        
        const isEncrypted = ENCRYPTED_KEYS.includes(key);
        const storedValue = isEncrypted ? encrypt(String(value)) : String(value);
        console.log(`[Settings] Saving ${key} = ${isEncrypted ? '[ENCRYPTED]' : storedValue}`);

        await pool.query(`
          INSERT INTO system_settings (key, value, is_encrypted, updated_at, updated_by)
          VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4)
          ON CONFLICT (key) DO UPDATE SET 
            value = EXCLUDED.value,
            is_encrypted = EXCLUDED.is_encrypted,
            updated_at = CURRENT_TIMESTAMP,
            updated_by = EXCLUDED.updated_by
        `, [key, storedValue, isEncrypted, req.user.id]);
      }

      // If updateExisting is true and rate_per_sqm changed, update all payments
      if (updateExisting && updates.rate_per_sqm) {
        const newRate = parseFloat(updates.rate_per_sqm);
        console.log(`[Settings] Updating all payments with new rate: ${newRate}`);
        
        // Update rate_per_sqm, amount_per_month, and total_amount for all payments
        await pool.query(`
          UPDATE payments 
          SET rate_per_sqm = $1,
              amount_per_month = area_sq_m * $1,
              total_amount = area_sq_m * $1 * months
        `, [newRate]);
        
        console.log('[Settings] All payments updated with new rate');
      }

      console.log('[Settings] All settings saved successfully');
      res.json({ success: true, message: 'Settings updated' });
    } catch (e) {
      console.error('Update settings error:', e);
      res.status(500).json({ error: 'SETTINGS_UPDATE_FAILED' });
    }
  });

  // Helper: Get a single setting value (for internal use)
  app.getSetting = async (key) => {
    try {
      const [rows] = await pool.query(
        'SELECT value, is_encrypted FROM system_settings WHERE key = $1',
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
