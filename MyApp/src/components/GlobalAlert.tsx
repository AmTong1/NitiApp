import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';

type AlertButton = {
  text: string;
  style?: 'cancel' | 'destructive' | 'default';
  onPress?: () => void;
};

type AlertInfo = {
  title: string;
  message?: string;
  buttons?: AlertButton[];
};

type IconType = 'warning' | 'error' | 'success' | 'info';

let _show: ((info: AlertInfo) => void) | null = null;

export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
) {
  _show?.({ title, message, buttons });
}

function detectType(title: string, buttons?: AlertButton[]): IconType {
  const t = title.toLowerCase();
  if (
    t.includes('สำเร็จ') ||
    t.includes('เรียบร้อย') ||
    t.includes('บันทึกสำเร็จ') ||
    t.includes('คัดลอกแล้ว')
  )
    return 'success';
  if (
    t.includes('ผิดพลาด') ||
    t.includes('ล้มเหลว') ||
    t.includes('ไม่สำเร็จ') ||
    t.includes('error') ||
    t.includes('ไม่สามารถ') ||
    t.includes('ไม่ได้รับ') ||
    t.includes('ไม่พบ') ||
    t.includes('ซ้ำ') ||
    t.includes('หมดเวลา') ||
    t.includes('ปฏิเสธ')
  )
    return 'error';
  if (buttons?.some(b => b.style === 'destructive')) return 'error';
  return 'warning';
}

const ICON_MAP: Record<
  IconType,
  { name: string; color: string; bg: string }
> = {
  warning: { name: 'warning', color: '#F59E0B', bg: '#FEF3C7' },
  error: { name: 'alert-circle', color: '#EF5350', bg: '#FEE2E2' },
  success: { name: 'checkmark-circle', color: '#47B263', bg: '#DCFCE7' },
  info: { name: 'information-circle', color: '#3B82F6', bg: '#DBEAFE' },
};

const ICON_BG_STYLE: Record<IconType, object> = {
  warning: { backgroundColor: '#FEF3C7' },
  error: { backgroundColor: '#FEE2E2' },
  success: { backgroundColor: '#DCFCE7' },
  info: { backgroundColor: '#DBEAFE' },
};

const OK_BTN_STYLE: Record<IconType, object> = {
  warning: { backgroundColor: '#4F46E5' },
  error: { backgroundColor: '#EF5350' },
  success: { backgroundColor: '#47B263' },
  info: { backgroundColor: '#4F46E5' },
};

export const GlobalAlertModal: React.FC<{ darkMode?: boolean }> = ({
  darkMode,
}) => {
  const [info, setInfo] = useState<AlertInfo | null>(null);

  useEffect(() => {
    _show = setInfo;
    return () => {
      _show = null;
    };
  }, []);

  const close = useCallback(() => setInfo(null), []);

  if (!info) return null;

  const colors = {
    cardBg: darkMode ? '#1E1E1E' : '#FFFFFF',
    text: darkMode ? '#FFFFFF' : '#333333',
    subtext: darkMode ? '#CCCCCC' : '#6B7280',
    line: darkMode ? '#333333' : '#E5E7EB',
  };

  const iconType = detectType(info.title, info.buttons);
  const icon = ICON_MAP[iconType];
  const iconBgStyle = ICON_BG_STYLE[iconType];
  const okBtnStyle = OK_BTN_STYLE[iconType];

  const hasButtons = info.buttons && info.buttons.length > 0;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={close}
    >
      <View style={s.backdrop}>
        <View
          style={[
            s.card,
            { backgroundColor: colors.cardBg, borderColor: colors.line },
          ]}
        >
          {}
          <View style={s.iconRow}>
            <View style={[s.iconCircle, iconBgStyle]}>
              <Ionicons name={icon.name as any} size={28} color={icon.color} />
            </View>
          </View>

          {}
          <Text style={[s.title, { color: colors.text }]}>{info.title}</Text>

          {}
          {!!info.message && (
            <Text style={[s.message, { color: colors.subtext }]}>
              {info.message}
            </Text>
          )}

          {}
          {hasButtons ? (
            <View style={s.btnRow}>
              {info.buttons!.map((btn, i) => {
                const isCancel = btn.style === 'cancel';
                const isDestructive = btn.style === 'destructive';
                return (
                  <TouchableOpacity
                    key={i}
                    activeOpacity={0.85}
                    style={[
                      s.btn,
                      isCancel
                        ? s.btnCancel
                        : isDestructive
                          ? s.btnDestructive
                          : s.btnPrimary,
                    ]}
                    onPress={() => {
                      close();
                      btn.onPress?.();
                    }}
                  >
                    {isDestructive && (
                      <Ionicons
                        name="trash-outline"
                        size={16}
                        color="#fff"
                        style={s.btnIcon}
                      />
                    )}
                    <Text
                      style={[
                        s.btnText,
                        isCancel ? s.btnCancelText : s.btnWhiteText,
                      ]}
                    >
                      {btn.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <TouchableOpacity
              style={[s.okBtn, okBtnStyle]}
              onPress={close}
              activeOpacity={0.85}
            >
              <Text style={s.okBtnText}>OK</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  iconRow: { marginBottom: 12 },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  okBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 40,
    minWidth: 120,
    alignItems: 'center',
  },
  okBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  btnRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 4,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  btnCancel: { borderWidth: 1, borderColor: '#D1D5DB' },
  btnDestructive: { backgroundColor: '#EF5350' },
  btnPrimary: { backgroundColor: '#4F46E5' },
  btnText: { fontSize: 15, fontWeight: '700' },
  btnCancelText: { color: '#6B7280' },
  btnWhiteText: { color: '#fff' },
  btnIcon: { marginRight: 6 },
});
