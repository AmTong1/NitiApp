-- MySQL schema for the system
-- Safe to run multiple times (IF NOT EXISTS used where possible)

-- Accounts (auth)
CREATE TABLE IF NOT EXISTS accounts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NULL,
  phone VARCHAR(30) NULL,
  role ENUM('user', 'admin', 'superadmin') NOT NULL DEFAULT 'user',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Users (PromptPay amounts per userId)
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
);

-- Residents / Houses / Payments
CREATE TABLE IF NOT EXISTS residents (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  house_number VARCHAR(32) NOT NULL UNIQUE,
  title VARCHAR(16) NULL,
  first_name VARCHAR(128) NOT NULL,
  last_name VARCHAR(128) NULL,
  phone VARCHAR(32) NULL,
  household_count INT NOT NULL DEFAULT 1,
  car_count INT NOT NULL DEFAULT 0,
  pay_months INT NULL,
  account_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS houses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  house_number VARCHAR(32) NOT NULL UNIQUE,
  owner_name VARCHAR(128) NULL,
  area_sq_m DECIMAL(10,2) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ตารางสรุปสถานะการชำระของบ้าน (1 แถว/บ้าน)
CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  house_id INT NULL,
  house_number VARCHAR(32) NOT NULL UNIQUE,
  area_sq_m DECIMAL(10,2) NULL,
  rate_per_sqm DECIMAL(10,2) NOT NULL DEFAULT 10.00,
  months INT NOT NULL DEFAULT 0,
  amount_per_month DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  note VARCHAR(255) NULL,
  cover_until TIMESTAMP NULL,
  pay_status ENUM('paid', 'pending', 'overdue', 'waiting_approval') NOT NULL DEFAULT 'overdue',
  remaining_days INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE CASCADE,
  INDEX idx_pay_house_id (house_id),
  INDEX idx_pay_status (pay_status, cover_until)
);

-- ตารางงวดการจ่าย (สร้างจาก payments)
CREATE TABLE IF NOT EXISTS payment_installments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  payment_id INT NOT NULL,
  house_number VARCHAR(32) NOT NULL,
  installment_no INT NOT NULL,
  months_span INT NOT NULL,
  due_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  amount DECIMAL(12,2) NOT NULL,
  status ENUM('paid', 'pending', 'overdue', 'waiting_approval') NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMP NULL,
  period_start DATE NULL,
  period_end DATE NULL,
  paid_method ENUM('cash', 'promptpay', 'bank_transfer') NULL,
  paid_note VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (payment_id, installment_no),
  FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE,
  INDEX idx_installment_payment (payment_id),
  INDEX idx_installment_house (house_number),
  INDEX idx_installment_status (status),
  INDEX idx_installment_house_status (house_number, status)
);

-- Intent ของการชำระด้วย QR/ช่องทางอื่น
CREATE TABLE IF NOT EXISTS payment_intents (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  installment_id BIGINT NULL,
  payment_id INT NULL,
  house_number VARCHAR(32) NULL,
  amount DECIMAL(12,2) NOT NULL,
  method ENUM('cash', 'promptpay', 'bank_transfer') NOT NULL DEFAULT 'promptpay',
  status ENUM('initiated', 'pending', 'confirmed', 'failed', 'expired') NOT NULL DEFAULT 'initiated',
  qr_id VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (installment_id) REFERENCES payment_installments(id) ON DELETE SET NULL,
  INDEX idx_intent_installment (installment_id),
  INDEX idx_intent_payment (payment_id),
  INDEX idx_intent_house (house_number),
  INDEX idx_intent_status (status),
  INDEX idx_intent_created (created_at)
);

-- ผลตรวจสลิปจาก SlipOK
CREATE TABLE IF NOT EXISTS slipok_verifications (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  amount DECIMAL(12,2) NULL,
  qrcode_data TEXT NULL,
  sending_bank VARCHAR(128) NULL,
  sender_name VARCHAR(255) NULL,
  trans_date CHAR(8) NULL,
  trans_time CHAR(8) NULL,
  slip_datetime DATETIME NULL,
  paid_at DATETIME NULL,
  raw_json TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE INDEX uq_qrcode_data (qrcode_data(255)),
  INDEX idx_trans_date (trans_date),
  INDEX idx_sending_bank (sending_bank)
);

