import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Platform,
  ActivityIndicator, KeyboardAvoidingView, Modal, TouchableWithoutFeedback, Keyboard, ScrollView,
  Linking,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { BASE_HOST, BASE_PORT } from './config';             // FIX import

type Resident = {
  id: number;
  house_number: string;
  title?: string | null;
  first_name: string;
  last_name?: string | null;
  phone?: string | null;
  household_count: number;
  car_count: number;
  area_sq_m?: number | null;
  pay_months?: number | null; // ✅ จำนวนเดือนที่ชำระ
  created_at?: string | null;  // ✅ สำหรับคำนวณนับจากวันสร้าง (ถ้ามีจาก backend)
  total_amount?: number | null;
};

type PaymentSummary = {
  months: number;
  total_amount: number | null;
  amount_per_month: number | null;
};

const ANDROID_HOST = BASE_HOST;
export function getBaseUrl() {
  const host = Platform.OS === 'android' ? ANDROID_HOST : BASE_HOST;
  return `http://${host}:${BASE_PORT}`;
} 
// แนบ token อัตโนมัติ และกันการ parse เมื่อไม่ได้รับ JSON
async function apiFetchJson(url: string, init: RequestInit = {}) {
  const token = await AsyncStorage.getItem('token');
  const headers: any = {
    Accept: 'application/json',
    ...(init.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  // ใส่ Content-Type ให้อัตโนมัติเมื่อมี body
  if ((init as any).body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, { ...init, headers });
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const text = await res.text();
    throw new Error(`Unexpected response (${res.status}): ${text.slice(0, 120)}…`);
  }
  const json = await res.json();
  return { res, json };
}

type Props = { darkMode: boolean };

const COLORS = {
  bg: '#FFFFFF',
  text: '#2F2F2F',
  subtext: '#7A7A7A',
  line: '#EEF2F5',
  green: '#47B263',
  greenSoft: '#E9F7EE',
  orange: '#FFA21A',
  red: '#EF5350',
  number: '#272727FF',
};

const ResidentForm: React.FC<{
  visible: boolean;
  darkMode: boolean;
  colors: any;
  mode: 'add' | 'edit';
  initial?: Resident | null;
  saving: boolean;
  existingList?: Resident[];
  onClose: () => void;
  onSubmit: (payload: Omit<Resident, 'id'> & { username?: string; password?: string }) => void;
}> = ({ visible, darkMode, colors, mode, initial, saving, existingList = [], onClose, onSubmit }) => {
  const [house, setHouse] = useState(initial?.house_number ?? '');
  const [title, setTitle] = useState<string>(initial?.title ?? '');
  const [fname, setFname] = useState(initial?.first_name ?? '');
  const [lname, setLname] = useState(initial?.last_name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [members, setMembers] = useState(String(initial?.household_count ?? 1));
  const [cars, setCars] = useState(String(initial?.car_count ?? 0));
  const [area, setArea] = useState(initial?.area_sq_m != null ? String(initial.area_sq_m) : '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [payMonths, setPayMonths] = useState(initial?.pay_months != null ? String(initial.pay_months) : ''); // ✅ dropdown
  const [totalAmount, setTotalAmount] = useState(initial?.total_amount != null ? String(initial.total_amount) : '');
  // เพิ่ม state สำหรับ error ของเบอร์โทร
  const [phoneError, setPhoneError] = useState(false);
  const [houseError, setHouseError] = useState(false);
  const [titleError, setTitleError] = useState(false);
  const [fnameError, setFnameError] = useState(false);
  const [lnameError, setLnameError] = useState(false);
  const [membersError, setMembersError] = useState(false);
  const [carsError, setCarsError] = useState(false);
  const [areaError, setAreaError] = useState(false);
  const [usernameError, setUsernameError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [payMonthsError, setPayMonthsError] = useState(false);
  const [monthsOpen, setMonthsOpen] = useState(false);
  const [_totalAmountError, setTotalAmountError] = useState(false);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [showAccountStep, setShowAccountStep] = useState(false);
  const [showPaymentStep, setShowPaymentStep] = useState(false);
  const [showConfirmChange, setShowConfirmChange] = useState(false);
  const [dupeMessages, setDupeMessages] = useState<string[]>([]);
  const [alertModal, setAlertModal] = useState<{ title: string; message: string } | null>(null);

  const themed = useMemo(() => StyleSheet.create({
    modalCard: { backgroundColor: colors.cardBg, borderColor: colors.line },
    modalTitleText: { color: colors.text },
    modalLabelText: { color: colors.subtext },
    modalLabelTextMb12: { color: colors.subtext, marginBottom: 12 },
    inputThemed: { color: colors.text, borderColor: colors.line },
    dropdownBorder: { borderColor: colors.line },
    dropdownText: { color: colors.text },
    scheduleHint: { color: colors.subtext },
    scheduleAmount: { color: colors.text },
    scheduleDate: { color: colors.text },
    selectCard: { backgroundColor: colors.cardBg, borderColor: colors.line },
    optionText: { color: colors.text },
    confirmCard: { backgroundColor: colors.cardBg, borderColor: colors.line },
    confirmTitle: { color: colors.text },
    confirmUnit: { color: colors.subtext },
    dupeCard: { backgroundColor: colors.cardBg, borderColor: colors.line },
    dupeTitle: { color: colors.text },
    dupeSubtitle: { color: colors.subtext },
    dupeRow: { backgroundColor: darkMode ? '#2A1A1A' : '#FFF5F5' },
    dupeRowText: { color: colors.text },
    alertCard: { backgroundColor: colors.cardBg, borderColor: colors.line },
    alertTitle: { color: colors.text },
    alertMessage: { color: colors.subtext },
  }), [colors, darkMode]);

  // Allowed months options
  const allowedMonths = useMemo(() => [1, 3, 6, 12], []);
  const TITLE_OPTIONS = ['นาย', 'นาง', 'นางสาว', 'Mr.', 'Mrs.', 'Ms.', 'Miss', 'Dr.', 'ไม่ระบุ'];
  const [titleOpen, setTitleOpen] = useState(false);

 // วันเริ่มนับ: ใช้วันสร้างถ้ามี (โหมดแก้ไข), ไม่งั้นใช้วันนี้
 const startDate = useMemo(() => {
   if (mode === 'edit' && initial?.created_at) {
     const d = new Date(initial.created_at);
     return isNaN(d.getTime()) ? new Date() : d;
   }
   return new Date();
 }, [mode, initial]);

 // helper เพิ่มเดือนแบบปลอดภัย
 const addMonths = (date: Date, months: number) => {
   const d = new Date(date.getTime());
   const day = d.getDate();
   d.setMonth(d.getMonth() + months);
   // ถ้าเดือนปลายทางวันหาย (ปลายเดือน) ให้ถอยไปวันสุดท้ายของเดือน
   if (d.getDate() < day) d.setDate(0);
   return d;
 };

 const pad2 = (n: number) => String(n).padStart(2, '0');
 const fmtDate = useCallback((d: Date) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`, []);

 const formatAmount = (value: number) =>
   Number.isFinite(value)
     ? value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
     : '-';

 const totalAmountNumber = useMemo(() => {
   const trimmed = totalAmount.trim();
   if (!trimmed) return null;
   const n = Number(trimmed);
   return Number.isFinite(n) ? n : null;
 }, [totalAmount]);

 // ตารางชำระภายใน 1 ปี ถัดจากวันเริ่ม
 const schedule = useMemo(() => {
    const pm = Number(payMonths || 0);
    if (!Number.isInteger(pm) || !allowedMonths.includes(pm)) return [];
    const count = 12 / pm;
    const out: { label: string; date: Date }[] = [];
    for (let i = 1; i <= count; i++) {
      const due = addMonths(startDate, pm * i);
      out.push({ label: fmtDate(due), date: due });
    }
    return out;
  }, [payMonths, startDate, allowedMonths, fmtDate]);

 // งวดละ = ยอดต่อเดือนจาก payments × จำนวนเดือนที่เลือก
 const pmNumber = useMemo(() => {
   const n = Number(payMonths || 0);
   return Number.isInteger(n) ? n : 0;
 }, [payMonths]);

 const perInstallmentFromPayment = useMemo(() => {
   if (paymentSummary?.amount_per_month == null) return null;
   if (!allowedMonths.includes(pmNumber) || pmNumber <= 0) return null;
   return paymentSummary.amount_per_month * pmNumber;
 }, [paymentSummary, pmNumber, allowedMonths]);

 // fallback: ใช้ยอดรวม ÷ จำนวนงวด (ได้ค่าเดียวกันถ้ายอดรวมเป็นทั้งปี)
 const perInstallmentFallback = useMemo(() => {
   return schedule.length && totalAmountNumber != null
     ? totalAmountNumber / schedule.length
     : null;
 }, [schedule.length, totalAmountNumber]);

 const perInstallment = perInstallmentFromPayment ?? perInstallmentFallback;

 const yearlyTotal = useMemo(() => {
   if (paymentSummary?.amount_per_month != null) return paymentSummary.amount_per_month * 12;
   if (totalAmountNumber != null) return totalAmountNumber;
   return null;
 }, [paymentSummary, totalAmountNumber]);

  useEffect(() => {
    setHouse(initial?.house_number ?? '');
    setTitle(initial?.title ?? '');
    setFname(initial?.first_name ?? '');
    setLname(initial?.last_name ?? '');
    setPhone(initial?.phone ?? '');
    setMembers(String(initial?.household_count ?? 1));
    setCars(String(initial?.car_count ?? 0));
    setArea(initial?.area_sq_m != null ? String(initial.area_sq_m) : '');
    setPayMonths(initial?.pay_months != null ? String(initial.pay_months) : '');
    setTotalAmount(initial?.total_amount != null ? String(initial.total_amount) : '');
    setUsername('');                 // reset เพิ่ม
    setPassword('');                 // reset เพิ่ม
    setMonthsOpen(false);            // กัน dropdown ค้าง
    setTitleOpen(false);
    setShowAccountStep(false);
    setShowPaymentStep(false);
    setShowConfirmChange(false);
    setDupeMessages([]);

    // reset errors
    setPhoneError(false);
    setHouseError(false);
    setTitleError(false);
    setFnameError(false);
    setLnameError(false);
    setMembersError(false);
    setCarsError(false);
    setAreaError(false);
    setUsernameError(false);
    setPasswordError(false);
    setPayMonthsError(false);
    setTotalAmountError(false);
  }, [initial, visible]);

  // ดึงข้อมูลล่าสุดจากตาราง payments ตามบ้านเลขที่ (โหมดแก้ไข)
  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (mode !== 'edit' || !initial?.house_number) {
        if (alive) setPaymentSummary(null);
        return;
      }
      try {
        setPaymentLoading(true);
        // ปรับ endpoint ให้ตรงกับฝั่ง backend ของคุณ
        const { res, json } = await apiFetchJson(
          `${getBaseUrl()}/payments/latest?house_number=${encodeURIComponent(initial.house_number)}`
        );
        if (!alive) return;
        if (res.ok && json?.ok && json?.data) {
          const d = json.data;
          const months = Number(d.months) || 0;
          const amount_per_month = d.amount_per_month != null ? Number(d.amount_per_month) : null;
          const total_amount = d.total_amount != null ? Number(d.total_amount) : null;
          setPaymentSummary({ months, amount_per_month, total_amount });
          // sync dropdown เดือนถ้าอยู่ในชุดที่อนุญาต
          if (months && [1, 3, 6, 12].includes(months)) {
            setPayMonths(String(months));
            setPayMonthsError(false);
          }
          // เติมยอดรวมอัตโนมัติถ้ายังไม่ได้กรอก
          if (!totalAmount && total_amount != null) {
            setTotalAmount(String(total_amount));
            setTotalAmountError(false);
          }
        } else {
          setPaymentSummary(null);
        }
      } catch {
        if (alive) setPaymentSummary(null);
      } finally {
        if (alive) setPaymentLoading(false);
      }
    };
    run();
    return () => { alive = false; };
  }, [mode, initial?.house_number, totalAmount]);

  const submitStep1 = () => {
    // ล้าง error เดิม
    setHouseError(false); setTitleError(false); setFnameError(false); setLnameError(false);
    setPhoneError(false); setMembersError(false); setCarsError(false); setAreaError(false);
    setPayMonthsError(false);
    setTotalAmountError(false);

    const phoneDigits = String(phone || '').replace(/\D/g, '');

    if (mode === 'add') {
      const missing: string[] = [];
      if (!house.trim()) { setHouseError(true); missing.push('บ้านเลขที่'); }
      if (!title || !String(title).trim()) { setTitleError(true); missing.push('คำนำหน้าชื่อ'); }
      if (!fname.trim()) { setFnameError(true); missing.push('ชื่อ'); }
      if (!lname.trim()) { setLnameError(true); missing.push('นามสกุล'); }
      if (!phoneDigits) { setPhoneError(true); missing.push('เบอร์โทรศัพท์'); }
      if (!String(members).trim()) { setMembersError(true); missing.push('จำนวนสมาชิกในบ้าน'); }
      if (String(cars).trim() === '') { setCarsError(true); missing.push('จำนวนรถ'); }
      if (String(area).trim() === '') { setAreaError(true); missing.push('พื้นที่ใช้สอย (ตร.ม.)'); }
      if (missing.length) {
        const list = missing.map(m => `• ${m}`).join('\n');
        setAlertModal({ title: 'กรอกไม่ครบ', message: `กรุณากรอกข้อมูลให้ครบ:\n${list}` });
        return;
      }
    }

    if (phoneDigits.length !== 10) {
      setPhoneError(true);
      setAlertModal({ title: 'เบอร์โทรไม่ถูกต้อง', message: 'กรุณากรอกเบอร์โทรศัพท์ 10 หลัก' });
      return;
    }

    // ตรวจข้อมูลซ้ำ
    const others = mode === 'edit' && initial?.id
      ? existingList.filter(r => r.id !== initial.id)
      : existingList;

    const dupes: string[] = [];
    if (others.some(r => r.house_number === house.trim())) {
      setHouseError(true);
      dupes.push(`บ้านเลขที่ "${house.trim()}" มีอยู่แล้ว`);
    }
    if (others.some(r => r.first_name === fname.trim() && (r.last_name || '') === lname.trim())) {
      setFnameError(true); setLnameError(true);
      dupes.push(`ชื่อ "${fname.trim()} ${lname.trim()}" มีอยู่แล้ว`);
    }
    if (phoneDigits && others.some(r => (r.phone || '').replace(/\D/g, '') === phoneDigits)) {
      setPhoneError(true);
      dupes.push(`เบอร์โทร "${phoneDigits}" มีอยู่แล้ว`);
    }
    if (dupes.length) {
      setDupeMessages(dupes);
      return;
    }

    // ไปขั้นตอนชำระเงิน (ทั้ง add และ edit)
    setShowPaymentStep(true);
  };

  const submitFinal = () => {
    const phoneDigits = String(phone || '').replace(/\D/g, '');
    const pm = Number(payMonths || 0);

    let totalAmountValue: number | null = null;
    const totalAmountTrimmed = totalAmount.trim();
    if (totalAmountTrimmed !== '') {
      const parsed = Number(totalAmountTrimmed);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setTotalAmountError(true);
        setAlertModal({ title: 'จำนวนเงินไม่ถูกต้อง', message: 'กรุณากรอกจำนวนเงินรวมเป็นตัวเลขไม่ติดลบ' });
        return;
      }
      totalAmountValue = parsed;
    }

    const basePayload: Omit<Resident, 'id'> = {
      house_number: house.trim(),
      title: title ? title : null,
      first_name: fname.trim(),
      last_name: lname.trim() || null,
      phone: phoneDigits,
      household_count: Math.max(0, Number(members || '0')),
      car_count: Math.max(0, Number(cars || '0')),
      area_sq_m: area !== '' && !Number.isNaN(Number(area)) ? Number(area) : undefined,
      pay_months: pm,
      total_amount: totalAmountValue,
    } as any;

    if (mode === 'add') {
      onSubmit({ ...basePayload, username: username.trim(), password: password });
    } else {
      onSubmit(basePayload);
    }
  };

  const submitAccount = () => {
    setUsernameError(false);
    setPasswordError(false);
    const missing: string[] = [];
    if (!username.trim()) { setUsernameError(true); missing.push('User ID'); }
    if (!password.trim()) { setPasswordError(true); missing.push('Password'); }
    if (missing.length) {
      setAlertModal({ title: 'กรอกไม่ครบ', message: `กรุณากรอก:\n${missing.map(m => `• ${m}`).join('\n')}` });
      return;
    }
    submitFinal();
  };

  return (
    <>
    {/* ขั้นตอน 1: ข้อมูลพื้นฐาน */}
    <Modal visible={visible && !showPaymentStep && !showAccountStep} transparent animationType="fade" onRequestClose={() => !saving && onClose()}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalCenter}>
            <View style={[styles.modalCard, themed.modalCard]}>
              <View style={styles.modalTitleRow}>
                <Text style={[styles.modalTitle, themed.modalTitleText, styles.modalTitleInline]}>
                  {mode === 'add' ? 'เพิ่มผู้พักอาศัย' : 'แก้ไขข้อมูลผู้พักอาศัย'}
                </Text>
                <View style={styles.pageBadge}>
                  <Text style={styles.pageBadgeText}>{mode === 'add' ? '1/3' : '1/2'}</Text>
                </View>
              </View>
              <ScrollView
                contentContainerStyle={styles.scrollPadBottom}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={[styles.modalLabel, themed.modalLabelText]}>บ้านเลขที่ <Text style={styles.required}>*</Text></Text>
                <TextInput
                  value={house}
                  onChangeText={(t)=>{ setHouse(t); if (t.trim()) setHouseError(false); }}
                  placeholder="เช่น 101"
                  placeholderTextColor={darkMode ? '#888' : '#9AA3AB'}
                  style={[styles.input, themed.inputThemed, houseError && styles.inputError]}
                  keyboardType="number-pad"
                  inputMode="numeric"
                />

                <Text style={[styles.modalLabel, themed.modalLabelText, styles.mt10]}>คำนำหน้าชื่อ <Text style={styles.required}>*</Text></Text>
                <TouchableOpacity
                  onPress={() => setTitleOpen(true)}
                  activeOpacity={0.8}
                  style={[
                    styles.input,
                    styles.dropdownRow,
                    themed.dropdownBorder,
                    titleError && styles.inputError,
                  ]}
                >
                  <Text style={[styles.dropdownText, themed.dropdownText]}>
                    {title ? title : 'เลือกคำนำหน้าชื่อ'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={colors.subtext} />
                </TouchableOpacity>

                {/* ชื่อ-นามสกุล: 2 คอลัมน์ */}
                <View style={styles.row}>
                  <View style={styles.col}>
                    <Text style={[styles.modalLabel, themed.modalLabelText]}>ชื่อ <Text style={styles.required}>*</Text></Text>
                    <TextInput
                      value={fname}
                      onChangeText={(t)=>{ setFname(t); if (t.trim()) setFnameError(false); }}
                      placeholder="ชื่อ"
                      placeholderTextColor={darkMode ? '#888' : '#9AA3AB'}
                      style={[styles.input, themed.inputThemed, fnameError && styles.inputError]}
                    />
                  </View>
                  <View style={styles.col}>
                    <Text style={[styles.modalLabel, themed.modalLabelText]}>นามสกุล <Text style={styles.required}>*</Text></Text>
                    <TextInput
                      value={lname}
                      onChangeText={(t)=>{ setLname(t); if (t.trim()) setLnameError(false); }}
                      placeholder="นามสกุล"
                      placeholderTextColor={darkMode ? '#888' : '#9AA3AB'}
                      style={[styles.input, themed.inputThemed, lnameError && styles.inputError]}
                    />
                  </View>
                </View>

                {/* เบอร์ & พื้นที่: 2 คอลัมน์ */}
                <View style={styles.row}>
                  <View style={styles.col}>
                    <Text style={[styles.modalLabel, themed.modalLabelText]}>เบอร์โทรศัพท์ <Text style={styles.required}>*</Text></Text>
                    <TextInput
                      value={phone}
                      onChangeText={(t) => {
                        const d = t.replace(/\D/g, '').slice(0, 10);
                        setPhone(d);
                        setPhoneError(d.length !== 10);
                      }}
                      placeholder="0812345678"
                      placeholderTextColor={darkMode ? '#888' : '#9AA3AB'}
                      style={[styles.input, themed.inputThemed, phoneError && styles.inputError]}
                      keyboardType="number-pad"
                      inputMode="numeric"
                      maxLength={10}
                    />
                  </View>
                  <View style={styles.col}>
                    <Text style={[styles.modalLabel, themed.modalLabelText]}>พื้นที่ใช้สอย (ตร.ม.) <Text style={styles.required}>*</Text></Text>
                    <TextInput
                      value={area}
                      onChangeText={(t)=>{ const d=t.replace(/\D/g,''); setArea(d); if (d !== '') setAreaError(false); }}
                      placeholder="0"
                      placeholderTextColor={darkMode ? '#888' : '#9AA3AB'}
                      style={[styles.input, themed.inputThemed, areaError && styles.inputError]}
                      keyboardType="number-pad"
                      inputMode="numeric"
                    />
                  </View>
                </View>

                {/* สมาชิก & รถ: 2 คอลัมน์ */}
                <View style={[styles.row, styles.mt10]}>
                  <View style={styles.col}>
                    <Text style={[styles.modalLabel, themed.modalLabelText]}>จำนวนสมาชิกในบ้าน <Text style={styles.required}>*</Text></Text>
                    <TextInput
                      value={members}
                      onChangeText={(t)=>{ const d=t.replace(/\D/g,''); setMembers(d); if (d) setMembersError(false); }}
                      placeholder="1"
                      placeholderTextColor={darkMode ? '#888' : '#9AA3AB'}
                      style={[styles.input, themed.inputThemed, membersError && styles.inputError]}
                      keyboardType="number-pad"
                      inputMode="numeric"
                    />
                  </View>
                  <View style={styles.col}>
                    <Text style={[styles.modalLabel, themed.modalLabelText]}>จำนวนรถ <Text style={styles.required}>*</Text></Text>
                    <TextInput
                      value={cars}
                      onChangeText={(t)=>{ const d=t.replace(/\D/g,''); setCars(d); if (d !== '') setCarsError(false); }}
                      placeholder="0"
                      placeholderTextColor={darkMode ? '#888' : '#9AA3AB'}
                      style={[styles.input, themed.inputThemed, carsError && styles.inputError]}
                      keyboardType="number-pad"
                      inputMode="numeric"
                    />
                  </View>
                </View>

              </ScrollView>
              
              {/* Modal เลือกคำนำหน้าชื่อ */}
              <Modal visible={titleOpen} transparent animationType="fade" onRequestClose={() => setTitleOpen(false)}>
                <TouchableWithoutFeedback onPress={() => setTitleOpen(false)}>
                  <View style={styles.modalBackdrop} />
                </TouchableWithoutFeedback>
                <View style={styles.selectCenter}>
                  <View style={[styles.selectCard, themed.selectCard]}>
                    <Text style={[styles.modalTitle, themed.modalTitleText]}>เลือกคำนำหน้าชื่อ</Text>
                    <ScrollView style={styles.maxH280}>
                      {TITLE_OPTIONS.map((t) => {
                        const selected = title === t;
                        return (
                          <TouchableOpacity
                            key={t}
                            onPress={() => { setTitle(t); setTitleError(false); setTitleOpen(false); }}
                            style={[styles.optionRow, selected && styles.optionRowActive]}
                          >
                            <Text style={[styles.optionText, themed.optionText]}>{t}</Text>
                            {selected && <Ionicons name="checkmark" size={18} color="#10B981" />}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                </View>
              </Modal>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalCancel]}
                  onPress={() => { setUsername(''); setPassword(''); setMonthsOpen(false); setShowAccountStep(false); setShowPaymentStep(false); onClose(); }}
                  disabled={saving}
                >
                  <Text style={styles.modalCancelText}>ยกเลิก</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, styles.modalSave]} onPress={submitStep1} disabled={saving}>
                  <Text style={styles.modalSaveText}>ถัดไป</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>

    {/* ขั้นตอน 2: ชำระเงิน */}
    <Modal visible={visible && showPaymentStep && !showAccountStep && !showConfirmChange} transparent animationType="fade" onRequestClose={() => !saving && setShowPaymentStep(false)}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalBackdrop}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalCenter}>
              <View style={[styles.modalCard, themed.modalCard]}>
                <View style={styles.modalTitleRow}>
                  <Text style={[styles.modalTitle, themed.modalTitleText, styles.modalTitleInline]}>ตั้งค่าการชำระ</Text>
                  <View style={styles.pageBadge}>
                    <Text style={styles.pageBadgeText}>{mode === 'add' ? '2/3' : '2/2'}</Text>
                  </View>
                </View>
                <Text style={[styles.modalLabel, themed.modalLabelTextMb12]}>
                  บ้านเลขที่ {house} — {title} {fname} {lname}
                </Text>

                <ScrollView
                  contentContainerStyle={styles.scrollPadBottom}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {/* ชำระเงินล่วงหน้า (Dropdown) */}
                  <Text style={[styles.modalLabel, themed.modalLabelText]}>
                    ชำระเงินล่วงหน้า (เดือน) <Text style={styles.required}>*</Text>
                  </Text>
                  <TouchableOpacity
                    onPress={() => setMonthsOpen(true)}
                    activeOpacity={0.8}
                    style={[
                      styles.input,
                      styles.dropdownRow,
                      themed.dropdownBorder,
                      payMonthsError && styles.inputError,
                    ]}
                  >
                    <Text style={[styles.dropdownText, themed.dropdownText]}>
                      {payMonths ? `${payMonths} เดือน` : 'เลือกจำนวนเดือน'}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color={colors.subtext} />
                  </TouchableOpacity>

                  {/* ตารางชำระ */}
                  {!!schedule.length && (
                    <View style={styles.mt8}>
                      <Text style={[styles.modalLabel, themed.modalLabelText, styles.mb6]}>
                        ตารางชำระครบ 1 ปี: {schedule.length} งวด (เริ่ม {fmtDate(startDate)})
                      </Text>
                      {paymentLoading ? (
                        <View style={styles.scheduleSummary}>
                          <ActivityIndicator size="small" color={colors.subtext} />
                          <Text style={[styles.scheduleHint, themed.scheduleHint]}> กำลังดึงข้อมูลตารางชำระ</Text>
                        </View>
                      ) : perInstallment != null ? (
                        <View style={styles.scheduleSummary}>
                          <Text style={[styles.scheduleAmount, themed.scheduleAmount]}>
                            งวดละ {formatAmount(perInstallment)} บาท
                          </Text>
                          {yearlyTotal != null && (
                            <Text style={[styles.scheduleHint, themed.scheduleHint]}>
                              รวม {formatAmount(yearlyTotal)} บาท/ปี
                            </Text>
                          )}
                        </View>
                      ) : (
                        <Text style={[styles.scheduleHint, themed.scheduleHint, styles.mb6]}>
                          ยังไม่มีข้อมูลยอดต่องวด
                        </Text>
                      )}
                      <View style={styles.scheduleWrap}>
                        {schedule.map((s, idx) => (
                          <View
                            key={idx}
                            style={[
                              styles.scheduleItem,
                              darkMode ? styles.scheduleItemDark : styles.scheduleItemLight,
                            ]}
                          >
                            <Text style={[styles.scheduleRound, darkMode ? styles.scheduleRoundDark : styles.scheduleRoundLight]}>
                              งวด {idx + 1}
                            </Text>
                            <Text style={[styles.scheduleDate, themed.scheduleDate]}>{s.label}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Modal เลือกเดือน */}
                  <Modal visible={monthsOpen} transparent animationType="fade" onRequestClose={() => setMonthsOpen(false)}>
                    <TouchableWithoutFeedback onPress={() => setMonthsOpen(false)}>
                      <View style={styles.modalBackdrop} />
                    </TouchableWithoutFeedback>
                    <View style={styles.selectCenter}>
                      <View style={[styles.selectCard, themed.selectCard]}>
                        <Text style={[styles.modalTitle, themed.modalTitleText]}>เลือกจำนวนเดือน</Text>
                        <ScrollView style={styles.maxH280}>
                          {allowedMonths.map((m) => {
                            const v = String(m);
                            const selected = payMonths === v;
                            return (
                              <TouchableOpacity
                                key={v}
                                onPress={() => { setPayMonths(v); setPayMonthsError(false); setMonthsOpen(false); }}
                                style={[styles.optionRow, selected && styles.optionRowActive]}
                              >
                                <Text style={[styles.optionText, themed.optionText]}>{v} เดือน</Text>
                                {selected && <Ionicons name="checkmark" size={18} color="#10B981" />}
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      </View>
                    </View>
                  </Modal>
                </ScrollView>

                <View style={[styles.modalActions, styles.mt10]}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalCancel]}
                    onPress={() => setShowPaymentStep(false)}
                    disabled={saving}
                  >
                    <Text style={styles.modalCancelText}>ย้อนกลับ</Text>
                  </TouchableOpacity>
                  {mode === 'add' ? (
                    <TouchableOpacity style={[styles.modalBtn, styles.modalSave]} onPress={() => {
                      const pm = Number(payMonths || 0);
                      if (!Number.isInteger(pm) || !allowedMonths.includes(pm)) {
                        setPayMonthsError(true);
                        setAlertModal({ title: 'จำนวนเดือนไม่ถูกต้อง', message: 'กรุณาเลือกจำนวนเดือน 1, 3, 6 หรือ 12' });
                        return;
                      }
                      setShowAccountStep(true);
                    }} disabled={saving}>
                      <Text style={styles.modalSaveText}>ถัดไป</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={[styles.modalBtn, styles.modalSave]} onPress={() => {
                      const pm = Number(payMonths || 0);
                      if (!Number.isInteger(pm) || !allowedMonths.includes(pm)) {
                        setPayMonthsError(true);
                        setAlertModal({ title: 'จำนวนเดือนไม่ถูกต้อง', message: 'กรุณาเลือกจำนวนเดือน 1, 3, 6 หรือ 12' });
                        return;
                      }
                      // ถ้างวดเปลี่ยน → ยืนยันก่อน
                      const origPm = initial?.pay_months;
                      if (origPm != null && Number(origPm) !== pm) {
                        setShowConfirmChange(true);
                        return;
                      }
                      submitFinal();
                    }} disabled={saving}>
                      {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalSaveText}>บันทึก</Text>}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Modal ยืนยันการเปลี่ยนงวด */}
      <Modal visible={visible && showConfirmChange} transparent animationType="fade" onRequestClose={() => setShowConfirmChange(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCenter}>
            <View style={[styles.confirmCard, themed.confirmCard]}>
              <Text style={styles.confirmEmoji}>💵</Text>
              <Text style={[styles.confirmTitle, themed.confirmTitle]}>ยืนยันการเปลี่ยนงวด</Text>

              <View style={styles.confirmCompare}>
                <View style={styles.confirmBox}>
                  <Text style={styles.confirmBoxLabel}>เดิม</Text>
                  <Text style={[styles.confirmBoxValue, styles.confirmBoxValueOld]}>{initial?.pay_months ?? '-'}</Text>
                </View>
                <Ionicons name="arrow-forward" size={22} color={colors.subtext} style={styles.mh10} />
                <View style={styles.confirmBox}>
                  <Text style={[styles.confirmBoxLabel, styles.confirmBoxLabelNew]}>ใหม่</Text>
                  <Text style={[styles.confirmBoxValue, styles.confirmBoxValueNew]}>{payMonths}</Text>
                </View>
              </View>
              <Text style={[styles.confirmUnit, themed.confirmUnit]}>เดือน / งวด</Text>

              <View style={styles.confirmActions}>
                <TouchableOpacity
                  style={[styles.confirmBtn, styles.confirmBtnCancel]}
                  onPress={() => setShowConfirmChange(false)}
                >
                  <Text style={styles.confirmBtnCancelText}>ยกเลิก</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmBtn, styles.confirmBtnSave]}
                  onPress={() => { setShowConfirmChange(false); submitFinal(); }}
                  disabled={saving}
                >
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : (
                    <View style={styles.rowCenterGap6}>
                      <Ionicons name="save-outline" size={16} color="#fff" />
                      <Text style={styles.confirmBtnSaveText}>บันทึก</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ขั้นตอน 3: สร้างบัญชีผู้ใช้ (add only) */}
      <Modal visible={visible && showPaymentStep && showAccountStep} transparent animationType="fade" onRequestClose={() => !saving && setShowAccountStep(false)}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalBackdrop}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalCenter}>
              <View style={[styles.modalCard, themed.modalCard]}>
                <View style={styles.modalTitleRow}>
                  <Text style={[styles.modalTitle, themed.modalTitleText, styles.modalTitleInline]}>สร้างบัญชีผู้ใช้</Text>
                  <View style={styles.pageBadge}>
                    <Text style={styles.pageBadgeText}>3/3</Text>
                  </View>
                </View>
                <Text style={[styles.modalLabel, themed.modalLabelTextMb12]}>
                  บ้านเลขที่ {house} — {title} {fname} {lname}
                </Text>

                <Text style={[styles.modalLabel, themed.modalLabelText]}>User ID <Text style={styles.required}>*</Text></Text>
                <TextInput
                  value={username}
                  onChangeText={(t) => { setUsername(t); if (t.trim()) setUsernameError(false); }}
                  placeholder="เช่น user101"
                  placeholderTextColor={darkMode ? '#888' : '#9AA3AB'}
                  style={[styles.input, themed.inputThemed, usernameError && styles.inputError]}
                  autoCapitalize="none"
                />

                <Text style={[styles.modalLabel, themed.modalLabelText, styles.mt10]}>Password <Text style={styles.required}>*</Text></Text>
                <TextInput
                  value={password}
                  onChangeText={(t) => { setPassword(t); if (t.trim()) setPasswordError(false); }}
                  placeholder="••••••"
                  placeholderTextColor={darkMode ? '#888' : '#9AA3AB'}
                  style={[styles.input, themed.inputThemed, passwordError && styles.inputError]}
                  secureTextEntry
                />

                <View style={[styles.modalActions, styles.mt10]}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalCancel]}
                    onPress={() => { setShowAccountStep(false); }}
                    disabled={saving}
                  >
                    <Text style={styles.modalCancelText}>ย้อนกลับ</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modalBtn, styles.modalSave]} onPress={submitAccount} disabled={saving}>
                    {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalSaveText}>บันทึก</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      {/* Modal ข้อมูลซ้ำ */}
      <Modal visible={visible && dupeMessages.length > 0} transparent animationType="fade" onRequestClose={() => setDupeMessages([])}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCenter}>
            <View style={[styles.dupeCard, themed.dupeCard]}>
              <View style={styles.dupeIconRow}>
                <View style={styles.dupeIconCircle}>
                  <Ionicons name="alert-circle" size={32} color="#EF5350" />
                </View>
              </View>
              <Text style={[styles.dupeTitle, themed.dupeTitle]}>ข้อมูลซ้ำ</Text>
              <Text style={[styles.dupeSubtitle, themed.dupeSubtitle]}>กรุณาแก้ไขข้อมูลต่อไปนี้</Text>
              {dupeMessages.map((msg, i) => (
                <View key={i} style={[styles.dupeRow, themed.dupeRow]}>
                  <Ionicons name="close-circle" size={18} color="#EF5350" style={styles.mr8} />
                  <Text style={[styles.dupeRowText, themed.dupeRowText]}>{msg}</Text>
                </View>
              ))}
              <TouchableOpacity
                style={styles.dupeBtn}
                onPress={() => setDupeMessages([])}
                activeOpacity={0.85}
              >
                <Text style={styles.dupeBtnText}>รับทราบ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Alert Modal (แทน Alert.alert) */}
      <Modal visible={!!alertModal} transparent animationType="fade" onRequestClose={() => setAlertModal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCenter}>
            <View style={[styles.alertCard, themed.alertCard]}>
              <View style={styles.alertIconRow}>
                <View style={styles.alertIconCircle}>
                  <Ionicons name="warning" size={28} color="#F59E0B" />
                </View>
              </View>
              <Text style={[styles.alertTitle, themed.alertTitle]}>{alertModal?.title}</Text>
              <Text style={[styles.alertMessage, themed.alertMessage]}>{alertModal?.message}</Text>
              <TouchableOpacity
                style={styles.alertOkBtn}
                onPress={() => setAlertModal(null)}
                activeOpacity={0.85}
              >
                <Text style={styles.alertOkBtnText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

const ItemSeparator = () => <View style={styles.separator} />;

const UserManage: React.FC<Props> = ({ darkMode }) => {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const colors = {
    bg: darkMode ? '#121212' : COLORS.bg,
    text: darkMode ? '#FFFFFF' : COLORS.text,
    subtext: darkMode ? '#CCCCCC' : COLORS.subtext,
    line: darkMode ? '#333333' : COLORS.line,
    green: COLORS.green,
    orange: COLORS.orange,
    red: COLORS.red,
    cardBg: darkMode ? '#1E1E1E' : '#FFFFFF',
  };
  const themed = useMemo(() => StyleSheet.create({
    container: { backgroundColor: colors.bg },
    card: { backgroundColor: colors.cardBg, borderColor: colors.line },
    titleText: { color: colors.text },
    cardSubtext: { color: colors.subtext },
    actionBtnOrange: { backgroundColor: colors.orange },
    actionBtnRed: { backgroundColor: colors.red },
    inputThemed: { color: colors.text, borderColor: colors.line },
    addBtnGreen: { backgroundColor: colors.green },
    alertCard: { backgroundColor: colors.cardBg, borderColor: colors.line },
    alertTitle: { color: colors.text },
    alertMessage: { color: colors.subtext },
    phoneActionCard: { backgroundColor: colors.cardBg, borderColor: colors.line },
    phoneActionNumber: { color: colors.text },
    phoneActionRowBorder: { borderColor: colors.line },
    phoneActionRowText: { color: colors.text },
  }), [colors]);

  const BASE_URL = getBaseUrl();
  const [list, setList] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  const [addVisible, setAddVisible] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editItem, setEditItem] = useState<Resident | null>(null);
  const [alertModal2, setAlertModal2] = useState<{ title: string; message: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Resident | null>(null);
  const [phoneAction, setPhoneAction] = useState<string | null>(null);
  const regenerateInstallmentsLatest = useCallback(async (houseNumber: string) => {
    const hn = String(houseNumber || '').trim();
    if (!hn) return;
    try {
      await apiFetchJson(
        `${BASE_URL}/payments/installments/regenerate-latest?house_number=${encodeURIComponent(hn)}`,
        { method: 'POST' }
      );
    } catch (e: any) {
      console.warn('regenerate-latest failed:', e?.message || e);
    }
  }, [BASE_URL]);
  const fetchList = useCallback(async () => {
    try {
      setLoading(true);
      const url = query.trim()
        ? `${BASE_URL}/residents?q=${encodeURIComponent(query.trim())}`
        : `${BASE_URL}/residents`;
      const { res, json } = await apiFetchJson(url);
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'โหลดข้อมูลไม่สำเร็จ');
      const items: Resident[] = (json.data || []).map((r: any) => ({
        ...r,
        area_sq_m: r.area_sq_m == null ? null : Number(r.area_sq_m),
      }));
      setList(items);
    } catch (e: any) {
      setAlertModal2({ title: 'ผิดพลาด', message: e?.message || 'โหลดข้อมูลล้มเหลว' });
    } finally {
      setLoading(false);
    }
  }, [BASE_URL, query]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const openAdd = () => setAddVisible(true);
  const closeAdd = () => { if (!addSaving) setAddVisible(false); };
  const openEdit = (item: Resident) => { setEditItem(item); setEditVisible(true); };
  const closeEdit = () => { if (!editSaving) { setEditVisible(false); setEditItem(null); } };

  const handleAddSave = async (payload: Omit<Resident, 'id'> & { username?: string; password?: string }) => {
    try {
      setAddSaving(true);
      const wantAccount = !!(payload.username && payload.password);
      const url = wantAccount ? `${getBaseUrl()}/residents/register` : `${getBaseUrl()}/residents`;
      const { res, json } = await apiFetchJson(url, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        if (res.status === 409 && (json?.error === 'DUPLICATE_HOUSE_NUMBER' || json?.field === 'house_number')) {
          setAlertModal2({ title: 'บ้านเลขที่ซ้ำ', message: 'บ้านเลขที่นี้ถูกใช้แล้ว กรุณาเปลี่ยนเป็นเลขที่อื่น' });
          return;
        }
        if (res.status === 409 && (json?.error === 'DUPLICATE_PHONE' || json?.field === 'phone')) {
          setAlertModal2({ title: 'เบอร์โทรศัพท์ซ้ำ', message: 'มีเบอร์โทรศัพท์นี้อยู่ในระบบแล้ว กรุณาใช้เบอร์อื่น' });
          return;
        }
        if (res.status === 409 && (json?.error === 'DUPLICATE_USERNAME' || json?.field === 'username')) {
          setAlertModal2({ title: 'Username ซ้ำ', message: 'มี Username นี้อยู่แล้ว กรุณาใช้ชื่ออื่น' });
          return;
        }
        throw new Error(json?.error || 'บันทึกไม่สำเร็จ');
      }
      await fetchList();
      closeAdd();
      // สร้าง/อัปเดตงวดอัตโนมัติหลังบันทึก
      if (payload.pay_months && [1, 3, 6, 12].includes(Number(payload.pay_months))) {
        regenerateInstallmentsLatest(payload.house_number);
      }
    } catch (e: any) {
      setAlertModal2({ title: 'ผิดพลาด', message: e?.message || 'บันทึกไม่สำเร็จ' });
    } finally {
      setAddSaving(false);
    }
  };

  const handleEditSave = async (payload: Omit<Resident, 'id'>) => {
    if (!editItem) return;
    try {
      setEditSaving(true);
      const { res, json } = await apiFetchJson(`${BASE_URL}/residents/${editItem.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (!res.ok || !json?.ok) {
        if (res.status === 409 && (json?.error === 'DUPLICATE_PHONE' || json?.field === 'phone')) {
          setAlertModal2({ title: 'เบอร์โทรศัพท์ซ้ำ', message: 'มีเบอร์โทรศัพท์นี้อยู่ในระบบแล้ว กรุณาใช้เบอร์อื่น' });
          return;
        }
        if (res.status === 409 && (json?.error === 'DUPLICATE_HOUSE_NUMBER' || json?.field === 'house_number')) {
          setAlertModal2({ title: 'บ้านเลขที่ซ้ำ', message: 'บ้านเลขที่นี้ถูกใช้แล้ว กรุณาเปลี่ยนเป็นเลขที่อื่น' });
          return;
        }
        throw new Error(json?.error || 'แก้ไขไม่สำเร็จ');
      }
      await fetchList();
      closeEdit();
      // สร้าง/อัปเดตงวดอัตโนมัติหลังแก้ไข
      const months = Number((payload as any).pay_months ?? editItem.pay_months ?? 0);
      const hn = (payload as any).house_number ?? editItem.house_number;
      if (months && [1, 3, 6, 12].includes(months)) {
        regenerateInstallmentsLatest(hn);
      }
    } catch (e: any) {
      setAlertModal2({ title: 'ผิดพลาด', message: e?.message || 'แก้ไขไม่สำเร็จ' });
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = (item: Resident) => {
    setDeleteConfirm(item);
  };

  const executeDelete = async (item: Resident) => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${BASE_URL}/residents/${item.id}`, {
        method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'ลบไม่สำเร็จ');
      await fetchList();
    } catch (e: any) { setAlertModal2({ title: 'ผิดพลาด', message: e?.message || 'ลบไม่สำเร็จ' }); }
  };

  // จัดรูปแบบเบอร์ให้อ่านง่าย
  const formatPhone = (s?: string | null) => {
    if (!s) return '';
    const n = String(s).replace(/\D/g, '');
    if (n.length === 10) return `${n.slice(0,3)}-${n.slice(3,6)}-${n.slice(6)}`;
    if (n.length === 11) return `${n.slice(0,3)}-${n.slice(3,7)}-${n.slice(7)}`;
    return s as string;
  };

  const renderItem = ({ item }: { item: Resident }) => (
    <View style={[styles.card, themed.card]}>
      <View style={styles.cardContent}>
        <Text numberOfLines={1} style={[styles.titleText, themed.titleText]}>บ้านเลขที่ {item.house_number}</Text>
        <Text style={[styles.cardSubtext, themed.cardSubtext]}>
          {item.title ? item.title + ' ' : ''}{item.first_name} {item.last_name || ''}
        </Text>
        <View style={styles.pillRow}>
          {!!item.phone && (
            <TouchableOpacity
              activeOpacity={0.7}
              onLongPress={() => setPhoneAction(item.phone!)}
              style={styles.phonePill}
            >
              <View style={styles.phoneIconWrap}>
                <Ionicons name="call-outline" size={16} color="#0F9D58" />
              </View>
              <Text style={styles.phoneText}>{formatPhone(item.phone)}</Text>
            </TouchableOpacity>
          )}
          <View style={[styles.pill, styles.pillBg]}>
            <Text style={styles.pillText}>👪 {item.household_count}</Text>
          </View>
          <View style={[styles.pill, styles.pillBg]}>
            <Text style={styles.pillText}>🚗 {item.car_count}</Text>
          </View>
          {item.area_sq_m != null && (
            <View style={[styles.pill, styles.pillBg]}>
              <Text style={styles.pillText}>📐 {item.area_sq_m} ตร.ม.</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => openEdit(item)} style={[styles.actionBtn, themed.actionBtnOrange]}>
          <Ionicons name="create-outline" size={18} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item)} style={[styles.actionBtn, themed.actionBtnRed]}>
          <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, themed.container]}>
      {/* Search + Add */}
      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={fetchList}
          placeholder="ค้นหา บ้านเลขที่/ชื่อ/โทร"
          placeholderTextColor={darkMode ? '#9AA0A6' : '#999'}
          style={[styles.input, styles.flex1, themed.inputThemed]}
          returnKeyType="search"
        />
        <TouchableOpacity style={[styles.addButton, styles.addBtnML, themed.addBtnGreen]} onPress={openAdd}>
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={[styles.container, styles.center]}>
          <ActivityIndicator size="large" color={colors.green} />
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(it) => String(it.id)}
          contentContainerStyle={styles.listContent}
          renderItem={renderItem}
          ItemSeparatorComponent={ItemSeparator}
        />
      )}

      {/* Modals */}
      <ResidentForm
        visible={addVisible}
        darkMode={darkMode}
        colors={{ ...colors, cardBg: colors.cardBg }}
        mode="add"
        saving={addSaving}
        existingList={list}
        onClose={closeAdd}
        onSubmit={handleAddSave}
      />
      <ResidentForm
        visible={editVisible}
        darkMode={darkMode}
        colors={{ ...colors, cardBg: colors.cardBg }}
        mode="edit"
        initial={editItem || undefined}
        saving={editSaving}
        existingList={list}
        onClose={closeEdit}
        onSubmit={handleEditSave}
      />

      {/* Alert Modal (UserManage) */}
      <Modal visible={!!alertModal2} transparent animationType="fade" onRequestClose={() => setAlertModal2(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCenter}>
            <View style={[styles.alertCard, themed.alertCard]}>
              <View style={styles.alertIconRow}>
                <View style={styles.alertIconCircle}>
                  <Ionicons name="warning" size={28} color="#F59E0B" />
                </View>
              </View>
              <Text style={[styles.alertTitle, themed.alertTitle]}>{alertModal2?.title}</Text>
              <Text style={[styles.alertMessage, themed.alertMessage]}>{alertModal2?.message}</Text>
              <TouchableOpacity
                style={styles.alertOkBtn}
                onPress={() => setAlertModal2(null)}
                activeOpacity={0.85}
              >
                <Text style={styles.alertOkBtnText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal visible={!!deleteConfirm} transparent animationType="fade" onRequestClose={() => setDeleteConfirm(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCenter}>
            <View style={[styles.alertCard, themed.alertCard]}>
              <View style={styles.alertIconRow}>
                <View style={[styles.alertIconCircle, styles.alertIconCircleDanger]}>
                  <Ionicons name="trash" size={28} color="#EF5350" />
                </View>
              </View>
              <Text style={[styles.alertTitle, themed.alertTitle]}>ลบผู้พักอาศัย</Text>
              <Text style={[styles.alertMessage, themed.alertMessage]}>ลบ บ้านเลขที่ {deleteConfirm?.house_number} ?</Text>
              <View style={styles.confirmActions}>
                <TouchableOpacity
                  style={[styles.confirmBtn, styles.confirmBtnCancel]}
                  onPress={() => setDeleteConfirm(null)}
                >
                  <Text style={styles.confirmBtnCancelText}>ยกเลิก</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmBtn, styles.confirmBtnDanger]}
                  onPress={() => { const item = deleteConfirm; setDeleteConfirm(null); if (item) executeDelete(item); }}
                >
                  <View style={styles.rowCenterGap6}>
                    <Ionicons name="trash-outline" size={16} color="#fff" />
                    <Text style={styles.confirmBtnSaveText}>ลบ</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Phone Action Modal */}
      <Modal visible={!!phoneAction} transparent animationType="fade" onRequestClose={() => setPhoneAction(null)}>
        <TouchableWithoutFeedback onPress={() => setPhoneAction(null)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={[styles.phoneActionCard, themed.phoneActionCard]}>
                <View style={styles.phoneActionHeader}>
                  <View style={styles.phoneActionIconCircle}>
                    <Ionicons name="call" size={24} color="#0F9D58" />
                  </View>
                  <Text style={[styles.phoneActionNumber, themed.phoneActionNumber]}>
                    {formatPhone(phoneAction || '')}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.phoneActionRow, themed.phoneActionRowBorder]}
                  activeOpacity={0.6}
                  onPress={() => {
                    const num = (phoneAction || '').replace(/\D/g, '');
                    setPhoneAction(null);
                    Linking.openURL(`tel:${num}`);
                  }}
                >
                  <View style={[styles.phoneActionRowIcon, styles.phoneActionRowIconCall]}>
                    <Ionicons name="call-outline" size={20} color="#0F9D58" />
                  </View>
                  <Text style={[styles.phoneActionRowText, themed.phoneActionRowText]}>โทรออก</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.subtext} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.phoneActionRow, themed.phoneActionRowBorder]}
                  activeOpacity={0.6}
                  onPress={() => {
                    const num = (phoneAction || '').replace(/\D/g, '');
                    Clipboard.setString(num);
                    setPhoneAction(null);
                    setAlertModal2({ title: 'คัดลอกแล้ว', message: `เบอร์ ${formatPhone(phoneAction || '')} ถูกคัดลอกแล้ว` });
                  }}
                >
                  <View style={[styles.phoneActionRowIcon, styles.phoneActionRowIconCopy]}>
                    <Ionicons name="copy-outline" size={20} color="#1976D2" />
                  </View>
                  <Text style={[styles.phoneActionRowText, themed.phoneActionRowText]}>คัดลอกเบอร์</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.subtext} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.phoneActionCancel}
                  activeOpacity={0.7}
                  onPress={() => setPhoneAction(null)}
                >
                  <Text style={styles.phoneActionCancelText}>ยกเลิก</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
};

export default UserManage;

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 20 },
  headerTitle: { fontSize: 22, fontWeight: '800', marginBottom: 6 },
  headerSubtitle: { fontSize: 13, fontWeight: '500' },

  listContent: { paddingHorizontal: 14, paddingVertical: 12, flexGrow: 1 },
  separator: { height: 14 },

  card: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    minHeight: 70,
  },
  titleText: { fontSize: 16, fontWeight: '700', marginBottom: 6, lineHeight: 22 },
  pill: { height: 26, borderRadius: 999, paddingHorizontal: 10, justifyContent: 'center', marginRight: 6, marginTop: 6 },
  pillText: { fontWeight: '800', fontSize: 12 },
  scheduleWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  scheduleItem: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 6,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  scheduleRound: { fontWeight: '700', fontSize: 12, marginRight: 6 },
  scheduleDate: { fontWeight: '600', fontSize: 12 },
  scheduleSummary: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  scheduleAmount: { fontWeight: '700', fontSize: 13 },
  scheduleHint: { fontWeight: '600', fontSize: 12, marginLeft: 8 },
  phonePill: {
    flexBasis: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: '#EAF8F1',   // เขียวอ่อนนุ่ม
    borderWidth: 1,
    borderColor: '#D6EADF',
    marginRight: 0,
    marginTop: 4,
  },
  phoneIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#CFF1DF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  phoneText: { fontWeight: '700', fontSize: 13, color: '#1F2937' },

  actions: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 2 },
  actionBtn: {
    marginRight: 8, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 3
  },
  addButton: { height: 42, width: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },

  // modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  modalCenter: { width: '100%', justifyContent: 'center' as const, alignItems: 'center' as const },
  modalCard: { borderRadius: 16, padding: 16, borderWidth: 1, width: '100%', maxWidth: 420, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 8 },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
  modalTitleInline: { flex: 1, marginBottom: 0 },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  pageBadge: { backgroundColor: '#47B263', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  pageBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  modalLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: '#D6DADF', marginRight: 6 },
  chipActive: { backgroundColor: '#2E7D32', borderColor: '#2E7D32' },
  chipText: { fontSize: 12, fontWeight: '800', color: '#444' },
  chipTextActive: { color: '#fff' },
  segment: { flexDirection: 'row', marginBottom: 6, padding: 4, borderWidth: 1, borderColor: 'transparent', borderRadius: 12 },
  row: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },
  required: { color: '#EF4444' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 10, fontSize: 14 },
  // กรอบแดงเมื่อเบอร์ไม่ครบ 10 หลัก
  inputError: { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
  modalBtn: { minWidth: 96, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, marginLeft: 8 },
  modalCancel: { backgroundColor: '#E9ECEF' },
  modalCancelText: { color: '#333', fontWeight: '700' },
  modalSave: { backgroundColor: COLORS.green },
  modalSaveText: { color: '#fff', fontWeight: '800' },

  selectCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  selectCard: { width: '100%', maxWidth: 360, borderRadius: 16, padding: 12, borderWidth: 1 },
  optionRow: { height: 44, paddingHorizontal: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, backgroundColor: 'rgba(0,0,0,0.03)' },
  optionRowActive: { backgroundColor: 'rgba(16,185,129,0.12)', borderWidth: 1, borderColor: '#10B981' },
  optionText: { fontSize: 14, fontWeight: '700' },
  linkBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, backgroundColor: 'rgba(37,99,235,0.06)' },
  linkBtnText: { fontSize: 12, fontWeight: '800' },

  // Utility styles
  scrollPadBottom: { paddingBottom: 8 },
  mt8: { marginTop: 8 },
  mt10: { marginTop: 10 },
  mb6: { marginBottom: 6 },
  mb0: { marginBottom: 0 },
  flex1: { flex: 1 },
  mr8: { marginRight: 8 },
  mh10: { marginHorizontal: 10 },
  rowCenterGap6: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  maxH280: { maxHeight: 280 },
  dropdownRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dropdownText: { fontSize: 14 },
  cardContent: { flex: 1, marginRight: 15 },
  cardSubtext: { marginBottom: 8 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  pillBg: { backgroundColor: '#F3F4F6' },
  searchRow: { flexDirection: 'row', paddingHorizontal: 14, marginTop: 8, marginBottom: 12, gap: 10 },
  addBtnML: { },
  scheduleItemDark: { backgroundColor: '#1F2937', borderColor: '#2F3643' },
  scheduleItemLight: { backgroundColor: '#F6F7FB', borderColor: '#E2E8F0' },
  scheduleRoundDark: { color: '#9BB4D8' },
  scheduleRoundLight: { color: '#2563EB' },

  // Dupe modal
  dupeCard: { borderRadius: 20, padding: 24, borderWidth: 1, width: '100%', maxWidth: 360, alignItems: 'center' as const, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 20, elevation: 10 },
  dupeIconRow: { marginBottom: 12 },
  dupeIconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FEE2E2', justifyContent: 'center' as const, alignItems: 'center' as const },
  dupeTitle: { fontSize: 18, fontWeight: '800' as const, marginBottom: 4 },
  dupeSubtitle: { fontSize: 13, marginBottom: 14 },
  dupeRow: { flexDirection: 'row' as const, alignItems: 'center' as const, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8, width: '100%' },
  dupeRowText: { fontSize: 14, fontWeight: '600' as const, flex: 1 },
  dupeBtn: { backgroundColor: '#EF5350', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 36, marginTop: 8 },
  dupeBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' as const },

  // Confirm change modal
  confirmCard: { borderRadius: 20, padding: 24, borderWidth: 1, width: '100%', maxWidth: 320, alignItems: 'center' as const, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
  confirmTitle: { fontSize: 18, fontWeight: '800' as const, marginBottom: 16, textAlign: 'center' as const },
  confirmCompare: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, marginBottom: 6 },
  confirmBox: { alignItems: 'center' as const, backgroundColor: '#F0FAF3', borderRadius: 16, paddingHorizontal: 22, paddingVertical: 12, minWidth: 80 },
  confirmBoxLabel: { fontSize: 12, fontWeight: '700' as const, color: '#EF5350', marginBottom: 4 },
  confirmBoxLabelNew: { color: '#47B263' },
  confirmBoxValue: { fontSize: 32, fontWeight: '900' as const },
  confirmBoxValueOld: { color: '#EF5350' },
  confirmBoxValueNew: { color: '#47B263' },
  confirmUnit: { fontSize: 13, fontWeight: '600' as const, marginBottom: 16 },
  confirmActions: { flexDirection: 'row' as const, gap: 12, width: '100%' },
  confirmBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center' as const, justifyContent: 'center' as const },
  confirmBtnCancel: { borderWidth: 1, borderColor: '#D1D5DB' },
  confirmBtnCancelText: { fontSize: 15, fontWeight: '700' as const, color: '#6B7280' },
  confirmBtnSave: { backgroundColor: '#47B263' },
  confirmBtnDanger: { backgroundColor: '#EF5350' },
  confirmBtnSaveText: { fontSize: 15, fontWeight: '700' as const, color: '#fff' },
  confirmEmoji: { fontSize: 40, textAlign: 'center' as const, marginBottom: 8 },

  // Alert modal (แทน Alert.alert)
  alertCard: { borderRadius: 20, padding: 24, borderWidth: 1, width: '100%', maxWidth: 320, alignItems: 'center' as const, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
  alertIconRow: { marginBottom: 12 },
  alertIconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FEF3C7', justifyContent: 'center' as const, alignItems: 'center' as const },
  alertIconCircleDanger: { backgroundColor: '#FEE2E2' },
  alertTitle: { fontSize: 18, fontWeight: '800' as const, marginBottom: 8, textAlign: 'center' as const },
  alertMessage: { fontSize: 14, fontWeight: '500' as const, textAlign: 'center' as const, lineHeight: 22, marginBottom: 20 },
  alertOkBtn: { backgroundColor: '#4F46E5', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 40, minWidth: 120, alignItems: 'center' as const },
  alertOkBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' as const },

  // Phone action modal
  phoneActionCard: { borderRadius: 20, padding: 20, borderWidth: 1, width: '100%', maxWidth: 340, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
  phoneActionHeader: { alignItems: 'center' as const, marginBottom: 16 },
  phoneActionIconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#E8F5E9', justifyContent: 'center' as const, alignItems: 'center' as const, marginBottom: 10 },
  phoneActionNumber: { fontSize: 20, fontWeight: '800' as const, letterSpacing: 1 },
  phoneActionRow: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  phoneActionRowIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center' as const, justifyContent: 'center' as const, marginRight: 12 },
  phoneActionRowIconCall: { backgroundColor: '#E8F5E9' },
  phoneActionRowIconCopy: { backgroundColor: '#E3F2FD' },
  phoneActionRowText: { flex: 1, fontSize: 15, fontWeight: '700' as const },
  phoneActionCancel: { marginTop: 4, paddingVertical: 12, alignItems: 'center' as const },
  phoneActionCancelText: { fontSize: 14, fontWeight: '600' as const, color: '#9CA3AF' },
}); 
