function nowIso() { return new Date().toISOString(); }
function nowIso2() { return new Date().toISOString(); }
function rand3() { return Math.floor(100 + Math.random() * 900); } // 100..999
function isAdmin(user) { return user?.role === 'admin' || user?.role === 'superadmin'; }
function isSuperAdmin(user) { return user?.role === 'superadmin'; }

module.exports = { nowIso, nowIso2, rand3, isAdmin, isSuperAdmin };

