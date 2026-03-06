import React, { useMemo, useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, StatusBar, Platform, Modal, TouchableOpacity, TouchableWithoutFeedback, Image, Text, PermissionsAndroid } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GlobalAlertModal, showAlert } from './src/components/GlobalAlert';

import Header from './src/components/Header';
import Sidebar from './src/components/Sidebar';
import Login from './src/pages/Login';
import Home from './src/pages/Home';
import Qrcode from './src/pages/Qrcode';
import Call from './src/pages/Call';
import Repairst from './src/pages/Repairst';
import Notification from './src/pages/Notification';
import Admin from './src/pages/Admin';
import AnnouncementAdmin from './src/pages/AnnouncementAdmin';
import PaymentStatus from './src/pages/PaymentStatus';
import PaymentHistory from './src/pages/PaymentHistory';
import UserManage from './src/pages/UserManage';
import Profile from './src/pages/Profile'; // NEW
import SuperAdmin from './src/pages/SuperAdmin'; // SuperAdmin page
import { BASE_HOST, BASE_PORT } from './src/pages/config.ts';

import ChatChannelPicker from './src/pages/chat/ChatChannelPicker';
import ChatScreen from './src/pages/chat/ChatScreen';
import { getLastSeen, markAllSeen, sortNotifications, iconNameFor, type AppNotification, colorFor } from './src/notifications/center';

import type { Announcement, MenuItem, Page } from './src/types';
import { Ionicons } from '@react-native-vector-icons/ionicons';

const ANDROID_HOST = BASE_HOST;
export function getBaseUrl() {
  const host = Platform.OS === 'android' ? ANDROID_HOST : BASE_HOST;
  return `http://${host}:${BASE_PORT}`;
}

type User = {
  id: number | string;
  username: string;
  full_name?: string;
  role?: 'user' | 'admin' | 'superadmin';
  created_at?: string;
};

type ChatRoom = { id: number; name: string; room_type: 'public' | 'dm' };

// Helper to sort announcements: important first, then by id asc
const compareAnnouncements = (a: Announcement, b: Announcement) => {
  const impDelta = (b?.important ? 1 : 0) - (a?.important ? 1 : 0);
  if (impDelta !== 0) return impDelta;
  const idA = typeof a?.id === 'number' ? (a.id as number) : Number(a?.id ?? 0);
  const idB = typeof b?.id === 'number' ? (b.id as number) : Number(b?.id ?? 0);
  return idA - idB;
};

