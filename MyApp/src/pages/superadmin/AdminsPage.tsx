import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, TextInput
} from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBaseUrl } from '../SuperAdmin';


const themeColors = {
  primary: '#4F46E5',
    bg: '#F3F4F6',
    cardBg: '#FFFFFF',
    text: '#1F2937',
    subtext: '#6B7280',
    border: '#E5E7EB',
    warning: '#F59E0B',
    danger: '#EF4444',
};

type Admin = {
  id: number;
  username: string;
  full_name?: string;
  role: string;
  created_at: string;
};

interface AdminsPageProps {
  onBack: () => void;
  darkMode?: boolean;
}

const formatDate = (dateString: string) => {
  if (!dateString) return '-';
  const d = new Date(dateString);
  return d.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const AdminsPage: React.FC<AdminsPageProps> = ({ onBack }) => {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Create Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editAdminId, setEditAdminId] = useState<number | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editFullName, setEditFullName] = useState('');
  const [originalFullName, setOriginalFullName] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [updating, setUpdating] = useState(false);

  // Confirmation Modal State
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmMessage, setConfirmMessage] = useState('');
  const [onConfirmAction, setOnConfirmAction] = useState<() => void>(() => {});
  const [confirmType, setConfirmType] = useState<'info' | 'danger' | 'success' | 'error'>('info');

  const triggerModal = (title: string, message: string, action?: () => void, type: 'info' | 'danger' | 'success' | 'error' = 'info') => {
    setConfirmTitle(title);
    setConfirmMessage(message);
    if (action) {
        setOnConfirmAction(() => action);
    } else {
        setOnConfirmAction(() => () => setShowConfirmModal(false));
    }
    setConfirmType(type);
    setShowConfirmModal(true);
  };

  // Auto-close success modal
  useEffect(() => {
    if (showConfirmModal && confirmType === 'success') {
        const timer = setTimeout(() => {
            setShowConfirmModal(false);
            if (onConfirmAction) onConfirmAction();
        }, 1500);
        return () => clearTimeout(timer);
    }
  }, [showConfirmModal, confirmType, onConfirmAction]);

  const colors = themeColors;

  const fetchAdmins = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${getBaseUrl()}/auth/admins`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        // Backend returns array directly for /auth/admins
        if (Array.isArray(data)) {
            setAdmins(data);
        } else {
            setAdmins(data.data || []);
        }
      }
    } catch (error) {
      console.log('Error fetching admins:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAdmins();
  };

  const handleCreateAdmin = async () => {
    if (!newUsername || !newPassword) {
      triggerModal('Error', 'กรุณากรอก Username และ Password', undefined, 'error');
      return;
    }
    if (newPassword.length < 6) {
      triggerModal('Error', 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', undefined, 'error');
      return;
    }

    try {
      setCreating(true);
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${getBaseUrl()}/auth/create-admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          full_name: newFullName,
          role: 'admin',
        }),
      });

      const data = await res.json();

      if (res.ok) {
        triggerModal('สำเร็จ', 'สร้าง Admin เรียบร้อย', () => {
            setShowConfirmModal(false);
            setShowCreateModal(false);
            setNewUsername('');
            setNewPassword('');
            setNewFullName('');
            fetchAdmins();
        }, 'success');
      } else {
        triggerModal('Error', data.message || 'ไม่สามารถสร้าง Admin ได้', undefined, 'error');
      }
    } catch (error) {
      triggerModal('Error', 'Network Error', undefined, 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateAdmin = async () => {
    if (!editAdminId) return;

    // Check for changes
    const isNameChanged = editFullName.trim() !== originalFullName.trim();
    const isPasswordChanged = editPassword.length > 0;

    if (!isNameChanged && !isPasswordChanged) {
        // No changes, just close
        setShowEditModal(false);
        setEditAdminId(null);
        setEditPassword('');
        return;
    }

    if (editPassword && editPassword.length < 6) {
      triggerModal('Error', 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร', undefined, 'error');
      return;
    }

    triggerModal(
      'ยืนยันการแก้ไข',
      `ต้องการแก้ไขข้อมูลของ "${editUsername}" ใช่หรือไม่?`,
      async () => {
        try {
          setUpdating(true);
          setShowConfirmModal(false); // Close confirm modal first (optional, prevents overlap)

          const token = await AsyncStorage.getItem('token');
          const body: any = {};
          if (isNameChanged) body.full_name = editFullName;
          if (isPasswordChanged) body.password = editPassword;

          const res = await fetch(`${getBaseUrl()}/auth/admins/${editAdminId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
          });
          
          const data = await res.json();

          if (res.ok) {
            // Success
            // Update local state
            setAdmins(prev => prev.map(a => a.id === editAdminId ? { ...a, ...data.admin } : a));
            // Close edit modal
            setShowEditModal(false);
            setEditAdminId(null);
            setEditPassword('');
            
            // Show Success Modal
            setTimeout(() => {
                triggerModal('สำเร็จ', 'แก้ไขข้อมูลเรียบร้อย', undefined, 'success');
            }, 500);

          } else {
             setTimeout(() => {
                triggerModal('Error', data.error || 'ไม่สามารถแก้ไขได้', undefined, 'error');
            }, 500);
          }
        } catch (error) {
             setTimeout(() => {
                triggerModal('Error', 'Network Error', undefined, 'error');
            }, 500);
        } finally {
          setUpdating(false);
        }
      },
      'info'
    );
  };

  const openEditModal = (admin: Admin) => {
    setEditAdminId(admin.id);
    setEditUsername(admin.username);
    const fullName = admin.full_name || '';
    setEditFullName(fullName);
    setOriginalFullName(fullName);
    setEditPassword('');
    setShowEditModal(true);
  };

  const handleDeleteAdmin = (admin: Admin) => {
    triggerModal(
      'ยืนยันการลบ',
      `ต้องการลบ Admin "${admin.username}" ใช่หรือไม่?`,
      async () => {
        try {
          setShowConfirmModal(false);
          const token = await AsyncStorage.getItem('token');
          const res = await fetch(`${getBaseUrl()}/auth/admins/${admin.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });

          if (res.ok) {
            // Optimistic update
            setAdmins(prev => prev.filter(a => a.id !== admin.id));
             setTimeout(() => {
                triggerModal('สำเร็จ', 'ลบ Admin เรียบร้อย', undefined, 'success');
            }, 500);
          } else {
             setTimeout(() => {
                triggerModal('Error', 'ไม่สามารถลบได้', undefined, 'error');
            }, 500);
          }
        } catch (error) {
             setTimeout(() => {
                triggerModal('Error', 'เกิดข้อผิดพลาด', undefined, 'error');
            }, 500);
        }
      },
      'danger'
    );
  };

  const renderAdmin = ({ item }: { item: Admin }) => (
    <View style={[styles.adminCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
      <View style={styles.adminInfo}>
        <View style={[
          styles.adminAvatar, 
          { backgroundColor: item.role === 'superadmin' ? colors.warning : colors.primary }
        ]}>
          <Ionicons 
            name={item.role === 'superadmin' ? 'shield' : 'person'} 
            size={24} 
            color="#fff" 
          />
        </View>
        <View style={styles.adminDetails}>
          <Text style={[styles.adminName, { color: colors.text }]}>
            {item.full_name || item.username}
          </Text>
          <Text style={[styles.adminUsername, { color: colors.subtext }]}>@{item.username}</Text>
          <View style={styles.adminMeta}>
            <View style={[
              styles.roleBadge, 
              { backgroundColor: item.role === 'superadmin' ? colors.warning : colors.primary }
            ]}>
              <Text style={styles.roleBadgeText}>
                {item.role === 'superadmin' ? 'SuperAdmin' : 'Admin'}
              </Text>
            </View>
            <Text style={[styles.adminDate, { color: colors.subtext }]}>
              {formatDate(item.created_at)}
            </Text>
          </View>
        </View>
      </View>
      {item.role !== 'superadmin' && (
        <View style={styles.actionButtons}>
             <TouchableOpacity 
              style={[styles.editAdminBtn, { backgroundColor: colors.bg }]}
              onPress={() => openEditModal(item)}
            >
              <Ionicons name="pencil" size={20} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.deleteAdminBtn, { backgroundColor: colors.danger + '20' }]}
              onPress={() => handleDeleteAdmin(item)}
            >
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>จัดการ Admin ({admins.length})</Text>
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <>
        <FlatList
          data={admins}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderAdmin}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={64} color={colors.subtext} />
              <Text style={[styles.emptyText, { color: colors.subtext }]}>ไม่มี Admin</Text>
            </View>
          }
        />
         <TouchableOpacity 
            style={[styles.fab, { backgroundColor: colors.primary }]}
            onPress={() => setShowCreateModal(true)}
          >
            <Ionicons name="add" size={28} color="#fff" />
          </TouchableOpacity>
        </>
      )}

      {/* Create Admin Modal */}
      <Modal visible={showCreateModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.cardBg }]}>
            <View style={styles.modalHeader}>
              <Ionicons name="person-add" size={28} color={colors.primary} />
              <Text style={[styles.modalTitle, { color: colors.text }]}>สร้าง Admin ใหม่</Text>
            </View>

            <Text style={[styles.inputLabel, { color: colors.text }]}>ชื่อผู้ใช้ *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }]}
              placeholder="username"
              placeholderTextColor={colors.subtext}
              value={newUsername}
              onChangeText={setNewUsername}
              autoCapitalize="none"
            />

            <Text style={[styles.inputLabel, { color: colors.text }]}>รหัสผ่าน *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }]}
              placeholder="อย่างน้อย 6 ตัวอักษร"
              placeholderTextColor={colors.subtext}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
            />

            <Text style={[styles.inputLabel, { color: colors.text }]}>ชื่อ-นามสกุล</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }]}
              placeholder="ชื่อเต็ม (ไม่บังคับ)"
              placeholderTextColor={colors.subtext}
              value={newFullName}
              onChangeText={setNewFullName}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalBtn, styles.cancelBtn, { borderColor: colors.border }]}
                onPress={() => {
                  setShowCreateModal(false);
                  setNewUsername('');
                  setNewPassword('');
                  setNewFullName('');
                }}
                disabled={creating}
              >
                <Text style={[styles.cancelBtnText, { color: colors.subtext }]}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalBtn, styles.createBtn, { backgroundColor: colors.primary }, creating && styles.opacityDisabled]}
                onPress={handleCreateAdmin}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={18} color="#fff" />
                    <Text style={styles.createBtnText}>สร้าง Admin</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Admin Modal */}
      <Modal visible={showEditModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.cardBg }]}>
            <View style={styles.modalHeader}>
              <Ionicons name="create" size={28} color={colors.primary} />
              <Text style={[styles.modalTitle, { color: colors.text }]}>แก้ไข Admin</Text>
            </View>

            <Text style={[styles.inputLabel, { color: colors.text }]}>ชื่อผู้ใช้ (แก้ไขไม่ได้)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.subtext }]}
              value={editUsername}
              editable={false}
            />

            <Text style={[styles.inputLabel, { color: colors.text }]}>ชื่อ-นามสกุล</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }]}
              placeholder="ชื่อเต็ม"
              placeholderTextColor={colors.subtext}
              value={editFullName}
              onChangeText={setEditFullName}
            />

            <Text style={[styles.inputLabel, { color: colors.text }]}>รหัสผ่านใหม่ (เว้นว่างถ้่าไม่เปลี่ยน)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }]}
              placeholder="รหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)"
              placeholderTextColor={colors.subtext}
              value={editPassword}
              onChangeText={setEditPassword}
              secureTextEntry
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalBtn, styles.cancelBtn, { borderColor: colors.border }]}
                onPress={() => {
                  setShowEditModal(false);
                  setEditAdminId(null);
                  setEditPassword('');
                }}
                disabled={updating}
              >
                <Text style={[styles.cancelBtnText, { color: colors.subtext }]}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalBtn, styles.createBtn, { backgroundColor: colors.primary }, updating && styles.opacityDisabled]}
                onPress={handleUpdateAdmin}
                disabled={updating}
              >
                {updating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="save" size={18} color="#fff" />
                    <Text style={styles.createBtnText}>บันทึก</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* Custom Confirmation Modal */}
      <Modal visible={showConfirmModal} transparent animationType="fade" onRequestClose={() => {
        if (confirmType === 'info' || confirmType === 'danger' || confirmType === 'error') {
            setShowConfirmModal(false); 
        }
      }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.confirmModalContent, { backgroundColor: colors.cardBg }]}>
            <View style={styles.confirmHeader}>
              <View style={[
                  styles.confirmIcon, 
                  confirmType === 'danger' || confirmType === 'error' 
                    ? styles.confirmIconDanger 
                    : confirmType === 'success' 
                    ? styles.confirmIconSuccess 
                    : styles.confirmIconInfo
              ]}>
                <Ionicons 
                  name={
                      confirmType === 'danger' || confirmType === 'error' ? 'alert' : 
                      confirmType === 'success' ? 'checkmark' : 'information'
                  } 
                  size={32} 
                  color={
                      confirmType === 'danger' || confirmType === 'error' ? colors.danger : 
                      confirmType === 'success' ? '#10B981' : colors.primary
                  } 
                />
              </View>
              <Text style={[styles.confirmTitle, { color: colors.text }]}>{confirmTitle}</Text>
              <Text style={[styles.confirmMessage, { color: colors.subtext }]}>{confirmMessage}</Text>
            </View>

            {/* Buttons (Hidden for success) */}
            {confirmType !== 'success' && (
                <View style={styles.confirmButtons}>
                {(confirmType === 'info' || confirmType === 'danger') && (
                    <TouchableOpacity
                        style={[styles.modalBtn, styles.cancelBtn, { borderColor: colors.border }]}
                        onPress={() => setShowConfirmModal(false)}
                    >
                        <Text style={[styles.cancelBtnText, { color: colors.subtext }]}>ยกเลิก</Text>
                    </TouchableOpacity>
                )}
                
                <TouchableOpacity
                    style={[
                    styles.modalBtn, 
                    styles.createBtn, 
                    confirmType === 'danger' || confirmType === 'error' 
                      ? styles.btnDanger 
                      : styles.btnPrimary
                    ]}
                    onPress={() => {
                    if (onConfirmAction) onConfirmAction();
                    if (confirmType === 'error') {
                        setShowConfirmModal(false);
                    }
                    }}
                >
                    <Text style={styles.createBtnText}>
                        {confirmType === 'info' || confirmType === 'danger' ? 'ยืนยัน' : 'ตกลง'}
                    </Text>
                </TouchableOpacity>
                </View>
            )}
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
    paddingBottom: 100,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 12,
  }, 
  adminCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  adminInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  adminAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  adminDetails: {
    flex: 1,
  },
  adminName: {
    fontSize: 16,
    fontWeight: '600',
  },
  adminUsername: {
    fontSize: 13,
    marginBottom: 4,
  },
  adminMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  adminDate: {
    fontSize: 11,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  editAdminBtn: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent', // Placeholder
  },
  deleteAdminBtn: {
    padding: 10,
    borderRadius: 10,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
  },
  roleBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
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
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  cancelBtn: {
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  createBtn: {},
  createBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  // Confirm Modal
  confirmModalContent: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  confirmHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  confirmIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  confirmMessage: {
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  opacityDisabled: {
    opacity: 0.7,
  },
  confirmIconDanger: {
    backgroundColor: '#FEE2E2',
  },
  confirmIconSuccess: {
    backgroundColor: '#D1FAE5',
  },
  confirmIconInfo: {
    backgroundColor: '#E0E7FF',
  },
  btnDanger: {
    backgroundColor: '#EF4444',
  },
  btnPrimary: {
    backgroundColor: '#6366F1',
  },
});

export default AdminsPage;
