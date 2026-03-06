/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react/no-unstable-nested-components */
/* eslint-disable react-native/no-inline-styles */
// ChatScreen.tsx
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput,
  Platform, StatusBar, KeyboardAvoidingView, AppState, AppStateStatus,
  Image, Linking, Dimensions, Share, ToastAndroid, ActivityIndicator, Keyboard,
  LayoutAnimation, UIManager
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { Ionicons } from '@react-native-vector-icons/ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showAlert } from '../../components/GlobalAlert';
import io, { Socket } from 'socket.io-client';
import Clipboard from '@react-native-clipboard/clipboard';
import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import { launchImageLibrary, launchCamera, Asset } from 'react-native-image-picker';
import { openPdfFromUrl } from './pdfViewer';
import { initNotifications, showMessageNotification, setAppBadge } from './notifications';
import { incUnread, clearUnread, getTotalUnread } from './unreadStore';
import { BASE_HOST, BASE_PORT } from '../config';
import ImageViewing from 'react-native-image-viewing';
import RNFS from 'react-native-fs';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { PermissionsAndroid } from 'react-native';
const ANDROID_HOST = BASE_HOST;

export function getBaseUrl() {
  const host = Platform.OS === 'android' ? ANDROID_HOST : BASE_HOST;
  return `http://${host}:${BASE_PORT}`;
}

type Me = {
  id: number;
  username: string;
  full_name?: string;
  role: 'admin' | 'user';
};

type ChatRoom = {
  id: number;
  name: string;
  room_type: 'public' | 'dm';
};

type MsgStatus = 'sending' | 'sent' | 'delivered' | 'read';

type ChatMessage = {
  id: number;
  localId?: string;
  room_id: number;
  user_id: number;
  username: string;
  full_name?: string;
  text: string;
  created_at: string;
  msg_type?: 'text' | 'image' | 'file';
  file_url?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  status?: MsgStatus;
  upload_progress?: number | null;
  reply_to_id?: number | null;
  reply_to?: {
    id: number;
    user_id: number;
    username: string;
    full_name?: string;
    text: string;
    msg_type?: 'text' | 'image' | 'file';
    file_url?: string | null;
    file_name?: string | null;
    mime_type?: string | null;
  } | null;
};

interface ChatScreenProps {
  darkMode?: boolean;
  initialRoom?: ChatRoom | null;
  onBack?: () => void;
}

/* ===== helpers ===== */
const isSameMinute = (a: string, b: string) => {
  const da = new Date(a), db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate() &&
    da.getHours() === db.getHours() &&
    da.getMinutes() === db.getMinutes()
  );
};

// ใช้สำหรับกรุ๊ปเป็น grid: ภายใน 90 วินาทีเดียวกัน
const isCloseInTime = (a: string, b: string, ms = 90_000) =>
  Math.abs(new Date(a).getTime() - new Date(b).getTime()) <= ms;

const isSameSender = (a?: number | null, b?: number | null) =>
  String(a ?? '') === String(b ?? '');

const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });

const getInitial = (name?: string) => {
  if (!name) return '?';
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return trimmed[0].toUpperCase();
};

const makeLocalId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const ellipsize = (s: string, n = 70) => (s || '').length > n ? s.slice(0, n - 1) + '…' : (s || '');

const asNum = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function absoluteUrl(u?: string | null) {
  if (!u) return '';
  return u.startsWith('http') ? u : `${getBaseUrl()}${u}`;
}

function buildCopyText(msg: ChatMessage) {
  if (msg.msg_type === 'text' || !msg.msg_type) return msg.text || '';
  if (msg.msg_type === 'image') {
    const parts: string[] = [];
    if (msg.text) parts.push(msg.text);
    if (msg.file_url) parts.push(absoluteUrl(msg.file_url));
    return parts.join('\n');
  }
  const name = msg.file_name || 'ไฟล์แนบ';
  const url = absoluteUrl(msg.file_url || '');
  return [name, url].filter(Boolean).join('\n');
}

/** ถ้า reply_to ไม่มีเนื้อหา ให้ดึง snapshot จาก messages ปัจจุบัน */
function makeReplySnapshot(m: ChatMessage, list: ChatMessage[]) {
  if (m.reply_to && (m.reply_to.text || m.reply_to.file_name || m.reply_to.file_url)) {
    return m.reply_to;
  }
  const id = asNum(m.reply_to?.id) || asNum(m.reply_to_id);
  if (!id) return null;
  const found = list.find(x => x.id === id);
  if (!found) {
    return {
      id,
      user_id: 0,
      username: `ข้อความ #${id}`,
      text: ''
    } as any;
  }
  return {
    id: found.id,
    user_id: found.user_id,
    username: found.username,
    full_name: found.full_name,
    text: found.text,
    msg_type: found.msg_type,
    file_url: found.file_url ?? null,
    file_name: found.file_name ?? null,
  };
}

/* ====== Reply UI pill (multiline & full width) ====== */
const ReplyPill: React.FC<{
  reply: NonNullable<ChatMessage['reply_to']> | (Pick<ChatMessage, 'reply_to_id'> & { reply_to?: never });
  onPress?: () => void;
  mine?: boolean;
}> = ({ reply, onPress, mine }) => {
  const id = asNum((reply as any)?.id) || asNum((reply as any)?.reply_to_id);
  const mimeType = (reply as any)?.mime_type as string | undefined;
  const fileName = (reply as any)?.file_name as string | undefined;
  const isPdf = (mimeType || '').includes('pdf') || (fileName || '').toLowerCase().endsWith('.pdf');
  const isImage = (reply as any)?.msg_type === 'image' && !isPdf;
  const isFile = (reply as any)?.msg_type === 'file' || isPdf;
  const text = (reply as any)?.text as string | undefined;
  const name =
    (reply as any)?.full_name ||
    (reply as any)?.username ||
    (id ? `ข้อความ #${id}` : 'ข้อความก่อนหน้า');
  const imgUri = (reply as any)?.file_url as string | undefined;

  const leftBar = mine ? '#8EC8FF' : '#B9C1CC';
  const bg = mine ? '#E8F2FF' : '#F3F4F6';

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 10,
        backgroundColor: bg,
        marginBottom: 6,
        width: '100%',
        minWidth: 220,
      }}
    >
      <View style={{ width: 3, height: '100%', backgroundColor: leftBar, borderRadius: 2, marginRight: 8 }} />
      {!!(isImage && imgUri) && (
        <Image
          source={{ uri: imgUri.startsWith('http') ? imgUri : `${getBaseUrl()}${imgUri}` }}
          style={{ width: 40, height: 40, borderRadius: 6, marginRight: 8, backgroundColor: '#E5E7EB' }}
        />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: '#111827' }}>
          {name}
        </Text>

        {isImage ? (
          <>
            <Text style={{ fontSize: 12, color: '#374151' }}>📷 รูปภาพ</Text>
            {text ? (
              <Text style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>
                {text}
              </Text>
            ) : null}
          </>
        ) : isFile ? (
          <Text style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>
            📎 {fileName || 'ไฟล์แนบ'}
          </Text>
        ) : text ? (
          <Text style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>
            {text}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

/* ====== Popover Menu ====== */
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

type PopoverState = {
  visible: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  mine?: boolean;
  isPinned?: boolean;
  target?: ChatMessage | null;
};

const popStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '80%',
    maxWidth: 280,
  },
  menuContainer: {
    backgroundColor: '#2B2D31',
    borderRadius: 12,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuLabel: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  menuIcon: {
    marginLeft: 12,
  },
});

