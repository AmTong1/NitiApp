import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Linking, Platform, ActivityIndicator,
  Modal, TextInput, KeyboardAvoidingView, TouchableWithoutFeedback, Keyboard, RefreshControl,
} from 'react-native';
import { widthPercentageToDP as wp, heightPercentageToDP as hp } from 'react-native-responsive-screen';
import { showAlert } from '../components/GlobalAlert';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE_HOST } from './config.ts';
import { useI18n } from '../i18n';
type Contact = { id: number; title: string; number: string };
type Role = 'admin' | 'user' | 'superadmin';

export function getBaseUrl() {
  return BASE_HOST;
}

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
  const { t } = useI18n();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [number, setNumber] = useState(initial?.number ?? '');

  useEffect(() => {
    setTitle(initial?.title ?? '');
    setNumber(initial?.number ?? '');
  }, [initial, visible]);

  const submit = () => {
    if (!title.trim() || !number.trim()) {
      showAlert(t('callIncomplete'), t('callFillAll'));
      return;
    }
    if (!/^\d{3,20}$/.test(number.trim())) {
      showAlert(t('callInvalidNumber'), t('callNumberDigits'));
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
                {mode === 'add' ? t('callAddItem') : t('callEditItem')}
              </Text>

              <Text style={[styles.modalLabel, styles.modalLabelNumber, { color: colors.subtext }]}>{t('callName')}</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder={t('callNamePlaceholder')}
                placeholderTextColor={darkMode ? '#888' : '#9AA3AB'}
                style={[styles.input, { color: colors.text, borderColor: colors.line }]}
                maxLength={60}
                returnKeyType="next"
              />

              <Text style={[styles.modalLabel, styles.modalLabelNumber, { color: colors.subtext }]}>{t('callNumber')}</Text>
              <TextInput
                value={number}
                onChangeText={setNumber}
                placeholder={t('callNumberPlaceholder')}
                placeholderTextColor={darkMode ? '#888' : '#9AA3AB'}
                style={[styles.input, { color: colors.text, borderColor: colors.line }]}
                keyboardType="number-pad"
                maxLength={20}
                returnKeyType="done"
              />

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
  );
};

const CallItemSeparator = () => <View style={styles.separator} />;

const CallListHeader: React.FC<{ themeColors: any }> = ({ themeColors }) => {
  const { t } = useI18n();
  return (
    <View style={[styles.header, { backgroundColor: themeColors.bg }]}>
      <Text style={[styles.headerTitle, { color: themeColors.text }]}>{t('callTitle')}</Text>
      <Text style={[styles.headerSubtitle, { color: themeColors.subtext }]}>{t('callImportantContacts')}</Text>
    </View>
  );
};

const CallListFooter: React.FC<{ role: Role; onAdd: () => void }> = ({ role, onAdd }) => {
  const { t } = useI18n();
  return (role !== 'admin' && role !== 'superadmin') ? null : (
    <View style={styles.footerContainer}>
      <TouchableOpacity style={styles.addButton} onPress={onAdd} activeOpacity={0.85}>
        <Ionicons name="add" size={22} color="#FFFFFF" />
        <Text style={styles.addButtonText}>{t('callAddItem')}</Text>
      </TouchableOpacity>
    </View>
  );
};

