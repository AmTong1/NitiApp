import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  GestureResponderEvent,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import type { Asset } from 'react-native-image-picker';
import { useI18n } from '../../../i18n';

type ChatCameraModalProps = {
  visible: boolean;
  onClose: () => void;
  onCapture: (asset: Asset) => void;
};

const MAX_RECORD_SECONDS = 120;
const ZOOM_DRAG_DISTANCE = 220;
const MAX_MANUAL_ZOOM = 8;
const CAPTURE_PRESS_RETENTION = {
  top: 340,
  left: 120,
  right: 120,
  bottom: 180,
};

function normalizeFileUri(path: string) {
  if (!path) return '';
  if (path.startsWith('file://')) return path;
  return `file://${path}`;
}

function formatRecordTime(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(Number(totalSeconds || 0)));
  const mm = String(Math.floor(safe / 60)).padStart(2, '0');
  const ss = String(safe % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

const ChatCameraModal: React.FC<ChatCameraModalProps> = ({
  visible,
  onClose,
  onCapture,
}) => {
  const { t } = useI18n();
  const cameraRef = useRef<Camera>(null);
  const longPressTriggeredRef = useRef(false);
  const holdReleaseRequestedRef = useRef(false);
  const holdStartYRef = useRef(0);
  const holdStartZoomRef = useRef(1);
  const zoomRef = useRef(1);
  const captureTouchActiveRef = useRef(false);
  const recordingActionRef = useRef<'send' | 'discard'>('send');

  const [cameraPosition, setCameraPosition] = useState<'back' | 'front'>('back');
  const [mode, setMode] = useState<'photo' | 'video'>('photo');
  const [permissionLoading, setPermissionLoading] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);
  const [hasMicPermission, setHasMicPermission] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [cameraError, setCameraError] = useState('');
  const [flashMode, setFlashMode] = useState<'off' | 'on' | 'auto'>('auto');
  const [zoom, setZoom] = useState(1);

  const backDevice = useCameraDevice('back');
  const frontDevice = useCameraDevice('front');
  const device = useMemo(() => {
    if (cameraPosition === 'front') return frontDevice || backDevice;
    return backDevice || frontDevice;
  }, [cameraPosition, backDevice, frontDevice]);

  const zoomAvailable = useMemo(() => {
    if (!device) return false;
    const minZoom = Math.max(device.minZoom ?? 1, 1);
    const deviceMaxZoom = Math.max(device.maxZoom ?? minZoom, minZoom);
    const maxZoom = Math.max(minZoom, Math.min(deviceMaxZoom, MAX_MANUAL_ZOOM));
    return maxZoom - minZoom > 0.02;
  }, [device]);

  const clampZoom = useCallback((value: number) => {
    const minZoom = device?.minZoom ?? 1;
    const deviceMaxZoom = Math.max(device?.maxZoom ?? minZoom, minZoom);
    const maxZoom = Math.max(minZoom, Math.min(deviceMaxZoom, MAX_MANUAL_ZOOM));
    const safe = Number.isFinite(value) ? value : minZoom;
    return Math.min(maxZoom, Math.max(minZoom, safe));
  }, [device]);

  const cycleFlashMode = useCallback(() => {
    setFlashMode(prev => {
      if (prev === 'off') return 'on';
      if (prev === 'on') return 'auto';
      return 'off';
    });
  }, []);

  const requestPermissions = useCallback(async () => {
    setPermissionLoading(true);
    setCameraError('');
    try {
      const camCurrent = await Camera.getCameraPermissionStatus();
      const camStatus = camCurrent === 'granted'
        ? camCurrent
        : await Camera.requestCameraPermission();

      const micCurrent = await Camera.getMicrophonePermissionStatus();
      const micStatus = micCurrent === 'granted'
        ? micCurrent
        : await Camera.requestMicrophonePermission();

      const hasCam = camStatus === 'granted';
      const hasMic = micStatus === 'granted';

      setHasCameraPermission(hasCam);
      setHasMicPermission(hasMic);

      if (!hasCam) {
        setCameraError(t('chatCannotOpenCamera'));
      }
    } catch {
      setHasCameraPermission(false);
      setHasMicPermission(false);
      setCameraError(t('chatCannotOpenCamera'));
    } finally {
      setPermissionLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!visible) return;
    setMode('photo');
    setCaptureBusy(false);
    setIsRecording(false);
    setRecordSeconds(0);
    setCameraError('');
    setFlashMode('auto');
    captureTouchActiveRef.current = false;
    requestPermissions().catch(() => {});
  }, [visible, requestPermissions]);

  useEffect(() => {
    if (!visible || !device) return;
    const minZoom = device.minZoom ?? 1;
    const neutralZoom = Number(device.neutralZoom || minZoom);
    const nextZoom = clampZoom(neutralZoom);
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
  }, [visible, device, clampZoom]);

  useEffect(() => {
    if (!isRecording) return;
    const timer = setInterval(() => {
      setRecordSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isRecording]);

  const stopRecordingWithAction = useCallback(async (action: 'send' | 'discard' = 'send') => {
    if (!isRecording || !cameraRef.current) return;
    recordingActionRef.current = action;
    try {
      await cameraRef.current.stopRecording();
    } catch {
      setIsRecording(false);
      recordingActionRef.current = 'send';
    }
  }, [isRecording]);

  const stopRecording = useCallback(async () => {
    await stopRecordingWithAction('send');
  }, [stopRecordingWithAction]);

  useEffect(() => {
    if (!isRecording) return;
    if (recordSeconds < MAX_RECORD_SECONDS) return;
    stopRecording().catch(() => {});
  }, [isRecording, recordSeconds, stopRecording]);

  const takePhoto = useCallback(async () => {
    if (!cameraRef.current || captureBusy || isRecording) return;
    setCaptureBusy(true);
    setCameraError('');
    try {
      const photo = await cameraRef.current.takePhoto({
        flash: flashMode,
        enableShutterSound: true,
      });
      const uri = normalizeFileUri(String(photo?.path || ''));
      if (!uri) throw new Error('PHOTO_URI_EMPTY');

      onCapture({
        uri,
        type: 'image/jpeg',
        fileName: `camera_photo_${Date.now()}.jpg`,
      });
      onClose();
    } catch {
      setCameraError(t('chatCannotOpenCamera'));
    } finally {
      setCaptureBusy(false);
    }
  }, [captureBusy, flashMode, isRecording, onCapture, onClose, t]);

  const startVideoRecording = useCallback(async () => {
    if (!cameraRef.current || captureBusy || isRecording) return;
    if (!hasMicPermission) {
      const mic = await Camera.requestMicrophonePermission().catch(() => 'denied');
      const ok = mic === 'granted';
      setHasMicPermission(ok);
      if (!ok) {
        setCameraError('ต้องอนุญาตไมโครโฟนเพื่ออัดวิดีโอ');
        return;
      }
    }

    setCameraError('');
    setRecordSeconds(0);
    recordingActionRef.current = 'send';
    setIsRecording(true);

    try {
      cameraRef.current.startRecording({
        flash: flashMode === 'on' ? 'on' : 'off',
        fileType: 'mp4',
        onRecordingFinished: (video) => {
          setIsRecording(false);
          longPressTriggeredRef.current = false;
          holdReleaseRequestedRef.current = false;
          const action = recordingActionRef.current;
          recordingActionRef.current = 'send';

          if (action === 'discard') {
            onClose();
            return;
          }

          const uri = normalizeFileUri(String(video?.path || ''));
          if (!uri) return;
          onCapture({
            uri,
            type: 'video/mp4',
            fileName: `camera_video_${Date.now()}.mp4`,
          });
          onClose();
        },
        onRecordingError: () => {
          setIsRecording(false);
          longPressTriggeredRef.current = false;
          holdReleaseRequestedRef.current = false;
          recordingActionRef.current = 'send';
          setCameraError(t('chatCannotOpenCamera'));
        },
      });

      if (holdReleaseRequestedRef.current) {
        stopRecordingWithAction('send').catch(() => {});
      }
    } catch {
      setIsRecording(false);
      longPressTriggeredRef.current = false;
      holdReleaseRequestedRef.current = false;
      recordingActionRef.current = 'send';
      setCameraError(t('chatCannotOpenCamera'));
    }
  }, [captureBusy, flashMode, hasMicPermission, isRecording, onCapture, onClose, stopRecordingWithAction, t]);

  const onPressCapture = useCallback(() => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }

    if (isRecording) {
      stopRecordingWithAction('send').catch(() => {});
      return;
    }

    if (mode === 'photo') {
      takePhoto().catch(() => {});
      return;
    }

    startVideoRecording().catch(() => {});
  }, [mode, takePhoto, isRecording, startVideoRecording, stopRecordingWithAction]);

  const onPressInCapture = useCallback((e: GestureResponderEvent) => {
    captureTouchActiveRef.current = true;
    holdStartYRef.current = Number(e?.nativeEvent?.pageY || 0);
    holdStartZoomRef.current = zoomRef.current;
  }, []);

  const onLongPressCapture = useCallback((e: GestureResponderEvent) => {
    if (permissionLoading || captureBusy || !hasCameraPermission || !device || isRecording) return;
    holdStartYRef.current = Number(e?.nativeEvent?.pageY || holdStartYRef.current || 0);
    holdStartZoomRef.current = zoomRef.current;
    longPressTriggeredRef.current = true;
    holdReleaseRequestedRef.current = false;
    startVideoRecording().catch(() => {});
  }, [permissionLoading, captureBusy, hasCameraPermission, device, isRecording, startVideoRecording]);

  const onPressMoveCapture = useCallback((e: GestureResponderEvent) => {
    if (!captureTouchActiveRef.current || !device) return;
    if (!isRecording && !longPressTriggeredRef.current) return;

    const currentY = Number(e?.nativeEvent?.pageY || 0);
    const startY = holdStartYRef.current || currentY;
    const dy = startY - currentY;

    if (!zoomAvailable) return;

    const minZoom = Math.max(device.minZoom ?? 1, 1);
    const deviceMaxZoom = Math.max(device.maxZoom ?? minZoom, minZoom);
    const maxZoom = Math.max(minZoom, Math.min(deviceMaxZoom, MAX_MANUAL_ZOOM));
    const zoomRange = maxZoom - minZoom;
    if (zoomRange <= 0) return;

    const ratio = dy / ZOOM_DRAG_DISTANCE;
    const candidate = holdStartZoomRef.current + ratio * zoomRange;
    const nextZoom = clampZoom(candidate);

    if (Math.abs(nextZoom - zoomRef.current) < 0.01) return;
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
  }, [device, clampZoom, isRecording, zoomAvailable]);

  const onPressOutCapture = useCallback(() => {
    captureTouchActiveRef.current = false;

    if (!longPressTriggeredRef.current) return;

    if (isRecording) {
      stopRecordingWithAction('send').catch(() => {});
    } else {
      holdReleaseRequestedRef.current = true;
    }

    longPressTriggeredRef.current = false;
  }, [isRecording, stopRecordingWithAction]);

  const closeModal = useCallback(() => {
    if (isRecording) {
      stopRecordingWithAction('discard').catch(() => {});
    }
    captureTouchActiveRef.current = false;
    longPressTriggeredRef.current = false;
    holdReleaseRequestedRef.current = false;
    onClose();
  }, [isRecording, onClose, stopRecordingWithAction]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={closeModal}
    >
      <View style={styles.container}>
        {hasCameraPermission && device ? (
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={visible}
            photo
            video
            audio={hasMicPermission}
            zoom={zoom}
            enableZoomGesture
          />
        ) : (
          <View style={styles.permissionWrap}>
            <Ionicons name="camera-outline" size={44} color="#D7E0ED" />
            <Text style={styles.permissionTitle}>ไม่สามารถใช้งานกล้องได้</Text>
            <Text style={styles.permissionText}>{cameraError || t('chatCannotOpenCamera')}</Text>
            <TouchableOpacity
              style={styles.permissionBtn}
              onPress={() => requestPermissions().catch(() => {})}
              activeOpacity={0.85}
            >
              <Text style={styles.permissionBtnText}>ลองใหม่</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.topBar}>
          <TouchableOpacity style={styles.topIconBtn} onPress={closeModal} activeOpacity={0.85}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.topRightGroup}>
            <TouchableOpacity
              style={styles.topIconBtn}
              onPress={cycleFlashMode}
              activeOpacity={0.85}
            >
              <Ionicons
                name={flashMode === 'off' ? 'flash-off' : 'flash'}
                size={20}
                color={flashMode === 'off' ? '#FFFFFF' : '#FFD60A'}
              />
              <Text style={styles.flashModeText}>{flashMode === 'auto' ? 'A' : ''}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.topIconBtn}
              onPress={() => setCameraPosition(prev => (prev === 'back' ? 'front' : 'back'))}
              activeOpacity={0.85}
            >
              <Ionicons name="camera-reverse-outline" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {isRecording ? (
          <View style={styles.recordBadge}>
            <View style={styles.recordDot} />
            <Text style={styles.recordText}>{formatRecordTime(recordSeconds)}</Text>
          </View>
        ) : null}

        {isRecording ? (
          <View style={styles.zoomBadge}>
            <Text style={styles.zoomText}>{`${zoom.toFixed(1)}x`}</Text>
          </View>
        ) : null}

        <View style={styles.bottomBar}>
          <View style={styles.zoomRow}>
            {[0.5, 1, 2].map(z => {
              // Hide 0.5x if device doesn't support it at all
              if (z === 0.5 && (device?.minZoom ?? 1) > 0.8) return null;
              const isActive = Math.abs(zoom - z) < 0.1;
              return (
                <TouchableOpacity
                  key={z}
                  activeOpacity={0.8}
                  style={[styles.zoomBtn, isActive ? styles.zoomBtnActive : null]}
                  onPress={() => {
                    const nextZoom = clampZoom(z);
                    setZoom(nextZoom);
                    zoomRef.current = nextZoom;
                  }}
                >
                  <Text style={[styles.zoomBtnText, isActive ? styles.zoomBtnTextActive : null]}>{z}x</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.modeRow}>
            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.modeChip, mode === 'photo' ? styles.modeChipActive : null]}
              onPress={() => !isRecording && setMode('photo')}
              disabled={isRecording}
            >
              <Text style={styles.modeChipText}>{t('chatCameraTakePhoto')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.modeChip, mode === 'video' ? styles.modeChipActive : null]}
              onPress={() => setMode('video')}
            >
              <Text style={styles.modeChipText}>{t('chatCameraTakeVideo')}</Text>
            </TouchableOpacity>
          </View>

          <Pressable
            style={[
              styles.captureBtn,
              (mode === 'video' || isRecording) ? styles.captureBtnVideo : null,
            ]}
            onPressIn={onPressInCapture}
            onPress={onPressCapture}
            onLongPress={onLongPressCapture}
            onPressOut={onPressOutCapture}
            onTouchMove={onPressMoveCapture}
            delayLongPress={180}
            pressRetentionOffset={CAPTURE_PRESS_RETENTION}
            disabled={permissionLoading || captureBusy || !hasCameraPermission || !device}
          >
            {permissionLoading || captureBusy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : isRecording ? (
              <View style={styles.stopSquare} />
            ) : (
              <View style={[styles.captureInner, mode === 'video' ? styles.captureInnerVideo : null]} />
            )}
          </Pressable>

          <View style={styles.hintWrap}>
            <Text style={styles.hintText}>
              {isRecording
                ? (zoomAvailable
                  ? 'ปล่อยเพื่อหยุด • เลื่อนขึ้น/ลงเพื่อซูม'
                  : 'ปล่อยเพื่อหยุดการอัดวิดีโอ')
                : (mode === 'photo'
                  ? 'แตะเพื่อถ่ายรูป'
                  : 'แตะหรือกดค้างเพื่อเริ่มอัดวิดีโอ')}
            </Text>
          </View>
        </View>

        {!!cameraError && hasCameraPermission ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{cameraError}</Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
};

export default React.memo(ChatCameraModal);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#05080D',
  },
  permissionWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: '#0A0F19',
  },
  permissionTitle: {
    marginTop: 12,
    color: '#E6EEF9',
    fontSize: 18,
    fontWeight: '700',
  },
  permissionText: {
    marginTop: 6,
    color: '#B4C2D6',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  permissionBtn: {
    marginTop: 16,
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: '#2D8CFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 16,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(6,12,21,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  flashModeText: {
    position: 'absolute',
    bottom: 3,
    right: 5,
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  recordBadge: {
    position: 'absolute',
    top: 72,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.56)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  recordDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
  },
  recordText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  zoomBadge: {
    position: 'absolute',
    top: 112,
    alignSelf: 'center',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  zoomText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingBottom: 20,
    paddingTop: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.34)',
  },
  zoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  zoomBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  zoomBtnActive: {
    backgroundColor: 'rgba(255,214,10,0.85)',
    borderColor: '#FFD60A',
  },
  zoomBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  zoomBtnTextActive: {
    color: '#000000',
  },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  modeChip: {
    minWidth: 118,
    height: 38,
    borderRadius: 19,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  modeChipActive: {
    backgroundColor: 'rgba(45, 140, 255, 0.45)',
    borderColor: 'rgba(117, 184, 255, 0.95)',
  },
  modeChipText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  captureBtn: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  captureBtnVideo: {
    backgroundColor: '#FF2D55',
    borderColor: 'rgba(255,148,165,0.9)',
  },
  captureInner: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#FFFFFF',
  },
  captureInnerVideo: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FF2D55',
  },
  stopSquare: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  hintWrap: {
    marginTop: 10,
    minHeight: 20,
  },
  hintText: {
    color: '#E9EEF7',
    fontSize: 13,
    fontWeight: '600',
  },
  errorBanner: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 150,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(107, 22, 22, 0.86)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  errorText: {
    color: '#FFD8D8',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
  },
});
