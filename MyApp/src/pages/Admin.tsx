import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import MenuRow from '../components/MenuRow';

const Admin: React.FC = () => {
  return (
    <>
      <MenuRow />
      <View style={styles.infoBox}>
        <TextInput placeholder="ID Admin xxxxxxxxxxxxxxx" placeholderTextColor="#555" style={styles.textInput} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Home</Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.confirmButton}><Text style={styles.buttonText}>ยืนยัน</Text></TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton}><Text style={styles.buttonText}>ยกเลิก</Text></TouchableOpacity>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Repair</Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.confirmButton}><Text style={styles.buttonText}>ยืนยัน</Text></TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton}><Text style={styles.buttonText}>ยกเลิก</Text></TouchableOpacity>
        </View>
      </View>
    </>
  );
};
const styles = StyleSheet.create({
  infoBox: { backgroundColor: 'white', width: '90%', borderRadius: 10, padding: 15, marginBottom: 15 },
  textInput: { fontSize: 16, color: 'black', padding: 10, borderWidth: 1, borderColor: '#ccc', borderRadius: 5, width: '100%' },
  card: { width: '90%', backgroundColor: '#f4fdd5', borderRadius: 15, padding: 20, alignItems: 'center', marginBottom: 20 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  buttonRow: { flexDirection: 'row' },
  confirmButton: { backgroundColor: 'limegreen', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 20, marginHorizontal: 5 },
  cancelButton: { backgroundColor: 'red', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 20, marginHorizontal: 5 },
  buttonText: { fontWeight: 'bold', fontSize: 16 },
});
export default Admin;
