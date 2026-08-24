/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const args = new Set(process.argv.slice(2));
const RESET = args.has('--reset');
const FORCE = args.has('--force');

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'upgit',
};

const SCALE = (process.env.SEED_SCALE || 'medium').toLowerCase();
const COUNT = {
  small: { houses: 20, announcements: 8, repairs: 20, financial: 60, messages: 150 },
  medium: { houses: 80, announcements: 14, repairs: 45, financial: 180, messages: 420 },
  large: { houses: 220, announcements: 30, repairs: 120, financial: 600, messages: 1500 },
}[SCALE] || { houses: 80, announcements: 14, repairs: 45, financial: 180, messages: 420 };

const TITLES = ['Mr.', 'Mrs.', 'Ms.', 'Dr.'];
const FIRST_NAMES = [
  'Somchai', 'Suda', 'Anan', 'Kanya', 'Niran', 'Nok', 'Chai', 'Malee', 'Virote', 'Ploy',
  'Krit', 'Maya', 'Napat', 'Pim', 'Arisa', 'Tawan', 'Nicha', 'Rin', 'Nat', 'Beam',
];
const LAST_NAMES = [
  'Prasert', 'Srisuk', 'Kijman', 'Wongsa', 'Chanthong', 'Klinmee', 'Saelim', 'Khamsa',
  'Chaiyaporn', 'Thanakit', 'Boonmee', 'Sangwan', 'Hongsakul', 'Raksakul', 'Sukprasert',
];
const REPAIR_TITLES = [
  'Water leak in bathroom',
  'Street light not working',
  'Broken gate remote',
  'Elevator noise',
  'Pool water issue',
  'Noise complaint',
  'Parking line repaint',
  'Lobby AC issue',
];
const ANNOUNCE_TITLES = [
  'Monthly maintenance reminder',
  'Water shutdown notice',
  'Fire drill schedule',
  'Community meeting',
  'Security update',
  'Gym maintenance window',
  'New visitor policy',
  'Pool cleaning schedule',
  'Garbage pickup change',
  'Internet service notice',
  'Parking sticker renewal',
  'Holiday office hours',
];
const CHAT_TEXTS = [
  'Hello everyone!',
  'Please check the notice board.',
  'Is the gym open today?',
  'Thanks for the update!',
  'Can someone help with a package?',
  'Meeting at 7 PM in the lobby.',
  'Reminder: pay by end of month.',
  'Maintenance will arrive tomorrow.',
  'Any updates on the elevator?',
  'Great job on the event!',
];

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sample(arr) {
  return arr[randInt(0, arr.length - 1)];
}

function sampleMany(arr, count) {
  const out = [];
  for (let i = 0; i < count; i += 1) out.push(sample(arr));
  return out;
}

function phoneNumber() {
  return `08${randInt(10000000, 99999999)}`;
}

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(date, months) {
  const d = new Date(date.getTime());
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
}

function toMysqlDateTime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function tableExists(conn, name) {
  const [rows] = await conn.query(
    'SELECT COUNT(1) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
    [name]
  );
  return Number(rows?.[0]?.c || 0) > 0;
}

