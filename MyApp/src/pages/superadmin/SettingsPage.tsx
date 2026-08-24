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
    bg: '#F3F4F6',
    cardBg: '#FFFFFF',
    text: '#1F2937',
    subtext: '#6B7280',
    border: '#E5E7EB',
    warning: '#F59E0B',
};

interface SettingsPageProps {
  onBack: () => void;
  darkMode?: boolean;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ onBack, darkMode = false }) => {
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [showRateModal, setShowRateModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [originalRate, setOriginalRate] = useState('');
  
  const [settings, setSettings] = useState({
    rate_per_sqm: '',
    slip2go_api: '',
    slip2go_secret: '',
    promptpay_id: '',
    receiver_name: '',
    qr_expiry_days: '',
    installment_rollover_before_days: '',
  });

  const formatDdMmYyyy = (d: Date) => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const sampleCycleEndDate = new Date(2026, 2, 25);
  const leadDays = Math.max(0, Number(settings.installment_rollover_before_days || '0') || 0);
  const sampleTriggerDate = new Date(sampleCycleEndDate.getTime());
  sampleTriggerDate.setDate(sampleTriggerDate.getDate() - leadDays);

  const colors = themeColors;

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${getBaseUrl()}/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setSettings({
          rate_per_sqm: String(data.rate_per_sqm || ''),
          slip2go_api: '',
          slip2go_secret: data.slip2go_secret || data.slipok_key || '',
          promptpay_id: data.promptpay_id || '',
          receiver_name: data.receiver_name || '',
          qr_expiry_days: String(data.qr_expiry_days || ''),
          installment_rollover_before_days: String(data.installment_rollover_before_days || '0'),
        });
        setOriginalRate(String(data.rate_per_sqm || ''));
      }
    } catch (error) {
      console.log('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSaveSettings = () => {
    const promptPay = String(settings.promptpay_id || '').trim();
    if (!/^\d{10}$/.test(promptPay)) {
      showAlert('ข้อมูลไม่ถูกต้อง', 'PromptPay ID ต้องเป็นตัวเลข 10 หลักเท่านั้น');
      return;
    }

    if (settings.rate_per_sqm !== originalRate) {
      setShowRateModal(true);
    } else {
      saveSettings(false);
    }
  };

  const saveSettings = async (updateAllPayments: boolean) => {
    try {
      setSavingSettings(true);
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${getBaseUrl()}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...settings,
          slip2go_api: '',
          update_all_payments: updateAllPayments
        }), 
      });

      await res.json();
      if (res.ok) {
        setOriginalRate(settings.rate_per_sqm);
        setSuccessMessage(updateAllPayments 
          ? 'บันทึกและอัปเดตยอดชำระทั้งหมดเรียบร้อย' 
          : 'บันทึกการตั้งค่าเรียบร้อย'
        );
        setShowSuccessModal(true);
        setTimeout(() => setShowSuccessModal(false), 2000);
      } else {
        showAlert('Error', 'บันทึกไม่สำเร็จ');
      }
    } catch (error) {
      showAlert('Error', 'เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setSavingSettings(false);
    }
  };

  if (loading) {
    return (
       <View style={[styles.container, { backgroundColor: colors.bg }]}>
         <View style={[styles.header, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <TouchableOpacity onPress={onBack} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.text }]}>ตั้งค่าระบบ</Text>
         </View>
        <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {}
      <View style={[styles.header, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>ตั้งค่าระบบ</Text>
      </View>

      <KeyboardAvoidingView 
        style={styles.flex1} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
        >
            <Text style={[styles.inputLabel, { color: colors.text }]}>ราคาต่อตารางเมตร (บาท)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }]}
              placeholder="10.00"
              placeholderTextColor={colors.subtext}
              value={settings.rate_per_sqm}
              onChangeText={(v) => {
                const clean = v.replace(/[^0-9.]/g, '');
                setSettings({ ...settings, rate_per_sqm: clean });
              }}
              keyboardType="decimal-pad"
            />

            <Text style={[styles.inputLabel, { color: colors.text }]}>Slip2Go API URL</Text>
            <View style={[styles.exampleBox, { backgroundColor: colors.bg, borderColor: colors.border }]}>
              <Text style={[styles.exampleTitle, { color: colors.text }]}>ไม่ต้องกรอก URL</Text>
              <Text style={[styles.exampleText, { color: colors.subtext }]}>ระบบจะเลือก endpoint ที่ใช้งานได้ให้อัตโนมัติ</Text>
              <Text style={[styles.exampleText, { color: colors.subtext }]}>ให้ใส่เฉพาะ Slip2Go API Secret ก็พอ</Text>
            </View>

            <Text style={[styles.inputLabel, { color: colors.text }]}>Slip2Go API Secret</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }]}
              placeholder="SECRET..."
              placeholderTextColor={colors.subtext}
              value={settings.slip2go_secret}
              onChangeText={(v) => setSettings({ ...settings, slip2go_secret: v })}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={[styles.inputLabel, { color: colors.text }]}>PromptPay ID (เบอร์โทร)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }]}
              placeholder="0812345678"
              placeholderTextColor={colors.subtext}
              value={settings.promptpay_id}
              onChangeText={(v) => {
                const clean = v.replace(/[^0-9]/g, '').slice(0, 10);
                setSettings({ ...settings, promptpay_id: clean });
              }}
              keyboardType="phone-pad"
              maxLength={10}
            />

            <Text style={[styles.inputLabel, { color: colors.text }]}>ชื่อบัญชีผู้รับ (ตรวจสลิป)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }]}
              placeholder="เช่น นิติบุคคลหมู่บ้าน..."
              placeholderTextColor={colors.subtext}
              value={settings.receiver_name}
              onChangeText={(v) => setSettings({ ...settings, receiver_name: v })}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={[styles.exampleBox, { backgroundColor: colors.bg, borderColor: colors.border }]}>
              <Text style={[styles.exampleText, { color: colors.subtext }]}>ใช้ตรวจว่าสลิปโอนไปยังบัญชีที่ถูกต้อง</Text>
              <Text style={[styles.exampleText, { color: colors.subtext }]}>ถ้าไม่กรอก ระบบจะไม่ตรวจชื่อบัญชีผู้รับ</Text>
            </View>

            <Text style={[styles.inputLabel, { color: colors.text }]}>สร้างงวดปีถัดไปล่วงหน้า (วัน)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }]}
              placeholder="0"
              placeholderTextColor={colors.subtext}
              value={settings.installment_rollover_before_days}
              onChangeText={(v) => {
                const clean = v.replace(/[^0-9]/g, '').slice(0, 3);
                setSettings({ ...settings, installment_rollover_before_days: clean });
              }}
              keyboardType="number-pad"
              maxLength={3}
            />
            <View style={[styles.exampleBox, { backgroundColor: colors.bg, borderColor: colors.border }]}>
              <Text style={[styles.exampleTitle, { color: colors.text }]}>ตัวอย่างการทำงาน</Text>
              <Text style={[styles.exampleText, { color: colors.subtext }]}>ถ้าปีล่าสุดสิ้นสุดวันที่ {formatDdMmYyyy(sampleCycleEndDate)}</Text>
              <Text style={[styles.exampleText, { color: colors.subtext }]}>ตั้งค่าล่วงหน้า {leadDays} วัน ระบบจะสร้างงวดปีถัดไปตั้งแต่ {formatDdMmYyyy(sampleTriggerDate)}</Text>
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.primary }, savingSettings && styles.opacityDisabled]}
              onPress={handleSaveSettings}
              disabled={savingSettings}
            >
              {savingSettings ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="save" size={20} color="#fff" />
                  <Text style={styles.saveBtnText}>บันทึกการตั้งค่า</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.spacer50} />
        </ScrollView>
      </KeyboardAvoidingView>

      {}
      <Modal visible={showRateModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.rateModalContent, { backgroundColor: colors.cardBg }]}>
             <View style={styles.rateModalIcon}>
              <Ionicons name="cash" size={40} color="#10B981" />
            </View>
            <Text style={[styles.rateModalTitle, { color: colors.text }]}>
              ยืนยันการเปลี่ยนราคา
            </Text>
             <View style={styles.rateModalChange}>
              <View style={[styles.rateBox, darkMode ? styles.rateBoxDark : styles.rateBoxOld]}>
                <Text style={[styles.rateBoxLabel, styles.colorDanger]}>เดิม</Text>
                <Text style={[styles.rateBoxValue, { color: colors.text }]}>{originalRate}</Text>
              </View>
              <Ionicons name="arrow-forward" size={24} color={colors.subtext} />
              <View style={[styles.rateBox, darkMode ? styles.rateBoxDark : styles.rateBoxNew]}>
                <Text style={[styles.rateBoxLabel, styles.colorSuccess]}>ใหม่</Text>
                <Text style={[styles.rateBoxValue, { color: colors.text }]}>{settings.rate_per_sqm}</Text>
              </View>
            </View>
            <Text style={[styles.rateModalUnit, { color: colors.subtext }]}>บาท / ตารางเมตร</Text>

             <View style={styles.rateModalButtons}>
              <TouchableOpacity 
                style={[styles.rateModalBtn, styles.rateModalBtnCancel, { borderColor: colors.border }]}
                onPress={() => setShowRateModal(false)}
              >
                <Text style={[styles.rateModalBtnText, { color: colors.subtext }]}>ยกเลิก</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.rateModalBtn, styles.rateModalBtnSave]}
                onPress={() => { setShowRateModal(false); saveSettings(false); }}
              >
                <Ionicons name="save-outline" size={18} color="#fff" />
                <Text style={styles.rateModalBtnTextWhite}>บันทึก</Text>
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity 
              style={[styles.rateModalBtn, styles.rateModalBtnAll]}
              onPress={() => {
                setShowRateModal(false);
                setShowConfirmModal(true);
              }}
            >
              <Ionicons name="refresh" size={18} color="#fff" />
              <Text style={styles.rateModalBtnTextWhite}>บันทึก + อัปเดต Payment ทั้งหมด</Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>

      {}
      <Modal visible={showConfirmModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.rateModalContent, { backgroundColor: colors.cardBg }]}>
             <View style={[styles.rateModalIcon, styles.bgWarningLight]}>
              <Ionicons name="warning" size={40} color="#F59E0B" />
            </View>
            <Text style={[styles.rateModalTitle, { color: colors.text }]}>
              ยืนยันการอัปเดต
            </Text>
            <Text style={[styles.confirmModalText, { color: colors.subtext }]}>
              ค่าส่วนกลางของลูกบ้านทุกหลังจะถูกคำนวณใหม่ตามราคาที่เปลี่ยน
            </Text>
             <View style={[styles.confirmModalWarning, darkMode ? styles.confirmWarningDark : styles.confirmWarningLight]}>
              <Ionicons name="information-circle" size={20} color="#F59E0B" />
              <Text style={[styles.confirmModalWarningText, darkMode ? styles.confirmWarningTextDark : styles.confirmWarningTextLight]}>
                การกระทำนี้ไม่สามารถย้อนกลับได้
              </Text>
            </View>
             <View style={styles.rateModalButtons}>
              <TouchableOpacity 
                style={[styles.rateModalBtn, styles.rateModalBtnCancel, { borderColor: colors.border }]}
                onPress={() => setShowConfirmModal(false)}
              >
                <Text style={[styles.rateModalBtnText, { color: colors.subtext }]}>ยกเลิก</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.rateModalBtn, styles.bgWarning]}
                onPress={() => { setShowConfirmModal(false); saveSettings(true); }}
              >
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.rateModalBtnTextWhite}>ยืนยัน</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {}
      <Modal visible={showSuccessModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
            <View style={[styles.rateModalContent, { backgroundColor: colors.cardBg }]}>
                <View style={[styles.rateModalIcon, styles.bgSuccessLight]}>
                <Ionicons name="checkmark-circle" size={45} color="#10B981" />
                </View>
                <Text style={[styles.rateModalTitle, styles.colorSuccess]}>
                สำเร็จ!
                </Text>
                <Text style={[styles.confirmModalText, { color: colors.subtext }]}>
                {successMessage}
                </Text>
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
  backBtn: { padding: wp('1%') },
  headerTitle: { fontSize: wp('5%'), fontWeight: '700' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: wp('4%') },
   inputLabel: { fontSize: wp('3.5%'), fontWeight: '600', marginBottom: hp('0.8%') },
  input: { borderWidth: 1, borderRadius: wp('2.5%'), padding: wp('3%'), fontSize: wp('3.7%'), marginBottom: hp('2%') },
  exampleBox: { borderWidth: 1, borderRadius: wp('2.5%'), padding: wp('3%'), marginTop: -6, marginBottom: hp('1.5%') },
  exampleTitle: { fontSize: wp('3.2%'), fontWeight: '700', marginBottom: hp('0.8%') },
  exampleText: { fontSize: wp('3%'), lineHeight: hp('2.3%') },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: hp('1.7%'), borderRadius: wp('2.5%'), marginTop: hp('2.5%'), gap: wp('2%') },
  saveBtnText: { color: '#fff', fontSize: wp('4%'), fontWeight: '600' },
  rateModalContent: { width: '85%', borderRadius: wp('5%'), padding: wp('6%'), alignItems: 'center' },
  rateModalIcon: { width: wp('17.5%'), height: wp('17.5%'), borderRadius: wp('8.75%'), backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginBottom: hp('2%') },
  rateModalTitle: { fontSize: wp('5%'), fontWeight: '700', marginBottom: hp('2.5%') },
  rateModalChange: { flexDirection: 'row', alignItems: 'center', gap: wp('3%'), marginBottom: hp('1%') },
  rateBox: { paddingHorizontal: wp('4%'), paddingVertical: hp('1.5%'), borderRadius: wp('3%'), alignItems: 'center', minWidth: 80 },
  rateBoxLabel: { fontSize: wp('3%'), fontWeight: '600', marginBottom: hp('0.5%') },
  rateBoxValue: { fontSize: wp('6%'), fontWeight: '700' },
  rateModalUnit: { fontSize: wp('3.5%'), marginBottom: hp('3%') },
  rateModalButtons: { flexDirection: 'row', gap: wp('3%'), marginBottom: hp('1.5%'), width: '100%' },
  rateModalBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: hp('1.7%'), borderRadius: wp('3%'), gap: wp('1.5%') },
  rateModalBtnCancel: { backgroundColor: 'transparent', borderWidth: 1 },
  rateModalBtnSave: { backgroundColor: '#3B82F6' },
  rateModalBtnAll: { flex: 0, backgroundColor: '#10B981', width: '100%' },
  rateModalBtnText: { fontSize: wp('3.7%'), fontWeight: '600' },
  rateModalBtnTextWhite: { fontSize: wp('3.7%'), fontWeight: '600', color: '#fff' },
  confirmModalText: { fontSize: wp('3.7%'), textAlign: 'center', marginBottom: hp('2%'), lineHeight: hp('2.7%') },
  confirmModalWarning: { flexDirection: 'row', alignItems: 'center', gap: wp('2%'), paddingHorizontal: wp('4%'), paddingVertical: hp('1.5%'), borderRadius: wp('2.5%'), marginBottom: hp('3%'), width: '100%' },
  confirmModalWarningText: { fontSize: wp('3.2%'), fontWeight: '500', flex: 1 },
   modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: wp('6%') },
  flex1: { flex: 1 },
  opacityDisabled: { opacity: 0.7 },
  spacer50: { height: hp('6.25%') },
  rateBoxDark: { backgroundColor: '#374151' },
  rateBoxOld: { backgroundColor: '#FEE2E2' },
  rateBoxNew: { backgroundColor: '#D1FAE5' },
  colorDanger: { color: '#EF4444' },
  colorSuccess: { color: '#10B981' },
  bgWarningLight: { backgroundColor: '#FEF3C7' },
  bgWarning: { backgroundColor: '#F59E0B' },
  bgSuccessLight: { backgroundColor: '#D1FAE5' },
  confirmWarningDark: { backgroundColor: '#422006' },
  confirmWarningLight: { backgroundColor: '#FEF3C7' },
  confirmWarningTextDark: { color: '#FCD34D' },
  confirmWarningTextLight: { color: '#92400E' },
});

export default SettingsPage;
