import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, RefreshControl, ActivityIndicator, Platform, Modal, Image
} from 'react-native';

import { Ionicons } from '@react-native-vector-icons/ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBaseUrl } from '../SuperAdmin';
import { formatThaiDateTime, toSortableMs } from '../../lib/datetime';

const themeColors = {
  primary: '#4F46E5',
  bg: '#F3F4F6',
  cardBg: '#FFFFFF',
  text: '#1F2937',
  subtext: '#6B7280',
  border: '#E5E7EB',
  warning: '#F59E0B',
  danger: '#EF4444',
  success: '#10B981',
  info: '#3B82F6',
};

type AnnouncementLog = {
  id: number;
  action: string;
  announcement_id: number | null;
  announcement_title: string | null;
  changes: Record<string, { old?: any; new?: any }> | null;
  performed_by: number | null;
  performed_by_name: string | null;
  performed_by_role: string | null;
  created_at: string;
};

interface Props {
  onBack: () => void;
  darkMode?: boolean;
}

const toThaiDate = (input: unknown, withTime = false) => {
  if (input === null || input === undefined || String(input).trim() === '') return '-';
  return formatThaiDateTime(String(input), { withTime });
};

const ACTION_CONFIG: Record<string, { label: string; icon: string; color: string; bgColor: string }> = {
  create: { label: 'เพิ่มใหม่', icon: 'add-circle', color: '#10B981', bgColor: '#ECFDF5' },
  update: { label: 'แก้ไข', icon: 'create', color: '#3B82F6', bgColor: '#EFF6FF' },
  delete: { label: 'ลบ', icon: 'trash', color: '#EF4444', bgColor: '#FEF2F2' },
};

const FIELD_LABELS: Record<string, string> = {
  title: 'หัวข้อ',
  date: 'วันที่',
  description: 'รายละเอียด',
  important: 'สำคัญ',
  image: 'รูปภาพ',
};

type FilterAction = '' | 'create' | 'update' | 'delete';

