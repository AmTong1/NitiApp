import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl
} from 'react-native';
import { widthPercentageToDP as wp, heightPercentageToDP as hp } from 'react-native-responsive-screen';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBaseUrl } from '../SuperAdmin';
import { showAlert } from '../../components/GlobalAlert';
import { formatThaiDateTime } from '../../lib/datetime';

const themeColors = {
    primary: '#4F46E5',
    bg: '#F3F4F6',
    cardBg: '#FFFFFF',
    text: '#1F2937',
    subtext: '#6B7280',
    border: '#E5E7EB',
    warning: '#F59E0B',
    success: '#10B981',
    danger: '#EF4444',
};

type VisibilityLog = {
  id: number;
  action: 'show' | 'hide';
  status: 'approved' | 'waiting_approval' | 'rejected';
  created_at: string;
  approved_at: string | null;
  requested_by_username: string;
  requested_by_name: string;
  approved_by_username: string;
  approved_by_name: string;
};

interface FinancialVisibilityLogsPageProps {
  onBack: () => void;
  darkMode?: boolean;
}

const FinancialVisibilityLogsPage: React.FC<FinancialVisibilityLogsPageProps> = ({ onBack }) => {
  const [logs, setLogs] = useState<VisibilityLog[]>([]);
  const [summary, setSummary] = useState({ total_income: 0, total_expense: 0, balance: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const colors = themeColors;

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('token');
      // Fetch summary
      const sumRes = await fetch(`${getBaseUrl()}/financial/summary?filter=all`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (sumRes.ok) {
        const sumData = await sumRes.json();
        if (sumData.ok) {
          setSummary({
            total_income: sumData.data?.total_income || 0,
            total_expense: sumData.data?.total_expense || 0,
            balance: sumData.data?.balance || 0,
          });
        }
      }

      const res = await fetch(`${getBaseUrl()}/financial/visibility/logs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setLogs(Array.isArray(data.data) ? data.data : []);
      }
    } catch (error) {
      console.log('Error fetching visibility logs:', error);
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

  const renderLog = ({ item }: { item: VisibilityLog }) => (
    <View style={[styles.logCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
      <View style={styles.logHeader}>
        <Text style={[styles.logActionText, { color: item.action === 'show' ? colors.success : colors.danger }]}>
          {item.action === 'show' ? 'ขอเปิดให้เห็นยอด' : 'ขอซ่อนยอด'}
        </Text>
        <Text style={[styles.logDate, { color: colors.subtext }]}>{formatThaiDateTime(item.created_at)}</Text>
      </View>
      
      <Text style={[styles.requestedByText, { color: colors.text }]}>
        โดย: {item.requested_by_name || item.requested_by_username || 'Unknown'}
      </Text>
      
      {item.status === 'waiting_approval' ? (
        <View style={styles.approvalActionRow}>
          <Text style={[styles.statusWaitingText, { color: colors.warning }]}>สถานะ: รออนุมัติ</Text>
        </View>
      ) : (
        <Text style={[styles.statusFinalText, { color: item.status === 'approved' ? colors.success : colors.danger }]}>
          สถานะ: {item.status === 'approved' ? 'อนุมัติแล้ว' : 'ถูกปฏิเสธ'}
          {item.approved_by_name || item.approved_by_username ? ` โดย ${item.approved_by_name || item.approved_by_username}` : ''}
        </Text>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>ประวัติเปิด/ปิดยอดเงิน ({logs.length})</Text>
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderLog}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListHeaderComponent={
            <View style={styles.summaryContainer}>
              <Text style={styles.summaryHeaderTitle}>ยอดรวมทั้งหมด (ก่อนอนุมัติให้ลูกบ้านเห็น)</Text>
              <View style={styles.summaryRow}>
                <View style={[styles.summaryCard, styles.summaryCardInc]}>
                  <Text style={styles.summaryTitleInc}>รายรับรวม</Text>
                  <Text style={styles.summaryValueInc}>
                    ฿{Number(summary.total_income).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </Text>
                </View>
                <View style={[styles.summaryCard, styles.summaryCardExp]}>
                  <Text style={styles.summaryTitleExp}>รายจ่ายรวม</Text>
                  <Text style={styles.summaryValueExp}>
                    ฿{Number(summary.total_expense).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </Text>
                </View>
              </View>
              <View style={[styles.balanceCard, styles.balanceCardBg]}>
                <Text style={styles.balanceTitle}>ยอดคงเหลือ</Text>
                <Text style={styles.balanceValue}>
                  ฿{Number(summary.balance).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                </Text>
              </View>
              <Text style={styles.logsListTitle}>ประวัติคำขอ</Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="eye-off-outline" size={64} color={colors.subtext} />
              <Text style={[styles.emptyText, { color: colors.subtext }]}>
                ไม่มีประวัติ
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
  logActionText: {
    fontSize: wp('4%'),
    fontWeight: '700',
  },
  logDate: {
    fontSize: wp('3%'),
  },
  requestedByText: {
    fontSize: wp('3.5%'),
    marginBottom: hp('1%'),
  },
  approvalActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: hp('1%'),
    paddingTop: hp('1%'),
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  statusWaitingText: {
    fontSize: wp('3.5%'),
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: wp('2%'),
  },
  actionBtn: {
    paddingHorizontal: wp('4%'),
    paddingVertical: hp('1%'),
    borderRadius: wp('2%'),
  },
  actionBtnText: {
    color: '#fff',
    fontSize: wp('3%'),
    fontWeight: '600',
  },
  statusFinalText: {
    fontSize: wp('3.5%'),
    fontWeight: '600',
    marginTop: hp('1%'),
  },
  summaryContainer: {
    marginBottom: hp('2%'),
  },
  summaryHeaderTitle: {
    fontSize: wp('4%'),
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: hp('1%'),
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: hp('1.5%'),
  },
  summaryCard: {
    flex: 0.48,
    padding: wp('4%'),
    borderRadius: wp('3%'),
  },
  summaryCardInc: {
    backgroundColor: '#ECFDF5',
  },
  summaryTitleInc: {
    color: '#047857',
    fontSize: wp('3.5%'),
  },
  summaryValueInc: {
    color: '#065F46',
    fontSize: wp('4.5%'),
    fontWeight: 'bold',
    marginTop: hp('0.5%'),
  },
  summaryCardExp: {
    backgroundColor: '#FEF2F2',
  },
  summaryTitleExp: {
    color: '#B91C1C',
    fontSize: wp('3.5%'),
  },
  summaryValueExp: {
    color: '#991B1B',
    fontSize: wp('4.5%'),
    fontWeight: 'bold',
    marginTop: hp('0.5%'),
  },
  balanceCard: {
    padding: wp('5%'),
    borderRadius: wp('3%'),
    marginBottom: hp('2%'),
    alignItems: 'center',
  },
  balanceCardBg: {
    backgroundColor: '#EFF6FF',
  },
  balanceTitle: {
    color: '#1D4ED8',
    fontSize: wp('4%'),
    fontWeight: 'bold',
  },
  balanceValue: {
    color: '#1E3A8A',
    fontSize: wp('7%'),
    fontWeight: 'bold',
    marginTop: hp('0.5%'),
  },
  logsListTitle: {
    fontSize: wp('4.5%'),
    fontWeight: '700',
    color: '#1F2937',
    marginTop: hp('1%'),
    marginBottom: hp('1%'),
  },
});

export default FinancialVisibilityLogsPage;
