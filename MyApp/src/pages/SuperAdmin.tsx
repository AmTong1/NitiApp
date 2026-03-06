import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Platform, ActivityIndicator, StatusBar, ScrollView
} from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE_HOST, BASE_PORT } from './config';
import colors from '../constants/colors';

// Import Pages
import ApprovalsPage from './superadmin/ApprovalsPage';
import LogsPage from './superadmin/LogsPage';
import AdminsPage from './superadmin/AdminsPage';
import SettingsPage from './superadmin/SettingsPage';
import PaymentLogsPage from './superadmin/PaymentLogsPage';
import RepairLogsPage from './superadmin/RepairLogsPage';
import ResidentLogsPage from './superadmin/ResidentLogsPage';
import AnnouncementLogsPage from './superadmin/AnnouncementLogsPage';

const ANDROID_HOST = BASE_HOST;

export function getBaseUrl() {
  const host = Platform.OS === 'android' ? ANDROID_HOST : BASE_HOST;
  return `http://${host}:${BASE_PORT}`;
}

type Me = {
  id: number;
  username: string;
  full_name?: string;
  role: 'admin' | 'user' | 'superadmin';
};

interface SuperAdminScreenProps { 
  darkMode?: boolean;
  onMenuPress?: () => void;
}

const SuperAdminScreen: React.FC<SuperAdminScreenProps> = ({ darkMode = false, onMenuPress }) => {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<'dashboard' | 'approvals' | 'logs' | 'admins' | 'settings' | 'paymentLogs' | 'repairLogs' | 'residentLogs' | 'announcementLogs'>('dashboard');
  const [waitingCount, setWaitingCount] = useState(0);

  const fetchMe = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${getBaseUrl()}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const { user } = await res.json();
        setMe(user);
      }
    } catch (err) {
      console.log('Error fetching me:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchWaitingCount = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${getBaseUrl()}/payment-installments/waiting-approval`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setWaitingCount(data.data?.length || 0);
      }
    } catch (error) {
      console.log('Error fetching waiting count:', error);
    }
  };

  useEffect(() => {
    fetchMe();
    fetchWaitingCount();
    
    // Auto refresh waiting count every 30s
    const interval = setInterval(fetchWaitingCount, 30000);
    return () => clearInterval(interval);
  }, []);

  // Back to Dashboard
  const onBack = () => {
    setCurrentView('dashboard');
    fetchWaitingCount(); // Refresh count when returning
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Access Denied
  if (me && me.role !== 'superadmin') {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: colors.bg }]}>
        <Ionicons name="lock-closed" size={64} color={colors.danger} />
        <Text style={[styles.noAccessText, { color: colors.text }]}>
          คุณไม่มีสิทธิ์เข้าถึงหน้านี้
        </Text>
        <Text style={[styles.noAccessSubtext, { color: colors.subtext }]}>
          เฉพาะ SuperAdmin เท่านั้น
        </Text>
      </View>
    );
  }

  // Navigation Logic
  if (currentView === 'approvals') return <ApprovalsPage onBack={onBack} darkMode={darkMode} />;
  if (currentView === 'logs') return <LogsPage onBack={onBack} darkMode={darkMode} />;
  if (currentView === 'admins') return <AdminsPage onBack={onBack} darkMode={darkMode} />;
  if (currentView === 'settings') return <SettingsPage onBack={onBack} darkMode={darkMode} />;
  if (currentView === 'paymentLogs') return <PaymentLogsPage onBack={onBack} darkMode={darkMode} />;
  if (currentView === 'repairLogs') return <RepairLogsPage onBack={onBack} darkMode={darkMode} />;
  if (currentView === 'residentLogs') return <ResidentLogsPage onBack={onBack} darkMode={darkMode} />;
  if (currentView === 'announcementLogs') return <AnnouncementLogsPage onBack={onBack} darkMode={darkMode} />;

  // Dashboard View
  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={darkMode ? 'light-content' : 'dark-content'} />
      
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
         <View style={styles.headerRow}>
            <TouchableOpacity onPress={onMenuPress}>
              <Ionicons name="menu" size={28} color={colors.text} />
            </TouchableOpacity>
            <View>
              <Text style={[styles.appName, { color: colors.primary }]}>NitiSmart</Text>
              <Text style={[styles.headerTitle, { color: colors.text }]}>Super Admin Panel</Text>
            </View>
         </View>
         <View style={styles.profileBox}>
            <View style={[styles.avatar, { backgroundColor: colors.warning }]}>
                <Ionicons name="shield" size={20} color="#fff" />
            </View>
         </View>
      </View>

      <ScrollView contentContainerStyle={styles.menuGrid}>
        <Text style={[styles.sectionTitle, { color: colors.subtext }]}>จัดการระบบ</Text>
        <View style={styles.cardGrid}>
            {/* Approvals */}
            <TouchableOpacity 
                style={[styles.menuCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
                onPress={() => setCurrentView('approvals')}
            >
                <View style={[styles.iconBox, styles.iconBoxApprovals]}>
                    <Ionicons name="shield-checkmark" size={32} color="#4F46E5" />
                    {waitingCount > 0 && (
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>{waitingCount}</Text>
                        </View>
                    )}
                </View>
                <Text style={[styles.menuTitle, { color: colors.text }]}>การอนุมัติ</Text>
                <Text style={[styles.menuDesc, { color: colors.subtext }]}>ตรวจสอบคำขอแก้ไข</Text>
            </TouchableOpacity>

             {/* Admins */}
             <TouchableOpacity 
                style={[styles.menuCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
                onPress={() => setCurrentView('admins')}
            >
                <View style={[styles.iconBox, styles.iconBoxAdmins]}>
                    <Ionicons name="people" size={32} color="#0EA5E9" />
                </View>
                <Text style={[styles.menuTitle, { color: colors.text }]}>จัดการ Admin</Text>
                <Text style={[styles.menuDesc, { color: colors.subtext }]}>เพิ่มลบผู้ดูแลระบบ</Text>
            </TouchableOpacity>

             {/* Settings */}
             <TouchableOpacity 
                style={[styles.menuCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
                onPress={() => setCurrentView('settings')}
            >
                <View style={[styles.iconBox, styles.iconBoxSettings]}>
                    <Ionicons name="settings" size={32} color="#6B7280" />
                </View>
                <Text style={[styles.menuTitle, { color: colors.text }]}>ตั้งค่าระบบ</Text>
                <Text style={[styles.menuDesc, { color: colors.subtext }]}>PromptPay, Rates</Text>
            </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.subtext }]}>ประวัติ / Logs</Text>
        <View style={styles.cardGrid}>
            {/* Payment Logs */}
            <TouchableOpacity 
                style={[styles.menuCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
                onPress={() => setCurrentView('paymentLogs')}
            >
                <View style={[styles.iconBox, styles.iconBoxPayment]}>
                    <Ionicons name="receipt" size={32} color="#10B981" />
                </View>
                <Text style={[styles.menuTitle, { color: colors.text }]}>ประวัติการชำระ</Text>
                <Text style={[styles.menuDesc, { color: colors.subtext }]}>ตรวจสอบรายการโอน</Text>
            </TouchableOpacity>

            {/* Repair Logs */}
            <TouchableOpacity 
                style={[styles.menuCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
                onPress={() => setCurrentView('repairLogs')}
            >
                <View style={[styles.iconBox, styles.iconBoxRepair]}>
                    <Ionicons name="construct" size={32} color="#F97316" />
                </View>
                <Text style={[styles.menuTitle, { color: colors.text }]}>ประวัติแจ้งซ่อม</Text>
                <Text style={[styles.menuDesc, { color: colors.subtext }]}>ดูรายการแจ้งซ่อม</Text>
            </TouchableOpacity>

            {/* Delete Logs */}
            <TouchableOpacity 
                style={[styles.menuCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
                onPress={() => setCurrentView('logs')}
            >
                <View style={[styles.iconBox, styles.iconBoxLogs]}>
                    <Ionicons name="trash-bin" size={32} color="#EF4444" />
                </View>
                <Text style={[styles.menuTitle, { color: colors.text }]}>ประวัติการลบ</Text>
                <Text style={[styles.menuDesc, { color: colors.subtext }]}>ดู Logs ย้อนหลัง</Text>
            </TouchableOpacity>

            {/* Resident Logs */}
            <TouchableOpacity 
                style={[styles.menuCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
                onPress={() => setCurrentView('residentLogs')}
            >
                <View style={[styles.iconBox, styles.iconBoxResident]}>
                    <Ionicons name="people" size={32} color="#8B5CF6" />
                </View>
                <Text style={[styles.menuTitle, { color: colors.text }]}>ประวัติผู้อยู่อาศัย</Text>
                <Text style={[styles.menuDesc, { color: colors.subtext }]}>เพิ่ม/แก้ไข/ลบ/เดือน</Text>
            </TouchableOpacity>

            {/* Announcement Logs */}
            <TouchableOpacity 
                style={[styles.menuCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
                onPress={() => setCurrentView('announcementLogs')}
            >
                <View style={[styles.iconBox, styles.iconBoxAnnouncement]}>
                    <Ionicons name="megaphone" size={32} color="#0EA5E9" />
                </View>
                <Text style={[styles.menuTitle, { color: colors.text }]}>ประวัติประกาศ</Text>
                <Text style={[styles.menuDesc, { color: colors.subtext }]}>เพิ่ม/แก้ไข/ลบ</Text>
            </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    padding: 20,
    paddingTop: Platform.OS === 'android' ? 20 : 60,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  appName: {
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 2,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  profileBox: {
      flexDirection: 'row',
      alignItems: 'center',
  },
  avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
  },
  noAccessText: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
  },
  noAccessSubtext: {
    fontSize: 14,
    marginTop: 4,
  },
  menuGrid: {
      padding: 16,
  },
  sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      marginBottom: 16,
      marginLeft: 4,
  },
  cardGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: 12,
      marginBottom: 8,
  },
  menuCard: {
      width: '48%',
      padding: 20,
      borderRadius: 16,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      height: 160,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
  },
  iconBox: {
      width: 64,
      height: 64,
      borderRadius: 32,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
      position: 'relative',
  },
  badge: {
     position: 'absolute',
     top: -4,
     right: -4,
     backgroundColor: '#EF4444',
     minWidth: 24,
     height: 24,
     borderRadius: 12,
     justifyContent: 'center',
     alignItems: 'center',
     borderWidth: 2,
     borderColor: '#fff',
  },
  badgeText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '700',
      paddingHorizontal: 4,
  },
  menuTitle: {
      fontSize: 16,
      fontWeight: '600',
      marginBottom: 4,
  },
  menuDesc: {
      fontSize: 12,
  },
  centerContent: {
      justifyContent: 'center',
      alignItems: 'center',
  },
  headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
  },
  iconBoxApprovals: { backgroundColor: '#EEF2FF' },
  iconBoxPayment: { backgroundColor: '#ECFDF5' },
  iconBoxAdmins: { backgroundColor: '#F0F9FF' },
  iconBoxSettings: { backgroundColor: '#F3F4F6' },
  iconBoxRepair: { backgroundColor: '#FFF7ED' },
  iconBoxLogs: { backgroundColor: '#FEF2F2' },
  iconBoxResident: { backgroundColor: '#F5F3FF' },
  iconBoxAnnouncement: { backgroundColor: '#E0F2FE' },

});

export default SuperAdminScreen;
