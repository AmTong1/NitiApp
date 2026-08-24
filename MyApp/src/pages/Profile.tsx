import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TextInput, TouchableOpacity, ScrollView, Modal, Animated, KeyboardAvoidingView, Platform } from 'react-native';
import { widthPercentageToDP as wp, heightPercentageToDP as hp } from 'react-native-responsive-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { showAlert } from '../components/GlobalAlert';
import { BASE_HOST } from './config.ts';
import { useI18n } from '../i18n';
export function getBaseUrl() {
  return BASE_HOST;
}

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
  const { t } = useI18n();
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

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

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
      if (!res.ok) throw new Error(t('profileLoadFailed'));
      const js = await res.json();
      setData(js);
      setTitle(js?.title || '');
      setFirstName(js?.first_name || '');
      setLastName(js?.last_name || '');
    } catch (e: any) {
      showAlert(t('error'), e?.message || t('profileLoadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadResident = useCallback(async () => {
    try {
      setResidentLoading(true);
      const token = await AsyncStorage.getItem('token');
      if (!token) { return; }
      const res = await fetch(`${getBaseUrl()}/me/resident`, { headers: { Authorization: `Bearer ${token}` } });
      const js = await res.json();
      if (res.ok && js?.ok) { 
        setResident(js.data); 
        setPhone(js.data?.phone || ''); 
      }
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
      if (!token) { showAlert(t('notLoggedIn')); return; }

      if (resident) {
        const cleanedPhone = phone.trim();
        if (cleanedPhone.length !== 10) {
          showAlert(t('error'), "กรุณากรอกเบอร์โทรศัพท์ให้ครบ 10 หลัก");
          setSaving(false);
          return;
        }
      }

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
      if (!res.ok || js?.error) throw new Error(js?.error || t('profileSaveFailed'));

      if (resident) {
        const rRes = await fetch(`${getBaseUrl()}/me/resident/phone`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ phone: phone.trim() || null })
        });
        const rJs = await rRes.json();
        if (!rRes.ok || rJs?.error) throw new Error(rJs?.error || t('profilePhoneUpdateFailed'));
      }

      showSuccessPopup();
      if (onUpdated) onUpdated();
      load();
      loadResident();
    } catch (e: any) {
      showAlert(t('error'), e?.message || t('profileSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      showAlert(t('error'), 'กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlert(t('error'), 'รหัสผ่านใหม่ไม่ตรงกัน');
      return;
    }
    if (newPassword.length < 6) {
      showAlert(t('error'), 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร');
      return;
    }

    try {
      setChangingPassword(true);
      const token = await AsyncStorage.getItem('token');
      if (!token) { showAlert(t('notLoggedIn')); return; }

      const res = await fetch(`${getBaseUrl()}/auth/me/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ 
          current_password: currentPassword,
          new_password: newPassword
        })
      });

      const js = await res.json();
      if (!res.ok) {
        if (js?.error === 'INVALID_CURRENT_PASSWORD') {
          throw new Error('รหัสผ่านปัจจุบันไม่ถูกต้อง');
        }
        throw new Error(js?.error || 'ไม่สามารถเปลี่ยนรหัสผ่านได้');
      }

      showAlert('สำเร็จ', 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว');
      setShowPasswordModal(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e: any) {
      showAlert(t('error'), e?.message || 'ไม่สามารถเปลี่ยนรหัสผ่านได้');
    } finally {
      setChangingPassword(false);
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
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('profileUserInfo')}</Text>
          
          {loading ? (
            <ActivityIndicator color={colors.primary} style={inlineStyles.activityIndicator} />
          ) : !data ? (
            <Text style={[styles.emptyText, { color: colors.subtext }]}>{t('profileNoData')}</Text>
          ) : (
            <>
              <View style={styles.userHeader}>
                <View style={styles.userChip}>
                  <Ionicons name={(data.role === 'admin' || data.role === 'superadmin') ? 'shield-checkmark-outline' : 'person-outline'} size={18} color={colors.primary} />
                  <Text style={[styles.userChipText, { color: colors.text }]}>{data.username}</Text>
                  {(data.role === 'admin' || data.role === 'superadmin') && <Text style={[styles.adminBadge, { backgroundColor: colors.primary }]}>ADMIN</Text>}
                </View>
              </View>

              {}
              <View style={styles.fieldContainer}>
                <Text style={[styles.fieldLabel, { color: colors.subtext }]}>{t('profileTitleField')}</Text>
                <TouchableOpacity 
                  style={[styles.pickerButton, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]}
                  onPress={() => setShowTitlePicker(true)}
                >
                  <Text style={[styles.pickerButtonText, { color: title ? colors.text : colors.placeholder }]}>
                    {title || t('profileSelectTitle')}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color={colors.subtext} />
                </TouchableOpacity>
              </View>

              {}
              <View style={styles.fieldContainer}>
                <Text style={[styles.fieldLabel, { color: colors.subtext }]}>{t('profileFirstName')}</Text>
                <TextInput
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder={t('profileFirstNamePlaceholder')}
                  placeholderTextColor={colors.placeholder}
                  style={[styles.textInput, { color: colors.text, borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]}
                  maxLength={60}
                />
              </View>

              {}
              <View style={styles.fieldContainer}>
                <Text style={[styles.fieldLabel, { color: colors.subtext }]}>{t('profileLastName')}</Text>
                <TextInput
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder={t('profileLastNamePlaceholder')}
                  placeholderTextColor={colors.placeholder}
                  style={[styles.textInput, { color: colors.text, borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]}
                  maxLength={60}
                />
              </View>

              {}
              <View style={styles.fieldContainer}>
                <Text style={[styles.fieldLabel, { color: colors.subtext }]}>{t('profilePhone')}</Text>
                {residentLoading && !resident ? (
                  <ActivityIndicator style={inlineStyles.residentLoading} color={colors.primary} />
                ) : resident ? (
                  <TextInput
                    value={phone}
                    onChangeText={(text) => {
                      if (/^\d*$/.test(text) && text.length <= 10) {
                        setPhone(text);
                      }
                    }}
                    placeholder={t('profilePhonePlaceholder')}
                    keyboardType="number-pad"
                    maxLength={10} 
                    placeholderTextColor={colors.placeholder}
                    style={[styles.textInput, { color: colors.text, borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]}
                  />
                ) : (
                  <Text style={[styles.emptyStateText, { color: colors.subtext }]}>{t('profileNoResident')}</Text>
                )}
              </View>

              {}
              <View style={styles.pillRowContainer}>
                <View style={[styles.pillCard, { borderColor: colors.line, backgroundColor: colors.cardBg }]}>
                  <View style={[styles.iconCircle, { backgroundColor: colors.primary }]}>
                    <Ionicons name="home-outline" size={18} color="#FFFFFF" />
                  </View>
                  <Text style={[styles.pillValue, { color: colors.text }]}>{resident?.house_number || '-'}</Text>
                  <Text style={[styles.pillLabel, { color: colors.subtext }]}>{t('profileHouseNumber')}</Text>
                </View>

                {resident && (
                  <>
                    <View style={[styles.pillCard, { borderColor: colors.line, backgroundColor: colors.cardBg }]}>
                      <View style={[styles.iconCircle, { backgroundColor: colors.primary }]}>
                        <Ionicons name="people-outline" size={18} color="#FFFFFF" />
                      </View>
                      <Text style={[styles.pillValue, { color: colors.text }]}>{resident.household_count ?? '-'}</Text>
                      <Text style={[styles.pillLabel, { color: colors.subtext }]}>{t('profileResidents')}</Text>
                    </View>

                    <View style={[styles.pillCard, { borderColor: colors.line, backgroundColor: colors.cardBg }]}>
                      <View style={[styles.iconCircle, { backgroundColor: colors.primary }]}>
                        <Ionicons name="car-outline" size={18} color="#FFFFFF" />
                      </View>
                      <Text style={[styles.pillValue, { color: colors.text }]}>{resident.car_count ?? '-'}</Text>
                      <Text style={[styles.pillLabel, { color: colors.subtext }]}>{t('profileCar')}</Text>
                    </View>
                  </>
                )}
              </View>

              <Text style={[styles.helpText, { color: colors.subtext }]}>
                {t('profileHelpText')}
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
                    <Text style={styles.saveButtonText}>{t('profileSaveButton')}</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.changePasswordButton, { borderColor: colors.line }]}
                onPress={() => setShowPasswordModal(true)}
              >
                <Ionicons name="lock-closed-outline" size={20} color={colors.subtext} style={inlineStyles.saveButtonIcon} />
                <Text style={[styles.changePasswordButtonText, { color: colors.subtext }]}>เปลี่ยนรหัสผ่าน</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>

      {}
      <Modal visible={showSuccess} transparent animationType="none">
        <View style={styles.successOverlay}>
          <Animated.View style={[styles.successBox, { opacity: successOpacity, backgroundColor: colors.cardBg }]}>
            <View style={styles.successIconCircle}>
              <Ionicons name="checkmark" size={48} color="#fff" />
            </View>
            <Text style={[styles.successTitle, { color: colors.text }]}>{t('profileSaveSuccessTitle')}</Text>
            <Text style={[styles.successSubtitle, { color: colors.subtext }]}>{t('profileSaveSuccessMsg')}</Text>
          </Animated.View>
        </View>
      </Modal>

      {}
      <Modal visible={showPasswordModal} transparent animationType="fade" onRequestClose={() => setShowPasswordModal(false)}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <TouchableOpacity 
            style={styles.pickerOverlay} 
            activeOpacity={1} 
            onPress={() => setShowPasswordModal(false)}
          >
            <View style={[styles.pickerModal, { backgroundColor: colors.cardBg, maxHeight: '85%' }]} onStartShouldSetResponder={() => true}>
              <ScrollView showsVerticalScrollIndicator={false} bounces={false} contentContainerStyle={{ paddingBottom: 5 }}>
                <Text style={[styles.pickerTitle, { color: colors.text }]}>เปลี่ยนรหัสผ่าน</Text>
                
                <View style={styles.fieldContainer}>
                  <Text style={[styles.fieldLabel, { color: colors.subtext }]}>รหัสผ่านปัจจุบัน</Text>
                  <TextInput
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    placeholder="กรอกรหัสผ่านปัจจุบัน"
                    placeholderTextColor={colors.placeholder}
                    secureTextEntry
                    style={[styles.textInput, { color: colors.text, borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]}
                  />
                </View>

                <View style={styles.fieldContainer}>
                  <Text style={[styles.fieldLabel, { color: colors.subtext }]}>รหัสผ่านใหม่</Text>
                  <TextInput
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="กรอกรหัสผ่านใหม่ (อย่างน้อย 6 ตัว)"
                    placeholderTextColor={colors.placeholder}
                    secureTextEntry
                    style={[styles.textInput, { color: colors.text, borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]}
                  />
                </View>

                <View style={styles.fieldContainer}>
                  <Text style={[styles.fieldLabel, { color: colors.subtext }]}>ยืนยันรหัสผ่านใหม่</Text>
                  <TextInput
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
                    placeholderTextColor={colors.placeholder}
                    secureTextEntry
                    style={[styles.textInput, { color: colors.text, borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]}
                  />
                </View>

                <TouchableOpacity
                  style={[
                      styles.saveButton, 
                      { backgroundColor: colors.primary, marginTop: hp('1.5%') },
                      changingPassword && inlineStyles.saveButtonDisabled
                  ]}
                  disabled={changingPassword}
                  onPress={changePassword}
                >
                  {changingPassword ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.saveButtonText}>ยืนยันการเปลี่ยนรหัสผ่าน</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.pickerCancelBtn, { borderColor: colors.line }]} 
                  onPress={() => setShowPasswordModal(false)}
                >
                  <Text style={[styles.pickerCancelText, { color: colors.subtext }]}>{t('cancel')}</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {}
      <Modal visible={showTitlePicker} transparent animationType="fade" onRequestClose={() => setShowTitlePicker(false)}>
        <TouchableOpacity 
          style={styles.pickerOverlay} 
          activeOpacity={1} 
          onPress={() => setShowTitlePicker(false)}
        >
          <View style={[styles.pickerModal, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.pickerTitle, { color: colors.text }]}>{t('profileSelectTitle')}</Text>
            <ScrollView style={styles.pickerScroll}>
              {TITLE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[
                    styles.pickerOption,
                    { borderColor: colors.line },
                    title === opt && { backgroundColor: colors.primary + '20', borderColor: colors.primary }
                  ]}
                  onPress={() => { setTitle(opt); setShowTitlePicker(false); }}
                >
                  <Text style={[styles.pickerOptionText, { color: title === opt ? colors.primary : colors.text }]}>
                    {opt}
                  </Text>
                  {title === opt && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity 
              style={[styles.pickerCancelBtn, { borderColor: colors.line }]} 
              onPress={() => setShowTitlePicker(false)}
            >
              <Text style={[styles.pickerCancelText, { color: colors.subtext }]}>{t('cancel')}</Text>
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
  container: { flex: 1 },
  card: {
    borderWidth: 1,
    borderRadius: wp('4%'),
    padding: wp('3%'),
    marginHorizontal: wp('2.5%'),
    marginBottom: hp('1.3%'),
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  sectionTitle: { fontSize: wp('4%'), fontWeight: '800', marginBottom: hp('1%'), textAlign: 'center' },
  emptyText: { fontSize: wp('3.2%'), textAlign: 'center', marginVertical: hp('2.5%') },
  userHeader: { marginBottom: hp('1.3%'), paddingBottom: hp('1.3%'), borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  userChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', backgroundColor: 'rgba(16,185,129,0.15)', paddingHorizontal: wp('3.5%'), paddingVertical: hp('1%'), borderRadius: wp('7.5%') },
  userChipText: { fontSize: wp('4%'), fontWeight: '700', marginLeft: wp('1.5%') },
  adminBadge: { marginLeft: wp('2%'), paddingHorizontal: wp('2%'), paddingVertical: hp('0.4%'), borderRadius: wp('4%'), overflow: 'hidden', color: '#fff', fontSize: wp('2.2%'), fontWeight: '700' },
  fieldContainer: { marginBottom: hp('1.3%') },
  fieldLabel: { fontSize: wp('3%'), fontWeight: '600', marginBottom: hp('0.5%'), textTransform: 'uppercase', letterSpacing: 0.5 },
  textInput: { borderWidth: 1, borderRadius: wp('2.5%'), paddingHorizontal: wp('3%'), paddingVertical: hp('1.3%'), fontSize: wp('3.7%'), fontWeight: '500' },
  pillRowContainer: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: hp('1.5%'), gap: wp('2%'), paddingHorizontal: wp('0.5%') },
  pillCard: { flex: 1, flexDirection: 'column', alignItems: 'center', paddingVertical: hp('1.3%'), paddingHorizontal: wp('1.5%'), borderRadius: wp('3%'), shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  iconCircle: { width: wp('9%'), height: wp('9%'), borderRadius: wp('4.5%'), justifyContent: 'center', alignItems: 'center', marginBottom: hp('0.8%') },
  pillValue: { fontSize: wp('4.5%'), fontWeight: '800', marginBottom: hp('0.3%') },
  pillLabel: { fontSize: wp('2.5%'), fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.3, opacity: 0.6 },
  helpText: { marginTop: hp('1%'), marginBottom: hp('1.5%'), fontSize: wp('2.7%'), lineHeight: wp('4%'), textAlign: 'center' },
  saveButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: hp('1.5%'), borderRadius: wp('3.5%'), shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, elevation: 4 },
  saveButtonText: { color: '#FFFFFF', fontSize: wp('4%'), fontWeight: '700' },
  emptyStateText: { marginTop: hp('1.5%'), fontSize: wp('3.2%'), fontStyle: 'italic', textAlign: 'center' },
  changePasswordButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: hp('1.5%'), borderRadius: wp('3.5%'), borderWidth: 1, marginTop: hp('1.5%') },
  changePasswordButtonText: { fontSize: wp('4%'), fontWeight: '600' },
  pickerButton: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: wp('3%'), paddingVertical: hp('1.3%'), borderRadius: wp('2.5%'), borderWidth: 1 },
  pickerButtonText: { fontSize: wp('3.7%') },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: wp('6%') },
  pickerModal: { width: '100%', maxWidth: 340, borderRadius: wp('4%'), padding: wp('5%'), maxHeight: '70%' },
  pickerTitle: { fontSize: wp('4.5%'), fontWeight: '700', textAlign: 'center', marginBottom: hp('2%') },
  pickerScroll: { maxHeight: hp('37%') },
  pickerOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: hp('1.7%'), paddingHorizontal: wp('4%'), borderRadius: wp('2.5%'), borderWidth: 1, marginBottom: hp('1%') },
  pickerOptionText: { fontSize: wp('4%'), fontWeight: '500' },
  pickerCancelBtn: { marginTop: hp('1.5%'), paddingVertical: hp('1.7%'), borderRadius: wp('3%'), borderWidth: 1, alignItems: 'center' },
  pickerCancelText: { fontSize: wp('3.7%'), fontWeight: '600' },
  successOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  successBox: { borderRadius: wp('6%'), padding: wp('8%'), alignItems: 'center', minWidth: wp('65%') },
  successIconCircle: { width: wp('20%'), height: wp('20%'), borderRadius: wp('10%'), backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center', marginBottom: hp('2.5%') },
  successTitle: { fontSize: wp('5.5%'), fontWeight: '800', marginBottom: hp('1%') },
  successSubtitle: { fontSize: wp('3.5%'), textAlign: 'center' },
});

const inlineStyles = StyleSheet.create({
  contentContainer: { paddingVertical: hp('2.5%'), paddingBottom: hp('5%') },
  activityIndicator: { marginVertical: hp('2.5%') },
  residentLoading: { marginTop: hp('1.3%') },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonIcon: { marginRight: wp('2%') },
});

export default Profile;
