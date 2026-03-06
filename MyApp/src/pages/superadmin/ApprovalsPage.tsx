import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl
} from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showAlert } from '../../components/GlobalAlert';
import { getBaseUrl } from '../SuperAdmin'; // We will export this from SuperAdmin or move to config

// If colors are not in constants, I'll use the ones from SuperAdmin
const themeColors = {
  primary: '#4F46E5',
  bg: '#F3F4F6',
  cardBg: '#FFFFFF',
  text: '#1F2937',
  subtext: '#6B7280',
  border: '#E5E7EB',
  success: '#10B981',
  danger: '#EF4444',
  warning: '#F59E0B',
};

type WaitingItem = {
  id: number;
  payment_id: number;
  house_number: string;
  installment_no: number;
  months_span: number;
  due_date: string;
  amount: number;
  status: 'waiting_approval';
  paid_at?: string;
  paid_method?: string;
  paid_note?: string;
  paid_by?: string;
};

interface ApprovalsPageProps {
  onBack: () => void;
  darkMode?: boolean;
}

const ApprovalsPage: React.FC<ApprovalsPageProps> = ({ onBack }) => {
  const [waitingList, setWaitingList] = useState<WaitingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const colors = themeColors; // Could be dynamic based on darkMode

  const fetchWaitingList = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${getBaseUrl()}/payment-installments/waiting-approval`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setWaitingList(data.data || []);
      }
    } catch (error) {
      console.log('Error fetching waiting list:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchWaitingList();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchWaitingList();
  };

  const handleApproveChange = async (item: WaitingItem) => {
    showAlert(
      'ยืนยันอนุมัติ',
      `ต้องการเปลี่ยนสถานะของบ้าน ${item.house_number} งวดที่ ${item.installment_no} เป็น "ค้างชำระ" ใช่หรือไม่?`,
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ยืนยัน',
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('token');
              const res = await fetch(`${getBaseUrl()}/payment-installments/${item.id}`, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ status: 'pending' }), // Approve -> pending (unpaid)
              });

              if (res.ok) {
                showAlert('สำเร็จ', 'อนุมัติการแก้ไขเรียบร้อย');
                fetchWaitingList();
              } else {
                showAlert('Error', 'ไม่สามารถทำรายการได้');
              }
            } catch (error) {
              showAlert('Error', 'เกิดข้อผิดพลาด');
            }
          },
        },
      ]
    );
  };

  const handleRejectChange = async (item: WaitingItem) => {
    showAlert(
      'ปฏิเสธคำขอ',
      `ต้องการปฏิเสธคำขอแก้ไขและคงสถานะเป็น "ชำระแล้ว" ใช่หรือไม่?`,
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ปฏิเสธ (คงเดิม)',
          style: 'destructive',
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('token');
              const res = await fetch(`${getBaseUrl()}/payment-installments/${item.id}`, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ status: 'paid' }), // Reject -> return to paid
              });

              if (res.ok) {
                showAlert('สำเร็จ', 'ปฏิเสธคำขอเรียบร้อย สถานะกลับเป็น "ชำระแล้ว"');
                fetchWaitingList();
              } else {
                showAlert('Error', 'ไม่สามารถทำรายการได้');
              }
            } catch (error) {
              showAlert('Error', 'เกิดข้อผิดพลาด');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>รายการตวจสอบ ({waitingList.length})</Text>
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={waitingList}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="checkmark-circle-outline" size={64} color={colors.subtext} />
              <Text style={[styles.emptyText, { color: colors.subtext }]}>ไม่มีรายการรอตรวจสอบ</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <View style={styles.cardHeader}>
                <View>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>บ้านเลขที่ {item.house_number}</Text>
                    <Text style={[styles.cardSubtitle, { color: colors.subtext }]}>
                        งวดที่ {item.installment_no} • {item.months_span} เดือน
                    </Text>
                </View>
                 <View style={styles.cardHeaderRight}>
                    <View style={styles.badgeWaiting}>
                    <Text style={styles.badgeWaitingText}>รออนุมัติ</Text>
                    </View>
                </View>
              </View>

              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.subtext }]}>ยอกชำระ:</Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>{item.amount.toLocaleString()} บาท</Text>
              </View>
              
               {!!item.paid_by && (
                <Text style={[styles.paidByText, { color: colors.primary }]}>
                    ขอแก้ไขโดย: {item.paid_by}
                </Text>
               )}

              <View style={styles.actions}>
                <TouchableOpacity 
                  style={[styles.actionBtn, { backgroundColor: colors.success }]}
                  onPress={() => handleApproveChange(item)}
                >
                  <Ionicons name="checkmark" size={16} color="#fff" />
                  <Text style={styles.actionBtnText}>อนุมัติ (เป็นค้างชำระ)</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.actionBtn, { backgroundColor: colors.danger }]}
                  onPress={() => handleRejectChange(item)}
                >
                  <Ionicons name="close" size={16} color="#fff" />
                  <Text style={styles.actionBtnText}>ปฏิเสธ (คงเดิม)</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
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
    padding: 16,
    borderBottomWidth: 1,
    gap: 16,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 12,
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
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    justifyContent: 'flex-end',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
    flex: 1,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  cardSubtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  cardHeaderRight: {
    alignItems: 'flex-end',
  },
  badgeWaiting: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeWaitingText: {
    color: '#6366F1',
    fontSize: 12,
    fontWeight: '600',
  },
  infoLabel: {
    fontSize: 14,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  paidByText: {
    fontSize: 12,
    marginTop: 8,
  },
});

export default ApprovalsPage;
