# Update Log

## 17 May 2026

- **SuperAdmin Approvals (Residents)**: เพิ่มแท็บ "ลูกบ้าน" ในหน้า Approvals พร้อมต่อ API อนุมัติ/ปฏิเสธคำขอลบลูกบ้านผ่าน `/residents/:id/deletion-status`.
- **App Version Display**: ปรับหน้า Settings ให้แสดงเวอร์ชันตรงกับ `package.json` (1.0.4).
- **Resident Logs Restore Button**: แก้ปัญหาปุ่ม "กู้คืน" ยังแสดงหลังกู้คืนสำเร็จ โดย normalize `resident_id` เป็นตัวเลขก่อนตรวจสถานะ.

## 12 May 2026

- **Fix Payment Sync Issue**: Resolved an issue where payments were successfully verified with Slip2Go API (slip generated and approved) but the system still showed the status as "unpaid" (ยังไม่ได้ชำระ).
- **Fix Financial Summary**: As a result of fixing the payment sync issue, the income/expense (รายรับ รายจ่าย) page now correctly pulls in the paid installments automatically.
- **Details**: Updated `backend/src/routes/slipok.js` to correctly update the `payment_installments` table status to `paid` along with the `payment_intents` when a slip verification succeeds.
- **Prevent Frontend Crash**: Fixed a potential issue where a missing house number could result in a null transaction title and cause the app to crash when generating financial reports.
- **Payment UX Improvement**: Auto-navigate back to the payment history page after a successful QR payment verification. The receipt slip is still shown to the user and automatically saved to the device before navigating back.
- **Data Freshness (Payment History)**: Added cache-busting headers (Cache-Control: no-cache and \_t=Date.now()) to payment history fetch requests (PaymentHistory.tsx, PaymentStatus.tsx, and App.tsx) to ensure the payment status updates immediately when the user navigates back from the QR payment screen.
- **Payment Verification**: Fixed an issue where the slip verification API would fail to validate the receiver's name because the bank API returned the name as a multi-language object (th/en) instead of a simple string. The system now extracts both languages properly to compare with the expected receiver name.
- **Receipt Slip Redesign**: Redesigned the digital receipt (bank slip) SVG to match the NitiSmart HTML template — white card with blue accent bar, Thai branding (NitiSmart + ทำรายการสำเร็จ), timeline nodes for sender/receiver, Thai date format (Buddhist Era), centered amount box, Thai reference footer, and orange save-hint text. Frontend modal also updated to match.
- **Fix Server Crash on Slip Upload**: Fixed a critical typo where extractName() was called instead of extractNameObj() in the receiver name validation, causing a ReferenceError crash on every slip upload. Also replaced feDropShadow SVG filter with librsvg-compatible filter primitives to prevent sharp rendering failures.

- **Financial Visibility Thresholds**:
  - Adjusted PaymentHistory and Home screens to only display upcoming installments based on their payment cycles:
    - General / Monthly: Show within 15 days of due date.
    - Quarterly (3 months): Show within 1 month.
    - Bi-annually (6 months): Show within 3 months.
    - Annually (12 months): Show within 6 months.
  - Overdue installments always take precedence and are visible immediately.
  - Auto-close and return to history screen when a receipt is successfully saved/downloaded.

- **Code Quality / IDE Warnings**:
  - Fixed missing dependency `onBack` in `useCallback` in `Qrcode.tsx`.
  - Refactored inline style into StyleSheet for `NitiSmart` brand title in `Qrcode.tsx`.
  - Removed shadowed/duplicate declaration of `MAX_MESSAGES_IN_MEMORY` in `ChatScreen.tsx`.

- **UX Fix - All Paid Card**:
  - เมื่อผู้ใช้ไม่มีงวดค้างชำระ และงวดถัดไปยังไม่ถึง threshold จะแสดงการ์ด "ชำระครบแล้ว ยังไม่มีงวดถัดไป" แทนการแสดงงวดเก่าที่จ่ายไปแล้ว (ซึ่งทำให้ผู้ใช้สับสน)
  - แก้ไข `pickNextInstallment` fallback ใน `PaymentHistory.tsx` + เพิ่ม style `allPaidCard` + i18n key `phAllPaid`

