import React, { useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
} from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import LinearGradient from 'react-native-linear-gradient';
import { useI18n } from '../../../i18n';

type PreviewMessage = {
  id?: number;
  localId?: string;
  username?: string;
  full_name?: string;
  text?: string;
  msg_type?: 'text' | 'image' | 'file';
  file_url?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
};

type Props = {
  visible: boolean;
  isPinned: boolean;
  targetMessage?: PreviewMessage | null;
  toAbsoluteUrl?: (url?: string | null) => string;
  activeReactionEmoji?: string | null;
  onReact?: (emoji: string) => void;
  onReply: () => void;
  onCopy: () => void;
  onPinToggle: () => void;
  onShare?: () => void;
  onClose: () => void;
};

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '🙏'];

function decodeDisplayFileName(name?: string | null) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  try {
    return decodeURIComponent(raw.replace(/\+/g, '%20'));
  } catch {
    return raw;
  }
}

function hasPdfSuffix(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  const decoded = decodeDisplayFileName(raw).toLowerCase();
  return /\.pdf(?:$|[?#])/i.test(decoded);
}

function hasWordSuffix(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  const decoded = decodeDisplayFileName(raw).toLowerCase();
  return /\.docx?(?:$|[?#])/i.test(decoded);
}

function hasExcelSuffix(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  const decoded = decodeDisplayFileName(raw).toLowerCase();
  return /\.xlsx?(?:$|[?#])/i.test(decoded);
}

function hasVideoSuffix(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  const decoded = decodeDisplayFileName(raw).toLowerCase();
  return /\.(mp4|m4v|mov|avi|wmv|webm|mkv|3gp)(?:$|[?#])/i.test(decoded);
}

type FileKind = 'pdf' | 'word' | 'excel' | 'video' | 'file';

function getFileKind(input: {
  mimeType?: string | null;
  fileName?: string | null;
  fileUrl?: string | null;
  text?: string | null;
}): FileKind {
  const mime = String(input.mimeType || '').toLowerCase();
  if (mime.startsWith('video/') || hasVideoSuffix(input.fileName) || hasVideoSuffix(input.fileUrl) || hasVideoSuffix(input.text)) {
    return 'video';
  }
  if (mime.includes('pdf') || hasPdfSuffix(input.fileName) || hasPdfSuffix(input.fileUrl) || hasPdfSuffix(input.text)) {
    return 'pdf';
  }
  if (mime.includes('msword') || mime.includes('wordprocessingml') || hasWordSuffix(input.fileName) || hasWordSuffix(input.fileUrl) || hasWordSuffix(input.text)) {
    return 'word';
  }
  if (mime.includes('ms-excel') || mime.includes('spreadsheetml') || mime.includes('csv') || hasExcelSuffix(input.fileName) || hasExcelSuffix(input.fileUrl) || hasExcelSuffix(input.text)) {
    return 'excel';
  }
  return 'file';
}

const MessageActionsModal: React.FC<Props> = ({
  visible,
  isPinned,
  targetMessage,
  toAbsoluteUrl,
  activeReactionEmoji,
  onReact,
  onReply,
  onCopy,
  onPinToggle,
  onShare,
  onClose,
}) => {
  const { t } = useI18n();
  const [imageMeta, setImageMeta] = useState<{ width: number; height: number } | null>(null);
  const sender = targetMessage?.full_name || targetMessage?.username || t('chatSelectedMessage');
  const isImage = targetMessage?.msg_type === 'image' && !!targetMessage?.file_url;
  const isFile = targetMessage?.msg_type === 'file';
  const fileKind = isFile
    ? getFileKind({
      mimeType: targetMessage?.mime_type,
      fileName: targetMessage?.file_name,
      fileUrl: targetMessage?.file_url,
      text: targetMessage?.text,
    })
    : 'file';
  const isPdfFile = fileKind === 'pdf';
  const fileTypeLabel = fileKind === 'video' ? 'VIDEO' : (fileKind === 'pdf' ? 'PDF' : (fileKind === 'word' ? 'DOC' : (fileKind === 'excel' ? 'XLS' : 'FILE')));
  const fileIconName = fileKind === 'video'
    ? 'videocam-outline'
    : fileKind === 'excel'
    ? 'grid-outline'
    : (fileKind === 'word' ? 'document-text-outline' : (isPdfFile ? 'document-text' : 'document-outline'));
  const fileIconSize = isPdfFile ? 22 : (fileKind === 'video' ? 20 : 18);
  const fileIconColor = fileKind === 'video'
    ? '#BBD9F2'
    : fileKind === 'excel'
    ? '#8FC3EB'
    : (fileKind === 'word' ? '#CBB8F3' : (isPdfFile ? '#7FBF9E' : '#DDE3EE'));
  const rawText = String(targetMessage?.text || '').trim();
  const previewImageUrl = isImage
    ? (toAbsoluteUrl ? toAbsoluteUrl(targetMessage?.file_url) : String(targetMessage?.file_url || ''))
    : '';

  const imageSize = useMemo(() => {
    const MAX_W = 266;
    const MAX_H = 170;
    const FALLBACK = { width: MAX_W, height: 136 };
    if (!imageMeta?.width || !imageMeta?.height) return FALLBACK;

    const scale = Math.min(MAX_W / imageMeta.width, MAX_H / imageMeta.height);
    return {
      width: Math.max(80, Math.round(imageMeta.width * scale)),
      height: Math.max(80, Math.round(imageMeta.height * scale)),
    };
  }, [imageMeta]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <LinearGradient
          colors={['rgba(5, 8, 15, 0.72)', 'rgba(7, 12, 22, 0.62)', 'rgba(8, 14, 24, 0.72)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.backdropTint}
        />
        <View style={styles.backdropFog} />
      </Pressable>

      <View pointerEvents="box-none" style={styles.centerWrap}>
        {!!targetMessage && (
          <View style={styles.previewWrap}>
            <Text style={styles.previewSender} numberOfLines={1}>{sender}</Text>

            {isImage ? (
              <View>
                <View style={styles.previewImageWrap}>
                  <Image
                    source={{ uri: previewImageUrl }}
                    style={[styles.previewImage, imageSize]}
                    resizeMode="contain"
                    onLoad={(e) => {
                      const src = e?.nativeEvent?.source;
                      if (src?.width && src?.height) {
                        setImageMeta({ width: src.width, height: src.height });
                      }
                    }}
                  />
                </View>
                <Text style={styles.previewText} numberOfLines={2}>{rawText || t('chatImageLabel')}</Text>
              </View>
            ) : isFile ? (
              <View style={styles.previewFileRow}>
                <View
                  style={[
                    styles.previewFileIconBadge,
                    isPdfFile ? styles.previewPdfIconBadge : null,
                    fileKind === 'word' ? styles.previewWordIconBadge : null,
                    fileKind === 'excel' ? styles.previewExcelIconBadge : null,
                    fileKind === 'video' ? styles.previewVideoIconBadge : null,
                  ]}
                >
                  <Ionicons
                    name={fileIconName}
                    size={fileIconSize}
                    color={fileIconColor}
                  />
                </View>
                <View style={styles.previewFileTextCol}>
                  <Text style={styles.previewFileName} numberOfLines={2}>
                    {decodeDisplayFileName(targetMessage?.file_name) || decodeDisplayFileName(rawText) || t('chatAttachment')}
                  </Text>
                  <Text style={styles.previewFileMeta}>{fileTypeLabel}</Text>
                </View>
              </View>
            ) : (
              <Text style={styles.previewText} numberOfLines={4}>{rawText || t('chatNoMessage')}</Text>
            )}
          </View>
        )}

        <LinearGradient
          colors={['rgba(48, 54, 66, 0.97)', 'rgba(40, 45, 56, 0.98)', 'rgba(35, 39, 50, 0.98)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.menuContainer}
        >
          {onReact ? (
            <View style={styles.reactionRow}>
              {QUICK_REACTIONS.map((emoji) => {
                const active = activeReactionEmoji === emoji;
                return (
                  <Pressable
                    key={emoji}
                    style={({ pressed }) => [
                      styles.reactionBtn,
                      active ? styles.reactionBtnActive : null,
                      pressed ? styles.reactionBtnPressed : null,
                    ]}
                    onPress={() => onReact(emoji)}
                  >
                    <Text style={styles.reactionText}>{emoji}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <Pressable style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]} onPress={onReply}>
            <Text style={styles.menuLabel}>{t('chatReply')}</Text>
            <Ionicons name="arrow-undo-outline" size={20} color="#FFFFFF" style={styles.menuIcon} />
          </Pressable>

          <Pressable style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]} onPress={onCopy}>
            <Text style={styles.menuLabel}>{t('chatCopy')}</Text>
            <Ionicons name="copy-outline" size={20} color="#FFFFFF" style={styles.menuIcon} />
          </Pressable>

          {isFile && onShare ? (
            <Pressable style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]} onPress={onShare}>
              <Text style={styles.menuLabel}>{t('chatShare')}</Text>
              <Ionicons name="share-social-outline" size={20} color="#FFFFFF" style={styles.menuIcon} />
            </Pressable>
          ) : null}

          <Pressable
            style={({ pressed }) => [styles.menuItem, styles.menuItemLast, pressed && styles.menuItemPressed]}
            onPress={onPinToggle}
          >
            <Text style={styles.menuLabel}>{isPinned ? t('chatUnpin') : t('chatPin')}</Text>
            <Ionicons name={isPinned ? 'pin' : 'pin-outline'} size={20} color="#FFFFFF" style={styles.menuIcon} />
          </Pressable>
        </LinearGradient>
      </View>
    </Modal>
  );
};

export default React.memo(MessageActionsModal);

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6, 10, 18, 0.55)',
  },
  backdropTint: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropFog: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(187, 201, 224, 0.09)',
  },
  centerWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  previewWrap: {
    width: '80%',
    maxWidth: 290,
    backgroundColor: 'rgba(47, 54, 68, 0.96)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    marginBottom: 10,
  },
  previewSender: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  previewImageWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  previewImage: {
    borderRadius: 0,
    backgroundColor: 'transparent',
  },
  previewFileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  previewFileIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  previewPdfIconBadge: {
    backgroundColor: 'rgba(127, 191, 158, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(127, 191, 158, 0.2)',
  },
  previewWordIconBadge: {
    backgroundColor: 'rgba(175, 151, 231, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(175, 151, 231, 0.22)',
  },
  previewExcelIconBadge: {
    backgroundColor: 'rgba(127, 182, 221, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(127, 182, 221, 0.22)',
  },
  previewVideoIconBadge: {
    backgroundColor: 'rgba(116, 163, 204, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(116, 163, 204, 0.26)',
  },
  previewFileTextCol: {
    flex: 1,
    minWidth: 0,
  },
  previewFileName: {
    color: '#F3F4F6',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  previewFileMeta: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    letterSpacing: 0.3,
  },
  previewText: {
    color: '#F3F4F6',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 7,
  },
  menuContainer: {
    width: '80%',
    maxWidth: 290,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  reactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  reactionBtn: {
    width: 42,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  reactionBtnActive: {
    backgroundColor: 'rgba(145, 209, 174, 0.2)',
    borderColor: 'rgba(145, 209, 174, 0.45)',
  },
  reactionBtnPressed: {
    transform: [{ scale: 0.97 }],
  },
  reactionText: {
    fontSize: 21,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  menuItemPressed: {
    backgroundColor: 'rgba(255,255,255,0.08)',
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
