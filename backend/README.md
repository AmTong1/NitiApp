# 🖥️ NitiSmart Backend API

> REST API + WebSocket สำหรับระบบบริหารจัดการนิติบุคคล

---

## 📁 โครงสร้างโฟลเดอร์

```
backend/
├── server.js                # Entry point (HTTP + Socket.IO)
├── schema.sql               # Database schema ทั้งหมด
├── Dockerfile               # Docker image config
├── docker-compose.yml       # Docker Compose config
├── receipt-template.html    # Template ใบเสร็จ PDF
│
└── src/
    ├── config/
    │   ├── env.js            # โหลด environment variables
    │   └── paths.js          # กำหนด path สำหรับ uploads, QR, PDF
    │
    ├── db/
    │   ├── pool.js           # MySQL connection pool
    │   └── initDb.js         # สร้าง database/tables อัตโนมัติ
    │
    ├── middleware/
    │   └── auth.js           # JWT authentication + role check
    │
    ├── routes/
    │   ├── auth.js           # ลงทะเบียน, เข้าสู่ระบบ, โปรไฟล์
    │   ├── residents.js      # จัดการลูกบ้าน (CRUD)
    │   ├── payments.js       # สถานะการชำระ, ประวัติ, บันทึกการจ่าย
    │   ├── promptpay.js      # สร้าง QR PromptPay
    │   ├── slipok.js         # ตรวจสลิป (Slip2Go / SlipOK)
    │   ├── announcements.js  # ประกาศข่าวสาร
    │   ├── repairs.js        # แจ้งซ่อม + แนบรูป
    │   ├── chat.js           # แชทเรียลไทม์ (ห้อง, ข้อความ, ไฟล์)
    │   ├── contacts.js       # เบอร์ติดต่อฉุกเฉิน
    │   ├── admin.js          # จัดการแอดมิน
    │   ├── discount.js       # ตั้งค่าส่วนลดรายรอบ
    │   ├── financial.js      # รายงานการเงิน
    │   ├── settings.js       # ตั้งค่าระบบ (SuperAdmin)
    │   └── pdf.js            # ออกใบเสร็จ PDF
    │
    ├── socket/
    │   └── index.js          # Socket.IO event handlers
    │
    └── utils/
        ├── crypto.js         # เข้ารหัส/ถอดรหัสข้อมูล
        ├── db.js             # Database helper functions
        ├── docPreview.js     # แปลงเอกสารเป็นรูปภาพ
        ├── misc.js           # Utility ทั่วไป
        ├── pgHelper.js       # PostgreSQL compatibility helpers
        └── qr.js             # สร้าง QR Code
```

---

## 📌 ข้อกำหนดเบื้องต้น

- **Node.js** 18 ขึ้นไป
- **MySQL** 8.0+ (หรือ MariaDB 10.6+)
- ไฟล์ `.env` ในโฟลเดอร์ `backend/`

---

## ⚙️ ตั้งค่า Environment Variables

สร้างไฟล์ `.env` ในโฟลเดอร์ `backend/`:

```env
# เซิร์ฟเวอร์
HOST=0.0.0.0
PORT=5419

# ฐานข้อมูล MySQL
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASS=your_password
DB_NAME=MyPJ

# JWT Authentication
JWT_SECRET=your_jwt_secret
JWT_EXPIRES=7d

# Admin Key (ใช้ตอนสร้าง Super Admin)
ADMIN_KEY=your_admin_key

# PromptPay
PROMPTPAY_ID=0xxxxxxxxx
PROMPTPAY_DEFAULT_AMOUNT=199.00

# ตรวจสลิป (เลือกอย่างใดอย่างหนึ่ง)
SLIP2GO_API=https://api.slip2go.com
SLIP2GO_SECRET=your_secret

# (ทางเลือก) SlipOK Legacy
SLIPOK_API=
SLIPOK_KEY=

# Puppeteer (สำหรับออกใบเสร็จ PDF)
PUPPETEER_HEADLESS=new
QR_RETENTION_DAYS=3
```

