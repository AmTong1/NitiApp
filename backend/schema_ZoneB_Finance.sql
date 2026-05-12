-- Schema for ZoneB_Finance

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
);

-- Residents / Houses / Payments

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

