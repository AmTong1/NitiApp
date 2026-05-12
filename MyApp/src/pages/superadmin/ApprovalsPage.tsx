import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal
} from 'react-native';
import { widthPercentageToDP as wp, heightPercentageToDP as hp } from 'react-native-responsive-screen';
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

type ConfirmMode = 'approve' | 'reject';

type FinancialItem = {
  id: number;
  type: 'income' | 'expense';
  amount: number;
  title: string;
  description: string;
  date: string;
  status: 'waiting_add' | 'waiting_delete';
  creator_name?: string;
  source: string;
};

type VisibilityItem = {
  id: number;
  action: 'show' | 'hide';
  status: 'waiting_approval';
  requested_by_name: string;
  requested_by_username: string;
  created_at: string;
};

interface ApprovalsPageProps {
  onBack: () => void;
  darkMode?: boolean;
}

const ApprovalsPage: React.FC<ApprovalsPageProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<'payments' | 'financial' | 'visibility'>('payments');
  const [waitingList, setWaitingList] = useState<WaitingItem[]>([]);
  const [finWaitingList, setFinWaitingList] = useState<FinancialItem[]>([]);
  const [visWaitingList, setVisWaitingList] = useState<VisibilityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [confirmItem, setConfirmItem] = useState<WaitingItem | FinancialItem | VisibilityItem | null>(null);
  const [confirmMode, setConfirmMode] = useState<ConfirmMode | null>(null);
  const [confirmType, setConfirmType] = useState<'payment' | 'financial' | 'visibility' | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const colors = themeColors; // Could be dynamic based on darkMode

  const fetchWaitingLists = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('token');
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      
      const [resPay, resFin, resVis] = await Promise.all([
        fetch(`${getBaseUrl()}/payment-installments/waiting-approval`, { headers }),
        fetch(`${getBaseUrl()}/financial/waiting-approval`, { headers }),
        fetch(`${getBaseUrl()}/financial/visibility/logs`, { headers })
      ]);

      if (resPay.ok) {
        const data = await resPay.json();
        setWaitingList(Array.isArray(data.data) ? data.data : []);
      }
      
      if (resFin.ok) {
        const data = await resFin.json();
        setFinWaitingList(Array.isArray(data.data) ? data.data : []);
      }

      if (resVis.ok) {
        const data = await resVis.json();
        setVisWaitingList(Array.isArray(data.data) ? data.data.filter((i: any) => i.status === 'waiting_approval') : []);
      }
    } catch (error) {
      console.log('Error fetching waiting list:', error);
      showAlert('ผิดพลาด', 'เกิดข้อผิดพลาดในการโหลดรายการรอตรวจสอบ');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchWaitingLists();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchWaitingLists();
  };

  const handleApproveChange = (item: WaitingItem | FinancialItem | VisibilityItem, type: 'payment' | 'financial' | 'visibility') => {
    setConfirmItem(item);
    setConfirmType(type);
    setConfirmMode('approve');
  };

  const handleRejectChange = (item: WaitingItem | FinancialItem | VisibilityItem, type: 'payment' | 'financial' | 'visibility') => {
    setConfirmItem(item);
    setConfirmType(type);
    setConfirmMode('reject');
  };

  const closeConfirm = () => {
    if (confirmLoading) return;
    setConfirmItem(null);
    setConfirmMode(null);
    setConfirmType(null);
  };

  const getTransition = (mode: ConfirmMode, type: 'payment' | 'financial' | 'visibility', item?: WaitingItem | FinancialItem | VisibilityItem | null) => {
    if (type === 'payment') {
      if (mode === 'approve') {
        return {
          from: 'ชำระแล้ว', to: 'ค้างชำระ', nextStatus: 'pending', successMessage: 'เปลี่ยนสถานะจาก "ชำระแล้ว" เป็น "ค้างชำระ" เรียบร้อย',
        };
      }
      return {
        from: 'รออนุมัติ', to: 'ชำระแล้ว', nextStatus: 'paid', successMessage: 'เปลี่ยนสถานะจาก "รออนุมัติ" กลับเป็น "ชำระแล้ว" เรียบร้อย',
      };
    } else if (type === 'financial') {
      const isAdd = (item as FinancialItem)?.status === 'waiting_add';
      if (mode === 'approve') {
        return {
          from: 'รออนุมัติ', to: isAdd ? 'เพิ่มรายการ' : 'ลบรายการ', nextStatus: 'approved', successMessage: isAdd ? 'อนุมัติการเพิ่มรายการแล้ว' : 'อนุมัติการลบรายการแล้ว',
        };
      }
      return {
        from: 'รออนุมัติ', to: 'ปฏิเสธ', nextStatus: 'rejected', successMessage: 'ปฏิเสธคำขอแล้ว',
      };
    } else {
      const isShow = (item as VisibilityItem)?.action === 'show';
      if (mode === 'approve') {
        return {
          from: 'รออนุมัติ', to: isShow ? 'เปิดแสดงผล' : 'ซ่อนการแสดงผล', nextStatus: 'approved', successMessage: 'อนุมัติคำขอแล้ว',
        };
      }
      return {
        from: 'รออนุมัติ', to: 'ปฏิเสธ', nextStatus: 'rejected', successMessage: 'ปฏิเสธคำขอแล้ว',
      };
    }
  };

  const getConfirmCopy = (mode: ConfirmMode) => {
    if (mode === 'approve') {
      return {
        title: 'ยืนยันอนุมัติ', desc: 'ต้องการอนุมัติรายการนี้หรือไม่?', submit: 'อนุมัติ', loading: 'กำลังอนุมัติ',
      };
    }
    return {
      title: 'ยืนยันปฏิเสธ', desc: 'ต้องการปฏิเสธรายการนี้หรือไม่?', submit: 'ปฏิเสธ', loading: 'กำลังปฏิเสธ',
    };
  };

  const submitConfirmChange = async () => {
    if (!confirmItem || !confirmMode || !confirmType) return;
    const transition = getTransition(confirmMode, confirmType, confirmItem);
    try {
      setConfirmLoading(true);
      const token = await AsyncStorage.getItem('token');
      
      const endpoint = confirmType === 'payment' 
        ? `${getBaseUrl()}/payment-installments/${confirmItem.id}`
        : confirmType === 'financial'
        ? `${getBaseUrl()}/financial/records/${confirmItem.id}/status`
        : `${getBaseUrl()}/financial/visibility/requests/${confirmItem.id}/status`;
        
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status: transition.nextStatus }),
      });

      if (!res.ok) {
        showAlert('Error', 'ไม่สามารถทำรายการได้');
        return;
      }

      closeConfirm();
      showAlert('สำเร็จ', transition.successMessage);
      fetchWaitingLists();
    } catch (error) {
      showAlert('Error', 'เกิดข้อผิดพลาด');
    } finally {
      setConfirmLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>รายการตรวจสอบ ({waitingList.length + finWaitingList.length + visWaitingList.length})</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tabBtn, activeTab === 'payments' && styles.tabBtnActive]} 
          onPress={() => setActiveTab('payments')}
        >
          <Text style={[styles.tabText, activeTab === 'payments' && styles.tabTextActive]}>
            ส่วนกลาง ({waitingList.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabBtn, activeTab === 'financial' && styles.tabBtnActive]} 
          onPress={() => setActiveTab('financial')}
        >
          <Text style={[styles.tabText, activeTab === 'financial' && styles.tabTextActive]}>
            บัญชี ({finWaitingList.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabBtn, activeTab === 'visibility' && styles.tabBtnActive]} 
          onPress={() => setActiveTab('visibility')}
        >
          <Text style={[styles.tabText, activeTab === 'visibility' && styles.tabTextActive]}>
            ยอดเงิน ({visWaitingList.length})
          </Text>
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList<any>
          data={activeTab === 'payments' ? waitingList : activeTab === 'financial' ? finWaitingList : visWaitingList}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="checkmark-circle-outline" size={64} color={colors.subtext} />
              <Text style={[styles.emptyText, { color: colors.subtext }]}>ไม่มีรายการรอตรวจสอบ</Text>
            </View>
          }
          renderItem={({ item }) => {
            if (activeTab === 'payments') {
              const payItem = item as WaitingItem;
              return (
                <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                  <View style={styles.cardHeader}>
                    <View>
                        <Text style={[styles.cardTitle, { color: colors.text }]}>บ้านเลขที่ {payItem.house_number}</Text>
                        <Text style={[styles.cardSubtitle, { color: colors.subtext }]}>
                            งวดที่ {payItem.installment_no} • {payItem.months_span} เดือน
                        </Text>
                    </View>
                     <View style={styles.cardHeaderRight}>
                        <View style={styles.badgeWaiting}>
                        <Text style={styles.badgeWaitingText}>รออนุมัติ</Text>
                        </View>
                    </View>
                  </View>

                  <View style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { color: colors.subtext }]}>ยอดชำระ:</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>{payItem.amount.toLocaleString()} บาท</Text>
                  </View>
                  
                   {!!payItem.paid_by && (
                    <Text style={[styles.paidByText, { color: colors.primary }]}>
                        ขอแก้ไขโดย: {payItem.paid_by}
                    </Text>
                   )}

                  <Text style={[styles.statusFlowText, { color: colors.subtext }]}>
                    คำขอแก้ไขสถานะ: ชำระแล้ว เป็น ค้างชำระ
                  </Text>

                  <View style={styles.actions}>
                    <TouchableOpacity 
                      style={[styles.actionBtn, { backgroundColor: colors.success }]}
                      onPress={() => handleApproveChange(payItem, 'payment')}
                    >
                      <Ionicons name="checkmark" size={16} color="#fff" />
                      <Text style={styles.actionBtnText}>อนุมัติ</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={[styles.actionBtn, { backgroundColor: colors.danger }]}
                      onPress={() => handleRejectChange(payItem, 'payment')}
                    >
                      <Ionicons name="close" size={16} color="#fff" />
                      <Text style={styles.actionBtnText}>ปฏิเสธ</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            } else if (activeTab === 'financial') {
              const finItem = item as FinancialItem;
              const isAdd = finItem.status === 'waiting_add';
              return (
                  <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                    <View style={styles.cardHeader}>
                      <View style={styles.finHeaderLeft}>
                          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>{finItem.title}</Text>
                        <Text style={[styles.cardSubtitle, { color: colors.subtext }]}>
                            {new Date(finItem.date).toLocaleDateString('th-TH')}
                        </Text>
                    </View>
                       <View style={styles.cardHeaderRight}>
                          <View style={[styles.badgeWaiting, isAdd ? styles.badgeWaitingAdd : styles.badgeWaitingDelete]}>
                          <Text style={[styles.badgeWaitingText, isAdd ? styles.badgeTextAdd : styles.badgeTextDelete]}>
                            {isAdd ? 'คำขอเพิ่มรายจ่าย' : 'คำขอลบรายการ'}
                          </Text>
                          </View>
                      </View>
                  </View>

                  <View style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { color: colors.subtext }]}>จำนวนเงิน:</Text>
                    <Text style={[styles.infoValue, finItem.type === 'income' ? styles.colorIncome : styles.colorExpense]}>
                      {finItem.type === 'income' ? '+' : '-'}฿{Number(finItem.amount).toLocaleString()}
                    </Text>
                  </View>
                  
                   {!!finItem.creator_name && (
                    <Text style={[styles.paidByText, { color: colors.primary }]}>
                        บันทึกโดย: {finItem.creator_name}
                    </Text>
                   )}

                  <View style={styles.actions}>
                    <TouchableOpacity 
                      style={[styles.actionBtn, { backgroundColor: colors.success }]}
                      onPress={() => handleApproveChange(finItem, 'financial')}
                    >
                      <Ionicons name="checkmark" size={16} color="#fff" />
                      <Text style={styles.actionBtnText}>อนุมัติ</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={[styles.actionBtn, { backgroundColor: colors.danger }]}
                      onPress={() => handleRejectChange(finItem, 'financial')}
                    >
                      <Ionicons name="close" size={16} color="#fff" />
                      <Text style={styles.actionBtnText}>ปฏิเสธ</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            } else {
              const visItem = item as VisibilityItem;
              const isShow = visItem.action === 'show';
              return (
                <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                  <View style={styles.cardHeader}>
                    <View style={styles.finHeaderLeft}>
                        <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                          {isShow ? 'ขอเปิดการแสดงผลยอดเงิน' : 'ขอซ่อนการแสดงผลยอดเงิน'}
                        </Text>
                      <Text style={[styles.cardSubtitle, { color: colors.subtext }]}>
                          {new Date(visItem.created_at).toLocaleDateString('th-TH')}
                      </Text>
                    </View>
                    <View style={styles.cardHeaderRight}>
                        <View style={[styles.badgeWaiting, { backgroundColor: '#FEF3C7' }]}>
                        <Text style={[styles.badgeWaitingText, { color: '#D97706' }]}>
                          คำขอสิทธิ์
                        </Text>
                        </View>
                    </View>
                  </View>

                  <View style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { color: colors.subtext }]}>ขอเปลี่ยนเป็น:</Text>
                    <Text style={[styles.infoValue, isShow ? styles.colorIncome : styles.colorExpense]}>
                      {isShow ? 'เปิดให้ลูกบ้านเห็น' : 'ซ่อนจากลูกบ้าน'}
                    </Text>
                  </View>
                  
                  <Text style={[styles.paidByText, { color: colors.primary }]}>
                      ขอโดย: {visItem.requested_by_name || visItem.requested_by_username || 'Unknown'}
                  </Text>

                  <View style={styles.actions}>
                    <TouchableOpacity 
                      style={[styles.actionBtn, { backgroundColor: colors.success }]}
                      onPress={() => handleApproveChange(visItem, 'visibility')}
                    >
                      <Ionicons name="checkmark" size={16} color="#fff" />
                      <Text style={styles.actionBtnText}>อนุมัติ</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={[styles.actionBtn, { backgroundColor: colors.danger }]}
                      onPress={() => handleRejectChange(visItem, 'visibility')}
                    >
                      <Ionicons name="close" size={16} color="#fff" />
                      <Text style={styles.actionBtnText}>ปฏิเสธ</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }
          }}
        />
      )}

      <Modal
        visible={!!confirmItem && !!confirmMode}
        transparent
        animationType="fade"
        onRequestClose={closeConfirm}
      >
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmIconCircle}>
              <Ionicons name="swap-horizontal" size={28} color="#FFFFFF" />
            </View>

            <Text style={styles.confirmTitle}>
              {confirmMode ? getConfirmCopy(confirmMode).title : 'ยืนยันรายการ'}
            </Text>

            <View style={styles.confirmFlowRow}>
              <View style={styles.flowChipGray}>
                <Text style={styles.flowChipGrayText}>{confirmMode && confirmType ? getTransition(confirmMode, confirmType, confirmItem).from : '-'}</Text>
              </View>
              <Ionicons name="arrow-forward" size={18} color="#6B7280" />
              <View style={styles.flowChipBlue}>
                <Text style={styles.flowChipBlueText}>{confirmMode && confirmType ? getTransition(confirmMode, confirmType, confirmItem).to : '-'}</Text>
              </View>
            </View>

            <Text style={styles.confirmDesc}>
              {confirmMode ? getConfirmCopy(confirmMode).desc : 'ต้องการยืนยันรายการหรือไม่?'}
            </Text>

            <View style={styles.confirmActionRow}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={closeConfirm}
                disabled={confirmLoading}
              >
                <Text style={styles.confirmCancelText}>ยกเลิก</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmSubmitBtn}
                onPress={submitConfirmChange}
                disabled={confirmLoading}
              >
                {confirmLoading ? (
                  <Text style={styles.confirmSubmitText}>
                    {confirmMode ? getConfirmCopy(confirmMode).loading : 'กำลังดำเนินการ'}
                  </Text>
                ) : (
                  <View style={styles.confirmSubmitRow}>
                    <Ionicons name="checkmark" size={16} color="#fff" />
                    <Text style={styles.confirmSubmitText}>
                      {confirmMode ? getConfirmCopy(confirmMode).submit : 'ยืนยัน'}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
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
    padding: wp('4%'),
    borderBottomWidth: 1,
    gap: wp('4%'),
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: hp('1.5%'),
    alignItems: 'center',
    borderBottomWidth: 2,
    borderColor: 'transparent',
  },
  tabBtnActive: {
    borderColor: '#4F46E5',
  },
  tabText: {
    fontSize: wp('3.5%'),
    color: '#6B7280',
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#4F46E5',
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
  card: {
    borderRadius: wp('3%'),
    borderWidth: 1,
    padding: wp('4%'),
    marginBottom: hp('1.5%'),
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: hp('1.5%'),
  },
  cardTitle: {
    fontSize: wp('4.5%'),
    fontWeight: '700',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: hp('1%'),
  },
  actions: {
    flexDirection: 'row',
    gap: wp('2%'),
    marginTop: hp('1.5%'),
    justifyContent: 'flex-end',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: wp('3%'),
    paddingVertical: hp('1%'),
    borderRadius: wp('2%'),
    gap: wp('1%'),
    flex: 1,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: wp('3.2%'),
    fontWeight: '700',
  },
  cardSubtitle: {
    fontSize: wp('3.2%'),
    marginTop: hp('0.5%'),
  },
  cardHeaderRight: {
    alignItems: 'flex-end',
  },
  badgeWaiting: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: wp('2%'),
    paddingVertical: hp('0.5%'),
    borderRadius: wp('1%'),
  },
  badgeWaitingText: {
    color: '#6366F1',
    fontSize: wp('3%'),
    fontWeight: '600',
  },
  infoLabel: {
    fontSize: wp('3.5%'),
  },
  infoValue: {
    fontSize: wp('4%'),
    fontWeight: '600',
  },
  paidByText: {
    fontSize: wp('3%'),
    marginTop: hp('1%'),
  },
  statusFlowText: {
    fontSize: wp('3%'),
    marginTop: hp('0.8%'),
  },
  confirmBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: wp('5%'),
  },
  confirmCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: wp('5%'),
    paddingHorizontal: wp('4.5%'),
    paddingTop: hp('2.3%'),
    paddingBottom: hp('1.7%'),
    alignItems: 'center',
  },
  confirmIconCircle: {
    width: wp('14%'),
    height: wp('14%'),
    borderRadius: wp('7%'),
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: hp('1.5%'),
  },
  confirmTitle: {
    color: '#1F2937',
    fontSize: wp('4%'),
    fontWeight: '800',
    marginBottom: hp('1.3%'),
  },
  confirmFlowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp('2.5%'),
    marginBottom: hp('1.3%'),
  },
  flowChipGray: {
    backgroundColor: '#9CA3AF',
    borderRadius: 999,
    paddingVertical: hp('0.8%'),
    paddingHorizontal: wp('3%'),
  },
  flowChipGrayText: {
    color: '#FFFFFF',
    fontSize: wp('3%'),
    fontWeight: '700',
  },
  flowChipBlue: {
    backgroundColor: '#3B82F6',
    borderRadius: 999,
    paddingVertical: hp('0.8%'),
    paddingHorizontal: wp('3%'),
  },
  flowChipBlueText: {
    color: '#FFFFFF',
    fontSize: wp('3%'),
    fontWeight: '700',
  },
  confirmDesc: {
    color: '#6B7280',
    fontSize: wp('3.5%'),
    marginBottom: hp('1.7%'),
  },
  confirmActionRow: {
    flexDirection: 'row',
    width: '100%',
    gap: wp('2.5%'),
  },
  confirmCancelBtn: {
    flex: 1,
    backgroundColor: '#E5E7EB',
    borderRadius: wp('3%'),
    paddingVertical: hp('1.4%'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelText: {
    color: '#6B7280',
    fontSize: wp('3.5%'),
    fontWeight: '700',
  },
  confirmSubmitBtn: {
    flex: 1,
    backgroundColor: '#3B82F6',
    borderRadius: wp('3%'),
    paddingVertical: hp('1.4%'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmSubmitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp('1.5%'),
  },
  confirmSubmitText: {
    color: '#FFFFFF',
    fontSize: wp('3.5%'),
    fontWeight: '700',
  },
  finHeaderLeft: { flex: 1 },
  badgeWaitingAdd: { backgroundColor: '#FEF3C7' },
  badgeWaitingDelete: { backgroundColor: '#FEE2E2' },
  badgeTextAdd: { color: '#D97706' },
  badgeTextDelete: { color: '#EF4444' },
  colorIncome: { color: '#10B981' },
  colorExpense: { color: '#EF4444' },
});

export default ApprovalsPage;
