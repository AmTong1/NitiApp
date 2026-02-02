const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

// สร้าง key จาก JWT_SECRET (hash เป็น 32 bytes)
function getKey() {
  return crypto
    .createHash('sha256')
    .update(process.env.JWT_SECRET || 'default-secret')
    .digest();
}

// เข้ารหัส
function encrypt(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

// ถอดรหัส
function decrypt(data) {
  if (!data || !data.includes(':')) return data;
  try {
    const [ivB64, authTagB64, encrypted] = data.split(':');
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    console.error('Decrypt error:', e.message);
    return data; // Return original if decrypt fails
  }
}

module.exports = { encrypt, decrypt };
