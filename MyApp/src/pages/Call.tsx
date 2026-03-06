import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Linking, Platform, ActivityIndicator,
  Modal, TextInput, KeyboardAvoidingView, TouchableWithoutFeedback, Keyboard, RefreshControl,
} from 'react-native';
import { showAlert } from '../components/GlobalAlert';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE_HOST, BASE_PORT } from './config.ts';
const ANDROID_HOST = BASE_HOST;
type Contact = { id: number; title: string; number: string };
type Role = 'admin' | 'user' | 'superadmin';

export function getBaseUrl() {
  const host = Platform.OS === 'android' ? ANDROID_HOST : BASE_HOST;
  return `http://${host}:${BASE_PORT}`;
}


/** -------- Reusable Modal for Add/Edit -------- */
const ContactFormModal: React.FC<{
  visible: boolean;
  darkMode: boolean;
  colors: any;
  mode: 'add' | 'edit';
  initial?: Contact | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: { title: string; number: string }) => void;
}> = ({ visible, darkMode, colors, mode, initial, saving, onClose, onSubmit }) => {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [number, setNumber] = useState(initial?.number ?? '');

  useEffect(() => {
    setTitle(initial?.title ?? '');
    setNumber(initial?.number ?? '');
  }, [initial, visible]);

  const submit = () => {
    if (!title.trim() || !number.trim()) {
      showAlert('กรอกไม่ครบ', 'กรุณากรอกชื่อและหมายเลขให้ครบ');
      return;
    }
    if (!/^\d{3,20}$/.test(number.trim())) {
      showAlert('หมายเลขไม่ถูกต้อง', 'กรุณากรอกเฉพาะตัวเลข 3–20 หลัก');
      return;
    }
    onSubmit({ title: title.trim(), number: number.trim() });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => !saving && onClose()}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalCenter}>
            <View style={[styles.modalCard, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {mode === 'add' ? 'เพิ่มรายการ' : 'แก้ไขรายการ'}
              </Text>

              <Text style={[styles.modalLabel, styles.modalLabelNumber, { color: colors.subtext }]}>ชื่อ</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="เช่น หน่วยกู้ภัย"
                placeholderTextColor={darkMode ? '#888' : '#9AA3AB'}
                style={[styles.input, { color: colors.text, borderColor: colors.line }]}
                maxLength={60}
                returnKeyType="next"
              />

              <Text style={[styles.modalLabel, styles.modalLabelNumber, { color: colors.subtext }]}>หมายเลข</Text>
              <TextInput
                value={number}
                onChangeText={setNumber}
                placeholder="เช่น 1669"
                placeholderTextColor={darkMode ? '#888' : '#9AA3AB'}
                style={[styles.input, { color: colors.text, borderColor: colors.line }]}
                keyboardType="number-pad"
                maxLength={20}
                returnKeyType="done"
              />

              <View style={styles.modalActions}>
                <TouchableOpacity style={[styles.modalBtn, styles.modalCancel]} onPress={onClose} disabled={saving}>
                  <Text style={styles.modalCancelText}>ยกเลิก</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.modalBtn, styles.modalSave]} onPress={submit} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalSaveText}>บันทึก</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

// ---------- Extracted stable components ----------
const CallItemSeparator = () => <View style={styles.separator} />;

const CallListHeader: React.FC<{ themeColors: any }> = ({ themeColors }) => (
  <View style={[styles.header, { backgroundColor: themeColors.bg }]}>
    <Text style={[styles.headerTitle, { color: themeColors.text }]}>📞 เบอร์โทรฉุกเฉิน</Text>
    <Text style={[styles.headerSubtitle, { color: themeColors.subtext }]}>รายการติดต่อสำคัญ</Text>
  </View>
);

const CallListFooter: React.FC<{ role: Role; onAdd: () => void }> = ({ role, onAdd }) =>
  (role !== 'admin' && role !== 'superadmin') ? null : (
    <View style={styles.footerContainer}>
      <TouchableOpacity style={styles.addButton} onPress={onAdd} activeOpacity={0.85}>
        <Ionicons name="add" size={22} color="#FFFFFF" />
        <Text style={styles.addButtonText}>เพิ่มรายการ</Text>
      </TouchableOpacity>
    </View>
  );