-- Announcements
CREATE TABLE IF NOT EXISTS announcements (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  date VARCHAR(32) NOT NULL,
  image VARCHAR(1024) NULL,
  description TEXT NULL,
  important BOOLEAN NOT NULL DEFAULT FALSE,
  created_by BIGINT NULL,
  updated_by BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL,
  FOREIGN KEY (created_by) REFERENCES accounts(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES accounts(id) ON DELETE SET NULL,
  INDEX idx_announce_imp_id (important, id)
);

CREATE TABLE IF NOT EXISTS contacts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  number VARCHAR(64) NOT NULL,
  created_by BIGINT NULL,
  updated_by BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL,
  FOREIGN KEY (created_by) REFERENCES accounts(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES accounts(id) ON DELETE SET NULL,
  INDEX idx_contacts_title (title)
);

-- Repairs
CREATE TABLE IF NOT EXISTS repairs (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  title VARCHAR(255) NOT NULL,
  detail TEXT NULL,
  house_number VARCHAR(32) NULL,
  status ENUM('pending', 'in_progress', 'done') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  INDEX idx_repairs_user (user_id),
  INDEX idx_repairs_created (created_at),
  INDEX idx_repairs_house (house_number)
);

CREATE TABLE IF NOT EXISTS repair_photos (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  repair_id VARCHAR(32) NOT NULL,
  url VARCHAR(1024) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (repair_id) REFERENCES repairs(id) ON DELETE CASCADE,
  INDEX idx_repair_photos_repair (repair_id)
);

-- Chat
CREATE TABLE IF NOT EXISTS chat_rooms (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  room_type ENUM('public', 'dm') NOT NULL,
  owner_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES accounts(id) ON DELETE SET NULL,
  INDEX idx_chat_rooms_type (room_type)
);

CREATE TABLE IF NOT EXISTS chat_members (
  room_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  role ENUM('member', 'admin') NOT NULL DEFAULT 'member',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (room_id, user_id),
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES accounts(id) ON DELETE CASCADE,
  INDEX idx_chat_members_user (user_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  room_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  text TEXT NULL,
  msg_type ENUM('text', 'image', 'file') NOT NULL DEFAULT 'text',
  file_url VARCHAR(1024) NULL,
  file_name VARCHAR(512) NULL,
  file_size BIGINT NULL,
  mime_type VARCHAR(255) NULL,
  reply_to_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (reply_to_id) REFERENCES chat_messages(id) ON DELETE SET NULL,
  INDEX idx_chat_messages_room_time (room_id, created_at),
  INDEX idx_chat_messages_room_id_id (room_id, id),
  INDEX idx_chat_messages_reply_to (reply_to_id),
  INDEX idx_chat_messages_user (user_id)
);

CREATE TABLE IF NOT EXISTS chat_room_reads (
  room_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  last_read_message_id BIGINT NULL,
  last_read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (room_id, user_id),
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (last_read_message_id) REFERENCES chat_messages(id) ON DELETE SET NULL,
  INDEX idx_chat_room_reads_user (user_id)
);

CREATE TABLE IF NOT EXISTS chat_room_pins (
  room_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  pinned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (room_id, user_id),
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES accounts(id) ON DELETE CASCADE,
  INDEX idx_chat_room_pins_user (user_id, pinned_at)
);

CREATE TABLE IF NOT EXISTS chat_room_admin_pins (
  room_id BIGINT NOT NULL,
  pinned_by BIGINT NULL,
  pinned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (room_id),
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (pinned_by) REFERENCES accounts(id) ON DELETE SET NULL,
  INDEX idx_chat_room_admin_pins_time (pinned_at)
);

CREATE TABLE IF NOT EXISTS chat_message_pins (
  message_id BIGINT NOT NULL,
  room_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  pinned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id, user_id),
  FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES accounts(id) ON DELETE CASCADE,
  INDEX idx_chat_message_pins_user_room (user_id, room_id, pinned_at),
  INDEX idx_chat_message_pins_room (room_id, pinned_at)
);

-- Chat Message Reactions
CREATE TABLE IF NOT EXISTS chat_reactions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  message_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  emoji VARCHAR(16) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (message_id, user_id),
  FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES accounts(id) ON DELETE CASCADE,
  INDEX idx_chat_reactions_message (message_id),
  INDEX idx_chat_reactions_user (user_id)
);

