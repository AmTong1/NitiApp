import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Keyboard,
  TouchableWithoutFeedback
} from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showAlert } from '../components/GlobalAlert';
import { BASE_HOST, BASE_PORT } from './config.ts';

const ANDROID_HOST = BASE_HOST;

type LoginProps = {
  username: string;
  setUsername: (v: string) => void;
  onLogin: () => void;
};

// 🔥 ใช้ function เดียวกันกับ App.tsx
export function getBaseUrl() {
  const host = Platform.OS === 'android' ? ANDROID_HOST : BASE_HOST;
  return `http://${host}:${BASE_PORT}`;
}

const Login: React.FC<LoginProps> = ({ username, setUsername, onLogin }) => {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) {
      showAlert('กรอกข้อมูลให้ครบ', 'โปรดใส่ Username และ Password');
      return;
    }

    try {
      setBusy(true);
      console.log('🚀 Starting login...'); // Debug

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const baseUrl = getBaseUrl();
      console.log('🔗 Connecting to:', baseUrl); // Debug

      const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log('📡 Response status:', res.status); // Debug

      const json = await res.json();
      console.log('📄 Response data:', json); // Debug

      if (!res.ok) {
        showAlert('เข้าสู่ระบบล้มเหลว', json?.error || 'ลองใหม่อีกครั้ง');
        return;
      }

      // 🔥 บันทึก token และเรียก onLogin ทันที
      await AsyncStorage.setItem('token', json.token);
      onLogin();

    } catch (e: any) {
      console.error('🔥 Login error:', e);

      if (e.name === 'AbortError') {
        showAlert('หมดเวลา', 'การเชื่อมต่อใช้เวลานานเกินไป');
      } else if (e.message.includes('Network request failed')) {
        showAlert(
          'ไม่สามารถเชื่อมต่อได้',
          `กรุณาตรวจสอบ:\n• WiFi/Internet\n• เซิร์ฟเวอร์เปิดอยู่\n• IP: ${getBaseUrl()}\n• Platform: ${Platform.OS}`
        );
      } else {
        showAlert('ข้อผิดพลาด', e?.message || 'ติดต่อเซิร์ฟเวอร์ไม่ได้');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.keyboardAvoid}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.container}>
            <Ionicons name="home" size={100} color="#fff" style={styles.mb40} />
            <Text style={styles.title}>Login</Text>

            <View style={styles.inputContainer}>
              <Ionicons name="person-outline" size={20} color="#000" style={styles.icon} />
              <TextInput
                placeholder="Username"
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                editable={!busy}
                returnKeyType="next"
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
                editable={!busy}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
            </View>

            <TouchableOpacity
              style={[
                styles.button,
                busy && styles.busyButton
              ]}
              onPress={handleLogin}
              disabled={busy}
            >
              <View style={styles.buttonContent}>
                {busy && (
                  <ActivityIndicator
                    size="small"
                    color="#333"
                    style={styles.mr10}
                  />
                )}
                <Text style={styles.buttonText}>
                  {busy ? 'กำลังเข้าสู่ระบบ...' : 'Login'}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
    backgroundColor: '#0F680FFF',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    backgroundColor: '#0F680FFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#0F680FFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    fontStyle: 'italic',
    color: '#fff',
    textAlign: 'center'
  },
  debugText: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.7,
    marginBottom: 8,
    textAlign: 'center'
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 10,
    marginBottom: 15,
    width: '80%'
  },
  icon: { marginRight: 5 },
  input: { flex: 1, height: 40 },
  button: {
    backgroundColor: '#d6d6b1',
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 40,
    marginTop: 10,
    minWidth: 200,
  },

  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  buttonText: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#333',
  },

  debugContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  debugStatus: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.8,
    marginTop: 5,
  },
  mb40: {
    marginBottom: 40,
  },
  busyButton: {
    backgroundColor: '#b8b8a0',
    opacity: 0.8,
  },
  mr10: {
    marginRight: 10,
  },
});

export default Login;
