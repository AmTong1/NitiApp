import notifee, { AndroidImportance } from '@notifee/react-native';

export type DeviceNotificationCategory = 'announcement' | 'repair' | 'payment';

export type DeviceNotificationPayload = {
  title: string;
  body?: string;
  category?: DeviceNotificationCategory;
};

const CHANNEL_ID = 'niti-smart-alerts';
let initialized = false;

function colorForCategory(category?: DeviceNotificationCategory) {
  switch (category) {
    case 'announcement':
      return '#FB8C00';
    case 'repair':
      return '#1D4ED8';
    case 'payment':
      return '#16A34A';
    default:
      return '#64748B';
  }
}

export async function setupDeviceNotifications() {
  if (initialized) return;

  await notifee.requestPermission();
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Niti Smart Alerts',
    importance: AndroidImportance.HIGH,
    vibration: true,
  });

  initialized = true;
}

export async function sendDeviceNotification(payload: DeviceNotificationPayload) {
  if (!payload?.title) return;

  try {
    await setupDeviceNotifications();
  } catch {
    return;
  }

  await notifee.displayNotification({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: payload.title,
    body: payload.body,
    android: {
      channelId: CHANNEL_ID,
      smallIcon: 'ic_launcher',
      pressAction: { id: 'default' },
      importance: AndroidImportance.HIGH,
      color: colorForCategory(payload.category),
      timestamp: Date.now(),
      showTimestamp: true,
    },
  });
}
