import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Image,
} from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showAlert } from '../components/GlobalAlert';
import { BASE_HOST } from './config';
import { launchImageLibrary, Asset } from 'react-native-image-picker';
import ImageResizer from 'react-native-image-resizer';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { useI18n } from '../i18n';

// --- Config: Thai Locale for Calendar ---
LocaleConfig.locales.th = {
  monthNames: ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'],
  monthNamesShort: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],
  dayNames: ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'],
  dayNamesShort: ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'],
  today: 'วันนี้',
};
LocaleConfig.defaultLocale = 'th';

// --- Types ---
type Role = 'admin' | 'user' | 'superadmin';
type AnnouncementItem = { 
  id: number; 
  title: string; 
  date: string; 
  image: string; 
  important?: boolean; 
  description?: string 
};

// --- Utilities ---
export function getBaseUrl() {
  return BASE_HOST;
}

const COLORS = {
  bg: '#FFFFFF',
  text: '#2F2F2F',
  subtext: '#7A7A7A',
  line: '#EEF2F5',
  green: '#47B263',
  greenSoft: '#E9F7EE',
  orange: '#FFA21A',
  red: '#EF5350',
};

const ANNOUNCEMENT_DESCRIPTION_MAX_LENGTH = 2000;

const waitForKeyboardToSettleBeforeMedia = async () => {
  Keyboard.dismiss();
  await new Promise((resolve) => setTimeout(resolve, Platform.OS === 'android' ? 320 : 120));
};

const pad2 = (n: number) => String(n).padStart(2, '0');

const buildTimestamp = (d = new Date()) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}`;

const toIso = (dt: Date) => `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;

const toAbsoluteUrl = (url: string): string => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  const base = getBaseUrl();
  return url.startsWith('/') ? `${base}${url}` : `${base}/${url}`;
};

const toDate = (s?: string | null): Date | null => {
  if (!s) return null;
  const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m1) {
    const y = Number(m1[1]), M = Number(m1[2]), d = Number(m1[3]);
    const dt = new Date(y, M - 1, d);
    return isNaN(dt.getTime()) ? null : dt;
  }
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) {
    let d = Number(m2[1]), M = Number(m2[2]), y = Number(m2[3]);
    if (y > 2400) y -= 543; // BE -> AD
    const dt = new Date(y, M - 1, d);
    return isNaN(dt.getTime()) ? null : dt;
  }
  return null;
};

const formatBeThai = (s?: string | null, kind: 'short' | 'long' = 'short'): string => {
  const d = toDate(s);
  if (!d) return String(s ?? '');
  const y = d.getFullYear() + 543;
  const months = kind === 'long'
    ? ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
    : ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const days = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${y}`;
};

async function prepareUploadFile(raw: Asset, userTag: string | number): Promise<{ uri: string; name: string; type: string }> {
  const stamp = buildTimestamp();
  const safeUser = String(userTag || 'admin').replace(/[^\w.-]+/g, '_');
  const fileName = `announcement_${safeUser}_${stamp}.jpg`;
  const type = 'image/jpeg';
  if (!raw.uri) throw new Error('ไม่พบไฟล์รูปที่จะอัปโหลด');
  try {
    const resized = await ImageResizer.createResizedImage(
      raw.uri,
      1600,
      1600,
      'JPEG',
      82,
      0,
      undefined,
      false,
      { mode: 'contain' }
    );
    const uri = resized.uri || `file://${resized.path}`;
    return { uri, name: fileName, type };
  } catch {
    return { uri: raw.uri!, name: fileName, type };
  }
}

// --- Components ---

const ItemSeparator = () => <View style={styles.separator} />;

const CalendarDay: React.FC<{
  date?: { day?: number; dateString?: string };
  state?: string;
  dateVal: Date | null;
  colors: any;
  onSelect: (dt: Date) => void;
}> = ({ date, state, dateVal, colors, onSelect }) => {
  if (!date) return null;
  const d = new Date(date.dateString || '');
  const dayOfWeek = d.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isSelected = dateVal && toIso(dateVal) === date.dateString;
  const isToday = toIso(new Date()) === date.dateString;
  const isDisabled = state === 'disabled';

  return (
    <TouchableOpacity
      onPress={() => {
        if (isDisabled) return;
        const parts = String(date.dateString).split('-');
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const dd = parseInt(parts[2], 10);
        const dt = new Date(y, (m - 1), dd);
        onSelect(dt);
      }}
      disabled={isDisabled}
      style={[styles.calendarDayBtn, isSelected && styles.calendarDaySelected]}
    >
      <Text style={[
        styles.calendarDayText,
        (isSelected || isToday) && styles.calendarDayTextBold,
        isSelected && styles.calendarDayTextSelected,
        isDisabled && styles.calendarDayTextDisabled,
        !isSelected && !isDisabled && isToday && styles.calendarDayTextToday,
        !isSelected && !isDisabled && !isToday && isWeekend && styles.calendarDayTextWeekend,
        !isSelected && !isDisabled && !isToday && !isWeekend && { color: colors.text },
      ]}>
        {date.day}
      </Text>
    </TouchableOpacity>
  );
};

const CATEGORY_ICONS: { key: string; label: string; url: string }[] = [
  { key: 'electric', label: 'annElectricity', url: 'https://cdn-icons-png.flaticon.com/512/2990/2990873.png' },
  { key: 'water',    label: 'annWater', url: 'https://cdn-icons-png.flaticon.com/512/4497/4497450.png' },
  { key: 'meeting',  label: 'annMeeting', url: 'https://cdn-icons-png.flaticon.com/512/7185/7185630.png' },
];

