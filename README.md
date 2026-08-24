# NitiSmart — ระบบบริหารจัดการนิติบุคคล

<div align="center">

<img src="https://img.shields.io/badge/React_Native-0.80-61DAFB?style=for-the-badge&logo=react&logoColor=white" />
<img src="https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" />
<img src="https://img.shields.io/badge/Express-5.x-000000?style=for-the-badge&logo=express&logoColor=white" />
<img src="https://img.shields.io/badge/MySQL-8.0-4479A1?style=for-the-badge&logo=mysql&logoColor=white" />
<img src="https://img.shields.io/badge/Socket.IO-4.x-010101?style=for-the-badge&logo=socketdotio&logoColor=white" />

</div>

---

## ระบบบริหารจัดการนิติบุคคล / หมู่บ้านจัดสรร

**เทคโนโลยี:** React Native, Node.js, Express, MySQL, Socket.IO

### ฟีเจอร์หลัก:
- 🏠 **ระบบจัดการลูกบ้านและบ้าน (CRUD)** — เพิ่ม/แก้ไข/ลบข้อมูลสมาชิกและหน่วยที่อยู่อาศัย
- 💳 **ระบบชำระเงินค่าส่วนกลาง** — รองรับ PromptPay QR, ตรวจสลิปอัตโนมัติ (Slip2Go), แบ่งจ่ายรายงวด
- 🔔 **ระบบประกาศข่าวสาร** — แจ้งเตือน Push Notification พร้อมแนบไฟล์/รูปภาพ
- 🔧 **ระบบแจ้งซ่อม** — แจ้งปัญหา, ติดตามสถานะ, แนบรูปภาพ/วิดีโอ
- 💬 **ระบบแชทเรียลไทม์** — สื่อสารระหว่างลูกบ้านและผู้ดูแลผ่าน Socket.IO
- 📊 **ระบบรายงานการเงิน** — สรุปยอดค้างชำระ, ประวัติการชำระเงิน, ส่วนลดรายงวด
- 🛡️ **Super Admin Panel** — ระบบอนุมัติ, จัดการแอดมิน, ตั้งค่าส่วนลด, ดูประวัติ Logs
- 🔐 **ระบบล็อกอินผู้ดูแลด้วย JWT Token** — ยืนยันตัวตนพร้อมระบบ Role-Based Access Control

### ลิงก์ GitHub: [github.com/tanutchapol/proj](https://github.com/tanutchapol/proj)

---

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
- MySQL (สำหรับ backend)
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

SLIP2GO_API=https://api.slip2go.com
SLIP2GO_SECRET=your_slip2go_secret

# Backward compatibility (optional)
SLIPOK_API=
SLIPOK_KEY=
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
