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
import { widthPercentageToDP as wp, heightPercentageToDP as hp } from 'react-native-responsive-screen';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showAlert } from '../components/GlobalAlert';
import { BASE_HOST } from './config.ts';
import { useI18n } from '../i18n';

type LoginProps = {
  username: string;
  setUsername: (v: string) => void;
  onLogin: () => void;
};

const CHAT_ME_CACHE_VERSION = 1;
const CHAT_ME_CACHE_KEY_PREFIX = `chat_me_snapshot_v${CHAT_ME_CACHE_VERSION}_`;

function getChatMeCacheKey(token: string) {
  const suffix = String(token || '').trim().slice(-64);
  return `${CHAT_ME_CACHE_KEY_PREFIX}${suffix}`;
}

function normalizeMeSnapshot(input: any) {
  const id = Number(input?.id || 0);
  if (!Number.isFinite(id) || id <= 0) return null;

  const roleRaw = String(input?.role || '').toLowerCase();
  const role: 'admin' | 'superadmin' | 'user' =
    roleRaw === 'admin' || roleRaw === 'superadmin' || roleRaw === 'user'
      ? roleRaw
      : 'user';

  return {
    id,
    username: String(input?.username || ''),
    full_name: input?.full_name ? String(input.full_name) : undefined,
    role,
  };
}

// ๐”ฅ ใช้ function เน€เธ”ียวกันกับ App.tsx
export function getBaseUrl() {
  return BASE_HOST;
}

const Login: React.FC<LoginProps> = ({ username, setUsername, onLogin }) => {
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) {
      showAlert(t('loginFillAll'), t('loginFillPrompt'));
      return;
    }

    try {
      setBusy(true);
      console.log('Starting login...'); // Debug

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const baseUrl = getBaseUrl();
      console.log('Connecting to:', baseUrl); // Debug

      const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log('Response status:', res.status); // Debug

      const json = await res.json();
      console.log('Response data:', json); // Debug

      if (!res.ok) {
        showAlert(t('loginFailed'), json?.error || t('loginRetry'));
        return;
      }

      // Store both token and quick me snapshot to avoid first-frame chat bubble side flicker.
      await AsyncStorage.setItem('token', json.token);
      const meSnapshot = normalizeMeSnapshot(json?.user);
      if (meSnapshot) {
        await AsyncStorage.setItem(getChatMeCacheKey(json.token), JSON.stringify(meSnapshot));
      }
      onLogin();

    } catch (e: any) {
      console.error('Login error:', e);

      if (e.name === 'AbortError') {
        showAlert(t('loginTimeout'), t('loginTimeoutMsg'));
      } else if (e.message.includes('Network request failed')) {
        showAlert(
          t('loginCannotConnect'),
          `${t('loginFillPrompt')}:\nโ€ข WiFi/Internet\nโ€ข Server\nโ€ข IP: ${getBaseUrl()}\nโ€ข Platform: ${Platform.OS}`
        );
      } else {
        showAlert(t('error'), e?.message || t('loginServerError'));
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
            <Ionicons name="home" size={wp('20%')} color="#fff" style={styles.mb40} />
            <Text style={styles.title}>Login</Text>

            <View style={styles.inputContainer}>
              <Ionicons name="person-outline" size={wp('6%')} color="#1f1f1f" style={styles.icon} />
              <TextInput
                placeholder="Username"
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                placeholderTextColor="#6B7280"
                editable={!busy}
                returnKeyType="next"
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={wp('6%')} color="#1f1f1f" style={styles.icon} />
              <TextInput
                placeholder="Password"
                secureTextEntry={!showPassword}
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholderTextColor="#6B7280"
                editable={!busy}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                style={styles.passwordToggle}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={wp('6%')}
                  color="#3b3b3b"
                />
              </TouchableOpacity>
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
                  {busy ? t('loginLoggingIn') : t('loginButton')}
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
    alignItems: 'center',
    backgroundColor: '#0F680FFF',
  },
  container: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#0F680FFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: wp('5%'),
    paddingVertical: hp('5%'),
  },
  title: {
    fontSize: wp('6.5%'),
    fontWeight: 'bold',
    marginBottom: hp('2.5%'),
    fontStyle: 'italic',
    color: '#fff',
    textAlign: 'center',
  },
  debugText: {
    fontSize: wp('3%'),
    color: '#fff',
    opacity: 0.7,
    marginBottom: hp('1%'),
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8e8e8',
    borderRadius: 999,
    paddingHorizontal: wp('4%'),
    marginBottom: hp('1.7%'),
    width: '100%',
    height: hp('6.2%'),
    borderWidth: 1,
    borderColor: '#dadada',
  },
  icon: { marginRight: wp('2.2%') },
  input: {
    flex: 1,
    height: '100%',
    color: '#141414',
    fontSize: wp('5%'),
    paddingVertical: 0,
  },
  passwordToggle: {
    paddingLeft: wp('2.2%'),
    minWidth: wp('8%'),
    alignItems: 'center',
  },
  button: {
    backgroundColor: '#d6d6b1',
    borderRadius: wp('5%'),
    paddingVertical: hp('1.5%'),
    paddingHorizontal: wp('10%'),
    marginTop: hp('1.5%'),
    minWidth: wp('50%'),
  },

  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  buttonText: {
    fontWeight: 'bold',
    fontSize: wp('3.8%'),
    color: '#333',
  },

  debugContainer: {
    marginTop: hp('2.5%'),
    alignItems: 'center',
  },
  debugStatus: {
    fontSize: wp('3%'),
    color: '#fff',
    opacity: 0.8,
    marginTop: hp('0.6%'),
  },
  mb40: {
    marginBottom: hp('5%'),
  },
  busyButton: {
    backgroundColor: '#b8b8a0',
    opacity: 0.8,
  },
  mr10: {
    marginRight: wp('2.5%'),
  },
});

export default Login;