const AnnouncementFormModal: React.FC<{
  visible: boolean;
  darkMode: boolean;
  colors: any;
  mode: 'add' | 'edit';
  initial?: AnnouncementItem | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: { title: string; date: string; image: string; important?: boolean; description?: string }) => void;
}> = ({ visible, darkMode, colors, mode, initial, saving, onClose, onSubmit }) => {
  const { t } = useI18n();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [dateText, setDateText] = useState(initial?.date ?? '');
  const [dateVal, setDateVal] = useState<Date | null>(null);
  const [image, setImage] = useState(initial?.image ?? '');
  const [showPicker, setShowPicker] = useState(false);
  const [important, setImportant] = useState<boolean>(!!initial?.important);
  const [description, setDescription] = useState<string>(initial?.description ?? '');
  const [calendarKey, setCalendarKey] = useState(0);

  // Warning Modal State
  const [warningVisible, setWarningVisible] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);

  const parseToDate = (s?: string | null): Date | null => {
    if (!s) return null;
    const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m1) {
      const y = Number(m1[1]); const M = Number(m1[2]); const d = Number(m1[3]);
      const dt = new Date(y, M - 1, d);
      return isNaN(dt.getTime()) ? null : dt;
    }
    const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m2) {
      let d = Number(m2[1]), M = Number(m2[2]), y = Number(m2[3]);
      if (y > 2400) y -= 543;
      const dt = new Date(y, M - 1, d);
      return isNaN(dt.getTime()) ? null : dt;
    }
    return null;
  };

  const toBeThaiText = useCallback((dt: Date) => {
    const TH_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const d = dt.getDate();
    const m = TH_MONTHS_SHORT[dt.getMonth()];
    const y = dt.getFullYear() + 543;
    return `${d} ${m} ${y}`;
  }, []);

  const handleDaySelect = useCallback((dt: Date) => {
    setDateVal(dt);
    setDateText(toBeThaiText(dt));
    setShowPicker(false);
  }, [toBeThaiText]);

  const renderDay = useCallback(({ date, state }: { date?: { day?: number; dateString?: string }; state?: string }) => (
    <CalendarDay
      date={date}
      state={state}
      dateVal={dateVal}
      colors={colors}
      onSelect={handleDaySelect}
    />
  ), [dateVal, colors, handleDaySelect]);

  useEffect(() => {
    setTitle(initial?.title ?? '');
    setImage(initial?.image ?? '');
    const d = parseToDate(initial?.date ?? '');
    setDateVal(d);
    setDateText(d ? toBeThaiText(d) : '');
    setImportant(!!initial?.important);
    setDescription(initial?.description ?? '');
  }, [initial, visible, toBeThaiText]);

  const submit = () => {
    const missing: string[] = [];
    if (!title.trim()) missing.push(t('annSubject'));
    if (!dateText.trim()) missing.push(t('annDate'));

    if (missing.length > 0) {
      setMissingFields(missing);
      setWarningVisible(true);
      return;
    }
    const out = dateVal ? toIso(dateVal) : dateText.trim();
    onSubmit({ title: title.trim(), date: out, image: image.trim(), important, description: description.trim() });
  };

  const pickFromGallery = async () => {
    try {
      await waitForKeyboardToSettleBeforeMedia();
      const result = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 0.9 });
      if (result.didCancel) return;
      const asset = result.assets?.[0];
      if (!asset) return;

      const token = await AsyncStorage.getItem('token');
      if (!token) throw new Error(t('notLoggedIn'));

      const userTag = 'admin';
      const file = await prepareUploadFile(asset, userTag);

      const form = new FormData();
      // @ts-ignore RN FormData specific
      form.append('file', { uri: file.uri, name: file.name, type: file.type });

      const res = await fetch(`${getBaseUrl()}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok || !data?.url) throw new Error(data?.error || t('annUploadFailed'));
      const full = toAbsoluteUrl(String(data.url));
      setImage(full);
    } catch (e: any) {
      showAlert(t('annUploadFailed'), e?.message || t('annRetry'));
    }
  };

  return (
    <>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => !saving && onClose()}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalCenter}>
            <View style={[styles.modalCard, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {mode === 'add' ? t('annAddNew') : t('annEdit')}
              </Text>

              <Text style={[styles.modalLabel, { color: colors.subtext }]}>{t('annSubject')}</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder={t('annSubjectPlaceholder')}
                placeholderTextColor={darkMode ? '#888' : '#9AA3AB'}
                style={[styles.input, { color: colors.text, borderColor: colors.line }]}
                maxLength={120}
                returnKeyType="next"
              />

              <Text style={[styles.modalLabel, styles.mt10, { color: colors.subtext }]}>{t('annDate')}</Text>
              <TouchableOpacity
                onPress={() => setShowPicker(true)}
                activeOpacity={0.8}
                style={[styles.input, styles.inputRow, { borderColor: colors.line }]}
              >
                <Ionicons name="calendar-outline" size={16} color={colors.subtext} />
                <Text style={[styles.ml8, { color: dateText ? colors.text : (darkMode ? '#888' : '#9AA3AB') }]}>
                  {dateText || t('annDatePlaceholder')}
                </Text>
              </TouchableOpacity>
              {showPicker && (
                <Modal visible={true} transparent={true} animationType="fade" onRequestClose={() => setShowPicker(false)}>
                  <TouchableWithoutFeedback onPress={() => setShowPicker(false)}>
                    <View style={styles.pickerModalBackdrop}>
                      <TouchableWithoutFeedback onPress={() => {}}>
                        <View style={[styles.pickerCard, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
                          <TouchableOpacity onPress={() => setShowPicker(false)} style={[styles.pickerCloseX, darkMode ? styles.bgDark2A : styles.bgLight]}>
                            <Ionicons name="close" size={18} color={darkMode ? '#E5E7EB' : '#333'} />
                          </TouchableOpacity>
                          <View style={styles.pickerHeader}>
                            <Text style={[styles.pickerTitle, { color: colors.text }]}>{t('selectDate')}</Text>
                            <TouchableOpacity 
                              onPress={() => {
                                const today = new Date();
                                setDateVal(today);
                                setDateText(toBeThaiText(today));
                                setCalendarKey(prev => prev + 1);
                              }}
                              style={styles.todayBtn}
                            >
                              <Ionicons name="today-outline" size={18} color="#fff" />
                              <Text style={styles.todayBtnText}>{t('today')}</Text>
                            </TouchableOpacity>
                          </View>
                          {Platform.OS === 'android' ? (
                            <Calendar
                              key={`calendar-${calendarKey}`}
                              current={(dateVal ? toIso(dateVal) : toIso(new Date())) as any}
                              minDate={toIso(new Date())}
                              onDayPress={(day) => {
                                const parts = String(day.dateString).split('-');
                                const y = parseInt(parts[0], 10);
                                const m = parseInt(parts[1], 10);
                                const d = parseInt(parts[2], 10);
                                const dt = new Date(y, (m - 1), d);
                                setDateVal(dt);
                                setDateText(toBeThaiText(dt));
                                setShowPicker(false);
                              }}
                              markedDates={dateVal ? { [toIso(dateVal)]: { selected: true } } : undefined}
                              theme={{
                                selectedDayBackgroundColor: COLORS.green,
                                selectedDayTextColor: '#fff',
                                todayTextColor: COLORS.orange,
                                arrowColor: COLORS.green,
                                monthTextColor: colors.text,
                                textSectionTitleColor: colors.subtext,
                                textMonthFontWeight: '800',
                                textDayFontWeight: '600',
                                textDayHeaderFontWeight: '700',
                              }}
                              dayComponent={renderDay}
                            />
                          ) : (
                            <DateTimePicker
                              value={dateVal || new Date()}
                              mode="date"
                              display={'inline'}
                              locale="th-TH"
                              onChange={(event, selected) => {
                                if (selected) {
                                  setDateVal(selected);
                                  setDateText(toBeThaiText(selected));
                                }
                                setShowPicker(false);
                              }}
                            />
                          )}
                        </View>
                      </TouchableWithoutFeedback>
                    </View>
                  </TouchableWithoutFeedback>
                </Modal>
              )}

              <Text style={[styles.modalLabel, styles.mt10, { color: colors.subtext }]}>{t('annImageLink')}</Text>
              <TextInput
                value={image}
                onChangeText={setImage}
                placeholder="https://..."
                placeholderTextColor={darkMode ? '#888' : '#9AA3AB'}
                style={[styles.input, { color: colors.text, borderColor: colors.line }]}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
              />

              {/* Category quick pick */}
              <View style={styles.catRow}>
                {CATEGORY_ICONS.map(cat => (
                  <TouchableOpacity
                    key={cat.key}
                    style={[styles.catChip, { borderColor: colors.line }, darkMode ? styles.bgDark22 : styles.bgLightF6]}
                    onPress={() => setImage(cat.url)}
                  >
                    <Ionicons name="pricetag-outline" size={14} color={colors.text} />
                    <Text style={[styles.catChipText, { color: colors.text }]}>{t(cat.label)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Description */}
              <Text style={[styles.modalLabel, styles.mt10, { color: colors.subtext }]}>{t('annDescriptionLabel')}</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder={t('annDescriptionPlaceholder')}
                placeholderTextColor={darkMode ? '#888' : '#9AA3AB'}
                style={[styles.input, styles.inputMultiline, { color: colors.text, borderColor: colors.line }]}
                multiline
                maxLength={ANNOUNCEMENT_DESCRIPTION_MAX_LENGTH}
              />

              {/* Image picker + preview */}
              <View style={styles.rowCenterMt10}>
                <TouchableOpacity onPress={pickFromGallery} style={styles.pickImageBtn}>
                  <Ionicons name="image-outline" size={16} color="#fff" />
                  <Text style={styles.pickImageBtnText}>{t('annChooseImage')}</Text>
                </TouchableOpacity>
                {!!image && (
                  <View style={styles.previewRow}>
                    <Image source={{ uri: image }} style={styles.previewThumb} />
                    <TouchableOpacity onPress={() => setImage('')} style={styles.clearImgBtn}>
                      <Ionicons name="close-circle" size={20} color={colors.subtext} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Important toggle */}
              <View style={styles.rowMt10}>
                <TouchableOpacity onPress={() => setImportant(v => !v)} style={[
                  styles.importantChip,
                  { borderColor: colors.line },
                  important ? styles.importantChipActive : (darkMode ? styles.bgDark22 : styles.bgLightF6),
                ]}>
                  <Ionicons name={important ? 'star' : 'star-outline'} size={16} color={important ? '#FFC107' : colors.subtext} />
                  <Text style={[styles.importantChipText, { color: colors.text }]}>{t('annImportant')}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity style={[styles.modalBtn, styles.modalCancel]} onPress={onClose} disabled={saving}>
                  <Text style={styles.modalCancelText}>{t('cancel')}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.modalBtn, styles.modalSave]} onPress={submit} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalSaveText}>{t('save')}</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
    
    {/* Warning Modal */}
    <Modal visible={warningVisible} transparent animationType="fade" onRequestClose={() => setWarningVisible(false)}>
      <TouchableWithoutFeedback onPress={() => setWarningVisible(false)}>
        <View style={styles.modalBackdrop}>
          <TouchableWithoutFeedback>
            <View style={[styles.modalCard, styles.smallModal300, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
              <View style={styles.center}>
                <View style={styles.iconCircleWarning}>
                  <Ionicons name="alert-circle" size={32} color={COLORS.orange} />
                </View>
                <Text style={[styles.modalTitle, styles.textCenterMb8, { color: colors.text }]}>
                  {t('annIncomplete')}
                </Text>
                <Text style={[styles.modalLabel, styles.textCenterMb16, { color: colors.subtext }]}>
                  {t('annFillPrompt')}
                </Text>
                <View style={[styles.listBox, darkMode ? styles.bgDark33 : styles.bgWarningLight]}>
                  {missingFields.map((field, index) => (
                    <View key={index} style={styles.listItemRow}>
                      <Ionicons name="ellipse" size={6} color={COLORS.orange} style={styles.bulletIcon} />
                      <Text style={[styles.listItemText, { color: colors.text }]}>{field}</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity 
                  onPress={() => setWarningVisible(false)} 
                  style={[styles.modalBtn, styles.fullWidthBtnOrange]}
                >
                  <Text style={styles.modalSaveText}>{t('ok')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
    </>
  );
};

const AnnouncementAdmin: React.FC<{ darkMode: boolean; onDataChanged?: () => void }>= ({ darkMode, onDataChanged }) => {
  const { t } = useI18n();
  const [items, setItems] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [roleLoading, setRoleLoading] = useState(true);
  const [role, setRole] = useState<Role>('user');

  // modal states
  const [addVisible, setAddVisible] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editItem, setEditItem] = useState<AnnouncementItem | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [truncated, setTruncated] = useState<Record<number, boolean>>({});
  const [measured, setMeasured] = useState<Record<number, boolean>>({});
  const [overdueNotified, setOverdueNotified] = useState(false);
  const [showOverdueModal, setShowOverdueModal] = useState(false);
  const [overdueItems, setOverdueItems] = useState<AnnouncementItem[]>([]);

  const BASE_URL = getBaseUrl();

  const colors = useMemo(() => ({
    bg: darkMode ? '#121212' : COLORS.bg,
    text: darkMode ? '#FFFFFF' : COLORS.text,
    subtext: darkMode ? '#CCCCCC' : COLORS.subtext,
    line: darkMode ? '#333333' : COLORS.line,
    green: COLORS.green,
    greenSoft: darkMode ? '#1B4F35' : COLORS.greenSoft,
    orange: COLORS.orange,
    red: COLORS.red,
    cardBg: darkMode ? '#1E1E1E' : '#FFFFFF',
  }), [darkMode]);

  // load role
  const fetchRole = useCallback(async () => {
    try {
      setRoleLoading(true);
      const token = await AsyncStorage.getItem('token');
      if (!token) { setRole('user'); return; }
      const res = await fetch(`${BASE_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(t('annLoadPermFailed'));
      const me = await res.json();
      setRole((me?.role ?? 'user') as Role);
    } catch (e: any) {
      console.warn('fetchRole error:', e?.message);
      setRole('user');
    } finally {
      setRoleLoading(false);
    }
  }, [BASE_URL, t]);

  // load items
  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${BASE_URL}/announcements`);
      if (!res.ok) {
        setItems([]);
        return;
      }
      const json = await res.json();
      const rows = (json?.data ?? []) as any[];
      const mapped = rows.map(a => ({
        id: Number(a.id),
        title: String(a.title ?? ''),
        date: String(a.date ?? ''),
        image: toAbsoluteUrl(String(a.image ?? '')),
        important: !!a.important,
        description: a.description != null ? String(a.description) : '',
      }));

      // sort future first (nearest date), overdue at bottom
      const today = new Date(); today.setHours(0,0,0,0);
      const toDiff = (s?: string) => {
        const d = toDate(s || '');
        if (!d || isNaN(d.getTime())) return Number.POSITIVE_INFINITY;
        const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        return dd.getTime() - today.getTime();
      };
      const mappedSorted = mapped.sort((a, b) => {
        const da = toDiff(a.date);
        const db = toDiff(b.date);
        const aPast = da < 0, bPast = db < 0;
        if (aPast !== bPast) return aPast ? 1 : -1;
        return da - db;
      });
      setItems(mappedSorted as AnnouncementItem[]);

      // notify admin once about overdue
      if (!overdueNotified && (role === 'admin' || role === 'superadmin')) {
        const overdue = mappedSorted.filter(it => {
          const d = toDate(it.date);
          if (!d) return false;
          const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
          return dd.getTime() < today.getTime();
        });
        if (overdue.length > 0) {
          setOverdueItems(overdue);
          setShowOverdueModal(true);
          setOverdueNotified(true);
        }
      }
    } catch (e: any) {
      showAlert(t('error'), e?.message ?? t('annLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [BASE_URL, role, overdueNotified, t]);

  useEffect(() => {
    fetchRole();
    fetchItems();
  }, [fetchRole, fetchItems]);

  // Confirmation Modal State
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive?: boolean;
  } | null>(null);

  const toggleImportant = useCallback((item: AnnouncementItem) => {
    if (role !== 'admin' && role !== 'superadmin') return;
    
    setConfirmConfig({
      title: t('confirm'),
      message: item.important 
        ? t('annConfirmRemoveImportant') 
        : t('annConfirmSetImportant'),
      onConfirm: async () => {
        try {
          const token = await AsyncStorage.getItem('token');
          const res = await fetch(`${BASE_URL}/announcements/${item.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ important: !item.important }),
          });
          if (!res.ok) throw new Error(t('annUpdateFailed'));
          await res.json();
          await fetchItems();
          onDataChanged?.();
        } catch (e: any) {
          showAlert(t('error'), e?.message || t('annUpdImportantFailed'));
        }
      }
    });
    setConfirmVisible(true);
  }, [BASE_URL, fetchItems, role, onDataChanged, t]);

  const toggleConfirm = () => {
    if (confirmConfig) {
      confirmConfig.onConfirm();
      setConfirmVisible(false);
    }
  };

  // Add
  const openAdd = useCallback(() => { if (role === 'admin' || role === 'superadmin') setAddVisible(true); }, [role]);
  const closeAdd = () => { if (!addSaving) setAddVisible(false); };
  const handleAddSave = async ({ title, date, image, important, description }: { title: string; date: string; image: string; important?: boolean; description?: string }) => {
    try {
      setAddSaving(true);
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${BASE_URL}/announcements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ title, date, image, important: !!important, description: description ?? '' }),
      });
      if (!res.ok) throw new Error(t('annAddFailed'));
      await fetchItems();
      onDataChanged?.();
      closeAdd();
    } catch (e: any) {
      showAlert(t('error'), e?.message ?? t('annAddDataFailed'));
    } finally {
      setAddSaving(false);
    }
  };

  // Edit
  const openEdit = useCallback((item: AnnouncementItem) => {
    if (role !== 'admin' && role !== 'superadmin') return;
    setEditItem(item);
    setEditVisible(true);
  }, [role]);
  const closeEdit = () => {
    if (editSaving) return;
    setEditVisible(false);
    setEditItem(null);
  };
  // Success Modal State
  const [successVisible, setSuccessVisible] = useState(false);
  const [successConfig, setSuccessConfig] = useState<{ title: string; message?: string; items?: string[] }>({ title: '' });

  const handleEditSave = async ({ title, date, image, important, description }: { title: string; date: string; image: string; important?: boolean; description?: string }) => {
    try {
      if (!editItem) return;
      setEditSaving(true);
      
      // Calculate changes
      const changes: string[] = [];
      if (title !== editItem.title) changes.push(t('annTitleChanged', { old: editItem.title, new: title }));
      if (date !== editItem.date) changes.push(t('annDateChanged', { old: formatBeThai(editItem.date), new: formatBeThai(date) }));
      if (image !== editItem.image) changes.push(t('annImageChanged'));
      if (important !== editItem.important) changes.push(t('annImportantChanged', { status: important ? t('annImportantOn') : t('annImportantOff') }));
      if (description !== editItem.description) changes.push(t('annDescChanged'));

      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${BASE_URL}/announcements/${editItem.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ title, date, image, important: important ?? editItem.important ?? false, description: description ?? editItem.description ?? '' }),
      });
      if (!res.ok) throw new Error(t('annEditFailed'));
      await fetchItems();
      onDataChanged?.();
      
      setSuccessConfig({
        title: t('annSaveSuccess'),
        items: changes.length > 0 ? changes : [t('annNoChanges')]
      });
      setEditVisible(false);
      setEditItem(null);
      setTimeout(() => setSuccessVisible(true), 300);
      
    } catch (e: any) {
      showAlert(t('error'), e?.message ?? t('annEditDataFailed'));
    } finally {
      setEditSaving(false);
    }
  };

  // Delete
  const handleDelete = useCallback((item: AnnouncementItem) => {
    if (role !== 'admin' && role !== 'superadmin') return;
    
    setConfirmConfig({
      title: t('annDeleteTitle'),
      message: t('annConfirmDeleteMsg', { title: item.title }),
      isDestructive: true,
      onConfirm: async () => {
        try {
          const token = await AsyncStorage.getItem('token');
          const res = await fetch(`${BASE_URL}/announcements/${item.id}`, {
            method: 'DELETE',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (!res.ok) throw new Error(t('annDeleteFailed'));
          await fetchItems();
          onDataChanged?.();
          
          setSuccessConfig({
            title: t('annDeleteSuccess'),
            message: t('annDeletedMsg', { title: item.title })
          });
          setTimeout(() => setSuccessVisible(true), 300);

        } catch (e: any) {
          showAlert(t('error'), e?.message ?? t('annDeleteDataFailed'));
        }
      }
    });
    setConfirmVisible(true);
  }, [role, BASE_URL, fetchItems, t, onDataChanged]);

  const renderItem = useCallback(({ item }: { item: AnnouncementItem }) => (
    <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
      {/* 1. Image */}
      {item.image ? (
        <Image source={{ uri: item.image }} style={styles.cardImage} resizeMode="cover" />
      ) : (
        <View style={[styles.cardImage, darkMode ? styles.bgDark2A : styles.bgLightF5]}>
          <Ionicons name="image-outline" size={24} color={colors.subtext} />
        </View>
      )}

      {/* 2. Content */}
      <View style={styles.cardContent}>
        <View style={styles.cardHeaderRow}>
          <Text numberOfLines={2} style={[styles.cardTitle, { color: colors.text }]}>
            {item.title}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <View style={[styles.dateBadge, { backgroundColor: colors.greenSoft }]}> 
            <Ionicons name="calendar-clear" size={12} color={darkMode ? '#81C784' : '#2E7D32'} />
            <Text style={[styles.dateBadgeText, darkMode ? styles.colorGreenLight : styles.colorGreenDark]}>{formatBeThai(item.date)}</Text>
          </View>
          
          {(() => {
            const d = toDate(item.date);
            if (!d) return null;
            const td = new Date(); td.setHours(0,0,0,0);
            const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            if (dd.getTime() < td.getTime()) {
              return (
                <View style={styles.overdueBadge}>
                  <Ionicons name="alert-circle" size={12} color="#D32F2F" />
                  <Text style={styles.overdueBadgeText}>{t('annOverdue')}</Text>
                </View>
              );
            }
            return null;
          })()}
        </View>

        {!!item.description && (
          <View style={styles.mt6}>
            <Text
              onTextLayout={(e) => {
                if (!measured[item.id]) {
                  const isMore = (e.nativeEvent?.lines?.length || 0) > 2;
                  setTruncated((prev) => ({ ...prev, [item.id]: isMore }));
                  setMeasured((prev) => ({ ...prev, [item.id]: true }));
                }
              }}
              numberOfLines={measured[item.id] ? (expanded[item.id] ? undefined : 2) : undefined}
              style={[styles.descText, { color: colors.subtext }]}
            >
              {item.description}
            </Text>
            {measured[item.id] && (truncated[item.id] || expanded[item.id]) && (
              <TouchableOpacity
                onPress={() => setExpanded((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                activeOpacity={0.7}
                style={styles.selfStart}
              >
                <Text style={styles.moreLessText}>{expanded[item.id] ? t('collapse') : t('readMore')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* 3. Actions (Floating or Side) */}
      {(role === 'admin' || role === 'superadmin') && (
        <View style={styles.actionRow}>
          <TouchableOpacity onPress={() => toggleImportant(item)} style={[styles.circleBtn, item.important ? styles.bgStarActive : (darkMode ? styles.bgDark33 : styles.bgStarInactive)]}>
            <Ionicons name={item.important ? 'star' : 'star-outline'} size={16} color={item.important ? '#FFF' : '#FF9800'} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openEdit(item)} style={[styles.circleBtn, { backgroundColor: COLORS.orange }]}>
            <Ionicons name="pencil" size={16} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDelete(item)} style={[styles.circleBtn, { backgroundColor: COLORS.red }]}>
            <Ionicons name="trash" size={16} color="#FFF" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  ), [colors, expanded, measured, truncated, role, toggleImportant, handleDelete, openEdit, darkMode, t]);

  const renderHeader = useCallback(() => (
    <View style={[styles.header, { backgroundColor: colors.bg }]}>
      <Text style={[styles.headerTitle, { color: colors.text }]}>{t('annTitle')}</Text>
      <Text style={[styles.headerSubtitle, { color: colors.subtext }]}>{t('annManage')}</Text>
    </View>
  ), [colors, t]);

  const renderFooter = useCallback(() => (
    <View style={styles.footerSpacer} />
  ), []);

  if (roleLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={COLORS.green} />
        <Text style={[styles.loadingText, darkMode ? styles.colorWhite : styles.colorDark333]}>{t('annCheckingAuth')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <AnnouncementFormModal
        visible={addVisible}
        darkMode={darkMode}
        colors={colors}
        mode="add"
        initial={null}
        saving={addSaving}
        onClose={closeAdd}
        onSubmit={handleAddSave}
      />
      <AnnouncementFormModal
        visible={editVisible}
        darkMode={darkMode}
        colors={colors}
        mode="edit"
        initial={editItem}
        saving={editSaving}
        onClose={closeEdit}
        onSubmit={handleEditSave}
      />

      <FlatList
        data={items}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        refreshing={loading}
        onRefresh={fetchItems}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={ItemSeparator}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={!loading ? <EmptyState colors={colors} /> : null}
        ListFooterComponent={renderFooter}
        showsVerticalScrollIndicator={false}
      />

      {/* Floating Add Button */}
      {(role === 'admin' || role === 'superadmin') && (
        <TouchableOpacity style={styles.addButton} onPress={openAdd} activeOpacity={0.85}>
          <Ionicons name="add" size={22} color="#FFFFFF" />
          <Text style={styles.addButtonText}>{t('annAddButton')}</Text>
        </TouchableOpacity>
      )}

      {/* Overdue Modal */}
      <Modal visible={showOverdueModal} transparent animationType="fade" onRequestClose={() => setShowOverdueModal(false)}>
        <TouchableWithoutFeedback onPress={() => setShowOverdueModal(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={[styles.overdueModalContent, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
                {/* Warning Icon */}
                <View style={styles.overdueIconContainer}>
                  <Ionicons name="warning" size={40} color="#F59E0B" />
                </View>
                
                {/* Title */}
                <Text style={[styles.overdueModalTitle, { color: colors.text }]}>
                  {t('annOverdueItems')}
                </Text>
                
                {/* Count */}
                <Text style={[styles.overdueModalSubtitle, { color: colors.subtext }]}>
                  {t('annOverdueCount', { n: String(overdueItems.length) })}
                </Text>
                
                {/* List */}
                <View style={styles.overdueList}>
                  {overdueItems.slice(0, 5).map((item, index) => (
                    <View key={index} style={[styles.overdueItem, { borderColor: colors.line }]}>
                      <View style={styles.overdueItemDot} />
                      <View style={styles.overdueItemContent}>
                        <Text style={[styles.overdueItemTitle, { color: colors.text }]} numberOfLines={1}>
                          #{item.id} {item.title}
                        </Text>
                        <Text style={styles.overdueItemDate}>
                          {formatBeThai(item.date)}
                        </Text>
                      </View>
                    </View>
                  ))}
                  {overdueItems.length > 5 && (
                    <Text style={[styles.overdueMoreText, { color: colors.subtext }]}>
                      {t('annAndMore', { n: String(overdueItems.length - 5) })}
                    </Text>
                  )}
                </View>
                
                {/* OK Button */}
                <TouchableOpacity 
                  style={styles.overdueOkBtn}
                  onPress={() => setShowOverdueModal(false)}
                >
                  <Text style={styles.overdueOkBtnText}>{t('ok')}</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      {/* Custom Confirmation Modal */}
      <Modal visible={confirmVisible} transparent animationType="fade" onRequestClose={() => setConfirmVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setConfirmVisible(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalCard, styles.smallModal320, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
                <View style={styles.center}>
                  <View style={[styles.iconCircle, confirmConfig?.isDestructive ? styles.iconCircleDanger : styles.iconCircleWarning]}>
                    <Ionicons 
                      name={confirmConfig?.isDestructive ? "trash-outline" : "alert-circle"} 
                      size={32} 
                      color={confirmConfig?.isDestructive ? COLORS.red : COLORS.orange} 
                    />
                  </View>
                  <Text style={[styles.modalTitle, styles.textCenterMb8, { color: colors.text }]}>
                    {confirmConfig?.title || t('confirm')}
                  </Text>
                  <Text style={[styles.modalLabel, styles.textCenterMb24, { color: colors.subtext }]}>
                    {confirmConfig?.message}
                  </Text>

                  <View style={styles.btnRowGap}>
                    <TouchableOpacity 
                      onPress={() => setConfirmVisible(false)} 
                      style={[styles.modalBtn, styles.flex1NoMr, darkMode ? styles.bgDark33 : styles.bgLightF5]}
                    >
                      <Text style={[styles.modalCancelText, { color: colors.text }]}>{t('cancel')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={toggleConfirm} 
                      style={[styles.modalBtn, styles.flex1, confirmConfig?.isDestructive ? styles.bgRed : styles.bgGreen]}
                    >
                      <Text style={styles.modalSaveText}>{confirmConfig?.isDestructive ? t('delete') : t('confirm')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Success Modal */}
      <Modal visible={successVisible} transparent animationType="fade" onRequestClose={() => setSuccessVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setSuccessVisible(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalCard, styles.smallModal320, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
                <View style={styles.center}>
                  <View style={styles.iconCircleSuccess}>
                    <Ionicons name="checkmark-circle" size={32} color={COLORS.green} />
                  </View>
                  <Text style={[styles.modalTitle, styles.textCenterMb8, { color: colors.text }]}>
                    {successConfig.title}
                  </Text>
                  
                  {successConfig.items ? (
                    <>
                      <Text style={[styles.modalLabel, styles.textCenterMb16, { color: colors.subtext }]}>
                        {t('annEditChanges')}
                      </Text>
                      <View style={[styles.listBox, darkMode ? styles.bgDark33 : styles.bgSuccessLight]}>
                        {successConfig.items.map((log, index) => (
                          <View key={index} style={styles.listItemRow}>
                            <Ionicons name="ellipse" size={6} color={colors.subtext} style={styles.bulletIcon} />
                            <Text style={[styles.listItemText, { color: colors.text }]}>{log}</Text>
                          </View>
                        ))}
                      </View>
                    </>
                  ) : (
                    <Text style={[styles.modalLabel, styles.textCenterMb24, styles.fs14, { color: colors.subtext }]}>
                      {successConfig.message}
                    </Text>
                  )}
                  
                  <TouchableOpacity 
                    onPress={() => setSuccessVisible(false)} 
                    style={[styles.modalBtn, styles.fullWidthBtnGreen]}
                  >
                    <Text style={styles.modalSaveText}>{t('ok')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
};

const EmptyState: React.FC<{ colors: any }> = ({ colors }) => {
  const { t } = useI18n();
  return (
    <View style={styles.emptyContainer}>
      <Ionicons name="megaphone-outline" size={64} color={colors.subtext} />
      <Text style={[styles.emptyText, { color: colors.subtext }]}>{t('annNoItems')}</Text>
      <Text style={[styles.emptySubtext, { color: colors.subtext }]}>{t('annPressAdd')}</Text>
    </View>
  );
};

export default AnnouncementAdmin;

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },

  // Header
  header: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20 },
  headerTitle: { fontSize: 22, fontWeight: '800', marginBottom: 6 },
  headerSubtitle: { fontSize: 13, fontWeight: '500' },

  // List
  listContent: { paddingHorizontal: 12, paddingVertical: 10, flexGrow: 1 },
  separator: { height: 12 },

  // Card
  card: {
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  cardImage: {
    width: 65,
    height: 65,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
    marginLeft: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginRight: 6,
    marginBottom: 4,
  },
  dateBadgeText: { fontSize: 12, fontWeight: '700', marginLeft: 4 },
  overdueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFCDD2',
    marginBottom: 4,
  },
  overdueBadgeText: { marginLeft: 4, color: '#D32F2F', fontSize: 11, fontWeight: '700' },
  descText: { fontSize: 13, lineHeight: 18 },
  moreLessText: { color: COLORS.green, fontSize: 13, fontWeight: '800', marginTop: 2 },
  
  actionRow: {
    paddingLeft: 8,
    flexDirection: 'row',
    gap: 6,
  },
  circleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },

  // Footer
  footerContainer: { },
  addButton: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.green,
    paddingVertical: 16,
    borderRadius: 26,
    shadowColor: COLORS.green,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 7,
  },
  addButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', marginLeft: 8 },

  // Empty
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 16, fontWeight: '800', marginTop: 18, marginBottom: 6 },
  emptySubtext: { fontSize: 13, textAlign: 'center' },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCenter: { width: '100%' },
  modalCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    width: '100%',
    maxWidth: 420,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
  modalLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 14,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
  modalBtn: {
    minWidth: 96,
    minHeight: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginLeft: 8,
  },
  modalCancel: { backgroundColor: '#E9ECEF' },
  modalCancelText: { color: '#333', fontWeight: '700' },
  modalSave: { backgroundColor: COLORS.green },
  modalSaveText: { color: '#fff', fontWeight: '800' },
  pickerModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  pickerCard: { width: '92%', maxWidth: 420, borderRadius: 16, padding: 16, borderWidth: 1 },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingRight: 35,
  },
  pickerTitle: { fontSize: 16, fontWeight: '800' },
  todayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.green,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  todayBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 4,
  },
  pickerCloseX: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    elevation: 5,
  },
  // ===== Overdue Modal =====
  overdueModalContent: {
    width: '92%',
    maxWidth: 400,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    alignItems: 'center',
  },
  overdueIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  overdueModalTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
  },
  overdueModalSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 16,
  },
  overdueList: {
    width: '100%',
    maxHeight: 200,
  },
  overdueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  overdueItemDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#B00020',
    marginRight: 12,
  },
  overdueItemContent: {
    flex: 1,
  },
  overdueItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  overdueItemDate: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B00020',
  },
  overdueMoreText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
  },
  overdueOkBtn: {
    marginTop: 20,
    backgroundColor: '#F59E0B',
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 12,
  },
  overdueOkBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // === Utility styles ===
  mt6: { marginTop: 6 },
  mt10: { marginTop: 10 },
  ml8: { marginLeft: 8 },
  flex1: { flex: 1 },
  flex1NoMr: { flex: 1, marginRight: 0 },
  fs14: { fontSize: 14 },
  selfStart: { alignSelf: 'flex-start' as const },
  inputRow: { flexDirection: 'row' as const, alignItems: 'center' as const },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' as const },

  // Dark/Light background variants
  bgDark2A: { backgroundColor: '#2A2A2A' },
  bgDark22: { backgroundColor: '#222' },
  bgDark33: { backgroundColor: '#333' },
  bgLight: { backgroundColor: '#EEF2F5' },
  bgLightF5: { backgroundColor: '#F5F5F5' },
  bgLightF6: { backgroundColor: '#F6F8FA' },
  bgWarningLight: { backgroundColor: '#FFF3E0' },
  bgSuccessLight: { backgroundColor: '#F9FAFB' },
  bgRed: { backgroundColor: COLORS.red },
  bgGreen: { backgroundColor: COLORS.green },
  bgStarActive: { backgroundColor: '#FFC107' },
  bgStarInactive: { backgroundColor: '#FFF3E0' },

  // Color variants
  colorWhite: { color: '#fff' },
  colorDark333: { color: '#333' },
  colorGreenLight: { color: '#81C784' },
  colorGreenDark: { color: '#2E7D32' },

  // Text alignment helpers
  textCenterMb8: { textAlign: 'center' as const, marginBottom: 8 },
  textCenterMb16: { textAlign: 'center' as const, marginBottom: 16 },
  textCenterMb24: { textAlign: 'center' as const, marginBottom: 24 },

  // Category chips
  catRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, marginTop: 10 },
  catChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 8,
    marginBottom: 8,
  },
  catChipText: { marginLeft: 6, fontWeight: '600' as const },

  // Image picker section
  rowCenterMt10: { flexDirection: 'row' as const, alignItems: 'center' as const, marginTop: 10 },
  rowMt10: { flexDirection: 'row' as const, marginTop: 10 },
  pickImageBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: COLORS.green,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  pickImageBtnText: { color: '#fff', fontWeight: '800' as const, marginLeft: 8 },
  previewRow: { marginLeft: 12, flexDirection: 'row' as const, alignItems: 'center' as const },
  previewThumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#EAEAEA' },
  clearImgBtn: { marginLeft: 8, padding: 6 },

  // Important toggle chip
  importantChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  importantChipActive: { backgroundColor: 'rgba(255,193,7,0.2)' },
  importantChipText: { marginLeft: 8, fontWeight: '700' as const },

  // Modal icon circles
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 16,
  },
  iconCircleWarning: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 162, 26, 0.15)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 16,
  },
  iconCircleDanger: {
    backgroundColor: 'rgba(239, 83, 80, 0.15)',
  },
  iconCircleSuccess: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 16,
  },

  // Modal size variants
  smallModal300: { width: 300, padding: 24 },
  smallModal320: { width: 320, padding: 24 },

  // List items in modals
  listBox: {
    width: '100%' as const,
    marginBottom: 24,
    padding: 12,
    borderRadius: 12,
  },
  listItemRow: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, marginBottom: 6 },
  bulletIcon: { marginTop: 7, marginRight: 8 },
  listItemText: { fontSize: 13, flex: 1, lineHeight: 20 },

  // Full-width modal buttons
  fullWidthBtnOrange: { backgroundColor: COLORS.orange, width: '100%' as const, marginRight: 0 },
  fullWidthBtnGreen: { backgroundColor: COLORS.green, width: '100%' as const, marginRight: 0 },
  btnRowGap: { flexDirection: 'row' as const, gap: 12, width: '100%' as const },

  // Footer
  footerSpacer: { height: 100 },
  loadingText: { marginTop: 8 },

  // Calendar day component
  calendarDayBtn: {
    width: 36,
    height: 36,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 18,
  },
  calendarDaySelected: { backgroundColor: COLORS.green },
  calendarDayText: { fontSize: 14, fontWeight: '500' as const },
  calendarDayTextBold: { fontWeight: '700' as const },
  calendarDayTextSelected: { color: '#fff' },
  calendarDayTextDisabled: { color: '#ccc' },
  calendarDayTextToday: { color: COLORS.orange },
  calendarDayTextWeekend: { color: '#E53935' },
});