---

## 🚀 วิธีรัน

### รันแบบปกติ

```bash
cd backend
npm install
npm start
```

เซิร์ฟเวอร์จะเริ่มที่ `http://localhost:5419`

### รันด้วย Docker

```bash
cd backend
docker compose up --build -d
```

| คำสั่ง | คำอธิบาย |
|--------|----------|
| `docker compose up --build -d` | สร้างและรัน container |
| `docker compose logs -f backend` | ดู log แบบ realtime |
| `docker compose down` | หยุด container |
| `docker compose down -v` | หยุดและลบ volume data |

> **หมายเหตุ Docker:** แก้ไข `JWT_SECRET`, `ADMIN_KEY` และรหัสผ่าน DB ใน `docker-compose.yml` ก่อนใช้งานจริง

---

## 🗄️ ฐานข้อมูล

ระบบจะ**สร้างฐานข้อมูลและตารางอัตโนมัติ**ตอนรันครั้งแรก (`initDatabase`) หากต้องการสร้างเอง:

```bash
mysql -u root -p < schema.sql
```

ดูรายละเอียด schema ทั้งหมดได้ที่ไฟล์ `schema.sql`

---

## 📡 API Endpoints หลัก

### 🔐 Authentication (`/auth`)
| Method | Endpoint | คำอธิบาย | สิทธิ์ |
|--------|----------|----------|--------|
| POST | `/auth/register` | สมัครสมาชิก | - |
| POST | `/auth/login` | เข้าสู่ระบบ | - |
| GET | `/auth/me` | ดูข้อมูลตัวเอง | 🔒 User |
| PUT | `/profile` | แก้ไขโปรไฟล์ | 🔒 User |

### 🏠 ลูกบ้าน (`/residents`)
| Method | Endpoint | คำอธิบาย | สิทธิ์ |
|--------|----------|----------|--------|
| GET | `/residents?q=...` | ค้นหาลูกบ้าน | 🔒 User |
| POST | `/residents` | เพิ่มลูกบ้าน | 🔒 Admin |
| PUT | `/residents/:id` | แก้ไขลูกบ้าน | 🔒 Admin |
| DELETE | `/residents/:id` | ลบลูกบ้าน | 🔒 Admin |
| POST | `/residents/register` | สร้างลูกบ้านพร้อมบัญชี (username/password) | 🔒 Admin |

### 💰 การชำระเงิน (`/payments`)
| Method | Endpoint | คำอธิบาย | สิทธิ์ |
|--------|----------|----------|--------|
| GET | `/payments/status?year=&month=&q=` | สถานะการชำระรายเดือน | 🔒 User |
| GET | `/payments/history/:houseNumber` | ประวัติการชำระของบ้าน | 🔒 User |
| POST | `/payments/record` | บันทึกการชำระ | 🔒 Admin |

### 💳 PromptPay (`/promptpay-qr`)
| Method | Endpoint | คำอธิบาย | สิทธิ์ |
|--------|----------|----------|--------|
| GET | `/promptpay-qr` | สร้าง QR Code PromptPay | 🔒 User |
| GET | `/promptpay-qr/user/:userId` | สร้าง QR ตามยอดของ user | 🔒 User |

### 🧾 ตรวจสลิป (`/upload-and-check`)
| Method | Endpoint | คำอธิบาย | สิทธิ์ |
|--------|----------|----------|--------|
| POST | `/upload-and-check` | อัปโหลดสลิป + ตรวจอัตโนมัติ | 🔒 User |

### 📢 ประกาศ (`/announcements`)
| Method | Endpoint | คำอธิบาย | สิทธิ์ |
|--------|----------|----------|--------|
| GET | `/announcements` | ดูประกาศทั้งหมด | 🔒 User |
| POST | `/announcements` | สร้างประกาศ | 🔒 Admin |
| PUT | `/announcements/:id` | แก้ไขประกาศ | 🔒 Admin |
| DELETE | `/announcements/:id` | ลบประกาศ | 🔒 Admin |

