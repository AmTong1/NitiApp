import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Modal, TextInput, Platform, ActivityIndicator,
  StatusBar, Image,
  ScrollView, Keyboard, Animated, PermissionsAndroid
} from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showAlert } from '../components/GlobalAlert';
import { BASE_HOST, BASE_PORT } from './config.ts';
import { launchImageLibrary, launchCamera, Asset } from 'react-native-image-picker';
import ImageResizer from 'react-native-image-resizer';

const ANDROID_HOST = BASE_HOST;

type Repair = {
  id: number;
  user_id: string;
  title: string;
  detail?: string;
  status: 'pending' | 'in_progress' | 'done';
  created_at: string;
  done_at?: string;
  images?: string[];
  photos?: { id: number; url: string }[];
  house_number?: string;
  allow_user_edit?: boolean;
};

type Me = {
  id: number;
  username: string;
  full_name?: string;
  role: 'admin' | 'user' | 'superadmin';
  created_at?: string;
  house_number?: string;
};

interface RepairScreenProps { darkMode?: boolean; }

export function getBaseUrl() {
  const host = Platform.OS === 'android' ? ANDROID_HOST : BASE_HOST;
  return `http://${host}:${BASE_PORT}`;
}

const normalizeUrl = (u?: string | null): string => {
  if (!u) return '';
  const base = getBaseUrl();
  if (/^https?:\/\//i.test(u)) {
    const s = u.replace(/^https?:\/\//i, '');
    const slash = s.indexOf('/');
    const path = slash >= 0 ? s.slice(slash) : '/';
    return `${base}${path}`;
  }
  if (u.startsWith('/')) return `${base}${u}`;
  return `${base}/${u}`;
};

// useDebounce hook - kept for future use
// const useDebounce = <T,>(value: T, delay = 250) => {
//   const [v, setV] = useState(value);
//   useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t); }, [value, delay]);
//   return v;
// };

const lower = (v: unknown) => String(v ?? '').toLowerCase();

const expandSearchIds = (raw: string): number[] => {
  if (!raw) return [];
  const tokens = raw.replace(/#/g, '').split(/[\s,]+/).filter(Boolean);
  const ids: number[] = [];
  for (const t of tokens) {
    const m = t.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      let a = parseInt(m[1], 10), b = parseInt(m[2], 10);
      if (!Number.isNaN(a) && !Number.isNaN(b)) {
        if (a > b) [a, b] = [b, a];
        for (let x = a; x <= b; x++) ids.push(x);
      }
      continue;
    }
    const n = parseInt(t, 10);
    if (!Number.isNaN(n)) ids.push(n);
  }
  return Array.from(new Set(ids));
};

// ---------- helper: สร้าง timestamp + เตรียมไฟล์ย่อรูป ----------
const pad2 = (n: number) => String(n).padStart(2, '0');
const buildTimestamp = (d = new Date()) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}`;

/**
 * ย่อรูปให้ยาวสุด 1600px, JPEG คุณภาพ 82% และตั้งชื่อไฟล์ตามรูปแบบ
 * คืนค่าเป็น { uri, name, type } พร้อมอัปโหลดได้ใน FormData
 */
async function prepareUploadFile(
  raw: Asset,
  userTag: string | number,
): Promise<{ uri: string; name: string; type: string }> {
  const stamp = buildTimestamp();
  const safeUser = String(userTag || 'guest').replace(/[^\w.-]+/g, '_');
  const fileName = `user_${safeUser}_${stamp}.jpg`;
  const type = 'image/jpeg';

  // ถ้าไม่มี uri ก็โยน error
  if (!raw.uri) {
    throw new Error('ไม่พบไฟล์รูปที่จะอัปโหลด');
  }

  try {
    // resize แบบ contain ให้ด้านยาวสุดไม่เกิน 1600
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
    // Android มักได้ path / iOS ได้ uri
    const uri = resized.uri || `file://${resized.path}`;
    return { uri, name: fileName, type };
  } catch {
    // fallback: ใช้ไฟล์เดิม (อาจใหญ่กว่า)
    return {
      uri: raw.uri!,
      name: fileName,
      type: type,
    };
  }
}

