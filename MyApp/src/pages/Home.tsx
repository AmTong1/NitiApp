import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { widthPercentageToDP as wp, heightPercentageToDP as hp } from 'react-native-responsive-screen';
import type { Announcement } from '../types';
import MenuRow from '../components/MenuRow';
import AnnouncementList from '../components/AnnouncementList';
import { useI18n } from '../i18n';

type HomeProps = {
  darkMode: boolean;
  announcements: Announcement[];
  goNotification: () => void;
  goPayment?: () => void;
  goCall?: () => void;
  goRepair?: () => void;
  goFinancial?: () => void;
  totalOverdueAmount?: number | null;
  totalOverdueLoading?: boolean;
  onRefreshOverdue?: () => Promise<void> | void;
  onRefreshAnnouncements?: () => Promise<void> | void;
  role?: string;
};

const Home: React.FC<HomeProps> = ({
  darkMode,
  announcements,
  goNotification,
  goPayment,
  goCall,
  goRepair,
  goFinancial,
  totalOverdueAmount,
  totalOverdueLoading,
  onRefreshOverdue,
  onRefreshAnnouncements,
  role,
}) => {
  const { t } = useI18n();
  const [refreshing, setRefreshing] = useState(false);
  const handleCashPress = () => goPayment?.();
  const handleCallPress = () => goCall?.();
  const handleConstructPress = () => goRepair?.();
  const handleFinancialPress = () => goFinancial?.();

  const amountText = (() => {
    if (totalOverdueLoading) return '...';
    if (typeof totalOverdueAmount !== 'number' || Number.isNaN(totalOverdueAmount)) return '-';
    return `${Number(totalOverdueAmount).toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${t('phBaht')}`;
  })();

  const hasOverdue = typeof totalOverdueAmount === 'number' && !Number.isNaN(totalOverdueAmount) && totalOverdueAmount > 0;

  const runPullRefresh = useCallback(async () => {
    if (refreshing) return;

    setRefreshing(true);
    try {
      await Promise.all([
        Promise.resolve(onRefreshOverdue?.()),
        Promise.resolve(onRefreshAnnouncements?.()),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, onRefreshOverdue, onRefreshAnnouncements]);

  const bg = darkMode ? '#FFFFFFFF' : '#FFFFFFFF';
  const textPrimary = darkMode ? '#E6E8EC' : '#1F2937';
  const cardBg = darkMode ? '#171A21' : '#FFFFFF';
  const accent = '#22C55E';

  return (
    <View style={[styles.screen, { backgroundColor: bg }]}>
      <ScrollView
        contentContainerStyle={styles.scrollBody}
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical
        overScrollMode="always"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={runPullRefresh}
            tintColor={accent}
            colors={[accent]}
            progressViewOffset={Math.round(hp('1.2%'))}
          />
        }
      >
        <View style={styles.centerWrap}>
          {}
          <View style={[styles.menuWrap, styles.shadowSm, { backgroundColor: cardBg }]}> 
            <MenuRow
              onCashPress={handleCashPress}
              onCallPress={handleCallPress}
              onConstructPress={handleConstructPress}
              onFinancialPress={handleFinancialPress}
            />
          </View>

          {}
          {role !== 'admin' && role !== 'superadmin' && (
            <View style={[styles.infoBox, styles.shadowSm, { backgroundColor: cardBg }]}> 
              {hasOverdue ? (
                <>
                  <View style={styles.overdueStatusRow}>
                    <View style={styles.overdueStatusBadge}>
                      <Text style={styles.overdueStatusText}>{t('homeOverdueStatus')}</Text>
                    </View>
                  </View>
                  <Text style={[styles.infoText, styles.overdueInfoText, { color: textPrimary }]}> 
                    {t('phOverdueAmountLabel')}:{' '}
                    <Text style={[styles.infoAmount, styles.overdueAmountText]}>{amountText}</Text>
                  </Text>
                </>
              ) : totalOverdueLoading ? (
                <Text style={[styles.infoText, { color: textPrimary }]}>
                  {t('payTotalOverdue')}: <Text style={[styles.infoAmount, { color: accent }]}>...</Text>
                </Text>
              ) : (
                <View style={styles.noOverdueRow}>
                  <Text style={styles.noOverdueText}>{t('homeNoOverdue')}</Text>
                </View>
              )}
            </View>
          )}

          {}
          <AnnouncementList
            data={announcements}
            onMore={goNotification}
            darkMode={darkMode}
          />
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollBody: {
    flexGrow: 1,
    paddingTop: hp('1.3%'),
    paddingBottom: hp('2.5%'),
    alignItems: 'center',
  },
  centerWrap: {
    width: '100%',
    paddingHorizontal: wp('2.5%'),
    gap: hp('1.7%'),
  },

  menuWrap: {
    borderRadius: wp('5%'),
    paddingVertical: hp('1%'),
    paddingHorizontal: wp('2%'),
  },

  infoBox: {
    borderRadius: wp('4%'),
    paddingVertical: hp('1.7%'),
    paddingHorizontal: wp('4%'),
  },
  infoText: {
    fontSize: wp('4%'),
    fontWeight: '500',
    textAlign: 'center',
  },
  infoAmount: {
    fontSize: wp('4.5%'),
    fontWeight: '800',
  },
  overdueInfoText: {
    marginTop: 6,
  },
  overdueAmountText: {
    color: '#EF4444',
  },

  card: {
    borderRadius: wp('4.5%'),
    padding: wp('3%'),
  },

  overdueStatusRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  overdueStatusBadge: {
    backgroundColor: '#FEE2E2',
    borderRadius: wp('3%'),
    paddingHorizontal: wp('3%'),
    paddingVertical: hp('0.5%'),
  },
  overdueStatusText: {
    color: '#DC2626',
    fontSize: wp('3.5%'),
    fontWeight: '800',
  },
  noOverdueRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  noOverdueText: {
    color: '#22C55E',
    fontSize: wp('3.8%'),
    fontWeight: '600',
  },

  shadowSm: {
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  shadowMd: {
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
});

export default Home;
