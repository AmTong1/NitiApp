// PaymentScreen.tsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  StatusBar,
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showAlert } from '../components/GlobalAlert';
import { launchImageLibrary, Asset } from 'react-native-image-picker';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import { BASE_HOST, BASE_PORT } from './config.ts';
const ANDROID_HOST = BASE_HOST;
type QrResponse = {
  userId?: string;
  id: string;
  amount: number;
  payload: string;
  url?: string;
  filename?: string;

  // ⬇️ เวลา/นับถอยหลังที่มาจาก Backend
  createdAt?: string;      // ISO
  expiresAt?: string;      // ISO
  serverNow?: string;      // ISO (เวลาปัจจุบันฝั่งเซิร์ฟเวอร์ ตอนตอบ)
  expiresInMs?: number;    // มิลลิวินาทีที่เหลือ ณ ตอนเซิร์ฟเวอร์ตอบ
  countdownText?: string;  // รูปแบบข้อความนับถอยหลังที่ backend จัดมาแล้ว
  retentionDays?: number;
};

interface PaymentScreenProps {
  darkMode: boolean;
  onBack?: () => void;
}

export function getBaseUrl() {
  const host = Platform.OS === 'android' ? ANDROID_HOST : BASE_HOST;
  return `http://${host}:${BASE_PORT}`;
}

const BASE_URL = getBaseUrl();

const USER_ID = 'user002';

const STORAGE_KEY = `qr_user_${USER_ID}`;
const AMOUNT_KEY = 'qr_amount';
const INTENT_KEY = 'qr_intent_id';
const INSTALLMENT_KEY = 'qr_installment_id';
const SKEW_MS = 3000;

