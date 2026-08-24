import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import LinearGradient from 'react-native-linear-gradient';

type HeaderProps = {
  title: string;
  darkMode: boolean;
  tone?: string;
  onMenuPress: () => void;
  showClose?: boolean;
  onClose?: () => void;
  onBellPress?: () => void;
  bellCount?: number;
  bellActive?: boolean;
};

const Header: React.FC<HeaderProps> = ({
  title,
  darkMode,
  tone = 'home',
  onMenuPress,
  showClose,
  onClose,
  onBellPress,
  bellCount = 0,
  bellActive = false,
}) => {
  const toneColors: Record<string, [string, string]> = {
    home: ['#2D8A3D', '#56B34F'],
    profile: ['#2E7D32', '#4CAF50'],
    settings: ['#455A64', '#607D8B'],
    announcement: ['#1B8A5A', '#2FBF71'],
    notification: ['#E67E22', '#F4A63A'],
    call: ['#D3544B', '#EE886A'],
    repairst: ['#1D4ED8', '#3B82F6'],
    payment: ['#5B8C2A', '#7CB342'],
    paymentDetail: ['#527A20', '#689F38'],
    qrcode: ['#2E7D32', '#66BB6A'],
    usermgr: ['#0F8A6B', '#2BBE9C'],
    admin: ['#C2185B', '#EC407A'],
    chat: ['#00897B', '#26A69A'],
  };

  const lightGradient = toneColors[tone] || toneColors.home;
  const gradientColors = darkMode ? ['#1E293B', '#334155'] as [string, string] : lightGradient;
  
  const titleColor = '#F8FAFC';
  const iconColor = '#0F172A';
  const iconBg = darkMode ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.80)';
  const iconBorder = darkMode ? 'rgba(255,255,255,0.34)' : 'rgba(15,23,42,0.10)';
  
  const titleFontSize = title.length > 28 ? 18 : title.length > 20 ? 20 : title.length > 14 ? 22 : 24;
  const rightButtonCount = Number(!!onBellPress) + Number(!!showClose);
  const sideWidth = rightButtonCount > 1 ? 96 : 52;

  return (
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.headerGradient}
    >
      <View style={styles.headerContent}>
        <View style={[styles.sideSlot, { width: sideWidth }]}>
          <TouchableOpacity onPress={onMenuPress} style={[styles.iconBtn, { backgroundColor: iconBg, borderColor: iconBorder }]}>
            <Ionicons name="menu" size={22} color={iconColor} />
          </TouchableOpacity>
        </View>

        <View style={styles.titleSlot}>
          <Text
            style={[styles.headerTitle, { color: titleColor, fontSize: titleFontSize }]}
            numberOfLines={1}
            ellipsizeMode="tail"
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {title}
          </Text>
        </View>

        <View style={[styles.sideSlotRight, { width: sideWidth }]}>
          {!!onBellPress && (
            <TouchableOpacity
              onPress={onBellPress}
              style={[styles.iconBtn, styles.mr8, { backgroundColor: iconBg, borderColor: iconBorder }, bellActive && styles.bellActive]}
              accessibilityLabel="notifications"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={bellActive ? 'notifications' : 'notifications-outline'}
                size={20}
                color={iconColor}
              />
              {bellCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{bellCount > 99 ? '99+' : String(bellCount)}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
          {showClose ? (
            <TouchableOpacity onPress={onClose} style={[styles.iconBtn, { backgroundColor: iconBg, borderColor: iconBorder }]}>
              <Ionicons name="close" size={20} color="#DC2626" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  headerGradient: {
    width: '100%',
    marginBottom: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 0,
    elevation: 2,
    shadowColor: '#10B981',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
  },
  headerContent: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideSlot: {
    width: 96,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  sideSlotRight: {
    width: 96,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  titleSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mr8: { marginRight: 8 },
  bellActive: { transform: [{ scale: 1.03 }] },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0.25,
  },
  badge: {
    position: 'absolute',
    right: -4,
    top: -4,
    backgroundColor: '#DC2626',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});

export default Header;