---

### ผลการ Test ระบบการเงิน (12 พ.ค. 2569)

**Backend (Code Review)**:
| Module | File | Status |
|--------|------|--------|
| อัปโหลด + ตรวจสลิป (10 ขั้นตอน) | `slipok.js` | ผ่าน |
| สร้าง QR PromptPay + งวดชำระ | `promptpay.js` | ผ่าน |
| รายรับ-รายจ่าย (CRUD/Export/Approval) | `financial.js` | ผ่าน |
| ประวัติการชำระต่อบ้าน | `payments.js` | ผ่าน |

**Frontend (Code Review)**:
| Module | File | Status |
|--------|------|--------|
| แสดงงวดตาม threshold (15d/30d/90d/180d) | `PaymentHistory.tsx` | ผ่าน |
| อัปโหลดสลิป + auto-save receipt + กลับหน้าประวัติ | `Qrcode.tsx` | ผ่าน |
| คำนวณยอดค้าง Home ตาม threshold | `App.tsx` | ผ่าน |

**Test Scenarios (Logic Walkthrough)**:
| # | Scenario | ผลลัพธ์ |
|---|----------|---------|
| 1 | ผู้ใช้ไม่มียอดค้าง - เข้าหน้าประวัติ | เห็น "ชำระครบแล้ว" |
| 2 | ผู้ใช้มียอดค้าง 1 งวด - จ่าย - บันทึกสลิป | กลับหน้าประวัติอัตโนมัติ |
| 3 | ผู้ใช้ราย 3 เดือน, เหลือ 2 เดือน - เข้าหน้าประวัติ | ไม่แสดงงวดถัดไป |
| 4 | ผู้ใช้รายปี, เหลือ 5 เดือน - เข้าหน้าประวัติ | แสดงงวดนี้ (threshold 180 วัน) |
| 5 | ส่งสลิปที่ชื่อผู้รับไม่ตรง | แจ้ง "ชื่อบัญชีผู้รับไม่ตรง" |
| 6 | ส่งสลิปซ้ำ | แจ้ง "สลิปซ้ำ กรุณาแจ้งเจ้าหน้าที่" |
| 7 | QR หมดอายุ - อัปโหลดสลิป | แจ้ง "QR หมดอายุ" + สร้าง QR ใหม่ |

- **Redesign Digital Receipt**:
  - อัปเดตโครงสร้างภาพ SVG ของใบเสร็จ (สลิปโอนเงิน) ใน `backend/src/routes/slipok.js` ให้ตรงกับดีไซน์ HTML ล่าสุดที่เพิ่มพื้นหลังแยกไฮไลท์ `บ้านเลขที่` ให้ดูสวยงามและชัดเจนมากขึ้น

## 13 May 2026

- **Resident Payment History**:
  - เพิ่มการแสดงผลงวดชำระที่กำลังจะมาถึง (Upcoming Installments) สำหรับผู้พักอาศัย ทำให้สามารถดูคิวจ่ายล่วงหน้าได้
  - ปรับปรุงข้อความสถานะให้แสดง "รอชำระ" (Pending) สำหรับงวดที่ยังมาไม่ถึง เพื่อความชัดเจนและไม่สับสนกับคำว่า "กำลังดำเนินการ"
- **Home Screen Overdue Display**:
  - แก้ไขปัญหาการแสดงผลกล่องแจ้งยอดค้างชำระในหน้าแรก (Home Screen) โดยหากมียอดค้างชำระ ระบบจะแสดงยอดเงินเป็นสีแดง พร้อมป้ายกำกับว่า "สถานะ: ค้างชำระ" (จากเดิมแสดงเป็นรอดำเนินการ)
  - หากไม่มียอดค้างชำระ จะขึ้นข้อความ "ไม่มียอดค้างชำระ" ตัวอักษรสีเขียวแทน
