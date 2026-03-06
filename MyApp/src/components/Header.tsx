import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';

type HeaderProps = {
  title: string;
  darkMode: boolean;
  onMenuPress: () => void;
  showClose?: boolean;
  onClose?: () => void;
  onBellPress?: () => void;
  bellCount?: number;
  bellActive?: boolean; // <— NEW
};

const Header: React.FC<HeaderProps> = ({ title, darkMode, onMenuPress, showClose, onClose, onBellPress, bellCount = 0, bellActive = false }) => {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onMenuPress}>
        <Ionicons name="menu" size={28} color={darkMode ? '#fff' : 'black'} />
      </TouchableOpacity>

      <Text style={[styles.headerTitle, darkMode && { color: '#fff' }]}>{title}</Text>

      <View style={styles.rightGroup}>
        {!!onBellPress && (
          <TouchableOpacity
            onPress={onBellPress}
            style={[styles.bellWrap, bellActive && { opacity: 0.85 }]}
            accessibilityLabel="notifications"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={bellActive ? 'notifications' : 'notifications-outline'}
              size={22}
              color={darkMode ? '#fff' : '#111'}
            />
            {bellCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{bellCount > 99 ? '99+' : String(bellCount)}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
        {showClose ? (
          <TouchableOpacity onPress={onClose} style={{ marginLeft: 12 }}>
            <Ionicons name="close" size={24} color="red" />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, marginBottom: 8 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', fontStyle: 'italic' },
  rightGroup: { flexDirection: 'row', alignItems: 'center' },
  bellWrap: { padding: 4 },
  badge: { position: 'absolute', right: 0, top: -2, backgroundColor: '#E53935', minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});

export default Header;
