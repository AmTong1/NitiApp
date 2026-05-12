import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, ScrollView } from 'react-native';
import { widthPercentageToDP as wp, heightPercentageToDP as hp } from 'react-native-responsive-screen';
import type { MenuItem } from '../types';
import { useI18n } from '../i18n';

type User = {
  id: number | string;
  username: string;
  full_name?: string;
  role?: string;
  phone?: string; // ← NEW
};

type SidebarProps = {
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
  visible: boolean;
  onClose: () => void;
  onLogout: () => void;
  menuItems: MenuItem[];
  currentUser?: User | null;
  adminDividerIndex?: number;
};

const Sidebar: React.FC<SidebarProps> = ({ 
  darkMode,  
  visible, 
  onClose, 
  onLogout, 
  menuItems,
  currentUser,
  adminDividerIndex,
}) => {
  const { t } = useI18n();
  const sidebarWidth = Math.max(170, Math.min(280, Math.round(wp('56%'))));
  const sidebarHeight = Math.round(hp('100%'));
  const sidebarPadding = Math.max(14, Math.round(wp('4.4%')));
  const sidebarPaddingTop = Math.max(48, Math.round(hp('6.8%')));
  const menuFontSize = Math.max(14, Math.min(16, Math.round(wp('3.9%'))));
  const userNameFontSize = Math.max(16, Math.min(18, Math.round(wp('4.4%'))));
  const subFontSize = Math.max(9, Math.min(12, Math.round(wp('3%'))));
  const menuItemPaddingV = Math.max(9, Math.round(hp('1.3%')));
  const menuItemPaddingH = Math.max(6, Math.round(wp('2.3%')));
  const anim = useRef(new Animated.Value(-320)).current;

  useEffect(() => {
    Animated.timing(anim, { 
      toValue: visible ? 0 : -sidebarWidth,
      duration: 300, 
      useNativeDriver: false 
    }).start();
  }, [visible, anim, sidebarWidth]);

  const textColor = darkMode ? '#fff' : '#000';
  const subColor  = darkMode ? '#B0BEC5' : '#666';

  // ฟังก์ชันคำนวณขนาดฟอนต์ตามความยาวข้อความ
  const getDynamicFontSize = (text: string | undefined) => {
    if (!text) return 13;
    const length = text.length;
    if (length <= 10) return 13;
    if (length <= 15) return 12;
    if (length <= 20) return 11;
    if (length <= 25) return 10;
    if (length <= 30) return 9;
    return 8; // สำหรับข้อความที่ยาวมาก
  };

  const fullNameFontSize = Math.min(getDynamicFontSize(currentUser?.full_name), subFontSize);

  return (
    <>
      {visible && (
        <TouchableOpacity 
          style={styles.overlay} 
          onPress={onClose}
          activeOpacity={1}
        />
      )}

      <Animated.View style={[
        styles.sidebar, 
        darkMode && styles.sidebarDark, 
        { 
          left: anim,
          width: sidebarWidth,
          height: sidebarHeight,
        }
      ]}>
        <View style={[styles.sidebarContent, { padding: sidebarPadding, paddingTop: sidebarPaddingTop }]}>

          {/* ✅ ส่วนหัวผู้ใช้ */}
          <View style={styles.userHeader}>
            <View style={styles.userHeaderContent}>
              <Text style={[styles.userName, { color: textColor, fontSize: userNameFontSize }]}>
                UID : {currentUser?.username || 'Guest'}
              </Text>
              <Text 
                numberOfLines={1}
                style={[
                  styles.userSub, 
                  { 
                    color: subColor,
                    fontSize: fullNameFontSize,
                  }
                ]}
              >
                Name : {currentUser?.full_name}
              </Text>
              {!!currentUser?.phone && (
                <Text style={[styles.userSub, { color: subColor, fontSize: subFontSize }]}> 
                  Tel : {currentUser.phone}
                </Text>
              )}
            </View>
          </View>
          
          {/* เมนู */}
          <ScrollView
            style={styles.menuContainer}
            contentContainerStyle={styles.menuContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {menuItems.map((item, i) => (
              <React.Fragment key={i}>
                {(currentUser?.role === 'admin' || currentUser?.role === 'superadmin') && typeof adminDividerIndex === 'number' && i === adminDividerIndex && (
                  <View style={styles.divider} />
                )}
                <TouchableOpacity 
                  onPress={() => { item.onPress(); onClose(); }}
                  style={[styles.menuItem, styles.menuItemRow, { paddingVertical: menuItemPaddingV, paddingHorizontal: menuItemPaddingH }]}
                >
                  <Text
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    style={[styles.sidebarItem, styles.menuLabel, { color: textColor, fontSize: menuFontSize }]}
                  >
                    {item.label}
                  </Text>
                  {item.showRedDot && (
                    <View style={styles.redDot} />
                  )}
                </TouchableOpacity>
              </React.Fragment>
            ))}
          </ScrollView>

          {/* Logout */}
          <View style={styles.sidebarBottom}>
            <TouchableOpacity 
              onPress={() => { onLogout(); onClose(); }}
              style={[styles.menuItem, { paddingVertical: menuItemPaddingV, paddingHorizontal: menuItemPaddingH }]}
            >
              <Text style={[styles.sidebarItem, { color: textColor, fontSize: menuFontSize }]}> 
                {t('logout')}
              </Text>
            </TouchableOpacity>
          </View>

        </View>
      </Animated.View>
    </>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 99,
  },
  sidebar: {
    position: 'absolute',
    top: 0,
    width: 250,
    backgroundColor: '#fff',
    zIndex: 100,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  sidebarDark: { backgroundColor: '#222' },
  sidebarContent: {
    flex: 1,
    minHeight: 0,
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  userHeaderContent: {
    flex: 1,
    marginLeft: 10,
  },
  userName: { 
    fontWeight: 'bold', 
    fontSize: 18, 
    textAlign: 'center' 
  },
  userSub: { 
    textAlign: 'center',
    // ไม่กำหนด fontSize ที่นี่ เพราะจะใช้ dynamic fontSize
  },
  menuContainer: { flex: 1, minHeight: 0 },
  menuContent: { paddingBottom: 8 },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 8,
  },
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 4,
  },
  menuItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: 8,
  },
  redDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
  },
  sidebarItem: { fontSize: 16 },
  menuLabel: { flex: 1, flexShrink: 1 },
  sidebarBottom: {
    marginTop: 12,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 8,
  },
  switchText: { flex: 1, marginLeft: 12, fontSize: 16 },
  switch: { transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }] },
});

export default Sidebar;
