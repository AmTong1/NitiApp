import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { widthPercentageToDP as wp, heightPercentageToDP as hp } from 'react-native-responsive-screen';
import MenuRow from '../components/MenuRow';
import { useI18n } from '../i18n';

const Admin: React.FC = () => {
  const { t } = useI18n();
  return (
    <>
      <MenuRow />
      <View style={styles.infoBox}>
        <TextInput placeholder="ID Admin xxxxxxxxxxxxxxx" placeholderTextColor="#555" style={styles.textInput} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Home</Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.confirmButton}><Text style={styles.buttonText}>{t('confirm')}</Text></TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton}><Text style={styles.buttonText}>{t('cancel')}</Text></TouchableOpacity>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Repair</Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.confirmButton}><Text style={styles.buttonText}>{t('confirm')}</Text></TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton}><Text style={styles.buttonText}>{t('cancel')}</Text></TouchableOpacity>
        </View>
      </View>
    </>
  );
};
const styles = StyleSheet.create({
  infoBox: { backgroundColor: 'white', width: '90%', borderRadius: wp('2.5%'), padding: wp('4%'), marginBottom: hp('2%') },
  textInput: { fontSize: wp('3.8%'), color: 'black', padding: wp('2.5%'), borderWidth: 1, borderColor: '#ccc', borderRadius: wp('1.5%'), width: '100%' },
  card: { width: '90%', backgroundColor: '#f4fdd5', borderRadius: wp('4%'), padding: wp('5%'), alignItems: 'center', marginBottom: hp('2.5%') },
  cardTitle: { fontSize: wp('4.5%'), fontWeight: 'bold', marginBottom: hp('2%') },
  buttonRow: { flexDirection: 'row' },
  confirmButton: { backgroundColor: 'limegreen', paddingVertical: hp('1%'), paddingHorizontal: wp('3%'), borderRadius: wp('5%'), marginHorizontal: wp('1.5%') },
  cancelButton: { backgroundColor: 'red', paddingVertical: hp('1%'), paddingHorizontal: wp('3%'), borderRadius: wp('5%'), marginHorizontal: wp('1.5%') },
  buttonText: { fontWeight: 'bold', fontSize: wp('4%') },
});
export default Admin;