- **Admin Payment Tracking**:
  - ในหน้ารายการประวัติสำหรับ Admin / SuperAdmin ได้เพิ่มข้อมูลเชิงลึกในแต่ละชิปการชำระ (Payment Chip) โดยจะระบุว่าเป็นงวดชำระเก่า (Past) หรือใหม่ (Future) และระบุจำนวนเดือน (Months span) เช่น "(งวดเก่า · 1 เดือน)" เพื่อให้แอดมินใช้ประกอบการตัดสินใจและตรวจสอบบิลได้ง่ายยิ่งขึ้น
  - แก้ไขการคำนวณข้อความสรุป (Header) ของการชำระเงินในมุมมอง Admin ให้แสดง **ยอดเงินรวมทั้งหมดที่เรียกเก็บจริง** และ **จำนวนเดือนรวมจากทุกงวด** แทนการคูณด้วยค่างวดเริ่มต้น ซึ่งอาจผิดพลาดได้ในกรณีที่มีการแก้ไขงวดจ่ายภายหลัง

# Update Log

## 12 May 2026

- **Fix Payment Sync Issue**: Resolved an issue where payments were successfully verified with Slip2Go API (slip generated and approved) but the system still showed the status as "unpaid" (ยังไม่ได้ชำระ).
- **Fix Financial Summary**: As a result of fixing the payment sync issue, the income/expense (รายรับ รายจ่าย) page now correctly pulls in the paid installments automatically.
- **Details**: Updated `backend/src/routes/slipok.js` to correctly update the `payment_installments` table status to `paid` along with the `payment_intents` when a slip verification succeeds.
- **Prevent Frontend Crash**: Fixed a potential issue where a missing house number could result in a null transaction title and cause the app to crash when generating financial reports.
- **Payment UX Improvement**: Auto-navigate back to the payment history page after a successful QR payment verification. The receipt slip is still shown to the user and automatically saved to the device before navigating back.
- **Data Freshness (Payment History)**: Added cache-busting headers (Cache-Control: no-cache and \_t=Date.now()) to payment history fetch requests (PaymentHistory.tsx, PaymentStatus.tsx, and App.tsx) to ensure the payment status updates immediately when the user navigates back from the QR payment screen.
- **Payment Verification**: Fixed an issue where the slip verification API would fail to validate the receiver's name because the bank API returned the name as a multi-language object (th/en) instead of a simple string. The system now extracts both languages properly to compare with the expected receiver name.
- **Receipt Slip Redesign**: Redesigned the digital receipt (bank slip) SVG to match the NitiSmart HTML template — white card with blue accent bar, Thai branding (NitiSmart + ทำรายการสำเร็จ), timeline nodes for sender/receiver, Thai date format (Buddhist Era), centered amount box, Thai reference footer, and orange save-hint text. Frontend modal also updated to match.
- **Fix Server Crash on Slip Upload**: Fixed a critical typo where extractName() was called instead of extractNameObj() in the receiver name validation, causing a ReferenceError crash on every slip upload. Also replaced feDropShadow SVG filter with librsvg-compatible filter primitives to prevent sharp rendering failures.

- **Financial Visibility Thresholds**:
  - Adjusted PaymentHistory and Home screens to only display upcoming installments based on their payment cycles:
    - General / Monthly: Show within 15 days of due date.
    - Quarterly (3 months): Show within 1 month.
    - Bi-annually (6 months): Show within 3 months.
    - Annually (12 months): Show within 6 months.
  - Overdue installments always take precedence and are visible immediately.
  - Auto-close and return to history screen when a receipt is successfully saved/downloaded.

