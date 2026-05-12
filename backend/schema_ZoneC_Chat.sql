-- Schema for ZoneC_Chat

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

