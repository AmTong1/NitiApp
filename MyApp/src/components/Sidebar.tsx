import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions } from 'react-native';
import type { MenuItem } from '../types';

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

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const Sidebar: React.FC<SidebarProps> = ({ 
  darkMode,  
  visible, 
  onClose, 
  onLogout, 
  menuItems,
  currentUser,
  adminDividerIndex,
}) => {
  const anim = useRef(new Animated.Value(-250)).current;

  useEffect(() => {
    Animated.timing(anim, { 
      toValue: visible ? 0 : -250, 
      duration: 300, 
      useNativeDriver: false 
    }).start();
  }, [visible]);

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

  const fullNameFontSize = getDynamicFontSize(currentUser?.full_name);

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
          height: screenHeight,
          maxWidth: screenWidth * 0.5,
        }
      ]}>
        <View style={styles.sidebarContent}>

          {/* ✅ ส่วนหัวผู้ใช้ */}
          <View style={styles.userHeader}>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[styles.userName, { color: textColor }]}>
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
                <Text style={[styles.userSub, { color: subColor, fontSize: 11 }]}>
                  Tel : {currentUser.phone}
                </Text>
              )}
            </View>
          </View>
          
          {/* เมนู */}
          <View style={styles.menuContainer}>
            {menuItems.map((item, i) => (
              <React.Fragment key={i}>
                {(currentUser?.role === 'admin' || currentUser?.role === 'superadmin') && typeof adminDividerIndex === 'number' && i === adminDividerIndex && (
                  <View style={styles.divider} />
                )}
                <TouchableOpacity 
                  onPress={() => { item.onPress(); onClose(); }}
                  style={[styles.menuItem, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                >
                  <Text style={[styles.sidebarItem, { color: textColor }]}>
                    {item.label}
                  </Text>
                  {item.showRedDot && (
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444' }} />
                  )}
                </TouchableOpacity>
              </React.Fragment>
            ))}
          </View>

          {/* Logout */}
          <View style={styles.sidebarBottom}>
            <TouchableOpacity 
              onPress={() => { onLogout(); onClose(); }}
              style={styles.menuItem}
            >
              <Text style={[styles.sidebarItem, { color: textColor }]}>
                🚪 Logout
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
    padding: 20,
    paddingTop: 60,
    justifyContent: 'space-between',
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
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
  menuContainer: { flex: 1 },
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
  sidebarItem: { fontSize: 16 },
  sidebarBottom: {
    marginTop: 20,
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
