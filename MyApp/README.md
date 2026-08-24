# 📱 NitiSmart Mobile App

> แอปพลิเคชันมือถือสำหรับระบบบริหารจัดการนิติบุคคล พัฒนาด้วย React Native

---

## 🛠 เทคโนโลยีที่ใช้

- **Framework:** React Native (v0.80)
- **Language:** TypeScript
- **Navigation:** React Navigation (v7)
- **State/Storage:** Async Storage
- **Real-time:** Socket.IO Client
- **Camera/Images:** Vision Camera, Image Picker, Image Viewer
- **UI/Icons:** Vector Icons (Ionicons, FontAwesome, etc.)
- **PDF:** React Native PDF, Blob Util

---

## 📁 โครงสร้างโปรเจค

```
MyApp/
├── android/             # โปรเจค Android Native
├── ios/                 # โปรเจค iOS Native
├── src/                 
│   ├── components/      # UI Components ที่ใช้งานซ้ำ (Header, Sidebar, Alerts ฯลฯ)
│   ├── constants/       # ค่าคงที่ (Colors)
│   ├── i18n/            # ระบบหลายภาษา (ไทย)
│   ├── lib/             # ไลบรารีและ Helper functions (API, Datetime)
│   ├── notifications/   # ระบบแจ้งเตือน (Push Notifications / Device)
│   ├── pages/           # หน้าจอต่างๆ (Screens)
│   │   ├── chat/        # ระบบแชท (ห้องแชท, กล้อง, ดูรูป/PDF)
│   │   ├── superadmin/  # หน้าสำหรับ SuperAdmin
│   │   └── ...          # หน้า Login, Home, แจ้งซ่อม, ชำระเงิน ฯลฯ
│   └── types/           # Type definitions สำหรับ TypeScript
├── App.tsx              # Entry point ของแอปพลิเคชัน
└── index.js             # ไฟล์เริ่มต้นของ React Native
```

---

## 📌 การติดตั้งและรันโปรเจค

### ข้อกำหนดเบื้องต้น
- Node.js (v18+)
- Java Development Kit (JDK 17) สำหรับ Android
- Android Studio พร้อมตั้งค่า Android SDK (`ANDROID_HOME`)

### 1. ติดตั้ง Dependencies

```bash
cd MyApp
npm install
```

### 2. ตั้งค่าการเชื่อมต่อ API

แก้ไขไฟล์ API configuration (เช่น `src/lib/api.ts` หรือไฟล์ config) เพื่อชี้ไปยัง Backend Server (เช่น IP ภายในบ้านของคุณ: `http://192.168.1.xxx:5419`)

### 3. รันแอปพลิเคชัน

**เริ่มต้น Metro Bundler (เปิด Terminal หน้าต่างที่ 1):**

```bash
npm start
```

**รันบน Android (เปิด Terminal หน้าต่างที่ 2):**

```bash
npm run android
```

> **หมายเหตุ:** สำหรับ iOS จะต้องใช้ macOS และรัน `cd ios && pod install` เพื่อติดตั้ง dependencies ของ iOS ก่อน จากนั้นจึงใช้คำสั่ง `npm run ios`

---

## 🌟 ฟีเจอร์หลักของแอป

- **ระบบเข้าสู่ระบบ:** รองรับ User ทั่วไป, Admin, และ SuperAdmin
- **หน้าหลัก (Dashboard):** แสดงข้อมูลสรุป ประกาศล่าสุด และทางลัดเมนู
- **ระบบชำระเงินค่าส่วนกลาง:** สร้าง QR Code PromptPay, แนบสลิป, ตรวจสอบสถานะการชำระเงินย้อนหลัง
- **แจ้งซ่อม:** ฟอร์มแจ้งปัญหาการซ่อมแซมพร้อมระบบถ่ายรูปหรือแนบรูปจากคลังภาพ
- **แชทลูกบ้าน-นิติบุคคล:** ระบบแชทเรียลไทม์ (Socket.IO) ส่งข้อความ รูปภาพ และไฟล์ PDF
- **การจัดการ (สำหรับ Admin):** ดูรายชื่อลูกบ้าน, ตรวจสอบและอนุมัติการชำระเงิน, จัดการคำขอแจ้งซ่อม, ประกาศข่าวสาร
- **SuperAdmin Panel:** จัดการสิทธิ์แอดมินคนอื่นๆ, ตั้งค่าส่วนลดค่าส่วนกลาง, ดูบันทึกการกระทำ (Logs)

---

## 📝 ข้อควรระวัง

- การทำงานที่เกี่ยวข้องกับกล้อง (เช่น สแกนหน้า, ถ่ายรูปแจ้งซ่อม) อาจต้องทดสอบบน **โทรศัพท์มือถือจริง** เนื่องจาก Emulator บางตัวอาจไม่รองรับ Vision Camera อย่างสมบูรณ์
