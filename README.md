# 🏘️ NitiSmart — ระบบบริหารจัดการนิติบุคคล

> ระบบบริหารจัดการนิติบุคคลหมู่บ้านจัดสรรแบบครบวงจร พัฒนาด้วย React Native + Node.js

---

## 📋 สารบัญ

- [เทคโนโลยีที่ใช้](#-เทคโนโลยีที่ใช้)
- [ฟีเจอร์หลัก](#-ฟีเจอร์หลัก)
- [สถาปัตยกรรมระบบ](#-สถาปัตยกรรมระบบ)
- [ข้อกำหนดเบื้องต้น](#-ข้อกำหนดเบื้องต้น)
- [การติดตั้ง](#-การติดตั้ง)
- [การตั้งค่า Environment Variables](#-การตั้งค่า-environment-variables)
- [การรันโปรเจค](#-การรันโปรเจค)
- [โครงสร้างโปรเจค](#-โครงสร้างโปรเจค)

---

## 🛠 เทคโนโลยีที่ใช้

| ส่วน | เทคโนโลยี |
|------|-----------|
| **Frontend (Mobile)** | React Native 0.80, TypeScript |
| **Backend (API)** | Node.js, Express 5 |
| **Database** | MySQL |
| **Real-time** | Socket.IO |
| **Authentication** | JWT (Role-Based Access Control) |
| **Payment** | PromptPay QR, SlipOK / Slip2Go (ตรวจสลิปอัตโนมัติ) |
| **Containerization** | Docker, Docker Compose |

---

## ✨ ฟีเจอร์หลัก

- 🏠 **จัดการลูกบ้านและบ้าน** — CRUD ข้อมูลลูกบ้าน, บ้าน, จำนวนสมาชิก
- 💰 **ชำระเงินค่าส่วนกลาง** — สร้าง QR PromptPay, ตรวจสลิปอัตโนมัติ, ระบบงวดผ่อน
- 📢 **ประกาศข่าวสาร** — Push Notification, ปักหมุดข่าวสำคัญ
- 🔧 **แจ้งซ่อม** — แจ้งปัญหาพร้อมแนบรูปภาพ, ติดตามสถานะ
- 💬 **แชทเรียลไทม์** — ห้องสนทนาสาธารณะ/ส่วนตัว, ส่งไฟล์/รูปภาพ, React emoji, Pin ข้อความ
- 📊 **รายงานการเงิน** — สรุปรายรับ, สถานะค้างชำระ, ออกใบเสร็จ PDF
- 🛡️ **Super Admin Panel** — อนุมัติคำขอ, จัดการแอดมิน, ตั้งค่าส่วนลดรายรอบ
- 🔐 **ระบบล็อกอิน** — JWT Token พร้อม Role-Based Access Control (user / admin / superadmin)

---

## 🏗 สถาปัตยกรรมระบบ

```
┌─────────────────┐        ┌─────────────────┐        ┌──────────┐
│   React Native  │◄──────►│   Express API   │◄──────►│  MySQL   │
│   Mobile App    │  HTTP  │   + Socket.IO   │  SQL   │ Database │
└─────────────────┘  WS    └─────────────────┘        └──────────┘
                              │
                              ├── PromptPay QR Generation
                              ├── SlipOK / Slip2Go (ตรวจสลิป)
                              └── Puppeteer (ออกใบเสร็จ PDF)
```

---

## 📌 ข้อกำหนดเบื้องต้น

ก่อนเริ่มติดตั้ง ตรวจสอบว่าเครื่องมีซอฟต์แวร์ต่อไปนี้:

| ซอฟต์แวร์ | เวอร์ชันขั้นต่ำ | หมายเหตุ |
|-----------|:-------------:|----------|
| **Node.js** | 18+ | [ดาวน์โหลด](https://nodejs.org/) |
| **npm** | 9+ | มาพร้อม Node.js |
| **MySQL** | 8.0+ | หรือใช้ MariaDB 10.6+ |
| **Git** | 2.30+ | [ดาวน์โหลด](https://git-scm.com/) |
| **Android Studio** | — | สำหรับรัน Android Emulator |
| **JDK** | 17 | สำหรับ build Android |
| **Docker** _(ทางเลือก)_ | 20+ | หากต้องการรันผ่าน Docker |

---

## 📦 การติดตั้ง

### 1. Clone โปรเจค

```bash
git clone https://github.com/AmTong1/NitiApp.git
cd NitiApp
```

### 2. ติดตั้ง Backend

```bash
cd backend
npm install
```

### 3. ตั้งค่าฐานข้อมูล

สร้างฐานข้อมูล MySQL แล้วรัน schema:

```bash
mysql -u root -p < schema.sql
```

> **หมายเหตุ:** Backend จะสร้างฐานข้อมูลและตารางให้อัตโนมัติตอนรันครั้งแรก (`initDatabase`) หากยังไม่มี แต่แนะนำให้รัน schema เองก่อนเพื่อความแน่ใจ

### 4. ติดตั้ง Frontend (React Native)

```bash
cd ../MyApp
npm install
```

**สำหรับ Android:**

```bash
# ตรวจสอบว่าตั้งค่า ANDROID_HOME แล้ว
# Windows: ตั้งค่า Environment Variable → ANDROID_HOME = C:\Users\<ชื่อ>\AppData\Local\Android\Sdk
# macOS/Linux: export ANDROID_HOME=$HOME/Android/Sdk
```

---

## ⚙️ การตั้งค่า Environment Variables

สร้างไฟล์ `.env` ที่โฟลเดอร์ `backend/`:

```env
# Server
HOST=0.0.0.0
PORT=5419

# Database (MySQL)
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASS=your_password
DB_NAME=MyPJ

# JWT
JWT_SECRET=your_jwt_secret
JWT_EXPIRES=7d

# PromptPay
PROMPTPAY_ID=0xxxxxxxxx
PROMPTPAY_DEFAULT_AMOUNT=199.00

# Slip Verification (เลือกอย่างใดอย่างหนึ่ง)
SLIP2GO_API=https://api.slip2go.com
SLIP2GO_SECRET=your_secret

# Admin
ADMIN_KEY=your_admin_key

# Puppeteer
PUPPETEER_HEADLESS=new
QR_RETENTION_DAYS=3
```

---

## 🚀 การรันโปรเจค

### รัน Backend

```bash
cd backend
npm start
# หรือ
node server.js
```

เซิร์ฟเวอร์จะเริ่มที่ `http://localhost:5419`

### รัน Frontend (React Native)

เปิด Terminal ใหม่:

```bash
cd MyApp

# เริ่ม Metro bundler
npm start

# รันบน Android (เปิด Terminal อีกอัน)
npm run android
```

### รันด้วย Docker (ทางเลือก)

```bash
cd backend
docker compose up -d --build
```

---

## 📁 โครงสร้างโปรเจค

```
proj/
├── backend/                # Backend API Server
│   ├── src/
│   │   ├── config/         # Environment config
│   │   ├── db/             # Database connection & init
│   │   ├── middleware/     # Auth middleware (JWT)
│   │   ├── routes/         # API routes
│   │   └── socket.js       # Socket.IO handlers
│   ├── uploads/            # ไฟล์อัปโหลด (รูป, เอกสาร)
│   ├── schema.sql          # Database schema
│   ├── server.js           # Entry point
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── MyApp/                  # React Native Mobile App
│   ├── src/
│   │   ├── components/     # Reusable components
│   │   ├── pages/          # Screen pages
│   │   ├── services/       # API service layer
│   │   └── i18n/           # Internationalization
│   ├── android/            # Android native config
│   ├── ios/                # iOS native config
│   ├── App.tsx             # Main app entry
│   └── package.json
│
├── docs/                   # เอกสารประกอบ
└── README.md
```

---

## 👤 ผู้พัฒนา

**AmTong1** — [github.com/AmTong1](https://github.com/AmTong1)

---

## 📄 License

This project is for educational purposes.
