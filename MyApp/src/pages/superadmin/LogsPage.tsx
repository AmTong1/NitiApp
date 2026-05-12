import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, RefreshControl, ActivityIndicator
} from 'react-native';
import { widthPercentageToDP as wp, heightPercentageToDP as hp } from 'react-native-responsive-screen';
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
};

type DeleteLog = {
  id: number;
  repair_id: number;
  repair_title: string;
  repair_detail?: string;
  repair_house_number?: string;
  repair_status: string;
  deleted_by: number;
  delete_reason?: string;
  deleted_at: string;
  deleted_by_username: string;
  deleted_by_fullname?: string;
  deleted_by_role: string;
  deleted_by_house_number?: string;
  deleted_by_display: string;
  deleted_by_name: string;
};

interface LogsPageProps {
  onBack: () => void;
  darkMode?: boolean;
}

const LogsPage: React.FC<LogsPageProps> = ({ onBack }) => {
  const [deleteLogs, setDeleteLogs] = useState<DeleteLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  const colors = themeColors;

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${getBaseUrl()}/repairs/delete-logs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setDeleteLogs(Array.isArray(data) ? data : (data.data || []));
      }
    } catch (error) {
      console.log('Error fetching logs:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLogs();
  };

  const filteredLogs = useMemo(() => {
    let logs = [...deleteLogs];
    
    // Filter
    if (searchText) {
      const lower = searchText.toLowerCase();
      logs = logs.filter(l => 
        String(l.repair_id).includes(searchText) ||
        (l.deleted_by_name || '').toLowerCase().includes(lower) ||
        (l.repair_house_number || '').toLowerCase().includes(lower) ||
        (l.delete_reason || '').toLowerCase().includes(lower)
      );
    }
    
    // Sort
    logs.sort((a, b) => {
      const dateA = toSortableMs(a.deleted_at);
      const dateB = toSortableMs(b.deleted_at);
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });
    
    return logs;
  }, [deleteLogs, searchText, sortOrder]);

  const renderDeleteLog = ({ item }: { item: DeleteLog }) => (
    <View style={[styles.logCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
      <View style={styles.logHeader}>
        <View style={styles.logIdBadge}>
          <Text style={styles.logIdText}>#{item.repair_id}</Text>
        </View>
        <Text style={[styles.logDate, { color: colors.subtext }]}>{formatThaiDateTime(item.deleted_at)}</Text>
      </View>
      
      <Text style={[styles.logTitle, { color: colors.text }]}>{item.repair_title}</Text>
      
      <View style={styles.logInfoRow}>
        <Ionicons name="home-outline" size={14} color={colors.subtext} />
        <Text style={[styles.logInfoText, { color: colors.subtext }]}>
          บ้านเลขที่: {item.repair_house_number || '-'}
        </Text>
      </View>
      
      <View style={[styles.deletedByBox, { backgroundColor: colors.bg }]}>
        <Text style={[styles.deletedByLabel, { color: colors.subtext }]}>ลบโดย:</Text> 
        <View style={styles.deletedByRow}>
          <Ionicons name="person-circle-outline" size={20} color={colors.text} />
          <Text style={[styles.deletedByName, { color: colors.text }]}>
            {item.deleted_by_name || item.deleted_by_display || 'Unknown'}
          </Text>
          <View style={[
            styles.roleBadge, 
            item.deleted_by_role === 'superadmin' ? styles.roleBadgeWarning : styles.roleBadgePrimary
          ]}>
             <Text style={styles.roleBadgeText}>
                {item.deleted_by_role}
             </Text>
          </View>
        </View>
      </View>
      
      {item.delete_reason && (
        <View style={[styles.reasonBox, { borderColor: colors.border }]}>
          <Text style={[styles.reasonLabel, { color: colors.warning }]}>
            <Ionicons name="chatbubble-outline" size={12} /> หมายเหตุ:
          </Text>
          <Text style={[styles.reasonText, { color: colors.text }]}>{item.delete_reason}</Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>ประวัติการลบ ({deleteLogs.length})</Text>
      </View>

      {/* Search & Filter */}
      <View style={[styles.searchContainer, { backgroundColor: colors.cardBg, borderBottomColor: colors.border }]}>
          <View style={[styles.searchInputWrapper, { backgroundColor: colors.bg, borderColor: colors.border }]}>
            <Ionicons name="search" size={18} color={colors.subtext} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="ค้นหา..."
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
          <View style={styles.sortButtons}>
            <TouchableOpacity
              style={[
                styles.sortBtn,
                sortOrder === 'newest' ? styles.sortBtnActive : { backgroundColor: colors.bg },
                { borderColor: colors.border }
              ]}
              onPress={() => setSortOrder('newest')}
            >
              <Ionicons name="arrow-down" size={14} color={sortOrder === 'newest' ? '#fff' : colors.subtext} />
              <Text style={[styles.sortBtnText, sortOrder === 'newest' ? styles.sortBtnTextActive : { color: colors.subtext }]}>ล่าสุด</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.sortBtn,
                sortOrder === 'oldest' ? styles.sortBtnActive : { backgroundColor: colors.bg },
                { borderColor: colors.border }
              ]}
              onPress={() => setSortOrder('oldest')}
            >
              <Ionicons name="arrow-up" size={14} color={sortOrder === 'oldest' ? '#fff' : colors.subtext} />
              <Text style={[styles.sortBtnText, sortOrder === 'oldest' ? styles.sortBtnTextActive : { color: colors.subtext }]}>เก่าสุด</Text>
            </TouchableOpacity>
          </View>
            {searchText.length > 0 && (
            <Text style={[styles.resultCount, { color: colors.subtext }]}>
              พบ {filteredLogs.length} รายการ
            </Text>
          )}
        </View>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredLogs}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderDeleteLog}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={64} color={colors.subtext} />
              <Text style={[styles.emptyText, { color: colors.subtext }]}>
                {searchText.length > 0 ? 'ไม่พบรายการที่ค้นหา' : 'ไม่มีประวัติการลบ'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
   header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: wp('4%'),
    borderBottomWidth: 1,
    gap: wp('4%'),
  },
  backBtn: {
    padding: wp('1%'),
  },
  headerTitle: {
    fontSize: wp('5%'),
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: wp('4%'),
    paddingBottom: hp('12.5%'),
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: hp('12.5%'),
  },
  emptyText: {
    fontSize: wp('4%'),
    marginTop: hp('1.5%'),
  },
  logCard: {
    borderRadius: wp('3%'),
    borderWidth: 1,
    padding: wp('4%'),
    marginBottom: hp('1.5%'),
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: hp('1%'),
  },
  logIdBadge: {
    backgroundColor: '#EF4444',
    paddingHorizontal: wp('2.5%'),
    paddingVertical: hp('0.5%'),
    borderRadius: wp('3%'),
  },
  logIdText: {
    color: '#fff',
    fontSize: wp('3%'),
    fontWeight: '700',
  },
  logDate: {
    fontSize: wp('3%'),
  },
  logTitle: {
    fontSize: wp('4%'),
    fontWeight: '600',
    marginBottom: hp('1%'),
  },
  logInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp('1.5%'),
    marginBottom: hp('0.5%'),
  },
  logInfoText: {
    fontSize: wp('3.2%'),
  },
  deletedByBox: {
    padding: wp('2.5%'),
    borderRadius: wp('2%'),
    marginTop: hp('1%'),
  },
  roleBadge: {
    paddingHorizontal: wp('2%'),
    paddingVertical: hp('0.25%'),
    borderRadius: wp('2.5%'),
    marginLeft: wp('2%'),
  },
  roleBadgeText: {
    color: '#fff',
    fontSize: wp('2.7%'),
    fontWeight: '600',
  },
  reasonBox: {
    marginTop: hp('1.5%'),
    paddingTop: hp('1.5%'),
    borderTopWidth: 1,
  },
  reasonLabel: {
    fontSize: wp('3%'),
    fontWeight: '600',
    marginBottom: hp('0.5%'),
  },
  reasonText: {
    fontSize: wp('3.5%'),
  },
  // Search
  searchContainer: {
    paddingHorizontal: wp('4%'),
    paddingVertical: hp('1.7%'),
    borderBottomWidth: 1,
    gap: hp('1.5%'),
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: wp('3%'),
    paddingHorizontal: wp('3.5%'),
    paddingVertical: hp('1.3%'),
    gap: wp('2.5%'),
  },
  searchInput: {
    flex: 1,
    fontSize: wp('3.7%'),
    paddingVertical: 0,
  },
  sortButtons: {
    flexDirection: 'row',
    gap: wp('2.5%'),
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: wp('3.5%'),
    paddingVertical: hp('1%'),
    borderRadius: wp('5%'),
    borderWidth: 1,
    gap: wp('1.3%'),
  },
  sortBtnText: {
    fontSize: wp('3.2%'),
    fontWeight: '600',
  },
  resultCount: {
    fontSize: wp('3.2%'),
    fontWeight: '500',
  },
  deletedByLabel: {
    fontSize: wp('3%'),
  },
  deletedByRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: hp('0.5%'),
  },
  deletedByName: {
    marginLeft: wp('1.5%'),
    fontWeight: '600',
  },
  roleBadgeWarning: {
    backgroundColor: '#F59E0B',
  },
  roleBadgePrimary: {
    backgroundColor: '#6366F1',
  },
  sortBtnActive: {
    backgroundColor: '#4F46E5',
  },
  sortBtnTextActive: {
    color: '#fff',
  },
});

export default LogsPage;
