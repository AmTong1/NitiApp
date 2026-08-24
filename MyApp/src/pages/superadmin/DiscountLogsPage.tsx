import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, FlatList, Platform, RefreshControl
} from 'react-native';
import { widthPercentageToDP as wp, heightPercentageToDP as hp } from 'react-native-responsive-screen';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBaseUrl } from '../SuperAdmin';

const colors = {
  primary: '#4F46E5', bg: '#F3F4F6', cardBg: '#FFFFFF',
  text: '#1F2937', subtext: '#6B7280', border: '#E5E7EB',
};

const cycleLabels: Record<number, string> = { 3: 'ราย 3 เดือน', 6: 'ราย 6 เดือน', 12: 'รายปี' };
const cycleColors: Record<number, string> = { 3: '#0EA5E9', 6: '#8B5CF6', 12: '#F59E0B' };
const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  approved: { bg: '#D1FAE5', text: '#065F46', label: 'อนุมัติแล้ว' },
  waiting_approval: { bg: '#FEF3C7', text: '#92400E', label: 'รออนุมัติ' },
  rejected: { bg: '#FEE2E2', text: '#991B1B', label: 'ถูกปฏิเสธ' },
};
const actionLabels: Record<string, { icon: string; label: string; color: string }> = {
  create: { icon: 'add-circle', label: 'สร้าง', color: '#10B981' },
  update: { icon: 'pencil', label: 'แก้ไข', color: '#3B82F6' },
  delete: { icon: 'trash', label: 'ลบ', color: '#EF4444' },
};

interface Props { onBack: () => void; darkMode?: boolean; }