### 🔧 แจ้งซ่อม (`/repairs`)
| Method | Endpoint | คำอธิบาย | สิทธิ์ |
|--------|----------|----------|--------|
| GET | `/repairs` | ดูรายการแจ้งซ่อม | 🔒 User |
| POST | `/repairs` | แจ้งซ่อมใหม่ | 🔒 User |
| PUT | `/repairs/:id` | แก้ไข/อัปเดตสถานะ | 🔒 Admin |
| POST | `/repairs/:id/image` | แนบรูปภาพ | 🔒 User |

### 💬 แชท (`/chat`)
| Method | Endpoint | คำอธิบาย | สิทธิ์ |
|--------|----------|----------|--------|
| GET | `/chat/rooms` | ดูรายการห้องแชท | 🔒 User |
| POST | `/chat/rooms` | สร้างห้องแชท | 🔒 User |
| GET | `/chat/rooms/:id/messages` | ดูข้อความในห้อง | 🔒 User |
| POST | `/chat/rooms/:id/messages` | ส่งข้อความ | 🔒 User |
| POST | `/chat/rooms/:id/upload` | ส่งไฟล์/รูปภาพ | 🔒 User |

### 📞 เบอร์ติดต่อ (`/contacts`)
| Method | Endpoint | คำอธิบาย | สิทธิ์ |
|--------|----------|----------|--------|
| GET | `/contacts` | ดูเบอร์ติดต่อ | 🔒 User |
| POST | `/contacts` | เพิ่มเบอร์ | 🔒 Admin |
| PUT | `/contacts/:id` | แก้ไข | 🔒 Admin |
| DELETE | `/contacts/:id` | ลบ | 🔒 Admin |

### 🛡️ Admin / SuperAdmin
| Method | Endpoint | คำอธิบาย | สิทธิ์ |
|--------|----------|----------|--------|
| GET | `/admin/users` | ดูรายการ user ทั้งหมด | 🔒 Admin |
| PUT | `/admin/users/:id` | แก้ไข user | 🔒 SuperAdmin |
| POST | `/discount` | ตั้งค่าส่วนลด | 🔒 Admin |
| GET | `/settings` | ดูการตั้งค่าระบบ | 🔒 SuperAdmin |
| PUT | `/settings` | แก้ไขการตั้งค่า | 🔒 SuperAdmin |

---

## 🔌 WebSocket (Socket.IO)

เชื่อมต่อด้วย:

```javascript
const socket = io('http://localhost:5419', {
  auth: { token: 'Bearer <JWT_TOKEN>' },
  transports: ['websocket', 'polling']
});
```

### Events หลัก:
| Event | ทิศทาง | คำอธิบาย |
|-------|--------|----------|
| `join_room` | Client → Server | เข้าห้องแชท |
| `leave_room` | Client → Server | ออกจากห้อง |
| `new_message` | Server → Client | ข้อความใหม่ |
| `typing` | Client ↔ Server | กำลังพิมพ์ |

---

## 📂 Static Files

ไฟล์ที่อัปโหลดจะอยู่ใน:

| โฟลเดอร์ | คำอธิบาย |
|----------|----------|
| `/uploads` | รูปภาพและเอกสาร |
| `/qrs` | QR Code PromptPay (ลบอัตโนมัติตาม `QR_RETENTION_DAYS`) |
| `/pdfs` | ใบเสร็จ PDF |

---

## 📝 หมายเหตุ

- ฐานข้อมูลและตารางจะถูกสร้างอัตโนมัติเมื่อรันครั้งแรก
- Socket.IO ใช้ `Authorization: Bearer <token>` ใน handshake headers
- QR Code จะถูกลบอัตโนมัติตามจำนวนวันที่ตั้งค่าใน `QR_RETENTION_DAYS`
