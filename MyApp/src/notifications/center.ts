import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppNotification = {
  id: string;
  type: 'announcement' | 'repair' | 'payment';
  title: string;
  subtitle?: string;
  date?: string;
  important?: boolean;
  statusCode?: string;
};

const SEEN_KEY = 'notif_seen_at';

export async function getLastSeen(): Promise<number> {
  try {
    const v = await AsyncStorage.getItem(SEEN_KEY);
    if (!v) return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  } catch { return 0; }
}

export async function markAllSeen() {
  try { await AsyncStorage.setItem(SEEN_KEY, String(Date.now())); } catch {}
}

export function sortNotifications(list: AppNotification[]) {
  return [...list].sort((a, b) => {
    const imp = (b.important ? 1 : 0) - (a.important ? 1 : 0);
    if (imp !== 0) return imp;
    const tb = b.date ? new Date(b.date).getTime() : 0;
    const ta = a.date ? new Date(a.date).getTime() : 0;
    if (tb !== ta) return tb - ta;
    return b.id.localeCompare(a.id);
  });
}

export function iconNameFor(t: AppNotification['type']) {
  switch (t) {
    case 'announcement': return 'megaphone';
    case 'repair': return 'construct';
    case 'payment': return 'card';
    default: return 'notifications';
  }
}

export function colorFor(t: AppNotification['type']) {
  switch (t) {
    case 'repair': return '#1D4ED8';
    case 'announcement': return '#FB8C00';
    case 'payment': return '#16A34A';
    default: return '#64748B';
  }
}
