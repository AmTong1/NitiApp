import { createContext, useContext } from 'react';

const th = {
  // Common
  confirm: 'ยืนยัน', cancel: 'ยกเลิก', save: 'บันทึก', delete: 'ลบ', edit: 'แก้ไข',
  add: 'เพิ่ม', close: 'ปิด', ok: 'ตกลง', back: 'กลับ', loading: 'กำลังโหลด...',
  error: 'เกิดข้อผิดพลาด', success: 'สำเร็จ', search: 'ค้นหา', noData: 'ไม่มีข้อมูล',
  readMore: 'อ่านต่อ...', collapse: 'ย่อ', today: 'วันนี้', send: 'ส่ง', submit: 'ส่งคำขอ',
  details: 'รายละเอียด',

  // Menu / Sidebar
  menuHome: 'หน้าหลัก', menuProfile: 'โปรไฟล์ของฉัน', menuPayment: 'ชำระค่าส่วนกลาง',
  menuChat: 'แชท', menuRepair: 'ติดต่อ / แจ้งซ่อม', menuEmergency: 'เบอร์โทรฉุกเฉิน',
  menuManageResidents: 'จัดการผู้พักอาศัย', menuCheckPayments: 'ตรวจสอบการจ่ายเงิน',
  menuAnnouncementAdmin: 'ประกาศ (Admin)', menuAdminDashboard: 'Admin (Dashboard)',
  menuSuperAdmin: '🛡️ SuperAdmin', menuSettings: 'ตั้งค่า', menuFinancial: 'รายรับ - รายจ่าย',
  logout: '🚪 ออกจากระบบ',

  // Header / Page Titles
  titleHome: 'NitiSmart', titleAdmin: 'Admin', titleAnnouncement: 'ประกาศ (Admin)',
  titlePayment: 'ชำระค่าส่วนกลาง', titleCheckPayment: 'ตรวจสอบการจ่ายเงิน',
  titleManageResidents: 'จัดการผู้พักอาศัย', titleNotification: 'การแจ้งเตือน',
  titleEmergency: 'เบอร์โทรฉุกเฉิน', titleRepair: 'แจ้งซ่อม', titleChat: 'แชท',
  titleProfile: 'โปรไฟล์ของฉัน', titleSettings: 'ตั้งค่า',

  // Login
  loginTitle: 'เข้าสู่ระบบ', loginUsername: 'ชื่อผู้ใช้', loginPassword: 'รหัสผ่าน',
  loginButton: 'เข้าสู่ระบบ', loginFillAll: 'กรอกข้อมูลให้ครบ',
  loginFillPrompt: 'โปรดใส่ Username และ Password', loginFailed: 'เชื่อมต่อไม่สำเร็จ',
  loginLoggingIn: 'กำลังเข้าสู่ระบบ...', loginRetry: 'ลองใหม่อีกครั้ง',

  // Payment
  payStatusPaid: 'ชำระแล้ว', payStatusOverdue: 'ค้างชำระ', payStatusPending: 'รอชำระ',
  payStatusProcessing: 'กำลังดำเนินการ', payStatusWaitingApproval: 'รอตรวจสอบ',
  paySearchHouse: 'ค้นหาเลขที่บ้าน', payHouseNumber: 'บ้านเลขที่',
  payInstallment: 'งวด', payTotalOverdue: 'ยอดค้างชำระทั้งหมด',
  payExpense: 'ค่าใช้จ่าย', phBaht: 'บาท', phTotal: 'รวม',
  phAmountPerMonth: 'จำนวนเงินต่อเดือน', phMonths: 'จำนวนเดือน',
  phInstallments: 'งวด', phHouseNumber: 'บ้านเลขที่',

  // Repair
  repairTitle: '🔧 แจ้งซ่อม', repairNew: 'แจ้งซ่อมใหม่',
  repairId: 'รหัสแจ้งซ่อม', repairHouseNumber: 'บ้านเลขที่',
  repairSubject: 'หัวข้อแจ้งซ่อม', repairDetails: 'รายละเอียด',
  repairStatusPending: 'รอตรวจสอบ', repairStatusInProgress: 'กำลังดำเนินการ',
  repairStatusDone: 'เสร็จสิ้น', repairStatusCancelled: 'ถูกยกเลิก',
  repairStatusProcessing: 'กำลังดำเนินการ',

  // Announcement
  annTitle: '📢 ประกาศ', annAddNew: 'เพิ่มประกาศใหม่',
  annSubject: 'หัวข้อ', annDate: 'วันที่', annImportant: 'ประกาศสำคัญ',
  annDescriptionLabel: 'รายละเอียด',
  noAnnouncement: 'ยังไม่มีประกาศ', loadAnnouncementFailed: 'โหลดประกาศไม่สำเร็จ',

  // Emergency Call
  callTitle: '📞 เบอร์โทรฉุกเฉิน', callName: 'ชื่อ', callNumber: 'หมายเลข',
  callNoContacts: 'ยังไม่มีรายการติดต่อ',

  // Chat
  chatPickerHeader: 'เลือกช่องแชท', chatPickerPublicRoom: 'ห้องรวม',
  chatPickerPublicDesc: 'ทุกคนพูดคุยร่วมกัน', chatPickerAdminContact: 'ติดต่อแอดมิน (ตัวต่อตัว)',
  chatPickerAdminDesc: 'เฉพาะคุณ ⇄ แอดมิน', chatTypeMessage: 'พิมพ์ข้อความ',
  chatNoMessagesYet: 'ยังไม่มีข้อความ', chatStartConversation: 'ทักทายเพื่อนใหม่ของคุณเลย!',

  // Profile
  profileTitle: 'โปรไฟล์ของฉัน', profileTitleField: 'คำนำหน้า',
  profileFirstName: 'ชื่อจริง', profileLastName: 'นามสกุล',
  profileHouseNumber: 'บ้านเลขที่', profilePhone: 'หมายเลขโทรศัพท์',

  // Settings
  settingsTitle: 'ตั้งค่า', settingsAbout: 'เกี่ยวกับ',
  settingsVersion: 'เวอร์ชัน', settingsAppName: 'NitiSmart',

  // Notification
  notifTitle: 'การแจ้งเตือน', notifNoItems: 'ไม่มีการแจ้งเตือน',

  // SuperAdmin
  superAdminTitle: '🛡️ SuperAdmin', saApprovals: 'การอนุมัติ',
  saCheckRequests: 'ตรวจสอบคำขอแก้ไข', saManageAdmin: 'จัดการ Admin',
  saHistoryLogs: 'ประวัติ / Logs',

  // Thai months
  monthJan: 'ม.ค.', monthFeb: 'ก.พ.', monthMar: 'มี.ค.', monthApr: 'เม.ย.',
  monthMay: 'พ.ค.', monthJun: 'มิ.ย.', monthJul: 'ก.ค.', monthAug: 'ส.ค.',
  monthSep: 'ก.ย.', monthOct: 'ต.ค.', monthNov: 'พ.ย.', monthDec: 'ธ.ค.',
};

const I18nContext = createContext({ lang: 'th', t: (key) => key });

export function I18nProvider({ children }) {
  const t = (key, params) => {
    let text = th[key] ?? key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
      });
    }
    return text;
  };

  return (
    <I18nContext.Provider value={{ lang: 'th', t }}>
      {children}
    </I18nContext.Provider>
  );
}

export const useI18n = () => useContext(I18nContext);
