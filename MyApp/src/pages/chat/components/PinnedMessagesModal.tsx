import React, { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableWithoutFeedback,
  Pressable,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useI18n } from '../../../i18n';

type PinnedMessageItem = {
  id: number;
  localId?: string;
  user_id: number;
  username: string;
  full_name?: string;
  role?: 'admin' | 'superadmin' | 'user';
  text: string;
  msg_type?: 'text' | 'image' | 'file';
  file_url?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  created_at: string;
  pinned_at?: string | null;
};

type Props = {
  visible: boolean;
  messages: PinnedMessageItem[];
  onClose: () => void;
  onOpenMessage: (msg: PinnedMessageItem) => void;
  onUnpin: (msg: PinnedMessageItem) => void;
  toAbsoluteUrl: (url?: string | null) => string;
};

const getInitial = (name?: string) => {
  if (!name) return '?';
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed[0].toUpperCase();
};

const isAdminRole = (role?: string | null) => {
  const normalized = String(role || '').toLowerCase();
  return normalized === 'admin' || normalized === 'superadmin';
};

const formatSenderName = (input: {
  role?: string | null;
  fullName?: string | null;
  username?: string | null;
  fallback?: string;
}) => {
  const baseName = String(input.fullName || input.username || input.fallback || '').trim();
  if (!isAdminRole(input.role)) return baseName;
  const normalizedName = baseName
    .replace(/^\[(admin|นิติบุคคล|กรรมการบริหาร)\]\s*/i, '')
    .replace(/^admin\b[:\-\s]*/i, '')
    .trim();
  const role = String(input.role || '').toLowerCase();
  const prefix = role === 'superadmin' ? '[กรรมการบริหาร]' : '[นิติบุคคล]';
  if (!normalizedName) return prefix;
  return `${prefix} ${normalizedName}`;
};

const formatPinnedDate = (iso?: string) => {
  if (!iso) return '-';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleDateString('th-TH', {
    day: '2-digit',
    month: 'short',
  });
};

const decodeDisplayFileName = (name?: string | null) => {
  const raw = String(name || '').trim();
  if (!raw) return '';
  try {
    return decodeURIComponent(raw.replace(/\+/g, '%20'));
  } catch {
    return raw;
  }
};

const ellipsizeMiddle = (s: string, max = 40) => {
  const text = String(s || '').trim();
  if (!text || text.length <= max) return text;

  const extMatch = text.match(/(\.[a-z0-9]{1,8})$/i);
  const ext = extMatch ? extMatch[1] : '';
  const tailKeep = Math.max(8, Math.min(16, ext ? ext.length + 8 : 12));
  const headKeep = Math.max(10, max - tailKeep - 1);

  return `${text.slice(0, headKeep)}…${text.slice(-tailKeep)}`;
};

const formatPinnedFileLabel = (name: string, t: (key: string, params?: Record<string, string | number>) => string) => {
  return `${t('chatFile')}: ${ellipsizeMiddle(name, 38)}`;
};

const toPinnedSortTime = (msg: Pick<PinnedMessageItem, 'pinned_at' | 'created_at' | 'id'>) => {
  const pinnedTs = Date.parse(String(msg.pinned_at || ''));
  if (Number.isFinite(pinnedTs)) return pinnedTs;

  const createdTs = Date.parse(String(msg.created_at || ''));
  if (Number.isFinite(createdTs)) return createdTs;

  return Number(msg.id || 0) || 0;
};

const extractFirstUrl = (text?: string) => {
  const s = String(text || '');
  const m = s.match(/https?:\/\/[^\s]+/i);
  return m ? m[0] : '';
};

const extractHost = (rawUrl: string) => {
  if (!rawUrl) return '';
  try {
    const u = new URL(rawUrl);
    return u.host.replace(/^www\./i, '');
  } catch {
    return '';
  }
};