-- System Settings (SuperAdmin configurable)
CREATE TABLE IF NOT EXISTS system_settings (
  `key` VARCHAR(64) PRIMARY KEY,
  value TEXT NOT NULL,
  is_encrypted BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT NULL,
  FOREIGN KEY (updated_by) REFERENCES accounts(id) ON DELETE SET NULL
);

-- Resident Activity Logs (CRUD + month changes)
CREATE TABLE IF NOT EXISTS resident_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  action VARCHAR(32) NOT NULL,            -- 'create', 'update', 'delete', 'update_months'
  resident_id BIGINT NULL,
  house_number VARCHAR(32) NULL,
  resident_name VARCHAR(255) NULL,
  changes JSON NULL,                      -- { field: { old, new } }
  performed_by BIGINT NULL,
  performed_by_name VARCHAR(255) NULL,
  performed_by_role VARCHAR(32) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (performed_by) REFERENCES accounts(id) ON DELETE SET NULL,
  INDEX idx_resident_logs_action (action),
  INDEX idx_resident_logs_house (house_number),
  INDEX idx_resident_logs_created (created_at)
);

-- Repair Edit Logs (track edits to repair requests)
CREATE TABLE IF NOT EXISTS repair_edit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  repair_id INT NOT NULL,
  action VARCHAR(32) NOT NULL,            -- 'edit', 'status_change'
  changes JSON NULL,                      -- { field: { old, new } }
  performed_by BIGINT NULL,
  performed_by_name VARCHAR(255) NULL,
  performed_by_role VARCHAR(32) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (performed_by) REFERENCES accounts(id) ON DELETE SET NULL,
  INDEX idx_repair_edit_logs_repair (repair_id),
  INDEX idx_repair_edit_logs_created (created_at)
);

-- ========= Announcement Logs =========
CREATE TABLE IF NOT EXISTS announcement_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  action VARCHAR(32) NOT NULL,
  announcement_id INT,
  announcement_title TEXT,
  changes JSON,
  performed_by BIGINT,
  performed_by_name VARCHAR(255),
  performed_by_role VARCHAR(32),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_announcement_logs_created (created_at)
);

-- ========= Discount Configs (active discount per cycle, max 3) =========
CREATE TABLE IF NOT EXISTS discount_configs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  cycle_months INT NOT NULL,
  discount_type ENUM('percentage', 'fixed') NOT NULL DEFAULT 'percentage',
  discount_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by BIGINT NULL,
  UNIQUE KEY uq_dc_cycle (cycle_months),
  INDEX idx_dc_enabled (enabled)
);

-- ========= Discount Requests (approval workflow + history log) =========
CREATE TABLE IF NOT EXISTS discount_requests (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  action ENUM('create', 'update', 'delete') NOT NULL,
  cycle_months INT NOT NULL,
  discount_type ENUM('percentage', 'fixed') NULL,
  discount_value DECIMAL(12,2) NULL,
  old_discount_type ENUM('percentage', 'fixed') NULL,
  old_discount_value DECIMAL(12,2) NULL,
  requested_by BIGINT NOT NULL,
  requested_by_name VARCHAR(255) NULL,
  requested_by_role VARCHAR(32) NULL,
  status ENUM('approved', 'waiting_approval', 'rejected') NOT NULL DEFAULT 'waiting_approval',
  approved_by BIGINT NULL,
  approved_by_name VARCHAR(255) NULL,
  approved_at TIMESTAMP NULL,
  reject_reason VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_dr_status (status),
  INDEX idx_dr_cycle (cycle_months),
  INDEX idx_dr_created (created_at)
);
