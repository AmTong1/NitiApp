import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { widthPercentageToDP as wp, heightPercentageToDP as hp } from 'react-native-responsive-screen';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showAlert } from '../components/GlobalAlert';
import { BASE_HOST } from './config.ts';
import { useI18n } from '../i18n';
type RegisterProps = {
  onRegister: () => void; // เน€เธฃเธตเธขเธเน€เธกเธทเนเธญเธชเธกเธฑเธเธฃเธชเธณเน€ร็จ
};

export function getBaseUrl() {
  return BASE_HOST;
}

const Register: React.FC<RegisterProps> = ({ onRegister }) => {
  const { t } = useI18n();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const handleRegister = async () => {
    if (!username || !password) {
      showAlert(t('regFillAll'), t('regFillPrompt'));
      return;
    }
    try {
      setBusy(true);
      const res = await fetch(`${getBaseUrl()}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        showAlert(t('regFailed'), json?.error || t('loginRetry'));
        return;
      }
      await AsyncStorage.setItem('token', json.token);
      onRegister();
    } catch (e: any) {
      showAlert(t('regError'), e?.message || t('loginServerError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Ionicons name="person-add" size={wp('20%')} color="#fff" style={styles.mb40} />
      <Text style={styles.title}>Register</Text>

      <View style={styles.inputContainer}>
        <Ionicons name="person-outline" size={wp('5%')} color="#000" style={styles.icon} />
        <TextInput
          placeholder="Username"
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
        />
      </View>

      <View style={styles.inputContainer}>
        <Ionicons name="lock-closed-outline" size={wp('5%')} color="#000" style={styles.icon} />
        <TextInput
          placeholder="Password"
          secureTextEntry
          style={styles.input}
          value={password}
          onChangeText={setPassword}
        />
      </View>

      <TouchableOpacity
        style={[styles.button, busy && styles.busyOpacity]}
        onPress={handleRegister}
        disabled={busy}
      >
        <Text style={styles.buttonText}>{busy ? t('registering') : t('registerButton')}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#a8d639', alignItems: 'center', justifyContent: 'center', paddingHorizontal: wp('5%'), paddingTop: hp('5%') },
  title: { fontSize: wp('6.5%'), fontWeight: 'bold', marginBottom: hp('2.5%'), fontStyle: 'italic', color: '#fff', textAlign: 'center' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: wp('5%'), paddingHorizontal: wp('3%'), marginBottom: hp('2%'), width: '80%' },
  icon: { marginRight: wp('1.5%') },
  input: { flex: 1, height: hp('5.5%') },
  button: { backgroundColor: '#d6d6b1', borderRadius: wp('5%'), paddingVertical: hp('1.5%'), paddingHorizontal: wp('10%'), marginTop: hp('1.5%') },
  buttonText: { fontWeight: 'bold', fontSize: wp('3.8%') },
  mb40: { marginBottom: hp('5%') },
  busyOpacity: { opacity: 0.6 },
});

export default Register;