- **Code Quality / IDE Warnings**:
  - Fixed missing dependency `onBack` in `useCallback` in `Qrcode.tsx`.
  - Refactored inline style into StyleSheet for `NitiSmart` brand title in `Qrcode.tsx`.
  - Removed shadowed/duplicate declaration of `MAX_MESSAGES_IN_MEMORY` in `ChatScreen.tsx`.

- **UX Fix - All Paid Card**:
  - เมื่อผู้ใช้ไม่มีงวดค้างชำระ และงวดถัดไปยังไม่ถึง threshold จะแสดงการ์ด "ชำระครบแล้ว ยังไม่มีงวดถัดไป" แทนการแสดงงวดเก่าที่จ่ายไปแล้ว (ซึ่งทำให้ผู้ใช้สับสน)
  - แก้ไข `pickNextInstallment` fallback ใน `PaymentHistory.tsx` + เพิ่ม style `allPaidCard` + i18n key `phAllPaid`

---

### ผลการ Test ระบบการเงิน (12 พ.ค. 2569)

**Backend (Code Review)**:
| Module | File | Status |
|--------|------|--------|
| อัปโหลด + ตรวจสลิป (10 ขั้นตอน) | `slipok.js` | ผ่าน |
| สร้าง QR PromptPay + งวดชำระ | `promptpay.js` | ผ่าน |
| รายรับ-รายจ่าย (CRUD/Export/Approval) | `financial.js` | ผ่าน |
| ประวัติการชำระต่อบ้าน | `payments.js` | ผ่าน |

**Frontend (Code Review)**:
| Module | File | Status |
|--------|------|--------|
| แสดงงวดตาม threshold (15d/30d/90d/180d) | `PaymentHistory.tsx` | ผ่าน |
| อัปโหลดสลิป + auto-save receipt + กลับหน้าประวัติ | `Qrcode.tsx` | ผ่าน |
| คำนวณยอดค้าง Home ตาม threshold | `App.tsx` | ผ่าน |

**Test Scenarios (Logic Walkthrough)**:
| # | Scenario | ผลลัพธ์ |
|---|----------|---------|
| 1 | ผู้ใช้ไม่มียอดค้าง - เข้าหน้าประวัติ | เห็น "ชำระครบแล้ว" |
| 2 | ผู้ใช้มียอดค้าง 1 งวด - จ่าย - บันทึกสลิป | กลับหน้าประวัติอัตโนมัติ |
| 3 | ผู้ใช้ราย 3 เดือน, เหลือ 2 เดือน - เข้าหน้าประวัติ | ไม่แสดงงวดถัดไป |
| 4 | ผู้ใช้รายปี, เหลือ 5 เดือน - เข้าหน้าประวัติ | แสดงงวดนี้ (threshold 180 วัน) |
| 5 | ส่งสลิปที่ชื่อผู้รับไม่ตรง | แจ้ง "ชื่อบัญชีผู้รับไม่ตรง" |
| 6 | ส่งสลิปซ้ำ | แจ้ง "สลิปซ้ำ กรุณาแจ้งเจ้าหน้าที่" |
| 7 | QR หมดอายุ - อัปโหลดสลิป | แจ้ง "QR หมดอายุ" + สร้าง QR ใหม่ |

- **Redesign Digital Receipt**:
  - อัปเดตโครงสร้างภาพ SVG ของใบเสร็จ (สลิปโอนเงิน) ใน `backend/src/routes/slipok.js` ให้ตรงกับดีไซน์ HTML ล่าสุดที่เพิ่มพื้นหลังแยกไฮไลท์ `บ้านเลขที่` ให้ดูสวยงามและชัดเจนมากขึ้น

## 13 May 2026

