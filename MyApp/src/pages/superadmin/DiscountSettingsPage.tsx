import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, ScrollView, TextInput, KeyboardAvoidingView, Platform, Modal
} from 'react-native';
import { widthPercentageToDP as wp, heightPercentageToDP as hp } from 'react-native-responsive-screen';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showAlert } from '../../components/GlobalAlert';
import { getBaseUrl } from '../SuperAdmin';

const themeColors = {
  primary: '#4F46E5',
  bg: '#F8FAFC',
  cardBg: '#FFFFFF',
  text: '#0F172A',
  subtext: '#64748B',
  border: '#E2E8F0',
  warning: '#F59E0B',
  success: '#10B981',
  danger: '#EF4444',
};

interface DiscountSettingsPageProps {
  onBack: () => void;
  darkMode?: boolean;
}

const DiscountSettingsPage: React.FC<DiscountSettingsPageProps> = ({ onBack, darkMode: _darkMode = false }) => {
  const [loading, setLoading] = useState(true);
  const [discountConfigs, setDiscountConfigs] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<any | null>(null);
  
  const [dcCycle, setDcCycle] = useState(12);
  const [dcType, setDcType] = useState<'percentage' | 'fixed'>('percentage');
  const [dcValue, setDcValue] = useState('');
  const [savingDiscount, setSavingDiscount] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const cycleLabels: Record<number, string> = { 3: 'ราย 3 เดือน', 6: 'ราย 6 เดือน', 12: 'รายปี (12 เดือน)' };
  const cycleIcons: Record<number, string> = { 3: 'calendar-outline', 6: 'calendar', 12: 'trophy' };
  const cycleColors: Record<number, string> = { 3: '#0EA5E9', 6: '#8B5CF6', 12: '#F59E0B' };
  const cycleBgs: Record<number, string> = { 3: '#F0F9FF', 6: '#F5F3FF', 12: '#FFFBEB' };

  const colors = themeColors;

  const fetchDiscounts = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${getBaseUrl()}/discount/configs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDiscountConfigs(Array.isArray(data.data) ? data.data : []);
        setPendingRequests(Array.isArray(data.pending) ? data.pending : []);
      }
    } catch (e) { 
      console.log('fetchDiscounts error:', e); 
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDiscount = async () => {
    const val = Number(dcValue);
    if (!val || val <= 0) { 
      showAlert('ข้อมูลไม่ถูกต้อง', 'กรุณากรอกค่าส่วนลดที่มากกว่า 0'); 
      return; 
    }
    if (dcType === 'percentage' && val > 100) { 
      showAlert('ข้อมูลไม่ถูกต้อง', 'ส่วนลดร้อยละต้องไม่เกิน 100'); 
      return; 
    }
    if (!editingDiscount) {
      const isDuplicate = discountConfigs.some(d => d.cycle_months === dcCycle) || 
                          pendingRequests.some(pr => pr.cycle_months === dcCycle);
      if (isDuplicate) {
        showAlert('ข้อมูลซ้ำ', 'รอบการชำระเงินนี้ได้รับการตั้งค่าแล้ว หรืออยู่ระหว่างรออนุมัติ');
        return;
      }
    }
    try {
      setSavingDiscount(true);
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${getBaseUrl()}/discount/configs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cycle_months: dcCycle, discount_type: dcType, discount_value: val }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setShowDiscountModal(false);
        setEditingDiscount(null);
        setSuccessMessage(data.message || 'บันทึกส่วนลดและรอการอนุมัติเรียบร้อย');
        setShowSuccessModal(true);
        setTimeout(() => setShowSuccessModal(false), 2000);
        fetchDiscounts();
      } else {
        showAlert('Error', data.message || 'บันทึกไม่สำเร็จ');
      }
    } catch { 
      showAlert('Error', 'เกิดข้อผิดพลาด'); 
    } finally { 
      setSavingDiscount(false); 
    }
  };

  const handleDeleteDiscount = async (cycle: number) => {
    try {
      setSavingDiscount(true);
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${getBaseUrl()}/discount/configs/${cycle}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setShowDeleteConfirm(null);
        setSuccessMessage(data.message || 'สร้างคำขอลบส่วนลดเรียบร้อย');
        setShowSuccessModal(true);
        setTimeout(() => setShowSuccessModal(false), 2000);
        fetchDiscounts();
      } else { 
        showAlert('Error', data.message || 'ลบไม่สำเร็จ'); 
      }
    } catch { 
      showAlert('Error', 'เกิดข้อผิดพลาด'); 
    } finally { 
      setSavingDiscount(false); 
    }
  };

  const openAddDiscount = () => {
    const usedCycles = discountConfigs.map(c => c.cycle_months);
    const pendingCycles = pendingRequests.map(r => r.cycle_months);
    const available = [3, 6, 12].filter(c => !usedCycles.includes(c) && !pendingCycles.includes(c));
    if (available.length === 0) { 
      showAlert('ครบแล้ว', 'ตั้งค่าส่วนลดครบทุกรายการแล้ว (หรือมีรายการที่กำลังรออนุมัติอยู่)'); 
      return; 
    }
    setEditingDiscount(null);
    setDcCycle(available[0]);
    setDcType('percentage');
    setDcValue('');
    setShowDiscountModal(true);
  };

  const openEditDiscount = (cfg: any) => {
    setEditingDiscount(cfg);
    setDcCycle(cfg.cycle_months);
    setDcType(cfg.discount_type);
    setDcValue(String(cfg.discount_value));
    setShowDiscountModal(true);
  };

  useEffect(() => {
    fetchDiscounts();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {}
      <View style={[styles.header, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>ตั้งค่าส่วนลด</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <KeyboardAvoidingView 
          style={styles.flex1} 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView 
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {}
            <View style={styles.infoBanner}>
              <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
              <Text style={styles.infoBannerText}>
                ส่วนลดนี้จะใช้เพื่อลดค่าส่วนกลางให้กับลูกบ้านที่เลือกจ่ายแบบรายงวด โดยการสร้างหรือเปลี่ยนแปลงจะมีผลเมื่อได้รับการอนุมัติในหน้า "รายการตรวจสอบ" แล้วเท่านั้น
              </Text>
            </View>

            {}
            <View style={styles.sectionHeader}>
              <Ionicons name="pricetag" size={20} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>ส่วนลดรายงวดที่มีผลใช้งาน</Text>
            </View>

            {discountConfigs.length === 0 && pendingRequests.length === 0 && (
              <View style={[styles.emptyBox, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                <Ionicons name="pricetags-outline" size={48} color={colors.subtext} style={{ marginBottom: hp('1%') }} />
                <Text style={[styles.emptyText, { color: colors.text }]}>ยังไม่มีการตั้งค่าส่วนลด</Text>
                <Text style={[styles.emptySubtext, { color: colors.subtext }]}>กดปุ่ม "เพิ่มส่วนลด" ด้านล่างเพื่อเริ่มระบุส่วนลดให้กับงวดจ่ายเงิน</Text>
              </View>
            )}

            {}
            {discountConfigs.map(cfg => (
              <View 
                key={cfg.id} 
                style={[
                  styles.card, 
                  { 
                    backgroundColor: cycleBgs[cfg.cycle_months] || colors.cardBg, 
                    borderColor: cycleColors[cfg.cycle_months] || colors.border 
                  }
                ]}
              >
                <View style={styles.cardTop}>
                  <View style={[styles.iconCircle, { backgroundColor: (cycleColors[cfg.cycle_months] || colors.primary) + '15' }]}>
                    <Ionicons name={(cycleIcons[cfg.cycle_months] || 'calendar') as any} size={22} color={cycleColors[cfg.cycle_months]} />
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={[styles.cardLabel, { color: colors.text }]}>{cycleLabels[cfg.cycle_months]}</Text>
                    <Text style={[styles.cardValue, { color: cycleColors[cfg.cycle_months] }]}>
                      ลด {cfg.discount_value}{cfg.discount_type === 'percentage' ? '%' : ' บาท'}
                    </Text>
                  </View>
                  <View style={[styles.typeBadge, cfg.discount_type === 'percentage' ? styles.bgPercentage : styles.bgFixed]}>
                    <Text style={[styles.typeBadgeText, cfg.discount_type === 'percentage' ? styles.textPercentage : styles.textFixed]}>
                      {cfg.discount_type === 'percentage' ? '%' : '฿'}
                    </Text>
                  </View>
                </View>
                <View style={styles.cardActions}>
                  {pendingRequests.some(pr => pr.cycle_months === cfg.cycle_months) ? (
                    <View style={styles.pendingBadgeInline}>
                      <Ionicons name="time-outline" size={14} color={colors.warning} />
                      <Text style={styles.pendingBadgeInlineText}>อยู่ระหว่างรออนุมัติการเปลี่ยนแปลง</Text>
                    </View>
                  ) : (
                    <>
                      <TouchableOpacity style={[styles.actionBtn, styles.editBtn]} onPress={() => openEditDiscount(cfg)}>
                        <Ionicons name="pencil" size={14} color={colors.primary} />
                        <Text style={[styles.actionBtnText, styles.textEdit]}>แก้ไข</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={() => setShowDeleteConfirm(cfg.cycle_months)}>
                        <Ionicons name="trash-outline" size={14} color={colors.danger} />
                        <Text style={[styles.actionBtnText, styles.textDelete]}>ลบ</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            ))}

            {}
            {pendingRequests.length > 0 && (
              <View style={styles.pendingSection}>
                <View style={styles.pendingHeader}>
                  <Ionicons name="time" size={18} color={colors.warning} />
                  <Text style={styles.pendingTitle}>รายการที่รอการอนุมัติ</Text>
                </View>
                {pendingRequests.map(pr => (
                  <View key={pr.id} style={styles.pendingCard}>
                    <Ionicons name="ellipse" size={8} color={colors.warning} />
                    <Text style={styles.pendingText}>
                      ร้องขอ {pr.action === 'delete' ? 'ลบ' : 'ตั้งค่า'} {cycleLabels[pr.cycle_months]}
                      {pr.action !== 'delete' && ` → ลด ${pr.discount_value}${pr.discount_type === 'percentage' ? '%' : ' บาท'}`}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {}
            {[3, 6, 12].some(c => !discountConfigs.some(d => d.cycle_months === c) && !pendingRequests.some(pr => pr.cycle_months === c)) && (
              <TouchableOpacity style={[styles.addBtn, { borderColor: colors.primary }]} onPress={openAddDiscount}>
                <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                <Text style={[styles.addBtnText, { color: colors.primary }]}>เพิ่มข้อกำหนดส่วนลด</Text>
              </TouchableOpacity>
            )}

            <View style={{ height: hp('8%') }} />
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {}
      <Modal visible={showDiscountModal} transparent animationType="fade" onRequestClose={() => !savingDiscount && setShowDiscountModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.cardBg }]}>
            <View style={[styles.modalIconCircle, { backgroundColor: colors.primary + '15' }]}>
              <Ionicons name="pricetag" size={32} color={colors.primary} />
            </View>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {editingDiscount ? 'แก้ไขส่วนลด' : 'เพิ่มส่วนลดใหม่'}
            </Text>

            {}
            {!editingDiscount && (
              <View style={styles.pickerRow}>
                {[3, 6, 12].filter(c => !discountConfigs.some(d => d.cycle_months === c)).map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.pickerBtn, dcCycle === c && { backgroundColor: cycleColors[c], borderColor: cycleColors[c] }, dcCycle !== c && { borderColor: colors.border }]}
                    onPress={() => setDcCycle(c)}
                  >
                    <Ionicons name={(cycleIcons[c] || 'calendar') as any} size={14} color={dcCycle === c ? '#fff' : colors.subtext} />
                    <Text style={[styles.pickerText, dcCycle === c ? styles.textWhite : { color: colors.text }]}>{cycleLabels[c]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {editingDiscount && (
              <View style={[styles.pickerBtn, { backgroundColor: cycleColors[dcCycle], borderColor: cycleColors[dcCycle] }, styles.editPickerBtn]}>
                <Ionicons name={(cycleIcons[dcCycle] || 'calendar') as any} size={14} color="#fff" />
                <Text style={[styles.pickerText, styles.textWhite]}>{cycleLabels[dcCycle]}</Text>
              </View>
            )}

            {}
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleBtn, dcType === 'percentage' && styles.toggleActive]}
                onPress={() => setDcType('percentage')}
              >
                <Text style={[styles.toggleText, dcType === 'percentage' && styles.toggleTextActive]}>ร้อยละ (%)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, dcType === 'fixed' && styles.toggleActive]}
                onPress={() => setDcType('fixed')}
              >
                <Text style={[styles.toggleText, dcType === 'fixed' && styles.toggleTextActive]}>คงที่ (บาท)</Text>
              </TouchableOpacity>
            </View>

            {}
            <TextInput
              style={[styles.input, styles.valueInput, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }]}
              placeholder={dcType === 'percentage' ? 'เช่น 10' : 'เช่น 500'}
              placeholderTextColor={colors.subtext}
              value={dcValue}
              onChangeText={v => setDcValue(v.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
              autoFocus
            />
            <Text style={[styles.helperText, { color: colors.subtext }]}>
              {dcType === 'percentage' ? `ลดคำนวณแบบ ${dcValue || '0'}% จากยอดรวม` : `ลดเงินคงที่ ${dcValue || '0'} บาท จากยอดรวม`}
            </Text>

            {}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.btnCancel, { borderColor: colors.border }]}
                onPress={() => { setShowDiscountModal(false); setEditingDiscount(null); }}
                disabled={savingDiscount}
              >
                <Text style={[styles.modalBtnText, { color: colors.subtext }]}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.btnSave]}
                onPress={handleSaveDiscount}
                disabled={savingDiscount}
              >
                {savingDiscount ? <ActivityIndicator color="#fff" size="small" /> : (
                  <>
                    <Ionicons name="checkmark" size={18} color="#fff" />
                    <Text style={[styles.modalBtnText, styles.textWhite]}>บันทึก</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {}
      <Modal visible={showDeleteConfirm !== null} transparent animationType="fade" onRequestClose={() => setShowDeleteConfirm(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.cardBg }]}>
            <View style={[styles.modalIconCircle, { backgroundColor: colors.danger + '15' }]}>
              <Ionicons name="trash" size={32} color={colors.danger} />
            </View>
            <Text style={[styles.modalTitle, { color: colors.text }]}>ยืนยันการขออนุมัติลบ</Text>
            <Text style={[styles.confirmText, { color: colors.subtext }]}>
              คุณต้องการสร้างคำขออนุมัติลบส่วนลดของ "{cycleLabels[showDeleteConfirm || 0]}" หรือไม่? การลบจะมีผลเมื่อได้รับการอนุมัติแล้ว
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.btnCancel, { borderColor: colors.border }]}
                onPress={() => setShowDeleteConfirm(null)}
                disabled={savingDiscount}
              >
                <Text style={[styles.modalBtnText, { color: colors.subtext }]}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.btnDelete]}
                onPress={() => showDeleteConfirm && handleDeleteDiscount(showDeleteConfirm)}
                disabled={savingDiscount}
              >
                {savingDiscount ? <ActivityIndicator color="#fff" size="small" /> : (
                  <>
                    <Ionicons name="trash" size={16} color="#fff" />
                    <Text style={[styles.modalBtnText, styles.textWhite]}>ลบส่วนลด</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {}
      <Modal visible={showSuccessModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.cardBg }]}>
            <View style={[styles.modalIconCircle, { backgroundColor: colors.success + '15' }]}>
              <Ionicons name="checkmark-circle" size={40} color={colors.success} />
            </View>
            <Text style={[styles.modalTitle, { color: colors.success }]}>สำเร็จ</Text>
            <Text style={[styles.confirmText, { color: colors.subtext }]}>{successMessage}</Text>
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
    gap: wp('3%'),
  },
  backBtn: {
    padding: wp('1%'),
  },
  headerTitle: {
    fontSize: wp('4.8%'),
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flex1: {
    flex: 1,
  },
  listContent: {
    padding: wp('4.5%'),
  },
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: wp('3%'),
    padding: wp('3.5%'),
    gap: wp('2.5%'),
    marginBottom: hp('2.5%'),
  },
  infoBannerText: {
    flex: 1,
    fontSize: wp('3.2%'),
    color: '#3730A3',
    lineHeight: wp('4.6%'),
    fontWeight: '500',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp('2%'),
    marginBottom: hp('1.5%'),
  },
  sectionTitle: {
    fontSize: wp('4.2%'),
    fontWeight: '700',
  },
  emptyBox: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: wp('4%'),
    padding: wp('8%'),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: hp('2%'),
  },
  emptyText: {
    fontSize: wp('4%'),
    fontWeight: '700',
    marginTop: hp('1%'),
  },
  emptySubtext: {
    fontSize: wp('3.2%'),
    textAlign: 'center',
    marginTop: hp('0.5%'),
    lineHeight: wp('4.5%'),
  },
  card: {
    borderWidth: 1.5,
    borderRadius: wp('4%'),
    padding: wp('4%'),
    marginBottom: hp('1.5%'),
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 1.5,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp('3%'),
  },
  iconCircle: {
    width: wp('11%'),
    height: wp('11%'),
    borderRadius: wp('5.5%'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
  },
  cardLabel: {
    fontSize: wp('3.8%'),
    fontWeight: '600',
  },
  cardValue: {
    fontSize: wp('5%'),
    fontWeight: '800',
    marginTop: hp('0.3%'),
  },
  typeBadge: {
    paddingHorizontal: wp('2.5%'),
    paddingVertical: hp('0.5%'),
    borderRadius: wp('2%'),
  },
  typeBadgeText: {
    fontSize: wp('3.5%'),
    fontWeight: '700',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: wp('2%'),
    marginTop: hp('1.5%'),
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    paddingTop: hp('1.2%'),
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp('1%'),
    paddingHorizontal: wp('3.5%'),
    paddingVertical: hp('0.8%'),
    borderRadius: wp('2%'),
  },
  editBtn: {
    backgroundColor: '#EEF2FF',
  },
  deleteBtn: {
    backgroundColor: '#FEF2F2',
  },
  actionBtnText: {
    fontSize: wp('3.2%'),
    fontWeight: '600',
  },
  textEdit: {
    color: '#4F46E5',
  },
  textDelete: {
    color: '#EF4444',
  },
  pendingSection: {
    marginTop: hp('1%'),
    marginBottom: hp('2.5%'),
  },
  pendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp('1.5%'),
    marginBottom: hp('1%'),
  },
  pendingTitle: {
    fontSize: wp('3.6%'),
    fontWeight: '700',
    color: '#D97706',
  },
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp('2%'),
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D',
    borderWidth: 1,
    borderRadius: wp('3%'),
    padding: wp('3.5%'),
    marginBottom: hp('1%'),
  },
  pendingText: {
    fontSize: wp('3.2%'),
    color: '#B45309',
    fontWeight: '600',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: wp('2%'),
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: wp('3.5%'),
    paddingVertical: hp('1.6%'),
    marginTop: hp('1%'),
    backgroundColor: '#FFFFFF',
  },
  addBtnText: {
    fontSize: wp('3.8%'),
    fontWeight: '700',
  },
  bgPercentage: {
    backgroundColor: '#DBEAFE',
  },
  bgFixed: {
    backgroundColor: '#FEF3C7',
  },
  textPercentage: {
    color: '#2563EB',
  },
  textFixed: {
    color: '#D97706',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: wp('6%'),
  },
  modalContent: {
    width: '100%',
    maxWidth: 340,
    borderRadius: wp('5%'),
    padding: wp('6%'),
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 8,
  },
  modalIconCircle: {
    width: wp('14%'),
    height: wp('14%'),
    borderRadius: wp('7%'),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: hp('1.5%'),
  },
  modalTitle: {
    fontSize: wp('4.6%'),
    fontWeight: '800',
    marginBottom: hp('2%'),
  },
  pickerRow: {
    flexDirection: 'row',
    gap: wp('2%'),
    marginBottom: hp('2%'),
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp('1.5%'),
    borderWidth: 1.5,
    borderRadius: wp('3%'),
    paddingHorizontal: wp('3%'),
    paddingVertical: hp('1%'),
  },
  pickerText: {
    fontSize: wp('3.3%'),
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    marginBottom: hp('2%'),
    borderRadius: wp('2.5%'),
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    width: '100%',
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: hp('1.2%'),
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  toggleActive: {
    backgroundColor: '#4F46E5',
  },
  toggleText: {
    fontSize: wp('3.5%'),
    fontWeight: '600',
    color: '#64748B',
  },
  toggleTextActive: {
    color: '#FFFFFF',
  },
  input: {
    borderWidth: 1.5,
    borderRadius: wp('3%'),
    padding: wp('3%'),
    fontSize: wp('3.8%'),
    width: '100%',
  },
  valueInput: {
    textAlign: 'center',
    fontSize: wp('6%'),
    fontWeight: '800',
    marginBottom: hp('1%'),
  },
  helperText: {
    fontSize: wp('3.2%'),
    textAlign: 'center',
    marginBottom: hp('2.5%'),
  },
  modalButtons: {
    flexDirection: 'row',
    gap: wp('3%'),
    width: '100%',
  },
  modalBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: hp('1.6%'),
    borderRadius: wp('3%'),
    gap: wp('1.5%'),
  },
  btnCancel: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
  },
  modalBtnText: {
    fontSize: wp('3.8%'),
    fontWeight: '700',
  },
  btnSave: {
    backgroundColor: '#4F46E5',
  },
  btnDelete: {
    backgroundColor: '#EF4444',
  },
  confirmText: {
    fontSize: wp('3.6%'),
    textAlign: 'center',
    marginBottom: hp('2.5%'),
    lineHeight: wp('5%'),
  },
  textWhite: {
    color: '#FFFFFF',
  },
  editPickerBtn: {
    alignSelf: 'center',
    marginBottom: hp('2%'),
  },
  pendingBadgeInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp('1%'),
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D',
    borderWidth: 1,
    borderRadius: wp('2%'),
    paddingHorizontal: wp('3%'),
    paddingVertical: hp('0.6%'),
  },
  pendingBadgeInlineText: {
    fontSize: wp('3.1%'),
    color: '#B45309',
    fontWeight: '700',
  },
});

export default DiscountSettingsPage;