// ---------- AddRepairModal (ย้ายออกมานอก RepairScreen เพื่อป้องกัน re-create) ----------
const AddRepairModal = React.memo(({ visible, onClose, onSubmit, saving, colors, uploadProgress, uploadNote, uploadBusy, isAdmin, myHouseNumber, getToken, showSuccess, successOpacity }: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (payload: { title: string; detail: string; assets: Asset[]; houseNumber?: string; allowUserEdit?: boolean }) => void;
  saving: boolean;
  colors: any;
  uploadProgress: number;
  uploadNote: string;
  uploadBusy: boolean;
  isAdmin: boolean;
  myHouseNumber?: string;
  getToken: () => Promise<string | null>;
  showSuccess: boolean;
  successOpacity: Animated.Value;
}) => {
  const [localTitle, setLocalTitle] = useState('');
  const [localDetail, setLocalDetail] = useState('');
  const [localHouseNumber, setLocalHouseNumber] = useState('');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isPickingImage, setIsPickingImage] = useState(false);
  const [previewFullscreen, setPreviewFullscreen] = useState<string | null>(null);
  
  // Autocomplete state
  const [allHouses, setAllHouses] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [houseValid, setHouseValid] = useState<boolean | null>(null); // null = ยังไม่ตรวจ, true = valid, false = invalid
  
  // Warning Modal State
  const [warningVisible, setWarningVisible] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);

  // Fetch house numbers when modal opens
  useEffect(() => {
    if (visible && isAdmin) {
      (async () => {
        try {
          const token = await getToken();
          const res = await fetch(`${getBaseUrl()}/houses`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await res.json();
          if (res.ok && Array.isArray(data?.data)) {
            setAllHouses(data.data);
          }
        } catch (e) {
          console.warn('Failed to fetch houses:', e);
        }
      })();
    }
  }, [visible, isAdmin, getToken]);

  useEffect(() => {
    if (visible) {
      setLocalTitle('');
      setLocalDetail('');
      setLocalHouseNumber('');
      setAssets([]);
      setSuggestions([]);
      setHouseValid(null);
    }
  }, [visible]);

  // Update suggestions when house number changes
  useEffect(() => {
    if (!localHouseNumber.trim()) {
      setSuggestions([]);
      setHouseValid(null);
      return;
    }
    const q = localHouseNumber.trim();
    const matched = allHouses.filter(h => h.includes(q)).slice(0, 3);
    setSuggestions(matched);
    
    // Check if exact match exists
    const exactMatch = allHouses.includes(q);
    setHouseValid(exactMatch);
  }, [localHouseNumber, allHouses]);

  const selectSuggestion = (house: string) => {
    setLocalHouseNumber(house);
    setSuggestions([]);
    setHouseValid(true);
    Keyboard.dismiss();
  };

  const MAX_PHOTOS = 5;

  const requestCameraPermission = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
        {
          title: 'ขออนุญาตใช้กล้อง',
          message: 'แอปต้องการใช้กล้องเพื่อถ่ายรูปในการแจ้งซ่อม',
          buttonNeutral: 'ถามภายหลัง',
          buttonNegative: 'ไม่อนุญาต',
          buttonPositive: 'อนุญาต',
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.warn('Camera permission error:', err);
      return false;
    }
  };

  const pickFromLibrary = async () => {
    if (isPickingImage) return;
    setIsPickingImage(true);
    try {
      console.log('Launching image library...');
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: MAX_PHOTOS - assets.length,
        quality: 0.8,
        presentationStyle: 'fullScreen',
      });
      console.log('Image library result:', JSON.stringify(result));
      if (result.didCancel) {
        console.log('User cancelled image picker');
        return;
      }
      if (result.errorCode) {
        console.log('Image picker error:', result.errorCode, result.errorMessage);
        showAlert('เกิดข้อผิดพลาด', result.errorMessage || 'ไม่สามารถเลือกรูปได้');
        return;
      }
      if (!result.assets || result.assets.length === 0) {
        console.log('No assets returned');
        return;
      }
      const list = (result.assets || []).filter(a => a.uri);
      console.log('Selected images:', list.length);
      if (list.length > 0) {
        setAssets(prev => [...prev, ...list].slice(0, MAX_PHOTOS));
      }
    } catch (e) {
      console.log('pickFromLibrary error:', e);
      showAlert('เกิดข้อผิดพลาด', 'ไม่สามารถเลือกรูปได้');
    } finally {
      setIsPickingImage(false);
    }
  };

  const takeFromCamera = async () => {
    if (isPickingImage) return;
    
    // ขอ permission กล้องก่อน
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      showAlert('ไม่ได้รับอนุญาต', 'กรุณาอนุญาตการใช้กล้องในการตั้งค่า');
      return;
    }
    
    setIsPickingImage(true);
    try {
      const result = await launchCamera({
        mediaType: 'photo',
        quality: 0.8,
        includeExtra: false,
        saveToPhotos: true,
      });
      if (result.didCancel || !result.assets) return;
      const list = (result.assets || []).filter(a => a.uri);
      if (list.length > 0) {
        setAssets(prev => [...prev, ...list].slice(0, MAX_PHOTOS));
      }
    } catch (e) {
      console.log('takeFromCamera error:', e);
    } finally {
      setIsPickingImage(false);
    }
  };

  const removeAt = (idx: number) => setAssets(prev => prev.filter((_, i) => i !== idx));
  
  const handleSave = () => {
    const missing: string[] = [];
    if (!localTitle.trim()) missing.push('หัวข้อแจ้งซ่อม');
    if (isAdmin && !localHouseNumber.trim()) missing.push('บ้านเลขที่');

    if (missing.length > 0) {
      setMissingFields(missing);
      setWarningVisible(true);
      return;
    }
    onSubmit({ title: localTitle, detail: localDetail, assets, houseNumber: localHouseNumber });
  };

  if (!visible) return null;

  const isDisabled = saving || uploadBusy || isPickingImage;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContainer, { backgroundColor: colors.cardBg }]}>

          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>แจ้งซ่อมใหม่</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose} disabled={isDisabled}>
              <Ionicons name="close" size={24} color={colors.subtext} />
            </TouchableOpacity>
          </View>

          {/* Body (Scrollable) */}
          <ScrollView
            style={styles.modalBody}
            contentContainerStyle={styles.modalBodyContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* แสดงฟิลด์บ้านเลขที่สำหรับ admin (แก้ไขได้) */}
            {isAdmin && (
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>บ้านเลขที่ *</Text>
                <TextInput
                  style={[
                    styles.textInput,
                    { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text },
                    houseValid === false && styles.houseInputError,
                  ]}
                  placeholder="ระบุบ้านเลขที่ (ตัวเลขเท่านั้น)"
                  placeholderTextColor={colors.subtext}
                  value={localHouseNumber}
                  onChangeText={(text) => setLocalHouseNumber(text.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  maxLength={10}
                />
                {/* Suggestions */}
                {suggestions.length > 0 && localHouseNumber.trim() && !allHouses.includes(localHouseNumber.trim()) && (
                  <View style={styles.suggestionBox}>
                    {suggestions.map((h, idx) => (
                      <TouchableOpacity 
                        key={idx} 
                        style={styles.suggestionItem}
                        onPress={() => selectSuggestion(h)}
                      >
                        <Ionicons name="home-outline" size={14} color={colors.primary} />
                        <Text style={[styles.suggestionText, { color: colors.text }]}>{h}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {/* Error message */}
                {houseValid === false && localHouseNumber.trim().length > 0 && (
                  <Text style={styles.validationError}>
                    ❌ ไม่พบบ้านเลขที่ "{localHouseNumber}" ในระบบ
                  </Text>
                )}
                {houseValid === true && (
                  <Text style={styles.validationSuccess}>
                    ✓ บ้านเลขที่ถูกต้อง
                  </Text>
                )}
                {houseValid === null && (
                  <Text style={[styles.validationHint, { color: colors.subtext }]}>
                    * ต้องเป็นบ้านเลขที่ที่มีอยู่ในระบบ
                  </Text>
                )}
              </View>
            )}

            {/* แสดงบ้านเลขที่สำหรับ user (อ่านอย่างเดียว) */}
            {!isAdmin && myHouseNumber && (
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>บ้านเลขที่</Text>
                <View
                  style={[
                    styles.textInput,
                    styles.readonlyInputRow,
                    { borderColor: colors.border },
                  ]}
                >
                  <Ionicons name="home" size={16} color={colors.primary} style={styles.mr8} />
                  <Text style={[styles.houseDisplayText, { color: colors.text }]}>{myHouseNumber}</Text>
                </View>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>หัวข้อ *</Text>
              <TextInput
                style={[
                  styles.textInput,
                  { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text },
                ]}
                placeholder="ระบุปัญหาที่ต้องการแจ้งซ่อม"
                placeholderTextColor={colors.subtext}
                value={localTitle}
                onChangeText={setLocalTitle}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>รายละเอียด</Text>
              <TextInput
                style={[
                  styles.textArea,
                  { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text },
                ]}
                placeholder="อธิบายรายละเอียดเพิ่มเติม (ถ้ามี)"
                placeholderTextColor={colors.subtext}
                multiline
                numberOfLines={4}
                value={localDetail}
                onChangeText={setLocalDetail}
                textAlignVertical="top"
              />
            </View>

            {assets.length > 0 && (
              <View style={styles.previewGrid}>
                {assets.map((a, idx) => (
                  <TouchableOpacity key={idx} style={styles.previewItem} onPress={() => setPreviewFullscreen(a.uri!)} activeOpacity={0.8}>
                    <Image source={{ uri: a.uri! }} style={styles.previewImage} resizeMode="cover" />
                    <TouchableOpacity style={styles.previewRemove} onPress={() => removeAt(idx)}>
                      <Ionicons name="close-circle" size={20} color="#fff" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ScrollView>

          {/* Fullscreen Image Preview */}
          {previewFullscreen && (
            <Modal visible transparent animationType="fade" onRequestClose={() => setPreviewFullscreen(null)}>
              <View style={styles.fullscreenOverlay}>
                <Image source={{ uri: previewFullscreen }} style={styles.fullscreenImage} resizeMode="contain" />
                <TouchableOpacity style={styles.fullscreenClose} onPress={() => setPreviewFullscreen(null)}>
                  <Ionicons name="close-circle" size={40} color="#fff" />
                </TouchableOpacity>
              </View>
            </Modal>
          )}

          {/* Media buttons (fixed under content, not scrolled over the footer) */}
          <View style={styles.mediaBar}>
            <TouchableOpacity
              style={[styles.mediaBtn, { borderColor: colors.border }, (isDisabled || assets.length >= MAX_PHOTOS) && styles.opacityHalf]}
              onPress={pickFromLibrary}
              disabled={isDisabled || assets.length >= MAX_PHOTOS}
            >
              {isPickingImage ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <Ionicons name="images-outline" size={18} color={colors.text} />
              )}
              <Text style={[styles.mediaBtnLabel, { color: colors.text }]}>เลือกรูป</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.mediaBtn, { borderColor: colors.border }, (isDisabled || assets.length >= MAX_PHOTOS) && styles.opacityHalf]}
              onPress={takeFromCamera}
              disabled={isDisabled || assets.length >= MAX_PHOTOS}
            >
              {isPickingImage ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <Ionicons name="camera-outline" size={18} color={colors.text} />
              )}
              <Text style={[styles.mediaBtnLabel, { color: colors.text }]}>ถ่ายรูป</Text>
            </TouchableOpacity>

            <View style={styles.justifyCenter}>
              <Text style={[styles.photoCountText, { color: colors.subtext }]}>
                {assets.length}/{MAX_PHOTOS}
              </Text>
            </View>
          </View>



          {/* Footer */}
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[styles.cancelButton, { borderColor: colors.border }, isDisabled && styles.opacityHalf]}
              onPress={onClose}
              disabled={isDisabled}
            >
              <Text style={[styles.cancelButtonText, { color: colors.subtext }]}>ยกเลิก</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: colors.success }, isDisabled && styles.opacityDisabled]}
              onPress={handleSave}
              disabled={isDisabled}
            >
              {saving || uploadBusy ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                  <Text style={styles.submitButtonText}>ส่งคำขอ</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Upload Progress Overlay - outside modalContainer for full screen */}
        {uploadBusy && (
          <View style={styles.uploadOverlayFullScreen}>
            <View style={styles.uploadProgressBox}>
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text style={styles.uploadProgressTitle}>
                {uploadNote || 'กำลังอัปโหลด...'}
              </Text>
              <View style={styles.progressBarContainer}>
                <View style={[styles.progressBarFill, { width: `${uploadProgress}%` }]} />
              </View>
              <Text style={styles.uploadProgressPercent}>{uploadProgress}%</Text>
            </View>
          </View>
        )}

        {/* Success Popup สำหรับสร้างใหม่ */}
        {showSuccess && (
          <View style={styles.successOverlay}>
            <Animated.View
              style={[
                styles.successBox,
                {
                  opacity: successOpacity,
                },
              ]}
            >
              <View style={styles.successIconCircle}>
                <Ionicons name="checkmark" size={48} color="#fff" />
              </View>
              <Text style={styles.successTitle}>ส่งคำขอสำเร็จ!</Text>
              <Text style={styles.successSubtitle}>การแจ้งซ่อมถูกบันทึกแล้ว</Text>
            </Animated.View>
          </View>
        )}
      </View>

      {/* Warning Modal (Red Theme) */}
      <Modal visible={warningVisible} transparent animationType="fade" onRequestClose={() => setWarningVisible(false)}>
        <View style={[styles.modalOverlay, styles.warningOverlayCenter]}>
            <View style={styles.warningBox}>
              <View style={styles.warningIconCircle}>
                <Ionicons name="alert-circle" size={32} color="#EF4444" />
              </View>
              <Text style={styles.warningTitle}>
                กรอกข้อมูลไม่ครบ
              </Text>
              <Text style={styles.warningSubtitle}>
                กรุณากรอกข้อมูลต่อไปนี้:
              </Text>
              <View style={styles.warningFieldsBox}>
                {missingFields.map((field, index) => (
                  <View key={index} style={styles.warningFieldRow}>
                    <Ionicons name="ellipse" size={6} color="#EF4444" style={styles.mr8} />
                    <Text style={styles.warningFieldText}>{field}</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity
                onPress={() => setWarningVisible(false)}
                style={styles.warningBtn}
              >
                <Text style={styles.warningBtnText}>ตกลง</Text>
              </TouchableOpacity>
            </View>
        </View>
      </Modal>
    </Modal>
  );
});

// ---------- DetailModal (ย้ายออกมานอก RepairScreen เพื่อป้องกัน re-create) ----------
type GalleryItem =
  | { key: string; kind: 'server'; id: number; url: string }
  | { key: string; kind: 'local'; asset: Asset; url: string };

interface DetailModalProps {
  visible: boolean;
  onClose: () => void;
  selected: Repair | null;
  colors: any;
  isAdmin: boolean;
  getToken: () => Promise<string | null>;
  uploadPhotoToRepair: (repairId: number, asset: Asset) => Promise<any>;
  fetchRepairs: () => Promise<void>;
  saveEdit: (params: { title: string; detail: string; status: Repair['status'] }) => Promise<void>;
  handleDelete: (deleteReason?: string) => void;
  getStatusColor: (status: string) => string;
  getStatusText: (status: string) => string;
  formatDate: (dateString: string) => string;
  uploadBusy: boolean;
  setUploadBusy: (v: boolean) => void;
  uploadNote: string;
  setUploadNote: (v: string) => void;
  uploadProgress: number;
  setUploadProgress: (v: number) => void;
  updateSaving: boolean;
  setUpdateSaving: (v: boolean) => void;
  deleteSaving: boolean;
}

const DetailModal = React.memo(({
  visible,
  onClose,
  selected,
  colors,
  isAdmin,
  getToken,
  uploadPhotoToRepair,
  fetchRepairs,
  saveEdit,
  handleDelete,
  getStatusColor,
  getStatusText,
  formatDate,
  uploadBusy,
  setUploadBusy,
  uploadNote,
  setUploadNote,
  uploadProgress,
  setUploadProgress,
  updateSaving,
  setUpdateSaving,
  deleteSaving,
}: DetailModalProps) => {
  const [localTitle, setLocalTitle] = useState('');
  const [localDetail, setLocalDetail] = useState('');
  const [localStatus, setLocalStatus] = useState<Repair['status']>('pending');
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPickingImage, setIsPickingImage] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const successOpacity = useRef(new Animated.Value(0)).current;
  // confirm dialog state (status change)
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmData, setConfirmData] = useState<{ from: string; to: string } | null>(null);
  const confirmOpacity = useRef(new Animated.Value(0)).current;
  // delete confirm dialog state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [requiresReason, setRequiresReason] = useState(true);
  const deleteConfirmOpacity = useRef(new Animated.Value(0)).current;

  // แสดง success popup พร้อม animation fade in ตรงกลาง
  const showSuccessPopup = () => {
    successOpacity.setValue(0);
    setShowSuccess(true);
    Animated.timing(successOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
    // ปิดอัตโนมัติหลัง 1.5 วิ
    setTimeout(() => {
      Animated.timing(successOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setShowSuccess(false);
        onClose();
      });
    }, 1500);
  };

  const prevVisible = useRef(visible);

  useEffect(() => {
    // Only initialize when modal opens (visible changes from false -> true)
    if (visible && !prevVisible.current && selected) {
      setLocalTitle(selected.title ?? '');
      setLocalDetail(selected.detail ?? '');
      setLocalStatus(selected.status ?? 'pending');
      const base: GalleryItem[] = (selected.photos ?? []).map(p => ({
        key: `sv_${p.id}`, kind: 'server', id: p.id, url: normalizeUrl(p.url),
      }));
      setGallery(base);
      setPreviewUrl(null);
    }
    prevVisible.current = visible;
  }, [visible, selected]);

  if (!selected) return null;

  const MAX_PHOTOS = 5;
  const isLocked = !isAdmin && selected?.allow_user_edit === false;
  const canAddMore = gallery.length < MAX_PHOTOS && !isLocked;
  const remainingSlots = MAX_PHOTOS - gallery.length;

  const pickFromLibrary = async () => {
    if (isPickingImage || !canAddMore) return;
    setIsPickingImage(true);
    try {
      const result = await launchImageLibrary({ mediaType: 'photo', selectionLimit: remainingSlots, quality: 0.8, includeExtra: false });
      if (result.didCancel || !result.assets) return;
      const items: GalleryItem[] = (result.assets || []).filter(a => !!a.uri).slice(0, remainingSlots).map(a => ({
        key: `lc_${Date.now()}_${Math.random()}`, kind: 'local', asset: a, url: a.uri!,
      }));
      if (items.length > 0) {
        setGallery(prev => [...prev, ...items].slice(0, MAX_PHOTOS));
      }
    } catch (e) {
      console.log('pickFromLibrary error:', e);
    } finally {
      setIsPickingImage(false);
    }
  };

  const takeFromCamera = async () => {
    if (isPickingImage || !canAddMore) return;
    setIsPickingImage(true);
    try {
      const result = await launchCamera({ mediaType: 'photo', quality: 0.8, includeExtra: false, saveToPhotos: true });
      if (result.didCancel || !result.assets) return;
      const items: GalleryItem[] = (result.assets || []).filter(a => !!a.uri).slice(0, remainingSlots).map(a => ({
        key: `lc_${Date.now()}_${Math.random()}`, kind: 'local', asset: a, url: a.uri!,
      }));
      if (items.length > 0) {
        setGallery(prev => [...prev, ...items].slice(0, MAX_PHOTOS));
      }
    } catch (e) {
      console.log('takeFromCamera error:', e);
    } finally {
      setIsPickingImage(false);
    }
  };

  const removeItem = (key: string) => setGallery(prev => prev.filter(g => g.key !== key));

  // อัปโหลดทีละไฟล์ + โชว์สถานะ พร้อม progress bar
  const uploadLocalAssets = async (assets: { asset: Asset }[], repairId: number) => {
    setUploadBusy(true);
    setUploadProgress(0);
    try {
      const total = assets.length;
      for (let i = 0; i < total; i++) {
        setUploadNote(`กำลังอัปโหลดรูป ${i + 1}/${total} ...`);
        setUploadProgress(Math.round((i / total) * 100));
        await uploadPhotoToRepair(repairId, assets[i].asset);
        setUploadProgress(Math.round(((i + 1) / total) * 100));
      }
    } finally {
      setUploadBusy(false);
      setUploadNote('');
      setUploadProgress(0);
    }
  };

  // ฟังก์ชันบันทึกจริง (เรียกหลังยืนยันแล้ว)
  const performSave = async () => {
    try {
      setUpdateSaving(true);

      // 1) ลบรูปที่ถูกเอาออก
      const currentServerIds = new Set(gallery.filter(g => g.kind === 'server').map(g => (g as any).id as number));
      const existedServerIds = new Set((selected.photos ?? []).map(p => p.id));
      const toDelete = [...existedServerIds].filter(id => !currentServerIds.has(id));
      if (toDelete.length > 0) {
        const token = await getToken();
        for (const pid of toDelete) {
          const res = await fetch(`${getBaseUrl()}/repairs/${selected.id}/image/${pid}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) {
            const j = await res.json().catch(() => null);
            throw new Error(j?.error || `ลบรูปไม่สำเร็จ (#${pid})`);
          }
        }
      }

      // 2) อัปโหลดรูปใหม่ทั้งหมด
      const locals = gallery.filter(g => g.kind === 'local') as Extract<GalleryItem, { kind: 'local' }>[];
      if (locals.length > 0) {
        await uploadLocalAssets(locals, selected.id);
      }

      // 3) อัปเดตฟิลด์อื่น ๆ
      await saveEdit({ title: localTitle, detail: localDetail, status: localStatus });

      // 4) รีโหลดรายการให้ sync
      await fetchRepairs();

      // ปิดหน้ารายละเอียดและพรีวิว
      setPreviewUrl(null);
      // แสดง success popup
      showSuccessPopup();
    } catch (e: any) {
      showAlert('ผิดพลาด', e?.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setUpdateSaving(false);
      setUploadBusy(false);
      setUploadNote('');
    }
  };

  // ฟังก์ชันบันทึก (ตรวจสอบการเปลี่ยนสถานะ)
  const onSave = async () => {
    // ถ้าเป็น admin และสถานะเปลี่ยน ให้ขอยืนยันก่อน
    if (isAdmin && selected && localStatus !== selected.status) {
      setConfirmData({
        from: getStatusText(selected.status),
        to: getStatusText(localStatus),
      });
      confirmOpacity.setValue(0);
      setShowConfirm(true);
      Animated.timing(confirmOpacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
    } else {
      performSave();
    }
  };

  const closeConfirm = () => {
    Animated.timing(confirmOpacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setShowConfirm(false);
      setConfirmData(null);
    });
  };

  const handleConfirm = () => {
    closeConfirm();
    performSave();
  };

  // Delete confirm functions
  const openDeleteConfirm = () => {
    if (!selected) return;
    // ตรวจสอบว่าต้องใส่หมายเหตุหรือไม่
    // ถ้าสถานะ done และ done_at เกิน 10 วัน ไม่ต้องใส่หมายเหตุ
    let needsReason = true;
    if (selected.status === 'done' && selected.done_at) {
      const doneDate = new Date(selected.done_at);
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      if (doneDate < tenDaysAgo) {
        needsReason = false;
      }
    }
    setRequiresReason(needsReason);
    setDeleteReason('');
    deleteConfirmOpacity.setValue(0);
    setShowDeleteConfirm(true);
    Animated.timing(deleteConfirmOpacity, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
  };

  const closeDeleteConfirm = () => {
    Animated.timing(deleteConfirmOpacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setShowDeleteConfirm(false);
      setDeleteReason('');
    });
  };

  const performDelete = () => {
    // ถ้าต้องใส่หมายเหตุ แต่ไม่ได้ใส่ ไม่ให้ลบ
    if (requiresReason && !deleteReason.trim()) {
      showAlert('กรุณาใส่หมายเหตุ', 'กรุณาระบุเหตุผลในการลบ');
      return;
    }
    closeDeleteConfirm();
    handleDelete(deleteReason.trim() || undefined);
  };

  const isDisabled = updateSaving || uploadBusy || isPickingImage;

  return (
    <>
      {/* โมดัลรายละเอียด — แสดงเฉพาะเมื่อไม่มีหน้าพรีวิว */}
      <Modal
        visible={visible && !previewUrl}
        transparent
        animationType="fade"
        onRequestClose={onClose}
      >
        <View style={styles.detailOverlay}>
          <View style={[styles.detailCard, { backgroundColor: colors.cardBg }]}>
            {/* overlay ระหว่างอัปโหลด - UI เหมือน AddRepairModal */}
            {uploadBusy && (
              <View style={styles.uploadOverlayFullScreen}>
                <View style={styles.uploadProgressBox}>
                  <ActivityIndicator size="large" color="#3B82F6" />
                  <Text style={styles.uploadProgressTitle}>
                    {uploadNote || 'กำลังอัปโหลด...'}
                  </Text>
                  <View style={styles.progressBarContainer}>
                    <View style={[styles.progressBarFill, { width: `${uploadProgress}%` }]} />
                  </View>
                  <Text style={styles.uploadProgressPercent}>{uploadProgress}%</Text>
                </View>
              </View>
            )}

            <View style={styles.detailHeader}>
              <View style={styles.rowCenter}>
                <Ionicons name="construct-outline" size={20} color={colors.primary} />
                <Text style={[styles.detailTitle, { color: colors.text }]} numberOfLines={2}>
                  {localTitle || '-'}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.pad6} disabled={isDisabled}>
                <Ionicons name="close" size={22} color={colors.subtext} />
              </TouchableOpacity>
            </View>

            {isLocked && (
               <View style={styles.lockedWarningBox}>
                 <Ionicons name="lock-closed" size={18} color="#EF4444" style={styles.mr8} />
                 <Text style={styles.lockedWarningText}>แอดมินไม่อนุญาตให้แก้ไขรายการนี้</Text>
               </View>
            )}

            <Text style={[styles.detailMeta, styles.mb8, { color: colors.subtext }]}>รหัสการแจ้งซ่อม: #{selected?.id}</Text>
            {/* แสดงบ้านเลขที่ */}
            <View style={styles.detailRow}>
              <Ionicons name="home-outline" size={16} color={colors.subtext} />
              <Text style={[styles.detailMeta, { color: colors.subtext }]}>บ้านเลขที่: {selected?.house_number || '-'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="pricetag-outline" size={16} color={colors.subtext} />
              <Text style={[styles.detailMeta, { color: colors.subtext }]}>สถานะ: {getStatusText(localStatus)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="time-outline" size={16} color={colors.subtext} />
              <Text style={[styles.detailMeta, { color: colors.subtext }]}>{formatDate(selected.created_at)}</Text>
            </View>

            {gallery.length > 0 && (
              <View style={styles.previewGrid}>
                {gallery.map(item => (
                  <TouchableOpacity
                    key={item.key}
                    style={styles.previewBox}
                    activeOpacity={0.9}
                    onPress={() => setPreviewUrl(item.url)}
                  >
                    <Image source={{ uri: item.url }} style={styles.previewImage} />
                    <TouchableOpacity
                      onPress={() => removeItem(item.key)}
                      hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                      activeOpacity={0.8}
                      style={[styles.previewRemove, isLocked && styles.opacityZero]}
                      disabled={isDisabled || isLocked}
                    >
                      <Ionicons name="close" size={16} color="#fff" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.detailMediaBar}>
              <TouchableOpacity style={[styles.mediaBtn, { borderColor: colors.border }, (isDisabled || !canAddMore) && styles.opacityHalf]} onPress={pickFromLibrary} disabled={isDisabled || !canAddMore}>
                {isPickingImage ? (
                  <ActivityIndicator size="small" color={colors.text} />
                ) : (
                  <Ionicons name="images-outline" size={18} color={colors.text} />
                )}
                <Text style={[styles.mediaBtnLabel, { color: colors.text }]}>เลือกรูป</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.mediaBtn, { borderColor: colors.border }, (isDisabled || !canAddMore) && styles.opacityHalf]} onPress={takeFromCamera} disabled={isDisabled || !canAddMore}>
                {isPickingImage ? (
                  <ActivityIndicator size="small" color={colors.text} />
                ) : (
                  <Ionicons name="camera-outline" size={18} color={colors.text} />
                )}
                <Text style={[styles.mediaBtnLabel, { color: colors.text }]}>ถ่ายรูป</Text>
              </TouchableOpacity>
              <View style={styles.justifyCenter}>
                <Text style={[styles.photoCountText, { color: colors.subtext }]}>
                  {gallery.length}/{MAX_PHOTOS}
                </Text>
              </View>
            </View>

            <View style={styles.detailDivider} />

            <Text style={[styles.detailLabel, { color: colors.text }]}>หัวข้อ</Text>
            <TextInput style={[styles.textInput, { borderColor: colors.border, color: colors.text }, isLocked && styles.opacityLocked]} value={localTitle} onChangeText={setLocalTitle} editable={!isDisabled && !isLocked} />

            <Text style={[styles.detailLabel, styles.mt10, { color: colors.text }]}>รายละเอียด</Text>
            <TextInput style={[styles.textArea, { borderColor: colors.border, color: colors.text }, isLocked && styles.opacityLocked]} multiline value={localDetail} onChangeText={setLocalDetail} textAlignVertical="top" editable={!isDisabled && !isLocked} />

            {isAdmin && (
              <>
                <Text style={[styles.detailLabel, styles.mt10, { color: colors.text }]}>สถานะ</Text>
                <View style={styles.statusRow}>
                  {(['pending', 'in_progress', 'done'] as Repair['status'][]).map(s => (
                    <TouchableOpacity
                      key={s}
                      onPress={() => setLocalStatus(s)}
                      disabled={isDisabled}
                      style={[
                        styles.statusChip,
                        {
                          borderColor: localStatus === s ? getStatusColor(s) : colors.border,
                          backgroundColor: localStatus === s ? `${getStatusColor(s)}22` : undefined,
                        },
                        localStatus !== s && styles.statusChipBgWhite,
                        isDisabled && styles.opacityLocked,
                      ]}
                    >
                      <Text style={[styles.mediaBtnLabel, { color: localStatus === s ? getStatusColor(s) : colors.subtext }]}>
                        {getStatusText(s)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <View style={styles.detailBtnRow}>
              {!isLocked && (
              <TouchableOpacity style={[styles.detailOkBtn, { backgroundColor: colors.success }, isDisabled && styles.opacityDisabled]} onPress={onSave} disabled={isDisabled}>
                {isDisabled ? <ActivityIndicator color="#fff" /> : <Ionicons name="checkmark" size={18} color="#fff" />}
                <Text style={styles.detailOkText}>{isDisabled ? 'กำลังบันทึก...' : 'บันทึก'}</Text>
              </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.detailOkBtn, { backgroundColor: colors.subtext }]} onPress={onClose} disabled={isDisabled}>
                <Ionicons name="close" size={18} color="#fff" />
                <Text style={styles.detailOkText}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.detailOkBtn, { backgroundColor: colors.danger }, deleteSaving && styles.opacityDisabled]} onPress={openDeleteConfirm} disabled={deleteSaving || isDisabled}>
                {deleteSaving ? <ActivityIndicator color="#fff" /> : <Ionicons name="trash" size={18} color="#fff" />}
                <Text style={styles.detailOkText}>{deleteSaving ? 'กำลังลบ...' : 'ลบ'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* โมดัลพรีวิวเต็มจอ — แยกออกมา ไม่ซ้อน */}
      <Modal
        visible={!!previewUrl}
        transparent={false}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => setPreviewUrl(null)}
      >
        <View style={styles.fullscreenOverlay}>
          {!!previewUrl && <Image source={{ uri: previewUrl }} style={styles.fullscreenImage} resizeMode="contain" />}
          <TouchableOpacity style={styles.fullscreenClose} onPress={() => setPreviewUrl(null)} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
            <Ionicons name="close-circle" size={36} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Success Popup สวยๆ fade in ตรงกลาง */}
      <Modal visible={showSuccess} transparent animationType="none">
        <View style={styles.successOverlay}>
          <Animated.View
            style={[
              styles.successBox,
              {
                opacity: successOpacity,
              },
            ]}
          >
            <View style={styles.successIconCircle}>
              <Ionicons name="checkmark" size={48} color="#fff" />
            </View>
            <Text style={styles.successTitle}>บันทึกสำเร็จ!</Text>
            <Text style={styles.successSubtitle}>ข้อมูลได้รับการอัปเดตแล้ว</Text>
          </Animated.View>
        </View>
      </Modal>

      {/* Confirm Dialog Modal */}
      <Modal visible={showConfirm} transparent animationType="none">
        <Animated.View style={[styles.confirmOverlay, { opacity: confirmOpacity }]}>
          <View style={styles.confirmBox}>
            <View style={styles.confirmIconCircle}>
              <Ionicons name="swap-horizontal" size={32} color="#fff" />
            </View>
            <Text style={styles.confirmTitle}>ยืนยันเปลี่ยนสถานะ</Text>
            {confirmData && (
              <View style={styles.confirmStatusRow}>
                <View style={[styles.confirmStatusBadge, styles.confirmBadgeGray]}>
                  <Text style={styles.confirmStatusText}>{confirmData.from}</Text>
                </View>
                <Ionicons name="arrow-forward" size={20} color="#6B7280" style={styles.mh8} />
                <View style={[styles.confirmStatusBadge, styles.confirmBadgeBlue]}>
                  <Text style={styles.confirmStatusText}>{confirmData.to}</Text>
                </View>
              </View>
            )}
            <Text style={styles.confirmSubtitle}>ต้องการเปลี่ยนสถานะหรือไม่?</Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity style={styles.confirmBtnCancel} onPress={closeConfirm}>
                <Text style={styles.confirmBtnCancelText}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtnOk} onPress={handleConfirm}>
                <Ionicons name="checkmark" size={18} color="#fff" style={styles.mr4} />
                <Text style={styles.confirmBtnOkText}>ยืนยัน</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal visible={showDeleteConfirm} transparent animationType="none">
        <Animated.View style={[styles.confirmOverlay, { opacity: deleteConfirmOpacity }]}>
          <View style={styles.deleteConfirmBox}>
            <View style={styles.deleteIconCircle}>
              <Ionicons name="trash" size={32} color="#fff" />
            </View>
            <Text style={styles.deleteConfirmTitle}>ยืนยันการลบ</Text>
            <Text style={styles.deleteConfirmId}>รหัส #{selected?.id}</Text>
            
            {requiresReason ? (
              <>
                <Text style={styles.deleteReasonLabel}>
                  <Ionicons name="warning" size={14} color="#F59E0B" /> กรุณาระบุเหตุผลในการลบ
                </Text>
                <TextInput
                  style={styles.deleteReasonInput}
                  placeholder="หมายเหตุการลบ..."
                  placeholderTextColor="#9CA3AF"
                  value={deleteReason}
                  onChangeText={setDeleteReason}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </>
            ) : (
              <Text style={styles.deleteNoReasonText}>
                <Ionicons name="checkmark-circle" size={14} color="#10B981" /> สถานะ "เสร็จสิ้น" เกิน 10 วัน สามารถลบได้เลย
              </Text>
            )}

            <View style={styles.confirmButtons}>
              <TouchableOpacity style={styles.confirmBtnCancel} onPress={closeDeleteConfirm}>
                <Text style={styles.confirmBtnCancelText}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.deleteBtnOk, (requiresReason && !deleteReason.trim()) && styles.opacityHalf]} 
                onPress={performDelete}
                disabled={requiresReason && !deleteReason.trim()}
              >
                <Ionicons name="trash" size={18} color="#fff" style={styles.mr4} />
                <Text style={styles.confirmBtnOkText}>ลบ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </Modal>
    </>
  );
});

// ---------- HeaderBar (moved outside RepairScreen) ----------
interface HeaderBarProps {
  searchId: string;
  setSearchId: (v: string) => void;
  colors: Record<string, string>;
  isAdmin: boolean;
  setOpen: (v: boolean) => void;
}

const HeaderBar = React.memo(({ searchId, setSearchId, colors, isAdmin, setOpen }: HeaderBarProps) => {
  const [localQuery, setLocalQuery] = useState<string>('');
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);
  useEffect(() => { setLocalQuery(typeof searchId === 'string' ? searchId : ''); }, [searchId]);
  const DEBOUNCE_MS = 3000;
  const schedule = (text: string) => { if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = setTimeout(() => setSearchId(text), DEBOUNCE_MS); };
  const onChange = (text: string) => {
    setLocalQuery(text);
    const trimmed = text.trim();
    if (trimmed.length === 0) { if (timerRef.current) clearTimeout(timerRef.current); setSearchId(''); return; }
    const digitCount = (trimmed.match(/\d/g) || []).length;
    if (/^\d+$/.test(trimmed)) { if (digitCount >= 3) schedule(text); return; }
    schedule(text);
  };
  const onSubmit = () => { if (timerRef.current) clearTimeout(timerRef.current); setSearchId(localQuery.trim()); };
  const onClear = () => { if (timerRef.current) clearTimeout(timerRef.current); setLocalQuery(''); setSearchId(''); };

  return (
    <View style={[styles.listHeaderContainer, { backgroundColor: colors.bg }]}>
      {isAdmin ? (
        <View style={styles.searchWithButtonRow}>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color={colors.subtext} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="ค้นหา รหัสแจ้งซ่อม"
              placeholderTextColor={colors.subtext}
              keyboardType="decimal-pad"
              autoCapitalize="none"
              autoCorrect={false}
              importantForAutofill="no"
              textContentType="none"
              autoComplete="off"
              value={localQuery}
              onChangeText={onChange}
              onSubmitEditing={onSubmit}
              returnKeyType="done"
              blurOnSubmit={false}
            />
            {!!localQuery && (
              <TouchableOpacity onPress={onClear} style={styles.pad6}>
                <Ionicons name="close-circle" size={18} color={colors.subtext} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={[styles.fabInline, { backgroundColor: colors.warning }]} onPress={() => setOpen(true)} activeOpacity={0.9}>
            <Ionicons name="add" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={[styles.addButtonFull, { backgroundColor: colors.success }]} onPress={() => setOpen(true)} activeOpacity={0.9}>
          <Ionicons name="add" size={20} color="#FFFFFF" />
          <Text style={styles.addButtonText}>แจ้งซ่อม</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

// ---------- ListEmpty (moved outside RepairScreen) ----------
interface ListEmptyProps {
  colors: Record<string, string>;
  listLoading: boolean;
}

const ListEmpty = React.memo(({ colors, listLoading }: ListEmptyProps) => (
  <View style={styles.fullScreenEmpty}>
    <View style={[styles.emptyIcon, { backgroundColor: colors.primary + '10' }]}>
      <Ionicons name="construct-outline" size={64} color={colors.primary} />
    </View>
    <Text style={[styles.emptyTitle, { color: colors.text }]}>🔧 แจ้งซ่อม</Text>
    <Text style={[styles.emptySubtitle, { color: colors.subtext }]}>{listLoading ? 'กำลังโหลดข้อมูล...' : 'ไม่พบรายการ'}</Text>
  </View>
));

const RepairScreen: React.FC<RepairScreenProps> = ({ darkMode: _darkMode = false }) => {
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [me, setMe] = useState<Me | null>(null);

  const [listLoading, setListLoading] = useState(true);
  const [createSaving, setCreateSaving] = useState(false);
  const [updateSaving, setUpdateSaving] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);

  // อัปโหลดจำนวนมาก (overlay)
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadNote, setUploadNote] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState<number>(0); // 0-100

  // Success popup state สำหรับสร้างใหม่
  const [showCreateSuccess, setShowCreateSuccess] = useState(false);
  const createSuccessOpacity = useRef(new Animated.Value(0)).current;

  // แสดง success popup สำหรับสร้างใหม่ - fade in ตรงกลาง
  const showCreateSuccessPopup = () => {
    createSuccessOpacity.setValue(0);
    setShowCreateSuccess(true);
    Animated.timing(createSuccessOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
    // ปิดอัตโนมัติหลัง 1.5 วิ
    setTimeout(() => {
      Animated.timing(createSuccessOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setShowCreateSuccess(false);
        setOpen(false);
      });
    }, 1500);
  };

  const [open, setOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<Repair | null>(null);

  const [searchId, setSearchId] = useState<string>('');
  // const debouncedSearchId = useDebounce(searchId, 250); // Kept for future use

  const colors = useMemo(() => ({
    bg: '#FFFFFF', cardBg: '#FFFFFF', text: '#1F2937', subtext: '#6B7280',
    border: '#E5E7EB', primary: '#3B82F6', success: '#10B981', warning: '#F59E0B',
    danger: '#EF4444', pending: '#F97316', progress: '#8B5CF6', done: '#059669',
  }), []);

  const isAdmin = useMemo(() => me?.role === 'admin' || me?.role === 'superadmin', [me?.role]);
  // const canDelete = useMemo(
  //   () => isAdmin || (selected && me && selected.user_id === String(me.id)),
  //   [isAdmin, selected, me]
  // ); // Kept for future use

  const getToken = useCallback(async () => {
    return await AsyncStorage.getItem('token');
  }, []);

  const fetchMe = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) { setMe(null); return; }
      const res = await fetch(`${getBaseUrl()}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('ME_FAILED');
      const data: Me = await res.json();
      setMe(data);
    } catch { setMe(null); }
  }, [getToken]);

  const fetchRepairs = useCallback(async () => {
    try {
      setListLoading(true);
      const token = await getToken();
      if (!token) { setRepairs([]); return; }
      const res = await fetch(`${getBaseUrl()}/repairs`, {
        headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || body?.message || `HTTP ${res.status}`);
      const list = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
      setRepairs(list);
    } catch { setRepairs([]); }
    finally { setListLoading(false); }
  }, [getToken]);

  useEffect(() => { fetchMe(); fetchRepairs(); }, [fetchMe, fetchRepairs]);

  // ===== Uploads (ย่อรูป + ตั้งชื่อไฟล์) =====
  // NOTE: uploadFile is unused but kept for potential standalone use
  // const uploadFile = useCallback(async (asset: Asset): Promise<string> => { ... }, [getToken, me]);


  /** แก้ไข URI สำหรับ iOS ที่เป็น ph:// และกันกรณี content:// ที่ยังใช้ได้อยู่ */
  const normalizeAssetUri = (uri?: string | null) => {
    if (!uri) return '';
    // iOS Photo library (บางครั้ง ImageResizer คืน ph:// ทำให้ fetch ไม่ได้)
    if (uri.startsWith('ph://')) {
      // ปล่อยให้ ImageResizer จัดการ; ถ้ายังเป็น ph:// จะโยน error ชัดเจน
      return uri.replace('ph://', 'assets-library://');
    }
    // Android content:// ใช้ได้
    return uri;
  };

  const uploadPhotoToRepair = useCallback(async (repairId: number, asset: Asset) => {
    const token = await getToken();
    if (!token) throw new Error('ยังไม่ได้ล็อกอิน');

    if (!asset.uri) throw new Error('รูปไม่พร้อมอัปโหลด');
    asset.uri = normalizeAssetUri(asset.uri);

    const userTag = me?.username || me?.id || 'guest';
    const file = await prepareUploadFile(asset, userTag);

    const form = new FormData();
    form.append('file', {
      // @ts-ignore
      uri: normalizeAssetUri(file.uri),
      name: file.name,
      type: file.type,
    });

    // เพิ่มความทนทาน: timeout + retry
    const MAX_RETRY = 2;
    let attempt = 0;
    let lastErr: any = null;

    while (attempt <= MAX_RETRY) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s

        const res = await fetch(`${getBaseUrl()}/repairs/${repairId}/image?t=${Date.now()}`, {
          method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              // ไม่ set Content-Type ให้ RN ใส่ boundary อัตโนมัติ
            },
            body: form,
            signal: controller.signal,
        }).catch(e => { throw e; });

        clearTimeout(timeoutId);

        const ct = res.headers.get('content-type') || '';
        let data: any = null;
        if (ct.includes('application/json')) {
          data = await res.json();
        } else {
          const txt = await res.text();
          throw new Error(`อัปโหลดรูปตอบกลับไม่ใช่ JSON (${res.status}) ${txt.slice(0,80)}`);
        }

        if (!res.ok) {
          throw new Error(data?.error || data?.message || `อัปโหลดรูปไม่สำเร็จ (HTTP ${res.status})`);
        }

        // success
        return data as Repair;
      } catch (err: any) {
        lastErr = err;
        const isAbort = err?.name === 'AbortError';
        if (attempt === MAX_RETRY) break;
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        attempt++;
        setUploadNote(`รีลองอัปโหลดรูป (ครั้งที่ ${attempt + 1}) ...`);
        if (isAbort) continue;
      }
    }
    throw new Error(lastErr?.message || 'อัปโหลดรูปไม่สำเร็จ (เครือข่าย)');
  }, [getToken, me]);

  const submit = async ({ title, detail, assets, houseNumber }: { title: string; detail: string; assets: Asset[]; houseNumber?: string }) => {
    if (!title.trim()) {
      showAlert('กรอกหัวข้อ', 'กรอกหัวข้อแจ้งซ่อมก่อน');
      return;
    }

    // ถ้าเป็น admin ต้องระบุบ้านเลขที่
    if (isAdmin && !houseNumber?.trim()) {
      showAlert('กรอกบ้านเลขที่', 'กรุณาระบุบ้านเลขที่ที่ต้องการแจ้งซ่อม');
      return;
    }

    // ตรวจสอบบ้านเลขที่ใน database (เฉพาะ admin)
    if (isAdmin && houseNumber?.trim()) {
      try {
        const token = await getToken();
        const validateRes = await fetch(`${getBaseUrl()}/houses/validate/${houseNumber.trim()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const validateData = await validateRes.json();
        if (!validateRes.ok || !validateData?.exists) {
          showAlert('ไม่พบบ้านเลขที่', `บ้านเลขที่ "${houseNumber.trim()}" ไม่มีในระบบ`);
          return;
        }
      } catch (e: any) {
        showAlert('ข้อผิดพลาด', 'ไม่สามารถตรวจสอบบ้านเลขที่ได้');
        return;
      }
    }

    let uploadedUrls: string[] = [];
    try {
      // ปิด keyboard ก่อนเริ่มอัปโหลด
      Keyboard.dismiss();
      
      setCreateSaving(true);
      setUploadBusy(true);
      setUploadNote('');
      setUploadProgress(0);
      const token = await getToken();
      if (!token) throw new Error('ยังไม่ได้ล็อกอิน');

      // ===== อัปโหลดทีละไฟล์ (Sequential) พร้อม retry =====
      uploadedUrls = [];
      const total = assets?.length || 0;
      for (let i = 0; i < total; i++) {
        const a = assets[i];
        if (!a?.uri) continue;
        setUploadNote(`อัปโหลดรูป ${i + 1}/${total} ...`);
        setUploadProgress(Math.round((i / total) * 100));
        uploadedUrls.push(await uploadSingleWithRetry(a, token, i + 1, total));
        setUploadProgress(Math.round(((i + 1) / total) * 100));
      }

      setUploadNote('กำลังส่งคำขอสร้างรายการ...');

      // ===== ส่งคำขอสร้าง Repairs =====
      const requestBody: any = {
        title: title.trim(),
        detail,
        images: uploadedUrls,
      };
      // เพิ่ม house_number สำหรับ admin หรือ user ที่มี house_number
      if (isAdmin && houseNumber?.trim()) {
        requestBody.house_number = houseNumber.trim();
      } else if (!isAdmin && me?.house_number) {
        // สำหรับ user ทั่วไป ใช้ house_number ของตัวเอง
        requestBody.house_number = me.house_number;
      }

      const res = await fetch(`${getBaseUrl()}/repairs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify(requestBody),
      });

      // ป้องกัน response HTML
      let data: any = null;
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        data = await res.json();
      } else {
        const txt = await res.text();
        throw new Error(`เซิร์ฟเวอร์ตอบกลับไม่ใช่ JSON (${res.status}) ${txt.slice(0, 120)}`);
      }

      if (!res.ok) {
        throw new Error(data?.error || data?.message || 'ส่งคำขอไม่สำเร็จ');
      }

      await fetchRepairs();
      // แสดง success popup แทน Alert
      showCreateSuccessPopup();
    } catch (e: any) {
      console.error('Create repair failed:', e);
      // ถ้า fail ให้แจ้ง และไม่ค้างสถานะ
      showAlert('เกิดข้อผิดพลาด', e?.message || 'ส่งคำขอไม่สำเร็จ');
    } finally {
      setCreateSaving(false);
      setUploadBusy(false);
      setUploadNote('');
      setUploadProgress(0);
    }
  };

  // ===== Helper: อัปโหลดไฟล์เดี่ยวพร้อม timeout / retry =====
  const uploadSingleWithRetry = async (asset: Asset, token: string, index: number, total: number): Promise<string> => {
    const MAX_RETRY = 2;
    let attempt = 0;
    let lastErr: any = null;

    while (attempt <= MAX_RETRY) {
      try {
        asset.uri = normalizeAssetUri(asset.uri);
        const userTag = me?.username || me?.id || 'guest';
        const file = await prepareUploadFile(asset, userTag);

        const form = new FormData();
        form.append('file', {
          // @ts-ignore RN FormData
          uri: normalizeAssetUri(file.uri),
          name: file.name,
          type: file.type,
        });

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);
        const res = await fetch(`${getBaseUrl()}/upload?t=${Date.now()}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form,
          signal: controller.signal,
        }).catch(e => { throw e; });
        clearTimeout(timeout);

        const ct = res.headers.get('content-type') || '';
        let data: any = null;
        if (ct.includes('application/json')) {
          data = await res.json();
        } else {
          const txt = await res.text();
          throw new Error(`อัปโหลดรูป #${index}: ไม่ใช่ JSON (${res.status}) ${txt.slice(0,80)}`);
        }

        if (!res.ok || !data?.url) {
          throw new Error(data?.error || `อัปโหลดรูป #${index} ล้มเหลว (HTTP ${res.status})`);
        }
        return data.url as string;
      } catch (err: any) {
        lastErr = err;
        const isAbort = err?.name === 'AbortError';
        console.warn(`Upload attempt ${attempt + 1} for image #${index}/${total} failed:`, err?.message || err);
        if (attempt === MAX_RETRY) break;
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        attempt++;
        setUploadNote(`รีลองรูป ${index}/${total} (ครั้งที่ ${attempt + 1}) ...`);
        if (isAbort) continue;
      }
    }
    throw new Error(lastErr?.message || `อัปโหลดรูป #${index} ไม่สำเร็จ (เครือข่าย)`);
  };

  const saveEdit = async ({ title, detail, status }: { title: string; detail: string; status: Repair['status'] }) => {
    if (!selected) return;
    try {
      setUpdateSaving(true);
      const token = await getToken();
      if (!token) throw new Error('ยังไม่ได้ล็อกอิน');

      const body: any = {};
      if (title.trim() !== selected.title) body.title = title.trim();
      if ((detail ?? '') !== (selected.detail ?? '')) body.detail = detail ?? '';
      if (isAdmin && status !== selected.status) body.status = status;

      if (Object.keys(body).length === 0) { setDetailOpen(false); return; }

      const res = await fetch(`${getBaseUrl()}/repairs/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data: Repair = await res.json();
      if (!res.ok) throw new Error((data as any)?.error || 'อัปเดตไม่สำเร็จ');

      setRepairs(prev => prev.map(r => (r.id === data.id ? data : r)));
      setSelected(data);
      setDetailOpen(false);        // ปิดทันทีเมื่ออัปเดตผ่าน
    } catch (e: any) {
      showAlert('ผิดพลาด', e?.message || 'อัปเดตไม่สำเร็จ');
    } finally { setUpdateSaving(false); }
  };

  // handleDelete รับ delete_reason (optional)
  const handleDelete = async (deleteReason?: string) => {
    if (!selected) return;
    try {
      setDeleteSaving(true);
      const token = await getToken();
      if (!token) throw new Error('ยังไม่ได้ล็อกอิน');
      const res = await fetch(`${getBaseUrl()}/repairs/${selected.id}`, {
        method: 'DELETE',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ delete_reason: deleteReason || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'ลบไม่สำเร็จ');

      setRepairs(prev => prev.filter(r => r.id !== selected.id));
      setDetailOpen(false);
      setSelected(null);
    } catch (e: any) {
      showAlert('ผิดพลาด', e?.message || 'ลบไม่สำเร็จ');
    } finally { setDeleteSaving(false); }
  };

  const getStatusColor = useCallback((status: string) => {
    switch (status) {
      case 'pending': return colors.pending;
      case 'in_progress': return colors.progress;
      case 'done': return colors.done;
      default: return colors.subtext;
    }
  }, [colors]);

  const getStatusText = useCallback((status: string) => {
    switch (status) {
      case 'pending': return 'รอตรวจสอบ';
      case 'in_progress': return 'กำลังดำเนินการ';
      case 'done': return 'เสร็จสิ้น';
      default: return 'ไม่ทราบสถานะ';
    }
  }, []);

  const formatDate = useCallback((dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return 'ไม่ระบุวันที่'; }
  }, []);

  const getProgressSteps = useCallback((status: string) => {
    const steps = [
      { key: 'pending', icon: 'document-text-outline', label: 'รออนุมัติ' },
      { key: 'in_progress', icon: 'refresh-outline', label: 'ดำเนินการ' },
      { key: 'done', icon: 'checkmark-outline', label: 'เสร็จสิ้น' }
    ];
    const current = steps.findIndex(s => s.key === status);
    return steps.map((s, i) => ({ ...s, isActive: i <= current, isCompleted: i < current }));
  }, []);

  const renderProgressIndicator = useCallback((status: string) => {
    const steps = getProgressSteps(status);
    return (
      <View style={styles.progressContainer}>
        {steps.map((step, i) => (
          <View key={step.key} style={styles.stepContainer}>
            <View style={[
              styles.stepCircle,
              step.isActive
                ? { backgroundColor: colors.success, borderColor: colors.success }
                : styles.stepCircleInactive,
            ]}>
              <Ionicons name={step.icon as any} size={18} color={step.isActive ? '#FFFFFF' : '#9CA3AF'} />
            </View>
            <Text style={[styles.stepLabel, step.isActive ? { color: colors.success } : styles.stepLabelInactive]}>{step.label}</Text>
            {i < steps.length - 1 && <View style={[styles.stepLine, step.isCompleted ? { backgroundColor: colors.success } : styles.stepLineInactive]} />}
          </View>
        ))}
      </View>
    );
  }, [colors, getProgressSteps]);

  const onPressCard = useCallback((item: Repair) => { setSelected(item); setDetailOpen(true); }, []);

  const RepairRow = useCallback(({ item }: { item: Repair }) => (
    <TouchableOpacity activeOpacity={0.85} onPress={() => onPressCard(item)}>
      <View style={[styles.repairCard, { backgroundColor: colors.cardBg, borderBottomColor: colors.border }]}>
        <View style={styles.cardHeader}>
          <View style={styles.cardContentWrap}>
            <View style={styles.rowCenter}>
              <Ionicons name="construct-outline" size={18} color={colors.primary} />
              <Text style={[styles.repairTitle, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
            </View>
            {/* แสดงบ้านเลขที่ */}
            {item.house_number && (
              <View style={styles.rowCenterMt4}>
                <Ionicons name="home-outline" size={14} color={colors.subtext} />
                <Text style={[styles.houseNumberMeta, { color: colors.subtext }]}>
                  บ้านเลขที่: {item.house_number}
                </Text>
              </View>
            )}
            <View style={styles.progressSection}>{renderProgressIndicator(item.status)}</View>
            <View style={styles.cardFooter}>
              <View style={styles.dateContainer}>
                <Ionicons name="time-outline" size={14} color={colors.subtext} />
                <Text style={[styles.dateText, { color: colors.subtext }]} numberOfLines={1}>{formatDate(item.created_at)}</Text>
              </View>
              <Text style={[styles.idText, { color: colors.subtext }]}>#{item.id}</Text>
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  ), [colors, formatDate, onPressCard, renderProgressIndicator]);

  const SHOW_ALL_TRIGGER = "myh's,f";
  const filteredRepairs = useMemo(() => {
    if (!isAdmin) return repairs;
    const qRaw = typeof searchId === 'string' ? searchId : String(searchId ?? '');
    const q = qRaw.trim();
    if (q.length === 0 || lower(q) === lower(SHOW_ALL_TRIGGER)) return repairs;
    const idList = expandSearchIds(q);
    if (idList.length > 0) { const idSet = new Set(idList.map(String)); return repairs.filter(r => idSet.has(String(r.id))); }
    const norm = q.replace(/#/g, '');
    return repairs.filter(r => String(r.id).includes(norm));
  }, [repairs, searchId, isAdmin]);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <HeaderBar searchId={searchId} setSearchId={setSearchId} colors={colors} isAdmin={isAdmin} setOpen={setOpen} />

      <FlatList
        data={filteredRepairs}
        keyExtractor={(it) => String(it.id)}
        renderItem={({ item }) => <RepairRow item={item} />}
        ListFooterComponent={<View style={styles.listFooter} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshing={listLoading}
        onRefresh={fetchRepairs}
        removeClippedSubviews={false}
        ListEmptyComponent={<ListEmpty colors={colors} listLoading={listLoading} />}
      />

      <AddRepairModal visible={open} onClose={() => setOpen(false)} onSubmit={submit} saving={createSaving} colors={colors} uploadProgress={uploadProgress} uploadNote={uploadNote} uploadBusy={uploadBusy} isAdmin={isAdmin} myHouseNumber={me?.house_number} getToken={getToken} showSuccess={showCreateSuccess} successOpacity={createSuccessOpacity} />
      <DetailModal 
        visible={detailOpen} 
        onClose={() => setDetailOpen(false)} 
        selected={selected} 
        colors={colors} 
        isAdmin={isAdmin} 
        getToken={getToken}
        uploadPhotoToRepair={uploadPhotoToRepair}
        fetchRepairs={fetchRepairs}
        saveEdit={saveEdit}
        handleDelete={handleDelete}
        getStatusColor={getStatusColor}
        getStatusText={getStatusText}
        formatDate={formatDate}
        uploadBusy={uploadBusy}
        setUploadBusy={setUploadBusy}
        uploadNote={uploadNote}
        setUploadNote={setUploadNote}
        uploadProgress={uploadProgress}
        setUploadProgress={setUploadProgress}
        updateSaving={updateSaving}
        setUpdateSaving={setUpdateSaving}
        deleteSaving={deleteSaving}
      />
    </View>
  );
};

export default RepairScreen;

const styles = StyleSheet.create({
  container: { flex: 1 },

  listHeaderContainer: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  searchWithButtonRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  searchRow: { flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, gap: 8, backgroundColor: '#fff' },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 4 },
  fabInline: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, borderWidth: 3, borderColor: '#FFFFFF' },
  addButtonFull: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 25, gap: 8, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
  addButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

  repairCard: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  repairTitle: { fontSize: 16, fontWeight: '700', marginLeft: 6, lineHeight: 22 },
  progressSection: { marginTop: 6 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  dateContainer: { flexDirection: 'row', alignItems: 'center' },
  dateText: { fontSize: 12, marginLeft: 4 },
  idText: { fontSize: 12, fontWeight: '500' },

  fullScreenEmpty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyIcon: { width: 120, height: 120, borderRadius: 60, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 28, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 16, textAlign: 'center', marginBottom: 20 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  modalContainer: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%', flex: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, paddingBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '700' },
  closeButton: { padding: 8 },
  modalBody: { flex: 1, paddingHorizontal: 24, paddingBottom: 24 },
  inputGroup: { marginBottom: 20 },
  inputLabel: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  textInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16 },
  textArea: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, minHeight: 100 },
  modalFooter: { flexDirection: 'row', paddingHorizontal: 24, paddingBottom: 32, gap: 12 },
  cancelButton: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  cancelButtonText: { fontSize: 16, fontWeight: '600' },
  submitButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, gap: 8 },
  submitButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },

  progressContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 0 },
  stepContainer: { flex: 1, alignItems: 'center', position: 'relative' },
  stepCircle: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, justifyContent: 'center', alignItems: 'center', marginBottom: 4, backgroundColor: '#FFFFFF' },
  stepLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center', marginTop: 2 },
  stepLine: { position: 'absolute', top: 16, left: '60%', right: '-60%', height: 2, zIndex: -1 },

  detailOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  detailCard: { width: '100%', borderRadius: 16, padding: 16 },

  blocker: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17,17,17,0.45)',
    zIndex: 10,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  blockerText: { color: '#fff', marginTop: 10, fontWeight: '700' },

  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  detailTitle: { marginLeft: 8, fontSize: 18, fontWeight: '700', maxWidth: '85%' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  detailMeta: { fontSize: 13 },
  detailDivider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 12 },
  detailLabel: { fontSize: 14, fontWeight: '700', marginBottom: 6 },
  detailOkBtn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  detailOkText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  detailBtnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },

  statusRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  statusChip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },

  mediaBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1 },

  previewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6, justifyContent: 'center' },
  previewItem: { width: 84, height: 84, borderRadius: 10, overflow: 'hidden', position: 'relative', backgroundColor: '#F3F4F6' },
  previewImage: { width: '100%', height: '100%' },
  previewRemove: { position: 'absolute', right: 4, top: 4, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 12, padding: 2 },

  previewBox: { width: 90, height: 90, borderRadius: 12, overflow: 'hidden', backgroundColor: '#F3F4F6', position: 'relative', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },

  fullscreenOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  fullscreenImage: { width: '92%', height: '82%' },
  fullscreenClose: { position: 'absolute', top: 24, right: 16 },
  modalBodyContent: {
  paddingHorizontal: 24,
  paddingBottom: 24,
},

// ใหม่: แถบปุ่มเลือกรูป/ถ่ายรูป ใต้ ScrollView
mediaBar: {
  flexDirection: 'row',
  justifyContent: 'center',
  alignItems: 'center',
  gap: 10,
  paddingHorizontal: 24,
  paddingTop: 6,
  paddingBottom: 12,
},

// Upload Progress Overlay
uploadOverlay: {
  ...StyleSheet.absoluteFillObject,
  backgroundColor: 'rgba(0,0,0,0.7)',
  zIndex: 999,
  justifyContent: 'center',
  alignItems: 'center',
  borderTopLeftRadius: 24,
  borderTopRightRadius: 24,
},
// Upload Progress Overlay - Full screen version
uploadOverlayFullScreen: {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.7)',
  zIndex: 9999,
  justifyContent: 'center',
  alignItems: 'center',
},
uploadProgressBox: {
  backgroundColor: '#fff',
  borderRadius: 16,
  padding: 24,
  alignItems: 'center',
  minWidth: 260,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.3,
  shadowRadius: 8,
  elevation: 10,
},
uploadProgressTitle: {
  marginTop: 16,
  fontSize: 16,
  fontWeight: '600',
  color: '#1F2937',
  textAlign: 'center',
},
progressBarContainer: {
  width: 200,
  height: 8,
  backgroundColor: '#E5E7EB',
  borderRadius: 4,
  marginTop: 16,
  overflow: 'hidden',
},
progressBarFill: {
  height: '100%',
  backgroundColor: '#3B82F6',
  borderRadius: 4,
},
uploadProgressPercent: {
  marginTop: 8,
  fontSize: 14,
  fontWeight: '700',
  color: '#3B82F6',
},

// Suggestion box for house number autocomplete
suggestionBox: {
  backgroundColor: '#fff',
  borderWidth: 1,
  borderColor: '#E5E7EB',
  borderRadius: 8,
  marginTop: 4,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.1,
  shadowRadius: 4,
  elevation: 3,
},
suggestionItem: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  paddingVertical: 10,
  paddingHorizontal: 12,
  borderBottomWidth: 1,
  borderBottomColor: '#F3F4F6',
},
suggestionText: {
  fontSize: 15,
  fontWeight: '600',
},

// Success Popup
successOverlay: {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 1000,
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  justifyContent: 'center',
  alignItems: 'center',
},
successBox: {
  backgroundColor: '#FFFFFF',
  borderRadius: 24,
  paddingVertical: 32,
  paddingHorizontal: 40,
  alignItems: 'center',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.25,
  shadowRadius: 16,
  elevation: 10,
},
successIconCircle: {
  width: 80,
  height: 80,
  borderRadius: 40,
  backgroundColor: '#10B981',
  justifyContent: 'center',
  alignItems: 'center',
  marginBottom: 16,
  shadowColor: '#10B981',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.4,
  shadowRadius: 8,
  elevation: 6,
},
successTitle: {
  fontSize: 22,
  fontWeight: '800',
  color: '#1F2937',
  marginBottom: 4,
},
successSubtitle: {
  fontSize: 14,
  color: '#6B7280',
  fontWeight: '500',
},
// Confirm Dialog Styles
confirmOverlay: {
  flex: 1,
  backgroundColor: 'rgba(0,0,0,0.5)',
  justifyContent: 'center',
  alignItems: 'center',
},
confirmBox: {
  backgroundColor: '#fff',
  borderRadius: 20,
  paddingVertical: 28,
  paddingHorizontal: 24,
  alignItems: 'center',
  width: '85%',
  maxWidth: 340,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.15,
  shadowRadius: 16,
  elevation: 10,
},
confirmIconCircle: {
  width: 60,
  height: 60,
  borderRadius: 30,
  backgroundColor: '#3B82F6',
  justifyContent: 'center',
  alignItems: 'center',
  marginBottom: 16,
  shadowColor: '#3B82F6',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.4,
  shadowRadius: 8,
  elevation: 6,
},
confirmTitle: {
  fontSize: 20,
  fontWeight: '700',
  color: '#1F2937',
  marginBottom: 16,
},
confirmStatusRow: {
  flexDirection: 'row',
  alignItems: 'center',
  marginBottom: 16,
},
confirmStatusBadge: {
  paddingHorizontal: 14,
  paddingVertical: 6,
  borderRadius: 16,
},
confirmStatusText: {
  color: '#fff',
  fontSize: 13,
  fontWeight: '600',
},
confirmSubtitle: {
  fontSize: 14,
  color: '#6B7280',
  marginBottom: 20,
},
confirmButtons: {
  flexDirection: 'row',
  gap: 12,
},
confirmBtnCancel: {
  flex: 1,
  paddingVertical: 12,
  borderRadius: 12,
  backgroundColor: '#F3F4F6',
  alignItems: 'center',
},
confirmBtnCancelText: {
  fontSize: 15,
  fontWeight: '600',
  color: '#6B7280',
},
confirmBtnOk: {
  flex: 1,
  flexDirection: 'row',
  paddingVertical: 12,
  borderRadius: 12,
  backgroundColor: '#3B82F6',
  alignItems: 'center',
  justifyContent: 'center',
},
confirmBtnOkText: {
  fontSize: 15,
  fontWeight: '600',
  color: '#fff',
},
// Delete Confirm Modal Styles
deleteConfirmBox: {
  backgroundColor: '#fff',
  borderRadius: 20,
  paddingVertical: 28,
  paddingHorizontal: 24,
  alignItems: 'center',
  width: '85%',
  maxWidth: 340,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.15,
  shadowRadius: 16,
  elevation: 10,
},
deleteIconCircle: {
  width: 60,
  height: 60,
  borderRadius: 30,
  backgroundColor: '#EF4444',
  justifyContent: 'center',
  alignItems: 'center',
  marginBottom: 16,
  shadowColor: '#EF4444',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.4,
  shadowRadius: 8,
  elevation: 6,
},
deleteConfirmTitle: {
  fontSize: 20,
  fontWeight: '700',
  color: '#1F2937',
  marginBottom: 4,
},
deleteConfirmId: {
  fontSize: 14,
  color: '#6B7280',
  marginBottom: 16,
},
deleteReasonLabel: {
  fontSize: 13,
  color: '#F59E0B',
  fontWeight: '600',
  marginBottom: 8,
  alignSelf: 'flex-start',
},
deleteReasonInput: {
  width: '100%',
  backgroundColor: '#F9FAFB',
  borderWidth: 1,
  borderColor: '#E5E7EB',
  borderRadius: 12,
  padding: 12,
  fontSize: 14,
  color: '#1F2937',
  minHeight: 80,
  marginBottom: 16,
},
deleteNoReasonText: {
  fontSize: 13,
  color: '#10B981',
  fontWeight: '500',
  marginBottom: 16,
  textAlign: 'center',
},
deleteBtnOk: {
  flex: 1,
  flexDirection: 'row',
  paddingVertical: 12,
  borderRadius: 12,
  backgroundColor: '#EF4444',
  alignItems: 'center',
  justifyContent: 'center',
},

// --- Utility styles ---
mr8: { marginRight: 8 },
mr4: { marginRight: 4 },
mb8: { marginBottom: 8 },
mt10: { marginTop: 10 },
mh8: { marginHorizontal: 8 },
pad6: { padding: 6 },
opacityHalf: { opacity: 0.5 },
opacityDisabled: { opacity: 0.7 },
opacityLocked: { opacity: 0.6 },
opacityZero: { opacity: 0 },
rowCenter: { flexDirection: 'row' as const, alignItems: 'center' as const },
justifyCenter: { justifyContent: 'center' as const },
mediaBtnLabel: { fontWeight: '700' as const },
photoCountText: { fontSize: 12 },

// --- House validation styles ---
houseInputError: { borderColor: '#EF4444', borderWidth: 2 },
validationError: { color: '#EF4444', fontSize: 12, marginTop: 4, fontWeight: '600' as const },
validationSuccess: { color: '#10B981', fontSize: 12, marginTop: 4, fontWeight: '600' as const },
validationHint: { fontSize: 11, marginTop: 4 },
readonlyInputRow: { backgroundColor: '#F3F4F6', flexDirection: 'row' as const, alignItems: 'center' as const },
houseDisplayText: { fontSize: 15, fontWeight: '600' as const },

// --- Warning modal styles ---
warningOverlayCenter: { justifyContent: 'center' as const, alignItems: 'center' as const },
warningBox: { backgroundColor: '#fff', borderRadius: 20, padding: 24, alignItems: 'center' as const, width: '80%' as const, maxWidth: 320, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 10 },
warningIconCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FEE2E2', alignItems: 'center' as const, justifyContent: 'center' as const, marginBottom: 16 },
warningTitle: { fontSize: 20, fontWeight: '700' as const, color: '#1F2937', marginBottom: 8, textAlign: 'center' as const },
warningSubtitle: { color: '#6B7280', textAlign: 'center' as const, marginBottom: 16 },
warningFieldsBox: { width: '100%' as const, marginBottom: 24, backgroundColor: '#F9FAFB', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#F3F4F6' },
warningFieldRow: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 6 },
warningFieldText: { fontSize: 13, color: '#374151' },
warningBtn: { backgroundColor: '#EF4444', width: '100%' as const, paddingVertical: 12, borderRadius: 12, alignItems: 'center' as const },
warningBtnText: { color: '#fff', fontWeight: 'bold' as const, fontSize: 16 },

// --- Locked warning styles ---
lockedWarningBox: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#EF4444', borderRadius: 8, padding: 10, marginBottom: 12, flexDirection: 'row' as const, alignItems: 'center' as const },
lockedWarningText: { color: '#EF4444', fontSize: 13, fontWeight: '500' as const },

// --- Detail media bar ---
detailMediaBar: { flexDirection: 'row' as const, justifyContent: 'center' as const, alignItems: 'center' as const, gap: 12, marginTop: 16, marginBottom: 12 },

// --- Confirm badge colors ---
confirmBadgeGray: { backgroundColor: '#9CA3AF' },
confirmBadgeBlue: { backgroundColor: '#3B82F6' },
statusChipBgWhite: { backgroundColor: '#fff' },

// --- RepairRow styles ---
cardContentWrap: { flex: 1, marginLeft: 12 },
rowCenterMt4: { flexDirection: 'row' as const, alignItems: 'center' as const, marginTop: 4 },
houseNumberMeta: { fontSize: 13, marginLeft: 4 },

// --- Progress step inactive styles ---
stepCircleInactive: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' },
stepLabelInactive: { color: '#6B7280' },
stepLineInactive: { backgroundColor: '#E5E7EB' },

// --- FlatList styles ---
listFooter: { height: 20 },
listContent: { paddingBottom: 20, flexGrow: 1 },
});