- **Resident Payment History**:
  - เพิ่มการแสดงกล่องสรุปข้อมูลการชำระเงินที่ด้านบนของหน้าประวัติลูกบ้าน เพื่อบอกยอดรวมทั้งหมดที่ **"ชำระแล้ว X งวด เป็นเงิน YYY บาท"** ทำให้ลูกบ้านสามารถดูภาพรวมเงินที่จ่ายไปแล้วได้ทันที
  - เพิ่มการแสดงผลงวดชำระที่กำลังจะมาถึง (Upcoming Installments) สำหรับผู้พักอาศัย ทำให้สามารถดูคิวจ่ายล่วงหน้าได้
  - ปรับปรุงข้อความสถานะให้แสดง "รอชำระ" (Pending) สำหรับงวดที่ยังมาไม่ถึง เพื่อความชัดเจนและไม่สับสนกับคำว่า "กำลังดำเนินการ"
- **Home Screen Overdue Display**:
  - แก้ไขปัญหาการแสดงผลกล่องแจ้งยอดค้างชำระในหน้าแรก (Home Screen) โดยหากมียอดค้างชำระ ระบบจะแสดงยอดเงินเป็นสีแดง พร้อมป้ายกำกับว่า "สถานะ: ค้างชำระ" (จากเดิมแสดงเป็นรอดำเนินการ)
  - หากไม่มียอดค้างชำระ จะขึ้นข้อความ "ไม่มียอดค้างชำระ" ตัวอักษรสีเขียวแทน
- **Admin Payment Tracking**:
  - ในหน้ารายการประวัติสำหรับ Admin / SuperAdmin ได้เพิ่มข้อมูลเชิงลึกในแต่ละชิปการชำระ (Payment Chip) โดยจะระบุว่าเป็นงวดชำระเก่า (Past) หรือใหม่ (Future) และระบุจำนวนเดือน (Months span) เช่น "(งวดเก่า · 1 เดือน)" เพื่อให้แอดมินใช้ประกอบการตัดสินใจและตรวจสอบบิลได้ง่ายยิ่งขึ้น
  - แก้ไขการคำนวณข้อความสรุป (Header) ของการชำระเงินในมุมมอง Admin ให้แสดง **ยอดเงินรวมทั้งหมดที่เรียกเก็บจริง** และ **จำนวนเดือนรวมจากทุกงวด** แทนการคูณด้วยค่างวดเริ่มต้น ซึ่งอาจผิดพลาดได้ในกรณีที่มีการแก้ไขงวดจ่ายภายหลัง
- **Code Quality**:
  - แก้ไข Warning / Lint errors (Inline styles) ใน `Home.tsx` และ `PaymentHistory.tsx` ย้ายโค้ด styles มาไว้ที่ `StyleSheet` ด้านล่าง
- **App Version & Settings**:
  - อัปเดตเวอร์ชันของแอปพลิเคชันจาก `1.0.0` เป็น `1.0.1` ในหน้าการตั้งค่า (Settings) และใน `package.json`
- **Resident Payment View Update**:
  - จำกัดการแสดงผล "งวดชำระที่กำลังจะมาถึง" (Upcoming Installments) สำหรับลูกบ้านให้แสดงเพียง **1 งวดถัดไป** เท่านั้น เพื่อลดความสับสนและให้โฟกัสเฉพาะบิลที่ต้องจ่ายงวดหน้าสุด
- **Financial Module Fixes**:
  - แก้ไขปัญหาลูกบ้านเห็นยอดคงเหลือ (Balance) ไม่ตรงกับ Admin และไม่แสดงผล โดยปรับให้การคำนวณยอดคงเหลือแสดงผลรวมตลอดชีพ (All-time balance) และส่งค่ากลับไปให้ลูกบ้านเสมอเมื่อเปิดตั้งค่าอนุญาตให้เห็น
  - แก้ไขปัญหาระบบดาวน์โหลดไฟล์บน Android ที่เมื่อดาวน์โหลดเสร็จแล้วไฟล์หายไปจากแอปจัดการไฟล์ (Files app) โดยปรับการตั้งค่าแคช (`fileCache: true`) เพื่อไม่ให้ระบบลบไฟล์ทิ้งอัตโนมัติ
  - ปรับปรุงการ Export ข้อมูลบัญชี: เปลี่ยนจากรูปแบบ CSV ธรรมดา เป็นไฟล์ตาราง HTML ที่รองรับการแสดงผลผ่าน Excel (เป็นไฟล์ .xls) โดยมีการใส่สีเขียว (+) ให้กับรายรับ และสีแดง (-) ให้กับรายจ่ายเพื่อให้ดูง่ายขึ้น
  - แก้ไขปัญหาดาวน์โหลดไฟล์ Export รายรับรายจ่ายไม่บันทึกลงเครื่อง โดยเปลี่ยนจาก Android Download Manager (ที่ไม่รองรับ custom Authorization header) มาใช้ `ReactNativeBlobUtil.fetch` ดาวน์โหลดตรงพร้อม auth header แล้วเขียนไฟล์ลง Downloads folder ด้วย media scan เพื่อให้ไฟล์ปรากฏในแอปจัดการไฟล์