const EmergencyContacts: React.FC<{ darkMode: boolean }> = ({ darkMode }) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [roleLoading, setRoleLoading] = useState(true);
  const [role, setRole] = useState<Role>('user');

  // Add/Edit modal states
  const [addVisible, setAddVisible] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editItem, setEditItem] = useState<Contact | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const BASE_URL = getBaseUrl();

  // ---------- ดึง role จาก /auth/me ----------
  const fetchRole = useCallback(async () => {
    try {
      setRoleLoading(true);
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        setRole('user');
        return;
      }
      const res = await fetch(`${BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('โหลดสิทธิ์ไม่สำเร็จ');
      const me = await res.json(); // { id, username, full_name, role, created_at }
      setRole((me?.role ?? 'user') as Role);
    } catch (e: any) {
      console.warn('fetchRole error:', e?.message);
      setRole('user');
    } finally {
      setRoleLoading(false);
    }
  }, [BASE_URL]);

  // ---------- ดึงรายชื่อ ----------
  const fetchContacts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${BASE_URL}/contacts`);
      const json = await res.json();
      setContacts((json?.data ?? []) as Contact[]);
    } catch (e: any) {
      showAlert('เกิดข้อผิดพลาด', e?.message ?? 'โหลดข้อมูลล้มเหลว');
    } finally {
      setLoading(false);
    }
  }, [BASE_URL]);

  useEffect(() => {
    fetchRole();
    fetchContacts();
  }, [fetchRole, fetchContacts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchContacts();
    setRefreshing(false);
  }, [fetchContacts]);

  const handleCall = (num: string) => Linking.openURL(`tel:${num}`);

  // ---------- Add ----------
  const openAdd = () => {
    if (role !== 'admin' && role !== 'superadmin') return;
    setAddVisible(true);
  };
  const closeAdd = () => {
    if (addSaving) return;
    setAddVisible(false);
  };
  const handleAddSave = async ({ title, number }: { title: string; number: string }) => {
    try {
      setAddSaving(true);
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${BASE_URL}/contacts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ title, number }),
      });
      if (!res.ok) throw new Error('เพิ่มไม่สำเร็จ');
      await fetchContacts();
      closeAdd();
    } catch (e: any) {
      showAlert('เกิดข้อผิดพลาด', e?.message ?? 'เพิ่มข้อมูลล้มเหลว');
    } finally {
      setAddSaving(false);
    }
  };

  // ---------- Edit ----------
  const openEdit = (item: Contact) => {
    if (role !== 'admin' && role !== 'superadmin') return;
    setEditItem(item);
    setEditVisible(true);
  };
  const closeEdit = () => {
    if (editSaving) return;
    setEditVisible(false);
    setEditItem(null);
  };
  const handleEditSave = async ({ title, number }: { title: string; number: string }) => {
    try {
      if (!editItem) return;
      setEditSaving(true);
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${BASE_URL}/contacts/${editItem.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ title, number }),
      });
      if (!res.ok) throw new Error('แก้ไขไม่สำเร็จ');
      await fetchContacts();
      closeEdit();
    } catch (e: any) {
      showAlert('เกิดข้อผิดพลาด', e?.message ?? 'แก้ไขข้อมูลล้มเหลว');
    } finally {
      setEditSaving(false);
    }
  };

  // ---------- Delete ----------
  const handleDelete = (item: Contact) => {
    if (role !== 'admin' && role !== 'superadmin') return;
    showAlert('ลบรายการ', `ลบ "${item.title} (${item.number})" ?`, [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ลบ',
        style: 'destructive',
        onPress: async () => {
          try {
            const token = await AsyncStorage.getItem('token');
            const res = await fetch(`${BASE_URL}/contacts/${item.id}`, {
              method: 'DELETE',
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (!res.ok) throw new Error('ลบไม่สำเร็จ');
            await fetchContacts();
          } catch (e: any) {
            showAlert('เกิดข้อผิดพลาด', e?.message ?? 'ลบข้อมูลล้มเหลว');
          }
        },
      },
    ]);
  };

  // สี (dark/light)
  const colors = {
    bg: darkMode ? '#121212' : COLORS.bg,
    text: darkMode ? '#FFFFFF' : COLORS.text,
    subtext: darkMode ? '#CCCCCC' : COLORS.subtext,
    line: darkMode ? '#333333' : COLORS.line,
    green: COLORS.green,
    greenSoft: darkMode ? '#1B4F35' : COLORS.greenSoft,
    orange: COLORS.orange,
    red: COLORS.red,
    number: darkMode ? '#FFFFFF' : COLORS.number,
    cardBg: darkMode ? '#1E1E1E' : '#FFFFFF',
  };

  const renderItem = ({ item }: { item: Contact }) => (
    <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
      <View style={styles.contactInfo}>
        <Text numberOfLines={1} style={[styles.titleText, { color: colors.text }]}>
          {item.title}
        </Text>
        <View style={[styles.numberPill, { backgroundColor: colors.greenSoft }]}>
          <Text style={[styles.numberPillText, { color: colors.number }]}>{item.number}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        {/* โทร (ทุกคน) */}
        <TouchableOpacity
          onPress={() => handleCall(item.number)}
          style={[styles.actionBtn, { backgroundColor: colors.green }]}
        >
          <Ionicons name="call" size={18} color="#FFFFFF" />
        </TouchableOpacity>

        {/* เฉพาะแอดมิน */}
        {(role === 'admin' || role === 'superadmin') && (
          <>
            <TouchableOpacity
              onPress={() => openEdit(item)}
              style={[styles.actionBtn, { backgroundColor: colors.orange }]}
            >
              <Ionicons name="create-outline" size={18} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleDelete(item)}
              style={[styles.actionBtn, { backgroundColor: colors.red }]}
            >
              <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );

  if (roleLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={COLORS.green} />
        <Text style={[styles.loadingText, darkMode ? styles.loadingTextDark : styles.loadingTextLight]}>กำลังตรวจสอบสิทธิ์…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Modals */}
      <ContactFormModal
        visible={addVisible}
        darkMode={darkMode}
        colors={colors}
        mode="add"
        initial={null}
        saving={addSaving}
        onClose={closeAdd}
        onSubmit={handleAddSave}
      />
      <ContactFormModal
        visible={editVisible}
        darkMode={darkMode}
        colors={colors}
        mode="edit"
        initial={editItem}
        saving={editSaving}
        onClose={closeEdit}
        onSubmit={handleEditSave}
      />

      {/* List */}
      <FlatList
        data={contacts}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[COLORS.green]}
            tintColor={COLORS.green}
          />
        }
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={CallItemSeparator}
        ListHeaderComponent={<CallListHeader themeColors={colors} />}
        ListEmptyComponent={!loading ? <EmptyState colors={colors} /> : null}
        ListFooterComponent={<CallListFooter role={role} onAdd={openAdd} />}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const EmptyState: React.FC<{ colors: any }> = ({ colors }) => (
  <View style={styles.emptyContainer}>
    <Ionicons name="call-outline" size={64} color={colors.subtext} />
    <Text style={[styles.emptyText, { color: colors.subtext }]}>ยังไม่มีรายการติดต่อ</Text>
    <Text style={[styles.emptySubtext, { color: colors.subtext }]}>
      กดปุ่ม "เพิ่มรายการ" เพื่อเริ่มต้น
    </Text>
  </View>
);

