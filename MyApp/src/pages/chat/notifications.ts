import notifee, { AndroidImportance } from '@notifee/react-native';
import { Platform } from 'react-native';

export async function initNotifications() {
  await notifee.requestPermission();
  if (Platform.OS === 'android') {
    await notifee.createChannel({ id: 'chat', name: 'Chat Messages', importance: AndroidImportance.HIGH, sound: 'default', vibration: true, lights: true });
  }
}

export async function showMessageNotification(opts: { title: string; body: string; data?: Record<string, string>; }) {
  await notifee.displayNotification({
    title: opts.title,
    body: opts.body,
    android: { channelId: 'chat', smallIcon: 'ic_stat_name', pressAction: { id: 'default' } },
    ios: { sound: 'default' },
    data: opts.data,
  });
}

export async function setAppBadge(count: number) { await notifee.setBadgeCount(count); }