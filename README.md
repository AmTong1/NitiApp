# PROJ Monorepo

โปรเจกต์นี้รวม 2 ส่วนหลัก:
- `backend/` : Node.js + Express + Socket.IO API
- `MyApp/` : React Native mobile app

## โครงสร้างหลัก

```text
proj/
|- backend/      # API server + database integration
|- MyApp/        # React Native application
|- update_*.js   # one-off scripts สำหรับแก้โค้ดเฉพาะจุด
|- .gitignore
```

## Requirements

- Node.js 18+
- npm
- PostgreSQL (สำหรับ backend)
- React Native toolchain (Android Studio / Xcode) สำหรับ `MyApp`

## เริ่มใช้งานเร็ว

### 1) Backend

```bash
cd backend
npm install
npm start
```

ค่าเริ่มต้น server อยู่ที่ `http://localhost:5000`

### 2) Mobile App

```bash
cd MyApp
npm install
npm start
```

รันบน Android:

```bash
npm run android
```

รันบน iOS:

```bash
npm run ios
```

## Environment Variables (backend)

สร้างไฟล์ `backend/.env` แล้วกำหนดค่าตามนี้:

```env
HOST=localhost
PORT=5000

DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASS=your_password
DB_NAME=upgit

JWT_SECRET=change_me
JWT_EXPIRES=7d
ADMIN_KEY=change_me

SLIPOK_API=https://api.slipok.com/api/line/verify
SLIPOK_KEY=your_slipok_key
PROMPTPAY_ID=0812345678
PROMPTPAY_DEFAULT_AMOUNT=0

QR_RETENTION_DAYS=3
PUPPETEER_HEADLESS=new
```

หมายเหตุ: backend มี logic สำหรับ init database/tables ตอนเริ่มระบบ

## Git และไฟล์ที่ไม่ควรอัปโหลด

โปรเจกต์ตั้งค่า `.gitignore` ที่ root แล้ว เพื่อกันไฟล์ที่ไม่ควรขึ้น remote เช่น:
- ไฟล์ลับ: `**/.env`, `**/.env.*`
- dependencies: `**/node_modules/`
- ไฟล์ runtime: `backend/uploads/`, `backend/qrs/`
- log/backup/archive: `*.log`, `*.zip`, `*.rar`, `*.7z`

ก่อน push แนะนำเช็ก:

```bash
git status
```

## One-off Scripts ที่ root

ไฟล์ด้านล่างเป็นสคริปต์ช่วยแก้โค้ดแบบครั้งคราว:
- `update_resident_register.js`
- `update_payments_status_remove_houses.js`

ให้ตรวจเนื้อหาก่อนรันทุกครั้ง เพราะเป็นการแก้ source file โดยตรง
