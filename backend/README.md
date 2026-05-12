Backend (modularized)

Structure
- src/config: Environment and paths
- src/db: MySQL pool
- src/middleware: Auth middlewares
- src/routes: Feature routes grouped by domain
- src/socket: Socket.IO setup
- src/utils: Reusable helpers (QR, DB utils, misc)
- server.js: Thin entrypoint wiring HTTP + Socket.IO

Key routes
- Auth: /auth/register, /auth/login, /auth/me, /profile
- Slip2Go: POST /upload-and-check (upload + compress + Slip2Go check)
- PromptPay: GET /promptpay-qr, GET /promptpay-qr/user/:userId
- Payments:
  - GET /payments/status?year=YYYY&month=1-12&q=123
  - GET /payments/history/:houseNumber
  - POST /payments/record
- Admin: /admin/users, /admin/users/:userId/amount, /admin/users/:userId/amount/add, /admin/users/:userId
- Contacts: CRUD under /contacts
- Repairs: CRUD under /repairs (+ /repairs/:id/image, generic POST /upload)
- Chat: public room, DM ensure, messages, file uploads, and admin DM list under /chat/*

Prerequisites
- Node.js 18+
- MySQL (matching env in .env). The API can run in limited mock mode if DB is not reachable for some endpoints.
- .env in backend/ with at least:
HOST=localhost
PORT=5000
DB_HOST=localhost
DB_USER=root
DB_PASS=pass
DB_NAME=mydb
JWT_SECRET=supersecret
JWT_EXPIRES=7d
ADMIN_KEY=your-admin-key
SLIP2GO_API=https://api.slip2go.com
SLIP2GO_SECRET=your-slip2go-secret

# Backward compatibility (optional)
SLIPOK_API=
SLIPOK_KEY=
PROMPTPAY_ID=0812345678
PROMPTPAY_DEFAULT_AMOUNT=0
QR_RETENTION_DAYS=3
PUPPETEER_HEADLESS=new

Run
- From project root: `npm run start --prefix backend`
- Or `cd backend && npm start`

Docker (Backend + MySQL)
- From project root:
  - `cd backend`
  - `docker compose up --build -d`
- Check logs:
  - `docker compose logs -f backend`
- API base URL:
  - `http://localhost:5000`
- Stop containers:
  - `docker compose down`
- Stop and remove MySQL volume data:
  - `docker compose down -v`

Notes for Docker
- MySQL host for backend is `db` (service name), not `localhost`.
- Host machine MySQL port is mapped to `3307`.
- Edit `JWT_SECRET`, `ADMIN_KEY`, and database passwords in `docker-compose.yml` before exposing outside local development.

Notes
- Static files are served from: /uploads, /qrs, /pdfs
- QR images and PDFs are cleaned up periodically (QR based on retention days).
- Socket.IO uses Authorization: Bearer <token> in handshake headers.

SQL (Payments)
If DB is available the API will auto-create tables on first use. Manual DDL:

```
CREATE TABLE IF NOT EXISTS houses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  house_number VARCHAR(32) NOT NULL UNIQUE,
  owner_name VARCHAR(128) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  house_id INT NOT NULL,
  paid_date DATE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('success','overdue','processing') NOT NULL DEFAULT 'processing',
  method ENUM('qr','cash','bank') NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pay_house FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE CASCADE,
  INDEX idx_pay_house_month (house_id, paid_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Residents endpoints
- GET /residents?q=...
- POST /residents (auth + adminOnly)
- PUT /residents/:id (auth + adminOnly)
- DELETE /residents/:id (auth + adminOnly)
- POST /residents/register (auth + adminOnly) — สร้างผู้พักอาศัยพร้อมบัญชีเข้าใช้งาน (username/password)

SQL (Residents)
```sql
CREATE TABLE IF NOT EXISTS residents (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  house_number VARCHAR(32) NOT NULL UNIQUE,
  title VARCHAR(16) NULL,
  first_name VARCHAR(128) NOT NULL,
  last_name VARCHAR(128) NULL,
  phone VARCHAR(32) NULL,
  household_count INT NOT NULL DEFAULT 1,
  car_count INT NOT NULL DEFAULT 0,
  account_id BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_resident_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Accounts table (ถ้ายังไม่มี ระบบจะสร้างอัตโนมัติเมื่อเรียก /residents/register)
```sql
CREATE TABLE IF NOT EXISTS accounts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NULL,
  role ENUM('user','admin') NOT NULL DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