const AnnouncementLogsPage: React.FC<Props> = ({ onBack }) => {
  const [logs, setLogs] = useState<AnnouncementLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [filterAction, setFilterAction] = useState<FilterAction>('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const PAGE_SIZE = 50;

  const colors = themeColors;

  const fetchLogs = async (loadMore = false) => {
    try {
      if (!loadMore) setLoading(true);
      else setLoadingMore(true);
      const token = await AsyncStorage.getItem('token');
      const offset = loadMore ? logs.length : 0;
      let url = `${getBaseUrl()}/announcement-logs?limit=${PAGE_SIZE}&offset=${offset}`;
      if (filterAction) url += `&action=${filterAction}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        const newLogs = Array.isArray(data.data) ? data.data : [];
        if (loadMore) {
          setLogs(prev => [...prev, ...newLogs]);
        } else {
          setLogs(newLogs);
        }
        setHasMore(!!data.hasMore);
      }
    } catch (error) {
      console.log('Error fetching announcement logs:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  };

  const onLoadMore = () => {
    if (!loadingMore && hasMore && !loading) fetchLogs(true);
  };

  useEffect(() => {
    fetchLogs();
  }, [filterAction]);

  const onRefresh = () => { setRefreshing(true); fetchLogs(); };

  const filteredLogs = useMemo(() => {
    let data = [...logs];
    if (searchText) {
      const lower = searchText.toLowerCase();
      data = data.filter(l =>
        (l.announcement_title || '').toLowerCase().includes(lower) ||
        (l.performed_by_name || '').toLowerCase().includes(lower)
      );
    }
    data.sort((a, b) => {
      const dA = toSortableMs(a.created_at);
      const dB = toSortableMs(b.created_at);
      return sortOrder === 'newest' ? dB - dA : dA - dB;
    });
    return data;
  }, [logs, searchText, sortOrder]);

  const formatVal = (key: string, val: any): string => {
    if (val === null || val === undefined || val === '') return '-';
    if (key === 'important') return val ? 'ใช่' : 'ไม่';
    if (key === 'date') return toThaiDate(val, false);
    return String(val);
  };

  const normalizeImageUrl = (val: any): string | null => {
    if (typeof val !== 'string') return null;
    const raw = val.trim();
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    const base = getBaseUrl();
    return raw.startsWith('/') ? `${base}${raw}` : `${base}/${raw}`;
  };

  const isImageField = (key: string) => key.toLowerCase().includes('image');

  const renderImageLink = (val: any, label = 'ดูรูป') => {
    const url = normalizeImageUrl(val);
    if (!url) return <Text style={[styles.changeValue, styles.textSubtext]}>-</Text>;
    return (
      <TouchableOpacity onPress={() => setPreviewImageUrl(url)} style={styles.imageOpenBtn} activeOpacity={0.8}>
        <Ionicons name="image-outline" size={13} color="#2563EB" />
        <Text style={styles.imageOpenText}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const renderChanges = (changes: Record<string, { old?: any; new?: any }> | null, action: string) => {
    if (!changes || typeof changes !== 'object') return null;
    const entries = Object.entries(changes);
    if (!entries.length) return null;

    if (action === 'create') {
      return (
        <View style={[styles.changesBox, styles.changesBoxCreate]}>
          <Text style={[styles.changesTitle, styles.changesTitleCreate]}>ข้อมูลที่เพิ่ม</Text>
          {entries.map(([key, val]) => {
            const newVal = val && 'new' in val ? val.new : val;
            if (newVal === null || newVal === undefined || newVal === '') return null;
            return (
              <View key={key} style={styles.changeRow}>
                <Text style={[styles.changeField, styles.textSubtext]}>{FIELD_LABELS[key] || key}:</Text>
                {isImageField(key)
                  ? renderImageLink(newVal)
                  : <Text style={[styles.changeValue, styles.textPrimary]}>{formatVal(key, newVal)}</Text>}
              </View>
            );
          })}
        </View>
      );
    }

    if (action === 'delete') {
      return (
        <View style={[styles.changesBox, styles.changesBoxDelete]}>
          <Text style={[styles.changesTitle, styles.changesTitleDelete]}>ข้อมูลที่ถูกลบ</Text>
          {entries.map(([key, val]) => {
            const oldVal = val && 'old' in val ? val.old : val;
            if (oldVal === null || oldVal === undefined || String(oldVal) === '') return null;
            return (
              <View key={key} style={styles.changeRow}>
                <Text style={[styles.changeField, styles.textSubtext]}>{FIELD_LABELS[key] || key}:</Text>
                {isImageField(key)
                  ? renderImageLink(oldVal)
                  : <Text style={[styles.changeValue, styles.changeValueDelete]}>{formatVal(key, oldVal)}</Text>}
              </View>
            );
          })}
        </View>
      );
    }

    return (
      <View style={[styles.changesBox, styles.changesBoxUpdate]}>
        <Text style={[styles.changesTitle, styles.changesTitleUpdate]}>รายละเอียดการเปลี่ยนแปลง</Text>
        {entries.map(([key, val]) => {
          if (!val || typeof val !== 'object') return null;
          return (
            <View key={key} style={styles.changeItem}>
              <Text style={[styles.changeField, styles.textSubtext]}>{FIELD_LABELS[key] || key}</Text>
              <View style={styles.changeArrowRow}>
                <View style={[styles.changeValueBox, styles.changeValueBoxOld]}>
                  {isImageField(key)
                    ? renderImageLink(val.old, 'รูปเดิม')
                    : <Text style={[styles.changeValueSmall, styles.changeValueOldText]}>{formatVal(key, val.old)}</Text>}
                </View>
                <Ionicons name="arrow-forward" size={14} color={colors.subtext} />
                <View style={[styles.changeValueBox, styles.changeValueBoxNew]}>
                  {isImageField(key)
                    ? renderImageLink(val.new, 'รูปใหม่')
                    : <Text style={[styles.changeValueSmall, styles.changeValueNewText]}>{formatVal(key, val.new)}</Text>}
                </View>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  const renderLog = ({ item }: { item: AnnouncementLog }) => {
    const config = ACTION_CONFIG[item.action] || ACTION_CONFIG.update;
    const isExpanded = expandedId === item.id;
    const badgeBg = actionBadgeBg[item.action] || actionBadgeBg.update;
    const badgeColor = actionBadgeColor[item.action] || actionBadgeColor.update;

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setExpandedId(isExpanded ? null : item.id)}
        style={styles.logCard}
      >
        <View style={styles.logHeader}>
          <View style={[styles.actionBadge, { backgroundColor: badgeBg }]}>
            <Ionicons name={config.icon as any} size={14} color={badgeColor} />
            <Text style={[styles.actionBadgeText, { color: badgeColor }]}>{config.label}</Text>
          </View>
          <Text style={[styles.logDate, styles.textSubtext]}>{toThaiDate(item.created_at, true)}</Text>
        </View>

        <View style={styles.logBody}>
          {item.announcement_title ? (
            <Text style={[styles.itemName, styles.textPrimary]} numberOfLines={2}>
              {item.announcement_title}
            </Text>
          ) : null}
        </View>

        <View style={styles.performedByBox}>
          <View style={styles.performedByRow}>
            <Ionicons name="person-circle-outline" size={18} color={colors.text} />
            <Text style={[styles.performedByName, styles.textPrimary]}>
              {item.performed_by_name || 'ไม่ทราบ'}
            </Text>
            {item.performed_by_role && (
              <View style={[
                styles.roleBadge,
                item.performed_by_role === 'superadmin' ? styles.roleBadgeWarning : styles.roleBadgePrimary
              ]}>
                <Text style={styles.roleBadgeText}>{item.performed_by_role}</Text>
              </View>
            )}
          </View>
        </View>

        {isExpanded && item.changes && (
          <View style={styles.expandedSection}>
            {renderChanges(item.changes, item.action)}
          </View>
        )}

        {item.changes && Object.keys(item.changes).length > 0 && (
          <View style={styles.expandIndicator}>
            <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.subtext} />
            <Text style={[styles.expandText, styles.textSubtext]}>
              {isExpanded ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียด'}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const filterButtons: { key: FilterAction; label: string }[] = [
    { key: '', label: 'ทั้งหมด' },
    { key: 'create', label: 'เพิ่ม' },
    { key: 'update', label: 'แก้ไข' },
    { key: 'delete', label: 'ลบ' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, styles.textPrimary]}>
          ประวัติประกาศ ({logs.length})
        </Text>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchRow}>
          <View style={[styles.searchInputWrapper, styles.flex1]}>
            <Ionicons name="search" size={18} color={colors.subtext} />
            <TextInput
              style={[styles.searchInput, styles.textPrimary]}
              placeholder="ค้นหา หัวข้อ / ชื่อผู้ทำ..."
              placeholderTextColor={colors.subtext}
              value={searchText}
              onChangeText={setSearchText}
            />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText('')}>
                <Ionicons name="close-circle" size={18} color={colors.subtext} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={styles.sortToggleBtn}
            onPress={() => setSortOrder(prev => prev === 'newest' ? 'oldest' : 'newest')}
          >
            <Ionicons name={sortOrder === 'newest' ? 'arrow-down' : 'arrow-up'} size={16} color="#fff" />
            <Text style={styles.sortToggleText}>{sortOrder === 'newest' ? 'ล่าสุด' : 'เก่าสุด'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.filterRow}>
          {filterButtons.map(fb => {
            const isActive = filterAction === fb.key;
            return (
              <TouchableOpacity
                key={fb.key}
                style={[styles.filterBtn, isActive && styles.filterBtnActive]}
                onPress={() => setFilterAction(fb.key)}
              >
                <Text style={[styles.filterBtnText, isActive ? styles.filterBtnTextActive : styles.filterBtnTextInactive]}>
                  {fb.label}
                </Text>
              </TouchableOpacity>
            );
          })}
          {searchText.length > 0 && (
            <Text style={[styles.resultCount, styles.textSubtext]}>พบ {filteredLogs.length} รายการ</Text>
          )}
        </View>
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredLogs}
          keyExtractor={item => String(item.id)}
          renderItem={renderLog}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.loadMoreContainer}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.loadMoreText, styles.textSubtext]}>กำลังโหลดเพิ่ม...</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="megaphone-outline" size={64} color={colors.subtext} />
              <Text style={[styles.emptyText, styles.textSubtext]}>
                {searchText.length > 0 ? 'ไม่พบรายการที่ค้นหา' : 'ไม่มีประวัติการเปลี่ยนแปลง'}
              </Text>
            </View>
          }
        />
      )}

      <Modal visible={!!previewImageUrl} transparent animationType="fade" onRequestClose={() => setPreviewImageUrl(null)}>
        <View style={styles.previewBackdrop}>
          <View style={styles.previewCard}>
            <Image source={{ uri: previewImageUrl || '' }} style={styles.previewImage} resizeMode="contain" />
            <TouchableOpacity style={styles.previewCloseBtn} onPress={() => setPreviewImageUrl(null)} activeOpacity={0.8}>
              <Text style={styles.previewCloseText}>ปิด</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const actionBadgeBg: Record<string, string> = {
  create: '#ECFDF5',
  update: '#EFF6FF',
  delete: '#FEF2F2',
};
const actionBadgeColor: Record<string, string> = {
  create: '#10B981',
  update: '#3B82F6',
  delete: '#EF4444',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: themeColors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', padding: 16,
    paddingTop: Platform.OS === 'android' ? 16 : 56,
    borderBottomWidth: 1, gap: 16,
    backgroundColor: themeColors.cardBg, borderColor: themeColors.border,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  flex1: { flex: 1 },
  textPrimary: { color: themeColors.text },
  textSubtext: { color: themeColors.subtext },

  searchContainer: {
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, gap: 10,
    backgroundColor: themeColors.cardBg, borderBottomColor: themeColors.border,
  },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInputWrapper: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, gap: 10,
    backgroundColor: themeColors.bg, borderColor: themeColors.border,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  sortToggleBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#4F46E5',
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, gap: 5,
  },
  sortToggleText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  filterBtn: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1,
    backgroundColor: themeColors.bg, borderColor: themeColors.border,
  },
  filterBtnActive: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  filterBtnText: { fontSize: 12, fontWeight: '600' },
  filterBtnTextActive: { color: '#fff' },
  filterBtnTextInactive: { color: themeColors.subtext },
  resultCount: { fontSize: 13, fontWeight: '500', marginLeft: 'auto' },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 16, paddingBottom: 100 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100 },
  emptyText: { fontSize: 16, marginTop: 12 },
  loadMoreContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 16, gap: 8 },
  loadMoreText: { fontSize: 13 },

  logCard: {
    borderRadius: 12, borderWidth: 1, padding: 16, marginBottom: 12,
    backgroundColor: themeColors.cardBg, borderColor: themeColors.border,
  },
  logHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
  },
  actionBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, gap: 4,
  },
  actionBadgeText: { fontSize: 12, fontWeight: '700' },
  logDate: { fontSize: 12 },
  logBody: { marginBottom: 8 },
  itemName: { fontSize: 16, fontWeight: '600', marginBottom: 4 },

  performedByBox: { padding: 10, borderRadius: 8, backgroundColor: themeColors.bg },
  performedByRow: { flexDirection: 'row', alignItems: 'center' },
  performedByName: { marginLeft: 6, fontWeight: '600', fontSize: 13 },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginLeft: 8 },
  roleBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  roleBadgeWarning: { backgroundColor: '#F59E0B' },
  roleBadgePrimary: { backgroundColor: '#6366F1' },

  expandedSection: { marginTop: 12 },
  expandIndicator: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 8, gap: 4,
  },
  expandText: { fontSize: 12 },

  changesBox: { borderWidth: 1, borderRadius: 8, padding: 12 },
  changesTitle: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  changeRow: { flexDirection: 'row', marginBottom: 4, gap: 6 },
  changeField: { fontSize: 12, fontWeight: '600', minWidth: 80 },
  changeValue: { fontSize: 12, flex: 1 },
  changeItem: { marginBottom: 8 },
  changeArrowRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 },
  changeValueBox: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  changeValueSmall: { fontSize: 12, fontWeight: '600' },

  changesBoxCreate: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  changesBoxDelete: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  changesBoxUpdate: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  changesTitleCreate: { color: '#166534' },
  changesTitleDelete: { color: '#991B1B' },
  changesTitleUpdate: { color: '#1E40AF' },
  changeValueDelete: { color: '#DC2626' },
  changeValueBoxOld: { backgroundColor: '#FEE2E2' },
  changeValueOldText: { color: '#DC2626' },
  changeValueBoxNew: { backgroundColor: '#DCFCE7' },
  changeValueNewText: { color: '#16A34A' },
  imageOpenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  imageOpenText: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '700',
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  previewCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 10,
  },
  previewImage: {
    width: '100%',
    height: 380,
    borderRadius: 8,
    backgroundColor: '#0B1220',
  },
  previewCloseBtn: {
    marginTop: 10,
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  previewCloseText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default AnnouncementLogsPage;
