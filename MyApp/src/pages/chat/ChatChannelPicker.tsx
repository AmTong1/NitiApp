import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, Pressable, AppState } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import io, { Socket } from 'socket.io-client';
import { showAlert } from '../../components/GlobalAlert';
import { getUnread } from './unreadStore';
import { BASE_HOST } from '../config';
import { useI18n } from '../../i18n';
export function getBaseUrl() {
  return BASE_HOST;
}

type Room = {
  id: number;
  name: string;
  room_type: 'public'|'dm';
  last_message_id?: number;
  last_activity?: string | null;
  unread_count?: number;
};

type PinnedRoomMap = Record<number, true>;
type PinScope = 'shared' | 'personal';

function isSameRoomList(prev: Room[], next: Room[]) {
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    const a = prev[i];
    const b = next[i];
    if (Number(a.id || 0) !== Number(b.id || 0)) return false;
    if (String(a.name || '') !== String(b.name || '')) return false;
    if (String(a.room_type || '') !== String(b.room_type || '')) return false;
    if (Number(a.last_message_id || 0) !== Number(b.last_message_id || 0)) return false;
    if (String(a.last_activity || '') !== String(b.last_activity || '')) return false;
    if (Number(a.unread_count || 0) !== Number(b.unread_count || 0)) return false;
  }
  return true;
}

function mapPinnedRoomIds(roomIds: any): PinnedRoomMap {
  if (!Array.isArray(roomIds)) return {};
  const out: PinnedRoomMap = {};
  for (const rawId of roomIds) {
    const roomId = Number(rawId);
    if (!Number.isFinite(roomId) || roomId <= 0) continue;
    out[roomId] = true;
  }
  return out;
}

function getPinPriority(roomId: number, sharedPinnedMap: PinnedRoomMap, personalPinnedMap: PinnedRoomMap) {
  if (sharedPinnedMap[roomId]) return 2;
  if (personalPinnedMap[roomId]) return 1;
  return 0;
}

function sortRoomsByPinnedThenLatest(rooms: Room[], sharedPinnedMap: PinnedRoomMap, personalPinnedMap: PinnedRoomMap) {
  return [...rooms].sort((a, b) => {
    const aPriority = getPinPriority(Number(a.id || 0), sharedPinnedMap, personalPinnedMap);
    const bPriority = getPinPriority(Number(b.id || 0), sharedPinnedMap, personalPinnedMap);
    if (aPriority !== bPriority) return bPriority - aPriority;

    const aMsg = Number(a.last_message_id || 0);
    const bMsg = Number(b.last_message_id || 0);
    if (aMsg !== bMsg) return bMsg - aMsg;

    const aTime = toSortableTime(a.last_activity);
    const bTime = toSortableTime(b.last_activity);
    if (aTime !== bTime) return bTime - aTime;

    return Number(b.id || 0) - Number(a.id || 0);
  });
}

function toSortableTime(value?: string | null) {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function fmtUnread(count: number) {
  return count > 99 ? '99+' : String(count);
}

const CHAT_REFRESH_INTERVAL_MS = 8000;
const CHAT_PICKER_CACHE_VERSION = 1;
const CHAT_PICKER_CACHE_KEY = 'chat_picker_snapshot_v1';
const CHAT_PICKER_CACHE_TTL_MS = 1000 * 60 * 60 * 6;

type ChatPickerCachePayload = {
  v: number;
  updatedAt: number;
  checkedRole: boolean;
  isAdmin: boolean;
  unreadPublic: number;
  unreadDm: number;
  userDms: Room[];
  sharedPinnedRoomMap: PinnedRoomMap;
  personalPinnedRoomMap: PinnedRoomMap;
  publicRoomId: number | null;
  dmWithAdminRoomId: number | null;
};

function normalizeRoomList(input: any): Room[] {
  if (!Array.isArray(input)) return [];

  const out: Room[] = [];
  const seen = new Set<number>();
  for (const row of input) {
    const id = Number(row?.id || 0);
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);

    out.push({
      id,
      name: String(row?.name || ''),
      room_type: row?.room_type === 'public' ? 'public' : 'dm',
      last_message_id: Number(row?.last_message_id || 0) || 0,
      last_activity: row?.last_activity ? String(row.last_activity) : null,
      unread_count: Number(row?.unread_count || 0) || 0,
    });
  }

  return out;
}

