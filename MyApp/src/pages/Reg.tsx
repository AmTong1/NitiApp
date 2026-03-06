import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showAlert } from '../components/GlobalAlert';
import { BASE_HOST, BASE_PORT } from './config.ts';
const ANDROID_HOST = BASE_HOST;
type RegisterProps = {
  onRegister: () => void; // เรียกเมื่อสมัครสำเร็จ
};

export function getBaseUrl() {
  const host = Platform.OS === 'android' ? ANDROID_HOST : BASE_HOST;
  return `http://${host}:${BASE_PORT}`;
}

const Register: React.FC<RegisterProps> = ({ onRegister }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const handleRegister = async () => {
    if (!username || !password) {
      showAlert('กรอกข้อมูลให้ครบ', 'โปรดใส่ Username และ Password');
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
        showAlert('สมัครไม่สำเร็จ', json?.error || 'ลองใหม่อีกครั้ง');
        return;
      }
      await AsyncStorage.setItem('token', json.token);
      onRegister();
    } catch (e: any) {
      showAlert('ข้อผิดพลาด', e?.message || 'ติดต่อเซิร์ฟเวอร์ไม่ได้');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Ionicons name="person-add" size={100} color="#fff" style={styles.mb40} />
      <Text style={styles.title}>Register</Text>

      <View style={styles.inputContainer}>
        <Ionicons name="person-outline" size={20} color="#000" style={styles.icon} />
        <TextInput
          placeholder="Username"
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
        />
      </View>

      <View style={styles.inputContainer}>
        <Ionicons name="lock-closed-outline" size={20} color="#000" style={styles.icon} />
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
        <Text style={styles.buttonText}>{busy ? 'กำลังสมัคร...' : 'สมัครสมาชิก'}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#a8d639', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingTop: 40 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 20, fontStyle: 'italic', color: '#fff', textAlign: 'center' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 10, marginBottom: 15, width: '80%' },
  icon: { marginRight: 5 },
  input: { flex: 1, height: 40 },
  button: { backgroundColor: '#d6d6b1', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 40, marginTop: 10 },
  buttonText: { fontWeight: 'bold', fontSize: 16 },
  mb40: { marginBottom: 40 },
  busyOpacity: { opacity: 0.6 },
});

export default Register;
