const fs = require('fs');
const path = 'backend/src/routes/payments.js';
let text = fs.readFileSync(path, 'utf8');
const startMarker = "      // รวมรายการบ้านจาก houses และ residents\r\n";
const endMarker = "      res.json({ ok: true, data });\r\n";
const start = text.indexOf(startMarker);
if (start === -1) {
  throw new Error('start marker not found');
}
const end = text.indexOf(endMarker, start);
if (end === -1) {
  throw new Error('end marker not found');
}
const after = end + endMarker.length;
const beforeText = text.slice(0, start);
const afterText = text.slice(after);
const newBlock = `      // รวมรายการบ้านจาก residents และ payments (ไม่พึ่ง houses)\r\n      const baseSql = ` +
  "`\r\n        SELECT house_number, owner_name FROM (\r\n          SELECT r.house_number,\r\n                 TRIM(CONCAT_WS(' ', NULLIF(r.title, ''), NULLIF(r.first_name, ''), NULLIF(r.last_name, ''))) AS owner_name\r\n            FROM residents r\r\n           WHERE r.house_number IS NOT NULL AND r.house_number <> ''\r\n          UNION\r\n          SELECT DISTINCT p.house_number, NULL AS owner_name\r\n            FROM payments p\r\n           WHERE p.house_number IS NOT NULL AND p.house_number <> ''\r\n        ) base\r\n      `" + `;\r\n      const [houseRows] = await pool.query(baseSql);\r\n\r\n      if (!houseRows.length) return res.json({ ok: true, data: [] });\r\n\r\n      const [agg] = await pool.query(` +
  "`\r\n        SELECT p.house_number,\r\n               MAX(p.created_at) AS last_paid_at,\r\n               MAX(CASE WHEN COALESCE(p.months, 0) > 0 AND DATE_ADD(p.created_at, INTERVAL COALESCE(p.months, 0) MONTH) > NOW() THEN 1 ELSE 0 END) AS covered,\r\n               COUNT(p.id) AS pay_count\r\n          FROM payments p\r\n         WHERE p.house_number IS NOT NULL AND p.house_number <> ''\r\n         GROUP BY p.house_number\r\n      `" + `);\r\n\r\n      const aggMap = new Map(agg.map(r => [String(r.house_number), r]));\r\n\r\n      const houseMap = new Map();\r\n      for (const row of houseRows) {\r\n        const hn = String(row?.house_number ?? '').trim();\r\n        if (!hn) continue;\r\n        const ownerNameRaw = typeof row?.owner_name === 'string' ? row.owner_name.trim() : '';\r\n        const existing = houseMap.get(hn);\r\n        if (!existing) {\r\n          houseMap.set(hn, {\r\n            houseNumber: hn,\r\n            ownerName: ownerNameRaw || null,\r\n          });\r\n        } else if (ownerNameRaw && !existing.ownerName) {\r\n          existing.ownerName = ownerNameRaw;\r\n        }\r\n      }\r\n\r\n      const data = Array.from(houseMap.values()).map(entry => {\r\n        const r = aggMap.get(entry.houseNumber) || {};\r\n        const covered = Number(r.covered || 0) === 1;\r\n        const payCount = Number(r.pay_count || 0);\r\n        let status = 'overdue';\r\n        if (covered) status = 'paid';\r\n        else if (payCount > 0) status = 'pending';\r\n        return {\r\n          houseNumber: entry.houseNumber,\r\n          ownerName: entry.ownerName ?? null,\r\n          status,\r\n        };\r\n      });\r\n      res.json({ ok: true, data });\r\n`;
text = beforeText + newBlock + afterText;
fs.writeFileSync(path, text);
