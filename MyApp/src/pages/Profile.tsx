import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TextInput, TouchableOpacity, Platform, ScrollView, Modal, Animated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { showAlert } from '../components/GlobalAlert';
import { BASE_HOST, BASE_PORT } from './config.ts';

const ANDROID_HOST = BASE_HOST;
export function getBaseUrl() {
  const host = Platform.OS === 'android' ? ANDROID_HOST : BASE_HOST;
  return `http://${host}:${BASE_PORT}`;
}

// รายการคำนำหน้าชื่อ
const TITLE_OPTIONS = ['นาย', 'นาง', 'นางสาว', 'Mr.', 'Mrs.', 'Ms.', 'Miss', 'Dr.'];

interface ProfileData {
  id: number | string;
  username: string;
  full_name?: string | null;
  title?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  role?: string;
  created_at?: string;
}

interface ResidentData {
  id: number;
  phone?: string | null;
  house_number?: string | null;
  household_count?: number | null;
  car_count?: number | null;
}

interface Props {
  darkMode: boolean;
  onUpdated?: () => void;
}

const Profile: React.FC<Props> = ({ darkMode, onUpdated }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<ProfileData | null>(null);
  const [title, setTitle] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [resident, setResident] = useState<ResidentData | null>(null);
  const [residentLoading, setResidentLoading] = useState(false);
  const [phone, setPhone] = useState('');
  const [showTitlePicker, setShowTitlePicker] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const successOpacity = useRef(new Animated.Value(0)).current;

  const colors = getColors(darkMode);

  const showSuccessPopup = useCallback(() => {
    successOpacity.setValue(0);
    setShowSuccess(true);
    Animated.sequence([
      Animated.timing(successOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.delay(1200),
      Animated.timing(successOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowSuccess(false);
    });
  }, [successOpacity]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('token');
      if (!token) { return; }
      const res = await fetch(`${getBaseUrl()}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('โหลดข้อมูลผู้ใช้ไม่สำเร็จ');
      const js = await res.json();
      setData(js);
      setTitle(js?.title || '');
      setFirstName(js?.first_name || '');
      setLastName(js?.last_name || '');
    } catch (e: any) {
      showAlert('เกิดข้อผิดพลาด', e?.message || 'ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadResident = useCallback(async () => {
    try {
      setResidentLoading(true);
      const token = await AsyncStorage.getItem('token');
      if (!token) { return; }
      const res = await fetch(`${getBaseUrl()}/me/resident`, { headers: { Authorization: `Bearer ${token}` } });
      const js = await res.json();
      if (res.ok && js?.ok) { setResident(js.data); setPhone(js.data?.phone || ''); }
      else { setResident(null); setPhone(''); }
    } catch {
      setResident(null); setPhone('');
    } finally {
      setResidentLoading(false);
    }
  }, []);

  useEffect(() => { load(); loadResident(); }, [load, loadResident]);

  const save = async () => {
    try {
      setSaving(true);
      const token = await AsyncStorage.getItem('token');
      if (!token) { showAlert('ยังไม่เข้าสู่ระบบ'); return; }
      
      // Update name (title, first_name, last_name)
      const res = await fetch(`${getBaseUrl()}/auth/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ 
          title: title.trim() || null,
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
        })
      });
      const js = await res.json();
      if (!res.ok || js?.error) throw new Error(js?.error || 'บันทึกไม่สำเร็จ');

      // Update phone if resident exists
      if (resident) {
        const rRes = await fetch(`${getBaseUrl()}/me/resident/phone`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ phone: phone.trim() || null })
        });
        const rJs = await rRes.json();
        if (!rRes.ok || rJs?.error) throw new Error(rJs?.error || 'อัปเดตเบอร์ไม่สำเร็จ');
      }
      showSuccessPopup();
      if (onUpdated) onUpdated();
      load();
      loadResident();
    } catch (e: any) {
      showAlert('เกิดข้อผิดพลาด', e?.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={inlineStyles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>ข้อมูลผู้ใช้</Text>
          {loading ? (
            <ActivityIndicator color={colors.primary} style={inlineStyles.activityIndicator} />
          ) : !data ? (
            <Text style={[styles.emptyText, { color: colors.subtext }]}>ไม่พบข้อมูล</Text>
          ) : (
            <>
              <View style={styles.userHeader}>
                <View style={styles.userChip}>
                  <Ionicons name={(data.role === 'admin' || data.role === 'superadmin') ? 'shield-checkmark-outline' : 'person-outline'} size={18} color={colors.primary} />
                  <Text style={[styles.userChipText, { color: colors.text }]}>{data.username}</Text>
                  {(data.role === 'admin' || data.role === 'superadmin') && <Text style={[styles.adminBadge, { backgroundColor: colors.primary }]}>ADMIN</Text>}
                </View>
              </View>

              <View style={styles.fieldContainer}>
                <Text style={[styles.fieldLabel, { color: colors.subtext }]}>คำนำหน้า</Text>
                <TouchableOpacity 
                  style={[styles.pickerButton, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]}
                  onPress={() => setShowTitlePicker(true)}
                >
                  <Text style={[styles.pickerButtonText, { color: title ? colors.text : colors.placeholder }]}>
                    {title || 'เลือกคำนำหน้า'}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color={colors.subtext} />
                </TouchableOpacity>
              </View>

              <View style={styles.fieldContainer}>
                <Text style={[styles.fieldLabel, { color: colors.subtext }]}>ชื่อ</Text>
                <TextInput
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="กรอกชื่อ"
                  placeholderTextColor={colors.placeholder}
                  style={[styles.textInput, { color: colors.text, borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]}
                  maxLength={60}
                />
              </View>

              <View style={styles.fieldContainer}>
                <Text style={[styles.fieldLabel, { color: colors.subtext }]}>นามสกุล</Text>
                <TextInput
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="กรอกนามสกุล"
                  placeholderTextColor={colors.placeholder}
                  style={[styles.textInput, { color: colors.text, borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]}
                  maxLength={60}
                />
              </View>

              <View style={styles.fieldContainer}>
                <Text style={[styles.fieldLabel, { color: colors.subtext }]}>เบอร์โทร</Text>
                {residentLoading && !resident ? (
                  <ActivityIndicator style={inlineStyles.residentLoading} color={colors.primary} />
                ) : resident ? (
                  <TextInput
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="กรอกเบอร์โทร"
                    keyboardType="number-pad"
                    maxLength={20}
                    placeholderTextColor={colors.placeholder}
                    style={[styles.textInput, { color: colors.text, borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]}
                  />
                ) : (
                  <Text style={[styles.emptyStateText, { color: colors.subtext }]}>ยังไม่มีข้อมูลผู้พักอาศัยผูกกับบัญชีนี้</Text>
                )}
              </View>

              <View style={styles.pillRowContainer}>
                <View style={[styles.pillCard, { borderColor: colors.line }]}>
                  <View style={[styles.iconCircle, { backgroundColor: colors.primary }]}>
                    <Ionicons name="home-outline" size={18} color="#FFFFFF" />
                  </View>
                  <Text style={[styles.pillValue, { color: colors.text }]}>{resident?.house_number || '-'}</Text>
                  <Text style={[styles.pillLabel, { color: colors.subtext }]}>บ้านเลขที่</Text>
                </View>

                {resident && (
                  <>
                    <View style={[styles.pillCard, { borderColor: colors.line }]}>
                      <View style={[styles.iconCircle, { backgroundColor: colors.primary }]}>
                        <Ionicons name="people-outline" size={18} color="#FFFFFF" />
                      </View>
                      <Text style={[styles.pillValue, { color: colors.text }]}>{resident.household_count ?? '-'}</Text>
                      <Text style={[styles.pillLabel, { color: colors.subtext }]}>ผู้อาศัย</Text>
                    </View>

                    <View style={[styles.pillCard, { borderColor: colors.line }]}>
                      <View style={[styles.iconCircle, { backgroundColor: colors.primary }]}>
                        <Ionicons name="car-outline" size={18} color="#FFFFFF" />
                      </View>
                      <Text style={[styles.pillValue, { color: colors.text }]}>{resident.car_count ?? '-'}</Text>
                      <Text style={[styles.pillLabel, { color: colors.subtext }]}>รถ</Text>
                    </View>
                  </>
                )}
              </View>

              <Text style={[styles.helpText, { color: colors.subtext }]}>
                หากข้อมูลไม่ถูกต้องโปรดแจ้งแอดมิน เพื่อทำการแก้ไขให้ถูกต้อง
              </Text>

              <TouchableOpacity
                style={[
                    styles.saveButton, 
                    { backgroundColor: colors.primary },
                    saving && inlineStyles.saveButtonDisabled
                ]}
                disabled={saving}
                onPress={save}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" style={inlineStyles.saveButtonIcon} />
                    <Text style={styles.saveButtonText}>บันทึกข้อมูล</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>

      {/* Success Popup สวยๆ fade in ตรงกลาง */}
      <Modal visible={showSuccess} transparent animationType="none">
        <View style={styles.successOverlay}>
          <Animated.View style={[styles.successBox, { opacity: successOpacity }]}>
            <View style={styles.successIconCircle}>
              <Ionicons name="checkmark" size={48} color="#fff" />
            </View>
            <Text style={styles.successTitle}>บันทึกสำเร็จ!</Text>
            <Text style={styles.successSubtitle}>ข้อมูลได้รับการอัปเดตแล้ว</Text>
          </Animated.View>
        </View>
      </Modal>

      {/* Title Picker Modal */}
      <Modal visible={showTitlePicker} transparent animationType="fade" onRequestClose={() => setShowTitlePicker(false)}>
        <TouchableOpacity 
          style={styles.pickerOverlay} 
          activeOpacity={1} 
          onPress={() => setShowTitlePicker(false)}
        >
          <View style={[styles.pickerModal, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.pickerTitle, { color: colors.text }]}>เลือกคำนำหน้า</Text>
            <ScrollView style={styles.pickerScroll}>
              {TITLE_OPTIONS.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.pickerOption,
                    { borderColor: colors.line },
                    title === t && { backgroundColor: colors.primary + '20', borderColor: colors.primary }
                  ]}
                  onPress={() => { setTitle(t); setShowTitlePicker(false); }}
                >
                  <Text style={[styles.pickerOptionText, { color: title === t ? colors.primary : colors.text }]}>
                    {t}
                  </Text>
                  {title === t && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity 
              style={[styles.pickerCancelBtn, { borderColor: colors.line }]} 
              onPress={() => setShowTitlePicker(false)}
            >
              <Text style={[styles.pickerCancelText, { color: colors.subtext }]}>ยกเลิก</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

function getColors(dark: boolean) {
  if (dark) {
    return {
      primary: '#10B981',
      cardBg: '#1F2937',
      inputBg: '#111827',
      displayBg: '#0F172A',
      text: '#F8FAFC',
      subtext: '#94A3B8',
      line: '#334155',
      inputBorder: '#475569',
      placeholder: '#6B7280',
      avatarBg: '#374151',
    };
  }
  return {
    primary: '#059669',
    cardBg: '#FFFFFF',
    inputBg: '#F8FAFC',
    displayBg: '#F1F5F9',
    text: '#0F172A',
    subtext: '#64748B',
    line: '#E2E8F0',
    inputBorder: '#CBD5E1',
    placeholder: '#94A3B8',
    avatarBg: '#F1F5F9',
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginHorizontal: 10,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center'
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    marginVertical: 20
  },

  // User Header Styles
  userHeader: {
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  userInfo: { alignItems: 'center' },
  userChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(16,185,129,0.15)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 30,
  },
  userChipText: {
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 6,
  },
  adminBadge: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 16,
    overflow: 'hidden',
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Field Styles
  fieldContainer: {
    marginBottom: 10,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '500',
  },
  displayField: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  displayValue: {
    fontSize: 16,
    fontWeight: '500',
  },

  // Row Fields
  rowFields: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  halfField: {
    flex: 1,
    marginHorizontal: 4,
  },

  // Icon Field Styles
  iconFieldContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  iconFieldContent: {
    flex: 1,
    marginLeft: 12,
  },
  iconFieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  iconFieldValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  iconRowFields: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  iconHalfField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 4,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },

  // Pill Card Styles
  pillRowContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 12,
    gap: 8,
    paddingHorizontal: 2,
  },
  pillCard: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  pillValue: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 2,
  },
  pillLabel: {
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    opacity: 0.6,
  },

  // Info Row (unused now but keeping for compatibility)
  infoRow: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'center',
  },
  infoLabel: {
    width: 120,
    fontSize: 13,
    fontWeight: '600',
  },
  infoValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },

  // Help and Save Styles
  helpText: {
    marginTop: 8,
    marginBottom: 12,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  saveButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyStateText: {
    marginTop: 12,
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 18,
  },

  // Picker styles
  pickerButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  pickerButtonText: {
    fontSize: 15,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  pickerModal: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    padding: 20,
    maxHeight: '70%',
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  pickerScroll: {
    maxHeight: 300,
  },
  pickerOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  pickerOptionText: {
    fontSize: 16,
    fontWeight: '500',
  },
  pickerCancelBtn: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  pickerCancelText: {
    fontSize: 15,
    fontWeight: '600',
  },

  // Legacy styles (keeping for backward compatibility)
  row: { flexDirection: 'row', alignItems: 'center' },
  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 16, fontWeight: '600', marginTop: 4 },
  input: { marginTop: 6, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  saveBtn: { marginTop: 28, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Success Popup styles
  successOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successBox: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
    minWidth: 260,
  },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
});

// Define a new styles object to replace inline styles
const inlineStyles = StyleSheet.create({
  contentContainer: {
    paddingVertical: 20,
    paddingBottom: 40,
  },
  activityIndicator: {
    marginVertical: 20,
  },
  residentLoading: {
    marginTop: 10,
  },
  saveButton: {
    backgroundColor: '#10B981', // Replace colors.primary with the actual color value
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonIcon: {
    marginRight: 8,
  },
});

export default Profile;