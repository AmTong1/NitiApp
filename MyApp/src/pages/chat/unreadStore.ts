import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'chat_unread_map';

type UnreadMap = Record<string, number>;

async function readMap(): Promise<UnreadMap> { try { const t = await AsyncStorage.getItem(KEY); return t ? JSON.parse(t) : {}; } catch { return {}; } }
async function writeMap(map: UnreadMap) { await AsyncStorage.setItem(KEY, JSON.stringify(map)); }

export async function getTotalUnread(): Promise<number> { const m = await readMap(); return Object.values(m).reduce((a, b) => a + b, 0); }
export async function getUnread(roomId: number) { const m = await readMap(); return m[String(roomId)] || 0; }
export async function incUnread(roomId: number) { const m = await readMap(); const k = String(roomId); m[k] = (m[k] || 0) + 1; await writeMap(m); return m; }
export async function clearUnread(roomId: number) { const m = await readMap(); const k = String(roomId); if (m[k]) { delete m[k]; await writeMap(m); } return m; }