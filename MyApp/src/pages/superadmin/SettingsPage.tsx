import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, ScrollView, TextInput, KeyboardAvoidingView, Platform, Modal
} from 'react-native';
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
    slipok_api: '',
    slipok_key: '',
    promptpay_id: '',
    qr_expiry_days: '',
  });

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
          slipok_api: data.slipok_api || '',
          slipok_key: data.slipok_key || '',
          promptpay_id: data.promptpay_id || '',
          qr_expiry_days: String(data.qr_expiry_days || ''),
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
      {/* Header */}
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

            <Text style={[styles.inputLabel, { color: colors.text }]}>SlipOK API URL</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }]}
              placeholder="https://api.slipok.com/api/..."
              placeholderTextColor={colors.subtext}
              value={settings.slipok_api}
              onChangeText={(v) => {
                const clean = v.replace(/[^a-zA-Z0-9:/.?&=_-]/g, '');
                setSettings({ ...settings, slipok_api: clean });
              }}
              autoCapitalize="none"
            />

            <Text style={[styles.inputLabel, { color: colors.text }]}>SlipOK API Key</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }]}
              placeholder="SLIPOK..."
              placeholderTextColor={colors.subtext}
              value={settings.slipok_key}
              onChangeText={(v) => {
                const clean = v.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase();
                setSettings({ ...settings, slipok_key: clean });
              }}
              autoCapitalize="characters"
            />

            <Text style={[styles.inputLabel, { color: colors.text }]}>PromptPay ID (เบอร์โทร)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }]}
              placeholder="0812345678"
              placeholderTextColor={colors.subtext}
              value={settings.promptpay_id}
              onChangeText={(v) => {
                const clean = v.replace(/[^0-9]/g, '').slice(0, 13);
                setSettings({ ...settings, promptpay_id: clean });
              }}
              keyboardType="phone-pad"
              maxLength={13}
            />

            <Text style={[styles.inputLabel, { color: colors.text }]}>QR หมดอายุภายใน (วัน)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }]}
              placeholder="3"
              placeholderTextColor={colors.subtext}
              value={settings.qr_expiry_days}
              onChangeText={(v) => {
                const clean = v.replace(/[^0-9]/g, '');
                setSettings({ ...settings, qr_expiry_days: clean });
              }}
              keyboardType="number-pad"
              maxLength={3}
            />

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

      {/* Rate Change Modal */}
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

      {/* Confirm Modal */}
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

      {/* Success Modal */}
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
  },
   inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    marginBottom: 16,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 20,
    gap: 8,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Rate Modal Styles
  rateModalContent: {
    width: '85%',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  rateModalIcon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  rateModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 20,
  },
  rateModalChange: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  rateBox: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    minWidth: 80,
  },
  rateBoxLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  rateBoxValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  rateModalUnit: {
    fontSize: 14,
    marginBottom: 24,
  },
  rateModalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
    width: '100%',
  },
  rateModalBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 6,
  },
  rateModalBtnCancel: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  rateModalBtnSave: {
    backgroundColor: '#3B82F6',
  },
  rateModalBtnAll: {
    flex: 0,
    backgroundColor: '#10B981',
    width: '100%',
  },
  rateModalBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  rateModalBtnTextWhite: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  confirmModalText: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 22,
  },
  confirmModalWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 24,
    width: '100%',
  },
  confirmModalWarningText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
   modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  flex1: {
    flex: 1,
  },
  opacityDisabled: {
    opacity: 0.7,
  },
  spacer50: {
    height: 50,
  },
  rateBoxDark: {
    backgroundColor: '#374151',
  },
  rateBoxOld: {
    backgroundColor: '#FEE2E2',
  },
  rateBoxNew: {
    backgroundColor: '#D1FAE5',
  },
  colorDanger: {
    color: '#EF4444',
  },
  colorSuccess: {
    color: '#10B981',
  },
  bgWarningLight: {
    backgroundColor: '#FEF3C7',
  },
  bgWarning: {
    backgroundColor: '#F59E0B',
  },
  bgSuccessLight: {
    backgroundColor: '#D1FAE5',
  },
  confirmWarningDark: {
    backgroundColor: '#422006',
  },
  confirmWarningLight: {
    backgroundColor: '#FEF3C7',
  },
  confirmWarningTextDark: {
    color: '#FCD34D',
  },
  confirmWarningTextLight: {
    color: '#92400E',
  },
});

export default SettingsPage;
