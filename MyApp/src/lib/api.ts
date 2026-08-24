import AsyncStorage from '@react-native-async-storage/async-storage';

export async function apiFetchJson(url: string, init: RequestInit = {}) {
  const token = await AsyncStorage.getItem('token');
  const headers: any = {
    Accept: 'application/json',
    ...(init.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  if ((init as any).body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { ...init, headers });
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const text = await res.text();
    throw new Error(`Unexpected response (${res.status}): ${text.slice(0, 120)}…`);
  }
  const json = await res.json();
  return { res, json };
}