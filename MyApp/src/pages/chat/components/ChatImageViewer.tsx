/* eslint-disable react-native/no-inline-styles */
import React, { useCallback } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useI18n } from '../../../i18n';
import { runWithoutResponsivePatch } from '../../../lib/enableResponsiveStyleSheet';

let cachedImageViewing: any = null;

function getImageViewing(): any {
  if (cachedImageViewing) return cachedImageViewing;

  cachedImageViewing = runWithoutResponsivePatch(() => {
    const mod = require('react-native-image-viewing');
    return mod?.default ?? mod;
  });

  return cachedImageViewing;
}

type BulkProgress = {
  done: number;
  total: number;
};

type Props = {
  visible: boolean;
  images: { uri: string }[];
  initialIndex: number;
  onRequestClose: () => void;
  onImageIndexChange: (index: number) => void;
  onDownloadAll: () => void;
  onDownloadCurrent: () => void;
  bulkSaving: boolean;
  bulkProgress: BulkProgress;
};

function ChatImageViewerImpl({
  visible,
  images,
  initialIndex,
  onRequestClose,
  onImageIndexChange,
  onDownloadAll,
  onDownloadCurrent,
  bulkSaving,
  bulkProgress,
}: Props) {
  const { t } = useI18n();
  const ImageViewing = getImageViewing();

  const HeaderComponent = useCallback(({ imageIndex }: { imageIndex: number }) => (
    <View
      style={{
        paddingTop: 44,
        paddingHorizontal: 12,
        paddingBottom: 8,
        backgroundColor: 'rgba(0,0,0,0.35)',
        flexDirection: 'row',
        alignItems: 'center',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
      }}
    >
      <TouchableOpacity onPress={onRequestClose} style={{ padding: 8 }}>
        <Ionicons name="close" size={24} color="#fff" />
      </TouchableOpacity>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
          {`${(imageIndex ?? 0) + 1} / ${images.length}`}
        </Text>
      </View>
      <View style={{ width: 40 }} />
    </View>
  ), [onRequestClose, images.length]);

  const FooterComponent = useCallback(({ imageIndex: _imageIndex }: { imageIndex: number }) => (
    <View
      style={{
        paddingBottom: 28,
        paddingTop: 8,
        paddingHorizontal: 16,
        backgroundColor: 'rgba(0,0,0,0.35)',
        alignItems: 'flex-end',
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity
          onPress={onDownloadAll}
          disabled={bulkSaving}
          style={{
            backgroundColor: '#059669',
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 20,
            flexDirection: 'row',
            alignItems: 'center',
            opacity: bulkSaving ? 0.7 : 1,
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="cloud-download-outline" size={18} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700', marginLeft: 6 }}>
            {bulkSaving
              ? t('chatSaveAllProgress', { done: bulkProgress.done, total: bulkProgress.total })
              : t('chatSaveAll')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onDownloadCurrent}
          style={{
            backgroundColor: '#10B981',
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 20,
            flexDirection: 'row',
            alignItems: 'center',
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="download-outline" size={18} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700', marginLeft: 6 }}>{t('chatSaveThisImage')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  ), [onDownloadAll, onDownloadCurrent, bulkSaving, bulkProgress.done, bulkProgress.total, t]);

  if (!images.length) return null;

  return (
    <ImageViewing
      images={images}
      imageIndex={initialIndex}
      visible={visible}
      onRequestClose={onRequestClose}
      onImageIndexChange={onImageIndexChange}
      keyExtractor={(_: any, i: number) => (images[i] ? images[i].uri : String(i))}
      animationType="fade"
      HeaderComponent={HeaderComponent}
      FooterComponent={FooterComponent}
    />
  );
}

const ChatImageViewer = React.memo(ChatImageViewerImpl);

export default ChatImageViewer;
