export type Page = 'login' | 'home' | 'qrcode' | 'notification' | 'admin' | 'call' | 'repairst'| 'reg'| 'chat' | 'announcement' | 'payment' | 'paymentDetail' | 'usermgr' | 'profile' | 'superadmin';

export type Announcement = {
  id?: number | string;
  date: string;
  title: string; 
  image: string; // uri
  important?: boolean;
  description?: string;
};

export type MenuItem = {
  label: string;
  onPress: () => void;
  showRedDot?: boolean; // NEW
};
