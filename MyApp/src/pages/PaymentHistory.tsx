import React, { useContext, useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Platform, TouchableOpacity, Modal, Pressable, Image } from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showAlert } from '../components/GlobalAlert';
import { NavigationRouteContext } from '@react-navigation/native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { BASE_HOST, BASE_PORT } from './config';

const getBaseUrl = () => `http://${Platform.OS === 'android' ? BASE_HOST : BASE_HOST}:${BASE_PORT}`;

type Payment = {
  id: number;
  house_number: string;
  area_sq_m: number | null;
  rate_per_sqm: number;
  months: number;
  amount_per_month: number;
  total_amount: number;
  note?: string | null;
  created_at: string;
};

type PaymentInstallment = {
  id: number;
  payment_id: number;
  installment_no: number;
  months_span: number;
  due_date: string;
  amount: number;
  status: 'pending' | 'paid' | 'overdue' | 'waiting_approval';
  paid_at?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  paid_method?: 'cash' | 'promptpay' | 'bank_transfer' | null;
  paid_note?: string | null;
  proof_image?: string | null;
  paid_by?: string | null;
};

type Props = {
   house?: string;
   houseNumber?: string | null;
   onGoQr?: () => void;
   darkMode?: boolean;
  isAdmin?: boolean; // เพิ่มตัวบอกสิทธิ์
};

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const addMonths = (date: Date, months: number) => {
  const d = new Date(date.getTime());
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
};
const pad2 = (n: number) => String(n).padStart(2, '0');
const fmtDate = (d: Date) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
const fmtDateTime = (d: Date) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const paidMethodLabel: Record<NonNullable<PaymentInstallment['paid_method']>, string> = {
  cash: 'เงินสด',
  promptpay: 'PromptPay',
  bank_transfer: 'โอนธนาคาร',
};
// parse 'YYYY-MM-DD HH:mm:ss' หรือ 'YYYY-MM-DDTHH:mm:ss' -> Date (โซนท้องถิ่น ป้องกันพลาด timezone)
const parseMySqlDateTime = (s: string) => {
  if (!s) return new Date();
  // ถ้ามี T หรือ Z หรือ + แสดงว่าเป็น ISO format ให้ใช้ new Date() parse ตามปกติ (จะได้ตาม timezone เครื่อง)
  if (s.includes('T') || s.includes('Z') || s.includes('+')) {
    return new Date(s);
  }
  // กรณี date string แบบบ้านๆ (MySQL เก่า) ไม่มี timezone -> parse เป็น local date components
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (!m) return new Date(s);
  return new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4] || 0),
    Number(m[5] || 0),
    Number(m[6] || 0)
  );
};
// parse 'YYYY-MM-DD' -> Date (local)
const parseMySqlDate = (s?: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

const QR_AMOUNT_KEY = 'qr_amount';
const QR_INTENT_KEY = 'qr_intent_id';
const QR_INSTALLMENT_KEY = 'qr_installment_id';

const PaymentHistory: React.FC<Props> = ({ house: propHouse, houseNumber, isAdmin, onGoQr }) => {
  const routeContext = useContext(NavigationRouteContext);
  const routeParams = (routeContext?.params ?? {}) as { houseNumber?: string; house?: string };
  const paramHouse =
    (routeParams.houseNumber as string | undefined) ||
    (routeParams.house as string | undefined) ||
    undefined;
  const fromHouseNumber = houseNumber || undefined;
  const house = propHouse ?? fromHouseNumber ?? paramHouse; // บ้านที่ต้องการดูจริง

  const [items, setItems] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [instMap, setInstMap] = useState<Record<number, PaymentInstallment[]>>({});
  const [instLoading, setInstLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isAdminView, setIsAdminView] = useState<boolean>(!!isAdmin);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetStep, setSheetStep] = useState<'status' | 'method' | 'proof' | 'confirm_status' | 'confirm_notify'>('status');
  const [pendingMethod, setPendingMethod] = useState<PaymentInstallment['paid_method'] | null>(null);
  const [proofImage, setProofImage] = useState<{ uri: string; type: string; fileName: string } | null>(null);
  const [sheetRow, setSheetRow] = useState<PaymentInstallment | null>(null);
  const [sheetBusy, setSheetBusy] = useState(false);

  // ImageViewer state
  const [viewImageUri, setViewImageUri] = useState<string | null>(null);

  // ดึงบทบาทผู้ใช้จาก /auth/me
  const fetchRole = useCallback(async () => {
    try {
      const base = getBaseUrl();
      const token = await AsyncStorage.getItem('token');
      if (!token) { setIsAdminView(!!isAdmin); return; }
      const res = await fetch(`${base}/auth/me`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      });
      const ct = res.headers.get('content-type') || '';
      const json = ct.includes('application/json') ? await res.json() : null;
      if (res.ok && json) {
        const data = json.data || json.user || json;
        const role = String((data?.role ?? data?.user?.role ?? '') || '').toLowerCase();
        const adminFlag =
          !!(data?.isAdmin || data?.is_admin) ||
          role === 'admin' || role === 'administrator' || role === 'staff' || role === 'superadmin';
        setIsAdminView(adminFlag);
        setIsSuperAdmin(role === 'superadmin');
      } else {
        setIsAdminView(!!isAdmin);
      }
    } catch {
      setIsAdminView(!!isAdmin);
    }
  }, [isAdmin]);

  const loadData = useCallback(async (opts: { showSpinner?: boolean; refreshStatus?: boolean } = {}) => {
    const { showSpinner = false, refreshStatus = false } = opts;
    try {
      if (showSpinner) setLoading(true);
      setError(null);

      const base = getBaseUrl();
      const url = house
        ? `${base}/payments/history/${encodeURIComponent(String(house))}`
        : `${base}/payments`;

      const token = await AsyncStorage.getItem('token');
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      // อัปเดตสถานะ overdue อัตโนมัติก่อนดึง (ไม่บล็อกถ้าพัง)
      if (refreshStatus) {
        try {
          await fetch(`${base}/payment-installments/refresh-status`, { method: 'POST', headers });
        } catch {}
      }

      const res = await fetch(url, { headers });
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        const text = await res.text();
        throw new Error(`Unexpected response (${res.status}): ${text.slice(0, 120)}`);
      }

      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Error fetching payment history');

      const list: Payment[] = Array.isArray(json.data) ? json.data : [];
      const filtered = house
        ? list.filter((p) => String(p.house_number) === String(house))
        : list;

      setItems(filtered);

      // ดึงงวดของแต่ละ payment จากตาราง payment_installments (ทำแบบขนาน)
      const instHeaders: Record<string, string> = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };
      if (token) instHeaders.Authorization = `Bearer ${token}`;
      setInstLoading(true);
      const pairs = await Promise.all(
        filtered.map(async (p) => {
          try {
            const res2 = await fetch(`${base}/payments/${p.id}/installments`, { headers: instHeaders });
            const j2 = await res2.json().catch(() => ({}));
            const arr: PaymentInstallment[] = res2.ok && Array.isArray(j2?.data) ? j2.data : [];
            return [p.id, arr] as [number, PaymentInstallment[]];
          } catch {
            return [p.id, []] as [number, PaymentInstallment[]];
          }
        })
      );
      setInstMap(Object.fromEntries(pairs));
      setInstLoading(false);
    } catch (e: any) {
      setError(e?.message || 'An error occurred');
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [house]);

  useEffect(() => {
    (async () => {
       try {
        await fetchRole();
        await loadData({ showSpinner: true, refreshStatus: true });
       } catch (e: any) {
        // already handled inside loadData
       } finally {
        //
       }
     })();
  }, [house, loadData, fetchRole]);
 
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchRole();
      await loadData({ showSpinner: false, refreshStatus: true });
    } finally {
      setRefreshing(false);
    }
  }, [loadData, fetchRole]);

  // ส่งยอดไปหน้า QR (เก็บใน AsyncStorage แล้วเรียกหน้า QR)
  const createPaymentIntent = useCallback(
    async (row: PaymentInstallment, houseNum?: string | number) => {
      try {
        const base = getBaseUrl();
        const token = await AsyncStorage.getItem('token');
        const res = await fetch(`${base}/payment-intents`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            installment_id: row.id,
            payment_id: row.payment_id,
            house_number: houseNum ?? house, // ใช้ค่าที่ส่งมา หรือ fallback เป็นบ้านที่กำลังดู
            amount: row.amount,
            method: 'promptpay',
          }),
        });
        const j = await res.json().catch(() => ({}));
        return res.ok && j?.ok && j?.data?.id ? Number(j.data.id) : null;
      } catch {
        return null;
      }
    },
    [house]
  );

  // ไปหน้า QR (บันทึก amount, installment_id และ intentId)
  const goQr = useCallback(
    async (row: PaymentInstallment, houseNum?: string | number) => {
      try {
        await AsyncStorage.setItem(QR_AMOUNT_KEY, String(row.amount));
        await AsyncStorage.setItem(QR_INSTALLMENT_KEY, String(row.id));
        const intentId = await createPaymentIntent(row, houseNum);
        if (intentId) await AsyncStorage.setItem(QR_INTENT_KEY, String(intentId));
      } catch {}
      onGoQr?.();
    },
    [createPaymentIntent, onGoQr]
 );

  // เรียก backend เพื่ออัปเดตสถานะ (เฉพาะแอดมิน)
  const updateInstallmentStatus = useCallback(async (
    id: number,
    status: 'paid' | 'pending' | 'overdue' | 'waiting_approval',
    paid_method?: 'cash' | 'promptpay' | 'bank_transfer',
    paid_note?: string
  ) => {
    const base = getBaseUrl();
    const token = await AsyncStorage.getItem('token');
    const res = await fetch(`${base}/payment-installments/${id}`, {
      method: 'PATCH',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ status, paid_method, paid_note }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j?.ok) throw new Error(j?.message || 'อัปเดตสถานะไม่สำเร็จ');
    await loadData({ showSpinner: false, refreshStatus: true });
  }, [loadData]);

  // เปิดแผ่นสถานะ
  const openStatusSheet = useCallback((row: PaymentInstallment) => {
    setSheetRow(row);
    setSheetStep('status');
    setSheetOpen(true);
  }, []);

  const closeSheet = useCallback(() => {
    if (sheetBusy) return;
    setSheetOpen(false);
    setSheetRow(null);
    setProofImage(null);
    setPendingMethod(null);
    setPendingStatus(null);
  }, [sheetBusy]);

  // เลือกสถานะ
  // แจ้งเตือนยอดชำระ
  const notifyPayment = useCallback(async (row: PaymentInstallment, status: string) => {
    try {
      const base = getBaseUrl();
      const token = await AsyncStorage.getItem('token');
      await fetch(`${base}/chat/notify-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ installment_id: row.id, status }),
      });
      showAlert('สำเร็จ', 'ส่งการแจ้งเตือนเรียบร้อยแล้ว');
    } catch {}
  }, []);

  const [pendingStatus, setPendingStatus] = useState<'pending' | 'overdue' | 'waiting_approval' | null>(null);

  // เลือกสถานะ
  const chooseStatus = useCallback(async (row: PaymentInstallment, status: 'paid' | 'pending' | 'overdue' | 'waiting_approval') => {
    if (status === 'paid') {
      setSheetStep('method');
      return;
    }

    // New Logic: If editing 'paid' item
    if (sheetRow?.status === 'paid' && !isSuperAdmin) {
      showAlert(
        'ขออนุมัติแก้ไข',
        'การแก้ไขสถานะ "ชำระแล้ว" ต้องได้รับการอนุมัติ\nต้องการส่งคำขอหรือไม่?',
        [
          { text: 'ยกเลิก', style: 'cancel' },
          { 
            text: 'ส่งคำขอ', 
            onPress: async () => {
              try {
                setSheetBusy(true);
                // Directly call update to waiting_approval
                await updateInstallmentStatus(row.id, 'waiting_approval');
                showAlert('สำเร็จ', 'ส่งคำขออนุมัติแล้ว กรุณารอ Super Admin ตรวจสอบ');
                closeSheet();
              } catch (e: any) {
                showAlert('ผิดพลาด', e?.message || 'ส่งคำขอไม่สำเร็จ');
              } finally {
                setSheetBusy(false);
              }
            } 
          }
        ]
      );
      return;
    }

    // เปลี่ยนไปใช้หน้า Confirm แทน Alert
    setPendingStatus(status);
    setSheetStep('confirm_status');
  }, [sheetRow, isSuperAdmin, closeSheet, updateInstallmentStatus]);

  // ดำเนินการเปลี่ยนสถานะ (จากหน้า Confirm)
  const confirmChangeStatus = async (notify: boolean) => {
    if (!sheetRow || !pendingStatus) return;
    try {
      setSheetBusy(true);
      await updateInstallmentStatus(sheetRow.id, pendingStatus);
      if (notify) {
        await notifyPayment(sheetRow, pendingStatus);
      }
      closeSheet();
    } catch (e: any) {
      showAlert('ผิดพลาด', e?.message || 'อัปเดตไม่สำเร็จ');
    } finally {
      setSheetBusy(false);
    }
  };


  const chooseMethod = useCallback(async (row: PaymentInstallment, method: NonNullable<PaymentInstallment['paid_method']>) => {
    try {
      setSheetBusy(true);
      if (method === 'cash' || method === 'bank_transfer') {
        // ถ้าเป็นเงินสด หรือ โอนธนาคาร ให้ไปหน้า Proof
        setSheetBusy(false);
        setPendingMethod(method);
        setSheetStep('proof');
        return;
      }
      await updateInstallmentStatus(row.id, 'paid', method);
      closeSheet();
    } catch (e: any) {
      showAlert('ผิดพลาด', e?.message || 'อัปเดตไม่สำเร็จ');
    } finally {
      if (sheetStep !== 'proof') { // ถ้าไปหน้า proof ไม่ต้องปิด busy
         setSheetBusy(false);
      }
    }
  }, [updateInstallmentStatus, closeSheet, sheetStep]);

  const handleChooseImage = async () => {
    try {
      const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.8 });
      if (result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setProofImage({ uri: asset.uri!, type: asset.type!, fileName: asset.fileName || 'upload.jpg' });
      }
    } catch (e) {
      console.warn(e);
    }
  };

  const handleTakePhoto = async () => {
    try {
      const result = await launchCamera({ mediaType: 'photo', quality: 0.8 });
      if (result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setProofImage({ uri: asset.uri!, type: asset.type!, fileName: asset.fileName || 'capture.jpg' });
      }
    } catch (e) {
      console.warn(e);
    }
  };

  const confirmPaymentWithProof = async () => {
    if (!sheetRow) return;
    try {
      setSheetBusy(true);
      const base = getBaseUrl();
      const token = await AsyncStorage.getItem('token');
      
      const formData = new FormData();
      formData.append('status', 'paid');
      formData.append('paid_method', pendingMethod || 'cash');
      
      if (proofImage) {
        formData.append('file', {
          uri: proofImage.uri,
          type: proofImage.type,
          name: proofImage.fileName,
        } as any);
      }

      const res = await fetch(`${base}/payment-installments/${sheetRow.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'multipart/form-data',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.message || 'อัปเดตสถานะไม่สำเร็จ');

      await loadData({ showSpinner: false, refreshStatus: true });
      closeSheet();
    } catch (e: any) {
      showAlert('ผิดพลาด', e?.message || 'อัปเดตไม่สำเร็จ');
    } finally {
      setSheetBusy(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator /></View>;
  if (error) return <View style={styles.center}><Text style={styles.errorText}>{error}</Text></View>;

  const renderFallbackSchedule = (count: number, start: Date, m: number, perInstallment: number | null) => {
    const dates: Date[] = Array.from({ length: count }, (_, i) => addMonths(start, m * (i + 1)));
    const overdueIdx = dates
      .map((d, i) => ({ d, i }))
      .filter(({ d }) => {
        const today = new Date();
        const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
        const tk = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        return tk < t0;
      })
      .map(x => x.i);
    if (overdueIdx.length > 0) {
      return (
        <>
          <Text style={styles.listHeader}>รายการค้างชำระ</Text>
          {overdueIdx.map((i) => (
            <View key={i} style={styles.userInstRow}>
              <View style={styles.userCol}>
                <Text style={styles.userLabel}>วันที่</Text>
                <Text style={styles.userValue}>{fmtDate(dates[i])}</Text>
              </View>
              <View style={styles.userCol}>
                <Text style={styles.userLabel}>จำนวนเงิน</Text>
                <Text style={styles.userValue}>{fmt(perInstallment || 0)} บาท</Text>
              </View>
              <View style={styles.userStatusCol}>
                <Text style={[styles.userStatus, styles.userStatusOverdue]}>ค้างชำระ</Text>
              </View>
            </View>
          ))}
        </>
      );
    }
    const last = dates[dates.length - 1];
    return (
      <>
        <Text style={styles.listHeader}>กำหนดชำระ (งวดล่าสุด)</Text>
        <View style={styles.userInstRow}>
          <View style={styles.userCol}>
            <Text style={styles.userLabel}>วันที่</Text>
            <Text style={styles.userValue}>{fmtDate(last)}</Text>
          </View>
          <View style={styles.userCol}>
            <Text style={styles.userLabel}>จำนวนเงิน</Text>
            <Text style={styles.userValue}>{fmt(perInstallment || 0)} บาท</Text>
          </View>
          <View style={styles.userStatusCol}>
            <Text style={[styles.userStatus, styles.userStatusPending]}>กำลังดำเนินการ</Text>
          </View>
        </View>
      </>
    );
  };

  const renderInstallmentSection = (item: Payment) => {
    const list = instMap[item.id] || [];
    if (instLoading) return <Text style={styles.scheduleHeader}>กำลังโหลดงวด…</Text>;
    if (list.length > 0) {
      const start = parseMySqlDateTime(item.created_at);
      if (isAdminView) {
        return (
          <View style={styles.mt10}>
            <Text style={styles.scheduleHeader}>
              งวดละ {fmt(list[0].amount)} บาท · {list.length} งวด (เริ่ม {fmtDate(start)})
            </Text>
            <View style={styles.scheduleWrap}>
              {list.map((row) => {
                const st = getInstallmentStatus(row);
                let chipStyle;
                if (st === 'paid') {
                  chipStyle = styles.chipPaid;
                } else if (st === 'overdue') {
                  chipStyle = styles.chipOverdue;
                } else if (st === 'waiting_approval') {
                  chipStyle = styles.chipWaitingApproval;
                } else {
                  chipStyle = styles.chipPending;
                }
                return (
                  <TouchableOpacity
                    key={row.id}
                    activeOpacity={0.8}
                    onPress={() => openStatusSheet(row)}
                    style={[styles.scheduleItem, chipStyle]}
                  >
                    <Text style={styles.scheduleRound}>งวด {row.installment_no}</Text>
                    <Text style={styles.scheduleDate}>{fmtDate(parseMySqlDateTime(row.due_date))}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      }

      const overdueList = pickOverdueInstallments(list);
      if (overdueList.length > 0) {
        return (
          <View style={styles.mt10}>
            <Text style={styles.listHeader}>รายการค้างชำระ</Text>
            {overdueList.map((row) => (
              <TouchableOpacity key={row.id} style={styles.userInstRow} activeOpacity={0.8}
                onPress={() => goQr(row, item.house_number)}>
                <View style={styles.userCol}>
                  <Text style={styles.userLabel}>วันที่</Text>
                  <Text style={styles.userValue}>{fmtDate(parseMySqlDateTime(row.due_date))}</Text>
                </View>
                <View style={styles.userCol}>
                  <Text style={styles.userLabel}>จำนวนเงิน</Text>
                  <Text style={styles.userValue}>{fmt(row.amount)} บาท</Text>
                </View>
                <View style={styles.userStatusCol}>
                  <Text style={[styles.userStatus, styles.userStatusOverdue]}>ค้างชำระ</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        );
      }

      const latest = pickNextInstallment(list);
      if (!latest) return null;
      const status = getInstallmentStatus(latest);
      const statusLabel =
        status === 'paid' ? 'ชำระเรียบร้อย' :
        status === 'overdue' ? 'ค้างชำระ' : 'กำลังดำเนินการ';
      const statusStyle =
        status === 'paid'
          ? styles.userStatusPaid
          : status === 'overdue'
          ? styles.userStatusOverdue
          : styles.userStatusPending;
      return (
        <View style={styles.mt10}>
          <Text style={styles.listHeader}>กำหนดชำระ (งวดล่าสุด)</Text>
          <TouchableOpacity style={styles.userInstRow} activeOpacity={0.8}
            onPress={() => goQr(latest, item.house_number)}>
            <View style={styles.userCol}>
              <Text style={styles.userLabel}>วันที่</Text>
              <Text style={styles.userValue}>{fmtDate(parseMySqlDateTime(latest.due_date))}</Text>
            </View>
            <View style={styles.userCol}>
              <Text style={styles.userLabel}>จำนวนเงิน</Text>
              <Text style={styles.userValue}>{fmt(latest.amount)} บาท</Text>
            </View>
            <View style={styles.userStatusCol}>
              <Text style={[styles.userStatus, statusStyle]}>{statusLabel}</Text>
              {status === 'paid' && (
                <Text style={styles.userStatusMeta}>
                  {(latest.paid_method && paidMethodLabel[latest.paid_method]) || '—'} • {latest.paid_at ? fmtDateTime(parseMySqlDateTime(latest.paid_at)) : '—'}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        </View>
      );
    }

    // fallback คำนวณเอง (กรณี B ยังไม่มี)
    const m = Number(item.months) || 0;
    const start = parseMySqlDateTime(item.created_at);
    const count = m > 0 ? Math.floor(12 / m) : 0;
    const perInstallment = m > 0 ? item.amount_per_month * m : null;
    if (!count) return null;
    const schedule = Array.from({ length: count }, (_, i) => fmtDate(addMonths(start, m * (i + 1))));
    if (isAdminView) {
      return (
        <View style={styles.mt10}>
          <Text style={styles.scheduleHeader}>
            งวดละ {fmt(perInstallment || 0)} บาท · {count} งวด (เริ่ม {fmtDate(start)})
          </Text>
          <View style={styles.scheduleWrap}>
            {schedule.map((label, idx) => (
              <View key={idx} style={styles.scheduleItem}>
                <Text style={styles.scheduleRound}>งวด {idx + 1}</Text>
                <Text style={styles.scheduleDate}>{label}</Text>
              </View>
            ))}
          </View>
        </View>
      );
    }
    return (
      <View style={styles.mt10}>
        {renderFallbackSchedule(count, start, m, perInstallment)}
      </View>
    );
  };

  return (
    <View style={styles.flex1}>
      <FlatList
         data={items}
         keyExtractor={it => String(it.id)}
         contentContainerStyle={styles.contentContainer}
         refreshing={refreshing}
         onRefresh={onRefresh}
         renderItem={({ item }) => (
           <View style={styles.card}>
             <View style={styles.cardHeader}>
               <Ionicons name="receipt-outline" size={18} color="#111" />
               <Text style={styles.title}>บ้านเลขที่ {item.house_number}</Text>
               <Text style={styles.date}>  🕐{fmtDateTime(parseMySqlDateTime(item.created_at))}</Text>
             </View>
             <View style={styles.row}>
               <Text style={styles.label}>พื้นที่ใช้สอย:</Text>
               <Text style={styles.val}>{fmt(item.area_sq_m || 0)} ตร.ม.</Text>
             </View>
             <View style={styles.row}>
               <Text style={styles.label}>อัตราต่อ ตร.ม.:</Text>
               <Text style={styles.val}>{fmt(item.rate_per_sqm)} บาท</Text>
             </View>
             <View style={styles.row}>
               <Text style={styles.label}>จำนวนเงินต่อเดือน:</Text>
               <Text style={styles.val}>{fmt(item.amount_per_month)} บาท</Text>
             </View>
             <View style={styles.row}>
               <Text style={styles.label}>จำนวนเดือน:</Text>
               <Text style={styles.val}>{item.months} เดือน</Text>
             </View>
             <View style={[styles.row, styles.mt6]}>
               <Text style={[styles.label, styles.bold800]}>รวม:</Text>
               <Text style={[styles.val, styles.cardTitle]}>{fmt(item.total_amount)} บาท</Text>
             </View>
             {renderInstallmentSection(item)}
             {!!item.note && <Text style={styles.note}>หมายเหตุ: {item.note}</Text>}
           </View>
         )}
       />
       {/* Bottom Sheet: เปลี่ยนสถานะ / วิธีชำระ */}
      <Modal visible={sheetOpen} transparent animationType="fade" onRequestClose={closeSheet}>
        <Pressable style={styles.sheetBackdrop} onPress={closeSheet}>
          <View />
        </Pressable>
        <View style={styles.sheet}>
          {!!sheetRow && (
            <>
              <View style={styles.sheetHeader}>
                <View style={styles.sheetHandle} />
                <Text style={styles.sheetTitle}>
                  {sheetStep === 'status' ? 'เปลี่ยนสถานะงวด' : 'เลือกวิธีชำระ'}
                </Text>
                <Text style={styles.sheetSubtitle}>
                  งวด {sheetRow.installment_no} • {fmtDate(parseMySqlDateTime(sheetRow.due_date))}
                </Text>
                {sheetRow.paid_at && (
                  <View style={styles.sheetPaidInfo}>
                    <Text style={styles.sheetMeta}>
                      ชำระเมื่อ {fmtDateTime(parseMySqlDateTime(sheetRow.paid_at))}{' '}
                      {sheetRow.paid_method ? `• ${paidMethodLabel[sheetRow.paid_method]}` : ''}
                    </Text>
                     {sheetRow.paid_by && <Text style={styles.sheetMeta}>ยืนยันโดย: {sheetRow.paid_by}</Text>}
                     {sheetRow.proof_image && (
                        <Pressable 
                          style={styles.sheetProofPress} 
                          onPress={() => setViewImageUri(`${getBaseUrl()}/${sheetRow.proof_image}`)}
                        >
                          <Image 
                            source={{ uri: `${getBaseUrl()}/${sheetRow.proof_image}` }} 
                            style={styles.sheetProofImage}
                            resizeMode="cover"
                          />
                          <Text style={styles.sheetProofHint}>แตะเพื่อดูรูป</Text>
                        </Pressable>
                     )}
                  </View>
                )}
              </View>

              {sheetStep === 'status' ? (
                <View style={styles.sheetOptions}>
                  {sheetRow.status !== 'paid' && (
                    <Pressable
                      disabled={sheetBusy}
                      onPress={() => chooseStatus(sheetRow, 'paid')}
                      style={[styles.optBtn, styles.optPrimary, sheetBusy && styles.optDisabled]}
                    >
                      <Ionicons name="checkmark-done-outline" size={18} color="#0F5132" />
                      <Text style={[styles.optText, styles.colorPaid]}>ชำระแล้ว</Text>
                    </Pressable>
                  )}
                  <Pressable
                    disabled={sheetBusy}
                    onPress={() => chooseStatus(sheetRow, 'pending')}
                    style={[styles.optBtn, styles.optNeutral, sheetBusy && styles.optDisabled]}
                  >
                    <Ionicons name="time-outline" size={18} color="#5A4500" />
                    <Text style={[styles.optText, styles.colorPending]}>รอชำระ</Text>
                  </Pressable>
                  <Pressable
                    disabled={sheetBusy}
                    onPress={() => chooseStatus(sheetRow, 'overdue')}
                    style={[styles.optBtn, styles.optDanger, sheetBusy && styles.optDisabled]}
                  >
                    <Ionicons name="warning-outline" size={18} color="#7F1D1D" />
                    <Text style={[styles.optText, styles.colorOverdue]}>ค้างชำระ</Text>
                  </Pressable>
                </View>
              ) : sheetStep === 'confirm_status' ? (
                <View style={styles.sheetOptions}>
                   <View style={styles.confirmSection}>
                      <View style={[styles.confirmIconCircle, pendingStatus === 'pending' ? styles.confirmIconPending : styles.confirmIconOverdue]}>
                        <Ionicons 
                          name={pendingStatus === 'pending' ? 'time-outline' : 'warning-outline'} 
                          size={28} 
                          color={pendingStatus === 'pending' ? '#B45309' : '#B91C1C'} 
                        />
                      </View>
                      <Text style={styles.confirmTitle}>
                        ยืนยันการเปลี่ยนสถานะ
                      </Text>
                      <Text style={styles.confirmSubtitle}>
                         ต้องการเปลี่ยนสถานะเป็น "{pendingStatus === 'pending' ? 'รอชำระ' : 'ค้างชำระ'}" ใช่หรือไม่?
                      </Text>
                   </View>

                   <Pressable
                     disabled={sheetBusy}
                     onPress={() => setSheetStep('confirm_notify')}
                     style={[styles.optBtn, styles.optNotify, sheetBusy && styles.optDisabled]}
                   >
                     <Ionicons name="notifications-outline" size={20} color="#0369A1" />
                     <Text style={[styles.optText, styles.colorNotify]}>เปลี่ยนสถานะและแจ้งเตือน</Text>
                   </Pressable>

                   <Pressable
                     disabled={sheetBusy}
                     onPress={() => confirmChangeStatus(false)}
                     style={[styles.optBtn, styles.optNeutral, styles.optCenter, sheetBusy && styles.optDisabled]}
                   >
                     <Ionicons name="create-outline" size={20} color="#374151" />
                     <Text style={[styles.optText, styles.colorNeutral]}>เปลี่ยนสถานะเท่านั้น</Text>
                   </Pressable>
                </View>
              ) : sheetStep === 'confirm_notify' ? (
                <View style={styles.sheetOptions}>
                   <View style={styles.confirmSection}>
                      <View style={[styles.confirmIconCircle, styles.confirmIconSuccess]}>
                        <Ionicons 
                          name="notifications" 
                          size={28} 
                          color="#059669" 
                        />
                      </View>
                      <Text style={styles.confirmTitle}>
                        ยืนยันการแจ้งเตือน
                      </Text>
                      <Text style={styles.confirmSubtitle}>
                         คุณต้องการส่งข้อความแจ้งเตือนไปยังลูกบ้านใช่หรือไม่?
                      </Text>
                   </View>

                   <Pressable
                     disabled={sheetBusy}
                     onPress={() => confirmChangeStatus(true)}
                     style={[styles.optBtn, styles.optConfirmSend, sheetBusy && styles.optDisabled]}
                   >
                     {sheetBusy ? <ActivityIndicator color="#fff" /> : <Text style={[styles.optText, styles.colorWhite]}>ยืนยันการส่ง</Text>}
                   </Pressable>

                   <Pressable
                     disabled={sheetBusy}
                     onPress={() => setSheetStep('confirm_status')}
                     style={[styles.optBtn, styles.optNeutral, styles.optCenter, sheetBusy && styles.optDisabled]}
                   >
                     <Text style={[styles.optText, styles.colorNeutral]}>ยกเลิก</Text>
                   </Pressable>
                </View>
              ) : sheetStep === 'proof' ? (
                <View style={styles.sheetOptions}>
                   <View style={styles.proofImageRow}>
                     {proofImage ? (
                       <Image source={{ uri: proofImage.uri }} style={styles.proofImage} resizeMode="cover" />
                     ) : (
                       <View style={styles.proofPlaceholder}>
                         <Ionicons name="image-outline" size={48} color="#ccc" />
                         <Text style={styles.proofPlaceholderText}>ไม่มีรูป</Text>
                       </View>
                     )}
                   </View>
                   
                   <View style={styles.proofButtonsRow}>
                     <Pressable onPress={handleTakePhoto} style={[styles.optBtn, styles.optWhite]}>
                        <Ionicons name="camera-outline" size={20} color="#333" />
                        <Text style={[styles.optText, styles.colorDark]}>ถ่ายรูป</Text>
                     </Pressable>
                     <Pressable onPress={handleChooseImage} style={[styles.optBtn, styles.optWhite]}>
                        <Ionicons name="images-outline" size={20} color="#333" />
                        <Text style={[styles.optText, styles.colorDark]}>เลือกรูป</Text>
                     </Pressable>
                   </View>

                   <Pressable
                     disabled={sheetBusy || !proofImage}
                     onPress={confirmPaymentWithProof}
                     style={[styles.optBtn, styles.optPrimary, (sheetBusy || !proofImage) && styles.optDisabled, styles.optCenter]}
                   >
                     {sheetBusy ? <ActivityIndicator color="#0F5132" /> : <Text style={[styles.optText, styles.colorPaid]}>ยืนยันการชำระเงิน</Text>}
                   </Pressable>
                </View>
              ) : (
                <View style={styles.sheetOptions}>
                  <Pressable
                    disabled={sheetBusy}
                    onPress={() => chooseMethod(sheetRow, 'cash')}
                    style={[styles.optBtn, styles.optNeutral, sheetBusy && styles.optDisabled]}
                  >
                    <Ionicons name="cash-outline" size={18} color="#111827" />
                    <Text style={[styles.optText, styles.colorDarkText]}>เงินสด</Text>
                  </Pressable>
                  <Pressable
                    disabled={sheetBusy}
                    onPress={() => chooseMethod(sheetRow, 'bank_transfer')}
                    style={[styles.optBtn, styles.optNeutral, sheetBusy && styles.optDisabled]}
                  >
                    <Ionicons name="swap-horizontal-outline" size={18} color="#111827" />
                    <Text style={[styles.optText, styles.colorDarkText]}>โอนธนาคาร</Text>
                  </Pressable>
                </View>
              )}

              <View style={styles.sheetFooter}>
                {sheetStep === 'method' ? (
                  <Pressable disabled={sheetBusy} onPress={() => setSheetStep('status')} style={styles.footerBtn}>
                    <Text style={styles.footerBtnText}>ย้อนกลับ</Text>
                  </Pressable>
                ) : sheetStep === 'proof' ? (
                  <Pressable disabled={sheetBusy} onPress={() => setSheetStep('method')} style={styles.footerBtn}>
                    <Text style={styles.footerBtnText}>ย้อนกลับ</Text>
                  </Pressable>
                ) : sheetStep === 'confirm_status' ? (
                  <Pressable disabled={sheetBusy} onPress={() => setSheetStep('status')} style={styles.footerBtn}>
                    <Text style={styles.footerBtnText}>ย้อนกลับ</Text>
                  </Pressable>
                ) : (
                  <View />
                )}
                <Pressable disabled={sheetBusy} onPress={closeSheet} style={styles.footerBtn}>
                  <Text style={styles.footerBtnText}>ปิด</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </Modal>

      {/* Image Viewer Modal */}
      <Modal visible={!!viewImageUri} transparent animationType="fade" onRequestClose={() => setViewImageUri(null)}>
        <View style={styles.imageViewerOverlay}>
          <Pressable style={styles.imageViewerClose} onPress={() => setViewImageUri(null)}>
            <Ionicons name="close-circle" size={36} color="#fff" />
          </Pressable>
          {viewImageUri && (
            <Image 
              source={{ uri: viewImageUri }} 
              style={styles.imageViewerImage} 
            />
          )}
        </View>
      </Modal>
    </View>
  );
};

export default PaymentHistory;

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  mt6: { marginTop: 6 },
  mt10: { marginTop: 10 },
  bold800: { fontWeight: '800' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: '#D32F2F',
  },
  contentContainer: {
    padding: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardTitle: {
    fontWeight: '800',
    color: '#0F9D58',
  },
  chipWaitingApproval: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  chipPaid: { backgroundColor: '#D1FAE5' },
  chipPending: { backgroundColor: '#FEF3C7' },
  chipOverdue: { backgroundColor: '#FEE2E2' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  title: { fontWeight: '800', fontSize: 15, marginLeft: 6 },
  date: { color: '#666', fontSize: 12 },
  label: { color: '#444', fontWeight: '700' },
  val: { color: '#111', fontWeight: '700' },
  note: { color: '#666', marginTop: 8 },
  scheduleHeader: { color: '#4B5563', fontSize: 12, marginTop: 6, marginBottom: 6 },
  scheduleWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  scheduleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 6,
    marginBottom: 6,
  },
  scheduleRound: { fontWeight: '800', fontSize: 12, color: '#2563EB', marginRight: 6 },
  scheduleDate: { fontWeight: '700', fontSize: 12, color: '#111827' },
  listHeader: { color: '#374151', fontSize: 12, marginBottom: 6 },
  instRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  // ===== User list styles (simple 3-column pill) =====
  userInstRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF1F4',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  userCol: { flex: 1 },
  userLabel: { fontSize: 11, fontWeight: '700', color: '#667085' },
  userValue: { fontSize: 13, fontWeight: '800', color: '#111827', marginTop: 2 },
  userStatusCol: { minWidth: 90, alignItems: 'flex-end' },
  userStatus: { fontSize: 12, fontWeight: '800' },
  userStatusPaid: { color: '#22A06B' },
  userStatusPending: { color: '#665C00' },
  userStatusOverdue: { color: '#C0392B' },
  instTitle: { fontWeight: '800', fontSize: 13, color: '#111827' },
  instSub: { fontWeight: '600', fontSize: 12, color: '#6B7280', marginTop: 2 },
  instAmount: { fontWeight: '800', fontSize: 12, color: '#111827', marginRight: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontWeight: '800', fontSize: 11 },
  badgePaid: { backgroundColor: '#D1FAE5' },
  badgePending: { backgroundColor: '#FEF3C7' },
  badgeOverdue: { backgroundColor: '#FEE2E2' },
  // จุดสถานะ (user fallback)
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#666',
    marginTop: 2,
  },
  dotPaid: { backgroundColor: '#22A06B' },
  dotPending: { backgroundColor: '#FEF3C7' },
  dotOverdue: { backgroundColor: '#C0392B' },
  userStatusMeta: { fontSize: 11, color: '#6B7280', marginTop: 2, fontWeight: '700', textAlign: 'right' },
  // ----- Bottom Sheet -----
  sheetBackdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 12,
  },
  sheetHeader: { paddingTop: 8, paddingHorizontal: 16, paddingBottom: 6, alignItems: 'center' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', marginBottom: 8 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  sheetSubtitle: { fontSize: 12, fontWeight: '700', color: '#6B7280', marginTop: 4 },
  sheetMeta: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', marginTop: 2 },
  sheetOptions: { paddingHorizontal: 12, paddingTop: 6 },
  optBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginHorizontal: 4,
    marginVertical: 6,
    borderWidth: 1,
  },
  optText: { marginLeft: 10, fontSize: 14, fontWeight: '800' },
  optPrimary: { backgroundColor: '#E8FFF3', borderColor: '#C6F6D5' },
  optNeutral: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' },
  optDanger: { backgroundColor: '#FFE8E8', borderColor: '#FECACA' },
  optDisabled: { opacity: 0.6 },
  sheetFooter: {
    paddingHorizontal: 12,
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerBtn: { paddingHorizontal: 16, paddingVertical: 10 },
  footerBtnText: { fontWeight: '800', color: '#2563EB' },
  // Sheet paid info
  sheetPaidInfo: { marginTop: 4, alignItems: 'center' },
  sheetProofPress: { marginTop: 8, alignItems: 'center' },
  sheetProofImage: { width: 100, height: 100, borderRadius: 6, backgroundColor: '#eee' },
  sheetProofHint: { fontSize: 11, color: '#666', marginTop: 2 },
  // Option text colors
  colorPaid: { color: '#0F5132' },
  colorPending: { color: '#5A4500' },
  colorOverdue: { color: '#7F1D1D' },
  colorNotify: { color: '#0369A1' },
  colorNeutral: { color: '#374151' },
  colorWhite: { color: '#fff' },
  colorDarkText: { color: '#111827' },
  colorDark: { fontSize: 13, color: '#333' },
  // Confirm section
  confirmSection: { alignItems: 'center', marginBottom: 16, paddingHorizontal: 16 },
  confirmIconCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  confirmIconPending: { backgroundColor: '#FEF3C7' },
  confirmIconOverdue: { backgroundColor: '#FEE2E2' },
  confirmIconSuccess: { backgroundColor: '#ECFDF5' },
  confirmTitle: { fontSize: 16, fontWeight: '800', color: '#111827', textAlign: 'center' },
  confirmSubtitle: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginTop: 4 },
  // Option button variants
  optCenter: { justifyContent: 'center' },
  optNotify: { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD', justifyContent: 'center' },
  optConfirmSend: { justifyContent: 'center', backgroundColor: '#059669', borderColor: '#059669' },
  optWhite: { backgroundColor: '#fff', borderColor: '#ccc' },
  // Proof section
  proofImageRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 12 },
  proofImage: { width: 120, height: 160, borderRadius: 8, backgroundColor: '#eee' },
  proofPlaceholder: { width: 120, height: 160, borderRadius: 8, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center' },
  proofPlaceholderText: { fontSize: 12, color: '#999', marginTop: 8 },
  proofButtonsRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 16 },
  // Image viewer
  imageViewerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  imageViewerClose: { position: 'absolute', top: 40, right: 20, zIndex: 10 },
  imageViewerImage: { width: '90%', height: '80%', resizeMode: 'contain' },
});

// เลือก "งวดล่าสุดสำหรับผู้ใช้" โดยให้ค้างชำระมาก่อน (อิงสถานะ DB และ period_end)
const pickNextInstallment = (list: PaymentInstallment[]) => {
  if (!list || list.length === 0) return null;
  const today = new Date();
  const todayKey = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const time = (r: PaymentInstallment) => parseMySqlDateTime(r.due_date).getTime();
  const notPaid = (r: PaymentInstallment) => r.status !== 'paid';

  // 1) ถ้ามีค้างชำระ (จาก DB หรือ period_end < วันนี้) ให้แสดงตัวที่ใกล้วันนี้ที่สุดก่อน
  const overdue = list
    .filter((r) => {
      if (!notPaid(r)) return false;
      if (r.status === 'overdue') return true; // ยึดตาม DB
      const pe = parseMySqlDate(r.period_end);
      const peKey = pe ? pe.getTime() : null;
      // ถ้าเลย period_end แล้วก็ถือว่าค้างชำระ
      if (peKey != null && peKey < todayKey) return true;
      // เดิม: ถ้า due_date เลยแล้ว
      return time(r) < todayKey;
    })
    .sort((a, b) => time(b) - time(a));
  if (overdue.length) return overdue[0];

  // 2) ถ้าไม่มีก็ค้นหางวดถัดไปจากวันนี้ (ยังไม่จ่าย)
  const upcoming = list.filter((r) => notPaid(r) && time(r) >= todayKey).sort((a, b) => time(a) - time(b));
  if (upcoming.length) return upcoming[0];

  // 3) จ่ายครบแล้ว -> แสดงรายการที่วันที่มากสุด
  const allPaid = [...list].sort((a, b) => time(b) - time(a));
  return allPaid[0];
};

// คำนวณสถานะเพื่อโชว์ (ให้เคารพ DB overdue และ period_end)
const getInstallmentStatus = (r: PaymentInstallment): 'pending' | 'paid' | 'overdue' | 'waiting_approval' => {
  if (!r) return 'pending';
  if (r.status === 'paid') return 'paid';
  if (r.status === 'waiting_approval') return 'waiting_approval';
  // ถ้า DB เป็น overdue ให้แสดง overdue ทันที
  if (r.status === 'overdue') return 'overdue';
  const today = new Date();
  const todayKey = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const pe = parseMySqlDate(r.period_end);
  if (pe && pe.getTime() < todayKey) return 'overdue';
  const t = parseMySqlDateTime(r.due_date).getTime();
  return t < todayKey ? 'overdue' : 'pending';
};

// รายการค้างชำระทั้งหมด (ยังไม่จ่าย และเป็น overdue ตาม DB หรือ period_end หรือ due_date)
const pickOverdueInstallments = (list: PaymentInstallment[]) => {
  const today = new Date();
  const todayKey = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const time = (r: PaymentInstallment) => parseMySqlDateTime(r.due_date).getTime();
  const notPaid = (r: PaymentInstallment) => r.status !== 'paid';
  return list
    .filter((r) => {
      if (!notPaid(r)) return false;
      if (r.status === 'overdue') return true;
      const pe = parseMySqlDate(r.period_end);
      if (pe && pe.getTime() < todayKey) return true;
      return time(r) < todayKey;
    })
    .sort((a, b) => time(a) - time(b)); // ใกล้ปัจจุบันก่อน
};


