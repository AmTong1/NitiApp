-- PostgreSQL schema for the system (converted from MySQL)
-- Safe to run multiple times (IF NOT EXISTS used where possible)

-- Custom ENUMs
DO $$ BEGIN
  CREATE TYPE role_type AS ENUM ('user', 'admin', 'superadmin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add superadmin to existing role_type enum if not exists
DO $$ BEGIN
  ALTER TYPE role_type ADD VALUE IF NOT EXISTS 'superadmin';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pay_status_type AS ENUM ('paid', 'pending', 'overdue', 'waiting_approval');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE method_type AS ENUM ('cash', 'promptpay', 'bank_transfer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE intent_status_type AS ENUM ('initiated', 'pending', 'confirmed', 'failed', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE repair_status_type AS ENUM ('pending', 'in_progress', 'done');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE room_type AS ENUM ('public', 'dm');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE member_role_type AS ENUM ('member', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE msg_type AS ENUM ('text', 'image', 'file');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Accounts (auth)
CREATE TABLE IF NOT EXISTS accounts (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NULL,
  phone VARCHAR(30) NULL,
  role role_type NOT NULL DEFAULT 'user',
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
  id BIGSERIAL PRIMARY KEY,
  house_number VARCHAR(32) NOT NULL UNIQUE,
  title VARCHAR(16) NULL,
  first_name VARCHAR(128) NOT NULL,
  last_name VARCHAR(128) NULL,
  phone VARCHAR(32) NULL,
  household_count INT NOT NULL DEFAULT 1,
  car_count INT NOT NULL DEFAULT 0,
  pay_months INT NULL,
  account_id BIGINT NULL REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS houses (
  id SERIAL PRIMARY KEY,
  house_number VARCHAR(32) NOT NULL UNIQUE,
  owner_name VARCHAR(128) NULL,
  area_sq_m DECIMAL(10,2) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ตารางสรุปสถานะการชำระของบ้าน (1 แถว/บ้าน)
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  house_id INT NULL REFERENCES houses(id) ON DELETE CASCADE,
  house_number VARCHAR(32) NOT NULL UNIQUE,
  area_sq_m DECIMAL(10,2) NULL,
  rate_per_sqm DECIMAL(10,2) NOT NULL DEFAULT 10.00,
  months INT NOT NULL DEFAULT 0,
  amount_per_month DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  note VARCHAR(255) NULL,
  cover_until TIMESTAMP NULL,
  pay_status pay_status_type NOT NULL DEFAULT 'overdue',
  remaining_days INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pay_house_id ON payments(house_id);

-- ตารางงวดการจ่าย (สร้างจาก payments)
CREATE TABLE IF NOT EXISTS payment_installments (
  id BIGSERIAL PRIMARY KEY,
  payment_id INT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  house_number VARCHAR(32) NOT NULL,
  installment_no INT NOT NULL,
  months_span INT NOT NULL,
  due_date TIMESTAMP NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  status pay_status_type NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMP NULL,
  period_start DATE NULL,
  period_end DATE NULL,
  paid_method method_type NULL,
  paid_note VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (payment_id, installment_no)
);
CREATE INDEX IF NOT EXISTS idx_installment_payment ON payment_installments(payment_id);
CREATE INDEX IF NOT EXISTS idx_installment_house ON payment_installments(house_number);
CREATE INDEX IF NOT EXISTS idx_installment_status ON payment_installments(status);

-- Intent ของการชำระด้วย QR/ช่องทางอื่น
CREATE TABLE IF NOT EXISTS payment_intents (
  id BIGSERIAL PRIMARY KEY,
  installment_id BIGINT NULL REFERENCES payment_installments(id) ON DELETE SET NULL,
  payment_id INT NULL,
  house_number VARCHAR(32) NULL,
  amount DECIMAL(12,2) NOT NULL,
  method method_type NOT NULL DEFAULT 'promptpay',
  status intent_status_type NOT NULL DEFAULT 'initiated',
  qr_id VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_intent_installment ON payment_intents(installment_id);
CREATE INDEX IF NOT EXISTS idx_intent_payment ON payment_intents(payment_id);
CREATE INDEX IF NOT EXISTS idx_intent_house ON payment_intents(house_number);
CREATE INDEX IF NOT EXISTS idx_intent_status ON payment_intents(status);

-- ผลตรวจสลิปจาก SlipOK
CREATE TABLE IF NOT EXISTS slipok_verifications (
  id BIGSERIAL PRIMARY KEY,
  amount DECIMAL(12,2) NULL,
  qrcode_data TEXT NULL,
  sending_bank VARCHAR(16) NULL,
  trans_date CHAR(8) NULL,
  trans_time CHAR(8) NULL,
  raw_json TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_qrcode_data ON slipok_verifications(qrcode_data);
CREATE INDEX IF NOT EXISTS idx_trans_date ON slipok_verifications(trans_date);
CREATE INDEX IF NOT EXISTS idx_sending_bank ON slipok_verifications(sending_bank);

-- Announcements
CREATE TABLE IF NOT EXISTS announcements (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  date VARCHAR(32) NOT NULL,
  image VARCHAR(1024) NULL,
  description TEXT NULL,
  important BOOLEAN NOT NULL DEFAULT FALSE,
  created_by BIGINT NULL REFERENCES accounts(id) ON DELETE SET NULL,
  updated_by BIGINT NULL REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_announce_imp_id ON announcements(important, id);

CREATE TABLE IF NOT EXISTS contacts (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  number VARCHAR(64) NOT NULL,
  created_by BIGINT NULL REFERENCES accounts(id) ON DELETE SET NULL,
  updated_by BIGINT NULL REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_contacts_title ON contacts(title);

-- Repairs
CREATE TABLE IF NOT EXISTS repairs (
  id INT NOT NULL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  title VARCHAR(255) NOT NULL,
  detail TEXT NULL,
  house_number VARCHAR(32) NULL,
  status repair_status_type NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_repairs_user ON repairs(user_id);
CREATE INDEX IF NOT EXISTS idx_repairs_created ON repairs(created_at);
CREATE INDEX IF NOT EXISTS idx_repairs_house ON repairs(house_number);

CREATE TABLE IF NOT EXISTS repair_photos (
  id BIGSERIAL PRIMARY KEY,
  repair_id INT NOT NULL REFERENCES repairs(id) ON DELETE CASCADE,
  url VARCHAR(1024) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_repair_photos_repair ON repair_photos(repair_id);

-- Chat
CREATE TABLE IF NOT EXISTS chat_rooms (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  room_type room_type NOT NULL,
  owner_id BIGINT NULL REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_type ON chat_rooms(room_type);

CREATE TABLE IF NOT EXISTS chat_members (
  room_id BIGINT NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  role member_role_type NOT NULL DEFAULT 'member',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (room_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_members(user_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  room_id BIGINT NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  text TEXT NULL,
  msg_type msg_type NOT NULL DEFAULT 'text',
  file_url VARCHAR(1024) NULL,
  file_name VARCHAR(512) NULL,
  file_size BIGINT NULL,
  mime_type VARCHAR(255) NULL,
  reply_to_id BIGINT NULL REFERENCES chat_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_time ON chat_messages(room_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages(user_id);

-- Chat Message Reactions
CREATE TABLE IF NOT EXISTS chat_reactions (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  emoji VARCHAR(16) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (message_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_reactions_message ON chat_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_reactions_user ON chat_reactions(user_id);

-- System Settings (SuperAdmin configurable)
CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(64) PRIMARY KEY,
  value TEXT NOT NULL,
  is_encrypted BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT REFERENCES accounts(id) ON DELETE SET NULL
);

-- Resident Activity Logs (CRUD + month changes)
CREATE TABLE IF NOT EXISTS resident_logs (
  id BIGSERIAL PRIMARY KEY,
  action VARCHAR(32) NOT NULL,            -- 'create', 'update', 'delete', 'update_months'
  resident_id BIGINT NULL,
  house_number VARCHAR(32) NULL,
  resident_name VARCHAR(255) NULL,
  changes JSONB NULL,                     -- { field: { old, new } }
  performed_by BIGINT NULL REFERENCES accounts(id) ON DELETE SET NULL,
  performed_by_name VARCHAR(255) NULL,
  performed_by_role VARCHAR(32) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_resident_logs_action ON resident_logs(action);
CREATE INDEX IF NOT EXISTS idx_resident_logs_house ON resident_logs(house_number);
CREATE INDEX IF NOT EXISTS idx_resident_logs_created ON resident_logs(created_at);

-- Repair Edit Logs (track edits to repair requests)
CREATE TABLE IF NOT EXISTS repair_edit_logs (
  id BIGSERIAL PRIMARY KEY,
  repair_id INTEGER NOT NULL,
  action VARCHAR(32) NOT NULL,            -- 'edit', 'status_change'
  changes JSONB NULL,                     -- { field: { old, new } }
  performed_by INTEGER NULL REFERENCES accounts(id) ON DELETE SET NULL,
  performed_by_name VARCHAR(255) NULL,
  performed_by_role VARCHAR(32) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_repair_edit_logs_repair ON repair_edit_logs(repair_id);
CREATE INDEX IF NOT EXISTS idx_repair_edit_logs_created ON repair_edit_logs(created_at);

-- ========= Announcement Logs =========
CREATE TABLE IF NOT EXISTS announcement_logs (
  id BIGSERIAL PRIMARY KEY,
  action VARCHAR(32) NOT NULL,
  announcement_id INTEGER,
  announcement_title TEXT,
  changes JSONB,
  performed_by INTEGER,
  performed_by_name VARCHAR(255),
  performed_by_role VARCHAR(32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_announcement_logs_created ON announcement_logs(created_at DESC);

-- ========= Helper Indexes =========
CREATE INDEX IF NOT EXISTS idx_pay_status ON payments(pay_status, cover_until);
CREATE INDEX IF NOT EXISTS idx_installment_house_status ON payment_installments(house_number, status);
CREATE INDEX IF NOT EXISTS idx_intent_created ON payment_intents(created_at);
