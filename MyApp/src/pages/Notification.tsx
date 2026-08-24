import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Image, StyleSheet, ActivityIndicator, FlatList, TouchableOpacity, Modal, TouchableWithoutFeedback, ScrollView } from 'react-native';
import { widthPercentageToDP as wp, heightPercentageToDP as hp } from 'react-native-responsive-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import type { Announcement } from '../types';
import { BASE_HOST } from './config';
import { useI18n } from '../i18n';

type NotificationProps = { darkMode: boolean };
export function getBaseUrl() {
  return BASE_HOST;
}

const toDate = (s?: string | null): Date | null => {
  if (!s) return null;
  const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m1) { const y=+m1[1], M=+m1[2], d=+m1[3]; const dt = new Date(y, M-1, d); return isNaN(dt.getTime())?null:dt; }
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) { let d=+m2[1], M=+m2[2], y=+m2[3]; if (y>2400) y-=543; const dt=new Date(y,M-1,d); return isNaN(dt.getTime())?null:dt; }
  return null;
};
const formatBeThai = (s?: string | null, kind: 'short' | 'long' = 'short'): string => {
  const d = toDate(s);
  if (!d) return String(s ?? '');
  const y = d.getFullYear() + 543;
  const months = kind === 'long'
    ? ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
    : ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const days = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${y}`;
};
const toAbsoluteUrl = (u?: string): string => {
  const base = getBaseUrl();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  return u.startsWith('/') ? `${base}${u}` : `${base}/${u}`;
};

const ItemSeparator = () => <View style={styles.separator} />;

const Notification: React.FC<NotificationProps> = ({ darkMode }) => {
  const { t } = useI18n();
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [openItem, setOpenItem] = useState<Announcement | null>(null);
  const [modalImageAspect, setModalImageAspect] = useState<number>(4 / 3);
  const [overdueNotified, setOverdueNotified] = useState(false);
  const [showOverdueModal, setShowOverdueModal] = useState(false);
  const [overdueItems, setOverdueItems] = useState<Announcement[]>([]);

  const modalImageStyle = useMemo(() => {
    const ratio = modalImageAspect > 0 ? modalImageAspect : 4 / 3;
    const maxWidth = Math.round(wp('88%'));
    const maxHeight = Math.round(hp('32%'));

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

  const colors = useMemo(() => ({
    bg: darkMode ? '#121212' : '#FFFFFF',
    text: darkMode ? '#FFFFFF' : '#2F2F2F',
    subtext: darkMode ? '#CCCCCC' : '#7A7A7A',
    line: darkMode ? '#333333' : '#EEF2F5',
    green: '#47B263',
    greenSoft: darkMode ? '#1B4F35' : '#E9F7EE',
    orange: '#FFA21A',
  }), [darkMode]);

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${getBaseUrl()}/announcements`);
      const json = await res.json();
      const data = Array.isArray(json?.data) ? json.data : [];
      const mapped: Announcement[] = data.map((a: any) => ({
        date: String(a.date ?? ''),
        title: String(a.title ?? ''),
        image: toAbsoluteUrl(String(a.image ?? '')),
        important: !!a.important,
        description: a.description != null ? String(a.description) : undefined,
      }));

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const toDiff = (s?: string) => {
        const d = toDate(s || '');
        if (!d || isNaN(d.getTime())) return Number.POSITIVE_INFINITY;
        const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        return dd - today.getTime();
      };
      mapped.sort((a, b) => {
        const da = toDiff(a.date);
        const db = toDiff(b.date);
        const aPast = da < 0, bPast = db < 0;
        if (aPast !== bPast) return aPast ? 1 : -1;
        return da - db;
      });

      setItems(mapped);

      if (!overdueNotified) {
        const overdue = mapped.filter(it => {
          const d = toDate(it.date);
          if (!d) return false;
          const td = new Date(); td.setHours(0,0,0,0);
          const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
          return dd.getTime() < td.getTime();
        });
        if (overdue.length > 0) {
          try {
            const token = await AsyncStorage.getItem('token');
            if (token) {
              const meRes = await fetch(`${getBaseUrl()}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
              const me = await meRes.json();
              if (me?.role === 'admin' || me?.role === 'superadmin') {
                setOverdueItems(overdue);
                setShowOverdueModal(true);
                setOverdueNotified(true);
              }
            }
          } catch {}
        }
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [overdueNotified]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

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

  const renderItem = ({ item }: { item: Announcement }) => (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => setOpenItem(item)}
      style={[styles.card, { backgroundColor: colors.bg, borderColor: colors.line }]}
    >
      {item.important && (
        <View style={styles.starOverlay}>
          <Ionicons name="star" size={14} color="#FFFFFF" />
        </View>
      )}

      {item.image ? (
        <View style={styles.imageContainer}>
          <Image source={{ uri: item.image }} style={styles.cardImage} resizeMode="cover" />
        </View>
      ) : (
        <View style={[styles.cardImage, darkMode ? styles.cardImageDark : styles.cardImageLight]}>
          <Ionicons name="image-outline" size={24} color={colors.subtext} />
        </View>
      )}

      <View style={styles.cardContent}>
        <View style={styles.cardHeaderRow}>
          <Text numberOfLines={2} style={[styles.cardTitle, { color: colors.text }]}>
            {item.title}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <View style={[styles.dateBadge, { backgroundColor: colors.greenSoft }]}>
            <Ionicons name="calendar-clear" size={12} color={darkMode ? '#81C784' : '#2E7D32'} />
            <Text style={[styles.dateBadgeText, darkMode ? styles.dateBadgeTextDark : styles.dateBadgeTextLight]}>{formatBeThai(item.date)}</Text>
          </View>
          
          {(() => {
            const d = toDate(item.date);
            if (!d) return null;
            const td = new Date(); td.setHours(0,0,0,0);
            const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            if (dd.getTime() < td.getTime()) {
              return (
                <View style={styles.overdueBadge}>
                  <Ionicons name="alert-circle" size={12} color="#D32F2F" />
                  <Text style={styles.overdueBadgeText}>{t('notifOverdue')}</Text>
                </View>
              );
            }
            return null;
          })()}
        </View>

        {!!item.description && (
          <Text numberOfLines={2} style={[styles.descText, styles.mt6, { color: colors.subtext }]}>
            {item.description}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.green} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <FlatList
        data={items}
        keyExtractor={(_, idx) => String(idx)}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={ItemSeparator}
        ListHeaderComponent={
          <View style={styles.header}> 
            <Text style={[styles.headerTitle, { color: colors.text }]}>{t('notifAllAnnouncements')}</Text>
            <Text style={[styles.headerSubtitle, { color: colors.subtext }]}>{t('notifLatest')}</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="megaphone-outline" size={56} color={colors.subtext} />
            <Text style={[styles.emptyText, { color: colors.subtext }]}>{t('notifNoAnnouncement')}</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      {}
      <Modal visible={!!openItem} transparent animationType="fade" onRequestClose={() => setOpenItem(null)}>
        <TouchableWithoutFeedback onPress={() => setOpenItem(null)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalCard, { backgroundColor: colors.bg, borderColor: colors.line }] }>
                <TouchableOpacity
                  accessibilityLabel="close"
                  onPress={() => setOpenItem(null)}
                  style={[styles.modalCloseX, darkMode ? styles.modalCloseXDark : styles.modalCloseXLight]}
                >
                  <Ionicons name="close" size={18} color={darkMode ? '#E5E7EB' : '#333'} />
                </TouchableOpacity>
                {!!openItem && (
                  <>
                    <Text style={[styles.modalTitle, { color: colors.text }]}>{openItem.title || t('notifAnnouncement')}</Text>
                    <ScrollView style={styles.modalScroll}>
                      {openItem.image && (
                         <Image 
                           source={{ uri: openItem.image }} 
                           style={[styles.modalImage, modalImageStyle]}
                           onLoad={handleModalImageLoad}
                           resizeMode="contain"
                         />
                      )}
                      
                      <Text style={[styles.modalLabel, styles.mt12, { color: colors.subtext }]}>{t('notifDescription')}</Text>
                      <Text style={[styles.modalDesc, { color: colors.text }]}>
                        {openItem.description || '-'}
                      </Text>

                      <Text style={[styles.modalLabel, styles.mt12, { color: colors.subtext }]}>{t('notifDate')}</Text>
                      <View style={styles.modalDateRow}>
                        <Ionicons name="calendar-outline" size={16} color={'#2E7D32'} />
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

      {}
      <Modal visible={showOverdueModal} transparent animationType="fade" onRequestClose={() => setShowOverdueModal(false)}>
        <TouchableWithoutFeedback onPress={() => setShowOverdueModal(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={[styles.overdueModalContent, { backgroundColor: colors.bg, borderColor: colors.line }]}>
                {}
                <View style={styles.overdueIconContainer}>
                  <Ionicons name="warning" size={40} color="#F59E0B" />
                </View>
                
                {}
                <Text style={[styles.overdueModalTitle, { color: colors.text }]}>
                  {t('notifOverdueAnnouncements')}
                </Text>
                
                {}
                <Text style={[styles.overdueModalSubtitle, { color: colors.subtext }]}>
                  {t('notifOverdueCountMsg', { n: String(overdueItems.length) })}
                </Text>
                
                {}
                <ScrollView style={styles.overdueList}>
                  {overdueItems.slice(0, 5).map((item, index) => (
                    <View key={index} style={[styles.overdueItem, { borderColor: colors.line }]}>
                      <View style={styles.overdueItemDot} />
                      <View style={styles.overdueItemContent}>
                        <Text style={[styles.overdueItemTitle, { color: colors.text }]} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={[styles.overdueItemDate, styles.colorDarkRed]}>
                          {formatBeThai(item.date)}
                        </Text>
                      </View>
                    </View>
                  ))}
                  {overdueItems.length > 5 && (
                    <Text style={[styles.overdueMoreText, { color: colors.subtext }]}>
                      {t('notifAndMore', { n: String(overdueItems.length - 5) })}
                    </Text>
                  )}
                </ScrollView>
                
                {}
                <TouchableOpacity 
                  style={styles.overdueOkBtn}
                  onPress={() => setShowOverdueModal(false)}
                >
                  <Text style={styles.overdueOkBtnText}>{t('ok')}</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: wp('3%'), paddingVertical: hp('1.3%'), flexGrow: 1 },
  separator: { height: hp('1.5%') },

  header: { alignItems: 'center', paddingVertical: hp('2.5%'), paddingHorizontal: wp('5%') },
  headerTitle: { fontSize: wp('5.5%'), fontWeight: '800', marginBottom: hp('0.8%') },
  headerSubtitle: { fontSize: wp('3.2%'), fontWeight: '500' },

  card: {
    borderRadius: wp('5%'),
    padding: wp('3.5%'),
    marginBottom: hp('1.7%'),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  cardImage: {
    width: wp('16%'),
    height: wp('16%'),
    borderRadius: wp('3.5%'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageContainer: {
    position: 'relative',
  },
  starOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#FFC107',
    borderTopRightRadius: wp('5%'),
    borderBottomLeftRadius: wp('3%'),
    width: wp('8%'),
    height: wp('8%'),
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  cardContent: {
    flex: 1,
    marginLeft: wp('3.5%'),
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitle: {
    fontSize: wp('4.5%'),
    fontWeight: '700',
    lineHeight: wp('6.5%'),
    marginBottom: hp('0.8%'),
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: wp('2.5%'),
    paddingVertical: hp('0.6%'),
    borderRadius: wp('2%'),
    marginRight: wp('1.5%'),
    marginBottom: hp('0.5%'),
  },
  dateBadgeText: { fontSize: wp('3.5%'), fontWeight: '700', marginLeft: wp('1%') },
  overdueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    paddingHorizontal: wp('2%'),
    paddingVertical: hp('0.5%'),
    borderRadius: wp('2%'),
    borderWidth: 1,
    borderColor: '#FFCDD2',
    marginBottom: hp('0.5%'),
  },
  overdueBadgeText: { marginLeft: wp('1%'), color: '#D32F2F', fontSize: wp('3%'), fontWeight: '700' },
  importantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: wp('2%'),
    paddingVertical: hp('0.5%'),
    borderRadius: wp('2%'),
    backgroundColor: 'rgba(255, 193, 7, 0.15)',
    marginRight: wp('1.5%'),
    marginBottom: hp('0.5%'),
  },
  importantBadgeText: { marginLeft: wp('1%'), color: '#F9A825', fontSize: wp('3%'), fontWeight: '700' },
  descText: { fontSize: wp('3.5%'), lineHeight: wp('5.5%') },

  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: hp('7.5%') },
  emptyText: { fontSize: wp('4%'), fontWeight: '800', marginTop: hp('1.5%') },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: wp('5%'),
  },
  modalCard: {
    width: '94%',
    maxWidth: 520,
    borderRadius: wp('4.5%'),
    padding: wp('3.5%'),
    borderWidth: 1,
  },
  modalTitle: { fontSize: wp('5%'), fontWeight: '800', marginBottom: hp('1.3%') },
  modalImage: {
    borderRadius: wp('3%'),
    marginBottom: hp('2%'),
    alignSelf: 'center',
  },
  modalLabel: { fontSize: wp('3%'), fontWeight: '700', marginBottom: hp('0.8%') },
  modalDesc: { fontSize: wp('3.5%'), lineHeight: wp('5%') },
  modalScroll: { maxHeight: hp('57%') },
  modalDateRow: { flexDirection: 'row', alignItems: 'center' },
  modalDateText: {
    marginLeft: wp('2%'),
    fontSize: wp('3.5%'),
    fontWeight: '800',
    color: '#1B5E20',
    backgroundColor: 'rgba(76, 175, 80, 0.18)',
    paddingHorizontal: wp('2.5%'),
    paddingVertical: hp('0.5%'),
    borderRadius: 999,
  },
  modalCloseBtn: {
    marginTop: hp('2%'),
    alignSelf: 'flex-end',
    backgroundColor: '#4CAF50',
    paddingHorizontal: wp('4.5%'),
    paddingVertical: hp('1.5%'),
    borderRadius: wp('3%'),
  },
  modalCloseText: { color: '#fff', fontWeight: '800' },
  modalCloseX: {
    position: 'absolute',
    top: hp('1.3%'),
    right: wp('2.5%'),
    width: wp('9%'),
    height: wp('9%'),
    borderRadius: wp('4.5%'),
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    elevation: 5,
  },
  overdueModalContent: {
    width: '92%',
    maxWidth: 400,
    borderRadius: wp('5%'),
    padding: wp('6%'),
    borderWidth: 1,
    alignItems: 'center',
  },
  overdueIconContainer: {
    width: wp('20%'),
    height: wp('20%'),
    borderRadius: wp('10%'),
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: hp('2%'),
  },
  overdueModalTitle: {
    fontSize: wp('5.5%'),
    fontWeight: '800',
    marginBottom: hp('1%'),
  },
  overdueModalSubtitle: {
    fontSize: wp('3.5%'),
    fontWeight: '500',
    marginBottom: hp('2%'),
  },
  overdueList: {
    width: '100%',
    maxHeight: hp('25%'),
  },
  overdueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: hp('1.3%'),
    paddingHorizontal: wp('3%'),
    borderBottomWidth: 1,
  },
  overdueItemDot: {
    width: wp('2%'),
    height: wp('2%'),
    borderRadius: wp('1%'),
    backgroundColor: '#B00020',
    marginRight: wp('3%'),
  },
  overdueItemContent: {
    flex: 1,
  },
  overdueItemTitle: {
    fontSize: wp('3.5%'),
    fontWeight: '700',
    marginBottom: hp('0.3%'),
  },
  overdueItemDate: {
    fontSize: wp('3%'),
    fontWeight: '600',
  },
  overdueMoreText: {
    fontSize: wp('3.2%'),
    fontWeight: '600',
    textAlign: 'center',
    marginTop: hp('1%'),
  },
  overdueOkBtn: {
    marginTop: hp('2.5%'),
    backgroundColor: '#F59E0B',
    paddingHorizontal: wp('10%'),
    paddingVertical: hp('1.7%'),
    borderRadius: wp('3%'),
  },
  overdueOkBtnText: {
    color: '#fff',
    fontSize: wp('4%'),
    fontWeight: '700',
  },
  cardImageDark: { backgroundColor: '#2A2A2A' },
  cardImageLight: { backgroundColor: '#F5F5F5' },
  dateBadgeTextDark: { color: '#81C784' },
  dateBadgeTextLight: { color: '#2E7D32' },
  mt6: { marginTop: hp('0.8%') },
  mt12: { marginTop: hp('1.5%') },
  modalCloseXDark: { backgroundColor: '#2A2A2A' },
  modalCloseXLight: { backgroundColor: '#EEF2F5' },
  colorDarkRed: { color: '#B00020' },
});

export default Notification;