- **Payment System Fixes**:
  - แก้ไขปัญหาเวลาชำระเงินสำเร็จบนสลิปใบเสร็จไม่ตรงกับเวลาปัจจุบัน โดยปรับให้ `formatThaiDate` ใช้ `toLocaleString` อิงตาม Timezone ของไทย (`Asia/Bangkok`) อย่างถูกต้องเสมอ
  - ปรับปรุงการแสดงผลรูปสลิปใบเสร็จ (SVG -> PNG) โดยลบพื้นหลังสีเทาออก (Transparent Background) และปรับขนาดภาพให้พอดีกับตัวการ์ดใบเสร็จ เพื่อให้ดูสวยงามกลมกลืนเมื่อแชร์ลงในช่องแชทหรือแอปอื่นๆ
- **Chat System Fixes**:
  - แก้ไขปัญหาการส่งไฟล์ Excel (`.xls`, `.xlsx`) และไฟล์ `.csv` ลงในช่องแชทแล้วระบบแจ้งว่า "ไม่รองรับ" โดยเพิ่มการตรวจสอบ MIME Types ที่หลากหลายมากขึ้น รวมถึงอนุญาตให้อัปโหลดไฟล์ `application/octet-stream` ได้หากนามสกุลไฟล์ตรงกับประเภทเอกสารที่อนุญาต
- **Log System Timezone Fix**:
  - แก้ไขปัญหาเวลาในหน้าประวัติ (Logs) ต่างๆ ของ SuperAdmin รวมถึงประวัติการชำระเงิน เวลาไม่ตรงกับเวลาปัจจุบัน โดยปรับให้ API ส่งค่าวันที่จากฐานข้อมูลในรูปแบบ Native แทนการแปลงเป็นข้อความด้วยคำสั่ง DATE_FORMAT ของ MySQL เพื่อให้ระบบสามารถแปลงกลับเป็นเวลาของประเทศไทยได้อย่างถูกต้องแม่นยำ

## 15 May 2026

- **Resident Management Security**:
  - เปลี่ยนระบบการลบข้อมูลลูกบ้านจากลบทันที (Hard Delete) เป็นระบบขออนุมัติลบ (Soft Delete / Pending Approval)
  - **สำหรับ Admin**: เมื่อกดลบ ระบบจะทำการเปลี่ยนสถานะลูกบ้านเป็น "รอการอนุมัติลบ" และส่งรายการไปยัง SuperAdmin
  - **สำหรับ SuperAdmin**:
    - เพิ่มแท็บ "ลูกบ้าน" ในหน้าต่างจัดการอนุมัติ (Approvals) เพื่ออนุมัติหรือปฏิเสธคำขอลบลูกบ้าน
    - เมื่อ SuperAdmin กดลบเอง จะมี Checkbox ยืนยันการลบลูกบ้านอีกชั้น เพื่อป้องกันการเผลอกดผิด
    - เมื่อลบข้อมูลไปแล้ว ข้อมูลจะถูกบันทึกเป็น Soft Delete เป็นเวลา 30 วัน
  - **Data Recovery**: เพิ่มปุ่ม "กู้คืนข้อมูล (ภายใน 30 วัน)" ในหน้าประวัติลูกบ้าน (Resident Logs) เพื่อให้ SuperAdmin สามารถกดกู้คืนรายการลบที่ผิดพลาดได้

