import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';

type MenuRowProps = {
  onCashPress?: () => void;
  onCallPress?: () => void;
  onConstructPress?: () => void;
};

const MenuRow: React.FC<MenuRowProps> = ({ 
  onCashPress, 
  onCallPress, 
  onConstructPress 
}) => {
  return (
    <View style={styles.menuRow}>
      <TouchableOpacity style={styles.menuButton} onPress={onCallPress}>
        <Ionicons name="call" size={28} color="#666" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.menuButton} onPress={onCashPress}>
        <Ionicons name="cash" size={28} color="#666" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.menuButton} onPress={onConstructPress}>
        <Ionicons name="construct" size={28} color="#666" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  menuRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-evenly', 
    width: '100%', 
    borderRadius: 10, 
    padding: 15, 
    marginBottom: 15, 
    backgroundColor: '#fff' 
  },
  menuButton: { 
    backgroundColor: 'white', 
    borderRadius: 50, 
    padding: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
});

export default MenuRow;
