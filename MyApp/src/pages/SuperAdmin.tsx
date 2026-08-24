import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Platform, ActivityIndicator, StatusBar, ScrollView
} from 'react-native';
import { widthPercentageToDP as wp, heightPercentageToDP as hp } from 'react-native-responsive-screen';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE_HOST } from './config';
import colors from '../constants/colors';
import { useI18n } from '../i18n';

import ApprovalsPage from './superadmin/ApprovalsPage';
import LogsPage from './superadmin/LogsPage';
import AdminsPage from './superadmin/AdminsPage';
import SettingsPage from './superadmin/SettingsPage';
import PaymentLogsPage from './superadmin/PaymentLogsPage';
import RepairLogsPage from './superadmin/RepairLogsPage';
import ResidentLogsPage from './superadmin/ResidentLogsPage';
import AnnouncementLogsPage from './superadmin/AnnouncementLogsPage';
import FinancialVisibilityLogsPage from './superadmin/FinancialVisibilityLogsPage';
import DiscountLogsPage from './superadmin/DiscountLogsPage';
import DiscountSettingsPage from './superadmin/DiscountSettingsPage';

export function getBaseUrl() {
  return BASE_HOST;
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
  const { t } = useI18n();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<'dashboard' | 'approvals' | 'logs' | 'admins' | 'settings' | 'discountSettings' | 'paymentLogs' | 'repairLogs' | 'residentLogs' | 'announcementLogs' | 'finVisibilityLogs' | 'discountLogs'>('dashboard');
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
      const headers = { Authorization: `Bearer ${token}` };
      
      const [resPayment, resFinancial, resVis, resDiscount] = await Promise.all([
        fetch(`${getBaseUrl()}/payment-installments/waiting-approval`, { headers }),
        fetch(`${getBaseUrl()}/financial/waiting-approval`, { headers }),
        fetch(`${getBaseUrl()}/financial/visibility/logs`, { headers }),
        fetch(`${getBaseUrl()}/discount/requests/waiting`, { headers })
      ]);
      
      let total = 0;
      if (resPayment.ok) {
        const data = await resPayment.json();
        total += data.data?.length || 0;
      }
      if (resFinancial.ok) {
        const data = await resFinancial.json();
        total += data.data?.length || 0;
      }
      if (resVis.ok) {
        const data = await resVis.json();
        const pending = (data.data || []).filter((item: any) => item.status === 'waiting_approval');
        total += pending.length;
      }
      if (resDiscount.ok) {
        const data = await resDiscount.json();
        total += (data.data || []).length;
      }
      
      setWaitingCount(total);
    } catch (error) {
      console.log('Error fetching waiting count:', error);
    }
  };

  useEffect(() => {
    fetchMe();
    fetchWaitingCount();
    
    const interval = setInterval(fetchWaitingCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const onBack = () => {
    setCurrentView('dashboard');
    fetchWaitingCount();
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (me && me.role !== 'superadmin') {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: colors.bg }]}>
        <Ionicons name="lock-closed" size={64} color={colors.danger} />
        <Text style={[styles.noAccessText, { color: colors.text }]}>
          {t('saNoAccess')}
        </Text>
        <Text style={[styles.noAccessSubtext, { color: colors.subtext }]}>
          {t('saOnlySuperAdmin')}
        </Text>
      </View>
    );
  }

  if (currentView === 'approvals') return <ApprovalsPage onBack={onBack} darkMode={darkMode} />;
  if (currentView === 'logs') return <LogsPage onBack={onBack} darkMode={darkMode} />;
  if (currentView === 'admins') return <AdminsPage onBack={onBack} darkMode={darkMode} />;
  if (currentView === 'settings') return <SettingsPage onBack={onBack} darkMode={darkMode} />;
  if (currentView === 'discountSettings') return <DiscountSettingsPage onBack={onBack} darkMode={darkMode} />;
  if (currentView === 'paymentLogs') return <PaymentLogsPage onBack={onBack} darkMode={darkMode} />;
  if (currentView === 'repairLogs') return <RepairLogsPage onBack={onBack} darkMode={darkMode} />;
  if (currentView === 'residentLogs') return <ResidentLogsPage onBack={onBack} darkMode={darkMode} />;
  if (currentView === 'announcementLogs') return <AnnouncementLogsPage onBack={onBack} darkMode={darkMode} />;
  if (currentView === 'finVisibilityLogs') return <FinancialVisibilityLogsPage onBack={onBack} darkMode={darkMode} />;
  if (currentView === 'discountLogs') return <DiscountLogsPage onBack={onBack} darkMode={darkMode} />;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={darkMode ? 'light-content' : 'dark-content'} />
      
      {}
      <View style={[styles.header, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
         <View style={styles.headerRow}>
            <TouchableOpacity onPress={onMenuPress}>
              <Ionicons name="menu" size={wp('7%')} color={colors.text} />
            </TouchableOpacity>
            <View>
              <Text style={[styles.appName, { color: colors.primary }]}>NitiSmart</Text>
              <Text style={[styles.headerTitle, { color: colors.text }]}>Super Admin Panel</Text>
            </View>
         </View>
         <View style={styles.profileBox}>
            <View style={[styles.avatar, { backgroundColor: colors.warning }]}>
                <Ionicons name="shield" size={wp('5%')} color="#fff" />
            </View>
         </View>
      </View>

      <ScrollView contentContainerStyle={styles.menuGrid}>
        <Text style={[styles.sectionTitle, { color: colors.subtext }]}>{t('saManageSystem')}</Text>
        <View style={styles.cardGrid}>
            {}
            <TouchableOpacity 
                style={[styles.menuCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
                onPress={() => setCurrentView('approvals')}
            >
                <View style={[styles.iconBox, styles.iconBoxApprovals]}>
                    <Ionicons name="shield-checkmark" size={wp('8%')} color="#4F46E5" />
                    {waitingCount > 0 && (
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>{waitingCount}</Text>
                        </View>
                    )}
                </View>
                <Text style={[styles.menuTitle, { color: colors.text }]}>{t('saApprovals')}</Text>
                <Text style={[styles.menuDesc, { color: colors.subtext }]}>{t('saCheckRequests')}</Text>
            </TouchableOpacity>

             {}
             <TouchableOpacity 
                style={[styles.menuCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
                onPress={() => setCurrentView('admins')}
            >
                <View style={[styles.iconBox, styles.iconBoxAdmins]}>
                    <Ionicons name="people" size={32} color="#0EA5E9" />
                </View>
                <Text style={[styles.menuTitle, { color: colors.text }]}>{t('saManageAdmin')}</Text>
                <Text style={[styles.menuDesc, { color: colors.subtext }]}>{t('saAddRemoveAdmin')}</Text>
            </TouchableOpacity>

             {}
             <TouchableOpacity 
                style={[styles.menuCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
                onPress={() => setCurrentView('settings')}
            >
                <View style={[styles.iconBox, styles.iconBoxSettings]}>
                    <Ionicons name="settings" size={32} color="#6B7280" />
                </View>
                <Text style={[styles.menuTitle, { color: colors.text }]}>{t('saSystemSettings')}</Text>
                <Text style={[styles.menuDesc, { color: colors.subtext }]}>PromptPay, Rates</Text>
            </TouchableOpacity>

             {}
             <TouchableOpacity 
                style={[styles.menuCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
                onPress={() => setCurrentView('discountSettings')}
            >
                <View style={[styles.iconBox, styles.iconBoxDiscount]}>
                    <Ionicons name="pricetag" size={32} color="#F59E0B" />
                </View>
                <Text style={[styles.menuTitle, { color: colors.text }]}>ตั้งค่าส่วนลด</Text>
                <Text style={[styles.menuDesc, { color: colors.subtext }]}>ตั้งส่วนลด 3, 6, 12 เดือน</Text>
            </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.subtext }]}>{t('saHistoryLogs')}</Text>
        <View style={styles.cardGrid}>
            {}
            <TouchableOpacity 
                style={[styles.menuCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
                onPress={() => setCurrentView('paymentLogs')}
            >
                <View style={[styles.iconBox, styles.iconBoxPayment]}>
                    <Ionicons name="receipt" size={32} color="#10B981" />
                </View>
                <Text style={[styles.menuTitle, { color: colors.text }]}>{t('saPaymentHistory')}</Text>
                <Text style={[styles.menuDesc, { color: colors.subtext }]}>{t('saCheckTransfers')}</Text>
            </TouchableOpacity>

            {}
            <TouchableOpacity 
                style={[styles.menuCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
                onPress={() => setCurrentView('repairLogs')}
            >
                <View style={[styles.iconBox, styles.iconBoxRepair]}>
                    <Ionicons name="construct" size={32} color="#F97316" />
                </View>
                <Text style={[styles.menuTitle, { color: colors.text }]}>{t('saRepairHistory')}</Text>
                <Text style={[styles.menuDesc, { color: colors.subtext }]}>{t('saViewRepairs')}</Text>
            </TouchableOpacity>

            {}
            <TouchableOpacity 
                style={[styles.menuCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
                onPress={() => setCurrentView('logs')}
            >
                <View style={[styles.iconBox, styles.iconBoxLogs]}>
                    <Ionicons name="trash-bin" size={32} color="#EF4444" />
                </View>
                <Text style={[styles.menuTitle, { color: colors.text }]}>{t('saDeleteHistory')}</Text>
                <Text style={[styles.menuDesc, { color: colors.subtext }]}>{t('saViewLogs')}</Text>
            </TouchableOpacity>

            {}
            <TouchableOpacity 
                style={[styles.menuCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
                onPress={() => setCurrentView('residentLogs')}
            >
                <View style={[styles.iconBox, styles.iconBoxResident]}>
                    <Ionicons name="people" size={32} color="#8B5CF6" />
                </View>
                <Text style={[styles.menuTitle, { color: colors.text }]}>{t('saResidentHistory')}</Text>
                <Text style={[styles.menuDesc, { color: colors.subtext }]}>{t('saResidentDesc')}</Text>
            </TouchableOpacity>

            {}
            <TouchableOpacity 
                style={[styles.menuCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
                onPress={() => setCurrentView('announcementLogs')}
            >
                <View style={[styles.iconBox, styles.iconBoxAnnouncement]}>
                    <Ionicons name="megaphone" size={32} color="#0EA5E9" />
                </View>
                <Text style={[styles.menuTitle, { color: colors.text }]}>{t('saAnnouncementHistory')}</Text>
                <Text style={[styles.menuDesc, { color: colors.subtext }]}>{t('saAnnouncementDesc')}</Text>
            </TouchableOpacity>

            {}
            <TouchableOpacity 
                style={[styles.menuCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
                onPress={() => setCurrentView('finVisibilityLogs')}
            >
                <View style={[styles.iconBox, styles.iconBoxFinVis]}>
                    <Ionicons name="eye-outline" size={32} color="#10B981" />
                </View>
                <Text style={[styles.menuTitle, { color: colors.text }]}>ประวัติเปิด/ปิดยอดเงิน</Text>
                <Text style={[styles.menuDesc, { color: colors.subtext }]}>อนุมัติการแสดงผลยอด</Text>
            </TouchableOpacity>

            {}
            <TouchableOpacity 
                style={[styles.menuCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
                onPress={() => setCurrentView('discountLogs')}
            >
                <View style={[styles.iconBox, styles.iconBoxDiscount]}>
                    <Ionicons name="pricetag" size={32} color="#F59E0B" />
                </View>
                <Text style={[styles.menuTitle, { color: colors.text }]}>ประวัติส่วนลด</Text>
                <Text style={[styles.menuDesc, { color: colors.subtext }]}>สร้าง/แก้ไข/ลบส่วนลด</Text>
            </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    padding: wp('5%'),
    paddingTop: Platform.OS === 'android' ? wp('5%') : hp('7.5%'),
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  appName: {
      fontSize: wp('3.5%'),
      fontWeight: '600',
      marginBottom: hp('0.3%'),
  },
  headerTitle: {
    fontSize: wp('6%'),
    fontWeight: '700',
  },
  profileBox: {
      flexDirection: 'row',
      alignItems: 'center',
  },
  avatar: {
      width: wp('10%'),
      height: wp('10%'),
      borderRadius: wp('5%'),
      justifyContent: 'center',
      alignItems: 'center',
  },
  noAccessText: {
    fontSize: wp('5%'),
    fontWeight: '600',
    marginTop: hp('2%'),
  },
  noAccessSubtext: {
    fontSize: wp('3.5%'),
    marginTop: hp('0.5%'),
  },
  menuGrid: {
      padding: wp('4%'),
  },
  sectionTitle: {
      fontSize: wp('4%'),
      fontWeight: '600',
      marginBottom: hp('2%'),
      marginLeft: wp('1%'),
  },
  cardGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: hp('1.5%'),
      marginBottom: hp('1%'),
  },
  menuCard: {
      width: '48%',
      padding: wp('5%'),
      borderRadius: wp('4%'),
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      height: hp('20%'),
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
  },
  iconBox: {
      width: wp('16%'),
      height: wp('16%'),
      borderRadius: wp('8%'),
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: hp('1.5%'),
      position: 'relative',
  },
  badge: {
     position: 'absolute',
     top: -4,
     right: -4,
     backgroundColor: '#EF4444',
     minWidth: wp('6%'),
     height: wp('6%'),
     borderRadius: wp('3%'),
     justifyContent: 'center',
     alignItems: 'center',
     borderWidth: 2,
     borderColor: '#fff',
  },
  badgeText: {
      color: '#fff',
      fontSize: wp('3%'),
      fontWeight: '700',
      paddingHorizontal: wp('1%'),
  },
  menuTitle: {
      fontSize: wp('4%'),
      fontWeight: '600',
      marginBottom: hp('0.5%'),
  },
  menuDesc: {
      fontSize: wp('3%'),
  },
  centerContent: {
      justifyContent: 'center',
      alignItems: 'center',
  },
  headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: wp('3%'),
  },
  iconBoxApprovals: { backgroundColor: '#EEF2FF' },
  iconBoxPayment: { backgroundColor: '#ECFDF5' },
  iconBoxAdmins: { backgroundColor: '#F0F9FF' },
  iconBoxSettings: { backgroundColor: '#F3F4F6' },
  iconBoxRepair: { backgroundColor: '#FFF7ED' },
  iconBoxLogs: { backgroundColor: '#FEF2F2' },
  iconBoxResident: { backgroundColor: '#F5F3FF' },
  iconBoxAnnouncement: { backgroundColor: '#E0F2FE' },
  iconBoxFinVis: { backgroundColor: '#ECFDF5' },
  iconBoxDiscount: { backgroundColor: '#FFFBEB' },
});

export default SuperAdminScreen;