const DiscountLogsPage: React.FC<Props> = ({ onBack }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<any[]>([]);

  const fetchLogs = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${getBaseUrl()}/discount/requests`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setData(Array.isArray(json.data) ? json.data : []);
      }
    } catch (e) { console.log('fetchDiscountLogs error:', e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const formatDate = (d: string) => {
    if (!d) return '-';
    const date = new Date(d);
    return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const renderItem = ({ item }: { item: any }) => {
    const action = actionLabels[item.action] || actionLabels.create;
    const status = statusColors[item.status] || statusColors.waiting_approval;
    return (
      <View style={[s.card, { borderLeftColor: action.color }]}>
        <View style={s.cardHeader}>
          <View style={[s.actionBadge, { backgroundColor: action.color + '18' }]}>
            <Ionicons name={action.icon as any} size={14} color={action.color} />
            <Text style={[s.actionText, { color: action.color }]}>{action.label}</Text>
          </View>
          <View style={[s.statusBadge, { backgroundColor: status.bg }]}>
            <Text style={[s.statusText, { color: status.text }]}>{status.label}</Text>
          </View>
        </View>
        <View style={s.cardBody}>
          <View style={[s.cyclePill, { backgroundColor: (cycleColors[item.cycle_months] || '#6B7280') + '15' }]}>
            <Ionicons name="calendar" size={14} color={cycleColors[item.cycle_months] || '#6B7280'} />
            <Text style={[s.cycleText, { color: cycleColors[item.cycle_months] || '#6B7280' }]}>{cycleLabels[item.cycle_months] || `${item.cycle_months} เดือน`}</Text>
          </View>
          {item.action !== 'delete' && item.discount_value != null && (
            <Text style={s.valueText}>
              → ลด {item.discount_value}{item.discount_type === 'percentage' ? '%' : ' บาท'}
            </Text>
          )}
          {item.old_discount_value != null && item.action === 'update' && (
            <Text style={s.oldValue}>
              (เดิม: {item.old_discount_value}{item.old_discount_type === 'percentage' ? '%' : ' บาท'})
            </Text>
          )}
        </View>
        <View style={s.cardFooter}>
          <View style={s.footerItem}>
            <Ionicons name="person-outline" size={12} color={colors.subtext} />
            <Text style={s.footerText}>{item.requested_by_name || '-'}</Text>
          </View>
          <View style={s.footerItem}>
            <Ionicons name="time-outline" size={12} color={colors.subtext} />
            <Text style={s.footerText}>{formatDate(item.created_at)}</Text>
          </View>
        </View>
        {item.status === 'approved' && item.approved_by_name && (
          <View style={s.approvedRow}>
            <Ionicons name="checkmark-circle" size={12} color="#065F46" />
            <Text style={s.approvedText}>อนุมัติโดย {item.approved_by_name} — {formatDate(item.approved_at)}</Text>
          </View>
        )}
        {item.status === 'rejected' && item.reject_reason && (
          <View style={s.rejectedRow}>
            <Ionicons name="close-circle" size={12} color="#991B1B" />
            <Text style={s.rejectedText}>เหตุผล: {item.reject_reason}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      <View style={[s.header, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} style={s.backBtn}>
          <Ionicons name="arrow-back" size={wp('6%')} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]}>ประวัติส่วนลด</Text>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={s.listContent}
          ListEmptyComponent={
            <View style={s.emptyBox}>
              <Ionicons name="document-text-outline" size={48} color={colors.subtext} />
              <Text style={[s.emptyText, { color: colors.subtext }]}>ยังไม่มีประวัติส่วนลด</Text>
            </View>
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchLogs(); }} colors={[colors.primary]} />}
        />
      )}
    </View>
  );
};

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: wp('4%'), paddingTop: Platform.OS === 'android' ? wp('4%') : hp('7%'), borderBottomWidth: 1, gap: wp('4%') },
  backBtn: { padding: wp('1%') },
  headerTitle: { fontSize: wp('5%'), fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: wp('4%'), paddingBottom: hp('10%') },
  card: { backgroundColor: '#fff', borderRadius: wp('4%'), padding: wp('4%'), marginBottom: hp('1.2%'), borderLeftWidth: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: hp('1%') },
  actionBadge: { flexDirection: 'row', alignItems: 'center', gap: wp('1%'), paddingHorizontal: wp('2.5%'), paddingVertical: hp('0.4%'), borderRadius: wp('2%') },
  actionText: { fontSize: wp('3.2%'), fontWeight: '700' },
  statusBadge: { paddingHorizontal: wp('2.5%'), paddingVertical: hp('0.4%'), borderRadius: wp('2%') },
  statusText: { fontSize: wp('3%'), fontWeight: '600' },
  cardBody: { flexDirection: 'row', alignItems: 'center', gap: wp('2.5%'), flexWrap: 'wrap', marginBottom: hp('1%') },
  cyclePill: { flexDirection: 'row', alignItems: 'center', gap: wp('1%'), paddingHorizontal: wp('2.5%'), paddingVertical: hp('0.5%'), borderRadius: wp('3%') },
  cycleText: { fontSize: wp('3.3%'), fontWeight: '600' },
  valueText: { fontSize: wp('4%'), fontWeight: '700', color: '#1F2937' },
  oldValue: { fontSize: wp('3%'), color: '#9CA3AF' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: hp('0.8%') },
  footerItem: { flexDirection: 'row', alignItems: 'center', gap: wp('1%') },
  footerText: { fontSize: wp('2.8%'), color: '#9CA3AF' },
  approvedRow: { flexDirection: 'row', alignItems: 'center', gap: wp('1%'), marginTop: hp('0.5%') },
  approvedText: { fontSize: wp('2.8%'), color: '#065F46' },
  rejectedRow: { flexDirection: 'row', alignItems: 'center', gap: wp('1%'), marginTop: hp('0.5%') },
  rejectedText: { fontSize: wp('2.8%'), color: '#991B1B' },
  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: hp('10%') },
  emptyText: { fontSize: wp('4%'), fontWeight: '600', marginTop: hp('1%') },
});

export default DiscountLogsPage;