const formatRemaining = (ms: number) => {
  if (!Number.isFinite(ms) || ms <= 0) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m ${secs.toString().padStart(2, '0')}s`;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// Used when booting from cache (serverNow/expiresInMs may be missing).
const calcRemainingFromExpiresAt = (q?: QrResponse | null) => {
  if (!q?.expiresAt) return null;
  const t = new Date(q.expiresAt).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, t - Date.now());
};

export default function PaymentScreen({ darkMode, onBack }: PaymentScreenProps) {
  const [loading, setLoading] = useState(true);
  const [qr, setQr] = useState<QrResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ⬇️ สำหรับนับถอยหลังโดยอิงเวลาจาก backend
  const [countdown, setCountdown] = useState<string>('');
  const [expired, setExpired] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // baseRemainingMs = เวลาเหลือ (ms) ตอน "ขณะรับ response"
  // clientFetchTs = เวลา client ตอน "ขณะรับ response"
  const [baseRemainingMs, setBaseRemainingMs] = useState<number | null>(null);
  const [clientFetchTs, setClientFetchTs] = useState<number | null>(null);

  // สำหรับ amount ที่ส่งมาจากหน้า History
  const [initAmount, setInitAmount] = useState<number | null>(null);
  const [amountReady, setAmountReady] = useState(false);

  // สำหรับ intentId ที่ส่งมาจากหน้า History
  const [installmentId, setInstallmentId] = useState<string | null>(null);
  const [intentId, setIntentId] = useState<string | null>(null);

  // Dynamic colors based on darkMode
  const colors = {
    bg: darkMode ? '#121212' : '#fff',
    text: darkMode ? '#FFFFFF' : '#333',
    subtext: darkMode ? '#CCCCCC' : '#666',
    cardBg: darkMode ? '#1E1E1E' : '#F5F5F5',
    border: darkMode ? '#333333' : '#E0E0E0',
    primary: '#1976D2',
    success: '#16AD53FF',
    danger: '#FF4444',
    info: '#007AFF',
    disabled: '#CCCCCC',
  };

  const bootFromStorage = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const cached: QrResponse = JSON.parse(raw);

        // ถ้าเคยเก็บ expiresInMs ตอนนั้นไว้ด้วย (เผื่อคุณอยากเพิ่มเก็บเอง) ใช้ได้เลย
        let remain = cached.expiresInMs ?? calcRemainingFromExpiresAt(cached);
        if (remain != null && remain > SKEW_MS) {
          setQr(cached);
          setBaseRemainingMs(remain);
          setClientFetchTs(Date.now()); // ตั้งฐานเทียบ ณ ตอนนี้
          // ใช้ข้อความ countdown จาก backend ถ้ามี
          setCountdown(cached.countdownText || formatRemaining(remain));
          setExpired(remain <= 0);
          setLoading(false);
          return true;
        }
      }
    } catch {}
    return false;
  }, []);

  // บูต: โหลด amount ที่ถูกส่งมาจากหน้า History แล้วค่อยปล่อยให้ fetch ได้
  useEffect(() => {
    (async () => {
      try {
        const rawAmt = await AsyncStorage.getItem(AMOUNT_KEY);
        if (rawAmt != null && !Number.isNaN(Number(rawAmt))) setInitAmount(Number(rawAmt));
        const iid = await AsyncStorage.getItem(INSTALLMENT_KEY);
        if (iid) setInstallmentId(iid);
        const intent = await AsyncStorage.getItem(INTENT_KEY);
        if (intent) setIntentId(intent);
      } finally {
        setAmountReady(true);
      }
    })();
  }, []);

  // ดึง QR: เรียกจาก installment โดยตรง (ถ้ามี), ไม่งั้น fallback เดิม
  const fetchQR = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setExpired(false);
      setCountdown('');

      let url: string;
      if (installmentId) {
        const qs = new URLSearchParams();
        if (intentId) qs.set('intentId', intentId);
        url = `${BASE_URL}/promptpay-qr/installment/${encodeURIComponent(installmentId)}${qs.toString() ? `?${qs}` : ''}`;
      } else {
        // fallback: เดิมอิง user และส่ง amount
        const qs = new URLSearchParams();
        if (typeof initAmount === 'number') qs.set('amount', String(initAmount));
        if (intentId) qs.set('intentId', intentId);
        url = `${BASE_URL}/promptpay-qr/user/${USER_ID}${qs.toString() ? `?${qs}` : ''}`;
      }

      const res = await fetch(url, {
        headers: { 'Cache-Control': 'no-cache' },
      });
      const json = (await res.json()) as QrResponse & {
        // เผื่อ backend ส่ง field เพิ่มเติมอื่น ๆ
      };
      if (!res.ok) throw new Error((json as any)?.message || 'ไม่สามารถดึง QR ได้');

      // คำนวณฐานเวลาโดยเชื่อค่า server เป็นหลัก
      // 1) ถ้ามี expiresInMs จาก backend → ใช้เลย
      // 2) ถ้าไม่มี → ใช้ (expiresAt - serverNow) ถ้ามีครบ
      // 3) ถ้าไม่มีอีก → ใช้ (expiresAt - Date.now()) เป็น fallback
      let remainMs: number | null = null;

      if (Number.isFinite(json.expiresInMs as number)) {
        remainMs = Number(json.expiresInMs);
      } else if (json.expiresAt && json.serverNow) {
        const exp = new Date(json.expiresAt).getTime();
        const srv = new Date(json.serverNow).getTime();
        if (Number.isFinite(exp) && Number.isFinite(srv)) {
          remainMs = Math.max(0, exp - srv);
        }
      } else if (json.expiresAt) {
        const exp = new Date(json.expiresAt).getTime();
        if (Number.isFinite(exp)) {
          remainMs = Math.max(0, exp - Date.now());
        }
      }

      // เก็บค่าไว้ใช้ใน UI
      setQr(json);
      setBaseRemainingMs(remainMs);
      setClientFetchTs(Date.now());

      // ตั้งค่าข้อความเริ่มต้น
      if (Number.isFinite(remainMs as number)) {
        setCountdown(json.countdownText || formatRemaining(remainMs as number));
        setExpired((remainMs as number) <= 0);
      } else {
        setCountdown(json.countdownText || '');
        setExpired(false);
      }

      // เก็บแคช (รวมฟิลด์เวลาที่ backend ส่งมา)
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(json));
    } catch (e: any) {
      setError(e?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  }, [installmentId, intentId, initAmount]);

  // เมื่อพร้อมค่าใน storage แล้วค่อยเรียก
  useEffect(() => {
    if (!amountReady) return;
    (async () => {
      const ok = await bootFromStorage();
      if (!ok) await fetchQR();
    })();
  }, [amountReady, bootFromStorage, fetchQR]);

  // นับถอยหลัง โดยเทียบจาก baseRemainingMs และเวลาที่ผ่านไปบน client
  useEffect(() => {
    if (!Number.isFinite(baseRemainingMs as number) || !Number.isFinite(clientFetchTs as number)) {
      // ไม่มีฐานเวลา ก็ไม่ตั้ง interval
      return;
    }
    const start = clientFetchTs as number;
    const base = baseRemainingMs as number;

    const tick = () => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, base - elapsed);
      setCountdown(formatRemaining(remaining));
      setExpired(remaining <= 0);
    };

    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [baseRemainingMs, clientFetchTs]);

  const onConfirm = async () => {
    if (expired) {
      showAlert('หมดเวลา', 'QR หมดอายุแล้ว โปรดกด Reload เพื่อสร้าง QR ใหม่');
      return;
    }
    try {
      const res = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 });
      if (res.didCancel) return;
      if (res.errorCode) return showAlert('เลือกไฟล์ไม่สำเร็จ', res.errorMessage || res.errorCode);
      const asset = res.assets?.[0] as Asset | undefined;
      if (!asset?.uri) return showAlert('ไม่พบไฟล์สำหรับอัปโหลด');

      setUploading(true);
      const form = new FormData();
      form.append('file', {
        // @ts-ignore
        uri: asset.uri,
        name: asset.fileName || `slip_${Date.now()}.jpg`,
        type: asset.type || 'image/jpeg',
      });

      const response = await fetch(`${BASE_URL}/upload-and-check`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'multipart/form-data',
        },
        body: form,
      });

      const json = await response.json();
      if (!response.ok) throw new Error(json?.message || 'อัปโหลดไม่สำเร็จ');

      const result =
        typeof json?.slipok === 'object' ? JSON.stringify(json.slipok, null, 2) : String(json?.slipok);
      showAlert('อัปโหลดสำเร็จ', `สลิปตรวจสอบแล้ว:\n${result}`);
    } catch (err: any) {
      showAlert('ผิดพลาด', err?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setUploading(false);
    }
  };

  // บันทึก/แชร์ไฟล์ QR ลงเครื่อง
 const onSaveQr = async () => {
  if (!qr?.url) {
    showAlert('ไม่พบ QR', 'ไม่พบ QR สำหรับบันทึก');
    return;
  }
  try {
    // ===== Permission เฉพาะ Android API <= 28 (Android 9 ลงไป) =====
    if (Platform.OS === 'android' && Platform.Version <= 28) {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        {
          title: 'ต้องการสิทธิ์จัดเก็บไฟล์',
          message: 'แอปต้องการสิทธิ์เพื่อบันทึก QR ลงในคลังรูปภาพของคุณ',
          buttonNeutral: 'ภายหลัง',
          buttonNegative: 'ยกเลิก',
          buttonPositive: 'อนุญาต',
        }
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        showAlert('ปฏิเสธสิทธิ์', 'ไม่สามารถบันทึกได้เนื่องจากไม่ได้รับสิทธิ์');
        return;
      }
    }

      const filename = `qrcode_${Date.now()}.png`;
      const path = `${RNFS.CachesDirectoryPath}/${filename}`;

      const download = await RNFS.downloadFile({
        fromUrl: qr.url, // url จาก backend
        toFile: path,
      }).promise;

      if (!download || download.statusCode !== 200) {
        throw new Error('ไม่สามารถดาวน์โหลด QR ได้');
      }

      await Share.open({
        url: 'file://' + path,
        type: 'image/png',
        failOnCancel: false,
      });
    } catch (err: any) {
      showAlert('ผิดพลาด', err?.message || 'บันทึกไม่สำเร็จ');
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchQR();
    } finally {
      setRefreshing(false);
    }
  }, [fetchQR]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['left', 'right', 'bottom']}>
      <StatusBar barStyle={darkMode ? "light-content" : "dark-content"} backgroundColor={colors.bg} />
      <ScrollView
        style={[styles.container, { backgroundColor: colors.bg }]}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.info]}
            tintColor={colors.info}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.logoContainer, { backgroundColor: colors.primary }]}>
            <Text style={styles.logoText}>THAI QR{'\n'}PAYMENT</Text>
          </View>
        </View>

        {/* QR Code Container */}
        <View style={styles.qrContainer}>
          <View style={[styles.qrBox, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            {loading ? (
              <ActivityIndicator size="large" color={colors.info} />
            ) : error ? (
              <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
            ) : qr?.url ? (
              <Image style={styles.qrImage} source={{ uri: qr.url }} />
            ) : (
              <Text style={[styles.noDataText, { color: colors.subtext }]}>ไม่พบข้อมูล QR</Text>
            )}
          </View>
        </View>

        {/* Amount and Time Info */}
        <View style={styles.infoContainer}>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.text }]}>ยอดรวมทั้งหมด</Text>
            {(() => {
              const displayAmount = (qr?.amount ?? initAmount);
              return (
                <Text style={[styles.amountText, { color: colors.text }]}>
                  THB {displayAmount != null ? Number(displayAmount).toFixed(2) : '-'}
                </Text>
              );
            })()}
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.text }]}>เวลาที่เหลือ</Text>
            <Text style={[styles.timeText, { color: expired ? colors.danger : colors.success }]}>
              {countdown || (expired ? '00:00' : '--:--')}
            </Text>
          </View>
        </View>

        {/* Upload Button */}
        <TouchableOpacity
          style={[
            styles.uploadButton,
            { backgroundColor: colors.success },
            (expired || loading || !!error || uploading) && { backgroundColor: colors.disabled },
          ]}
          onPress={onConfirm}
          disabled={!!error || loading || expired || uploading}
        >
          <Text style={styles.uploadButtonText}>
            {expired
              ? 'หมดเวลา – กด Reload'
              : loading
              ? 'กำลังโหลด...'
              : uploading
              ? 'กำลังอัปโหลด...'
              : 'อัปโหลดสลิป'}
          </Text>
        </TouchableOpacity>

        {/* Save QR */}
        <TouchableOpacity
          style={[
            styles.saveButton, 
            { backgroundColor: colors.info },
            (!qr?.url || expired) && { backgroundColor: colors.disabled }
          ]}
          onPress={onSaveQr}
          disabled={!qr?.url || expired}
        >
          <Text style={styles.uploadButtonText}>บันทึก QR Code</Text>
        </TouchableOpacity>

        {/* Back to history */}
        {onBack && (
          <TouchableOpacity
            style={[styles.saveButton, styles.backButton]}
            onPress={onBack}
          >
            <Text style={styles.uploadButtonText}>กลับไปประวัติ</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    borderRadius: 12,
  },
  container: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 40,
    paddingTop: 35,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  logoContainer: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  logoText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 16,
  },
  qrContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  qrBox: {
    width: 280,
    height: 280,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrImage: {
    width: 260,
    height: 260,
    borderRadius: 8,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
  noDataText: {
    fontSize: 14,
    textAlign: 'center',
  },
  infoContainer: {
    marginBottom: 40,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 16,
    fontWeight: '400',
  },
  amountText: {
    fontSize: 16,
    fontWeight: '600',
  },
  timeText: {
    fontSize: 16,
    color: '#00C851',
    fontWeight: '600',
  },
  uploadButton: {
    borderRadius: 25,
    paddingVertical: 15,
    alignItems: 'center',
    marginHorizontal: 20,
  },
  saveButton: {
    borderRadius: 25,
    paddingVertical: 15,
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 12,
  },
  backButton: {
    backgroundColor: '#9E9E9E',
  },
  uploadButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
},
});