async function runSchema(conn) {
  const schemaPath = path.join(__dirname, '..', 'schema.sql');
  if (!fs.existsSync(schemaPath)) return;
  const sql = fs.readFileSync(schemaPath, 'utf8');
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('--'));
  for (const stmt of statements) {
    await conn.query(stmt);
  }

  // Extra tables not in schema.sql
  await conn.query(`
    CREATE TABLE IF NOT EXISTS financial_records (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      type ENUM('income', 'expense') NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT NULL,
      date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by BIGINT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status ENUM('approved', 'waiting_add', 'waiting_delete', 'rejected') NOT NULL DEFAULT 'approved',
      INDEX idx_fin_records_type (type),
      INDEX idx_fin_records_date (date)
    )
  `);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS financial_visibility_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      action ENUM('show', 'hide') NOT NULL,
      requested_by BIGINT NOT NULL,
      status ENUM('approved', 'waiting_approval', 'rejected') NOT NULL DEFAULT 'waiting_approval',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      approved_by BIGINT NULL,
      approved_at TIMESTAMP NULL,
      INDEX idx_fin_vis_status (status)
    )
  `);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS repair_edit_logs (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      repair_id VARCHAR(32) NOT NULL,
      action VARCHAR(32) NOT NULL,
      changes JSON NULL,
      performed_by INTEGER NULL,
      performed_by_name VARCHAR(255) NULL,
      performed_by_role VARCHAR(32) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS announcement_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      action VARCHAR(32) NOT NULL,
      announcement_id INT,
      announcement_title TEXT,
      changes JSON,
      performed_by BIGINT,
      performed_by_name VARCHAR(255),
      performed_by_role VARCHAR(32),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Extra columns used in code
  try { await conn.query("ALTER TABLE residents ADD COLUMN deletion_status VARCHAR(32) NOT NULL DEFAULT 'active'"); } catch (e) {}
  try { await conn.query("ALTER TABLE residents ADD COLUMN deleted_at TIMESTAMP NULL"); } catch (e) {}
  try { await conn.query('ALTER TABLE payment_installments ADD COLUMN proof_image VARCHAR(255) NULL'); } catch (e) {}
  try { await conn.query('ALTER TABLE payment_installments ADD COLUMN paid_by VARCHAR(100) NULL'); } catch (e) {}
  try { await conn.query('ALTER TABLE payment_installments ADD COLUMN approved_by VARCHAR(100) NULL'); } catch (e) {}
}

async function truncateAll(conn) {
  const tables = [
    'chat_reactions',
    'chat_message_pins',
    'chat_room_admin_pins',
    'chat_room_pins',
    'chat_room_reads',
    'chat_messages',
    'chat_members',
    'chat_rooms',
    'repair_photos',
    'repair_edit_logs',
    'repairs',
    'contacts',
    'announcement_logs',
    'announcements',
    'slipok_verifications',
    'payment_intents',
    'payment_installments',
    'payments',
    'houses',
    'resident_logs',
    'residents',
    'financial_visibility_logs',
    'financial_records',
    'system_settings',
    'users',
    'accounts',
  ];

  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of tables) {
    if (await tableExists(conn, table)) {
      await conn.query(`TRUNCATE TABLE ${table}`);
    }
  }
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
}

async function counts(conn, tables) {
  const result = {};
  for (const table of tables) {
    if (!(await tableExists(conn, table))) {
      result[table] = 0;
      continue;
    }
    const [rows] = await conn.query(`SELECT COUNT(1) AS c FROM ${table}`);
    result[table] = Number(rows?.[0]?.c || 0);
  }
  return result;
}

function buildHouseNumber(idx) {
  const base = 100 + idx;
  if (idx % 10 === 0) return `${base}/${(idx % 3) + 1}`;
  return String(base);
}

async function main() {
  const conn = await mysql.createConnection(DB_CONFIG);
  await conn.query("SET time_zone = '+07:00'");
  await runSchema(conn);

  if (RESET) {
    await truncateAll(conn);
  }

  if (!FORCE && !RESET) {
    const existing = await counts(conn, ['accounts', 'residents', 'payments']);
    const hasData = Object.values(existing).some((c) => c > 0);
    if (hasData) {
      console.log('Data already exists. Use --reset to wipe or --force to append.');
      await conn.end();
      return;
    }
  }

  const passwordHash = await bcrypt.hash('Password123!', 10);

  // Accounts
  const accountRows = [];
  accountRows.push(['superadmin', passwordHash, 'System SuperAdmin', phoneNumber(), 'superadmin']);
  for (let i = 1; i <= 3; i += 1) {
    accountRows.push([`admin${i}`, passwordHash, `Admin ${i}`, phoneNumber(), 'admin']);
  }
  const userCount = COUNT.houses;
  for (let i = 1; i <= userCount; i += 1) {
    const username = `user${String(i).padStart(3, '0')}`;
    const fullName = `${sample(FIRST_NAMES)} ${sample(LAST_NAMES)}`;
    accountRows.push([username, passwordHash, fullName, phoneNumber(), 'user']);
  }
  await conn.query('INSERT IGNORE INTO accounts (username, password_hash, full_name, phone, role) VALUES ?', [accountRows]);

  const [accRows] = await conn.query('SELECT id, username, role FROM accounts');
  const accountByUsername = new Map(accRows.map((r) => [r.username, r]));
  const adminIds = accRows.filter((r) => r.role === 'admin' || r.role === 'superadmin').map((r) => r.id);

  // Users table (PromptPay user list)
  const userRows = [];
  for (let i = 1; i <= Math.min(20, userCount); i += 1) {
    userRows.push([`user${String(i).padStart(3, '0')}`, randInt(50, 300) * 1.0]);
  }
  await conn.query('INSERT IGNORE INTO users (id, amount) VALUES ?', [userRows]);

  // System settings
  await conn.query(
    'INSERT INTO system_settings (`key`, value, is_encrypted) VALUES ? ON DUPLICATE KEY UPDATE value = VALUES(value)',
    [[['rate_per_sqm', '12', 0], ['app_version', '1.0.4', 0]]]
  );

  // Houses + Residents
  const houseRows = [];
  const residentRows = [];
  const paymentRows = [];
  const now = new Date();

  for (let i = 1; i <= userCount; i += 1) {
    const houseNumber = buildHouseNumber(i);
    const ownerName = `${sample(FIRST_NAMES)} ${sample(LAST_NAMES)}`;
    const areaSqm = randInt(50, 200);
    const payMonths = sample([1, 3, 6, 12]);
    const ratePerSqm = 12;
    const amountPerMonth = Number((areaSqm * ratePerSqm).toFixed(2));
    const totalAmount = Number((amountPerMonth * 12).toFixed(2));

    houseRows.push([houseNumber, ownerName, areaSqm]);

    const title = sample(TITLES);
    const firstName = sample(FIRST_NAMES);
    const lastName = sample(LAST_NAMES);
    const phone = phoneNumber();
    const username = `user${String(i).padStart(3, '0')}`;
    const accountId = accountByUsername.get(username)?.id || null;
    const deletionStatus = i % 25 === 0 ? 'pending_deletion' : 'active';
    residentRows.push([houseNumber, title, firstName, lastName, phone, randInt(1, 4), randInt(0, 2), payMonths, accountId, deletionStatus]);

    paymentRows.push([houseNumber, areaSqm, ratePerSqm, payMonths, amountPerMonth, totalAmount, `Annual maintenance ${now.getFullYear()}`]);
  }

  await conn.query('INSERT IGNORE INTO houses (house_number, owner_name, area_sq_m) VALUES ?', [houseRows]);
  await conn.query('INSERT IGNORE INTO residents (house_number, title, first_name, last_name, phone, household_count, car_count, pay_months, account_id, deletion_status) VALUES ?', [residentRows]);

  const [houseIds] = await conn.query('SELECT id, house_number FROM houses');
  const houseIdMap = new Map(houseIds.map((r) => [r.house_number, r.id]));

  const paymentInsertRows = paymentRows.map((row) => {
    const houseId = houseIdMap.get(row[0]) || null;
    return [houseId, ...row];
  });
  await conn.query(
    'INSERT IGNORE INTO payments (house_id, house_number, area_sq_m, rate_per_sqm, months, amount_per_month, total_amount, note) VALUES ?',
    [paymentInsertRows]
  );

  const [payments] = await conn.query('SELECT id, house_number, months, amount_per_month FROM payments');

  // Payment installments + intents
  const installmentRows = [];
  const intentRows = [];
  const statusOptions = ['paid', 'pending', 'overdue', 'waiting_approval'];

  for (const payment of payments) {
    const monthsSpan = Number(payment.months || 1);
    const count = Math.max(1, Math.floor(12 / monthsSpan));
    const start = addMonths(new Date(), -randInt(3, 8));

    for (let i = 1; i <= count; i += 1) {
      const periodStart = addMonths(start, monthsSpan * (i - 1));
      const periodEnd = addDays(addMonths(start, monthsSpan * i), -1);
      const dueDate = addDays(periodEnd, 3);
      const amount = Number((Number(payment.amount_per_month) * monthsSpan).toFixed(2));

      let status = 'pending';
      const nowTime = now.getTime();
      const dueTime = dueDate.getTime();

      if (dueTime < nowTime - 7 * 24 * 60 * 60 * 1000) {
        status = Math.random() < 0.65 ? 'paid' : (Math.random() < 0.2 ? 'waiting_approval' : 'overdue');
      } else if (dueTime < nowTime + 10 * 24 * 60 * 60 * 1000) {
        status = Math.random() < 0.5 ? 'pending' : 'overdue';
      }

      const paidAt = status === 'paid' ? addDays(dueDate, randInt(-2, 2)) : null;
      const paidMethod = status === 'paid' || status === 'waiting_approval' ? sample(['cash', 'promptpay', 'bank_transfer']) : null;
      const paidNote = status === 'waiting_approval' ? 'Pending approval by admin' : null;
      const paidBy = status === 'paid' || status === 'waiting_approval' ? sample(['user', 'admin', 'system']) : null;
      const approvedBy = status === 'paid' ? sample(['admin1', 'superadmin']) : null;

      installmentRows.push([
        payment.id,
        payment.house_number,
        i,
        monthsSpan,
        toMysqlDateTime(dueDate),
        amount,
        status,
        paidAt ? toMysqlDateTime(paidAt) : null,
        periodStart.toISOString().slice(0, 10),
        periodEnd.toISOString().slice(0, 10),
        paidMethod,
        paidNote,
        null,
        paidBy,
        approvedBy,
      ]);

      if (status === 'pending' || status === 'waiting_approval') {
        intentRows.push([
          null,
          payment.id,
          payment.house_number,
          amount,
          'promptpay',
          status === 'waiting_approval' ? 'pending' : 'initiated',
          `QR-${payment.house_number}-${i}`,
        ]);
      }
    }
  }

  await conn.query(
    'INSERT IGNORE INTO payment_installments (payment_id, house_number, installment_no, months_span, due_date, amount, status, paid_at, period_start, period_end, paid_method, paid_note, proof_image, paid_by, approved_by) VALUES ?',
    [installmentRows]
  );

  if (intentRows.length) {
    await conn.query(
      'INSERT INTO payment_intents (installment_id, payment_id, house_number, amount, method, status, qr_id) VALUES ?',
      [intentRows]
    );
  }

  // Announcements + logs
  const announcementRows = [];
  const announcementLogRows = [];
  for (let i = 0; i < COUNT.announcements; i += 1) {
    const title = sample(ANNOUNCE_TITLES);
    const date = toMysqlDateTime(addDays(now, randInt(-20, 60))).slice(0, 10);
    const description = `Notice: ${title}.`;
    const important = Math.random() < 0.3 ? 1 : 0;
    const createdBy = sample(adminIds);
    announcementRows.push([title, date, null, description, important, createdBy, createdBy]);
  }
  await conn.query(
    'INSERT IGNORE INTO announcements (title, date, image, description, important, created_by, updated_by) VALUES ?',
    [announcementRows]
  );
  const [annRows] = await conn.query('SELECT id, title FROM announcements');
  for (const ann of annRows) {
    announcementLogRows.push(['create', ann.id, ann.title, null, sample(adminIds), 'System Admin', 'admin']);
  }
  await conn.query(
    'INSERT INTO announcement_logs (action, announcement_id, announcement_title, changes, performed_by, performed_by_name, performed_by_role) VALUES ?',
    [announcementLogRows]
  );

  // Contacts
  const contactRows = [
    ['Security Desk', '029999111'],
    ['Maintenance', '029999222'],
    ['Fire Dept', '199'],
    ['Medical Emergency', '1669'],
    ['Police', '191'],
    ['Water Works', '029999333'],
  ].map((c) => [...c, sample(adminIds), sample(adminIds)]);
  await conn.query('INSERT IGNORE INTO contacts (title, number, created_by, updated_by) VALUES ?', [contactRows]);

  // Financial records
  const finRows = [];
  for (let i = 0; i < COUNT.financial; i += 1) {
    const type = Math.random() < 0.55 ? 'expense' : 'income';
    const amount = randInt(500, 15000);
    const title = type === 'income' ? 'Facility income' : 'Maintenance expense';
    const description = type === 'income' ? 'Bank transfer' : 'Service invoice';
    const date = toMysqlDateTime(addDays(now, -randInt(0, 120)));
    const createdBy = sample(adminIds);
    const status = Math.random() < 0.12 ? 'waiting_add' : (Math.random() < 0.08 ? 'waiting_delete' : 'approved');
    finRows.push([type, amount, title, description, date, createdBy, status]);
  }
  await conn.query(
    'INSERT INTO financial_records (type, amount, title, description, date, created_by, status) VALUES ?',
    [finRows]
  );

  // Financial visibility logs
  const visRows = [
    ['hide', sample(adminIds), 'approved', sample(adminIds), toMysqlDateTime(addDays(now, -30))],
    ['show', sample(adminIds), 'approved', sample(adminIds), toMysqlDateTime(addDays(now, -10))],
    ['hide', sample(adminIds), 'waiting_approval', null, null],
  ];
  await conn.query(
    'INSERT INTO financial_visibility_logs (action, requested_by, status, approved_by, approved_at) VALUES ?',
    [visRows]
  );

  // Repairs + photos + logs
  const repairRows = [];
  const repairPhotoRows = [];
  const repairLogRows = [];
  for (let i = 0; i < COUNT.repairs; i += 1) {
    const id = `REP-${String(i + 1).padStart(4, '0')}`;
    const user = accountByUsername.get(`user${String(randInt(1, userCount)).padStart(3, '0')}`);
    const title = sample(REPAIR_TITLES);
    const detail = `Issue reported: ${title}`;
    const houseNumber = buildHouseNumber(randInt(1, userCount));
    const status = sample(['pending', 'in_progress', 'done']);
    const createdAt = toMysqlDateTime(addDays(now, -randInt(0, 90)));
    repairRows.push([id, user.id, title, detail, houseNumber, status, createdAt]);

    if (Math.random() < 0.5) {
      repairPhotoRows.push([id, `/uploads/repairs/${id}.jpg`]);
    }

    repairLogRows.push([id, 'create', JSON.stringify({ status: { old: null, new: status } }), user.id, user.username, 'user']);
  }
  await conn.query(
    'INSERT IGNORE INTO repairs (id, user_id, title, detail, house_number, status, created_at) VALUES ?',
    [repairRows]
  );
  if (repairPhotoRows.length) {
    await conn.query('INSERT INTO repair_photos (repair_id, url) VALUES ?', [repairPhotoRows]);
  }
  await conn.query(
    'INSERT INTO repair_edit_logs (repair_id, action, changes, performed_by, performed_by_name, performed_by_role) VALUES ?',
    [repairLogRows]
  );

  // Residents logs
  const residentLogRows = [];
  const [residentRowsDb] = await conn.query('SELECT id, house_number, first_name, last_name, deletion_status FROM residents');
  for (const res of residentRowsDb) {
    residentLogRows.push([
      'create',
      res.id,
      res.house_number,
      `${res.first_name} ${res.last_name}`,
      JSON.stringify({ house_number: { old: null, new: res.house_number } }),
      sample(adminIds),
      'System Admin',
      'admin',
    ]);
    if (res.deletion_status === 'pending_deletion') {
      residentLogRows.push([
        'delete',
        res.id,
        res.house_number,
        `${res.first_name} ${res.last_name}`,
        JSON.stringify({ deletion_status: { old: 'active', new: 'pending_deletion' } }),
        sample(adminIds),
        'System Admin',
        'admin',
      ]);
    }
  }
  await conn.query(
    'INSERT INTO resident_logs (action, resident_id, house_number, resident_name, changes, performed_by, performed_by_name, performed_by_role) VALUES ?',
    [residentLogRows]
  );

  // Chat rooms
  const roomRows = [
    ['Community', 'public', sample(adminIds)],
    ['Announcements', 'public', sample(adminIds)],
    ['Support Desk', 'public', sample(adminIds)],
  ];
  for (let i = 0; i < 12; i += 1) {
    roomRows.push([`DM-${i + 1}`, 'dm', null]);
  }
  await conn.query('INSERT IGNORE INTO chat_rooms (name, room_type, owner_id) VALUES ?', [roomRows]);
  const [roomRowsDb] = await conn.query('SELECT id, room_type FROM chat_rooms');

  // Chat members
  const memberRows = [];
  for (const room of roomRowsDb) {
    const memberCount = room.room_type === 'public' ? randInt(8, 20) : 2;
    const members = new Set();
    while (members.size < memberCount) {
      const userId = accountByUsername.get(`user${String(randInt(1, userCount)).padStart(3, '0')}`)?.id;
      if (userId) members.add(userId);
    }
    for (const uid of members) {
      memberRows.push([room.id, uid, Math.random() < 0.1 ? 'admin' : 'member']);
    }
  }
  await conn.query('INSERT IGNORE INTO chat_members (room_id, user_id, role) VALUES ?', [memberRows]);

  // Chat messages
  const [membersDb] = await conn.query('SELECT room_id, user_id FROM chat_members');
  const memberByRoom = new Map();
  for (const row of membersDb) {
    if (!memberByRoom.has(row.room_id)) memberByRoom.set(row.room_id, []);
    memberByRoom.get(row.room_id).push(row.user_id);
  }

  const messageRows = [];
  const messageCount = COUNT.messages;
  for (let i = 0; i < messageCount; i += 1) {
    const room = sample(roomRowsDb);
    const members = memberByRoom.get(room.id) || [];
    if (!members.length) continue;
    const userId = sample(members);
    const isFile = Math.random() < 0.12;
    const isImage = !isFile && Math.random() < 0.15;
    const msgType = isFile ? 'file' : isImage ? 'image' : 'text';
    const text = msgType === 'text' ? sample(CHAT_TEXTS) : null;
    const createdAt = toMysqlDateTime(addDays(now, -randInt(0, 45)));
    const fileUrl = msgType === 'file' ? '/uploads/documents/sample.pdf' : msgType === 'image' ? '/uploads/images/sample.jpg' : null;
    const fileName = msgType === 'file' ? 'sample.pdf' : msgType === 'image' ? 'sample.jpg' : null;
    const fileSize = msgType !== 'text' ? randInt(15000, 500000) : null;
    const mimeType = msgType === 'file' ? 'application/pdf' : msgType === 'image' ? 'image/jpeg' : null;
    messageRows.push([room.id, userId, text, msgType, fileUrl, fileName, fileSize, mimeType, createdAt]);
  }
  await conn.query(
    'INSERT INTO chat_messages (room_id, user_id, text, msg_type, file_url, file_name, file_size, mime_type, created_at) VALUES ?',
    [messageRows]
  );

  // Chat reads + pins + reactions
  const [msgRows] = await conn.query('SELECT id, room_id FROM chat_messages ORDER BY id ASC');
  const lastMsgByRoom = new Map();
  for (const msg of msgRows) {
    lastMsgByRoom.set(msg.room_id, msg.id);
  }

  const readRows = [];
  for (const row of membersDb) {
    const lastId = lastMsgByRoom.get(row.room_id) || null;
    readRows.push([row.room_id, row.user_id, lastId]);
  }
  await conn.query('INSERT IGNORE INTO chat_room_reads (room_id, user_id, last_read_message_id) VALUES ?', [readRows]);

  const pinRows = [];
  for (let i = 0; i < Math.min(20, msgRows.length); i += 1) {
    const msg = sample(msgRows);
    const members = memberByRoom.get(msg.room_id) || [];
    if (!members.length) continue;
    pinRows.push([msg.id, msg.room_id, sample(members)]);
  }
  if (pinRows.length) {
    await conn.query('INSERT IGNORE INTO chat_message_pins (message_id, room_id, user_id) VALUES ?', [pinRows]);
  }

  const reactionRows = [];
  const emojis = ['\uD83D\uDC4D', '\u2764\uFE0F', '\uD83D\uDE42', '\uD83D\uDE0A'];
  for (let i = 0; i < Math.min(60, msgRows.length); i += 1) {
    const msg = sample(msgRows);
    const members = memberByRoom.get(msg.room_id) || [];
    if (!members.length) continue;
    reactionRows.push([msg.id, sample(members), sample(emojis)]);
  }
  if (reactionRows.length) {
    await conn.query('INSERT IGNORE INTO chat_reactions (message_id, user_id, emoji) VALUES ?', [reactionRows]);
  }

  console.log('Seed completed:', {
    houses: COUNT.houses,
    announcements: COUNT.announcements,
    repairs: COUNT.repairs,
    financial: COUNT.financial,
    messages: COUNT.messages,
  });

  await conn.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exitCode = 1;
});
