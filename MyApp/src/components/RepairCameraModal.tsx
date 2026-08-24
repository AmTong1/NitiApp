import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import type { Asset } from 'react-native-image-picker';

type RepairCameraModalProps = {
  visible: boolean;
  onClose: () => void;
  onCapture: (asset: Asset) => void;
};

const MAX_MANUAL_ZOOM = 8;

function normalizeFileUri(path: string) {
  if (!path) return '';
  if (path.startsWith('file://')) return path;
  return `file://${path}`;
}

const RepairCameraModal: React.FC<RepairCameraModalProps> = ({
  visible,
  onClose,
  onCapture,
}) => {
  const cameraRef = useRef<Camera>(null);

  const [cameraPosition, setCameraPosition] = useState<'back' | 'front'>('back');
  const [permissionLoading, setPermissionLoading] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [flashMode, setFlashMode] = useState<'off' | 'on' | 'auto'>('auto');
  const [zoom, setZoom] = useState(1);

  const backDevice = useCameraDevice('back');
  const frontDevice = useCameraDevice('front');
  const device = useMemo(() => {
    if (cameraPosition === 'front') return frontDevice || backDevice;
    return backDevice || frontDevice;
  }, [cameraPosition, backDevice, frontDevice]);

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

      const hasCam = camStatus === 'granted';
      setHasCameraPermission(hasCam);

      if (!hasCam) {
        setCameraError('ไม่ได้รับอนุญาตให้ใช้กล้อง กรุณาอนุญาตในการตั้งค่า');
      }
    } catch {
      setHasCameraPermission(false);
      setCameraError('ไม่สามารถเปิดกล้องได้');
    } finally {
      setPermissionLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    setCaptureBusy(false);
    setCameraError('');
    setFlashMode('auto');
    requestPermissions().catch(() => {});
  }, [visible, requestPermissions]);

  useEffect(() => {
    if (!visible || !device) return;
    const minZoom = device.minZoom ?? 1;
    const neutralZoom = Number(device.neutralZoom || minZoom);
    setZoom(clampZoom(neutralZoom));
  }, [visible, device, clampZoom]);

  const takePhoto = useCallback(async () => {
    if (!cameraRef.current || captureBusy) return;
    setCaptureBusy(true);
    setCameraError('');
    try {
      const photo = await cameraRef.current.takePhoto({
        flash: flashMode,
        enableShutterSound: true,
      });
      const uri = normalizeFileUri(String(photo?.path || ''));
      if (!uri) throw new Error('PHOTO_URI_EMPTY');

      const asset: Asset = {
        uri,
        type: 'image/jpeg',
        fileName: `repair_photo_${Date.now()}.jpg`,
      };
      onClose();
      onCapture(asset);
    } catch {
      setCameraError('ถ่ายรูปไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setCaptureBusy(false);
    }
  }, [captureBusy, flashMode, onCapture, onClose]);

  const closeModal = useCallback(() => {
    onClose();
  }, [onClose]);

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
            zoom={zoom}
            enableZoomGesture
          />
        ) : (
          <View style={styles.permissionWrap}>
            <Ionicons name="camera-outline" size={44} color="#D7E0ED" />
            <Text style={styles.permissionTitle}>ไม่สามารถใช้งานกล้องได้</Text>
            <Text style={styles.permissionText}>{cameraError || 'กรุณาอนุญาตการเข้าถึงกล้อง'}</Text>
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

        <View style={styles.bottomBar}>
          <View style={styles.zoomRow}>
            {[0.5, 1, 2].map(z => {
              if (z === 0.5 && (device?.minZoom ?? 1) > 0.8) return null;
              const isActive = Math.abs(zoom - z) < 0.1;
              return (
                <TouchableOpacity
                  key={z}
                  activeOpacity={0.8}
                  style={[styles.zoomBtn, isActive ? styles.zoomBtnActive : null]}
                  onPress={() => setZoom(clampZoom(z))}
                >
                  <Text style={[styles.zoomBtnText, isActive ? styles.zoomBtnTextActive : null]}>{z}x</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.modeLabel}>ถ่ายรูป</Text>

          <TouchableOpacity
            style={styles.captureBtn}
            onPress={takePhoto}
            disabled={permissionLoading || captureBusy || !hasCameraPermission || !device}
            activeOpacity={0.85}
          >
            {permissionLoading ? (
              <ActivityIndicator size="small" color="#333" />
            ) : (
              <View style={styles.captureInner} />
            )}
          </TouchableOpacity>

          <Text style={styles.hintText}>แตะเพื่อถ่ายรูป</Text>
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

export default React.memo(RepairCameraModal);

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
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingBottom: 24,
    paddingTop: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.34)',
  },
  zoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
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
  modeLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
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
  captureInner: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#FFFFFF',
  },
  hintText: {
    marginTop: 10,
    color: '#E9EEF7',
    fontSize: 13,
    fontWeight: '600',
  },
  errorBanner: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 180,
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