export default EmergencyContacts;

/* ---------- STYLES ---------- */
const COLORS = {
  bg: '#FFFFFF',
  text: '#2F2F2F',
  subtext: '#7A7A7A',
  line: '#EEF2F5',
  green: '#47B263',
  greenSoft: '#E9F7EE',
  orange: '#FFA21A',
  red: '#EF5350',
  number: '#272727FF',
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 8 },
  loadingTextDark: { color: '#fff' },
  loadingTextLight: { color: '#333' },

  // Header
  header: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20 },
  headerTitle: { fontSize: 22, fontWeight: '800', marginBottom: 6 },
  headerSubtitle: { fontSize: 13, fontWeight: '500' },

  // List
  listContent: { paddingHorizontal: 12, paddingVertical: 10, flexGrow: 1 },
  separator: { height: 12 },

  // Card
  card: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    minHeight: 70,
  },
  contactInfo: { flex: 1, marginRight: 15 },
  titleText: { fontSize: 16, fontWeight: '700', marginBottom: 8, lineHeight: 22 },
  numberPill: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 999,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    backgroundColor: COLORS.greenSoft,
  },
  numberPillText: { fontWeight: '700', fontSize: 18, letterSpacing: 0.3, color: COLORS.number },

  // Right actions
  actions: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 2 },
  actionBtn: {
    marginRight: 8,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },

  // Footer
  footerContainer: { paddingTop: 20, paddingBottom: 20 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.green,
    marginHorizontal: 8,
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

  // ===== Modal =====
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
    height: 42,
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
  modalLabelNumber: { marginTop: 10 },
});