- **System Settings Bug Fix**:
  - แก้ไขปัญหาการเปลี่ยนค่าส่วนกลาง (Rate per SQM) ในหน้าตั้งค่าระบบ แล้วเมื่อกด "บันทึก + อัปเดต Payment ทั้งหมด" ยอดค้างชำระของลูกบ้านไม่เปลี่ยนแปลง
  - อัปเดตฝั่ง Backend (`backend/src/routes/settings.js`) ให้รองรับการอัปเดตยอดเงินในตาราง `payment_installments` ทุกงวดที่สถานะยังไม่ได้ชำระ (`pending`) ไปพร้อมๆ กับการอัปเดตการตั้งค่าหลัก เพื่อให้หน้าต่างแสดงยอดค้างชำระอัปเดตราคาได้อย่างถูกต้องทันที

- **Financial Module Fixes**: 
  - ปรับปรุงการทำงานของระบบซ่อนยอดเงินบัญชี (Financial Visibility) ให้ทำการซ่อนข้อมูลทั้งหมด ได้แก่ สถิติรายรับรายจ่ายแบบกราฟ และรายการย้อนหลังทั้งหมด เมื่อผู้ดูแลระบบทำการปิด ไม่ใช่ซ่อนแค่ตัวเลขสรุปยอดคงเหลือ


- **Payment History Fix**: 
  - คืนค่าการแสดงผลประวัติการชำระเงินที่ชำระแล้วกลับมาในหน้ารายละเอียดบัญชีลูกบ้าน เพื่อให้ลูกบ้านสามารถดูงวดที่ชำระไปแล้ว และกดดูใบเสร็จย้อนหลังได้


- **Payment History Fix**: 
  - คืนค่าการแสดงผลประวัติการชำระเงินที่ชำระแล้วกลับมาในหน้ารายละเอียดบัญชีลูกบ้าน เพื่อให้ลูกบ้านสามารถดูงวดที่ชำระไปแล้ว และกดดูใบเสร็จย้อนหลังได้


- **House Number Format Support**:
  - รองรับรูปแบบบ้านเลขที่ที่มี `/` เช่น 132/1 โดยจำกัดการกรอกให้รับเฉพาะตัวเลข (0-9) และ `/` เท่านั้น
  - อัปเดต `UserManage.tsx`: เพิ่ม filter ใน onChangeText ด้วย regex `[^0-9/]` และเปลี่ยน keyboardType เป็น numeric

- **Resident Management 500 Error Fix**:
  - แก้ไข error 500 ในหน้าจัดการลูกบ้าน สาเหตุมาจาก ensureResidentsTable() ล้มเหลวเมื่อพยายามสร้าง UNIQUE INDEX บน column phone ที่มีค่า NULL ซ้ำหลายแถว
  - แก้ไข `backend/src/routes/residents.js`: ล้างข้อมูล phone ที่ซ้ำกัน (non-NULL) ก่อนสร้าง index และครอบ outer try-catch เพื่อให้ function return false แทน crash เมื่อเกิด error ที่ไม่คาดคิด

- **SuperAdmin Approvals Page Crash Fix**:
  - แก้ไขปัญหาแอปเด้ง (Crash) เมื่อเข้าหน้าต่างตรวจสอบ/อนุมัติ (ApprovalsPage) สาเหตุมาจากการเรียงลำดับตัวแปร destructuring ของ Promise.all ไม่ตรงกับ URL (สลับระหว่าง `/residents` และ `/payment-installments`) ทำให้โครงสร้างข้อมูลผิดพลาดเวลา parse JSON
  - อัปเดต `ApprovalsPage.tsx`: จัดเรียงลำดับ `[resPay, resFin, resVis, resRes]` ให้ตรงกับ endpoint แต่ละตัวอย่างถูกต้อง พร้อมตรวจสอบและลบ state ซ้ำซ้อน

