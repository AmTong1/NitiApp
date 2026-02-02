const jwt = require('jsonwebtoken');
const { ADMIN_KEY, JWT_SECRET } = require('../config/env');

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function decodeToken(raw) {
  return jwt.verify(raw, JWT_SECRET);
}

function authGuard(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) return res.status(401).json({ ok: false, error: 'NO_TOKEN' });
    const payload = decodeToken(token);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
  }
}

function adminAuth(req, res, next) {
  const key = req.header('x-admin-key');
  if (!key || key !== ADMIN_KEY) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  next();
}

function adminOnly(req, res, next) {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'superadmin')) {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
  }
  next();
}

function verifySocketToken(authHeader = '') {
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (!token) throw new Error('NO_TOKEN');
  return decodeToken(token);
}

module.exports = {
  authGuard,
  adminAuth,
  adminOnly,
  signToken,
  verifySocketToken,
};

