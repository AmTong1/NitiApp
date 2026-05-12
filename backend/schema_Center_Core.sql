-- Schema for Center_Core

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

CREATE TABLE IF NOT EXISTS system_settings (
  `key` VARCHAR(64) PRIMARY KEY,
  value TEXT NOT NULL,
  is_encrypted BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT NULL,
  FOREIGN KEY (updated_by) REFERENCES accounts(id) ON DELETE SET NULL
);

-- Resident Activity Logs (CRUD + month changes)

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