- **Chat Screen Dynamic Upload Origin Fix**:
  - แก้ไขปัญหาการเปิดดูไฟล์แนบ รูปภาพ เอกสาร PDF หรือดาวน์โหลดไฟล์ในช่องแชทไม่ทำงาน/หาไฟล์ไม่พบ สาเหตุมาจากการ hardcode ลิงก์ต้นทางของไฟล์ไว้ที่ IP จำลอง (`http://192.168.0.8:4000`)
  - อัปเดต `ChatScreen.tsx`: เปลี่ยน `FIXED_UPLOAD_ORIGIN` ให้เรียก`getBaseUrl()` แบบไดนามิก เพื่อให้ลิงก์ชี้ไปยังเซิร์ฟเวอร์จริง (`https://bpj.tipsoonhome.site`) เสมอ

- **Chat Screen Crash Fix**:
  - แก้ไขปัญหาแอปเด้ง (Crash / Unhandled Promise Rejection) เมื่อเปิดเข้าสู่หน้าแชท สาเหตุเกิดจากการเรียกฟังก์ชัน `initNotifications()` (ซึ่งทำการขอสิทธิ์แจ้งเตือนและสร้าง Notification Channel ผ่าน Notifee) ภายใน `InteractionManager.runAfterInteractions` โดยไม่มีการดักจับข้อผิดพลาด (Missing `.catch()`) ทำให้เมื่อระบบปฏิบัติการไม่อนุญาตหรือเกิดข้อผิดพลาดในการขอสิทธิ์ แอปพลิเคชันจะปิดตัวลงทันที
  - อัปเดต `ChatScreen.tsx`: เพิ่ม `.catch(() => {})` ต่อท้ายการเรียก `initNotifications()` เพื่อดักจับและข้ามข้อผิดพลาดดังกล่าว ทำให้แอปไม่เด้งและสามารถใช้งานแชทต่อได้อย่างราบรื่น

- **Resident Log Restore Button Fix**:
  - ปรับปรุงระบบประวัติผู้อยู่อาศัย (Resident Logs) ให้ทำการซ่อน/ปิดปุ่ม "กู้คืนข้อมูล" ทันทีเมื่อผู้ดูแลระบบทำการกู้คืนลูกบ้านสำเร็จเรียบร้อยแล้ว
  - อัปเดต `backend/src/routes/residents.js`: ปรับคำสั่ง SQL ใน `GET /resident-logs` ให้ทำการ `LEFT JOIN residents` เพื่อดึงสถานะปัจจุบันของลูกบ้าน (`r.deletion_status AS current_resident_status`)
  - อัปเดต `ResidentLogsPage.tsx`: เพิ่ม State `restoredIds` เพื่อจดจำ ID ที่กู้คืนสำเร็จในหน้าจอทันที พร้อมตรวจสอบเงื่อนไขไม่แสดงปุ่มหากลูกบ้านมีสถานะปัจจุบันเป็น `active` หรืออยู่ใน `restoredIds` แล้ว

- **Chat Screen Spacing Fix**:
  - จัดระเบียบช่องว่างระหว่างข้อความในหน้าแชท (ChatScreen) เพื่อแก้ปัญหากล่องข้อความ รูปภาพ และวิดีโอติดกันจนเกินไปเมื่อส่งต่อเนื่องกัน
  - อัปเดต `ChatScreen.tsx`: เพิ่ม `{ marginBottom: attachToPrev ? 4 : 12 }` ในส่วนของ `styles.row` เพื่อให้ข้อความที่ส่งในนาทีเดียวกันมีระยะห่างที่พอดี (4px) และข้อความต่างกลุ่มมีระยะห่างที่ชัดเจน (12px) ทำให้ UI ดูสวยงามและพรีเมียมยิ่งขึ้น
