import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, RefreshControl, ActivityIndicator, Image, Modal, ScrollView,
} from 'react-native';
import { widthPercentageToDP as wp, heightPercentageToDP as hp } from 'react-native-responsive-screen';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBaseUrl } from '../SuperAdmin';
import { formatThaiDateTime, toSortableMs, toThaiYearMonthKey } from '../../lib/datetime';

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

type PaymentLog = {
  id: number;
  payment_id: number;
  house_number: string;
  installment_no: number;
  months_span: number;
  due_date: string;
  amount: string;
  status: 'paid' | 'waiting_approval' | 'pending' | 'overdue' | 'rejected';
  paid_at?: string;
  paid_method?: string;
  paid_note?: string;
  proof_image?: string;
  paid_by?: string;
  approved_by?: string;
};

interface PaymentLogsPageProps {
  onBack: () => void;
  darkMode?: boolean;
}

const formatCurrency = (amount: string | number) => {
  return Number(amount).toLocaleString('th-TH', {
    style: 'currency',
    currency: 'THB',
  });
};

const getMethodLabel = (method?: string) => {
  switch (method) {
    case 'cash': return 'เงินสด';
    case 'promptpay': return 'พร้อมเพย์';
    case 'bank_transfer': return 'โอนธนาคาร';
    default: return method || '-';
  }
};

const getMethodIcon = (method?: string): 'cash-outline' | 'qr-code-outline' | 'card-outline' | 'help-circle-outline' => {
  switch (method) {
    case 'cash': return 'cash-outline';
    case 'promptpay': return 'qr-code-outline';
    case 'bank_transfer': return 'card-outline';
    default: return 'help-circle-outline';
  }
};

const isSlipCheckedPayment = (item: PaymentLog) => {
  const method = String(item.paid_method || '').toLowerCase();
  return method === 'promptpay' || !!item.proof_image;
};

const getPaidByDisplay = (item: PaymentLog) => {
  if (isSlipCheckedPayment(item)) return 'ผ่านระบบ';
  return item.paid_by || '-';
};

const getApprovedByDisplay = (item: PaymentLog) => {
  if (item.approved_by) return String(item.approved_by);
  if (item.status === 'paid' && isSlipCheckedPayment(item)) return 'ผ่านระบบ';
  return null;
};

