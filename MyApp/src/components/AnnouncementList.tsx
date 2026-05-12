import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Modal, TouchableWithoutFeedback, ScrollView, Dimensions } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import type { Announcement } from '../types';
import { useI18n } from '../i18n';

type AnnouncementListProps = {
  data: Announcement[];
  onMore: () => void;
  darkMode?: boolean;
};

const SCREEN = Dimensions.get('window');

const toDate = (s?: string | null): Date | null => {
  if (!s) return null;
  const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m1) {
    const y = Number(m1[1]), M = Number(m1[2]), d = Number(m1[3]);
    const dt = new Date(y, M - 1, d);
    return isNaN(dt.getTime()) ? null : dt;
  }
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) {
    let d = Number(m2[1]), M = Number(m2[2]), y = Number(m2[3]);
    if (y > 2400) y -= 543;
    const dt = new Date(y, M - 1, d);
    return isNaN(dt.getTime()) ? null : dt;
  }
  return null;
};
const formatBeThai = (s?: string | null, kind: 'short' | 'long' = 'short'): string => {
  const d = toDate(s);
  if (!d) return String(s ?? '');
  const y = d.getFullYear() + 543;
  const months = kind === 'long'
    ? ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
    : ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const days = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${y}`;
};

const AnnouncementList: React.FC<AnnouncementListProps> = ({ 
  data, 
  onMore, 
  darkMode = false 
}) => {
  const { t, lang } = useI18n();
  const cardBg = darkMode ? '#2C2C2C' : '#FFFFFF';
  const textColor = darkMode ? '#FFFFFF' : '#333333';
  const dateColor = darkMode ? '#B0BEC5' : '#666666';
  const itemBg  = darkMode ? '#1F1F1F' : '#F8F9FA';
  const [openItem, setOpenItem] = useState<Announcement | null>(null);
  const [modalImageAspect, setModalImageAspect] = useState<number>(4 / 3);

  const modalImageStyle = useMemo(() => {
    const ratio = modalImageAspect > 0 ? modalImageAspect : 4 / 3;
    const maxWidth = Math.round(SCREEN.width * 0.88);
    const maxHeight = Math.round(SCREEN.height * 0.32);

    let width = maxWidth;
    if (width / ratio > maxHeight) {
      width = Math.round(maxHeight * ratio);
    }

    return { width, aspectRatio: ratio };
  }, [modalImageAspect]);

  const handleModalImageLoad = useCallback((event: any) => {
    const width = Number(event?.nativeEvent?.source?.width || 0);
    const height = Number(event?.nativeEvent?.source?.height || 0);
    if (width > 0 && height > 0) {
      setModalImageAspect(width / height);
    }
  }, []);

  useEffect(() => {
    const uri = openItem?.image;
    if (!uri) {
      setModalImageAspect(4 / 3);
      return;
    }

    let cancelled = false;

    Image.getSize(
      uri,
      (width, height) => {
        if (cancelled) return;
        if (width > 0 && height > 0) {
          setModalImageAspect(width / height);
        }
      },
      () => {
        if (!cancelled) setModalImageAspect(4 / 3);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [openItem?.image]);

  return (
    // ✅ เอา padding ขอบซ้าย-ขวาออก เพื่อให้เต็มจอจริง ๆ
    <View style={styles.container}>
      <View style={[styles.announcementCard, { backgroundColor: cardBg }]}>
        {/* Header */}
        <View style={styles.headerContainer}>
          <View style={styles.titleRow}>
            <View style={styles.iconContainer}>
              <Ionicons name="megaphone" size={16} color="#FF6B35" />
            </View>
            <Text style={[styles.announcementTitle, { color: textColor }]}>
              {t('annTitle')}
            </Text>
          </View>
          <TouchableOpacity style={styles.viewAllButton} onPress={onMore}>
            <Text style={styles.viewAllText}>{t('readMore')}</Text>
            <Ionicons name="chevron-forward" size={14} color="#4CAF50" />
          </TouchableOpacity>
        </View>

        {/* Announcements */}
        <View style={styles.itemsWrapper}>
          {data.slice(0, 5).map((item, index) => (
            <TouchableOpacity key={index} style={[styles.announcementItem, { backgroundColor: itemBg }]} onPress={() => setOpenItem(item)}>
              {item.important ? (
                <View style={styles.starCorner}>
                  <Ionicons name="star" size={14} color="#FFFFFF" />
                </View>
              ) : null}
              {/* Image */}
              <View style={styles.imageWrapper}>
                <Image 
                  source={{ uri: item.image }} 
                  style={styles.announcementImage}
                  resizeMode="cover"
                />
              </View>

              {/* Content */}
              <View style={styles.contentContainer}>
                <View style={styles.dateContainer}>
                  <Ionicons name="calendar-outline" size={14} color="#2E7D32" />
                  <Text style={[styles.announcementDate, { color: dateColor }]}>
                    {formatBeThai(item.date)}
                  </Text>
                </View>
                
                <Text style={[styles.announcementText, { color: textColor }]} numberOfLines={2}>
                  {item.title}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Footer */}
        <TouchableOpacity style={styles.showMoreButton} onPress={onMore}>
          <Text style={styles.showMoreText}>{t('readMore')}</Text>
          <Ionicons name="arrow-forward" size={14} color="#4CAF50" />
        </TouchableOpacity>
      </View>

      {/* Detail Modal */}
      <Modal visible={!!openItem} transparent animationType="fade" onRequestClose={() => setOpenItem(null)}>
        <TouchableWithoutFeedback onPress={() => setOpenItem(null)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalCard, { backgroundColor: darkMode ? '#1E1E1E' : '#FFFFFF' }]}>
                <TouchableOpacity
                  accessibilityLabel="close"
                  onPress={() => setOpenItem(null)}
                  style={[styles.modalCloseX, { backgroundColor: darkMode ? '#2A2A2A' : '#EEF2F5' }]}
                >
                  <Ionicons name="close" size={18} color={darkMode ? '#E5E7EB' : '#333'} />
                </TouchableOpacity>
                {!!openItem && (
                  <>
                    <Text style={[styles.modalTitle, { color: textColor }]}>{openItem.title || t('announcement')}</Text>
                    <ScrollView style={styles.modalScroll}>
                      {openItem.image && (
                         <Image 
                           source={{ uri: openItem.image }} 
                           style={[styles.modalImage, modalImageStyle]}
                           onLoad={handleModalImageLoad}
                           resizeMode="contain"
                         />
                      )}

                      <Text style={[styles.modalLabel, { color: dateColor }]}>{t('details')}</Text>
                      <Text style={[styles.modalDesc, { color: textColor }]}>
                        {openItem.description || '-'}
                      </Text>

                      <Text style={[styles.modalLabel, { color: dateColor, marginTop: 12 }]}>{t('annDate')}</Text>
                      <View style={styles.modalDateRow}>
                        <Ionicons name="calendar-outline" size={16} color="#2E7D32" />
                        <Text style={styles.modalDateText}>{formatBeThai(openItem.date)}</Text>
                      </View>
                    </ScrollView>
                  </>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  // Keep a tiny gutter so the card doesn't look like it spills out on Home.
  container: {
    width: '100%',
    alignSelf: 'stretch',
    paddingHorizontal: 0,
  },

  announcementCard: { 
    width: '100%',
    alignSelf: 'stretch',
    borderRadius: 16, 
    padding: 15,
    marginVertical: 8,
    marginHorizontal: 0,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    overflow: 'hidden',
  },

  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  announcementTitle: { 
    fontSize: 16, 
    fontWeight: '700',
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  viewAllText: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
    marginRight: 2,
  },

  itemsWrapper: {
    marginBottom: 10,
  },
  announcementItem: { 
    flexDirection: 'row', 
    marginBottom: 10,
    borderRadius: 12,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#4CAF50',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    position: 'relative',
  },

  imageWrapper: {
    marginRight: 12,
  },
  announcementImage: { 
    width: 50, 
    height: 50, 
    borderRadius: 10,
    backgroundColor: '#F0F0F0',
  },

  contentContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  announcementDate: { 
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 6,
    backgroundColor: 'rgba(76, 175, 80, 0.18)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeRow: { },
  badgeText: { },
  starCorner: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 32,
    height: 32,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 12,
    backgroundColor: '#FFC107',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  announcementText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },

  showMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F5E8',
    paddingVertical: 8,
    borderRadius: 12,
    elevation: 1,
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  showMoreText: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '600',
    marginRight: 4,
  },

  // ===== Modal =====
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '94%',
    maxWidth: 520,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 10 },
  modalImage: {
    borderRadius: 12,
    marginBottom: 16,
    alignSelf: 'center',
  },
  modalLabel: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  modalDesc: { fontSize: 14, lineHeight: 20 },
  modalScroll: { maxHeight: 440 },
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
  modalCloseBtn: {
    marginTop: 16,
    alignSelf: 'flex-end',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  modalCloseText: { color: '#fff', fontWeight: '800' },
  modalCloseX: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    elevation: 5,
  },
});

export default AnnouncementList;
