import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import type { Announcement } from '../types';
import MenuRow from '../components/MenuRow';
import AnnouncementList from '../components/AnnouncementList';

type HomeProps = {
  darkMode: boolean;
  announcements: Announcement[];
  goNotification: () => void;
  goQrcode?: () => void;
};

const Home: React.FC<HomeProps> = ({
  darkMode,
  announcements,
  goNotification,
  goQrcode,
}) => {
  const handleCashPress = () => {
    if (goQrcode) goQrcode();
  };

  const bg = darkMode ? '#FFFFFFFF' : '#FFFFFFFF';
  const textPrimary = darkMode ? '#E6E8EC' : '#1F2937';
  const cardBg = darkMode ? '#171A21' : '#FFFFFF';
  const accent = '#22C55E';

  return (
    <View style={[styles.screen, { backgroundColor: bg }]}>
      <ScrollView
        contentContainerStyle={styles.scrollBody}
        showsVerticalScrollIndicator={false}
      >
        {/* โซนเนื้อหา กำหนดความกว้างสูงสุดและจัดกลาง */}
        <View style={styles.centerWrap}>
          {/* แถวเมนูด้านบน */}
          <View style={[styles.menuWrap, styles.shadowSm, { backgroundColor: cardBg }]}>
            <MenuRow
              onCashPress={handleCashPress}
              onCallPress={() => console.log('Call pressed')}
              onConstructPress={() => console.log('Construct pressed')}
            />
          </View>

          {/* กล่องค้างชำระแบบพิลล์ */}
          <View style={[styles.infoBox, styles.shadowSm, { backgroundColor: cardBg }]}>
            <Text style={[styles.infoText, { color: textPrimary }]}>
              จำนวนเงินทั้งหมดที่ค้างชำระ:{' '}
              <Text style={[styles.infoAmount, { color: accent }]}>XXXX</Text>
            </Text>
          </View>

          {/* การ์ดประกาศข่าวสาร */}
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
    paddingTop: 10,
    paddingBottom: 20,
    alignItems: 'center',
  },
  centerWrap: {
    width: '100%',
    paddingHorizontal: 10,
    gap: 14,
  },

  menuWrap: {
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },

  infoBox: {
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  infoText: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  infoAmount: {
    fontSize: 18,
    fontWeight: '800',
  },

  card: {
    borderRadius: 18,
    padding: 12,
  },

  // เงา (iOS + Android)
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
