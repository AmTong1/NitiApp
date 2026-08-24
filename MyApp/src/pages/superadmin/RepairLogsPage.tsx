import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, RefreshControl, ActivityIndicator, Image, Modal
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
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',
};

type RepairPhoto = {
  id: number;
  url: string;
};

type RepairLog = {
  id: number;
  user_id: number;
  title: string;
  detail?: string;
  house_number?: string;
  status: 'pending' | 'in_progress' | 'done';
  created_at: string;
  done_at?: string;
  reporter_username?: string;
  reporter_fullname?: string;
  photo_count?: number;
  photos?: RepairPhoto[];
};

type EditLog = {
  id: number;
  repair_id: number;
  action: string;
  changes: Record<string, { old: any; new: any }> | null;
  performed_by: number | null;
  performed_by_name: string | null;
  performed_by_role: string | null;
  created_at: string;
};

interface RepairLogsPageProps {
  onBack: () => void;
  darkMode?: boolean;
}

type StatusFilter = 'all' | 'pending' | 'in_progress' | 'done';

const RepairLogsPage: React.FC<RepairLogsPageProps> = ({ onBack }) => {
  const [logs, setLogs] = useState<RepairLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [sortNewest, setSortNewest] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editLogs, setEditLogs] = useState<Record<number, EditLog[]>>({});
  const [loadingEditLogs, setLoadingEditLogs] = useState<number | null>(null);

  const colors = themeColors;

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('token');
      const params = new URLSearchParams({ limit: '200' });
      if (statusFilter !== 'all') params.append('status', statusFilter);
      const res = await fetch(`${getBaseUrl()}/repairs/logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setLogs(Array.isArray(data.data) ? data.data : []);
      }
    } catch (error) {
      console.log('Error fetching repair logs:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const fetchEditLogs = async (repairId: number) => {
    try {
      setLoadingEditLogs(repairId);
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${getBaseUrl()}/repairs/edit-logs?repair_id=${repairId}&limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setEditLogs(prev => ({ ...prev, [repairId]: Array.isArray(data.data) ? data.data : [] }));
      }
    } catch (error) {
      console.log('Error fetching edit logs:', error);
    } finally {
      setLoadingEditLogs(null);
    }
  };

  const toggleExpand = (repairId: number) => {
    if (expandedId === repairId) {
      setExpandedId(null);
    } else {
      setExpandedId(repairId);
      if (!editLogs[repairId]) {
        fetchEditLogs(repairId);
      }
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchLogs();
  };

  const filteredLogs = useMemo(() => {
    let result = logs;
    if (searchText) {
      const lower = searchText.toLowerCase();
      result = result.filter(l =>
        l.title.toLowerCase().includes(lower) ||
        (l.house_number || '').toLowerCase().includes(lower) ||
        (l.detail || '').toLowerCase().includes(lower) ||
        (l.reporter_fullname || '').toLowerCase().includes(lower) ||
        (l.reporter_username || '').toLowerCase().includes(lower)
      );
    }
    return [...result].sort((a, b) => {
      const da = toSortableMs(a.created_at);
      const db = toSortableMs(b.created_at);
      return sortNewest ? db - da : da - db;
    });
  }, [logs, searchText, sortNewest]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done': return colors.success;
      case 'in_progress': return colors.warning;
      case 'pending': return colors.info;
      default: return colors.subtext;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'done': return 'เสร็จสิ้น';
      case 'in_progress': return 'กำลังดำเนินการ';
      case 'pending': return 'รอดำเนินการ';
      default: return status;
    }
  };

  const getStatusIcon = (status: string): 'checkmark-circle' | 'construct' | 'time' | 'help-circle' => {
    switch (status) {
      case 'done': return 'checkmark-circle';
      case 'in_progress': return 'construct';
      case 'pending': return 'time';
      default: return 'help-circle';
    }
  };

  const statusTabs: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'ทั้งหมด' },
    { key: 'pending', label: 'รอดำเนินการ' },
    { key: 'in_progress', label: 'กำลังซ่อม' },
    { key: 'done', label: 'เสร็จสิ้น' },
  ];

  const STATUS_LABELS: Record<string, string> = {
    pending: 'รอดำเนินการ',
    in_progress: 'กำลังซ่อม',
    done: 'เสร็จสิ้น',
  };

  const FIELD_LABELS: Record<string, string> = {
    title: 'หัวข้อ',
    detail: 'รายละเอียด',
    status: 'สถานะ',
  };

  const renderEditLogItem = (log: EditLog) => {
    const isStatusChange = log.action === 'status_change';
    return (
      <View key={log.id} style={styles.editLogItem}>
        {}
        <View style={styles.timelineDot}>
          <View style={[styles.dot, { backgroundColor: isStatusChange ? colors.warning : colors.info }]} />
        </View>

        <View style={styles.editLogContent}>
          {}
          <View style={styles.editLogHeader}>
            <View style={styles.editLogUser}>
              <Ionicons name="person-circle" size={16} color={colors.text} />
              <Text style={[styles.editLogUserName, { color: colors.text }]}>
                {log.performed_by_name || 'ไม่ทราบ'}
              </Text>
              {log.performed_by_role && (
                <View style={[
                  styles.miniRoleBadge,
                  log.performed_by_role === 'superadmin' ? styles.miniRoleBadgeWarning : styles.miniRoleBadgePrimary
                ]}>
                  <Text style={styles.miniRoleText}>{log.performed_by_role}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.editLogTime, { color: colors.subtext }]}>
              {formatThaiDateTime(log.created_at)}
            </Text>
          </View>

          {}
          {log.changes && Object.entries(log.changes).map(([key, val]) => {
            if (!val || typeof val !== 'object') return null;
            const label = FIELD_LABELS[key] || key;
            const oldDisplay = key === 'status' ? (STATUS_LABELS[val.old] || val.old) : val.old;
            const newDisplay = key === 'status' ? (STATUS_LABELS[val.new] || val.new) : val.new;
            return (
              <View key={key} style={styles.editChangeRow}>
                <Text style={[styles.editChangeLabel, { color: colors.subtext }]}>{label}</Text>
                <View style={styles.editChangeValues}>
                  <View style={[styles.editOldVal, styles.editOldValBg]}>
                    <Text style={styles.editOldValText} numberOfLines={1}>
                      {oldDisplay != null ? String(oldDisplay) : '-'}
                    </Text>
                  </View>
                  <Ionicons name="arrow-forward" size={12} color={colors.subtext} />
                  <View style={[styles.editNewVal, styles.editNewValBg]}>
                    <Text style={styles.editNewValText} numberOfLines={1}>
                      {newDisplay != null ? String(newDisplay) : '-'}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderItem = ({ item }: { item: RepairLog }) => {
    const isExpanded = expandedId === item.id;
    const itemEditLogs = editLogs[item.id] || [];
    const isLoadingThis = loadingEditLogs === item.id;

    return (
    <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
      {}
      <View style={styles.cardHeader}>
        {item.house_number ? (
          <View style={styles.houseBadge}>
            <Ionicons name="home" size={12} color="#fff" />
            <Text style={styles.houseText}>{item.house_number}</Text>
          </View>
        ) : (
          <View style={[styles.houseBadge, styles.houseBadgeUnknown]}>
            <Ionicons name="home-outline" size={12} color="#fff" />
            <Text style={styles.houseText}>ไม่ระบุ</Text>
          </View>
        )}
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
          <Ionicons name={getStatusIcon(item.status)} size={12} color={getStatusColor(item.status)} />
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {getStatusLabel(item.status)}
          </Text>
        </View>
      </View>

      {}
      <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
        {item.title}
      </Text>

      {}
      {item.detail && (
        <Text style={[styles.detail, { color: colors.subtext }]} numberOfLines={3}>
          {item.detail}
        </Text>
      )}

      {}
      <View style={styles.infoSection}>
        <View style={styles.infoRow}>
          <Ionicons name="person-outline" size={14} color={colors.subtext} />
          <Text style={[styles.infoLabel, { color: colors.subtext }]}>แจ้งโดย: </Text>
          <Text style={[styles.infoValue, { color: colors.text }]}>
            {item.reporter_fullname || item.reporter_username || 'ไม่ทราบ'}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Ionicons name="calendar-outline" size={14} color={colors.subtext} />
          <Text style={[styles.infoLabel, { color: colors.subtext }]}>วันที่แจ้ง: </Text>
          <Text style={[styles.infoValue, { color: colors.text }]}>
            {formatThaiDateTime(item.created_at)}
          </Text>
        </View>

        {item.done_at && (
          <View style={styles.infoRow}>
            <Ionicons name="checkmark-done-outline" size={14} color={colors.success} />
            <Text style={[styles.infoLabel, { color: colors.subtext }]}>เสร็จเมื่อ: </Text>
            <Text style={[styles.infoValue, { color: colors.success }]}>
              {formatThaiDateTime(item.done_at)}
            </Text>
          </View>
        )}

        {(item.photo_count ?? 0) > 0 && (
          <View style={styles.infoRow}>
            <Ionicons name="images-outline" size={14} color={colors.info} />
            <Text style={[styles.infoLabel, { color: colors.info }]}>
              {item.photo_count} รูปภาพ
            </Text>
          </View>
        )}
      </View>

      {}
      {item.photos && item.photos.length > 0 && (
        <View style={styles.photosContainer}>
          {item.photos.map((photo) => {
            const uri = photo.url.startsWith('http') ? photo.url : `${getBaseUrl()}${photo.url.startsWith('/') ? '' : '/'}${photo.url}`;
            return (
              <TouchableOpacity
                key={photo.id}
                onPress={() => setSelectedImage(uri)}
                style={styles.photoThumb}
              >
                <Image source={{ uri }} style={styles.photoImage} resizeMode="cover" />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {}
      <TouchableOpacity
        style={styles.editHistoryToggle}
        onPress={() => toggleExpand(item.id)}
      >
        <Ionicons
          name={isExpanded ? 'time' : 'time-outline'}
          size={15}
          color={colors.primary}
        />
        <Text style={[styles.editHistoryToggleText, { color: colors.primary }]}>
          {isExpanded ? 'ซ่อนประวัติแก้ไข' : 'ดูประวัติแก้ไข'}
        </Text>
        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={colors.primary}
        />
      </TouchableOpacity>

      {}
      {isExpanded && (
        <View style={[styles.editHistorySection, { borderTopColor: colors.border }]}>
          {isLoadingThis ? (
            <ActivityIndicator size="small" color={colors.primary} style={styles.loadingIndicatorInline} />
          ) : itemEditLogs.length === 0 ? (
            <View style={styles.noEditLogs}>
              <Ionicons name="checkmark-circle-outline" size={20} color={colors.subtext} />
              <Text style={[styles.noEditLogsText, { color: colors.subtext }]}>
                ยังไม่มีประวัติการแก้ไข
              </Text>
            </View>
          ) : (
            <View style={styles.editLogsList}>
              <Text style={[styles.editLogsTitle, { color: colors.text }]}>
                ประวัติแก้ไข ({itemEditLogs.length})
              </Text>
              {itemEditLogs.map(renderEditLogItem)}
            </View>
          )}
        </View>
      )}
    </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {}
      <View style={[styles.header, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>ประวัติการแจ้งซ่อม</Text>
      </View>

      {}
      <View style={[styles.searchContainer, { backgroundColor: colors.cardBg, borderBottomColor: colors.border }]}>
        <View style={styles.searchRow}>
          <View style={[styles.searchInputWrapper, { backgroundColor: colors.bg, borderColor: colors.border }]}>
            <Ionicons name="search" size={18} color={colors.subtext} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="ค้นหาชื่อเรื่อง, บ้านเลขที่, ผู้แจ้ง..."
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
            style={styles.sortBtn}
            onPress={() => setSortNewest(prev => !prev)}
          >
            <Ionicons name={sortNewest ? 'arrow-down' : 'arrow-up'} size={16} color="#fff" />
            <Text style={styles.sortText}>
              {sortNewest ? 'ล่าสุด' : 'เก่าสุด'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {}
      <View style={[styles.tabContainer, { backgroundColor: colors.cardBg, borderBottomColor: colors.border }]}>
        <View style={styles.tabRow}>
          {statusTabs.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.tab,
                statusFilter === tab.key && styles.tabActive,
              ]}
              onPress={() => setStatusFilter(tab.key)}
            >
              <Text
                style={[
                  styles.tabText,
                  statusFilter === tab.key ? styles.tabTextActive : styles.tabTextInactive,
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredLogs}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="construct-outline" size={64} color={colors.subtext} />
              <Text style={[styles.emptyText, { color: colors.subtext }]}>
                ไม่พบข้อมูลประวัติการแจ้งซ่อม
              </Text>
            </View>
          }
        />
      )}

      {}
      <Modal visible={!!selectedImage} transparent animationType="fade" onRequestClose={() => setSelectedImage(null)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setSelectedImage(null)}>
            <Ionicons name="close" size={30} color="#fff" />
          </TouchableOpacity>
          {selectedImage && (
            <Image
              source={{ uri: selectedImage }}
              style={styles.fullImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    gap: 16,
  },
  backBtn: { padding: 4 },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
    flex: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  tabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabActive: {
    backgroundColor: '#E0E7FF',
    borderColor: themeColors.primary,
  },
  tabText: {
    fontSize: 13,
  },
  tabTextActive: {
    color: themeColors.primary,
    fontWeight: '700',
  },
  tabTextInactive: {
    color: themeColors.subtext,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#4F46E5',
  },
  sortText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 40,
  },
  list: {
    padding: 16,
    paddingBottom: 100,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  houseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: themeColors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  houseBadgeUnknown: {
    backgroundColor: themeColors.subtext,
  },
  houseText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 4,
  },
  statusText: {
    fontWeight: '600',
    fontSize: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  detail: {
    fontSize: 13,
    marginBottom: 10,
    lineHeight: 18,
  },
  infoSection: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 10,
    gap: 6,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoLabel: {
    fontSize: 13,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyText: {
    marginTop: 12,
  },
  photosContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  photoThumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 10,
    padding: 10,
  },
  fullImage: {
    width: '100%',
    height: '80%',
  },

  editHistoryToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  editHistoryToggleText: {
    fontSize: 13,
    fontWeight: '600',
  },
  editHistorySection: {
    marginTop: 12,
    borderTopWidth: 1,
    paddingTop: 12,
  },
  noEditLogs: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  noEditLogsText: {
    fontSize: 13,
  },
  editLogsList: {
    gap: 0,
  },
  editLogsTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
  },
  editLogItem: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 10,
  },
  timelineDot: {
    alignItems: 'center',
    width: 16,
    paddingTop: 2,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  editLogContent: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  editLogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  editLogUser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    flexWrap: 'wrap',
  },
  editLogUserName: {
    fontSize: 13,
    fontWeight: '700',
  },
  miniRoleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  miniRoleBadgeWarning: {
    backgroundColor: '#F59E0B',
  },
  miniRoleBadgePrimary: {
    backgroundColor: '#6366F1',
  },
  miniRoleText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  editLogTime: {
    fontSize: 11,
    marginLeft: 8,
    flexShrink: 0,
  },
  editChangeRow: {
    marginBottom: 6,
  },
  editChangeLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 3,
  },
  editChangeValues: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editOldVal: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    maxWidth: '40%',
  },
  editOldValBg: {
    backgroundColor: '#FEE2E2',
  },
  editOldValText: {
    color: '#DC2626',
    fontSize: 12,
  },
  editNewVal: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    maxWidth: '40%',
  },
  editNewValBg: {
    backgroundColor: '#DCFCE7',
  },
  editNewValText: {
    color: '#16A34A',
    fontSize: 12,
  },
  loadingIndicatorInline: {
    paddingVertical: 16,
  },
});

export default RepairLogsPage;
