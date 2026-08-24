import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal
} from 'react-native';
import { widthPercentageToDP as wp, heightPercentageToDP as hp } from 'react-native-responsive-screen';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showAlert } from '../../components/GlobalAlert';
import { getBaseUrl } from '../SuperAdmin';

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

type ResidentItem = {
  id: number;
  house_number: string;
  title: string;
  first_name: string;
  last_name: string;
  phone: string;
  deletion_status: string;
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
  const [activeTab, setActiveTab] = useState<'payments' | 'financial' | 'visibility' | 'residents' | 'discount'>('payments');
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [waitingList, setWaitingList] = useState<WaitingItem[]>([]);
  const [finWaitingList, setFinWaitingList] = useState<FinancialItem[]>([]);
  const [visWaitingList, setVisWaitingList] = useState<VisibilityItem[]>([]);
  const [resWaitingList, setResWaitingList] = useState<ResidentItem[]>([]);
  const [discWaitingList, setDiscWaitingList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [confirmItem, setConfirmItem] = useState<WaitingItem | FinancialItem | VisibilityItem | ResidentItem | null>(null);
  const [confirmMode, setConfirmMode] = useState<ConfirmMode | null>(null);
  const [confirmType, setConfirmType] = useState<'payment' | 'financial' | 'visibility' | 'residents' | 'discount' | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const colors = themeColors;

  const fetchWaitingLists = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('token');
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      
      const [resPay, resFin, resVis, resRes, resDisc] = await Promise.all([
        fetch(`${getBaseUrl()}/payment-installments/waiting-approval`, { headers }),
        fetch(`${getBaseUrl()}/financial/waiting-approval`, { headers }),
        fetch(`${getBaseUrl()}/financial/visibility/logs`, { headers }),
        fetch(`${getBaseUrl()}/residents/waiting-approval`, { headers }),
        fetch(`${getBaseUrl()}/discount/requests/waiting`, { headers })
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
      if (resRes.ok) {
        const data = await resRes.json();
        setResWaitingList(Array.isArray(data.data) ? data.data : []);
      }
      if (resDisc.ok) {
        const data = await resDisc.json();
        setDiscWaitingList(Array.isArray(data.data) ? data.data : []);
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

  const handleApproveChange = (item: WaitingItem | FinancialItem | VisibilityItem | ResidentItem | any, type: 'payment' | 'financial' | 'visibility' | 'residents' | 'discount') => {
    setConfirmItem(item);
    setConfirmType(type);
    setConfirmMode('approve');
  };

  const handleRejectChange = (item: WaitingItem | FinancialItem | VisibilityItem | ResidentItem | any, type: 'payment' | 'financial' | 'visibility' | 'residents' | 'discount') => {
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

  const getTransition = (mode: ConfirmMode, type: 'payment' | 'financial' | 'visibility' | 'residents' | 'discount', item?: WaitingItem | FinancialItem | VisibilityItem | ResidentItem | any | null) => {
    if (type === 'discount') {
      if (mode === 'approve') {
        return { from: 'รออนุมัติ', to: 'อนุมัติส่วนลด', nextStatus: 'approved', successMessage: 'อนุมัติคำขอส่วนลดแล้ว' };
      }
      return { from: 'รออนุมัติ', to: 'ปฏิเสธ', nextStatus: 'rejected', successMessage: 'ปฏิเสธคำขอส่วนลดแล้ว' };
    }
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
    } else if (type === 'residents') {
      if (mode === 'approve') {
        return {
          from: 'รออนุมัติ', to: 'ลบลูกบ้าน', nextStatus: 'approved', successMessage: 'อนุมัติการลบลูกบ้านแล้ว',
        };
      }
      return {
        from: 'รออนุมัติ', to: 'ยกเลิกการลบ', nextStatus: 'rejected', successMessage: 'ปฏิเสธคำขอลบลูกบ้านแล้ว',
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
        : confirmType === 'residents'
        ? `${getBaseUrl()}/residents/${confirmItem.id}/deletion-status`
        : confirmType === 'discount'
        ? `${getBaseUrl()}/discount/requests/${confirmItem.id}/status`
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          รายการตรวจสอบ ({waitingList.length + finWaitingList.length + visWaitingList.length + resWaitingList.length + discWaitingList.length})
        </Text>
      </View>

      {}
      <TouchableOpacity 
        style={styles.filterHeader} 
        onPress={() => setFiltersExpanded(!filtersExpanded)}
        activeOpacity={0.7}
      >
        <View style={styles.filterHeaderLeft}>
          <Ionicons name="funnel" size={16} color={colors.primary} />
          <Text style={styles.filterHeaderTitle}>ตัวกรองหมวดหมู่</Text>
          {!filtersExpanded && (
            <View style={styles.activeFilterPill}>
              <Text style={styles.activeFilterPillText}>
                {activeTab === 'payments' ? 'ส่วนกลาง' : 
                 activeTab === 'financial' ? 'บัญชี' : 
                 activeTab === 'visibility' ? 'ยอดเงิน' : 
                 activeTab === 'residents' ? 'ลูกบ้าน' : 'ส่วนลด'}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.filterHeaderRight}>
          <Ionicons 
            name={filtersExpanded ? "chevron-up" : "chevron-down"} 
            size={18} 
            color={colors.subtext} 
          />
        </View>
      </TouchableOpacity>

      {}
      {filtersExpanded && (
        <View style={styles.gridContainer}>
          <View style={styles.gridRow}>
            <TouchableOpacity 
              style={[styles.gridItem, activeTab === 'payments' && styles.gridItemActive]} 
              onPress={() => setActiveTab('payments')}
            >
              <Ionicons name="card" size={18} color={activeTab === 'payments' ? colors.primary : colors.subtext} />
              <Text style={[styles.gridText, activeTab === 'payments' && styles.gridTextActive]}>ส่วนกลาง</Text>
              <View style={[styles.gridBadge, activeTab === 'payments' ? styles.gridBadgeActive : styles.gridBadgeInactive]}>
                <Text style={[styles.gridBadgeText, activeTab === 'payments' ? styles.gridBadgeTextActive : styles.gridBadgeTextInactive]}>
                  {waitingList.length}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.gridItem, activeTab === 'financial' && styles.gridItemActive]} 
              onPress={() => setActiveTab('financial')}
            >
              <Ionicons name="wallet" size={18} color={activeTab === 'financial' ? colors.primary : colors.subtext} />
              <Text style={[styles.gridText, activeTab === 'financial' && styles.gridTextActive]}>บัญชี</Text>
              <View style={[styles.gridBadge, activeTab === 'financial' ? styles.gridBadgeActive : styles.gridBadgeInactive]}>
                <Text style={[styles.gridBadgeText, activeTab === 'financial' ? styles.gridBadgeTextActive : styles.gridBadgeTextInactive]}>
                  {finWaitingList.length}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.gridRow}>
            <TouchableOpacity 
              style={[styles.gridItem, activeTab === 'visibility' && styles.gridItemActive]} 
              onPress={() => setActiveTab('visibility')}
            >
              <Ionicons name="eye" size={18} color={activeTab === 'visibility' ? colors.primary : colors.subtext} />
              <Text style={[styles.gridText, activeTab === 'visibility' && styles.gridTextActive]}>ยอดเงิน</Text>
              <View style={[styles.gridBadge, activeTab === 'visibility' ? styles.gridBadgeActive : styles.gridBadgeInactive]}>
                <Text style={[styles.gridBadgeText, activeTab === 'visibility' ? styles.gridBadgeTextActive : styles.gridBadgeTextInactive]}>
                  {visWaitingList.length}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.gridItem, activeTab === 'residents' && styles.gridItemActive]} 
              onPress={() => setActiveTab('residents')}
            >
              <Ionicons name="people" size={18} color={activeTab === 'residents' ? colors.primary : colors.subtext} />
              <Text style={[styles.gridText, activeTab === 'residents' && styles.gridTextActive]}>ลูกบ้าน</Text>
              <View style={[styles.gridBadge, activeTab === 'residents' ? styles.gridBadgeActive : styles.gridBadgeInactive]}>
                <Text style={[styles.gridBadgeText, activeTab === 'residents' ? styles.gridBadgeTextActive : styles.gridBadgeTextInactive]}>
                  {resWaitingList.length}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.gridRow}>
            <TouchableOpacity 
              style={[styles.gridItem, styles.gridItemFullWidth, activeTab === 'discount' && styles.gridItemActive]} 
              onPress={() => setActiveTab('discount')}
            >
              <Ionicons name="pricetag" size={18} color={activeTab === 'discount' ? colors.primary : colors.subtext} />
              <Text style={[styles.gridText, activeTab === 'discount' && styles.gridTextActive]}>ส่วนลด</Text>
              <View style={[styles.gridBadge, activeTab === 'discount' ? styles.gridBadgeActive : styles.gridBadgeInactive]}>
                <Text style={[styles.gridBadgeText, activeTab === 'discount' ? styles.gridBadgeTextActive : styles.gridBadgeTextInactive]}>
                  {discWaitingList.length}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList<any>
          data={activeTab === 'payments' ? waitingList : activeTab === 'financial' ? finWaitingList : activeTab === 'residents' ? resWaitingList : activeTab === 'discount' ? discWaitingList : visWaitingList}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="checkmark-circle-outline" size={72} color={colors.success} style={{ marginBottom: hp('1%') }} />
              <Text style={[styles.emptyText, { color: colors.text }]}>ไม่มีรายการรอตรวจสอบ</Text>
              <Text style={[styles.emptySubtext, { color: colors.subtext }]}>ยอดเยี่ยมมาก! ไม่มีคำค้างที่รอการพิจารณาในหมวดหมู่นี้แล้ว</Text>
            </View>
          }
          renderItem={({ item }) => {
            if (activeTab === 'payments') {
              const payItem = item as WaitingItem;
              return (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderTitleContainer}>
                      <Ionicons name="home" size={20} color={colors.primary} />
                      <Text style={styles.cardTitle}>บ้านเลขที่ {payItem.house_number}</Text>
                    </View>
                    <View style={[styles.badgeWaiting, styles.badgeWaitingDiscount]}>
                      <Text style={[styles.badgeWaitingText, styles.badgeTextDiscount]}>รออนุมัติ</Text>
                    </View>
                  </View>

                  <View style={styles.cardDivider} />

                  <View style={styles.flowSection}>
                    <Text style={styles.flowSectionLabel}>คำขอแก้ไขสถานะชำระเงิน</Text>
                    <View style={styles.flowContainer}>
                      <View style={styles.flowNodePaid}>
                        <Text style={styles.flowNodePaidText}>ชำระแล้ว</Text>
                      </View>
                      <Ionicons name="arrow-forward-outline" size={16} color={colors.subtext} />
                      <View style={styles.flowNodePending}>
                        <Text style={styles.flowNodePendingText}>ค้างชำระ</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.infoGrid}>
                    <View style={styles.infoCol}>
                      <Text style={styles.infoLabel}>ยอดเงินที่ขอแก้ไข</Text>
                      <Text style={[styles.infoValue, { color: colors.primary }]}>{payItem.amount.toLocaleString()} บาท</Text>
                    </View>
                    <View style={styles.infoCol}>
                      <Text style={styles.infoLabel}>งวดที่ชำระ</Text>
                      <Text style={styles.infoValue}>งวดที่ {payItem.installment_no} ({payItem.months_span} เดือน)</Text>
                    </View>
                  </View>

                  {!!payItem.paid_by && (
                    <View style={styles.footerRow}>
                      <Ionicons name="person-circle-outline" size={16} color={colors.subtext} />
                      <Text style={styles.footerText}>ขอแก้ไขโดย: {payItem.paid_by}</Text>
                    </View>
                  )}

                  <View style={styles.cardActions}>
                    <TouchableOpacity 
                      style={styles.rejectBtn}
                      onPress={() => handleRejectChange(payItem, 'payment')}
                    >
                      <Ionicons name="close-circle-outline" size={18} color={colors.danger} />
                      <Text style={styles.rejectBtnText}>ปฏิเสธ</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={styles.approveBtn}
                      onPress={() => handleApproveChange(payItem, 'payment')}
                    >
                      <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                      <Text style={styles.approveBtnText}>อนุมัติ</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            } else if (activeTab === 'financial') {
              const finItem = item as FinancialItem;
              const isAdd = finItem.status === 'waiting_add';
              return (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderTitleContainer}>
                      <Ionicons 
                        name={finItem.type === 'income' ? "arrow-up-circle" : "arrow-down-circle"} 
                        size={22} 
                        color={finItem.type === 'income' ? colors.success : colors.danger} 
                      />
                      <Text style={styles.cardTitle} numberOfLines={1}>{finItem.title}</Text>
                    </View>
                    <View style={[styles.badgeWaiting, isAdd ? styles.badgeWaitingAdd : styles.badgeWaitingDelete]}>
                      <Text style={[styles.badgeWaitingText, isAdd ? styles.badgeTextAdd : styles.badgeTextDelete]}>
                        {isAdd ? 'เพิ่มรายการ' : 'ลบรายการ'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cardDivider} />

                  <View style={styles.infoGrid}>
                    <View style={styles.infoCol}>
                      <Text style={styles.infoLabel}>ประเภทบัญชี</Text>
                      <Text style={[styles.infoValue, { color: finItem.type === 'income' ? colors.success : colors.danger }]}>
                        {finItem.type === 'income' ? 'รายรับ' : 'รายจ่าย'}
                      </Text>
                    </View>
                    <View style={styles.infoCol}>
                      <Text style={styles.infoLabel}>จำนวนเงิน</Text>
                      <Text style={[styles.infoValue, styles.infoValueHighlight, { color: finItem.type === 'income' ? colors.success : colors.danger }]}>
                        {finItem.type === 'income' ? '+' : '-'}฿{Number(finItem.amount).toLocaleString()}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.detailsSection}>
                    {!!finItem.description && (
                      <Text style={styles.detailsDescription}>{finItem.description}</Text>
                    )}
                    <View style={styles.detailsRow}>
                      <Ionicons name="calendar-outline" size={14} color={colors.subtext} />
                      <Text style={styles.detailsText}>วันที่ทำรายการ: {new Date(finItem.date).toLocaleDateString('th-TH')}</Text>
                    </View>
                  </View>

                  {!!finItem.creator_name && (
                    <View style={styles.footerRow}>
                      <Ionicons name="person-circle-outline" size={16} color={colors.subtext} />
                      <Text style={styles.footerText}>บันทึกโดย: {finItem.creator_name}</Text>
                    </View>
                  )}

                  <View style={styles.cardActions}>
                    <TouchableOpacity 
                      style={styles.rejectBtn}
                      onPress={() => handleRejectChange(finItem, 'financial')}
                    >
                      <Ionicons name="close-circle-outline" size={18} color={colors.danger} />
                      <Text style={styles.rejectBtnText}>ปฏิเสธ</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={styles.approveBtn}
                      onPress={() => handleApproveChange(finItem, 'financial')}
                    >
                      <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                      <Text style={styles.approveBtnText}>อนุมัติ</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            } else if (activeTab === 'residents') {
              const resItem = item as ResidentItem;
              const residentName = [resItem.title, resItem.first_name, resItem.last_name].filter(Boolean).join(' ');
              return (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderTitleContainer}>
                      <Ionicons name="home" size={20} color={colors.primary} />
                      <Text style={styles.cardTitle}>บ้านเลขที่ {resItem.house_number}</Text>
                    </View>
                    <View style={[styles.badgeWaiting, styles.badgeWaitingDelete]}>
                      <Text style={[styles.badgeWaitingText, styles.badgeTextDelete]}>
                        คำขอลบลูกบ้าน
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cardDivider} />

                  <View style={styles.infoGrid}>
                    <View style={styles.infoCol}>
                      <Text style={styles.infoLabel}>ชื่อผู้อยู่อาศัย</Text>
                      <Text style={styles.infoValue}>{residentName || 'ไม่ระบุชื่อ'}</Text>
                    </View>
                    {!!resItem.phone && (
                      <View style={styles.infoCol}>
                        <Text style={styles.infoLabel}>เบอร์โทรศัพท์</Text>
                        <Text style={styles.infoValue}>{resItem.phone}</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.cardActions}>
                    <TouchableOpacity 
                      style={styles.rejectBtn}
                      onPress={() => handleRejectChange(resItem, 'residents')}
                    >
                      <Ionicons name="close-circle-outline" size={18} color={colors.danger} />
                      <Text style={styles.rejectBtnText}>ปฏิเสธ</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={styles.approveBtn}
                      onPress={() => handleApproveChange(resItem, 'residents')}
                    >
                      <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                      <Text style={styles.approveBtnText}>อนุมัติ</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            } else if (activeTab === 'visibility') {
              const visItem = item as VisibilityItem;
              const isShow = visItem.action === 'show';
              return (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderTitleContainer}>
                      <Ionicons name="eye-sharp" size={20} color={colors.primary} />
                      <Text style={styles.cardTitle}>สิทธิ์แสดงผลยอดเงิน</Text>
                    </View>
                    <View style={[styles.badgeWaiting, styles.badgeWaitingInfo]}>
                      <Text style={[styles.badgeWaitingText, styles.badgeTextInfo]}>
                        คำขอเปลี่ยนสิทธิ์
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cardDivider} />

                  <View style={styles.flowSection}>
                    <Text style={styles.flowSectionLabel}>เปลี่ยนการแสดงผลในหน้าลูกบ้าน</Text>
                    <View style={styles.flowContainer}>
                      <View style={styles.flowNodeGray}>
                        <Text style={styles.flowNodeGrayText}>{isShow ? 'ซ่อนอยู่' : 'แสดงอยู่'}</Text>
                      </View>
                      <Ionicons name="arrow-forward-outline" size={16} color={colors.subtext} />
                      <View style={isShow ? styles.flowNodeSuccess : styles.flowNodeDanger}>
                        <Text style={isShow ? styles.flowNodeSuccessText : styles.flowNodeDangerText}>
                          {isShow ? 'แสดงยอดเงิน' : 'ซ่อนยอดเงิน'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.detailsSection}>
                    <View style={styles.detailsRow}>
                      <Ionicons name="calendar-outline" size={14} color={colors.subtext} />
                      <Text style={styles.detailsText}>วันที่ขอ: {new Date(visItem.created_at).toLocaleDateString('th-TH')}</Text>
                    </View>
                  </View>

                  <View style={styles.footerRow}>
                    <Ionicons name="person-circle-outline" size={16} color={colors.subtext} />
                    <Text style={styles.footerText}>ขอโดย: {visItem.requested_by_name || visItem.requested_by_username || 'Unknown'}</Text>
                  </View>

                  <View style={styles.cardActions}>
                    <TouchableOpacity 
                      style={styles.rejectBtn}
                      onPress={() => handleRejectChange(visItem, 'visibility')}
                    >
                      <Ionicons name="close-circle-outline" size={18} color={colors.danger} />
                      <Text style={styles.rejectBtnText}>ปฏิเสธ</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={styles.approveBtn}
                      onPress={() => handleApproveChange(visItem, 'visibility')}
                    >
                      <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                      <Text style={styles.approveBtnText}>อนุมัติ</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            } else if (activeTab === 'discount') {
              const dItem = item;
              const cycleLabels: Record<number, string> = { 3: 'ราย 3 เดือน', 6: 'ราย 6 เดือน', 12: 'รายปี' };
              const actionLabels: Record<string, string> = { create: 'สร้างส่วนลด', update: 'แก้ไขส่วนลด', delete: 'ลบส่วนลด' };
              const actionBadgeStyle = dItem.action === 'create' ? styles.badgeWaitingAdd : dItem.action === 'update' ? styles.badgeWaitingDiscount : styles.badgeWaitingDelete;
              const actionTextStyle = dItem.action === 'create' ? styles.badgeTextAdd : dItem.action === 'update' ? styles.badgeTextDiscount : styles.badgeTextDelete;
              return (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderTitleContainer}>
                      <Ionicons name="pricetag" size={20} color={colors.warning} />
                      <Text style={styles.cardTitle}>รอบชำระ: {cycleLabels[dItem.cycle_months] || `${dItem.cycle_months} เดือน`}</Text>
                    </View>
                    <View style={[styles.badgeWaiting, actionBadgeStyle]}>
                      <Text style={[styles.badgeWaitingText, actionTextStyle]}>
                        {actionLabels[dItem.action] || dItem.action}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cardDivider} />

                  {dItem.action === 'delete' ? (
                    <View style={styles.flowSection}>
                      <Text style={styles.flowSectionLabel}>คำขอให้ยกเลิกการให้ส่วนลดของรอบชำระนี้</Text>
                    </View>
                  ) : (
                    <View style={styles.flowSection}>
                      <Text style={styles.flowSectionLabel}>การเปลี่ยนแปลงมูลค่าส่วนลด</Text>
                      <View style={styles.flowContainer}>
                        {dItem.old_discount_value != null ? (
                          <View style={styles.flowNodeGray}>
                            <Text style={styles.flowNodeGrayText}>
                              {dItem.old_discount_value}{dItem.old_discount_type === 'percentage' ? '%' : ' ฿'}
                            </Text>
                          </View>
                        ) : (
                          <View style={styles.flowNodeGray}>
                            <Text style={styles.flowNodeGrayText}>ไม่มี</Text>
                          </View>
                        )}
                        <Ionicons name="arrow-forward-outline" size={16} color={colors.subtext} />
                        <View style={styles.flowNodeSuccess}>
                          <Text style={styles.flowNodeSuccessText}>
                            {dItem.discount_value}{dItem.discount_type === 'percentage' ? '%' : ' ฿'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  )}

                  <View style={styles.footerRow}>
                    <Ionicons name="person-circle-outline" size={16} color={colors.subtext} />
                    <Text style={styles.footerText}>ขอโดย: {dItem.requested_by_name || '-'}</Text>
                  </View>

                  <View style={styles.cardActions}>
                    <TouchableOpacity 
                      style={styles.rejectBtn}
                      onPress={() => handleRejectChange(dItem, 'discount')}
                    >
                      <Ionicons name="close-circle-outline" size={18} color={colors.danger} />
                      <Text style={styles.rejectBtnText}>ปฏิเสธ</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={styles.approveBtn}
                      onPress={() => handleApproveChange(dItem, 'discount')}
                    >
                      <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                      <Text style={styles.approveBtnText}>อนุมัติ</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            } else {
              return null;
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
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: wp('5%'),
    paddingVertical: hp('2%'),
    borderBottomWidth: 1,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  backBtn: {
    padding: wp('1%'),
    marginRight: wp('2%'),
  },
  headerTitle: {
    fontSize: wp('4.8%'),
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: wp('4.5%'),
    paddingVertical: hp('1.5%'),
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp('2%'),
  },
  filterHeaderTitle: {
    fontSize: wp('3.8%'),
    fontWeight: '700',
    color: '#0F172A',
  },
  activeFilterPill: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: wp('2.5%'),
    paddingVertical: hp('0.4%'),
    borderRadius: wp('3%'),
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  activeFilterPillText: {
    fontSize: wp('3%'),
    fontWeight: '700',
    color: '#4F46E5',
  },
  filterHeaderRight: {
    padding: wp('1%'),
  },
  gridContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: wp('4%'),
    paddingVertical: hp('1.5%'),
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    gap: hp('1%'),
  },
  gridRow: {
    flexDirection: 'row',
    gap: wp('2.5%'),
  },
  gridItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: wp('3.5%'),
    paddingVertical: hp('1.2%'),
    borderRadius: wp('3%'),
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    gap: wp('2%'),
  },
  gridItemFullWidth: {
    flex: 1,
  },
  gridItemActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  gridText: {
    fontSize: wp('3.4%'),
    color: '#64748B',
    fontWeight: '600',
    flex: 1,
  },
  gridTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  gridBadge: {
    minWidth: wp('5%'),
    height: wp('5%'),
    borderRadius: wp('2.5%'),
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: wp('1%'),
  },
  gridBadgeActive: {
    backgroundColor: '#4F46E5',
  },
  gridBadgeInactive: {
    backgroundColor: '#E2E8F0',
  },
  gridBadgeText: {
    fontSize: wp('2.8%'),
    fontWeight: '700',
    textAlign: 'center',
  },
  gridBadgeTextActive: {
    color: '#FFFFFF',
  },
  gridBadgeTextInactive: {
    color: '#64748B',
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
    paddingTop: hp('12%'),
    paddingHorizontal: wp('10%'),
  },
  emptyText: {
    fontSize: wp('4.2%'),
    fontWeight: '600',
    marginTop: hp('2%'),
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: wp('4%'),
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: wp('4.5%'),
    marginBottom: hp('2%'),
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: hp('1.5%'),
  },
  cardHeaderTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp('2%'),
    flex: 1,
  },
  cardTitle: {
    fontSize: wp('4.2%'),
    fontWeight: '700',
    color: '#0F172A',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginBottom: hp('1.5%'),
  },
  flowSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: wp('2.5%'),
    padding: wp('3%'),
    marginBottom: hp('1.5%'),
  },
  flowSectionLabel: {
    fontSize: wp('3.2%'),
    color: '#64748B',
    fontWeight: '600',
    marginBottom: hp('1%'),
  },
  flowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp('3%'),
  },
  flowNodePaid: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: wp('3%'),
    paddingVertical: hp('0.6%'),
    borderRadius: wp('1.5%'),
  },
  flowNodePaidText: {
    color: '#065F46',
    fontSize: wp('3.2%'),
    fontWeight: '700',
  },
  flowNodePending: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: wp('3%'),
    paddingVertical: hp('0.6%'),
    borderRadius: wp('1.5%'),
  },
  flowNodePendingText: {
    color: '#991B1B',
    fontSize: wp('3.2%'),
    fontWeight: '700',
  },
  flowNodeGray: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: wp('3%'),
    paddingVertical: hp('0.6%'),
    borderRadius: wp('1.5%'),
  },
  flowNodeGrayText: {
    color: '#475569',
    fontSize: wp('3.2%'),
    fontWeight: '700',
  },
  flowNodeSuccess: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: wp('3%'),
    paddingVertical: hp('0.6%'),
    borderRadius: wp('1.5%'),
  },
  flowNodeSuccessText: {
    color: '#065F46',
    fontSize: wp('3.2%'),
    fontWeight: '700',
  },
  flowNodeDanger: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: wp('3%'),
    paddingVertical: hp('0.6%'),
    borderRadius: wp('1.5%'),
  },
  flowNodeDangerText: {
    color: '#991B1B',
    fontSize: wp('3.2%'),
    fontWeight: '700',
  },
  infoGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: wp('4%'),
    marginBottom: hp('1.5%'),
  },
  infoCol: {
    flex: 1,
  },
  infoLabel: {
    fontSize: wp('3.2%'),
    color: '#64748B',
    marginBottom: hp('0.5%'),
  },
  infoValue: {
    fontSize: wp('3.8%'),
    fontWeight: '700',
    color: '#0F172A',
  },
  detailsSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: wp('2.5%'),
    padding: wp('3%'),
    marginBottom: hp('1.5%'),
    gap: hp('0.8%'),
  },
  detailsDescription: {
    fontSize: wp('3.6%'),
    color: '#334155',
    lineHeight: wp('5%'),
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp('1.5%'),
  },
  detailsText: {
    fontSize: wp('3.2%'),
    color: '#64748B',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp('1.5%'),
    marginBottom: hp('1.5%'),
  },
  footerText: {
    fontSize: wp('3.2%'),
    color: '#64748B',
    fontWeight: '500',
  },
  cardActions: {
    flexDirection: 'row',
    gap: wp('3%'),
    marginTop: hp('1%'),
  },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: hp('1.4%'),
    borderRadius: wp('3%'),
    borderWidth: 1.5,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
    gap: wp('1.5%'),
  },
  rejectBtnText: {
    color: '#DC2626',
    fontSize: wp('3.6%'),
    fontWeight: '700',
  },
  approveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: hp('1.4%'),
    borderRadius: wp('3%'),
    backgroundColor: '#10B981',
    gap: wp('1.5%'),
  },
  approveBtnText: {
    color: '#FFFFFF',
    fontSize: wp('3.6%'),
    fontWeight: '700',
  },
  badgeWaiting: {
    paddingHorizontal: wp('2.5%'),
    paddingVertical: hp('0.6%'),
    borderRadius: wp('2%'),
  },
  badgeWaitingText: {
    fontSize: wp('3%'),
    fontWeight: '700',
  },
  badgeWaitingAdd: { backgroundColor: '#FEF3C7' },
  badgeWaitingDelete: { backgroundColor: '#FEE2E2' },
  badgeWaitingInfo: { backgroundColor: '#E0F2FE' },
  badgeWaitingDiscount: { backgroundColor: '#FFFBEB' },
  badgeTextAdd: { color: '#D97706' },
  badgeTextDelete: { color: '#EF4444' },
  badgeTextInfo: { color: '#0369A1' },
  badgeTextDiscount: { color: '#D97706' },
  colorIncome: { color: '#10B981' },
  colorExpense: { color: '#EF4444' },
  confirmBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: wp('5%'),
  },
  confirmCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: wp('6%'),
    padding: wp('6%'),
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  confirmIconCircle: {
    width: wp('14%'),
    height: wp('14%'),
    borderRadius: wp('7%'),
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: hp('2%'),
  },
  confirmTitle: {
    color: '#0F172A',
    fontSize: wp('4.6%'),
    fontWeight: '800',
    marginBottom: hp('1.5%'),
  },
  confirmFlowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp('3%'),
    marginBottom: hp('2%'),
    backgroundColor: '#F8FAFC',
    paddingHorizontal: wp('4%'),
    paddingVertical: hp('1%'),
    borderRadius: wp('3%'),
  },
  flowChipGray: {
    backgroundColor: '#64748B',
    borderRadius: wp('2%'),
    paddingVertical: hp('0.6%'),
    paddingHorizontal: wp('2.5%'),
  },
  flowChipGrayText: {
    color: '#FFFFFF',
    fontSize: wp('3.2%'),
    fontWeight: '700',
  },
  flowChipBlue: {
    backgroundColor: '#3B82F6',
    borderRadius: wp('2%'),
    paddingVertical: hp('0.6%'),
    paddingHorizontal: wp('2.5%'),
  },
  flowChipBlueText: {
    color: '#FFFFFF',
    fontSize: wp('3.2%'),
    fontWeight: '700',
  },
  confirmDesc: {
    color: '#64748B',
    fontSize: wp('3.6%'),
    textAlign: 'center',
    marginBottom: hp('2.5%'),
    lineHeight: wp('5%'),
  },
  confirmActionRow: {
    flexDirection: 'row',
    width: '100%',
    gap: wp('3%'),
  },
  confirmCancelBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: wp('3%'),
    paddingVertical: hp('1.6%'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelText: {
    color: '#475569',
    fontSize: wp('3.8%'),
    fontWeight: '700',
  },
  confirmSubmitBtn: {
    flex: 1,
    backgroundColor: '#3B82F6',
    borderRadius: wp('3%'),
    paddingVertical: hp('1.6%'),
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
    fontSize: wp('3.8%'),
    fontWeight: '700',
  },
  emptySubtext: {
    fontSize: wp('3.4%'),
    marginTop: hp('0.5%'),
    textAlign: 'center',
  },
  infoValueHighlight: {
    fontSize: wp('4.4%'),
    fontWeight: '700',
  },
});

export default ApprovalsPage;
