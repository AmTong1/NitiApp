function nowIso() { return new Date().toISOString(); }
function nowIso2() { return new Date().toISOString(); }
function rand3() { return Math.floor(100 + Math.random() * 900); }
function randRepairId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const c1 = chars.charAt(Math.floor(Math.random() * chars.length));
  const c2 = chars.charAt(Math.floor(Math.random() * chars.length));
  const num = Math.floor(100 + Math.random() * 900);
  return `${c1}${num}${c2}`;
}
function isAdmin(user) { return user?.role === 'admin' || user?.role === 'superadmin'; }
function isSuperAdmin(user) { return user?.role === 'superadmin'; }

module.exports = { nowIso, nowIso2, rand3, randRepairId, isAdmin, isSuperAdmin };
