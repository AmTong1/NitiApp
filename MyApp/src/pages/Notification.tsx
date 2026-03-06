import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Image, StyleSheet, ActivityIndicator, FlatList, TouchableOpacity, Platform, Modal, TouchableWithoutFeedback, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import type { Announcement } from '../types';
import { BASE_HOST, BASE_PORT } from './config';

type NotificationProps = { darkMode: boolean };

const ANDROID_HOST = BASE_HOST;
export function getBaseUrl() {
  const host = Platform.OS === 'android' ? ANDROID_HOST : BASE_HOST;
  return `http://${host}:${BASE_PORT}`;
}

// pad2 helper removed - not currently used
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
    ? ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
    : ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
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
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [openItem, setOpenItem] = useState<Announcement | null>(null);
  const [overdueNotified, setOverdueNotified] = useState(false);
  const [showOverdueModal, setShowOverdueModal] = useState(false);
  const [overdueItems, setOverdueItems] = useState<Announcement[]>([]);

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

      // เรียงตามวันที่ใกล้ถึงก่อน (อนาคตก่อน อดีตตามหลัง)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const toDiff = (s?: string) => {
        const d = toDate(s || '');
        if (!d || isNaN(d.getTime())) return Number.POSITIVE_INFINITY;
        const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        return dd - today.getTime(); // <0 = อดีต, >=0 = อนาคต
      };
      mapped.sort((a, b) => {
        const da = toDiff(a.date);
        const db = toDiff(b.date);
        const aPast = da < 0, bPast = db < 0;
        if (aPast !== bPast) return aPast ? 1 : -1; // อนาคตมาก่อน
        return da - db; // ใกล้สุดก่อน
      });

      setItems(mapped);

      // แจ้งผู้ดูแลถ้ามีรายการเลยกำหนด (เฉพาะแอดมิน และแจ้งครั้งเดียวต่อการเข้าเพจ)
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
                  <Text style={styles.overdueBadgeText}>เลยกำหนด</Text>
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
            <Text style={[styles.headerTitle, { color: colors.text }]}>📢 ประกาศทั้งหมด</Text>
            <Text style={[styles.headerSubtitle, { color: colors.subtext }]}>รายการล่าสุด</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="megaphone-outline" size={56} color={colors.subtext} />
            <Text style={[styles.emptyText, { color: colors.subtext }]}>ยังไม่มีประกาศ</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Detail Modal */}
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
                    <Text style={[styles.modalTitle, { color: colors.text }]}>{openItem.title || 'ประกาศ'}</Text>
                    <ScrollView style={styles.modalScroll}>
                      {openItem.image && (
                         <Image 
                           source={{ uri: openItem.image }} 
                           style={styles.modalImage} 
                           resizeMode="cover"
                         />
                      )}
                      
                      <Text style={[styles.modalLabel, styles.mt12, { color: colors.subtext }]}>รายละเอียด</Text>
                      <Text style={[styles.modalDesc, { color: colors.text }]}>
                        {openItem.description || '-'}
                      </Text>

                      <Text style={[styles.modalLabel, styles.mt12, { color: colors.subtext }]}>วันที่</Text>
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

      {/* Overdue Modal */}
      <Modal visible={showOverdueModal} transparent animationType="fade" onRequestClose={() => setShowOverdueModal(false)}>
        <TouchableWithoutFeedback onPress={() => setShowOverdueModal(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={[styles.overdueModalContent, { backgroundColor: colors.bg, borderColor: colors.line }]}>
                {/* Warning Icon */}
                <View style={styles.overdueIconContainer}>
                  <Ionicons name="warning" size={40} color="#F59E0B" />
                </View>
                
                {/* Title */}
                <Text style={[styles.overdueModalTitle, { color: colors.text }]}>
                  ประกาศเลยกำหนด
                </Text>
                
                {/* Count */}
                <Text style={[styles.overdueModalSubtitle, { color: colors.subtext }]}>
                  มี {overdueItems.length} รายการที่วันเลยกำหนดแล้ว
                </Text>
                
                {/* List */}
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
                      และอีก {overdueItems.length - 5} รายการ...
                    </Text>
                  )}
                </ScrollView>
                
                {/* OK Button */}
                <TouchableOpacity 
                  style={styles.overdueOkBtn}
                  onPress={() => setShowOverdueModal(false)}
                >
                  <Text style={styles.overdueOkBtnText}>ตกลง</Text>
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
  listContent: { paddingHorizontal: 12, paddingVertical: 10, flexGrow: 1 },
  separator: { height: 12 },

  // Header
  header: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 20 },
  headerTitle: { fontSize: 22, fontWeight: '800', marginBottom: 6 },
  headerSubtitle: { fontSize: 13, fontWeight: '500' },

  // Card (style similar to call.tsx)
  // Card
  card: {
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
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
    width: 65,
    height: 65,
    borderRadius: 14,
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
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 12,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  cardContent: {
    flex: 1,
    marginLeft: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 26,
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginRight: 6,
    marginBottom: 4,
  },
  dateBadgeText: { fontSize: 14, fontWeight: '700', marginLeft: 4 },
  overdueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFCDD2',
    marginBottom: 4,
  },
  overdueBadgeText: { marginLeft: 4, color: '#D32F2F', fontSize: 12, fontWeight: '700' },
  importantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 193, 7, 0.15)',
    marginRight: 6,
    marginBottom: 4,
  },
  importantBadgeText: { marginLeft: 4, color: '#F9A825', fontSize: 12, fontWeight: '700' },
  descText: { fontSize: 14, lineHeight: 22 },

  // Empty
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 16, fontWeight: '800', marginTop: 12 },

  // ===== Modal =====
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '92%',
    maxWidth: 520,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 10 },
  modalImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: '#F5F5F5',
  },
  modalLabel: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  modalDesc: { fontSize: 14, lineHeight: 20 },
  modalScroll: { maxHeight: 460 },
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
  // ===== Overdue Modal =====
  overdueModalContent: {
    width: '92%',
    maxWidth: 400,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    alignItems: 'center',
  },
  overdueIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  overdueModalTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
  },
  overdueModalSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 16,
  },
  overdueList: {
    width: '100%',
    maxHeight: 200,
  },
  overdueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  overdueItemDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#B00020',
    marginRight: 12,
  },
  overdueItemContent: {
    flex: 1,
  },
  overdueItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  overdueItemDate: {
    fontSize: 12,
    fontWeight: '600',
  },
  overdueMoreText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
  },
  overdueOkBtn: {
    marginTop: 20,
    backgroundColor: '#F59E0B',
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 12,
  },
  overdueOkBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  cardImageDark: { backgroundColor: '#2A2A2A' },
  cardImageLight: { backgroundColor: '#F5F5F5' },
  dateBadgeTextDark: { color: '#81C784' },
  dateBadgeTextLight: { color: '#2E7D32' },
  mt6: { marginTop: 6 },
  mt12: { marginTop: 12 },
  modalCloseXDark: { backgroundColor: '#2A2A2A' },
  modalCloseXLight: { backgroundColor: '#EEF2F5' },
  colorDarkRed: { color: '#B00020' },
});

export default Notification;