function normalizePinnedRoomMap(input: any): PinnedRoomMap {
  if (!input || typeof input !== 'object') return {};
  const ids = Object.keys(input)
    .filter((key) => !!input[key])
    .map((key) => Number(key));
  return mapPinnedRoomIds(ids);
}

interface Props {
  onOpenRoom: (room: Room) => void;
}

const ChatChannelPicker: React.FC<Props> = ({ onOpenRoom }) => {
  const { t } = useI18n();
  const colors = useMemo(() => ({
    bg: '#FFFFFF', cardBg: '#FFFFFF', text: '#1F2937', subtext: '#6B7280',
    border: '#E5E7EB', primary: '#3B82F6', success: '#10B981', danger: '#EF4444',
  }), []);

  const [loading, setLoading] = useState(false);
  const [unreadPublic, setUnreadPublic] = useState(0);
  const [unreadDm, setUnreadDm] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkedRole, setCheckedRole] = useState(false);   // โ… เธฃเธญเธฃเธนเนเธเธ—เธเธฒเธ—ก่อน
  const [userDms, setUserDms] = useState<Room[]>([]);
  const [loadingDms, setLoadingDms] = useState(false);
  const [sharedPinnedRoomMap, setSharedPinnedRoomMap] = useState<PinnedRoomMap>({});
  const [personalPinnedRoomMap, setPersonalPinnedRoomMap] = useState<PinnedRoomMap>({});
  const [pinPickerVisible, setPinPickerVisible] = useState(false);
  const [pinPickerRoomId, setPinPickerRoomId] = useState<number | null>(null);
  const pinSocketRef = useRef<Socket | null>(null);
  const [_publicRoomId, setPublicRoomId] = useState<number | null>(null);
  const [_dmWithAdminRoomId, setDmWithAdminRoomId] = useState<number | null>(null);

  const adminDmUnreadTotal = useMemo(
    () => userDms.reduce((sum, room) => sum + Number(room.unread_count || 0), 0),
    [userDms]
  );

  const displayUserDms = useMemo(
    () => sortRoomsByPinnedThenLatest(userDms, sharedPinnedRoomMap, personalPinnedRoomMap),
    [userDms, sharedPinnedRoomMap, personalPinnedRoomMap]
  );

  const getToken = useCallback(async (): Promise<string> => {
    const token = await AsyncStorage.getItem('token');
    if (!token) throw new Error(t('chatNotLoggedIn'));
    return token;
  }, [t]);

  const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(CHAT_PICKER_CACHE_KEY);
        if (!raw) return;

        const payload = JSON.parse(raw) as ChatPickerCachePayload;
        if (!payload || Number(payload.v) !== CHAT_PICKER_CACHE_VERSION) return;

        const updatedAt = Number(payload.updatedAt || 0);
        if (updatedAt > 0 && Date.now() - updatedAt > CHAT_PICKER_CACHE_TTL_MS) return;
        if (!mounted) return;

        setIsAdmin(!!payload.isAdmin);
        setCheckedRole(payload.checkedRole !== false);
        setUnreadPublic(Math.max(0, Number(payload.unreadPublic || 0)));
        setUnreadDm(Math.max(0, Number(payload.unreadDm || 0)));
        setUserDms(normalizeRoomList(payload.userDms));
        setSharedPinnedRoomMap(normalizePinnedRoomMap(payload.sharedPinnedRoomMap));
        setPersonalPinnedRoomMap(normalizePinnedRoomMap(payload.personalPinnedRoomMap));
        setPublicRoomId(Number(payload.publicRoomId || 0) || null);
        setDmWithAdminRoomId(Number(payload.dmWithAdminRoomId || 0) || null);
      } catch {
        // Ignore malformed cache and bootstrap from network.
      }
    })();

    return () => { mounted = false; };
  }, []);

  const fetchPinnedRooms = useCallback(async (token: string) => {
    if (!isAdmin) {
      setSharedPinnedRoomMap({});
      setPersonalPinnedRoomMap({});
      return;
    }

    const res = await fetch(`${getBaseUrl()}/chat/pins`, { headers: authHeader(token) });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload?.error || 'PINS_FETCH_FAILED');
    const sharedMap = mapPinnedRoomIds(payload?.shared_room_ids ?? payload?.room_ids);
    const personalMap = mapPinnedRoomIds(payload?.personal_room_ids);
    setSharedPinnedRoomMap(sharedMap);
    setPersonalPinnedRoomMap(personalMap);
  }, [isAdmin]);

  useEffect(() => {
    let mounted = true;
    if (!checkedRole) return () => { mounted = false; };

    (async () => {
      try {
        if (!isAdmin) {
          if (mounted) {
            setSharedPinnedRoomMap({});
            setPersonalPinnedRoomMap({});
          }
          return;
        }

        const token = await getToken();
        if (!mounted) return;
        await fetchPinnedRooms(token);
      } catch {
        if (mounted) {
          setSharedPinnedRoomMap({});
          setPersonalPinnedRoomMap({});
        }
      }
    })();
    return () => { mounted = false; };
  }, [checkedRole, isAdmin, getToken, fetchPinnedRooms]);

  const isRoomSharedPinned = useCallback((roomId?: number | null) => {
    const normalized = Number(roomId || 0);
    if (!Number.isFinite(normalized) || normalized <= 0) return false;
    return !!sharedPinnedRoomMap[normalized];
  }, [sharedPinnedRoomMap]);

  const isRoomPersonalPinned = useCallback((roomId?: number | null) => {
    const normalized = Number(roomId || 0);
    if (!Number.isFinite(normalized) || normalized <= 0) return false;
    return !!personalPinnedRoomMap[normalized];
  }, [personalPinnedRoomMap]);

  const toggleRoomPin = useCallback(async (roomId?: number | null, scope: PinScope = 'shared') => {
    if (!isAdmin) return;

    const normalized = Number(roomId || 0);
    if (!Number.isFinite(normalized) || normalized <= 0) return;

    const token = await getToken();
    const sourceMap = scope === 'shared' ? sharedPinnedRoomMap : personalPinnedRoomMap;
    const setMap = scope === 'shared' ? setSharedPinnedRoomMap : setPersonalPinnedRoomMap;
    const wasPinned = !!sourceMap[normalized];
    const nextPinned = !wasPinned;

    setMap((prev) => {
      const next: PinnedRoomMap = { ...prev };
      if (nextPinned) {
        next[normalized] = true;
      } else {
        delete next[normalized];
      }
      return next;
    });

    try {
      const res = await fetch(`${getBaseUrl()}/chat/pins/${normalized}`, {
        method: 'PUT',
        headers: {
          ...authHeader(token),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pinned: nextPinned, scope }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'PINS_UPDATE_FAILED');
      await fetchPinnedRooms(token);
    } catch (e: any) {
      setMap((prev) => {
        const rollback: PinnedRoomMap = { ...prev };
        if (wasPinned) {
          rollback[normalized] = true;
        } else {
          delete rollback[normalized];
        }
        return rollback;
      });
      showAlert(t('error'), e?.message || 'ปักหมุดไม่สำเร็จ');
    }
  }, [isAdmin, getToken, sharedPinnedRoomMap, personalPinnedRoomMap, fetchPinnedRooms, t]);

  const openPublic = useCallback(async () => {
    let openedFromCache = false;
    try {
      setLoading(true);

      const cachedPublicId = Number(_publicRoomId || 0);
      if (cachedPublicId > 0) {
        openedFromCache = true;
        onOpenRoom({
          id: cachedPublicId,
          name: t('chatPickerPublicRoom'),
          room_type: 'public',
          unread_count: Math.max(0, Number(unreadPublic || 0)),
        });
      }

      const token = await getToken();
      const res = await fetch(`${getBaseUrl()}/chat/public-room`, { headers: authHeader(token) });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'PUBLIC_ROOM_FAILED');

      const serverRoomId = Number(j?.data?.id || 0) || null;
      setPublicRoomId(serverRoomId);

      // If cache is stale or missing, sync room target to server payload.
      if (!openedFromCache || (serverRoomId && serverRoomId !== cachedPublicId)) {
        onOpenRoom(j.data);
      }
    } catch (e: any) {
      if (!openedFromCache) {
        showAlert(t('error'), e?.message || t('chatOpenPublicFailed'));
      }
    } finally {
      setLoading(false);
    }
  }, [getToken, onOpenRoom, t, _publicRoomId, unreadPublic]);

  const openDm = useCallback(async () => {
    try {
      if (isAdmin) return; // โ… กันไว้แม้ UI เธเธฐเนเธกเนเนเธชเธ”ง
      setLoading(true);
      const token = await getToken();
      const res = await fetch(`${getBaseUrl()}/chat/ensure-dm-admin`, { method: 'POST', headers: authHeader(token) });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'DM_ROOM_FAILED');
      setDmWithAdminRoomId(Number(j?.data?.id || 0) || null);
      onOpenRoom(j.data);
    } catch (e: any) {
      showAlert(t('error'), e?.message || t('chatOpenAdminFailed'));
    } finally {
      setLoading(false);
    }
  }, [getToken, onOpenRoom, isAdmin, t]);

  const openPinOptions = useCallback((roomId?: number | null) => {
    if (!isAdmin) return;
    const normalized = Number(roomId || 0);
    if (!Number.isFinite(normalized) || normalized <= 0) return;
    setPinPickerRoomId(normalized);
    setPinPickerVisible(true);
  }, [isAdmin]);

  const closePinOptions = useCallback(() => {
    setPinPickerVisible(false);
    setPinPickerRoomId(null);
  }, []);

  const pinPickerSharedPinned = useMemo(() => {
    const roomId = Number(pinPickerRoomId || 0);
    if (!Number.isFinite(roomId) || roomId <= 0) return false;
    return !!sharedPinnedRoomMap[roomId];
  }, [pinPickerRoomId, sharedPinnedRoomMap]);

  const pinPickerPersonalPinned = useMemo(() => {
    const roomId = Number(pinPickerRoomId || 0);
    if (!Number.isFinite(roomId) || roomId <= 0) return false;
    return !!personalPinnedRoomMap[roomId];
  }, [pinPickerRoomId, personalPinnedRoomMap]);

  const handleSelectPinScope = useCallback((scope: PinScope) => {
    const roomId = Number(pinPickerRoomId || 0);
    if (!Number.isFinite(roomId) || roomId <= 0) return;
    closePinOptions();
    toggleRoomPin(roomId, scope);
  }, [pinPickerRoomId, closePinOptions, toggleRoomPin]);

  const fetchUserDms = useCallback(async (token: string, options?: { silent?: boolean }) => {
    const silent = !!options?.silent;
    try {
      if (!silent) setLoadingDms(true);
      const res = await fetch(`${getBaseUrl()}/chat/admin/user-dms`, { headers: authHeader(token) });
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        const normalized = normalizeRoomList(data).map((room) => ({
          ...room,
          room_type: 'dm' as const,
        }));

        setUserDms((prev) => (isSameRoomList(prev, normalized) ? prev : normalized));
      }
    } catch (e) {
      console.log('Error fetching user DMs:', e);
    } finally {
      if (!silent) setLoadingDms(false);
    }
  }, []);

  // โ… เธ•เธฃเธงเธเธชเธญเธเธเธ—เธเธฒเธ—
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
          // เนเธญเธ”มิน: เนเธซเธฅเธ”รายการ DM จากผู้ใช้
          fetchUserDms(token);
        }
      } catch (e) {
        console.log('Error checking admin status:', e);
        setIsAdmin(false);
      } finally {
        if (mounted) setCheckedRole(true);   // โ… รู้ผลแล้ว
      }
    })();
    return () => { mounted = false; };
  }, [getToken, fetchUserDms]);

  // โ… เนเธซเธฅเธ”เธ•เธฑเธงเน€ลข Unread + เธฃเธตเน€เธเธฃเธเธฃเธฒเธขเธเธฒเธฃเธฅเนเธฒเธชเธธเธ”เธญเธฑเธ•เนเธเธกเธฑเธ•เธด
  useEffect(() => {
    if (!checkedRole) return;

    const timer = setTimeout(() => {
      const payload: ChatPickerCachePayload = {
        v: CHAT_PICKER_CACHE_VERSION,
        updatedAt: Date.now(),
        checkedRole: true,
        isAdmin: !!isAdmin,
        unreadPublic: Math.max(0, Number(unreadPublic || 0)),
        unreadDm: Math.max(0, Number(unreadDm || 0)),
        userDms: normalizeRoomList(userDms).slice(0, 80),
        sharedPinnedRoomMap,
        personalPinnedRoomMap,
        publicRoomId: Number(_publicRoomId || 0) || null,
        dmWithAdminRoomId: Number(_dmWithAdminRoomId || 0) || null,
      };

      AsyncStorage.setItem(CHAT_PICKER_CACHE_KEY, JSON.stringify(payload)).catch(() => {});
    }, 180);

    return () => clearTimeout(timer);
  }, [
    checkedRole,
    isAdmin,
    unreadPublic,
    unreadDm,
    userDms,
    sharedPinnedRoomMap,
    personalPinnedRoomMap,
    _publicRoomId,
    _dmWithAdminRoomId,
  ]);

  useEffect(() => {
    let mounted = true;
    let running = false;
    let currentAppState: string = AppState.currentState;
    if (!checkedRole) return; // เธฃเธญเธฃเธนเนเธเธ—เธเธฒเธ—เธเนเธญเธเธเนเธญเธขเธ—เธณ

    const loadLatest = async () => {
      if (running) return;
      running = true;
      try {
        const token = await getToken();

        // ห้องรวม: user ใช้ server-sync, admin ใช้ local per-device
        if (isAdmin) {
          const r1 = await fetch(`${getBaseUrl()}/chat/public-room`, { headers: authHeader(token) });
          const j1 = await r1.json();
          if (mounted && r1.ok && j1?.data?.id) {
            setPublicRoomId(Number(j1.data.id) || null);
            const c1 = await getUnread(j1.data.id);
            setUnreadPublic(c1);
          }

          // เนเธญเธ”มิน: เธญเธฑเธเน€เธ”เธ•รายการ DM เธฅเนเธฒเธชเธธเธ”เนเธฅเธฐเธ•เธฑเธงเน€ลข unread จาก server
          await fetchUserDms(token, { silent: true });
        } else {
          const r1 = await fetch(`${getBaseUrl()}/chat/public-unread`, { headers: authHeader(token) });
          const j1 = await r1.json();
          if (mounted && r1.ok) {
            setPublicRoomId(Number(j1?.room_id || 0) || null);
            setUnreadPublic(Number(j1?.unread_count || 0));
          }
        }

        // DM เธเธฑเธเนเธญเธ”มิน - เน€เธเธเธฒเธฐเธเธนเนเนเธเนเธ—เธฑเนเธงเนเธเน€เธ—่านั้น
        if (!isAdmin) {
          let dmRoomId: number | null = null;
          const r2 = await fetch(`${getBaseUrl()}/chat/ensure-dm-admin`, { method: 'POST', headers: authHeader(token) });
          const j2 = await r2.json();
          if (mounted && r2.ok && j2?.data?.id) {
            dmRoomId = Number(j2.data.id) || null;
            setDmWithAdminRoomId(dmRoomId);
          }

          if (dmRoomId) {
            const r3 = await fetch(`${getBaseUrl()}/chat/unread-summary`, { headers: authHeader(token) });
            const j3 = await r3.json();

            if (mounted && r3.ok) {
              const byRoom = Array.isArray(j3?.by_room) ? j3.by_room : [];
              const dmUnread = byRoom.find((row: any) => Number(row?.room_id || 0) === dmRoomId);
              if (dmUnread) {
                setUnreadDm(Number(dmUnread?.unread_count || 0));
              } else {
                const c2 = await getUnread(dmRoomId);
                if (mounted) setUnreadDm(c2);
              }
            } else {
              const c2 = await getUnread(dmRoomId);
              if (mounted) setUnreadDm(c2);
            }
          } else if (mounted) {
            setUnreadDm(0);
          }
        } else {
          setUnreadDm(0); // เนเธญเธ”มินไม่ใช้ช่องนี้
        }
      } catch {
        // เน€เธเธตเธขเธเนเธ”้
      } finally {
        running = false;
      }
    };

    loadLatest();
    const timer = setInterval(() => {
      if (currentAppState !== 'active') return;
      loadLatest();
    }, CHAT_REFRESH_INTERVAL_MS);
    const appStateSub = AppState.addEventListener('change', (state) => {
      currentAppState = state;
      if (state === 'active') {
        loadLatest();
      }
    });

    return () => {
      mounted = false;
      clearInterval(timer);
      appStateSub.remove();
    };
  }, [getToken, checkedRole, isAdmin, fetchUserDms]);

  useEffect(() => {
    let cancelled = false;
    if (!checkedRole || !isAdmin) return;

    (async () => {
      try {
        const token = await getToken();
        if (cancelled) return;

        if (pinSocketRef.current) {
          try { pinSocketRef.current.disconnect(); } catch {}
          pinSocketRef.current = null;
        }

        const socket = io(getBaseUrl(), {
          transports: ['websocket'],
          extraHeaders: { Authorization: `Bearer ${token}` },
          auth: { token: `Bearer ${token}` },
        });

        socket.on('room_pin_update', () => {
          fetchPinnedRooms(token).catch(() => {});
          fetchUserDms(token, { silent: true }).catch(() => {});
        });

        pinSocketRef.current = socket;
      } catch {
        // Ignore realtime bootstrap errors.
      }
    })();

    return () => {
      cancelled = true;
      if (pinSocketRef.current) {
        try { pinSocketRef.current.disconnect(); } catch {}
        pinSocketRef.current = null;
      }
    };
  }, [checkedRole, isAdmin, getToken, fetchPinnedRooms, fetchUserDms]);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Text style={[styles.header, { color: colors.text }]}>{t('chatPickerHeader')}</Text>

      {/* ห้องรวม */}
      <TouchableOpacity
        style={[styles.card, { borderColor: colors.border }]}
        onPress={openPublic}
        delayLongPress={300}
        activeOpacity={0.9}
      >
        <View style={styles.cardRow}>
          <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}15` }]}>
            <Ionicons name="people-outline" size={28} color={colors.primary} />
          </View>
          <View style={styles.flexOne}>
            <View style={styles.titleRow}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{t('chatPickerPublicRoom')}</Text>
            </View>
            <Text style={{ color: colors.subtext }}>{t('chatPickerPublicDesc')}</Text>
          </View>
          {!!unreadPublic && (
            <View style={[styles.badge, { backgroundColor: colors.danger }]}>
              <Text style={styles.badgeText}>{fmtUnread(unreadPublic)}</Text>
            </View>
          )}
          {loading && <ActivityIndicator />}
        </View>
      </TouchableOpacity>

      {/* เธ•เธดเธ”เธ•เนเธญเนเธญเธ”มิน (เน€เธเธเธฒเธฐเธเธนเนเนเธเนเธ—ั่วไป) */}
      {!isAdmin && (
        <TouchableOpacity
          style={[styles.card, { borderColor: colors.border }]}
          onPress={openDm}
          delayLongPress={300}
          activeOpacity={0.9}
        >
          <View style={styles.cardRow}>
            <View style={[styles.iconWrap, { backgroundColor: `${colors.success}15` }]}>
              <Ionicons name="chatbubbles-outline" size={28} color={colors.success} />
            </View>
            <View style={styles.flexOne}>
              <View style={styles.titleRow}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>{t('chatPickerAdminContact')}</Text>
              </View>
              <Text style={{ color: colors.subtext }}>{t('chatPickerAdminDesc')}</Text>
            </View>
            {!!unreadDm && (
              <View style={[styles.badge, { backgroundColor: colors.danger }]}>
                <Text style={styles.badgeText}>{fmtUnread(unreadDm)}</Text>
              </View>
            )}
            {loading && <ActivityIndicator />}
          </View>
        </TouchableOpacity>
      )}

      {/* รายการ DM เธ—เธฑเนเธเธซเธกเธ”เธชเธณเธซเธฃเธฑเธเนเธญเธ”มิน */}
      {isAdmin && (
        <>
          <Text style={[styles.subHeader, { color: colors.text }]}>
            {t('chatPickerUserMessages')}{adminDmUnreadTotal > 0 ? ` (${fmtUnread(adminDmUnreadTotal)})` : ''}
          </Text>
          <Text style={[styles.pinHint, { color: colors.subtext }]}>กดค้างเพื่อเลือกปักหมุด (รวม/ส่วนตัว)</Text>
          {loadingDms ? (
            <ActivityIndicator style={styles.activityIndicator} color={colors.primary} />
          ) : displayUserDms.length > 0 ? (
            displayUserDms.map(room => (
              <TouchableOpacity
                key={room.id}
                style={[styles.card, { borderColor: colors.border }]}
                onPress={() => onOpenRoom(room)}
                onLongPress={() => openPinOptions(room.id)}
                delayLongPress={300}
                activeOpacity={0.9}
              >
                <View style={styles.cardRow}>
                  <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}15` }]}>
                    <Ionicons name="person-outline" size={24} color={colors.primary} />
                  </View>
                  <View style={styles.flexOne}>
                    <View style={styles.titleRow}>
                      <Text style={[styles.cardTitle, { color: colors.text }]}>{room.name}</Text>
                      {isRoomSharedPinned(room.id) && (
                        <View style={[styles.pinBadge, styles.pinBadgeShared]}>
                          <Ionicons name="bookmark" size={12} color="#3F6E5A" />
                        </View>
                      )}
                      {!isRoomSharedPinned(room.id) && isRoomPersonalPinned(room.id) && (
                        <View style={[styles.pinBadge, styles.pinBadgePersonal]}>
                          <Ionicons name="bookmark-outline" size={12} color="#3F6E5A" />
                        </View>
                      )}
                    </View>
                    <Text style={{ color: colors.subtext }}>{t('chatPrivateMessage')}</Text>
                  </View>
                  {!!room.unread_count && (
                    <View style={[styles.badge, { backgroundColor: colors.danger }]}>
                      <Text style={styles.badgeText}>{fmtUnread(Number(room.unread_count || 0))}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <Text style={[styles.emptyText, { color: colors.subtext }]}>{t('chatNoUserMessages')}</Text>
          )}
        </>
      )}

      <Modal
        visible={pinPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={closePinOptions}
      >
        <Pressable style={styles.pinModalBackdrop} onPress={closePinOptions}>
          <Pressable style={styles.pinModalCard} onPress={() => {}}>
            <Text style={styles.pinModalTitle}>เลือกประเภทปักหมุด</Text>
            <Text style={styles.pinModalSubtitle}>เลือกได้ทั้งแบบรวมและแบบส่วนตัว</Text>

            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.pinOptionButton, pinPickerSharedPinned && styles.pinOptionButtonActive]}
              onPress={() => handleSelectPinScope('shared')}
            >
              <View style={[styles.pinOptionIconWrap, styles.pinOptionIconShared]}>
                <Ionicons name="bookmark" size={16} color="#3F6E5A" />
              </View>
              <View style={styles.pinOptionTextWrap}>
                <Text style={styles.pinOptionTitle}>{pinPickerSharedPinned ? 'ยกเลิกปักหมุดรวม' : 'ปักหมุดรวม'}</Text>
                <Text style={styles.pinOptionDesc}>ทีมแอดมินทุกคนเห็นเหมือนกัน</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.pinOptionButton, pinPickerPersonalPinned && styles.pinOptionButtonActive]}
              onPress={() => handleSelectPinScope('personal')}
            >
              <View style={[styles.pinOptionIconWrap, styles.pinOptionIconPersonal]}>
                <Ionicons name="bookmark-outline" size={16} color="#3F6E5A" />
              </View>
              <View style={styles.pinOptionTextWrap}>
                <Text style={styles.pinOptionTitle}>{pinPickerPersonalPinned ? 'ยกเลิกปักหมุดส่วนตัว' : 'ปักหมุดส่วนตัว'}</Text>
                <Text style={styles.pinOptionDesc}>เห็นเฉพาะบัญชีของคุณ</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.pinCancelButton} onPress={closePinOptions} activeOpacity={0.8}>
              <Text style={styles.pinCancelButtonText}>ยกเลิก</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  pinBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinBadgeShared: {
    backgroundColor: '#DFF2E9',
    borderColor: '#B5D7C7',
  },
  pinBadgePersonal: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CFDDD6',
  },
  badge: { minWidth: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  subHeader: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  pinHint: { marginTop: -6, marginBottom: 8, fontSize: 12 },
  emptyText: { textAlign: 'center', marginTop: 20, fontStyle: 'italic' },
  flexOne: { flex: 1 },
  activityIndicator: { marginTop: 20 },
  pinModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  pinModalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  pinModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  pinModalSubtitle: {
    marginTop: 4,
    marginBottom: 14,
    fontSize: 13,
    color: '#6B7280',
  },
  pinOptionButton: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  pinOptionButtonActive: {
    borderColor: '#8FB7A8',
    backgroundColor: '#F4FBF8',
  },
  pinOptionIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinOptionIconShared: {
    backgroundColor: '#E3F3EB',
    borderWidth: 1,
    borderColor: '#C2DDD1',
  },
  pinOptionIconPersonal: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D4E1DB',
  },
  pinOptionTextWrap: {
    flex: 1,
    marginLeft: 10,
  },
  pinOptionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  pinOptionDesc: {
    marginTop: 2,
    fontSize: 12,
    color: '#6B7280',
  },
  pinCancelButton: {
    marginTop: 2,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  pinCancelButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },
});


