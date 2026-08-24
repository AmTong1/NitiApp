import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { widthPercentageToDP as wp, heightPercentageToDP as hp } from 'react-native-responsive-screen';
import { useI18n } from '../i18n';
import { Ionicons } from '@react-native-vector-icons/ionicons';

type SettingsProps = {
  darkMode: boolean;
};

const Settings: React.FC<SettingsProps> = ({ darkMode }) => {
  const { t } = useI18n();

  const textColor = darkMode ? '#fff' : '#1F2937';
  const subColor = darkMode ? '#9CA3AF' : '#6B7280';
  const cardBg = darkMode ? '#2D2D2D' : '#FFFFFF';
  const sectionBg = darkMode ? '#1A1A1A' : '#F3F4F6';

  return (
    <ScrollView style={[styles.container, { backgroundColor: sectionBg }]} contentContainerStyle={styles.content}>
      {/* About Section */}
      <View style={styles.sectionHeader}>
        <Ionicons name="information-circle-outline" size={wp('4.5%')} color={subColor} />
        <Text style={[styles.sectionTitle, { color: subColor }]}>{t('settingsAbout')}</Text>
      </View>
      <View style={[styles.card, { backgroundColor: cardBg }]}>
        <View style={[styles.aboutRow, styles.langRowBorder]}>
          <Text style={[styles.aboutLabel, { color: textColor }]}>{t('settingsAppName')}</Text>
          <Text style={[styles.aboutValue, { color: subColor }]}>NitiSmart</Text>
        </View>
        <View style={styles.aboutRow}>
          <Text style={[styles.aboutLabel, { color: textColor }]}>{t('settingsVersion')}</Text>
          <Text style={[styles.aboutValue, { color: subColor }]}>1.0.4</Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: wp('4%'), paddingBottom: hp('5%') },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: hp('2.5%'),
    marginBottom: hp('1%'),
    paddingHorizontal: wp('1%'),
  },
  sectionTitle: {
    fontSize: wp('3.2%'),
    fontWeight: '600',
    marginLeft: wp('1.5%'),
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    borderRadius: wp('3.5%'),
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  langRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: hp('1.7%'),
    paddingHorizontal: wp('4%'),
  },
  aboutLabel: { fontSize: wp('3.7%'), fontWeight: '500' },
  aboutValue: { fontSize: wp('3.7%') },
});

export default Settings;
