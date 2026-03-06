import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showAlert } from '../../components/GlobalAlert';
import { getUnread } from './unreadStore';
import { BASE_HOST, BASE_PORT } from '../config';

const ANDROID_HOST = BASE_HOST;
export function getBaseUrl() {
  const host = Platform.OS === 'android' ? ANDROID_HOST : BASE_HOST;
  return `http://${host}:${BASE_PORT}`;
}

type Room = { id: number; name: string; room_type: 'public'|'dm' };

interface Props {
  onOpenRoom: (room: Room) => void;
}

const ChatChannelPicker: React.FC<Props> = ({ onOpenRoom }) => {
  const colors = useMemo(() => ({
    bg: '#FFFFFF', cardBg: '#FFFFFF', text: '#1F2937', subtext: '#6B7280',
    border: '#E5E7EB', primary: '#3B82F6', success: '#10B981', danger: '#EF4444',
  }), []);

  const [loading, setLoading] = useState(false);
  const [unreadPublic, setUnreadPublic] = useState(0);
  const [unreadDm, setUnreadDm] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkedRole, setCheckedRole] = useState(false);   // ✅ รอรู้บทบาทก่อน
  const [userDms, setUserDms] = useState<Room[]>([]);
  const [loadingDms, setLoadingDms] = useState(false);

  const getToken = useCallback(async (): Promise<string> => {
    const t = await AsyncStorage.getItem('token');
    if (!t) throw new Error('ยังไม่ได้ล็อกอิน');
    return t;
  }, []);

  const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

  const openPublic = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const res = await fetch(`${getBaseUrl()}/chat/public-room`, { headers: authHeader(token) });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'PUBLIC_ROOM_FAILED');
      onOpenRoom(j.data);
    } catch (e: any) {
      showAlert('ผิดพลาด', e?.message || 'เปิดห้องรวมไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [getToken, onOpenRoom]);

  const openDm = useCallback(async () => {
    try {
      if (isAdmin) return; // ✅ กันไว้แม้ UI จะไม่แสดง
      setLoading(true);
      const token = await getToken();
      const res = await fetch(`${getBaseUrl()}/chat/ensure-dm-admin`, { method: 'POST', headers: authHeader(token) });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'DM_ROOM_FAILED');
      onOpenRoom(j.data);
    } catch (e: any) {
      showAlert('ผิดพลาด', e?.message || 'เปิดห้องติดต่อแอดมินไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [getToken, onOpenRoom, isAdmin]);

  const fetchUserDms = useCallback(async (token: string) => {
    try {
      setLoadingDms(true);
      const res = await fetch(`${getBaseUrl()}/chat/admin/user-dms`, { headers: authHeader(token) });
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setUserDms(data);
      }
    } catch (e) {
      console.log('Error fetching user DMs:', e);
    } finally {
      setLoadingDms(false);
    }
  }, []);

  // ✅ ตรวจสอบบทบาท
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${getBaseUrl()}/auth/me`, { headers: authHeader(token) });
        const data = await res.json();
        if (!mounted) return;
        const admin = res.ok && (data?.role === 'admin' || data?.role === 'superadmin');
        setIsAdmin(!!admin);
        if (admin) {
          // แอดมิน: โหลดรายการ DM จากผู้ใช้
          fetchUserDms(token);
        }
      } catch (e) {
        console.log('Error checking admin status:', e);
        setIsAdmin(false);
      } finally {
        if (mounted) setCheckedRole(true);   // ✅ รู้ผลแล้ว
      }
    })();
    return () => { mounted = false; };
  }, [getToken, fetchUserDms]);

  // ✅ โหลดตัวเลข Unread
  useEffect(() => {
    let mounted = true;
    if (!checkedRole) return; // รอรู้บทบาทก่อนค่อยทำ
    (async () => {
      try {
        const token = await getToken();

        // ห้องรวม - โหลดทุกบทบาท
        const r1 = await fetch(`${getBaseUrl()}/chat/public-room`, { headers: authHeader(token) });
        const j1 = await r1.json();
        if (mounted && r1.ok && j1?.data?.id) {
          const c1 = await getUnread(j1.data.id);
          setUnreadPublic(c1);
        }

        // DM กับแอดมิน - เฉพาะผู้ใช้ทั่วไปเท่านั้น
        if (!isAdmin) {
          const r2 = await fetch(`${getBaseUrl()}/chat/ensure-dm-admin`, { method: 'POST', headers: authHeader(token) });
          const j2 = await r2.json();
          if (mounted && r2.ok && j2?.data?.id) {
            const c2 = await getUnread(j2.data.id);
            setUnreadDm(c2);
          }
        } else {
          setUnreadDm(0); // แอดมินไม่ใช้ช่องนี้
        }
      } catch {
        // เงียบได้
      }
    })();
    return () => { mounted = false; };
  }, [getToken, checkedRole, isAdmin]);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Text style={[styles.header, { color: colors.text }]}>เลือกช่องแชท</Text>

      {/* ห้องรวม */}
      <TouchableOpacity style={[styles.card, { borderColor: colors.border }]} onPress={openPublic} activeOpacity={0.9}>
        <View style={styles.cardRow}>
          <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}15` }]}>
            <Ionicons name="people-outline" size={28} color={colors.primary} />
          </View>
          <View style={styles.flexOne}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>ห้องรวม</Text>
            <Text style={{ color: colors.subtext }}>ทุกคนพูดคุยร่วมกัน</Text>
          </View>
          {!!unreadPublic && (
            <View style={[styles.badge, { backgroundColor: colors.danger }]}>
              <Text style={styles.badgeText}>{unreadPublic}</Text>
            </View>
          )}
          {loading && <ActivityIndicator />}
        </View>
      </TouchableOpacity>

      {/* ติดต่อแอดมิน (เฉพาะผู้ใช้ทั่วไป) */}
      {!isAdmin && (
        <TouchableOpacity style={[styles.card, { borderColor: colors.border }]} onPress={openDm} activeOpacity={0.9}>
          <View style={styles.cardRow}>
            <View style={[styles.iconWrap, { backgroundColor: `${colors.success}15` }]}>
              <Ionicons name="chatbubbles-outline" size={28} color={colors.success} />
            </View>
            <View style={styles.flexOne}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>ติดต่อแอดมิน (ตัวต่อตัว)</Text>
              <Text style={{ color: colors.subtext }}>เฉพาะคุณ ⇄ แอดมิน</Text>
            </View>
            {!!unreadDm && (
              <View style={[styles.badge, { backgroundColor: colors.danger }]}>
                <Text style={styles.badgeText}>{unreadDm}</Text>
              </View>
            )}
            {loading && <ActivityIndicator />}
          </View>
        </TouchableOpacity>
      )}

      {/* รายการ DM ทั้งหมดสำหรับแอดมิน */}
      {isAdmin && (
        <>
          <Text style={[styles.subHeader, { color: colors.text }]}>ข้อความจากผู้ใช้</Text>
          {loadingDms ? (
            <ActivityIndicator style={styles.activityIndicator} color={colors.primary} />
          ) : userDms.length > 0 ? (
            userDms.map(room => (
              <TouchableOpacity
                key={room.id}
                style={[styles.card, { borderColor: colors.border }]}
                onPress={() => onOpenRoom(room)}
                activeOpacity={0.9}
              >
                <View style={styles.cardRow}>
                  <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}15` }]}>
                    <Ionicons name="person-outline" size={24} color={colors.primary} />
                  </View>
                  <View style={styles.flexOne}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{room.name}</Text>
                    <Text style={{ color: colors.subtext }}>ข้อความส่วนตัว</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <Text style={[styles.emptyText, { color: colors.subtext }]}>ยังไม่มีข้อความจากผู้ใช้</Text>
          )}
        </>
      )}
    </View>
  );
};

export default ChatChannelPicker;

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  header: { fontSize: 22, fontWeight: '800', marginBottom: 12 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  badge: { minWidth: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  subHeader: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptyText: { textAlign: 'center', marginTop: 20, fontStyle: 'italic' },
  flexOne: { flex: 1 },
  activityIndicator: { marginTop: 20 },
});