const PaymentLogsPage: React.FC<PaymentLogsPageProps> = ({ onBack }) => {
  const [logs, setLogs] = useState<PaymentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [sortNewest, setSortNewest] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
  const [selectedStatus, setSelectedStatus] = useState<'all' | PaymentLog['status']>('all');

  const colors = themeColors;

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${getBaseUrl()}/payment-installments/logs?limit=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setLogs(Array.isArray(data.data) ? data.data : []);
      }
    } catch (error) {
      console.log('Error fetching payment logs:', error);
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

  const monthNames = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

  const statusFilters = [
    { key: 'all' as const, label: 'ทั้งหมด' },
    { key: 'paid' as const, label: 'ชำระแล้ว' },
    { key: 'pending' as const, label: 'รอชำระ' },
    { key: 'overdue' as const, label: 'เกินกำหนด' },
    { key: 'waiting_approval' as const, label: 'รออนุมัติ' },
    { key: 'rejected' as const, label: 'ปฏิเสธ' },
  ];

  const getMonthLabel = (key: string) => {
    const [y, m] = key.split('-');
    return `${monthNames[Number(m) - 1]} ${Number(y) + 543}`;
  };

  const filteredLogs = useMemo(() => {
    let result = logs;
    if (selectedMonth !== 'all') {
      result = result.filter(l => {
        const d = l.paid_at || l.due_date;
        if (!d) return false;
        const key = toThaiYearMonthKey(d);
        return key === selectedMonth;
      });
    }
    if (selectedStatus !== 'all') {
      result = result.filter(l => l.status === selectedStatus);
    }
    if (searchText) {
      const lower = searchText.toLowerCase();
      result = result.filter(l => 
        l.house_number.toLowerCase().includes(lower) ||
        (l.paid_by || '').toLowerCase().includes(lower) ||
        (l.approved_by || '').toLowerCase().includes(lower) ||
        (l.paid_note || '').toLowerCase().includes(lower) ||
        String(l.amount).includes(lower)
      );
    }
    return [...result].sort((a, b) => {
      const da = toSortableMs(a.paid_at || a.due_date);
      const db = toSortableMs(b.paid_at || b.due_date);
      return sortNewest ? db - da : da - db;
    });
  }, [logs, searchText, sortNewest, selectedMonth, selectedStatus]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return colors.success;
      case 'waiting_approval': return colors.warning;
      case 'rejected': return colors.danger;
      case 'overdue': return colors.danger;
      default: return colors.subtext;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'paid': return 'ชำระแล้ว';
      case 'waiting_approval': return 'รออนุมัติ';
      case 'rejected': return 'ปฏิเสธ';
      case 'overdue': return 'เกินกำหนด';
      case 'pending': return 'รอชำระ';
      default: return status;
    }
  };

  const renderItem = ({ item }: { item: PaymentLog }) => (
    <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View style={styles.houseBadge}>
            <Ionicons name="home" size={12} color="#fff" />
            <Text style={styles.houseText}>{item.house_number}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                {getStatusLabel(item.status)}
            </Text>
        </View>
      </View>

      <View style={styles.row}>
        <Text style={[styles.amount, { color: colors.text }]}>
            {formatCurrency(item.amount)}
        </Text>
        <Text style={[styles.date, { color: colors.subtext }]}>
          กำหนด: {formatThaiDateTime(item.due_date)}
        </Text>
      </View>

      <View style={styles.details}>
          <Text style={[styles.detailText, { color: colors.subtext }]}>
              งวดที่ {item.installment_no} ({item.months_span} เดือน)
          </Text>
          {item.paid_method && (
              <View style={styles.methodRow}>
                <Ionicons name={getMethodIcon(item.paid_method)} size={14} color={colors.info} />
                <Text style={[styles.detailText, { color: colors.info }]}>
                    {getMethodLabel(item.paid_method)}
                </Text>
              </View>
          )}
      </View>

      {}
      <View style={styles.personInfo}>
          {(item.paid_by || isSlipCheckedPayment(item)) && (
              <View style={styles.personRow}>
                <Ionicons name="person-outline" size={14} color={colors.subtext} />
                <Text style={[styles.personLabel, { color: colors.subtext }]}>จ่ายโดย: </Text>
                <Text style={[styles.personValue, { color: colors.text }]}>{getPaidByDisplay(item)}</Text>
              </View>
          )}
          {getApprovedByDisplay(item) && (
              <View style={styles.personRow}>
                <Ionicons name="checkmark-circle-outline" size={14} color={colors.success} />
                <Text style={[styles.personLabel, { color: colors.subtext }]}>ยืนยันโดย: </Text>
                <Text style={[styles.personValue, { color: colors.success }]}>{getApprovedByDisplay(item)}</Text>
              </View>
          )}
          {item.paid_at && (
              <View style={styles.personRow}>
                <Ionicons name="calendar-outline" size={14} color={colors.subtext} />
                <Text style={[styles.personLabel, { color: colors.subtext }]}>วันที่ชำระ: </Text>
                <Text style={[styles.personValue, { color: colors.text }]}>{formatThaiDateTime(item.paid_at)}</Text>
              </View>
          )}
      </View>

      {item.paid_note && (
          <View style={[styles.noteBox, { backgroundColor: colors.bg }]}>
              <Text style={[styles.noteText, { color: colors.subtext }]}>
                  โน้ต: {item.paid_note}
              </Text>
          </View>
      )}

      {item.proof_image && (
        <TouchableOpacity 
            style={styles.proofBtn}
            onPress={() => setSelectedImage(`${getBaseUrl()}/${item.proof_image}`)}
        >
            <Ionicons name="image" size={16} color={colors.primary} />
            <Text style={[styles.proofText, { color: colors.primary }]}>ดูสลิปโอนเงิน</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {}
      <View style={[styles.header, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>ประวัติการชำระเงิน</Text>
      </View>

      {}
      <View style={[styles.searchContainer, { backgroundColor: colors.cardBg, borderBottomColor: colors.border }]}>
        <View style={styles.searchRow}>
          <View style={[styles.searchInputWrapper, { backgroundColor: colors.bg, borderColor: colors.border }]}>
            <Ionicons name="search" size={18} color={colors.subtext} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="ค้นหาบ้าน, ผู้ชำระ..."
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
            <Ionicons name={sortNewest ? 'arrow-down' : 'arrow-up'} size={16} color={colors.primary} />
            <Text style={[styles.sortText, { color: colors.primary }]}>
              {sortNewest ? 'ใหม่สุด' : 'เก่าสุด'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {}
      <View style={[styles.filterRow, { backgroundColor: colors.cardBg, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.monthPickerBtn, { borderColor: colors.border }]}
          onPress={() => setShowMonthPicker(!showMonthPicker)}
        >
          <Ionicons name="calendar-outline" size={16} color={colors.primary} />
          <Text style={[styles.monthPickerText, { color: colors.text }]}>
            {selectedMonth === 'all' ? 'ทุกเดือน' : getMonthLabel(selectedMonth)}
          </Text>
          <Ionicons name={showMonthPicker ? 'chevron-up' : 'chevron-down'} size={14} color={colors.subtext} />
        </TouchableOpacity>
        {selectedMonth !== 'all' && (
          <TouchableOpacity onPress={() => setSelectedMonth('all')} style={styles.clearMonthBtn}>
            <Text style={[styles.clearMonthText, { color: colors.danger }]}>ล้าง</Text>
          </TouchableOpacity>
        )}
        <Text style={[styles.countText, styles.countTextRight, { color: colors.subtext }]}>
          {filteredLogs.length} รายการ
        </Text>
      </View>

      <View style={[styles.statusFilterRow, { backgroundColor: colors.cardBg, borderBottomColor: colors.border }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statusFilterContent}
        >
          {statusFilters.map((f) => {
            const isActive = selectedStatus === f.key;
            const c = f.key === 'all' ? colors.primary : getStatusColor(f.key);
            const statusPillStyle = {
              borderColor: c,
              backgroundColor: isActive ? c : '#F9FAFB',
            };
            const statusPillTextStyle = {
              color: isActive ? '#fff' : c,
            };
            return (
              <TouchableOpacity
                key={f.key}
                style={[
                  styles.statusPill,
                  statusPillStyle,
                ]}
                onPress={() => setSelectedStatus(f.key)}
              >
                <Text style={[styles.statusPillText, statusPillTextStyle]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {}
      <Modal visible={showMonthPicker} transparent animationType="fade" onRequestClose={() => setShowMonthPicker(false)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowMonthPicker(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.pickerCard, { backgroundColor: colors.cardBg }]}>
            {}
            <View style={styles.yearNav}>
              <TouchableOpacity onPress={() => setPickerYear(y => y - 1)} style={styles.yearArrow}>
                <Ionicons name="chevron-back" size={22} color={colors.primary} />
              </TouchableOpacity>
              <Text style={[styles.yearText, { color: colors.text }]}>{pickerYear + 543}</Text>
              <TouchableOpacity onPress={() => setPickerYear(y => y + 1)} style={styles.yearArrow}>
                <Ionicons name="chevron-forward" size={22} color={colors.primary} />
              </TouchableOpacity>
            </View>
            {}
            <View style={styles.monthGrid}>
              {monthNames.map((name, i) => {
                const key = `${pickerYear}-${String(i + 1).padStart(2, '0')}`;
                const isActive = selectedMonth === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.monthCell, isActive && styles.monthCellActive]}
                    onPress={() => { setSelectedMonth(key); setShowMonthPicker(false); }}
                  >
                    <Text style={[styles.monthCellText, isActive ? styles.monthCellTextActive : styles.monthCellTextInactive]}>{name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {}
            <TouchableOpacity
              style={[styles.allMonthBtn, selectedMonth === 'all' && styles.allMonthBtnActive]}
              onPress={() => { setSelectedMonth('all'); setShowMonthPicker(false); }}
            >
              <Text style={[styles.allMonthText, selectedMonth === 'all' ? styles.allMonthTextActive : styles.allMonthTextInactive]}>ดูทุกเดือน</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

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
              <Ionicons name="receipt-outline" size={64} color={colors.subtext} />
              <Text style={[styles.emptyText, { color: colors.subtext }]}>
                  ไม่พบข้อมูลประวัติการชำระเงิน
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
    padding: wp('4%'),
    borderBottomWidth: 1,
    gap: wp('4%'),
  },
  backBtn: { padding: wp('1%') },
  headerTitle: { fontSize: wp('5%'), fontWeight: '700' },
  searchContainer: { paddingHorizontal: wp('4%'), paddingVertical: hp('1.2%'), borderBottomWidth: 1 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: wp('2.5%') },
  searchInputWrapper: { flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: wp('3%'), paddingHorizontal: wp('3%'), height: hp('5.2%'), gap: wp('2%') },
  searchInput: { flex: 1, fontSize: wp('3.5%') },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: wp('1%'), paddingHorizontal: wp('3%'), paddingVertical: hp('1%'), borderRadius: wp('5%'), backgroundColor: '#EEF2FF' },
  sortText: { fontSize: wp('3%'), fontWeight: '600' },
  filterRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: wp('4%'), paddingVertical: hp('1%'), borderBottomWidth: 1, gap: wp('2%') },
  monthPickerBtn: { flexDirection: 'row', alignItems: 'center', gap: wp('1.5%'), paddingHorizontal: wp('3%'), paddingVertical: hp('0.9%'), borderRadius: wp('2.5%'), borderWidth: 1, backgroundColor: '#F9FAFB' },
  monthPickerText: { fontSize: wp('3.2%'), fontWeight: '500' },
  clearMonthBtn: { paddingHorizontal: wp('2%'), paddingVertical: hp('0.5%') },
  clearMonthText: { fontSize: wp('3%'), fontWeight: '600' },
  countText: { fontSize: wp('3%') },
  countTextRight: { marginLeft: 'auto' },
  statusFilterRow: { paddingHorizontal: wp('4%'), paddingVertical: hp('1%'), borderBottomWidth: 1 },
  statusFilterContent: { flexDirection: 'row', gap: wp('2%'), paddingRight: wp('2%') },
  statusPill: { paddingHorizontal: wp('3%'), paddingVertical: hp('0.75%'), borderRadius: 999, borderWidth: 1, backgroundColor: '#F9FAFB' },
  statusPillText: { fontSize: wp('3%'), fontWeight: '600' },
  monthDropdown: {},
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  pickerCard: { width: '85%', borderRadius: wp('4%'), paddingVertical: hp('2%'), paddingHorizontal: wp('2%'), elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
  yearNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: wp('4%'), paddingVertical: hp('1.2%') },
  yearArrow: { padding: wp('1.5%') },
  yearText: { fontSize: wp('4%'), fontWeight: '700' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: wp('3%') },
  monthCell: { width: '25%', alignItems: 'center', paddingVertical: hp('1.2%'), borderRadius: wp('2%') },
  monthCellActive: { backgroundColor: themeColors.primary },
  monthCellText: { fontSize: wp('3.5%'), fontWeight: '500' },
  monthCellTextActive: { color: '#fff' },
  monthCellTextInactive: { color: themeColors.text },
  allMonthBtn: { alignItems: 'center', marginHorizontal: wp('4%'), marginTop: hp('0.75%'), paddingVertical: hp('1%'), borderRadius: wp('2%') },
  allMonthBtnActive: { backgroundColor: '#E0E7FF' },
  allMonthText: { fontSize: wp('3.2%'), fontWeight: '600' },
  allMonthTextActive: { color: themeColors.primary },
  allMonthTextInactive: { color: themeColors.subtext },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: hp('5%') },
  list: { padding: wp('4%'), paddingBottom: hp('12.5%') },
  card: { borderRadius: wp('3%'), borderWidth: 1, padding: wp('4%'), marginBottom: hp('1.5%') },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: hp('1.5%') },
  houseBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: themeColors.primary, paddingHorizontal: wp('2%'), paddingVertical: hp('0.5%'), borderRadius: wp('2%'), gap: wp('1%') },
  houseText: { color: '#fff', fontWeight: '700', fontSize: wp('3%') },
  statusBadge: { paddingHorizontal: wp('2%'), paddingVertical: hp('0.25%'), borderRadius: wp('3%') },
  statusText: { fontWeight: '600', fontSize: wp('3%') },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: hp('1%') },
  amount: { fontSize: wp('4.5%'), fontWeight: '700' },
  date: { fontSize: wp('3%') },
  details: { flexDirection: 'row', flexWrap: 'wrap', gap: wp('3%'), marginBottom: hp('1%') },
  detailText: { fontSize: wp('3.2%') },
  methodRow: { flexDirection: 'row', alignItems: 'center', gap: wp('1%') },
  personInfo: { borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: hp('1%'), marginBottom: hp('1%'), gap: hp('0.75%') },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: wp('1%') },
  personLabel: { fontSize: wp('3.2%') },
  personValue: { fontSize: wp('3.2%'), fontWeight: '600' },
  noteBox: { padding: wp('2%'), borderRadius: wp('2%'), marginTop: hp('0.5%'), marginBottom: hp('1%') },
  noteText: { fontSize: wp('3%'), fontStyle: 'italic' },
  proofBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: hp('1%'), borderTopWidth: 1, borderTopColor: '#eee', marginTop: hp('0.5%'), gap: wp('1.5%') },
  proofText: { fontSize: wp('3.5%'), fontWeight: '500' },
  modalOverlay: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  modalCloseBtn: { position: 'absolute', top: hp('5%'), right: wp('5%'), zIndex: 10, padding: wp('2.5%') },
  fullImage: { width: '100%', height: '80%' },
  emptyText: { marginTop: hp('1.5%') },
});

export default PaymentLogsPage;