const EmergencyContacts: React.FC<{ darkMode: boolean }> = ({ darkMode }) => {
  const { t } = useI18n();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [roleLoading, setRoleLoading] = useState(true);
  const [role, setRole] = useState<Role>('user');

  const [addVisible, setAddVisible] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editItem, setEditItem] = useState<Contact | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const BASE_URL = getBaseUrl();

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

  const fetchContacts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${BASE_URL}/contacts`);
      const json = await res.json();
      setContacts((json?.data ?? []) as Contact[]);
    } catch (e: any) {
      showAlert(t('error'), e?.message ?? t('annLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [BASE_URL, t]);

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
      if (!res.ok) throw new Error(t('addFailed'));
      await fetchContacts();
      closeAdd();
    } catch (e: any) {
      showAlert(t('error'), e?.message ?? t('addDataFailed'));
    } finally {
      setAddSaving(false);
    }
  };

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
      if (!res.ok) throw new Error(t('editFailed'));
      await fetchContacts();
      closeEdit();
    } catch (e: any) {
      showAlert(t('error'), e?.message ?? t('editDataFailed'));
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = (item: Contact) => {
    if (role !== 'admin' && role !== 'superadmin') return;
    showAlert(t('callDeleteItem'), `${t('delete')} "${item.title} (${item.number})" ?`, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            const token = await AsyncStorage.getItem('token');
            const res = await fetch(`${BASE_URL}/contacts/${item.id}`, {
              method: 'DELETE',
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (!res.ok) throw new Error(t('deleteFailed'));
            await fetchContacts();
          } catch (e: any) {
            showAlert(t('error'), e?.message ?? t('deleteDataFailed'));
          }
        },
      },
    ]);
  };

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
        {}
        <TouchableOpacity
          onPress={() => handleCall(item.number)}
          style={[styles.actionBtn, { backgroundColor: colors.green }]}
        >
          <Ionicons name="call" size={18} color="#FFFFFF" />
        </TouchableOpacity>

        {}
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
        <Text style={[styles.loadingText, darkMode ? styles.loadingTextDark : styles.loadingTextLight]}>{t('callCheckingAuth')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {}
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

      {}
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

const EmptyState: React.FC<{ colors: any }> = ({ colors }) => {
  const { t } = useI18n();
  return (
    <View style={styles.emptyContainer}>
      <Ionicons name="call-outline" size={64} color={colors.subtext} />
      <Text style={[styles.emptyText, { color: colors.subtext }]}>{t('callNoContacts')}</Text>
      <Text style={[styles.emptySubtext, { color: colors.subtext }]}>
        {t('callPressAdd')}
      </Text>
    </View>
  );
};

export default EmergencyContacts;

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
  loadingText: { marginTop: hp('1%') },
  loadingTextDark: { color: '#fff' },
  loadingTextLight: { color: '#333' },

  header: { alignItems: 'center', paddingVertical: hp('3.5%'), paddingHorizontal: wp('5%') },
  headerTitle: { fontSize: wp('5.5%'), fontWeight: '800', marginBottom: hp('0.8%') },
  headerSubtitle: { fontSize: wp('3.2%'), fontWeight: '500' },

  listContent: { paddingHorizontal: wp('3%'), paddingVertical: hp('1.3%'), flexGrow: 1 },
  separator: { height: hp('1.5%') },

  card: {
    borderRadius: wp('4%'),
    paddingHorizontal: wp('4%'),
    paddingVertical: hp('1.7%'),
    marginBottom: hp('1.5%'),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    minHeight: hp('9%'),
  },
  contactInfo: { flex: 1, marginRight: wp('4%') },
  titleText: { fontSize: wp('4%'), fontWeight: '700', marginBottom: hp('1%'), lineHeight: wp('5.5%') },
  numberPill: {
    height: hp('3.5%'),
    paddingHorizontal: wp('3%'),
    borderRadius: 999,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    backgroundColor: COLORS.greenSoft,
  },
  numberPillText: { fontWeight: '700', fontSize: wp('4.5%'), letterSpacing: 0.3, color: COLORS.number },

  actions: { flexDirection: 'row', alignItems: 'flex-start', marginTop: hp('0.3%') },
  actionBtn: {
    marginRight: wp('2%'),
    width: wp('9.5%'),
    height: wp('9.5%'),
    borderRadius: wp('4.75%'),
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },

  footerContainer: { paddingTop: hp('2.5%'), paddingBottom: hp('2.5%') },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.green,
    marginHorizontal: wp('2%'),
    paddingVertical: hp('2%'),
    borderRadius: wp('6.5%'),
    shadowColor: COLORS.green,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 7,
  },
  addButtonText: { color: '#FFFFFF', fontSize: wp('4%'), fontWeight: '800', marginLeft: wp('2%') },

  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: hp('7.5%') },
  emptyText: { fontSize: wp('4%'), fontWeight: '800', marginTop: hp('2.3%'), marginBottom: hp('0.8%') },
  emptySubtext: { fontSize: wp('3.2%'), textAlign: 'center' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: wp('5%'),
  },
  modalCenter: { width: '100%' },
  modalCard: {
    borderRadius: wp('4%'),
    padding: wp('4%'),
    borderWidth: 1,
    width: '100%',
    maxWidth: 420,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  modalTitle: { fontSize: wp('4.5%'), fontWeight: '800', marginBottom: hp('1.5%') },
  modalLabel: { fontSize: wp('3%'), fontWeight: '600', marginBottom: hp('0.8%') },
  input: {
    borderWidth: 1,
    borderRadius: wp('3%'),
    paddingHorizontal: wp('3%'),
    paddingVertical: Platform.OS === 'ios' ? hp('1.5%') : hp('1.3%'),
    fontSize: wp('3.5%'),
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: hp('2%') },
  modalBtn: {
    minWidth: wp('24%'),
    height: hp('5.3%'),
    borderRadius: wp('2.5%'),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: wp('3%'),
    marginLeft: wp('2%'),
  },
  modalCancel: { backgroundColor: '#E9ECEF' },
  modalCancelText: { color: '#333', fontWeight: '700' },
  modalSave: { backgroundColor: COLORS.green },
  modalSaveText: { color: '#fff', fontWeight: '800' },
  modalLabelNumber: { marginTop: hp('1.3%') },
});
