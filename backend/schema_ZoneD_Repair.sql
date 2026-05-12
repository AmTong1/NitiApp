-- Schema for ZoneD_Repair

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