const PopoverMenu: React.FC<{
  state: PopoverState;
  onReply: () => void;
  onPinToggle: () => void;
  onCopy: () => void;
  onClose: () => void;
}> = ({ state, onReply, onPinToggle, onCopy, onClose }) => {
  if (!state.visible) return null;

  return (
    <View style={StyleSheet.absoluteFill}>
      <TouchableOpacity style={popStyles.overlay} activeOpacity={1} onPress={onClose}>
        <View />
      </TouchableOpacity>

      <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center' }]} pointerEvents="box-none">
        <View style={popStyles.container}>
          <View style={popStyles.menuContainer}>
            <TouchableOpacity style={popStyles.menuItem} onPress={onReply}>
              <Text style={popStyles.menuLabel}>ตอบกลับ</Text>
              <Ionicons name="arrow-undo-outline" size={20} color="#FFFFFF" style={popStyles.menuIcon} />
            </TouchableOpacity>

            <TouchableOpacity style={popStyles.menuItem} onPress={onCopy}>
              <Text style={popStyles.menuLabel}>คัดลอก</Text>
              <Ionicons name="copy-outline" size={20} color="#FFFFFF" style={popStyles.menuIcon} />
            </TouchableOpacity>

            <TouchableOpacity style={[popStyles.menuItem, popStyles.menuItemLast]} onPress={onPinToggle}>
              <Text style={popStyles.menuLabel}>{state.isPinned ? 'ยกเลิกปักหมุด' : 'ปักหมุด'}</Text>
              <Ionicons name={state.isPinned ? 'pin' : 'pin-outline'} size={20} color="#FFFFFF" style={popStyles.menuIcon} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};

/* ====== share helper for outside icon ====== */
const shareFileMessage = async (m: ChatMessage) => {
  try {
    if (!m.file_url) return;
    const url = m.file_url.startsWith('http') ? m.file_url : `${getBaseUrl()}${m.file_url}`;
    const title = m.file_name || 'ไฟล์';
    const message = `${title}\n${url}`;
    if (Platform.OS === 'ios') await Share.share({ url, message, title });
    else await Share.share({ message });
  } catch (e: any) {
    Platform.OS === 'android'
      ? ToastAndroid.show('แชร์ไม่สำเร็จ', ToastAndroid.SHORT)
      : showAlert('แชร์ไม่สำเร็จ', e?.message || '');
  }
};

/* ================================================================== */
/* ============ Render list with image-grid grouping ================= */
/* ================================================================== */
type RenderUnit =
  | { kind: 'msg'; msg: ChatMessage; idx: number; key: string }
  | { kind: 'grid'; items: ChatMessage[]; mine: boolean; created_at: string; key: string };


function toRenderUnits(msgs: ChatMessage[], meId?: number): RenderUnit[] {
  const out: RenderUnit[] = [];
  const usedKeys = new Set<string>();
  
  const getUniqueKey = (base: string) => {
    let k = base;
    let c = 1;
    while (usedKeys.has(k)) {
      k = `${base}_${c++}`;
    }
    usedKeys.add(k);
    return k;
  };

  let i = 0;
  while (i < msgs.length) {
    const m = msgs[i];

    // เงื่อนไขกรุ๊ปรูป (Exclue PDF marked as image)
    const isRealImage = (x: ChatMessage) => x.msg_type === 'image' && !((x.mime_type || '').includes('pdf') || (x.file_name || '').toLowerCase().endsWith('.pdf'));

    if (isRealImage(m)) {
      const group: ChatMessage[] = [m];
      let j = i + 1;
      while (j < msgs.length) {
        const n = msgs[j];
        if (
          isRealImage(n) &&
          isSameSender(n.user_id, m.user_id) &&
          isCloseInTime(n.created_at, m.created_at, 90_000) &&
          String(asNum(n.reply_to_id)) === String(asNum(m.reply_to_id))
        ) {
          group.push(n);
          j++;
        } else break;
      }
      if (group.length >= 2) {
        const groupKeyIds = group
          .map(g => (g.id ? String(g.id) : (g.localId ? String(g.localId) : ''))) 
          .filter(Boolean)
          .join('_');
        out.push({
          kind: 'grid',
          items: group,
          mine: isSameSender(m.user_id, meId),
          created_at: group[group.length - 1].created_at,
          key: getUniqueKey(`grid_${groupKeyIds || i}_${group.length}`)
        });
        i = j;
        continue;
      }
    }

    const baseKey = m.id ? `id_${m.id}` : (m.localId ? `lid_${m.localId}` : `idx_${i}`);
    out.push({ kind: 'msg', msg: m, idx: i, key: getUniqueKey(baseKey) });
    i++;
  }
  return out;
}

/* ================================================================== */
const ChatScreen: React.FC<ChatScreenProps> = ({ darkMode = false, initialRoom, onBack }) => {
  const [me, setMe] = useState<Me | null>(null);
  const [currentRoom, setCurrentRoom] = useState<ChatRoom | null>(initialRoom || null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [text, setText] = useState('');
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const [pinnedList, setPinnedList] = useState<ChatMessage[]>([]);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [popover, setPopover] = useState<PopoverState>({ visible: false, x: 0, y: 0, w: 0, h: 0, target: null });

  const flatRef = useRef<FlatList<any>>(null);
  const socketRef = useRef<Socket | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingEmitAt = useRef<number>(0);
  const bubbleRefs = useRef<Record<string, View | null>>({});
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const [isForeground, setIsForeground] = useState(true);

  // New State for Image Preview
  const [selectedImages, setSelectedImages] = useState<Asset[]>([]);

  // Fix: แยก UI ตอนพับ/เปิด Keyboard (Android)
  const [keyboardUsing, setKeyboardUsing] = useState(false);
  const [toolsVisible, setToolsVisible] = useState(true); // Messenger style
  const [androidKbHeight, setAndroidKbHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subShow = Keyboard.addListener('keyboardDidShow', (e) => {
      setAndroidKbHeight(e.endCoordinates.height);
      setKeyboardUsing(true);
    });
    const subHide = Keyboard.addListener('keyboardDidHide', () => {
      setAndroidKbHeight(0);
      setKeyboardUsing(false);
      setToolsVisible(true);
    });
    return () => { subShow.remove(); subHide.remove(); };
  }, []);

  const colors = useMemo(() => ({
    bg: '#F2FFF8',
    cardBg: '#FFFFFF',
    text: '#1F2937',
    subtext: '#65A380',
    border: '#E8F5F0',
    primary: '#4ADE80',
    success: '#10B981',
    danger: '#EF4444',
    myBubble: '#E6FEF0',
    otherBubble: '#FFFFFF',
    dayChip: '#D5F2E3',
  }), []);

  const getToken = useCallback(async () => AsyncStorage.getItem('token'), []);

  // ===== Me =====
  const fetchMe = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) {
        setMe(null);
        return;
      }
      const res = await fetch(`${getBaseUrl()}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('ME_FAILED');
      const data: Me = await res.json();
      setMe(data);
    } catch {
      setMe(null);
    }
  }, [getToken]);

  // ===== Pinned (multiple) =====
  const loadPinned = useCallback(async (roomId: number) => {
    try {
      const raw = await AsyncStorage.getItem(`pinned_list_${roomId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        setPinnedList(Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []));
      } else {
        // migrate จาก format เก่า (single pin)
        const oldRaw = await AsyncStorage.getItem(`pinned_${roomId}`);
        if (oldRaw) {
          const old = JSON.parse(oldRaw);
          setPinnedList(old ? [old] : []);
          await AsyncStorage.setItem(`pinned_list_${roomId}`, JSON.stringify([old]));
          await AsyncStorage.removeItem(`pinned_${roomId}`);
        } else {
          setPinnedList([]);
        }
      }
    } catch { setPinnedList([]); }
  }, []);

  const togglePin = useCallback(async (roomId: number, msg: ChatMessage) => {
    setPinnedList(prev => {
      const exists = prev.some(p => (p.id && p.id === msg.id) || (p.localId && p.localId === msg.localId));
      const next = exists
        ? prev.filter(p => !((p.id && p.id === msg.id) || (p.localId && p.localId === msg.localId)))
        : [...prev, msg];
      AsyncStorage.setItem(`pinned_list_${roomId}`, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const unpinOne = useCallback(async (roomId: number, msgId: number | string) => {
    setPinnedList(prev => {
      const next = prev.filter(p => p.id !== msgId && p.localId !== msgId);
      AsyncStorage.setItem(`pinned_list_${roomId}`, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);
  const PAGE_SIZE = 30;
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // ===== Messages =====
  const fetchMessages = useCallback(async (roomId: number, beforeId?: number) => {
    try {
      setMsgLoading(true);
      const token = await getToken();
      if (!token) return [];

      let url = `${getBaseUrl()}/chat/messages?room_id=${roomId}&limit=${PAGE_SIZE}`;
      if (beforeId) url += `&before_id=${beforeId}`;

      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'MESSAGES_FAILED');
      return Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
    } catch {
      return [];
    } finally {
      setMsgLoading(false);
    }
  }, [getToken]);
  
  const loadInitial = useCallback(async (roomId: number) => {
    const list = await fetchMessages(roomId);
    if (!list.length) {
      setMessages([]);
      return;
    }
    setMessages(list);
    setHasMore(list.length === PAGE_SIZE);

    requestAnimationFrame(() => {
      flatRef.current?.scrollToOffset({ offset: 0, animated: false });
    });
  }, [fetchMessages]);
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !messages.length || !currentRoom) return;
    setLoadingMore(true);

    const oldest = messages[messages.length - 1];
    const more = await fetchMessages(currentRoom.id, oldest.id);

    if (more.length === 0) {
      setHasMore(false);
    } else {
      setMessages(prev => {
        const ids = prev
          .map(m => m.id)
          .filter((id): id is number => Number.isFinite(id) && id > 0);
        const existing = new Set<number>(ids);
        const deduped = more.filter((m: ChatMessage) => m.id <= 0 || !existing.has(m.id));
        return [...prev, ...deduped];
      });
    }

    setLoadingMore(false);
  }, [loadingMore, hasMore, messages, currentRoom, fetchMessages]);


  // ===== Socket =====
  const connectSocket = useCallback(async (roomId: number) => {
    const token = await getToken();
    if (!token) return;

    if (socketRef.current) {
      try { socketRef.current.disconnect(); } catch { }
      socketRef.current = null;
    }

    const socket = io(getBaseUrl(), {
      transports: ['websocket'],
      extraHeaders: { Authorization: `Bearer ${token}` }
    });

    socket.on('connect', () => {
      socket.emit('join_room', { room_id: roomId });
    });

    socket.on('new_message', async (msg: ChatMessage) => {
      setMessages(prev => {
        // 1) If same id already exists, update it (avoid duplicates)
        if (msg.id) {
          const sameId = prev.findIndex(m => m.id === msg.id);
          if (sameId >= 0) {
            const copy = [...prev];
            copy[sameId] = { ...copy[sameId], ...msg, status: 'sent' };
            return copy;
          }
        }

        // 2) Try to match an optimistic message by simple heuristics
        const optimisticIdx = prev.findIndex(m =>
          !!m.localId &&
          m.user_id === msg.user_id &&
          (m.text || '') === (msg.text || '') &&
          (m.msg_type || 'text') === (msg.msg_type || 'text')
        );
        if (optimisticIdx >= 0) {
          const copy = [...prev];
          copy[optimisticIdx] = { ...msg, status: 'sent' };
          return copy;
        }
        return [msg, ...prev];
      });

      if (msg.user_id === me?.id) setReplyingTo(null);
      setTimeout(() => flatRef.current?.scrollToOffset({ offset: 0, animated: true }), 50);

      const mine = msg.user_id === me?.id;
      const inThisRoom = currentRoom?.id === msg.room_id;
      if (!mine && (!inThisRoom || !isForeground)) {
        await incUnread(msg.room_id);
        const total = await getTotalUnread();
        await setAppBadge(total);
        await showMessageNotification({
          title: currentRoom?.name ? `ข้อความใหม่ - ${currentRoom.name}` : 'ข้อความใหม่',
          body: msg.msg_type === 'text'
            ? (msg.text || 'ข้อความใหม่')
            : (msg.msg_type === 'image' ? 'ส่งรูปภาพ' : (msg.file_name || 'ส่งไฟล์')),
          data: { room_id: String(msg.room_id) }
        });
      }
    });

    socket.on('message_status', (p: { room_id: number; message_id: number; status: MsgStatus }) => {
      if (p.room_id !== currentRoom?.id) return;
      setMessages(prev => prev.map(m => (m.id === p.message_id ? { ...m, status: p.status } : m)));
    });

    socket.on('typing', (p: { room_id: number; user_id: number; username: string; full_name?: string; typing: boolean }) => {
      if (p.room_id !== currentRoom?.id || p.user_id === me?.id) return;
      const name = p.full_name || p.username;
      setTypingUsers((prev) => {
        const copy = { ...prev };
        if (p.typing) copy[name] = Date.now() + 2500;
        else delete copy[name];
        return copy;
      });
    });

    socket.on('disconnect', () => { });

    socketRef.current = socket;
  }, [getToken, me?.id, currentRoom?.id, currentRoom?.name, isForeground]);

  // typing emit
  const emitTyping = useCallback((typing: boolean) => {
    if (!currentRoom || !socketRef.current) return;
    const now = Date.now();
    if (typing) {
      if (now - lastTypingEmitAt.current < 1000) return;
      lastTypingEmitAt.current = now;
    }
    socketRef.current.emit('typing', { room_id: currentRoom.id, typing });
  }, [currentRoom?.id]);



  // ===== upload single (keep for camera/doc) =====
  type UploadPart = { uri: string; name: string; type: string; size?: number | null };

  const uploadAttachment = useCallback(async (file: UploadPart) => {
    if (!currentRoom || !me) return;
    const token = await getToken();
    if (!token) return showAlert('ยังไม่ได้ล็อกอิน');

    const isImage = file.type.startsWith('image/');
    const localId = makeLocalId();

    const temp: ChatMessage = {
      id: 0,
      localId,
      room_id: currentRoom.id,
      user_id: me.id,
      username: me.username,
      full_name: me.full_name,
      text: isImage ? '' : (file.name || 'ไฟล์แนบ'),
      msg_type: isImage ? 'image' : 'file',
      file_url: file.uri,
      file_name: file.name,
      file_size: file.size || null,
      mime_type: file.type,
      created_at: new Date().toISOString(),
      status: 'sending',
      upload_progress: 0,
      reply_to_id: asNum(replyingTo?.id),
      reply_to: replyingTo ? {
        id: replyingTo.id,
        user_id: replyingTo.user_id,
        username: replyingTo.username,
        full_name: replyingTo.full_name,
        text: replyingTo.text,
        msg_type: replyingTo.msg_type,
        file_url: replyingTo.file_url ?? null,
        file_name: replyingTo.file_name ?? null,
      } : null,
    };

    // Keep newest-first order for inverted FlatList
    setMessages(prev => [temp, ...prev]);
    setReplyingTo(null);
    setTimeout(() => flatRef.current?.scrollToOffset({ offset: 0, animated: true }), 0);

    try {
      const form = new FormData();
      form.append('room_id', String(currentRoom.id));
      if (temp.reply_to_id) form.append('reply_to_id', String(temp.reply_to_id));
      form.append('file', {
        uri: file.uri,
        type: file.type,
        name: file.name
      } as any);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${getBaseUrl()}/chat/upload`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (e: any) => {
        if (e && e.lengthComputable) {
          const p = Math.max(0, Math.min(1, e.loaded / e.total));
          setMessages(prev => prev.map(m => (m.localId === localId ? { ...m, upload_progress: p } : m)));
        }
      };
      xhr.onload = () => {
        try {
          const status = xhr.status;
          const j = JSON.parse(xhr.responseText || '{}');
          if (status < 200 || status >= 300) throw new Error(j?.error || 'UPLOAD_FAILED');
          if (j?.id) {
            setMessages(prev => prev.map(m =>
              (m.localId === localId ? { ...m, id: j.id, status: 'sent', file_url: j.file_url ?? m.file_url, upload_progress: null } : m)
            ));
          } else {
            setMessages(prev => prev.map(m => (m.localId === localId ? { ...m, status: 'sent', upload_progress: null } : m)));
          }
        } catch (e: any) {
          setMessages(prev => prev.map(m => (m.localId === localId ? { ...m, status: 'sending' } : m)));
          showAlert('อัปโหลดไม่สำเร็จ', e?.message || 'ลองใหม่อีกครั้ง');
        }
      };
      xhr.onerror = () => {
        setMessages(prev => prev.map(m => (m.localId === localId ? { ...m, status: 'sending' } : m)));
        showAlert('อัปโหลดไม่สำเร็จ', 'เครือข่ายผิดพลาด');
      };
      xhr.send(form as any);
    } catch (e: any) {
      setMessages(prev => prev.map(m => (m.localId === localId ? { ...m, status: 'sending' } : m)));
      showAlert('อัปโหลดไม่สำเร็จ', e?.message || 'ลองใหม่อีกครั้ง');
    }
  }, [currentRoom, me, getToken, replyingTo]);

  // ======= multi-images upload =======
  const uploadImagesMulti = useCallback(async (assets: Asset[]) => {
    if (!currentRoom || !me) return;
    const token = await getToken();
    if (!token) return showAlert('ยังไม่ได้ล็อกอิน');

    const caption = text.trim();
    const replyToId = asNum(replyingTo?.id);

    // optimistic messages
    const localIds: string[] = [];
    const temps: ChatMessage[] = assets.map((a, i) => {
      const localId = makeLocalId();
      localIds.push(localId);
      return {
        id: 0,
        localId,
        room_id: currentRoom.id,
        user_id: me.id,
        username: me.username,
        full_name: me.full_name,
        text: i === 0 ? caption : '',
        created_at: new Date().toISOString(),
        msg_type: (a.type || '').startsWith('image/') ? 'image' : 'file',
        file_url: a.uri || '',
        file_name: a.fileName || 'file',
        file_size: a.fileSize || null,
        mime_type: a.type || 'application/octet-stream',
        status: 'sending',
        upload_progress: 0,
        reply_to_id: replyToId,
        reply_to: replyingTo ? {
          id: replyingTo.id,
          user_id: replyingTo.user_id,
          username: replyingTo.username,
          full_name: replyingTo.full_name,
          text: replyingTo.text,
          msg_type: replyingTo.msg_type,
          file_url: replyingTo.file_url ?? null,
          file_name: replyingTo.file_name ?? null,
        } : null,
      };
    });

    // Keep newest-first order for inverted FlatList
    setMessages(prev => [...temps, ...prev]);
    setReplyingTo(null);
    if (caption) setText('');
    setTimeout(() => flatRef.current?.scrollToOffset({ offset: 0, animated: true }), 0);

    try {
      const form = new FormData();
      form.append('room_id', String(currentRoom.id));
      if (replyToId) form.append('reply_to_id', String(replyToId));
      if (caption) form.append('caption', caption);

      assets.forEach((a, idx) => {
        if (!a.uri) return;
        const name = a.fileName || `image_${idx + 1}.jpg`;
        const type = a.type || 'image/jpeg';
        (form as any).append('files', { uri: a.uri, name, type } as any);
      });

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${getBaseUrl()}/chat/upload-multi`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (e: any) => {
        if (e && e.lengthComputable) {
          const p = Math.max(0, Math.min(1, e.loaded / e.total));
          setMessages(prev => prev.map(m => (localIds.includes(m.localId || '') ? { ...m, upload_progress: p } : m)));
        }
      };
      xhr.onload = () => {
        try {
          const status = xhr.status;
          const j = JSON.parse(xhr.responseText || '{}');
          if (status < 200 || status >= 300) throw new Error(j?.error || 'UPLOAD_FAILED');
          const realList: ChatMessage[] = Array.isArray(j?.data) ? j.data : [];
          setMessages(prev => {
            let copy = [...prev];
            realList.forEach((real, i) => {
              const lid = localIds[i];
              const idx = copy.findIndex(m => m.localId === lid);
              if (idx >= 0) copy[idx] = { ...real, status: 'sent', upload_progress: null };
            });
            return copy;
          });
        } catch (e: any) {
          setMessages(prev => prev.map(m => (localIds.includes(m.localId || '') ? { ...m, status: 'sending' } : m)));
          showAlert('อัปโหลดไม่สำเร็จ', e?.message || 'ลองใหม่อีกครั้ง');
        }
      };
      xhr.onerror = () => {
        setMessages(prev => prev.map(m => (localIds.includes(m.localId || '') ? { ...m, status: 'sending' } : m)));
        showAlert('อัปโหลดไม่สำเร็จ', 'เครือข่ายผิดพลาด');
      };
      xhr.send(form as any);
    } catch (e: any) {
      setMessages(prev => prev.map(m =>
        (localIds.includes(m.localId || '') ? { ...m, status: 'sending' } : m)
      ));
      showAlert('อัปโหลดไม่สำเร็จ', e?.message || 'ลองใหม่อีกครั้ง');
    }
  }, [currentRoom, me, getToken, replyingTo, text]);

  // send text
  const sendMessage = useCallback(async () => {
    // 1. ถ้ามีรูปภาพรอส่ง ให้ส่งรูปภาพ (พร้อมแคปชั่นถ้ามี)
    if (selectedImages.length > 0) {
      await uploadImagesMulti(selectedImages);
      setSelectedImages([]);
      // uploadImagesMulti จะเคลียร์ text ให้เองถ้ามี caption
      return;
    }

    // 2. ถ้าไม่มีรูป ก็ส่งข้อความตามปกติ
    const t = text.trim();
    if (!t || !currentRoom || !me) return;

    const localId = makeLocalId();
    const temp: ChatMessage = {
      id: 0,
      localId,
      room_id: currentRoom.id,
      user_id: me.id,
      username: me.username,
      full_name: me.full_name,
      text: t,
      created_at: new Date().toISOString(),
      msg_type: 'text',
      status: 'sending',
      reply_to_id: asNum(replyingTo?.id),
      reply_to: replyingTo ? {
        id: replyingTo.id,
        user_id: replyingTo.user_id,
        username: replyingTo.username,
        full_name: replyingTo.full_name,
        text: replyingTo.text,
        msg_type: replyingTo.msg_type,
        file_url: replyingTo.file_url ?? null,
        file_name: replyingTo.file_name ?? null,
      } : null,
    };

    // Keep newest-first order for inverted FlatList
    setMessages(prev => [temp, ...prev]);
    setText('');
    setReplyingTo(null);
    setTimeout(() => flatRef.current?.scrollToOffset({ offset: 0, animated: true }), 0);

    try {
      const token = await getToken();
      const body: any = { room_id: currentRoom.id, text: t };
      if (temp.reply_to_id) body.reply_to_id = temp.reply_to_id;

      const res = await fetch(`${getBaseUrl()}/chat/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'SEND_FAILED');

      if (j?.id) {
        setMessages(prev => prev.map(m => (m.localId === localId ? { ...m, id: j.id, status: 'sent' } : m)));
      } else {
        setMessages(prev => prev.map(m => (m.localId === localId ? { ...m, status: 'sent' } : m)));
      }
    } catch (e: any) {
      setMessages(prev => prev.map(m => (m.localId === localId ? { ...m, status: 'sending' } : m)));
      showAlert('ส่งไม่สำเร็จ', e?.message || 'ลองใหม่อีกครั้ง');
    }
  }, [text, currentRoom, me, getToken, replyingTo, selectedImages, uploadImagesMulti]);

  // pickers
  const pickDocument = useCallback(async () => {
    try {
      if (Platform.OS === 'android') {
        Keyboard.dismiss();
        await new Promise(r => setTimeout(r, 300));
      }
      const res = await pick({ type: [types.allFiles], allowMultiSelection: true });
      const newAssets = res.map(r => ({
        uri: r.uri,
        fileName: r.name || 'file',
        type: r.type || 'application/octet-stream',
        fileSize: r.size || 0,
      } as Asset));
      
      setSelectedImages(prev => [...prev, ...newAssets]);
    } catch (e: any) {
      if (!(isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED)) {
        showAlert('เลือกล้มเหลว', e?.message || 'ไม่สามารถเลือกไฟล์ได้');
      }
    }
  }, []);

  const pickImagesMulti = useCallback(async () => {
    if (Platform.OS === 'android') {
      Keyboard.dismiss();
      await new Promise(r => setTimeout(r, 300));
    }
    const res = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.8,
      selectionLimit: 15,
      includeExtra: true,
    });
    const assets = (res.assets || []).filter(a => !!a.uri);
    if (!assets.length) return;
    
    // Instead of auto-upload, set to state
    setSelectedImages(prev => [...prev, ...assets]);
  }, []);

  const takePhoto = useCallback(async () => {
    if (Platform.OS === 'android') {
      Keyboard.dismiss();
      await new Promise(r => setTimeout(r, 300));
    }
    const res = await launchCamera({ mediaType: 'photo', quality: 0.8, saveToPhotos: true });
    const a = (res.assets || [])[0] as Asset | undefined;
    if (!a) return;
    
    // Instead of auto-upload, set to state
    setSelectedImages(prev => [...prev, a]);
  }, []);

  // effects
  useEffect(() => { initNotifications(); }, []);
  useEffect(() => { fetchMe(); }, [fetchMe]);
  useEffect(() => { if (initialRoom) setCurrentRoom(initialRoom); }, [initialRoom]);

  useEffect(() => {
    const t = setInterval(() => {
      setTypingUsers((prev) => {
        const now = Date.now();
        const copy: Record<string, number> = {};
        Object.entries(prev).forEach(([k, v]) => {
          if (v > now) copy[k] = v;
        });
        return copy;
      });
    }, 800);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      appState.current = next;
      setIsForeground(next === 'active');
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    (async () => {
      if (currentRoom) {
        await clearUnread(currentRoom.id);
        const total = await getTotalUnread();
        await setAppBadge(total);
        await loadInitial(currentRoom.id);   // ✅ โหลดครั้งแรก
        await connectSocket(currentRoom.id);
        await loadPinned(currentRoom.id);
      }
    })();

    return () => {
      if (socketRef.current) {
        try { socketRef.current.disconnect(); } catch { }
        socketRef.current = null;
      }
    };
  }, [currentRoom?.id, connectSocket, loadInitial, loadPinned])
  // open url
  const openUrl = (url: string) => {
    const absolute = url.startsWith('http') ? url : `${getBaseUrl()}${url}`;
    Linking.openURL(absolute);
  };

  // show popover
  const showPopoverFor = useCallback((key: string, item: ChatMessage) => {
    const ref = bubbleRefs.current[key];
    if (!ref || !currentRoom) return;
    const isPinned = pinnedList.some(p => (p.id && p.id === item.id) || (p.localId && p.localId === item.localId));
    (ref as any).measureInWindow((x: number, y: number, w: number, h: number) => {
      setPopover({ visible: true, x, y, w, h, mine: item.user_id === me?.id, target: item, isPinned });
    });
  }, [currentRoom?.id, pinnedList, me?.id]);

  /* ===== Render Units (with image grid grouping) ===== */
  const renderUnits = useMemo(() => toRenderUnits(messages, me?.id), [messages, me?.id]);

  // สร้าง map จาก message ID → renderUnit index
  const idRenderIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    renderUnits.forEach((unit, i) => {
      if (unit.kind === 'msg') {
        const mid = asNum(unit.msg.id);
        if (mid) map.set(mid, i);
      } else if (unit.kind === 'grid') {
        unit.items.forEach(item => {
          const mid = asNum(item.id);
          if (mid) map.set(mid, i);
        });
      }
    });
    return map;
  }, [renderUnits]);

  const [scrollingToId, setScrollingToId] = useState<number | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);

  const goToMessage = useCallback(async (msgId?: number | null) => {
    const id = asNum(msgId);
    if (!id || !currentRoom) return;

    // helper: scroll ไปที่ข้อความแล้ว highlight
    const doScroll = (targetIdx: number) => {
      setHighlightId(id);
      flatRef.current?.scrollToIndex({ index: targetIdx, animated: true, viewPosition: 0.5 });
      setTimeout(() => setHighlightId(null), 1500);
    };

    // ถ้าอยู่ใน list แล้ว → scroll เลย
    if (idRenderIndexMap.has(id)) {
      doScroll(idRenderIndexMap.get(id)!);
      return;
    }

    // ลอง match แบบ loose (ป้องกัน type mismatch string vs number)
    const looseMatch = messages.findIndex(m => asNum(m.id) === id);
    if (looseMatch >= 0) {
      // หา renderUnit index ที่ตรงกับ message นี้
      for (let ui = 0; ui < renderUnits.length; ui++) {
        const u = renderUnits[ui];
        if (u.kind === 'msg' && asNum(u.msg.id) === id) { doScroll(ui); return; }
        if (u.kind === 'grid' && u.items.some(x => asNum(x.id) === id)) { doScroll(ui); return; }
      }
    }

    // ถ้ายังไม่โหลด → โหลดเพิ่มจนกว่าจะเจอ (จำกัด 10 รอบ)
    setScrollingToId(id);
    let attempts = 0;
    const maxAttempts = 10;
    let currentMessages = [...messages];

    while (attempts < maxAttempts) {
      attempts++;
      const oldest = currentMessages[currentMessages.length - 1];
      if (!oldest) break;

      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) break;
        let url = `${getBaseUrl()}/chat/messages?room_id=${currentRoom.id}&limit=${PAGE_SIZE}`;
        url += `&before_id=${oldest.id}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        const more: ChatMessage[] = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);

        if (more.length === 0) {
          setHasMore(false);
          break;
        }

        // เพิ่มข้อความใหม่เข้า state
        const existingIds = new Set(currentMessages.map(m => asNum(m.id)).filter(Boolean));
        const deduped = more.filter(m => {
          const mid = asNum(m.id);
          return !mid || !existingIds.has(mid);
        });
        currentMessages = [...currentMessages, ...deduped];
        setMessages(currentMessages);

        if (more.length < PAGE_SIZE) setHasMore(false);

        // เช็คว่าเจอข้อความเป้าหมายยัง
        const found = currentMessages.find(m => asNum(m.id) === id);
        if (found) {
          // รอ renderUnits อัพเดท แล้ว scroll
          setTimeout(() => {
            setScrollingToId(null);
            const newUnits = toRenderUnits(currentMessages, me?.id);
            let targetIdx = -1;
            for (let ui = 0; ui < newUnits.length; ui++) {
              const u = newUnits[ui];
              if (u.kind === 'msg' && asNum(u.msg.id) === id) { targetIdx = ui; break; }
              if (u.kind === 'grid' && u.items.some(x => asNum(x.id) === id)) { targetIdx = ui; break; }
            }
            if (targetIdx >= 0) {
              doScroll(targetIdx);
            }
          }, 300);
          return;
        }
      } catch {
        break;
      }
    }

    setScrollingToId(null);
    Platform.OS === 'android'
      ? ToastAndroid.show('ไม่พบข้อความ', ToastAndroid.SHORT)
      : showAlert('ไม่พบข้อความ', 'ข้อความถูกลบหรือเก่าเกินไป');
  }, [idRenderIndexMap, currentRoom, messages, me?.id, renderUnits]);

  /* ===== Avatar & common small components ===== */
  const Avatar = ({ name }: { name: string }) => (
    <View style={[styles.avatar, { backgroundColor: '#E6FEF0', borderColor: '#4ADE80' }]}>
      <Text style={{ color: '#10B981', fontWeight: '700' }}>{getInitial(name)}</Text>
    </View>
  );

  const renderMessageRow = useCallback(({ msg, idx }: { msg: ChatMessage; idx: number }) => {
    const mine = msg.user_id === me?.id;
    const prev = messages[idx - 1];
    const next = messages[idx + 1];

    const showAvatar = !(prev && isSameSender(prev?.user_id, msg.user_id) && isSameMinute(prev.created_at, msg.created_at));
    const attachToPrev = prev && isSameSender(prev?.user_id, msg.user_id) && isSameMinute(prev.created_at, msg.created_at);
    const attachToNext = next && isSameSender(next?.user_id, msg.user_id) && isSameMinute(next.created_at, msg.created_at);
    const dayChanged = !prev || formatDay(prev.created_at) !== formatDay(msg.created_at);

    const isPdf = (msg.mime_type || '').includes('pdf') || (msg.file_name || '').toLowerCase().endsWith('.pdf');
    const isImage = msg.msg_type === 'image' && !isPdf;
    const isFile = msg.msg_type === 'file' || isPdf;
    const fileUrl = msg.file_url?.startsWith('http') ? msg.file_url : `${getBaseUrl()}${msg.file_url ?? ''}`;

    const onOpenFile = async () => {
      try {
        if (isPdf) await openPdfFromUrl(fileUrl!, msg.file_name || 'เอกสาร');
        else Linking.openURL(fileUrl!);
      } catch (e: any) {
        showAlert('เปิดไฟล์ไม่สำเร็จ', e?.message || 'ไม่สามารถเปิดไฟล์ได้');
      }
    };

    const radius = {
      borderTopLeftRadius: mine ? 16 : (attachToPrev ? 6 : 16),
      borderTopRightRadius: mine ? (attachToPrev ? 6 : 16) : 16,
      borderBottomLeftRadius: mine ? 16 : (attachToNext ? 6 : 16),
      borderBottomRightRadius: mine ? (attachToNext ? 6 : 16) : 16,
    };

    const key = String(msg.id || msg.localId || idx);
    const hasReply = !!(msg.reply_to || asNum(msg.reply_to_id));
    const repliedId = asNum(msg.reply_to?.id) || asNum(msg.reply_to_id);
    const replySnap = makeReplySnapshot(msg, messages);

    const renderTicks = (s?: MsgStatus) => {
      if (!mine) return null;
      let icon: any = 'checkmark';
      if (s === 'delivered' || s === 'read') icon = 'checkmark-done';
      const color = s === 'read' ? colors.primary : '#94A3B8';
      return <Ionicons name={icon} size={14} color={color} />;
    };

    const isHighlighted = highlightId != null && asNum(msg.id) === highlightId;

    return (
      <View>
        {dayChanged && (
          <View style={styles.dayRow}>
            <Text style={[styles.dayChip, { backgroundColor: colors.dayChip, color: colors.subtext }]}>
              {formatDay(msg.created_at)}
            </Text>
          </View>
        )}

        <View style={[
          styles.row,
          { flexDirection: mine ? 'row-reverse' : 'row' },
          isHighlighted && { backgroundColor: 'rgba(74, 222, 128, 0.2)', borderRadius: 12 },
        ]}>
          {(!mine && showAvatar) ? <Avatar name={msg.full_name || msg.username || ''} /> : <View style={styles.avatarSpace} />}

          <View style={{ maxWidth: '78%' }}>
            {!mine && showAvatar && (
              <Text
                style={[styles.nameText, { color: colors.subtext, marginLeft: 2, marginBottom: 4 }]}
                numberOfLines={1}
              >
                {msg.full_name || msg.username || ''}
              </Text>
            )}

            <View
              ref={(el) => { bubbleRefs.current[key] = el; }}
              onStartShouldSetResponder={() => false}
            >
              {isImage && msg.file_url ? (
                <TouchableOpacity
                  onPress={() => openGalleryByUri(msg.file_url!)}
                  onLongPress={() => showPopoverFor(key, msg)}
                  activeOpacity={0.9}
                >
                  {hasReply && (
                    <ReplyPill
                      reply={replySnap ?? { reply_to_id: repliedId! } as any}
                      mine={mine}
                      onPress={() => goToMessage(repliedId)}
                    />
                  )}

                  <View style={styles.imageWrapNoFrame}>
                    <Image
                      source={{ uri: fileUrl! }}
                      style={[styles.imageNoFrame, { maxHeight: SCREEN_H * 0.5 }]}
                      resizeMode="cover"
                    />
                  {msg.status === 'sending' ? (
                      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{`${Math.round((msg.upload_progress ?? 0) * 100)}%`}</Text>
                      </View>
                    ) : null}
                  </View>

                  {!!msg.text && (
                    <Text style={[styles.imageCaption, { color: colors.text }]}>{msg.text}</Text>
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity activeOpacity={0.9} onLongPress={() => showPopoverFor(key, msg)}>
                  <View
                    style={[
                      styles.messageBubble,
                      {
                        ...radius,
                        backgroundColor: mine ? '#E7F3FF' : '#F2F3F5',
                        borderColor: mine ? '#D7E8FF' : '#E5E7EB',
                      }
                    ]}
                  >
                    {hasReply && (
                      <ReplyPill
                        reply={replySnap ?? { reply_to_id: repliedId! } as any}
                        mine={mine}
                        onPress={() => goToMessage(repliedId)}
                      />
                    )}

                    {isFile && msg.file_url ? (
                      <View style={styles.bubbleWithShareWrap}>
                        <TouchableOpacity
                          onPress={() => shareFileMessage(msg)}
                          activeOpacity={0.9}
                          style={[styles.shareFabOutside, mine ? { right: -36 } : { left: -36 }]}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="share-social-outline" size={18} color="#6B7280" />
                        </TouchableOpacity>

                        <TouchableOpacity onPress={onOpenFile} activeOpacity={0.8}>
                          <View style={[styles.fileCard, { backgroundColor: '#FFFFFF', borderColor: '#E5E7EB' }]}>
                            <Ionicons
                              name={(msg.mime_type || '').includes('pdf') ? 'document-text' : 'document-attach'}
                              size={24}
                              color="#6B7280"
                            />
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 14, fontWeight: '500', color: '#1F2937' }} numberOfLines={1}>
                                {msg.file_name || msg.text || 'ไฟล์แนบ'}
                              </Text>
                              {!!msg.file_size && (
                                <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                                  {(msg.file_size / 1024).toFixed(0)} KB
                                </Text>
                              )}
                              {msg.status === 'sending' ? (
                                <View style={{ marginTop: 8 }}>
                                  <View style={{ height: 6, backgroundColor: '#E5E7EB', borderRadius: 4, overflow: 'hidden' }}>
                                    <View style={{ height: '100%', width: `${Math.round((msg.upload_progress ?? 0) * 100)}%`, backgroundColor: '#60A5FA' }} />
                                  </View>
                                  <Text style={{ marginTop: 4, fontSize: 11, color: '#6B7280' }}>{`${Math.round((msg.upload_progress ?? 0) * 100)}%`}</Text>
                                </View>
                              ) : null}
                            </View>
                          </View>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <Text style={[styles.messageText, { color: '#111827' }]}>{msg.text}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              )}
            </View>

            <View style={[styles.timeContainer, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
              <Text style={styles.timeText}>
                {new Date(msg.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
              </Text>
              {renderTicks(msg.status)}
            </View>
          </View>
        </View>
      </View>
    );
  }, [colors, me?.id, messages, showPopoverFor, goToMessage, highlightId]);

  /* ===== Render: grid block (3 คอลัมน์เมื่อ ≥3 รูป + overlay) ===== */
  const renderGridRow = useCallback((unit: Extract<RenderUnit, { kind: 'grid' }>) => {
    const mine = unit.items[0]?.user_id === me?.id;
    const first = unit.items[0];
    const prevIdx = messages.findIndex(m => (m.id || m.localId) === (first.id || first.localId));
    const prev = prevIdx > 0 ? messages[prevIdx - 1] : undefined;
    const dayChanged = !prev || formatDay(prev.created_at) !== formatDay(first.created_at);

    const hasReply = !!(first.reply_to || asNum(first.reply_to_id));
    const repliedId = asNum(first.reply_to?.id) || asNum(first.reply_to_id);
    const replySnap = makeReplySnapshot(first, messages);
    const caption = first.text || '';
    const name = first.full_name || first.username || '';

    // กริด: บังคับ 2 คอลัมน์เสมอ (สูงสุด 2 แถว)
    const CONTAINER_MAX = Math.floor((SCREEN_W - 24) * 0.78); // account for row side padding
    const GAP = 6;
    const count = unit.items.length;
    const COLS = 2;
    const MAX_ROWS = 2;
    const maxTiles = COLS * MAX_ROWS; // 4 tiles
    const overlayMode = count > maxTiles; // เริ่ม overlay ตั้งแต่รูปที่ 5
    const toShow = unit.items.slice(0, overlayMode ? maxTiles : Math.min(maxTiles, count));
    const hidden = overlayMode ? (count - maxTiles) : (count - toShow.length);
    const rows = Math.max(1, Math.ceil(toShow.length / COLS));
    const MAX_GRID_H = SCREEN_H * 0.5;
    const tileSizeByWidth = Math.floor((CONTAINER_MAX - GAP * (COLS - 1)) / COLS);
    const tileSizeByHeight = Math.floor((MAX_GRID_H - GAP * (rows - 1)) / rows);
    const GRID_SCALE = 0.6; // shrink tiles a bit
    const baseTile = Math.min(tileSizeByWidth, tileSizeByHeight);
    const tileW = Math.max(40, Math.floor(baseTile * GRID_SCALE));
    const tileH = tileW;

    const openImg = (m: ChatMessage) => { if (m.file_url) openGalleryByUri(m.file_url); };
    return (
      <View>
        {dayChanged && (
          <View style={styles.dayRow}>
            <Text style={[styles.dayChip, { backgroundColor: colors.dayChip, color: colors.subtext }]}>
              {formatDay(first.created_at)}
            </Text>
          </View>
        )}

        <View style={[styles.row, { flexDirection: mine ? 'row-reverse' : 'row' }]}>
          {(!mine) ? <Avatar name={name} /> : <View style={styles.avatarSpace} />}

          <View style={{ maxWidth: '78%' }}>
            {!mine && (
              <Text style={[styles.nameText, { color: colors.subtext, marginLeft: 2, marginBottom: 4 }]} numberOfLines={1}>
                {name}
              </Text>
            )}

            <View
              style={[
                { padding: 0 },
                { alignSelf: mine ? 'flex-end' : 'flex-start' },
                mine ? { marginRight: -34 } : null,
              ]}
            >
              {hasReply && (
                <ReplyPill
                  reply={replySnap ?? ({ reply_to_id: repliedId! } as any)}
                  mine={mine}
                  onPress={() => goToMessage(repliedId)}
                />
              )}

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', margin: -GAP / 2, width: CONTAINER_MAX }}>
                {toShow.map((m, i) => {
                  const uri = m.file_url?.startsWith('http') ? m.file_url! : `${getBaseUrl()}${m.file_url ?? ''}`;
                  const isLastAndHidden = (i === toShow.length - 1) && hidden > 0;
                  return (
                    <TouchableOpacity
                      key={`${unit.key}_${i}`}
                      onPress={() => openImg(m)}
                      style={{ padding: GAP / 2 }}
                      activeOpacity={0.9}
                    >
                      <View style={{ width: tileW, height: tileH, borderRadius: 12, overflow: 'hidden', backgroundColor: '#E5E7EB' }}>
                        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        {m.status === 'sending' ? (
                          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: '#fff', fontWeight: '800' }}>{`${Math.round((m.upload_progress ?? 0) * 100)}%`}</Text>
                          </View>
                        ) : null}
                        {isLastAndHidden && (
                          <View
                            style={{
                              ...StyleSheet.absoluteFillObject,
                              backgroundColor: 'rgba(0,0,0,0.35)',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>{`+${hidden}`}</Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {!!caption && (
                <Text style={[styles.imageCaption, { color: '#111827', marginTop: 8 }]}>{caption}</Text>
              )}
            </View>

            <View style={[
              styles.timeContainer,
              { justifyContent: mine ? 'flex-end' : 'flex-start' },
              mine ? { marginRight: -34 } : null,
            ]}>
              <Text style={styles.timeText}>
                {new Date(unit.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
              </Text>
              {mine ? <Ionicons name="checkmark-done" size={14} color={colors.primary} /> : null}
            </View>
          </View>
        </View>
      </View>
    );
  }, [colors, me?.id, messages, goToMessage]);

  // typing input
  const onChangeText = (t: string) => {
    setText(t);
    if (!currentRoom) return;
    emitTyping(true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => emitTyping(false), 1500);
  };

  const typingText = useMemo(() => {
    const names = Object.keys(typingUsers);
    if (names.length === 0) return '';
    if (names.length === 1) return `${names[0]} กำลังพิมพ์…`;
    if (names.length === 2) return `${names[0]} และ ${names[1]} กำลังพิมพ์…`;
    return 'หลายคนกำลังพิมพ์…';
  }, [typingUsers]);

  // Optimize: Memoized Message Item
  // Optimize: Memoized Message Item
  const MessageItem = React.memo(({ item, index, currentUserId }: { item: RenderUnit, index: number, currentUserId?: number }) => {
    if (item.kind === 'grid') return renderGridRow(item);
    return renderMessageRow({ msg: item.msg, idx: item.idx });
  }, (prev, next) => {
    if (prev.currentUserId !== next.currentUserId) return false; // Force update if user changes
    
    // Custom comparison if needed, or default shallow diff
    // Key props: item.msg.id, item.msg.status, item.msg.upload_progress
    if (prev.item.kind !== next.item.kind) return false;
    if (prev.item.kind === 'grid') return prev.item.key === (next.item as any).key; // simplistic check for grid
    const pMsg = (prev.item as any).msg;
    const nMsg = (next.item as any).msg;
    return (
      pMsg.id === nMsg.id &&
      pMsg.localId === nMsg.localId &&
      pMsg.status === nMsg.status &&
      pMsg.upload_progress === nMsg.upload_progress &&
      pMsg.text === nMsg.text &&
      pMsg.file_url === nMsg.file_url
    );
  });

  const renderItem = useCallback(({ item, index }: { item: RenderUnit, index: number }) => {
    return <MessageItem item={item} index={index} currentUserId={me?.id} />;
  }, [me?.id]);
  // ====== Gallery state ======
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryImages, setGalleryImages] = useState<{ uri: string }[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  // Keep stable refs to avoid re-renders causing flicker
  const galleryImagesRef = useRef<{ uri: string }[]>([]);
  const galleryIndexRef = useRef(0);
  useEffect(() => { galleryImagesRef.current = galleryImages; }, [galleryImages]);
  useEffect(() => { galleryIndexRef.current = galleryIndex; }, [galleryIndex]);

  // Caching helpers for gallery images (defined before any usage)
  const prefetchMemo = useRef(new Set<string>());
  const imgCache = useRef<Map<string, string>>(new Map()); // remote -> local file:// path
  const [cacheBump, setCacheBump] = useState(0);

  const cachePathFor = useCallback((absUri: string) => {
    const safe = absUri.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
    return `${RNFS.CachesDirectoryPath}/iv_${safe}`;
  }, []);

  const ensureCached = useCallback(async (rawUri: string) => {
    const abs = absoluteUrl(rawUri);
    if (!abs.startsWith('http')) return null;
    if (imgCache.current.has(abs)) return imgCache.current.get(abs)!;

    const dest = cachePathFor(abs);
    const exists = await RNFS.exists(dest);
    if (exists) {
      const fileUri = `file://${dest}`;
      imgCache.current.set(abs, fileUri);
      setCacheBump(b => b + 1);
      return fileUri;
    }
    if (prefetchMemo.current.has(`dl:${abs}`)) return null;
    prefetchMemo.current.add(`dl:${abs}`);
    try {
      const dl = RNFS.downloadFile({ fromUrl: abs, toFile: dest });
      const { statusCode } = await dl.promise;
      if (statusCode >= 200 && statusCode < 300) {
        const fileUri = `file://${dest}`;
        imgCache.current.set(abs, fileUri);
        setCacheBump(b => b + 1);
        return fileUri;
      }
    } catch {}
    return null;
  }, [cachePathFor]);

  const toCachedUri = useCallback((rawUri: string) => {
    const abs = absoluteUrl(rawUri);
    return imgCache.current.get(abs) || abs;
  }, []);

  // Concurrency-limited prefetch (load up to 6 images at once)
  const PREFETCH_CONCURRENCY = 6;
  const prefetchHighQueueRef = useRef<string[]>([]);
  const prefetchLowQueueRef = useRef<string[]>([]);
  const prefetchQueuedRef = useRef<Set<string>>(new Set());
  const prefetchActiveRef = useRef(0);

  const processPrefetchQueue = useCallback(() => {
    while (
      prefetchActiveRef.current < PREFETCH_CONCURRENCY &&
      (prefetchHighQueueRef.current.length > 0 || prefetchLowQueueRef.current.length > 0)
    ) {
      const uri = prefetchHighQueueRef.current.shift() ?? prefetchLowQueueRef.current.shift();
      if (!uri) break;
      prefetchQueuedRef.current.delete(uri);
      prefetchActiveRef.current += 1;
      (async () => {
        try {
          await ensureCached(uri);
          const cached = toCachedUri(uri);
          await Image.prefetch(cached);
          Image.getSize(cached, () => {}, () => {});
        } finally {
          prefetchActiveRef.current -= 1;
          setTimeout(() => processPrefetchQueue(), 0);
        }
      })();
    }
  }, [ensureCached, toCachedUri]);

  const schedulePrefetch = useCallback((input: string | Array<string | undefined | null>, priority: 'high' | 'low' = 'low') => {
    const list = Array.isArray(input) ? input : [input];
    for (const raw of list) {
      if (!raw) continue;
      const abs = absoluteUrl(raw);
      if (!abs) continue;
      // avoid queueing cached images
      if (imgCache.current.has(abs)) continue;
      // Promote to high or enqueue if not queued
      if (prefetchQueuedRef.current.has(abs)) {
        // remove from both queues and reinsert if high
        const removeFrom = (arr: string[]) => {
          const idx = arr.indexOf(abs);
          if (idx >= 0) arr.splice(idx, 1);
        };
        removeFrom(prefetchLowQueueRef.current);
        if (priority === 'high') {
          removeFrom(prefetchHighQueueRef.current);
          prefetchHighQueueRef.current.unshift(abs);
        } else {
          prefetchLowQueueRef.current.push(abs);
        }
      } else {
        prefetchQueuedRef.current.add(abs);
        if (priority === 'high') prefetchHighQueueRef.current.unshift(abs);
        else prefetchLowQueueRef.current.push(abs);
      }
    }
    processPrefetchQueue();
  }, [processPrefetchQueue]);

  // รวมรูปทั้งหมดในห้อง (ตามลำดับเวลา)
  const buildAllImages = useCallback(() => {
    return messages
      .filter(m => m.msg_type === 'image' && m.file_url)
      .map(m => ({ uri: absoluteUrl(m.file_url!) }));
  }, [messages]);

  // เปิดแกลเลอรี่โดยเริ่มที่รูปที่ถูกแตะ
  const openGalleryByUri = useCallback(async (uri: string) => {
    const all = buildAllImages();
    const abs = absoluteUrl(uri);
    const idx = Math.max(0, all.findIndex(i => i.uri === abs));
    setGalleryImages(all);
    setGalleryIndex(idx < 0 ? 0 : idx);
    setGalleryVisible(true);
    // Try load current image asap
    setGalleryLoading(true);
    try {
      await ensureCached(abs);
      await Image.prefetch(toCachedUri(abs));
    } catch {}
    setGalleryLoading(false);
    // Queue prefetch for the rest (concurrency-limited)
    schedulePrefetch(all.map(i => i.uri), 'low');
  }, [buildAllImages, ensureCached, toCachedUri, schedulePrefetch]);

  // ขอสิทธิ์เขียนรูป (Android)
  async function ensurePhotoPermission() {
    if (Platform.OS !== 'android') return true;
    // Android 13+ ใช้ READ_MEDIA_IMAGES, ต่ำกว่านั้นใช้ WRITE_EXTERNAL_STORAGE
    const sdk = Number(Platform.Version) || 33;
    const perm = sdk >= 33
      ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
      : PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE;

    const has = await PermissionsAndroid.check(perm);
    if (has) return true;

    const res = await PermissionsAndroid.request(perm);
    return res === PermissionsAndroid.RESULTS.GRANTED;
  }

  // ดาวน์โหลดรูปที่ดูอยู่ลง Photos
  const onDownloadCurrent = useCallback(async () => {
    try {
      const imgs = galleryImagesRef.current;
      const idx = galleryIndexRef.current;
      if (!imgs.length) return;
      const currentUri = imgs[idx]?.uri;
      if (!currentUri) return;

      if (Platform.OS === 'android') {
        const ok = await ensurePhotoPermission();
        if (!ok) {
          showAlert('ไม่สามารถบันทึก', 'ไม่ได้รับสิทธิ์เข้าถึงคลังรูปภาพ');
          return;
        }
      }

      const filename = `chat_${Date.now()}.jpg`;
      const tmpPath = `${RNFS.CachesDirectoryPath}/${filename}`;
      const dl = RNFS.downloadFile({ fromUrl: currentUri, toFile: tmpPath });
      const { statusCode } = await dl.promise;

      if (statusCode < 200 || statusCode >= 300) throw new Error('ดาวน์โหลดไม่สำเร็จ');

      await CameraRoll.save(tmpPath, { type: 'photo' });

      Platform.OS === 'android'
        ? ToastAndroid.show('บันทึกรูปแล้ว', ToastAndroid.SHORT)
        : showAlert('บันทึกสำเร็จ', 'รูปถูกบันทึกในแอปรูปภาพ');
    } catch (e: any) {
      Platform.OS === 'android'
        ? ToastAndroid.show('บันทึกล้มเหลว', ToastAndroid.SHORT)
        : showAlert('บันทึกล้มเหลว', e?.message || 'ลองอีกครั้ง');
    }
  }, []);

  // ดาวน์โหลดทุกภาพในแกลเลอรี่ลง Photos (สร้างอัลบั้มตามชื่อห้องถ้ามี)
  const onDownloadAll = useCallback(async () => {
    try {
      const imgs = galleryImagesRef.current;
      if (!imgs.length) return;

      if (Platform.OS === 'android') {
        const ok = await ensurePhotoPermission();
        if (!ok) {
          showAlert('ไม่สามารถบันทึก', 'ไม่ได้รับสิทธิ์เข้าถึงคลังรูปภาพ');
          return;
        }
      }

      // unique ตาม uri เพื่อไม่บันทึกซ้ำ
      const uniq = Array.from(new Set(imgs.map(i => i?.uri).filter(Boolean) as string[]));
      const album = currentRoom?.name || 'Chat';

      setBulkSaving(true);
      setBulkProgress({ done: 0, total: uniq.length });

      for (let i = 0; i < uniq.length; i++) {
        const src = uniq[i];
        try {
          if (src.startsWith('file://')) {
            await CameraRoll.save(src, { type: 'photo', album });
          } else {
            const filename = `chat_${Date.now()}_${i}.jpg`;
            const tmpPath = `${RNFS.CachesDirectoryPath}/${filename}`;
            const dl = RNFS.downloadFile({ fromUrl: src, toFile: tmpPath });
            const { statusCode } = await dl.promise;
            if (statusCode >= 200 && statusCode < 300) {
              await CameraRoll.save(tmpPath, { type: 'photo', album });
            }
          }
        } catch {}
        setBulkProgress({ done: i + 1, total: uniq.length });
        // yield UI
        await new Promise(r => setTimeout(r, 0));
      }

      Platform.OS === 'android'
        ? ToastAndroid.show('บันทึกรูปทั้งหมดแล้ว', ToastAndroid.SHORT)
        : showAlert('บันทึกสำเร็จ', 'บันทึกรูปทั้งหมดแล้ว');
    } catch (e: any) {
      Platform.OS === 'android'
        ? ToastAndroid.show('บันทึกไม่สำเร็จ', ToastAndroid.SHORT)
        : showAlert('บันทึกไม่สำเร็จ', e?.message || 'ลองอีกครั้ง');
    } finally {
      setBulkSaving(false);
    }
  }, [currentRoom?.name]);

  // Prefetch nearby images when gallery opens or index changes
  const prefetchAround = useCallback((center: number) => {
    const imgs = galleryImagesRef.current;
    if (!imgs.length) return;
    const AHEAD = 3;
    const BEHIND = 2;
    const start = Math.max(0, center - BEHIND);
    const end = Math.min(imgs.length - 1, center + AHEAD);
    const targets = [] as string[];
    for (let i = start; i <= end; i++) {
      const uri = imgs[i]?.uri;
      if (uri) targets.push(uri);
    }
    schedulePrefetch(targets, 'high');
  }, [schedulePrefetch]);

  useEffect(() => {
    if (!galleryVisible) return;
    // Delay prefetch to prevent open animation jank
    const t = setTimeout(() => {
      // Prefetch all images gradually with concurrency limit
      schedulePrefetch(galleryImagesRef.current.map(i => i.uri), 'low');
      // Also ensure nearby are prioritized
      prefetchAround(galleryIndexRef.current);
    }, 500);
    return () => clearTimeout(t);
  }, [galleryVisible, prefetchAround, schedulePrefetch]);

  const closeGallery = useCallback(() => setGalleryVisible(false), []);
  const onImageIndexChangeStable = useCallback((i: number) => {
    galleryIndexRef.current = i;
    // Don't set state immediately to avoid re-render blink if not needed
    // setGalleryIndex(i); // <-- This causes re-render of huge list potentially? Actually ImageViewing controls itself mostly.
    // However, we need galleryIndex for the Footer
    setGalleryIndex(i);
    
    prefetchAround(i);
    
    // Check if we really need to show loading
    const imgs = galleryImagesRef.current;
    const uri = imgs[i]?.uri;
    
    if (uri) {
      const abs = absoluteUrl(uri);
      // Only set loading if not in cache
      if (!imgCache.current.has(abs)) {
         setGalleryLoading(true);
      }
      
      (async () => {
        try {
          await ensureCached(uri);
          await Image.prefetch(toCachedUri(uri));
        } catch {}
        if (galleryIndexRef.current === i) {
           setGalleryLoading(false);
        }
      })();
    }
  }, [prefetchAround, ensureCached, toCachedUri]);
  // Pre-calculate images to show (stable unless galleryImages changes)
  const galleryItems = useMemo(() => {
    return galleryImages.map(({ uri }) => ({ uri: toCachedUri(uri) }));
  }, [galleryImages, toCachedUri]);

  // Use useCallback to keep component reference stable
  const GalleryHeader = useCallback(({ imageIndex }: { imageIndex: number }) => (
    <View style={{
      paddingTop: 44, paddingHorizontal: 12, paddingBottom: 8,
      backgroundColor: 'rgba(0,0,0,0.35)', flexDirection: 'row', alignItems: 'center',
      position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9999
    }}>
      <TouchableOpacity onPress={closeGallery} style={{ padding: 8 }}>
        <Ionicons name="close" size={24} color="#fff" />
      </TouchableOpacity>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
          {`${(imageIndex ?? 0) + 1} / ${galleryItems.length}`}
        </Text>
      </View>
      <View style={{ width: 40 }} />
      {galleryLoading && (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}
    </View>
  ), [closeGallery, galleryItems.length, galleryLoading]);

  const GalleryFooter = useCallback(({ imageIndex }: { imageIndex: number }) => (
    <View style={{
      paddingBottom: 28, paddingTop: 8, paddingHorizontal: 16,
      backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'flex-end',
      position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 9999
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity
          onPress={onDownloadAll}
          disabled={bulkSaving}
          style={{
            backgroundColor: '#059669', paddingHorizontal: 14, paddingVertical: 10,
            borderRadius: 20, flexDirection: 'row', alignItems: 'center', opacity: bulkSaving ? 0.7 : 1
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="cloud-download-outline" size={18} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700', marginLeft: 6 }}>
            {bulkSaving ? `บันทึกทั้งหมด (${bulkProgress.done}/${bulkProgress.total})` : 'บันทึกทั้งหมด'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onDownloadCurrent}
          style={{
            backgroundColor: '#10B981', paddingHorizontal: 14, paddingVertical: 10,
            borderRadius: 20, flexDirection: 'row', alignItems: 'center'
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="download-outline" size={18} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700', marginLeft: 6 }}>บันทึกรูปนี้</Text>
        </TouchableOpacity>
      </View>
    </View>
  ), [onDownloadAll, onDownloadCurrent, bulkSaving, bulkProgress]);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.cardBg, borderBottomColor: colors.border }]}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={styles.headBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
        ) : <View style={styles.headBtn} />}

        <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.primary} />
        <Text style={[styles.headTitle, { color: colors.text }]} numberOfLines={1}>
          {currentRoom?.name || 'แชท'}
        </Text>
        <View style={styles.headBtn} />
      </View>

      {/* pinned list */}
      {pinnedList.length > 0 && (
        <View style={[styles.pinnedBar, { borderBottomColor: colors.border, backgroundColor: colors.cardBg }]}>
          <Ionicons name="pin-outline" size={16} color={colors.primary} />
          <View style={{ flex: 1 }}>
            {pinnedList.map((p, pi) => (
              <View key={p.id || p.localId || pi} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 2 }}>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => goToMessage(p.id)} activeOpacity={0.7}>
                  <Text numberOfLines={1} style={{ fontSize: 13 }}>
                    {p.msg_type === 'text' ? p.text : (p.file_name || 'ไฟล์')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => currentRoom && unpinOne(currentRoom.id, p.id || p.localId || '')} style={{ padding: 4, marginLeft: 4 }}>
                  <Ionicons name="close" size={16} color={colors.subtext} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* typing indicator */}
      {!!typingText && (
        <View style={[styles.typingBar, { backgroundColor: '#F5F7FF', borderBottomColor: colors.border }]}>
          <Text style={{ color: colors.subtext, fontSize: 12 }}>{typingText}</Text>
        </View>
      )}

      {/* List */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        enabled={Platform.OS === 'ios'}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={flatRef}
          data={renderUnits}
          style={{ flex: 1 }}
          keyExtractor={it => it.key}
          renderItem={renderItem}
          inverted
          contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 4 }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          onScrollToIndexFailed={(info) => {
            const offset = info.index * (info.averageItemLength || 50); 
            flatRef.current?.scrollToOffset({ offset, animated: true });
            setTimeout(() => {
              flatRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
            }, 100);
          }}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 10 }} /> : null}
          ListEmptyComponent={
            msgLoading ? (
              <View style={{ paddingTop: 40 }}><ActivityIndicator size="large" color={colors.primary} /></View>
            ) : (
              <View style={styles.fullScreenEmpty}>
                <View style={[styles.emptyIcon, { backgroundColor: colors.myBubble }]}>
                  <Ionicons name="chatbubbles-outline" size={54} color={colors.primary} />
                </View>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>ยังไม่มีข้อความ</Text>
                <Text style={{ color: colors.subtext }}>ทักทายเพื่อนใหม่ของคุณเลย!</Text>
              </View>
            )
          }
          // Optimization props
          removeClippedSubviews={Platform.OS === 'android'} 
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={10}
        />

      {/* Popover */}
      <PopoverMenu
        state={popover}
        onReply={() => {
          if (!popover.target) return;
          setReplyingTo(popover.target);
          setPopover({ ...popover, visible: false });
        }}
        onPinToggle={() => {
          if (!currentRoom || !popover.target) return;
          togglePin(currentRoom.id, popover.target);
          setPopover({ ...popover, visible: false });
        }}
        onCopy={() => {
          if (!popover.target) return;
          const t = buildCopyText(popover.target);
          if (!t) {
            Platform.OS === 'android'
              ? ToastAndroid.show('ไม่มีข้อความให้คัดลอก', ToastAndroid.SHORT)
              : showAlert('ไม่มีข้อความให้คัดลอก');
          } else {
            Clipboard.setString(t);
            Platform.OS === 'android'
              ? ToastAndroid.show('คัดลอกแล้ว', ToastAndroid.SHORT)
              : showAlert('คัดลอกแล้ว');
          }
          setPopover({ ...popover, visible: false });
        }}
        onClose={() => setPopover({ ...popover, visible: false })}
      />

        {/* Reply bar */}
        {!!replyingTo && (
          <View
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              paddingHorizontal: 14, paddingVertical: 8,
              backgroundColor: '#F2F3F5',
              borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB'
            }}
          >
            <View style={{ width: 3, height: 38, backgroundColor: '#8EC8FF', borderRadius: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, color: '#374151', fontWeight: '700', marginBottom: 2 }}>
                {`ตอบกลับถึง ${replyingTo.full_name || replyingTo.username}`}
              </Text>
              <Text style={{ fontSize: 13, color: '#111827' }} numberOfLines={1}>
                {(() => {
                  const isPdf = (replyingTo.mime_type || '').includes('pdf') || (replyingTo.file_name || '').toLowerCase().endsWith('.pdf');
                  if (replyingTo.msg_type === 'text') return ellipsize(replyingTo.text);
                  if (replyingTo.msg_type === 'image' && !isPdf) return '📷 รูปภาพ';
                  return `📎 ${replyingTo.file_name || 'ไฟล์แนบ'}`;
                })()}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setReplyingTo(null)} style={{ padding: 4 }}>
              <Ionicons name="close" size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>
        )}

        {/* Bottom Section (Preview + Composer) */}
        <View style={{ backgroundColor: colors.cardBg }}>
           {/* Image Preview Bar */}
          {selectedImages.length > 0 && (
            <View style={{ 
              backgroundColor: colors.cardBg, 
              borderTopWidth: 1, 
              borderTopColor: colors.border,
              paddingVertical: 12,
              paddingLeft: 10
            }}>
               <FlatList
                data={selectedImages}
                horizontal
                keyExtractor={(item, index) => `${item.uri}_${index}`}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingRight: 20, gap: 12 }}
                renderItem={({ item, index }) => {
                  const isImage = (item.type || '').startsWith('image/') || (item.fileName || '').match(/\.(jpg|jpeg|png|gif|webp)$/i);
                  return (
                    <View style={{ width: 72, height: 72, marginRight: 2 }}>
                      {isImage ? (
                        <Image 
                          source={{ uri: item.uri }} 
                          style={{ width: '100%', height: '100%', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F3F4F6' }} 
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={{ 
                          width: '100%', height: '100%', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB',
                          alignItems: 'center', justifyContent: 'center', padding: 4
                        }}>
                          <Ionicons name="document-text-outline" size={28} color="#6B7280" />
                          <Text style={{ fontSize: 10, color: '#374151', marginTop: 2, textAlign: 'center' }} numberOfLines={1}>
                            {item.fileName || 'File'}
                          </Text>
                        </View>
                      )}
                    <TouchableOpacity 
                      style={{ 
                        position: 'absolute', top: -6, right: -6, 
                        backgroundColor: '#FFFFFF', borderRadius: 12, width: 24, height: 24,
                        alignItems: 'center', justifyContent: 'center',
                        borderWidth: 1, borderColor: '#E5E7EB',
                        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2
                      }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      onPress={() => {
                         setSelectedImages(prev => prev.filter((_, i) => i !== index));
                      }}
                    >
                      <Ionicons name="close" size={14} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                );
              }}
               />
            </View>
          )}

          {/* Composer */}
          <View style={[styles.composerWrap, { borderTopColor: colors.border, backgroundColor: colors.cardBg }]}>
            {/* Messenger Style: ถ้าพิมพ์อยู่ ให้ซ่อน Tools แล้วโชว์ลูกศร > แทน */}
            {!toolsVisible ? (
               <TouchableOpacity
                 onPress={() => {
                   // Keyboard.dismiss(); 
                   // ไม่พับคีย์บอร์ด แต่ให้เลื่อน icon ออกมา
                   LayoutAnimation.configureNext({ duration: 250, update: { type: LayoutAnimation.Types.easeInEaseOut } });
                   setToolsVisible(true);
                   // ถ้าอยากให้ typing แล้วหุบกลับ ต้องไปแก้ onChangeText เพิ่ม
                 }}
                 style={styles.iconBtn}
               >
                 <Ionicons name="chevron-forward" size={24} color={colors.primary} />
               </TouchableOpacity>
            ) : (
              <>
                {/* ปุ่มเลือกรูปหลายรูป */}
                <TouchableOpacity
                  onPress={pickImagesMulti}
                  style={styles.iconBtn}
                >
                  <Ionicons name="image-outline" size={24} color={colors.primary} />
                </TouchableOpacity>
  
                <TouchableOpacity onPress={takePhoto} style={styles.iconBtn}>
                  <Ionicons name="camera-outline" size={24} color={colors.primary} />
                </TouchableOpacity>
  
                <TouchableOpacity onPress={pickDocument} style={styles.iconBtn}>
                  <Ionicons name="document-attach-outline" size={22} color={colors.primary} />
                </TouchableOpacity>
              </>
            )}
  
            <View style={[styles.inputPill, { borderColor: colors.border }]}>
              <TextInput
                style={[styles.inputText, { color: colors.text }]}
                placeholder={currentRoom ? 'พิมพ์ข้อความ' : 'เลือกห้องก่อน'}
                placeholderTextColor={colors.subtext}
                value={text}
                editable={!!currentRoom}
                onChangeText={onChangeText}
                onSubmitEditing={sendMessage}
                returnKeyType="send"
                onFocus={() => {
                  if (Platform.OS === 'android') {
                   setKeyboardUsing(true);
                   setToolsVisible(false); // ซ่อน tools
                  }
                }}
              />
            </View>
  
            <TouchableOpacity
              onPress={sendMessage}
              disabled={(!text.trim() && selectedImages.length === 0) || !currentRoom}
              style={[styles.sendFab, { opacity: (!text.trim() && selectedImages.length === 0) || !currentRoom ? 0.5 : 1, backgroundColor: colors.primary }]}
              activeOpacity={0.9}
            >
              <Ionicons name="send" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Gallery Viewer */}
      {galleryItems.length > 0 && (
        <ImageViewing
          images={galleryItems}
          imageIndex={galleryIndex}
          visible={galleryVisible}
          onRequestClose={closeGallery}
          onImageIndexChange={onImageIndexChangeStable}
          keyExtractor={(_: any, i: number) => (galleryItems[i] ? galleryItems[i].uri : String(i))}
          animationType="fade"
          HeaderComponent={GalleryHeader}
          FooterComponent={GalleryFooter}
        />
      )}
    </View>
  );
};

export default ChatScreen;

/* =============== styles =============== */
const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E8F5F0',
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#10B981',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
  },
  headBtn: { width: 28, alignItems: 'center' },
  headTitle: { fontSize: 16, fontWeight: '800', flex: 1 },

  // Pinned & typing bars
  pinnedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E8F5F0',
    backgroundColor: '#F2FFF8',
  },
  typingBar: { paddingHorizontal: 14, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },

  // Empty
  fullScreenEmpty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyIcon: { width: 120, height: 120, borderRadius: 60, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 28, fontWeight: '800', marginBottom: 8, textAlign: 'center' },

  // Message row
  row: { paddingHorizontal: 12, paddingVertical: 2, alignItems: 'flex-end' },
  avatar: {
    width: 32, height: 32, borderRadius: 16, marginHorizontal: 6,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, elevation: 1,
  },
  avatarSpace: { width: 28, height: 28, marginHorizontal: 6 },

  // ชื่อผู้ส่ง
  nameText: { fontSize: 12, fontWeight: '700', marginBottom: 2, color: '#374151' },

  timeText: { fontSize: 10, color: '#718096' },

  imageWrapNoFrame: { overflow: 'hidden', borderRadius: 8 },
  imageNoFrame: { width: 240, minHeight: 220, maxHeight: 280, backgroundColor: '#F0F0F0' },

  messageBubble: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    maxWidth: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  messageText: { fontSize: 15, lineHeight: 21, color: '#2D3748' },

  // wrapper สำหรับไอคอนแชร์ที่อยู่นอกบับเบิล
  bubbleWithShareWrap: { position: 'relative' },
  shareFabOutside: {
    position: 'absolute',
    top: '50%',
    transform: [{ translateY: -14 }],
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E5E7EB',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },

  fileCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: 240,
  },

  // Day divider
  dayRow: { alignItems: 'center', marginTop: 10, marginBottom: 6 },
  dayChip: { fontSize: 13, fontWeight: '600', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 24 },

  // Composer
  composerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: { padding: 6 },
  inputPill: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#E8F5F0',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 2,
    backgroundColor: '#FFFFFF',
  },
  inputText: { fontSize: 16, paddingVertical: 10 },
  sendFab: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    elevation: 3,
    shadowColor: '#10B981',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  imageCaption: { fontSize: 14, lineHeight: 20, marginTop: 6, paddingHorizontal: 2 },
  timeContainer: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, marginHorizontal: 2 },
  
  // Reaction badge
  reactionBadge: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
    marginBottom: 2,
  },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactionCount: {
    fontSize: 11,
    color: '#6B7280',
    marginLeft: 3,
    fontWeight: '600',
  },
});
