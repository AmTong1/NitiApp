import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput, Platform } from 'react-native';
import { widthPercentageToDP as wp, heightPercentageToDP as hp } from 'react-native-responsive-screen';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { BASE_HOST as SERVER_URL } from './config';
import { showAlert } from '../components/GlobalAlert';

type FinancialProps = {
  navigation: any;
  darkMode: boolean;
  role?: string;
};

type Summary = {
  total_income: number;
  total_expense: number;
  balance?: number;
};

type Transaction = {
  id: number;
  type: 'income' | 'expense';
  amount: string | number;
  title: string;
  description: string;
  date: string;
  source: string;
  creator_name?: string | null;
  status?: string;
};

type ChartData = {
  label: string;
  income: number;
  expense: number;
};

const Financial: React.FC<FinancialProps> = ({ navigation, darkMode, role }) => {
  const [token, setToken] = useState<string>('');
  
  const [filter, setFilter] = useState<'all' | 'month' | 'week'>('month');
  
  const [summary, setSummary] = useState<Summary>({ total_income: 0, total_expense: 0 });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);

  const [visibility, setVisibility] = useState(false);
  const [pendingVisibilityRequest, setPendingVisibilityRequest] = useState<any>(null);
  const [isTogglingVisibility, setIsTogglingVisibility] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [newType, setNewType] = useState<'income'|'expense'>('income');
  const [newAmount, setNewAmount] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const bgColor = darkMode ? '#111827' : '#F3F4F6';
  const cardBgColor = darkMode ? '#1F2937' : '#FFFFFF';
  const textColor = darkMode ? '#F9FAFB' : '#111827';
  const subTextColor = darkMode ? '#9CA3AF' : '#6B7280';
  const borderColor = darkMode ? '#374151' : '#E5E7EB';

  const dynStyles = {
    textWhite: { color: '#FFF' },
    textSub: { color: subTextColor },
    borderInc: { borderLeftColor: '#10B981' },
    borderExp: { borderLeftColor: '#EF4444' },
    textInc: { color: '#10B981' },
    textExp: { color: '#EF4444' },
  };

  const formatMoney = (val: string | number) => {
    const num = Number(val);
    if (isNaN(num)) return '0.00';
    return num.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatTxDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const day = d.getDate().toString().padStart(2, '0');
      const month = (d.getMonth() + 1).toString().padStart(2, '0');
      const year = d.getFullYear() + 543;
      const hours = d.getHours().toString().padStart(2, '0');
      const mins = d.getMinutes().toString().padStart(2, '0');
      return `${day}/${month}/${year} ${hours}:${mins}`;
    } catch {
      return dateStr;
    }
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const tk = await AsyncStorage.getItem('token');
      if (tk) setToken(tk);

      const headers = { Authorization: `Bearer ${tk}` };

      const resSummary = await fetch(`${SERVER_URL}/financial/summary?filter=${filter}`, { headers });
      if (resSummary.ok) {
        const json = await resSummary.json();
        if (json.ok) setSummary(json.data);
      }

      const resVis = await fetch(`${SERVER_URL}/financial/visibility`, { headers });
      if (resVis.ok) {
        const json = await resVis.json();
        if (json.ok) {
          setVisibility(json.data.isVisible);
          setPendingVisibilityRequest(json.data.pendingRequest);
        }
      }

      const resTx = await fetch(`${SERVER_URL}/financial/transactions?filter=${filter}`, { headers });
      if (resTx.ok) {
        const json = await resTx.json();
        if (json.ok) setTransactions(json.data);
      }

      const resChart = await fetch(`${SERVER_URL}/financial/chart?filter=${filter === 'all' ? 'month' : filter}`, { headers });
      if (resChart.ok) {
        const json = await resChart.json();
        if (json.ok) setChartData(json.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleVisibility = async (action: 'show' | 'hide') => {
    try {
      setIsTogglingVisibility(true);
      const res = await fetch(`${SERVER_URL}/financial/visibility/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (json.ok) {
        if (json.data.status === 'waiting_approval') {
          showAlert('รออนุมัติ', 'ส่งคำขอแล้ว กรุณารอ SuperAdmin อนุมัติ');
        } else {
          showAlert('สำเร็จ', 'เปลี่ยนสถานะการแสดงผลแล้ว');
        }
        loadData();
      } else {
        showAlert('ผิดพลาด', json.error || 'ไม่สามารถเปลี่ยนสถานะได้');
      }
    } catch (e) {
      showAlert('ผิดพลาด', 'เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setIsTogglingVisibility(false);
    }
  };

  const handleAddRecord = async () => {
    if (!newAmount || !newTitle) {
      showAlert('ข้อผิดพลาด', 'กรุณากรอกจำนวนเงินและหัวข้อ');
      return;
    }
    try {
      setIsSubmitting(true);
      const res = await fetch(`${SERVER_URL}/financial/records`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: newType,
          amount: Number(newAmount),
          title: newTitle,
          description: newDesc,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        if (json.data?.status === 'waiting_add') {
          showAlert('รออนุมัติ', 'รายการถูกส่งไปรอการอนุมัติจาก SuperAdmin แล้ว');
        } else {
          showAlert('สำเร็จ', 'เพิ่มรายการเรียบร้อยแล้ว');
        }
        setModalVisible(false);
        setNewAmount('');
        setNewTitle('');
        setNewDesc('');
        loadData();
      } else {
        showAlert('ผิดพลาด', json.error || 'ไม่สามารถเพิ่มรายการได้');
      }
    } catch (e) {
      showAlert('ผิดพลาด', 'เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    showAlert('ยืนยันการลบ', 'คุณต้องการลบรายการนี้ใช่หรือไม่?', [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ลบ',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await fetch(`${SERVER_URL}/financial/records/${id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` }
            });
            const json = await res.json();
            if (json.ok) {
              if (json.data?.status === 'waiting_delete') {
                showAlert('รออนุมัติ', 'ส่งคำขอลบรายการให้ SuperAdmin อนุมัติแล้ว');
              }
              loadData();
            } else {
              showAlert('ผิดพลาด', 'ไม่สามารถลบรายการได้');
            }
          } catch (e) {
             showAlert('ผิดพลาด', 'เชื่อมต่อขัดข้อง');
          }
        }
      }
    ]);
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      
      const fileName = `financial_export_${Date.now()}.csv`;
      const sourceUrl = `${SERVER_URL}/financial/export?filter=${filter}`;
      
      if (Platform.OS === 'android') {
        const dir = ReactNativeBlobUtil.fs.dirs.DownloadDir;
        const targetPath = `${dir}/${fileName}`;
        
        await ReactNativeBlobUtil.config({
          fileCache: false,
          addAndroidDownloads: {
            useDownloadManager: true,
            notification: true,
            title: fileName,
            description: 'ดาวน์โหลดไฟล์บัญชี',
            path: targetPath,
            mime: 'text/csv',
            mediaScannable: true,
          },
        }).fetch('GET', sourceUrl, {
          Authorization: `Bearer ${token}`
        });
        
        showAlert('สำเร็จ', 'ดาวน์โหลดไฟล์บัญชีเรียบร้อยแล้ว กรุณาตรวจสอบในโฟลเดอร์ดาวน์โหลด หรือแถบแจ้งเตือน');
      } else {
        const res = await fetch(sourceUrl, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
          showAlert('ผิดพลาด', `ไม่สามารถดาวน์โหลดข้อมูลได้ (HTTP ${res.status})`);
          return;
        }
        const csvText = await res.text();
        const localPath = `${RNFS.DocumentDirectoryPath}/${fileName}`;
        await RNFS.writeFile(localPath, csvText, 'utf8');

        try {
          await Share.open({
            url: `file://${localPath}`,
            type: 'text/csv',
            title: 'แชร์ไฟล์บัญชี',
          });
        } catch (err: any) {
          if (err && err.message && !err.message.includes('User did not share') && !err.message.includes('cancel')) {
            showAlert('ผิดพลาด', `แชร์ไม่สำเร็จ: ${err.message}`);
          }
        }
      }

    } catch (e: any) {
      const errorMsg = e?.message || '';
      showAlert('ผิดพลาด', `เกิดข้อผิดพลาดในการส่งข้อมูล: ${errorMsg}`);
    } finally {
      setIsExporting(false);
    }
  };

  const isAdmin = role === 'admin' || role === 'superadmin';

  const renderChart = () => {
    if (chartData.length === 0) {
      return (
        <View style={styles.emptyChart}>
          <Text style={{ color: subTextColor }}>ไม่มีข้อมูลสถิติในช่วงเวลานี้</Text>
        </View>
      );
    }

    const maxVal = Math.max(...chartData.map(d => Math.max(d.income, d.expense)), 1);
    const chartHeight = hp('20%');

    return (
      <View style={styles.chartContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chartScroll}>
          {chartData.map((d, i) => {
            const hInc = (d.income / maxVal) * chartHeight;
            const hExp = (d.expense / maxVal) * chartHeight;
            const labelText = filter === 'month' ? (d.label ? new Date(d.label).getDate().toString() : '') : d.label;

            return (
              <View key={i} style={[styles.chartBarWrap, { height: chartHeight + hp('4%') }]}>
                <View style={[styles.chartBarBg, { height: chartHeight }]}>
                  <View style={[styles.chartBarInc, { height: hInc }]} />
                  <View style={[styles.chartBarExp, { height: hExp }]} />
                </View>
                <Text style={[styles.chartLabel, { color: subTextColor }]}>{labelText}</Text>
              </View>
            );
          })}
        </ScrollView>
        <View style={styles.chartLegendRow}>
          <View style={styles.chartLegendItem}>
            <View style={styles.chartLegendDotInc} />
            <Text style={[styles.chartLegendText, { color: subTextColor }]}>รายรับ</Text>
          </View>
          <View style={styles.chartLegendItem}>
            <View style={styles.chartLegendDotExp} />
            <Text style={[styles.chartLegendText, { color: subTextColor }]}>รายจ่าย</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      {}
      <View style={[styles.header, { backgroundColor: cardBgColor, borderBottomColor: borderColor }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBackBtn}>
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textColor }]}>บัญชีรายรับ - รายจ่าย</Text>
        {isAdmin ? (
          <TouchableOpacity onPress={handleExport} style={styles.headerExportBtn} disabled={isExporting}>
            {isExporting ? <ActivityIndicator size="small" color={textColor} /> : <Ionicons name="download-outline" size={24} color={textColor} />}
          </TouchableOpacity>
        ) : (
          <View style={styles.spacer24} /> 
        )}
      </View>

      <ScrollView contentContainerStyle={styles.mainScroll}>
        
        {}
        <View style={[styles.filterContainer, { backgroundColor: cardBgColor }]}>
            {(['all', 'month', 'week'] as const).map((f) => (
              <TouchableOpacity 
                key={f} 
                style={[styles.filterBtn, filter === f ? styles.filterBtnActive : null]}
                onPress={() => setFilter(f)}
              >
                <Text style={[styles.filterText, filter === f ? dynStyles.textWhite : dynStyles.textSub]}>
                  {f === 'all' ? 'ทั้งหมด' : f === 'month' ? 'เดือนนี้' : 'สัปดาห์นี้'}
                </Text>
              </TouchableOpacity>
            ))}
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#3B82F6" style={styles.loadingSpinner} />
        ) : (
          <>
            {}
            {isAdmin && (
              <View style={[styles.visibilityCard, { backgroundColor: cardBgColor, borderColor }]}>
                <View style={styles.visibilityCardInner}>
                  <Text style={[styles.visibilityTitle, { color: textColor }]}>แสดงยอดเงินให้ลูกบ้านเห็น</Text>
                  <Text style={[styles.visibilityStatus, visibility ? styles.colorSuccess : styles.colorDanger]}>
                    {visibility ? 'เปิดใช้งานอยู่' : 'ซ่อนการแสดงผล'}
                  </Text>
                  {pendingVisibilityRequest && (
                    <Text style={styles.pendingVisibilityText}>
                      * คำขอ {pendingVisibilityRequest.action === 'show' ? 'เปิด' : 'ปิด'} รออนุมัติ
                    </Text>
                  )}
                </View>
                <View style={styles.visibilityActionArea}>
                  <TouchableOpacity 
                    style={[styles.toggleBtn, pendingVisibilityRequest ? styles.toggleBtnPending : (visibility ? styles.toggleBtnHide : styles.toggleBtnShow)]}
                    onPress={() => handleToggleVisibility(visibility ? 'hide' : 'show')}
                    disabled={!!pendingVisibilityRequest || isTogglingVisibility}
                  >
                    <Text style={styles.toggleBtnText}>
                      {pendingVisibilityRequest ? 'รออนุมัติ' : (visibility ? 'กดเพื่อซ่อน' : 'กดเพื่อเปิด')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {}
            {(!isAdmin && !visibility) ? null : (
              <View style={styles.summaryRow}>
                <View style={[styles.summaryCard, styles.summaryCardInc]}>
                  <Text style={styles.summaryTitleInc}>รายรับรวม</Text>
                  <Text style={styles.summaryValueInc}>
                    ฿{formatMoney(summary.total_income)}
                  </Text>
                </View>
                <View style={[styles.summaryCard, styles.summaryCardExp]}>
                  <Text style={styles.summaryTitleExp}>รายจ่ายรวม</Text>
                  <Text style={styles.summaryValueExp}>
                    ฿{formatMoney(summary.total_expense)}
                  </Text>
                </View>
              </View>
            )}
            
            {(!isAdmin && !visibility) ? null : (
              <View style={[styles.balanceCard, styles.balanceCardBg]}>
                <Text style={styles.balanceTitle}>ยอดคงเหลือ (Balance)</Text>
                <Text style={styles.balanceValue}>
                  ฿{formatMoney(summary.balance || 0)}
                </Text>
              </View>
            )}

            {}
            <View style={[styles.chartCard, { backgroundColor: cardBgColor }]}>
              <Text style={[styles.chartCardTitle, { color: textColor }]}>สถิติ {filter === 'month' ? 'รายเดือน' : filter === 'week' ? 'รายสัปดาห์' : ''}</Text>
              {renderChart()}
            </View>

            {}
            <Text style={[styles.txListTitle, { color: textColor }]}>
              รายการล่าสุด
            </Text>
            {transactions.length === 0 ? (
              <Text style={[styles.emptyTx, { color: subTextColor }]}>ไม่มีรายการ</Text>
            ) : (
              transactions.map((tx) => {
                const isPending = isAdmin && (tx.status === 'waiting_add' || tx.status === 'waiting_delete');
                return (
                  <View key={`${tx.source}-${tx.id}`} style={[
                    styles.txCard, 
                    { backgroundColor: cardBgColor }, 
                    tx.type === 'income' ? dynStyles.borderInc : dynStyles.borderExp,
                    isPending && styles.txCardPending
                  ]}>
                    <View style={styles.txRowFlex}>
                      <Text style={[styles.txRowTitle, { color: textColor }]}>
                        {isAdmin ? tx.title : (tx.title.startsWith('ค่าส่วนกลางบ้าน') ? 'ค่าส่วนกลาง' : tx.title)}
                        {isAdmin && isPending && <Text style={styles.txPendingBadge}> (รออนุมัติ)</Text>}
                      </Text>
                      {isAdmin ? (
                        <Text style={[styles.txRowDate, { color: subTextColor }]}>
                          {formatTxDate(tx.date)} • {tx.source === 'manual' ? (tx.creator_name ? `บันทึกโดย ${tx.creator_name}` : 'บันทึก') : 'ระบบ'}
                        </Text>
                      ) : (
                        <Text style={[styles.txRowDate, { color: subTextColor }]}>
                          {formatTxDate(tx.date)}
                        </Text>
                      )}
                    </View>
                  <View style={styles.txRowEnd}>
                    <Text style={[styles.txRowAmount, tx.type === 'income' ? dynStyles.textInc : dynStyles.textExp, isPending && styles.txAmountPending]}>
                      {tx.type === 'income' ? '+' : '-'}฿{formatMoney(tx.amount)}
                    </Text>
                    {isAdmin && tx.source === 'manual' && !isPending && (
                      <TouchableOpacity onPress={() => handleDelete(tx.id)} style={styles.txDelBtn}>
                         <Ionicons name="trash-outline" size={wp('4%')} color="#EF4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      {}
      {isAdmin && (
        <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={32} color="#FFF" />
        </TouchableOpacity>
      )}

      {}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: cardBgColor }]}>
            <Text style={[styles.modalTitle, { color: textColor }]}>เพิ่มรายการใหม่</Text>
            
            <View style={styles.typeSelector}>
              <TouchableOpacity 
                style={[styles.typeBtn, newType === 'income' ? styles.typeBtnIncActive : null]}
                onPress={() => setNewType('income')}
              >
                <Text style={[styles.typeBtnText, newType === 'income' ? dynStyles.textWhite : dynStyles.textSub]}>รายรับ</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.typeBtn, newType === 'expense' ? styles.typeBtnExpActive : null]}
                onPress={() => setNewType('expense')}
              >
                <Text style={[styles.typeBtnText, newType === 'expense' ? dynStyles.textWhite : dynStyles.textSub]}>รายจ่าย</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.input, { color: textColor, borderColor }]}
              placeholder="หัวข้อรายการ"
              placeholderTextColor={subTextColor}
              value={newTitle}
              onChangeText={setNewTitle}
            />
            
            <TextInput
              style={[styles.input, { color: textColor, borderColor }]}
              placeholder="จำนวนเงิน (บาท)"
              placeholderTextColor={subTextColor}
              value={newAmount}
              onChangeText={setNewAmount}
              keyboardType="numeric"
            />

            <TextInput
              style={[styles.input, styles.inputDesc, { color: textColor, borderColor }]}
              placeholder="รายละเอียด (ถ้ามี)"
              placeholderTextColor={subTextColor}
              value={newDesc}
              onChangeText={setNewDesc}
              multiline
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setModalVisible(false)} disabled={isSubmitting}>
                <Text style={styles.modalCancelText}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleAddRecord} disabled={isSubmitting}>
                {isSubmitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalSaveText}>บันทึก</Text>}
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
  visibilityCard: { flexDirection: 'row', justifyContent: 'space-between', padding: wp('4%'), borderRadius: wp('3%'), marginBottom: hp('1.5%'), borderWidth: 1 },
  visibilityTitle: { fontSize: wp('3.8%'), fontWeight: '600' },
  visibilityStatus: { fontSize: wp('4%'), fontWeight: 'bold', marginTop: hp('0.5%') },
  toggleBtn: { paddingHorizontal: wp('4%'), paddingVertical: hp('1%'), borderRadius: wp('2%'), alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: hp('1.5%'), paddingHorizontal: wp('4%'), borderBottomWidth: 1 },
  headerTitle: { fontSize: wp('4.5%'), fontWeight: 'bold' },
  headerBackBtn: { padding: wp('2%') },
  headerExportBtn: { padding: wp('2%') },
  spacer24: { width: 24, padding: wp('2%') },
  mainScroll: { padding: wp('4%'), paddingBottom: hp('10%') },
  filterContainer: { flexDirection: 'row', borderRadius: wp('2%'), padding: wp('1%'), marginBottom: hp('2%') },
  filterBtn: { flex: 1, paddingVertical: hp('1%'), alignItems: 'center', borderRadius: wp('1.5%') },
  filterBtnActive: { backgroundColor: '#3B82F6' },
  filterText: { fontSize: wp('3.5%'), fontWeight: '600' },
  loadingSpinner: { marginTop: hp('5%') },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: hp('1.5%') },
  summaryCard: { flex: 0.48, padding: wp('4%'), borderRadius: wp('3%') },
  summaryCardInc: { backgroundColor: '#ECFDF5' },
  summaryTitleInc: { color: '#047857', fontSize: wp('3.5%') },
  summaryValueInc: { color: '#065F46', fontSize: wp('4.5%'), fontWeight: 'bold', marginTop: hp('0.5%') },
  summaryCardExp: { backgroundColor: '#FEF2F2' },
  summaryTitleExp: { color: '#B91C1C', fontSize: wp('3.5%') },
  summaryValueExp: { color: '#991B1B', fontSize: wp('4.5%'), fontWeight: 'bold', marginTop: hp('0.5%') },
  balanceCard: { padding: wp('5%'), borderRadius: wp('3%'), marginBottom: hp('2%'), alignItems: 'center' },
  balanceCardBg: { backgroundColor: '#EFF6FF' },
  balanceTitle: { color: '#1D4ED8', fontSize: wp('4%'), fontWeight: 'bold' },
  balanceValue: { color: '#1E3A8A', fontSize: wp('7%'), fontWeight: 'bold', marginTop: hp('0.5%') },
  chartCard: { padding: wp('4%'), borderRadius: wp('3%'), marginTop: hp('1%') },
  chartCardTitle: { fontSize: wp('4%'), fontWeight: 'bold' },
  emptyChart: { height: hp('20%'), justifyContent: 'center', alignItems: 'center' },
  chartContainer: { marginTop: hp('2%') },
  chartScroll: { paddingHorizontal: wp('2%') },
  chartBarWrap: { alignItems: 'center', marginHorizontal: wp('2%'), justifyContent: 'flex-end' },
  chartBarBg: { flexDirection: 'row', alignItems: 'flex-end' },
  chartBarInc: { width: wp('3%'), backgroundColor: '#10B981', borderTopLeftRadius: 4, borderTopRightRadius: 4, marginRight: 2 },
  chartBarExp: { width: wp('3%'), backgroundColor: '#EF4444', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  chartLabel: { fontSize: wp('2.5%'), marginTop: hp('1%') },
  chartLegendRow: { flexDirection: 'row', justifyContent: 'center', marginTop: hp('1%'), gap: wp('4%') },
  chartLegendItem: { flexDirection: 'row', alignItems: 'center' },
  chartLegendDotInc: { width: 10, height: 10, backgroundColor: '#10B981', borderRadius: 5, marginRight: 4 },
  chartLegendDotExp: { width: 10, height: 10, backgroundColor: '#EF4444', borderRadius: 5, marginRight: 4 },
  chartLegendText: { fontSize: wp('3%') },
  txListTitle: { fontSize: wp('4.5%'), fontWeight: 'bold', marginTop: hp('3%'), marginBottom: hp('1.5%') },
  emptyTx: { textAlign: 'center', marginTop: hp('2%') },
  txCard: { flexDirection: 'row', padding: wp('4%'), borderRadius: wp('2%'), marginBottom: hp('1%'), borderLeftWidth: 4, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  txRowFlex: { flex: 1 },
  txRowTitle: { fontSize: wp('4%'), fontWeight: '500' },
  txRowDate: { fontSize: wp('3%'), marginTop: 4 },
  txRowEnd: { alignItems: 'flex-end' },
  txRowAmount: { fontSize: wp('4%'), fontWeight: 'bold' },
  txDelBtn: { marginLeft: 8, padding: 4 },
  visibilityCardInner: { flex: 1 },
  colorSuccess: { color: '#10B981' },
  colorDanger: { color: '#EF4444' },
  pendingVisibilityText: { color: '#F59E0B', fontSize: wp('3%'), marginTop: 4 },
  visibilityActionArea: { alignItems: 'flex-end', justifyContent: 'center' },
  toggleBtnPending: { backgroundColor: '#9CA3AF' },
  toggleBtnShow: { backgroundColor: '#10B981' },
  toggleBtnHide: { backgroundColor: '#EF4444' },
  toggleBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: wp('3.5%') },
  txCardPending: { opacity: 0.5 },
  txPendingBadge: { color: '#F59E0B', fontSize: wp('3%') },
  txAmountPending: { color: '#9CA3AF' },
  fab: { position: 'absolute', right: wp('5%'), bottom: hp('5%'), width: 60, height: 60, borderRadius: 30, backgroundColor: '#3B82F6', justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', borderRadius: wp('4%'), padding: wp('5%') },
  modalTitle: { fontSize: wp('5%'), fontWeight: 'bold', marginBottom: hp('2%'), textAlign: 'center' },
  typeSelector: { flexDirection: 'row', marginBottom: hp('2%') },
  typeBtn: { flex: 1, paddingVertical: hp('1.5%'), alignItems: 'center', borderRadius: wp('2%'), borderWidth: 1, borderColor: '#E5E7EB', marginHorizontal: wp('1%') },
  typeBtnIncActive: { backgroundColor: '#10B981' },
  typeBtnExpActive: { backgroundColor: '#EF4444' },
  typeBtnText: { fontWeight: 'bold' },
  input: { borderWidth: 1, borderRadius: wp('2%'), padding: wp('3%'), marginBottom: hp('1.5%'), fontSize: wp('4%') },
  inputDesc: { height: hp('10%'), textAlignVertical: 'top' },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: hp('2%'), gap: wp('3%') },
  modalCancelBtn: { paddingVertical: hp('1.5%'), paddingHorizontal: wp('5%') },
  modalSaveBtn: { backgroundColor: '#3B82F6', paddingVertical: hp('1.5%'), paddingHorizontal: wp('6%'), borderRadius: wp('2%'), justifyContent: 'center' },
  modalCancelText: { color: '#EF4444', fontWeight: 'bold' },
  modalSaveText: { color: '#FFF', fontWeight: 'bold' },
});

export default Financial;
