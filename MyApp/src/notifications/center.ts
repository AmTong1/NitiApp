import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppNotification = {
  id: string;
  type: 'announcement' | 'repair' | 'payment';
  title: string;
  subtitle?: string;
  date?: string;
  sortTs?: number;
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

function toTimestamp(value?: string | number | null): number {
  if (value == null) return 0;

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }

  const raw = String(value).trim();
  if (!raw) return 0;

  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n > 1e12 ? n : n * 1000;
  }

  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) return parsed;

  const mDateTime = raw.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (mDateTime) {
    const [, y, m, d, hh, mm, ss] = mDateTime;
    const t = Date.parse(`${y}-${m}-${d}T${hh}:${mm}:${ss}`);
    return Number.isNaN(t) ? 0 : t;
  }

  const mIsoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (mIsoDate) {
    const y = Number(mIsoDate[1]);
    const m = Number(mIsoDate[2]);
    const d = Number(mIsoDate[3]);
    const dt = new Date(y, m - 1, d);
    return Number.isNaN(dt.getTime()) ? 0 : dt.getTime();
  }

  const mSlash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mSlash) {
    const d = Number(mSlash[1]);
    const m = Number(mSlash[2]);
    let y = Number(mSlash[3]);
    if (y > 2400) y -= 543;
    const dt = new Date(y, m - 1, d);
    return Number.isNaN(dt.getTime()) ? 0 : dt.getTime();
  }

  return 0;
}

function numericSuffix(id: string): number {
  const m = id.match(/(\d+)(?!.*\d)/);
  return m ? Number(m[1]) : 0;
}

export function sortNotifications(list: AppNotification[]) {
  return [...list].sort((a, b) => {
    const tb = Number.isFinite(Number(b.sortTs)) ? Number(b.sortTs) : toTimestamp(b.date);
    const ta = Number.isFinite(Number(a.sortTs)) ? Number(a.sortTs) : toTimestamp(a.date);
    if (tb !== ta) return tb - ta;
    const imp = (b.important ? 1 : 0) - (a.important ? 1 : 0);
    if (imp !== 0) return imp;
    const idb = numericSuffix(b.id);
    const ida = numericSuffix(a.id);
    if (idb !== ida) return idb - ida;
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
