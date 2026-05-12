-- Schema for ZoneA_Residents

CREATE TABLE IF NOT EXISTS houses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  house_number VARCHAR(32) NOT NULL UNIQUE,
  owner_name VARCHAR(128) NULL,
  area_sq_m DECIMAL(10,2) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ตารางสรุปสถานะการชำระของบ้าน (1 แถว/บ้าน)

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