const PinnedMessagesModalImpl: React.FC<Props> = ({
  visible,
  messages,
  onClose,
  onOpenMessage,
  onUnpin,
  toAbsoluteUrl,
}) => {
  const { t } = useI18n();
  const [imageMeta, setImageMeta] = useState<Record<string, { width: number; height: number }>>({});

  const saveImageMeta = useCallback((uri: string, width?: number, height?: number) => {
    if (!uri || !width || !height || width <= 0 || height <= 0) return;
    setImageMeta(prev => {
      const old = prev[uri];
      if (old && old.width === width && old.height === height) return prev;
      return { ...prev, [uri]: { width, height } };
    });
  }, []);

  const getPreviewSize = useCallback((uri: string) => {
    const MAX_W = 280;
    const MAX_H = 210;
    const MIN_W = 120;
    const MIN_H = 90;
    const meta = imageMeta[uri];

    if (!meta) {
      return { width: 210, height: 160 };
    }

    const scale = Math.min(MAX_W / meta.width, MAX_H / meta.height, 1);
    const width = Math.max(MIN_W, Math.round(meta.width * scale));
    const height = Math.max(MIN_H, Math.round(meta.height * scale));
    return { width, height };
  }, [imageMeta]);

  const sorted = useMemo(() => {
    const copy = [...messages];
    copy.sort((a, b) => {
      const delta = toPinnedSortTime(b) - toPinnedSortTime(a);
      if (delta !== 0) return delta;
      return Number(b.id || 0) - Number(a.id || 0);
    });
    return copy;
  }, [messages]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <View style={styles.grabberWrap}>
                <View style={styles.grabber} />
              </View>

              <View style={styles.headerRow}>
                <Text style={styles.title}>{t('chatPinnedMessages')}</Text>
              </View>

              <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
                {sorted.length === 0 ? (
                  <Text style={styles.emptyText}>{t('chatNoPinnedMessages')}</Text>
                ) : (
                  sorted.map((msg, index) => {
                    const sender = formatSenderName({
                      role: msg.role,
                      fullName: msg.full_name,
                      username: msg.username,
                      fallback: t('chatUnknownUser'),
                    });
                    const isImage = msg.msg_type === 'image' && !!msg.file_url;
                    const isFile = !isImage && (msg.msg_type === 'file' || String(msg.file_name || '').trim().length > 0);
                    const absUrl = isImage ? toAbsoluteUrl(msg.file_url) : '';
                    const previewSize = isImage ? getPreviewSize(absUrl) : null;
                    const firstUrl = !isImage && !isFile ? extractFirstUrl(msg.text) : '';
                    const host = extractHost(firstUrl);
                    const displayFileName = decodeDisplayFileName(msg.file_name)
                      || decodeDisplayFileName(msg.text)
                      || t('chatAttachment');

                    return (
                      <Pressable
                        key={`${msg.id || msg.localId || index}`}
                        onPress={() => onOpenMessage(msg)}
                        onLongPress={() => onUnpin(msg)}
                        delayLongPress={500}
                        style={({ pressed }) => [
                          styles.itemWrap,
                          pressed && styles.itemWrapPressed,
                        ]}
                      >
                        <View style={styles.avatar}>
                          <Text style={styles.avatarText}>{getInitial(sender)}</Text>
                        </View>

                        <View style={styles.itemBody}>
                          <View style={styles.itemHeader}>
                            <Text style={styles.senderName} numberOfLines={1}>{sender}</Text>
                            <Text style={styles.dateText}>{formatPinnedDate(msg.created_at)}</Text>
                          </View>

                          <View style={styles.contentWrap}>
                            <View style={[
                              styles.contentBubble,
                              isImage ? styles.contentBubbleImage : styles.contentBubbleText,
                            ]}>
                            {isImage ? (
                              <View>
                                <View style={[styles.previewFrame, previewSize || undefined]}>
                                  <Image
                                    source={{ uri: absUrl }}
                                    style={styles.previewImage}
                                    resizeMode="contain"
                                    onLoad={(e) => {
                                      const src = e?.nativeEvent?.source;
                                      saveImageMeta(absUrl, src?.width, src?.height);
                                    }}
                                  />
                                </View>
                                <Text style={styles.captionText} numberOfLines={2}>
                                  {String(msg.text || '').trim() || t('chatImageLabel')}
                                </Text>
                              </View>
                            ) : isFile ? (
                              <View style={styles.fileRow}>
                                <Ionicons name="document-outline" size={16} color="#9CA3AF" />
                                <Text style={styles.messageText} numberOfLines={1} ellipsizeMode="middle">
                                  {formatPinnedFileLabel(displayFileName, t)}
                                </Text>
                              </View>
                            ) : firstUrl ? (
                              <View>
                                <Text style={styles.messageText} numberOfLines={2}>
                                  {msg.text || '-'}
                                </Text>
                                {!!host && <Text style={styles.hostText}>{host}</Text>}
                              </View>
                            ) : (
                              <Text style={styles.messageText} numberOfLines={3}>
                                {msg.text || '-'}
                              </Text>
                            )}
                            </View>
                          </View>
                        </View>

                        <Ionicons name="chevron-forward" size={18} color="#A7AFBF" />
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>

              <Text style={styles.hintText}>{t('chatLongPressToUnpin')}</Text>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const PinnedMessagesModal = React.memo(PinnedMessagesModalImpl);

export default PinnedMessagesModal;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.44)',
    justifyContent: 'flex-end',
  },
  card: {
    width: '100%',
    height: '88%',
    backgroundColor: '#21242B',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderColor: '#2E333D',
    overflow: 'hidden',
  },
  grabberWrap: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 6,
  },
  grabber: {
    width: 52,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#8A909C',
    opacity: 0.65,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 2,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333844',
  },
  title: {
    color: '#E6E8EE',
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24,
  },
  list: {
    width: '100%',
  },
  listContent: {
    paddingTop: 4,
    paddingBottom: 14,
    paddingHorizontal: 8,
  },
  emptyText: {
    color: '#AAB1BF',
    fontSize: 15,
    textAlign: 'center',
    paddingVertical: 26,
  },
  itemWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginHorizontal: 4,
    marginVertical: 4,
    borderRadius: 16,
    backgroundColor: '#262C37',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0)',
  },
  itemWrapPressed: {
    backgroundColor: '#303848',
    transform: [{ scale: 0.992 }],
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#4A5160',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginBottom: 4,
  },
  avatarText: {
    color: '#E8ECF3',
    fontSize: 14,
    fontWeight: '700',
  },
  itemBody: {
    flex: 1,
    minWidth: 0,
  },
  contentWrap: {
    alignItems: 'flex-start',
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  senderName: {
    color: '#DDE3EE',
    fontSize: 12,
    fontWeight: '700',
    maxWidth: '68%',
  },
  dateText: {
    color: '#BDC4D1',
    fontSize: 12,
    fontWeight: '700',
  },
  contentBubble: {
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  contentBubbleText: {
    backgroundColor: '#333841',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#3F4551',
    maxWidth: '82%',
    minWidth: 0,
  },
  contentBubbleImage: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderWidth: 0,
    maxWidth: '100%',
  },
  messageText: {
    color: '#E7EBF2',
    fontSize: 14,
    lineHeight: 20,
  },
  hostText: {
    marginTop: 5,
    color: '#AEB7C7',
    fontSize: 13,
    fontWeight: '500',
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  previewFrame: {
    width: 210,
    height: 160,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  previewImage: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  captionText: {
    marginTop: 8,
    color: '#E7EBF2',
    fontSize: 14,
    lineHeight: 20,
  },
  hintText: {
    color: '#96A0B2',
    fontSize: 12,
    textAlign: 'center',
    paddingTop: 10,
    paddingBottom: 14,
  },
});