export default function App() {
  const [page, setPage] = useState<Page>('login');
  const [username, setUsername] = useState<string>('');
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [sidebarVisible, setSidebarVisible] = useState<boolean>(false);
  const [selectedHouse, setSelectedHouse] = useState<string | null>(null);

  const [role, setRole] = useState<'user' | 'admin' | 'superadmin'>('user');
  const [booting, setBooting] = useState<boolean>(true);
  const [user, setUser] = useState<User | null>(null);
  const [importantModalOpen, setImportantModalOpen] = useState(false);
  const [importantItem, setImportantItem] = useState<Announcement | null>(null);
  const [lastImportantSeenId, setLastImportantSeenId] = useState<number>(0);

  // ===== Notification Center State =====
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [bellCount, setBellCount] = useState(0);
  const [_lastSeenTs, setLastSeenTs] = useState<number>(0);
  const [notifLoading, setNotifLoading] = useState(false);

  // ===== Request Permissions on App Start =====
  useEffect(() => {
    const requestAllPermissions = async () => {
      if (Platform.OS !== 'android') return;
      
      try {
        const permissions: any[] = [
          PermissionsAndroid.PERMISSIONS.CAMERA,
          PermissionsAndroid.PERMISSIONS.CALL_PHONE,
        ];
        
        // Android 13+ permissions
        if (Platform.Version >= 33) {
          permissions.push(PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES);
          permissions.push(PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO);
          permissions.push(PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO);
          permissions.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        } else {
          // Android 12 และต่ำกว่า
          permissions.push(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
          permissions.push(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE);
        }
        
        const results = await PermissionsAndroid.requestMultiple(permissions);
        console.log('Permission results:', results);
      } catch (err) {
        console.warn('Permission request error:', err);
      }
    };
    
    requestAllPermissions();
  }, []);

  // Helpers for formatting Thai date in modals
  const toDate = (s?: string | null): Date | null => {
    if (!s) return null;
    const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m1) { const y = +m1[1], M = +m1[2], d = +m1[3]; const dt = new Date(y, M - 1, d); return isNaN(dt.getTime()) ? null : dt; }
    const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m2) { let d = +m2[1], M = +m2[2], y = +m2[3]; if (y > 2400) y -= 543; const dt = new Date(y, M - 1, d); return isNaN(dt.getTime()) ? null : dt; }
    return null;
  };
  const formatBeThai = (s?: string | null): string => {
    const d = toDate(s);
    if (!d) return String(s ?? '');
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
  };

  // แชท
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) { setPage('login'); return; }

        const res = await fetch(`${getBaseUrl()}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        const raw = await res.text();

        if (res.status === 401) {
          await AsyncStorage.removeItem('token');
          setPage('login');
          return;
        }

        let me: User | null = null;
        try { me = JSON.parse(raw); }
        catch {
          showAlert('Parse Error', 'ไม่สามารถแปลงข้อมูลผู้ใช้ได้');
          setPage('login');
          return;
        }

        setUser(me);
        setRole(me?.role === 'superadmin' ? 'superadmin' : me?.role === 'admin' ? 'admin' : 'user');
        setUsername(me?.username || '');
        setPage('home');
      } catch (e: any) {
        showAlert('เกิดข้อผิดพลาด', e?.message || 'ดึงข้อมูลผู้ใช้ล้มเหลว');
        setPage('login');
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    const toAbsoluteUrl = (url: string): string => {
      if (!url) return '';
      if (/^https?:\/\//i.test(url)) return url;
      const base = getBaseUrl();
      return url.startsWith('/') ? `${base}${url}` : `${base}/${url}`;
    };
    const load = async () => {
      try {
        const res = await fetch(`${getBaseUrl()}/announcements`);
        if (!res.ok) throw new Error('โหลดประกาศไม่สำเร็จ');
        const json = await res.json();
        const data = Array.isArray(json?.data) ? json.data : [];
        let mapped: Announcement[] = data.map((a: any) => ({
          id: a.id,
          date: String(a.date ?? ''),
          title: String(a.title ?? ''),
          image: toAbsoluteUrl(String(a.image ?? '')),
          important: !!a.important,
          description: a.description != null ? String(a.description) : undefined,
        })).sort(compareAnnouncements);

        // hide past announcements for normal users
        if (role !== 'admin') {
          const today = new Date(); today.setHours(0, 0, 0, 0);
          mapped = mapped.filter(it => {
            const d = toDate(it.date);
            if (!d) return false;
            const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            return dd.getTime() >= today.getTime();
          });
        }
        setAnnouncements(mapped);

        // Show important announcements sequence (newer than last seen id)
        try {
          const seenIdRaw = await AsyncStorage.getItem('important_modal_seen_last_id');
          const seenId = seenIdRaw ? Number(seenIdRaw) : 0;
          setLastImportantSeenId(seenId);
          // find the next important with id > seenId (assuming id increases over time)
          const next = mapped
            .filter(it => it.important)
            .find(it => Number((it.id as any) ?? 0) > seenId);
          if (next) {
            setImportantItem(next);
            setImportantModalOpen(true);
          }
        } catch { }
      } catch (e: any) {
        console.warn('fetch announcements error:', e?.message);
        // fallback ตัวอย่าง เผื่อ backend ยังไม่พร้อม
        setAnnouncements([
          { date: '—', title: 'ยังไม่มีประกาศ', image: '' },
        ]);
      }
    };
    load();
  }, [role]);

  // ===== Approval Count State (SuperAdmin) =====
  const [approvalCount, setApprovalCount] = useState(0);

  useEffect(() => {
    if (role !== 'superadmin') return;
    const fetchApprovals = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) return;
        const res = await fetch(`${getBaseUrl()}/payment-installments/waiting-approval`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const json = await res.json();
          if (json.ok && Array.isArray(json.data)) {
            setApprovalCount(json.data.length);
          }
        }
      } catch (err) {
        console.warn('fetch approvals failed', err);
      }
    };
    fetchApprovals();
    // Poll every 10 seconds? or just once/on role change.
    // For now, just once on mount/role change.
    const interval = setInterval(fetchApprovals, 15000); 
    return () => clearInterval(interval);
  }, [role]);

  const { menuItems, adminDividerIndex } = useMemo(() => {
    const openMyHistory = () => {
      setSelectedRoom(null);
      if (role === 'admin' || role === 'superadmin') { setPage('payment'); return; }
      (async () => {
        try {
          const token = await AsyncStorage.getItem('token');
          if (!token) { showAlert('ยังไม่เข้าสู่ระบบ'); setPage('login'); return; }
          const res = await fetch(`${getBaseUrl()}/me/resident`, { headers: { Authorization: `Bearer ${token}` } });
          const json = await res.json();
          if (!res.ok || !json?.ok) throw new Error(json?.error || 'ไม่พบข้อมูลบ้านของคุณ');
          const hn = String(json.data?.house_number || '');
          if (!hn) throw new Error('ไม่พบบ้านเลขที่');
          setSelectedHouse(hn);
          setPage('paymentDetail');
        } catch (e: any) {
          showAlert('ไม่สามารถเปิดประวัติ', e?.message || 'ไม่พบข้อมูลบ้านของคุณ');
        }
      })();
    };
    const base: MenuItem[] = [
      { label: 'หน้าหลัก', onPress: () => { setSelectedRoom(null); setPage('home'); } },
      { label: 'โปรไฟล์ของฉัน', onPress: () => { setSelectedRoom(null); setPage('profile'); } }, // NEW
    ];
    
    if (role !== 'admin' && role !== 'superadmin') {
      base.push({ label: 'ชำระค่าส่วนกลาง', onPress: openMyHistory });
    }

    base.push(
      { label: 'แชท', onPress: () => { setSelectedRoom(null); setPage('chat'); } },
      { label: 'ติดต่อ / แจ้งซ่อม', onPress: () => { setSelectedRoom(null); setPage('repairst'); } },
      { label: 'เบอร์โทรฉุกเฉิน', onPress: () => { setSelectedRoom(null); setPage('call'); } },
    );
    if (role === 'admin') {
      const adminItems: MenuItem[] = [
        { label: 'จัดการผู้พักอาศัย', onPress: () => { setSelectedRoom(null); setPage('usermgr'); } },
        { label: 'ตรวจสอบการจ่ายเงิน', onPress: () => { setSelectedRoom(null); setPage('payment'); } },
        { label: 'ประกาศ (Admin)', onPress: () => { setSelectedRoom(null); setPage('announcement'); } },
        { label: 'Admin (Dashboard)', onPress: () => { setSelectedRoom(null); setPage('admin'); } },
      ];
      return { menuItems: [...base, ...adminItems], adminDividerIndex: base.length };
    }
    if (role === 'superadmin') {
      const adminItems: MenuItem[] = [
        { label: 'จัดการผู้พักอาศัย', onPress: () => { setSelectedRoom(null); setPage('usermgr'); } },
        { label: 'ตรวจสอบการจ่ายเงิน', onPress: () => { setSelectedRoom(null); setPage('payment'); } },
        { label: 'ประกาศ (Admin)', onPress: () => { setSelectedRoom(null); setPage('announcement'); } },
        { label: 'Admin (Dashboard)', onPress: () => { setSelectedRoom(null); setPage('admin'); } },
      ];
      const superAdminItems: MenuItem[] = [
        { 
          label: '🛡️ SuperAdmin', 
          onPress: () => { setSelectedRoom(null); setPage('superadmin'); },
          showRedDot: approvalCount > 0 // NEW
        },
      ];
      return { menuItems: [...base, ...adminItems, ...superAdminItems], adminDividerIndex: base.length };
    }
    return { menuItems: base, adminDividerIndex: undefined };
  }, [role, approvalCount]);

  const toggleSidebar = () => setSidebarVisible(v => !v);

  const handleLogout = async () => {
    await AsyncStorage.removeItem('token');
    setUser(null);
    setRole('user');
    setUsername('');
    setSelectedRoom(null);
    setPage('login');
  };

  // Notification rebuild function
  const rebuildNotifications = React.useCallback(async () => {
    try {
      setNotifLoading(true);
      const ls = await getLastSeen();
      setLastSeenTs(ls);

      const list: AppNotification[] = [];

      // helper แปลงสถานะเป็นไทย
      const toThaiPayStatus = (st: string) => {
        switch (st) {
          case 'overdue': return 'ค้างชำระ';
          case 'pending': return 'รอชำระ';
          case 'processing': return 'กำลังดำเนินการ';
          case 'success':
          case 'paid': return 'ชำระแล้ว';
          default: return st;
        }
      };
      // NEW: แปลงสถานะแจ้งซ่อมเป็นไทย
      const toThaiRepairStatus = (st: string) => {
        switch (st) {
          case 'pending': return 'รอดำเนินการ';
          case 'in_progress': return 'กำลังซ่อม';
          case 'processing': return 'กำลังดำเนินการ';
          case 'done':
          case 'completed': return 'เสร็จสิ้น';
          case 'rejected':
          case 'cancelled': return 'ถูกยกเลิก';
          default: return st;
        }
      };

      // 1) Announcements
      announcements.forEach(a => {
        list.push({
          id: `ann_${a.id ?? a.title}`,
          type: 'announcement',
          title: a.title,
          subtitle: a.description,
          date: a.date,
          important: !!a.important,
        });
      });

      // 2) Repairs (fetch lightweight list)
      try {
        const token = await AsyncStorage.getItem('token');
        if (token) {
          const res = await fetch(`${getBaseUrl()}/repairs`, { headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' } });
          if (res.ok) {
            const raw = await res.json();
            const repairs = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
            repairs.slice(0, 40).forEach((r: any) => {
              const important = r.status !== 'done' && r.status !== 'completed';
              list.push({
                id: `rep_${r.id}`,
                type: 'repair',
                title: `แจ้งซ่อม #${r.id} ${r.title || ''}`.trim(),
                subtitle: `สถานะ: ${toThaiRepairStatus(r.status)}`, // CHANGED
                date: r.created_at,
                important,
              });
            });
          }
        }
      } catch {}
      
      // 3) Payments (ADMIN)
      try {
        if (role === 'admin') {
          const res = await fetch(`${getBaseUrl()}/payments/status`);
          const js = await res.json();
          if (res.ok && js?.ok) {
            (Array.isArray(js.data) ? js.data : []).forEach((p: any, idx: number) => {
              const st = p.status;
              const important = st === 'overdue' || st === 'pending';
              const stTh = toThaiPayStatus(st);
              if (important) {
                list.push({
                  id: `pay_${p.houseNumber || p.house_number || idx}`,
                  type: 'payment',
                  title: `บ้าน ${p.houseNumber || p.house_number} ${stTh}`,
                  subtitle: stTh,
                  important,
                  statusCode: st, // NEW
                });
              }
            });
          }
        } else {
          // ผู้ใช้ปกติ
          let house = selectedHouse;
          if (!house) {
            try {
              const token = await AsyncStorage.getItem('token');
              if (token) {
                const resH = await fetch(`${getBaseUrl()}/me/resident`, { headers: { Authorization: `Bearer ${token}` } });
                const jsH = await resH.json();
                if (resH.ok && jsH?.ok) house = String(jsH.data?.house_number || '');
              }
            } catch {}
          }
          if (house) {
            const resPh = await fetch(`${getBaseUrl()}/payments/history/${encodeURIComponent(house)}`);
            const jsPh = await resPh.json();
            if (resPh.ok && jsPh?.ok) {
              (Array.isArray(jsPh.data) ? jsPh.data : []).forEach((h: any) => {
                const st = h.status;
                const important = st === 'overdue' || st === 'processing';
                const stTh = toThaiPayStatus(st);
                if (important) {
                  list.push({
                    id: `ph_${h.id || h.date}`,
                    type: 'payment',
                    title: `ค่าใช้จ่าย ${h.date || ''}`,
                    subtitle: stTh,
                    important,
                    date: h.date,
                    statusCode: st, // NEW
                  });
                }
              });
            }
          }
        }
      } catch {}

      const sorted = sortNotifications(list);
      setNotifications(sorted);

      // นับเฉพาะรายการสำคัญที่ใหม่กว่า lastSeen
      const toTs = (s?: string | null): number => {
        if (!s) return 0;
        const d = toDate(s);
        if (d) return d.getTime();
        const t = Date.parse(String(s));
        return Number.isNaN(t) ? 0 : t;
      };
      const count = sorted.filter(n => n.important && toTs(n.date) > ls).length;
      setBellCount(count);
    } finally {
      setNotifLoading(false);
    }
  }, [announcements, role, selectedHouse]);

  // Rebuild เมื่อประกาศ / role / house เปลี่ยน
  useEffect(() => {
    rebuildNotifications();
  }, [rebuildNotifications]);

  const toggleNotif = () => {
    // เปิด = mark seen และรีเซ็ตตัวเลขทันที
    setNotifOpen(prev => {
      const next = !prev;
      if (next) {
        markAllSeen().then(() => {
          setLastSeenTs(Date.now());
          setBellCount(0); // รีเซ็ตตัวเลขเมื่อผู้ใช้เปิดดู
        });
      }
      return next;
    });
  };

  if (page === 'login') {
    return (
      <>
      <SafeAreaProvider style={styles.loginProvider}>
        <StatusBar barStyle="light-content" backgroundColor="#0F680FFF" translucent={false} />
        <Login
          username={username}
          setUsername={setUsername}
          onLogin={async () => {
            try {
              const token = await AsyncStorage.getItem('token');
              if (!token) { setPage('login'); return; }

              const res = await fetch(`${getBaseUrl()}/auth/me`, {
                headers: { Authorization: `Bearer ${token}` }
              });
              if (!res.ok) {
                await AsyncStorage.removeItem('token');
                setPage('login');
                return;
              }

              const raw = await res.text();
              let me: User | null = null;
              try { me = JSON.parse(raw); }
              catch {
                showAlert('เกิดข้อผิดพลาด', 'ไม่สามารถอ่านข้อมูลผู้ใช้ได้');
                setPage('login');
                return;
              }

              setUser(me);
              setRole(me?.role === 'superadmin' ? 'superadmin' : me?.role === 'admin' ? 'admin' : 'user');
              setUsername(me?.username || '');
              showAlert('เข้าสู่ระบบสำเร็จ', `ยินดีต้อนรับ ${me?.username || ''}`);
              setPage('home');
            } catch (err: any) {
              showAlert('ข้อผิดพลาด', err?.message || 'เชื่อมต่อไม่สำเร็จ');
              setPage('login');
            }
          }}
        />
      </SafeAreaProvider>
      <GlobalAlertModal darkMode={darkMode} />
      </>
    );
  }

  if (booting) {
    return (
      <>
      <SafeAreaProvider>
        <SafeAreaView style={[styles.container, darkMode ? styles.bgBootDark : styles.bgBootLight]} />
      </SafeAreaProvider>
      <GlobalAlertModal darkMode={darkMode} />
      </>
    );
  }

  const getPageConfig = () => {
    switch (page) {
      case 'admin':
        return { title: 'Admin', bgColor: darkMode ? '#1A1A1A' : '#FF3582' };
      case 'announcement':
        return { title: 'ประกาศ (Admin)', bgColor: darkMode ? '#1A1A1A' : '#4CAF50' };
      case 'qrcode':
        return { title: 'ชำระค่าส่วนกลาง', bgColor: darkMode ? '#1A1A1A' : '#8BC34A' };
      case 'payment':
        return { title: 'ตรวจสอบการจ่ายเงิน', bgColor: darkMode ? '#1A1A1A' : '#7CB342' };
      case 'paymentDetail':
        return { title: `Home No. ${selectedHouse ?? ''}`, bgColor: darkMode ? '#1A1A1A' : '#7CB342' };
      case 'usermgr':
        return { title: 'จัดการผู้พักอาศัย', bgColor: darkMode ? '#1A1A1A' : '#4CAF50' };
      case 'notification':
        return { title: 'การแจ้งเตือน', bgColor: darkMode ? '#1A1A1A' : '#FF9800' };
      case 'call':
        return { title: 'เบอร์โทรฉุกเฉิน', bgColor: darkMode ? '#1A1A1A' : '#EE886A' };
      case 'repairst':
        return { title: 'แจ้งซ่อม', bgColor: darkMode ? '#1A1A1A' : '#006EFFFF' };
      case 'chat':
        return { title: selectedRoom ? (selectedRoom.name || 'แชท') : 'แชท', bgColor: darkMode ? '#0F9B16FF' : '#8BC34A' };
      case 'profile': // NEW
        return { title: 'โปรไฟล์ของฉัน', bgColor: darkMode ? '#1A1A1A' : '#7CB342' };
      default:
        return { title: 'NitiSmart', bgColor: darkMode ? '#1A1A1A' : '#8BC34A' };
    }
  };

  const { title, bgColor } = getPageConfig();

  // โหมดต่าง ๆ ของแชท
  const isChatRoomPage = page === 'chat' && !!selectedRoom; // อยู่ในห้อง
  const isChatPickerPage = page === 'chat' && !selectedRoom;  // เลือกห้อง

  // หน้าไหนมี VirtualizedList
  const isVirtualizedPage = page === 'repairst' || page === 'payment' || page === 'paymentDetail' || page === 'usermgr' || page === 'superadmin';

  return (
    <>
    <SafeAreaProvider>
      <SafeAreaView
        style={[styles.container, { backgroundColor: (isChatRoomPage || isChatPickerPage) ? '#F7F7F8' : bgColor }] as any}
        edges={['top']}
      >
        <StatusBar
          barStyle={(isChatRoomPage || isChatPickerPage) ? 'dark-content' : 'light-content'}
          backgroundColor={(isChatRoomPage || isChatPickerPage) ? '#F7F7F8' : bgColor}
          translucent={false}
        />

        {sidebarVisible && (
          <Sidebar
            darkMode={darkMode}
            setDarkMode={setDarkMode}
            visible={sidebarVisible}
            onClose={() => setSidebarVisible(false)}
            onLogout={handleLogout}
            menuItems={menuItems}
            adminDividerIndex={adminDividerIndex}
            currentUser={user}
          />
        )}

        {/* Header ใหญ่แสดงเฉพาะหน้า non-chat, non-superadmin หรือหน้าเลือกห้อง (ให้มีหัวเรื่อง) */}
        {(!isChatRoomPage && page !== 'superadmin') && (
          <Header
            title={title}
            darkMode={darkMode}
            onMenuPress={toggleSidebar}
            showClose={page === 'notification' || page === 'paymentDetail' || isChatRoomPage}
            onClose={() => {
              if (isChatRoomPage) {
                setSelectedRoom(null);
              } else if (page === 'paymentDetail') {
                setSelectedHouse(null);
                if (role === 'admin') {
                  setPage('payment');
                } else {
                  setPage('home');
                }
              } else {
                setPage('home');
              }
            }}
            onBellPress={toggleNotif}
            bellCount={bellCount}
            bellActive={notifOpen}
          />
        )}

        {/* ===== เนื้อหา ===== */}
        {isChatRoomPage ? (
          // แชทในห้อง — เต็มจอ
          <View style={styles.flex1}>
            <ChatScreen
              initialRoom={selectedRoom!}
              onBack={() => setSelectedRoom(null)}
            />
          </View>
        ) : isChatPickerPage ? (
          <View style={styles.flex1}>
            <ChatChannelPicker
              onOpenRoom={(room) => setSelectedRoom(room)}
            />
          </View>
        ) : page === 'superadmin' ? (
           // SuperAdmin - เต็มจอ (Manage its own header/layout)
           <View style={styles.flex1}>
              <SuperAdmin 
                darkMode={darkMode} 
                onMenuPress={toggleSidebar}
              />
           </View>
        ) : (
          // หน้าอื่น ๆ ยังอยู่ในกล่องขาว
          <View style={styles.whiteContentContainer}>
            {(['call', 'notification', 'announcement', 'profile'] as const).includes(page as any) ? ( // ← เพิ่ม 'profile'
              <>
                {page === 'call' && <Call darkMode={darkMode} />}
                {page === 'notification' && <Notification darkMode={darkMode} />}
                {page === 'announcement' && <AnnouncementAdmin darkMode={darkMode} />}
                {page === 'profile' && (  // ← ย้ายมาแสดงที่นี่ (style เดียวกับ call)
                  <Profile
                    darkMode={darkMode}
                    onUpdated={async () => {
                      try {
                        const token = await AsyncStorage.getItem('token');
                        if (!token) return;
                        const res = await fetch(`${getBaseUrl()}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
                        if (res.ok) {
                          const me = await res.json();
                          setUser(me);
                          setRole(me?.role === 'superadmin' ? 'superadmin' : me?.role === 'admin' ? 'admin' : 'user');
                        }
                      } catch {}
                    }}
                  />
                )}
              </>
            ) : isVirtualizedPage ? (
              <View style={styles.flex1}>
                {page === 'repairst' && <Repairst darkMode={darkMode} />}
                {page === 'payment' && (
                  <PaymentStatus
                    darkMode={darkMode}
                    onSelectHouse={(hn) => { setSelectedHouse(hn); setPage('paymentDetail'); }}
                  />
                )}
                {page === 'paymentDetail' && selectedHouse && (
                  <PaymentHistory darkMode={darkMode} houseNumber={selectedHouse} onGoQr={() => setPage('qrcode')} />
                )}
                {page === 'usermgr' && (
                  <UserManage darkMode={darkMode} />
                )}
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.scrollContent}>
                {page === 'home' && (
                  <Home
                    darkMode={darkMode}
                    announcements={announcements}
                    goNotification={() => setPage('notification')}
                    goQrcode={() => setPage('qrcode')}
                  />
                )}
                {page === 'qrcode' && (
                  <Qrcode
                    darkMode={darkMode}
                    onBack={() => {
                      if (selectedHouse) setPage('paymentDetail'); else setPage('home');
                    }}
                  />
                )}
                {page === 'admin' && <Admin />}
              </ScrollView>
            )}
          </View>
        )}
      </SafeAreaView>
      {/* Important announcement modal (show once) */}
      <Modal visible={importantModalOpen && !!importantItem} transparent animationType="fade" onRequestClose={async () => {
        // close and advance to next important
        if (importantItem?.id != null) {
          const newSeen = Math.max(lastImportantSeenId, Number(importantItem.id as any) || 0);
          setLastImportantSeenId(newSeen);
          await AsyncStorage.setItem('important_modal_seen_last_id', String(newSeen));
          const next = announcements.filter(it => it.important).find(it => Number((it.id as any) ?? 0) > newSeen);
          if (next) {
            setImportantItem(next);
            setImportantModalOpen(true);
            return;
          }
        }
        setImportantModalOpen(false);
      }}>
        <TouchableWithoutFeedback onPress={async () => {
          if (importantItem?.id != null) {
            const newSeen = Math.max(lastImportantSeenId, Number(importantItem.id as any) || 0);
            setLastImportantSeenId(newSeen);
            await AsyncStorage.setItem('important_modal_seen_last_id', String(newSeen));
            const next = announcements.filter(it => it.important).find(it => Number((it.id as any) ?? 0) > newSeen);
            if (next) {
              setImportantItem(next);
              setImportantModalOpen(true);
              return;
            }
          }
          setImportantModalOpen(false);
        }}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                <TouchableOpacity
                  accessibilityLabel="close"
                  onPress={async () => {
                    if (importantItem?.id != null) {
                      const newSeen = Math.max(lastImportantSeenId, Number(importantItem.id as any) || 0);
                      setLastImportantSeenId(newSeen);
                      await AsyncStorage.setItem('important_modal_seen_last_id', String(newSeen));
                      const next = announcements.filter(it => it.important).find(it => Number((it.id as any) ?? 0) > newSeen);
                      if (next) {
                        setImportantItem(next);
                        setImportantModalOpen(true);
                        return;
                      }
                    }
                    setImportantModalOpen(false);
                  }}
                  style={styles.modalCloseX}
                >
                  <Ionicons name="close" size={18} color={'#333'} />
                </TouchableOpacity>
                {!!importantItem && (
                  <>
                    <Text style={styles.modalTitle1}>ประกาศแจ้งเตือน</Text>
                    <Text style={styles.modalTitle}>{importantItem.title || 'ประกาศ'}</Text>
                    {importantItem.description ? (
                      <Text style={styles.modalDesc}>{importantItem.description}</Text>
                    ) : null}
                    <View style={styles.modalDateRow}>
                      <Ionicons name="calendar-outline" size={16} color={'#2E7D32'} />
                      <Text style={styles.modalDateText}>{formatBeThai(importantItem.date)}</Text>
                    </View>
                    {!!importantItem.image && (
                      <View style={styles.modalImageWrap}>
                        <Image source={{ uri: importantItem.image }} style={styles.modalImageCentered} resizeMode="cover" />
                      </View>
                    )}
                  </>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {notifOpen && (
        <View style={stylesNotif.overlay} pointerEvents="box-none">
          <TouchableWithoutFeedback onPress={() => setNotifOpen(false)}>
            <View style={stylesNotif.backdrop} />
          </TouchableWithoutFeedback>
          <View style={stylesNotif.dropdown}>
            <View style={stylesNotif.headerRow}>
              <Text style={stylesNotif.dropTitle}>การแจ้งเตือน</Text>
              <TouchableOpacity
                onPress={() => {
                  markAllSeen();
                  setBellCount(0); // รีเซ็ตตอนกดปิด
                  setNotifOpen(false);
                }}
              >
                <Text style={stylesNotif.markAll}>ปิด</Text>
              </TouchableOpacity>
            </View>
            {notifLoading ? (
              <Text style={stylesNotif.loading}>กำลังโหลด...</Text>
            ) : notifications.length === 0 ? (
              <Text style={stylesNotif.empty}>ไม่มีการแจ้งเตือน</Text>
            ) : (
              <ScrollView style={styles.notifScroll}>
                {notifications.map(n => {
                  // base color
                  let typeColor = colorFor(n.type);
                  // Override สำหรับ payment ตามสถานะย่อย
                  if (n.type === 'payment') {
                    switch (n.statusCode) {
                      case 'overdue':
                        typeColor = '#F05454'; // แดง
                        break;
                      case 'pending':
                      case 'processing':
                        typeColor = '#FFD34D'; // เหลือง
                        break;
                      case 'paid':
                      case 'success':
                        typeColor = '#26C281'; // เขียว
                        break;
                      default:
                        typeColor = '#16A34A';
                    }
                  }
                  // (ถ้าต้องการ แปลง repair status code เพิ่มได้แบบเดียวกัน)

                  return (
                    <View
                      key={n.id}
                      style={stylesNotif.itemRow}
                    >
                      <Ionicons
                        name={iconNameFor(n.type) as any}
                        size={18}
                        color={typeColor}
                        style={styles.mr10}
                      />
                      <View style={styles.flex1}>
                        <Text
                          style={[
                            stylesNotif.itemTitle,
                            { color: typeColor } as any,
                            n.important && styles.fontBold
                          ]}
                          numberOfLines={2}
                        >
                          {n.title}
                        </Text>
                        {!!n.subtitle && (
                          <Text style={stylesNotif.itemSub} numberOfLines={1}>
                            {n.subtitle}
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      )}
    </SafeAreaProvider>
    <GlobalAlertModal darkMode={darkMode} />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loginProvider: { flex: 1, backgroundColor: '#0F680FFF' },
  bgBootDark: { backgroundColor: '#1A1A1A' },
  bgBootLight: { backgroundColor: '#8BC34A' },
  flex1: { flex: 1 },
  notifScroll: { maxHeight: 340 },
  mr10: { marginRight: 10 },
  fontBold: { fontWeight: '800' as const },
  whiteContentContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    marginTop: 4,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    paddingHorizontal: 6,
    paddingTop: 10,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 16,
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '92%',
    maxWidth: 520,
    borderRadius: 26,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EAEAEA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 12,
  },
  modalCloseX: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EEF2F5',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    elevation: 5,
  },
  modalImage: { width: '100%', height: 180, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, marginBottom: 12, backgroundColor: '#F0F0F0' },
  modalImageWrap: { alignItems: 'center', marginTop: 10 },
  modalImageCentered: { width: '88%', maxWidth: 360, height: 220, borderRadius: 18, backgroundColor: '#F3F4F6', alignSelf: 'center' },
  modalImportantBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 193, 7, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  modalImportantText: { marginLeft: 6, color: '#B08400', fontSize: 12, fontWeight: '800' },
  modalTitle: { fontSize: 20, fontWeight: '900', marginBottom: 6, color: '#1F2937' },
  modalTitle1: { fontSize: 20, fontWeight: '900', marginBottom: 6, color: '#F7B220FF' },
  modalDesc: { fontSize: 14, lineHeight: 20, color: '#111827', marginBottom: 12 },
  modalDateRow: { flexDirection: 'row', alignItems: 'center' },
  modalDateText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '800',
    color: '#1B5E20',
    backgroundColor: 'rgba(76, 175, 80, 0.18)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
});

// เพิ่ม stylesNotif ด้านล่างสุดของไฟล์
const stylesNotif = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 400,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 60,
    paddingRight: 10,
  },
  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
  },
  dropdown: {
    width: 310,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  dropTitle: {
    fontSize: 16,
    fontWeight: '800',
    flex: 1,
    color: '#1E293B',
  },
  markAll: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  loading: { fontSize: 13, color: '#64748B', paddingVertical: 10 },
  empty: { fontSize: 13, color: '#64748B', paddingVertical: 10 },
  itemRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  itemTitle: { fontSize: 13, fontWeight: '700', color: '#334155' },
  itemSub: { fontSize: 11, color: '#64748B', marginTop: 2 },
  footerBtn: {
    marginTop: 8,
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  footerText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
