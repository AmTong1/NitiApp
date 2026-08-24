import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Platform,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import Pdf from 'react-native-pdf';
import RNFS from 'react-native-fs';

type Props = {
  visible: boolean;
  url: string;
  fallbackUrls?: string[];
  displayName: string;
  fileSize?: number | null;
  onClose: () => void;
  onOpenExternal: () => void;
  onOpenInBrowser: () => void;
  onShare: () => void;
};

function formatFileSize(bytes?: number | null) {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

async function probeRemoteFileSize(remoteUrl: string): Promise<number | null> {
  try {
    const headRes = await fetch(remoteUrl, { method: 'HEAD' });
    const len = Number(headRes.headers.get('content-length') || 0);
    if (Number.isFinite(len) && len > 0) return len;
  } catch {
  }

  try {
    const rangeRes = await fetch(remoteUrl, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
    });

    const contentRange = String(rangeRes.headers.get('content-range') || '');
    const match = contentRange.match(/\/(\d+)\s*$/);
    if (match?.[1]) {
      const total = Number(match[1]);
      if (Number.isFinite(total) && total > 0) return total;
    }

    const len = Number(rangeRes.headers.get('content-length') || 0);
    if (Number.isFinite(len) && len > 0) return len;
  } catch {
  }

  return null;
}

function PdfQuickPreviewModalImpl({
  visible,
  url,
  fallbackUrls,
  displayName,
  fileSize,
  onClose,
  onOpenExternal,
  onOpenInBrowser,
  onShare,
}: Props) {
  const MAX_SOURCE_CANDIDATES = 4;
  const DOWNLOAD_TIMEOUT_MS = 12000;
  const LOAD_OVERLAY_FALLBACK_MS = 2200;

  const [loading, setLoading] = React.useState(true);
  const [failedAll, setFailedAll] = React.useState(false);
  const [pageInfo, setPageInfo] = React.useState<{ page: number; total: number } | null>(null);
  const [localUri, setLocalUri] = React.useState('');
  const [downloading, setDownloading] = React.useState(false);
  const [downloadProgress, setDownloadProgress] = React.useState<number | null>(null);
  const [fileSizeBytes, setFileSizeBytes] = React.useState<number | null>(null);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const enterTranslateY = useRef(new Animated.Value(20)).current;
  const closingRef = useRef(false);
  const downloadJobIdRef = useRef<number | null>(null);

  const sourceCandidates = useMemo(() => {
    const values = [url, ...(fallbackUrls || [])];
    const out: string[] = [];

    const push = (value?: string | null) => {
      const raw = String(value || '').trim();
      if (!raw) return;

      const normalized = raw.replace(/(\/(uploads|pdfs)\/[^?#]+?)\/+((?=$)|(?=[?#]))/i, '$1');
      if (!out.includes(normalized)) out.push(normalized);

      const encoded = encodeURI(normalized);
      if (encoded && !out.includes(encoded)) out.push(encoded);
    };

    values.forEach(push);
    return out.slice(0, MAX_SOURCE_CANDIDATES);
  }, [url, fallbackUrls, MAX_SOURCE_CANDIDATES]);

  const stopCurrentDownload = useCallback(() => {
    if (downloadJobIdRef.current == null) return;
    RNFS.stopDownload(downloadJobIdRef.current);
    downloadJobIdRef.current = null;
  }, []);

  const localCachePathFor = useCallback((remoteUrl: string) => {
    const safe = String(remoteUrl || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
    return `${RNFS.CachesDirectoryPath}/pdf_preview_${safe}.pdf`;
  }, []);

  const runDownloadWithTimeout = useCallback(async (
    task: ReturnType<typeof RNFS.downloadFile>,
    timeoutMs: number,
  ) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      const result = await new Promise<any>((resolve, reject) => {
        timeoutId = setTimeout(() => {
          RNFS.stopDownload(task.jobId);
          reject(new Error('DOWNLOAD_TIMEOUT'));
        }, timeoutMs);

        task.promise.then(resolve).catch(reject);
      });

      return result;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }, []);

  const waitForCacheWarmup = useCallback(async (localPath: string, tempPath: string) => {
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    let sawPartFile = false;
    let settledWithoutPartCount = 0;
    let previousPartSize = -1;
    let stagnantPartCount = 0;

    for (let i = 0; i < 30; i++) {
      const exists = await RNFS.exists(localPath);
      if (exists) {
        const st = await RNFS.stat(localPath).catch(() => null);
        if (Number(st?.size || 0) > 0) return true;
      }

      const partExists = await RNFS.exists(tempPath).catch(() => false);
      if (partExists) {
        sawPartFile = true;
        settledWithoutPartCount = 0;

        const partStat = await RNFS.stat(tempPath).catch(() => null);
        const partSize = Number(partStat?.size || 0);
        if (partSize > 0 && partSize === previousPartSize) {
          stagnantPartCount += 1;
        } else {
          stagnantPartCount = 0;
        }
        previousPartSize = partSize;

        if (stagnantPartCount >= 15) return false;
      }

      if (!partExists && !sawPartFile) {
        if (i < 6) {
          await sleep(100);
          continue;
        }
        return false;
      }

      if (!partExists && sawPartFile) {
        settledWithoutPartCount += 1;
        if (settledWithoutPartCount < 6) {
          await sleep(100);
          continue;
        }

        const settledExists = await RNFS.exists(localPath);
        if (!settledExists) return false;
        const settledStat = await RNFS.stat(localPath).catch(() => null);
        return Number(settledStat?.size || 0) > 0;
      }

      await sleep(100);
    }

    const exists = await RNFS.exists(localPath);
    if (!exists) return false;
    const st = await RNFS.stat(localPath).catch(() => null);
    return Number(st?.size || 0) > 0;
  }, []);

  const pdfSource = useMemo(() => {
    if (localUri) {
      return {
        uri: localUri,
        cache: true,
        expiration: 24 * 60 * 60,
      };
    }
    return null;
  }, [localUri]);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 170,
        useNativeDriver: true,
      }),
      Animated.timing(enterTranslateY, {
        toValue: 20,
        duration: 170,
        useNativeDriver: true,
      }),
    ]).start(() => {
      closingRef.current = false;
      onClose();
    });
  }, [backdropOpacity, enterTranslateY, onClose]);

  useEffect(() => {
    if (!visible) return;

    setLoading(true);
    setFailedAll(false);
    setPageInfo(null);
    setLocalUri('');
    setDownloading(false);
    setDownloadProgress(null);
    setFileSizeBytes(Number.isFinite(Number(fileSize)) && Number(fileSize) > 0 ? Number(fileSize) : null);

    backdropOpacity.setValue(0);
    enterTranslateY.setValue(20);

    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(enterTranslateY, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();

    return undefined;
  }, [
    visible,
    fileSize,
    sourceCandidates,
    backdropOpacity,
    enterTranslateY,
  ]);

  useEffect(() => {
    if (!visible || sourceCandidates.length === 0) {
      setLocalUri('');
      return;
    }

    let cancelled = false;

    (async () => {
      for (const candidateUrl of sourceCandidates) {
        if (cancelled) return;

        const localPath = localCachePathFor(candidateUrl);
        const tempPath = `${localPath}.part`;

        try {
          const exists = await RNFS.exists(localPath);
          if (exists) {
            const st = await RNFS.stat(localPath);
            if (!cancelled && Number(st?.size || 0) > 0) {
              setFileSizeBytes(Number(st.size || 0));
              setLocalUri(`file://${localPath}`);
              setDownloading(false);
              setDownloadProgress(null);
              return;
            }
          }

          const warmed = await waitForCacheWarmup(localPath, tempPath);
          if (warmed) {
            const st = await RNFS.stat(localPath);
            if (!cancelled && Number(st?.size || 0) > 0) {
              setFileSizeBytes(Number(st.size || 0));
              setLocalUri(`file://${localPath}`);
              setDownloading(false);
              setDownloadProgress(null);
              return;
            }
          }
        } catch {
        }

        try {
          const tempExistsBeforeDownload = await RNFS.exists(tempPath).catch(() => false);
          let activeTempPath = tempPath;

          if (tempExistsBeforeDownload) {
            const warmedAgain = await waitForCacheWarmup(localPath, tempPath);
            if (warmedAgain) {
              const st = await RNFS.stat(localPath).catch(() => null);
              if (!cancelled && Number(st?.size || 0) > 0) {
                setFileSizeBytes(Number(st?.size || 0));
                setLocalUri(`file://${localPath}`);
                setDownloading(false);
                setDownloadProgress(null);
                return;
              }
            }
            activeTempPath = `${localPath}.${Date.now()}.part`;
          }

          await RNFS.unlink(activeTempPath).catch(() => {});

          if (!(Number.isFinite(Number(fileSize)) && Number(fileSize) > 0)) {
            probeRemoteFileSize(candidateUrl).then((probedSize) => {
              if (cancelled) return;
              if (!Number.isFinite(Number(probedSize)) || Number(probedSize) <= 0) return;
              setFileSizeBytes(prev => (prev == null ? Number(probedSize) : prev));
            }).catch(() => {});
          }

          setDownloading(true);
          setDownloadProgress(0);

          const task = RNFS.downloadFile({
            fromUrl: candidateUrl,
            toFile: activeTempPath,
            background: false,
            discretionary: false,
            cacheable: true,
            progressInterval: 140,
            progressDivider: 0,
            progress: (evt) => {
              if (cancelled) return;
              const total = Number(evt.contentLength || 0);
              const written = Number(evt.bytesWritten || 0);
              if (total > 0) {
                const percent = Math.max(0, Math.min(100, Math.round((written / total) * 100)));
                setDownloadProgress(percent);
                setFileSizeBytes(prev => (prev == null ? total : prev));
              }
            },
          });

          downloadJobIdRef.current = task.jobId;
          const res = await runDownloadWithTimeout(task, DOWNLOAD_TIMEOUT_MS);
          downloadJobIdRef.current = null;

          if (cancelled) {
            await RNFS.unlink(activeTempPath).catch(() => {});
            return;
          }

          if (!res.statusCode || res.statusCode >= 400) {
            throw new Error(`DOWNLOAD_FAILED_${res.statusCode || 'UNKNOWN'}`);
          }

          const tempStat = await RNFS.stat(activeTempPath);
          if (Number(tempStat?.size || 0) <= 0) {
            throw new Error('EMPTY_PDF_FILE');
          }

          setFileSizeBytes(Number(tempStat.size || 0));

          await RNFS.unlink(localPath).catch(() => {});
          await RNFS.moveFile(activeTempPath, localPath);

          setLocalUri(`file://${localPath}`);
          setDownloading(false);
          setDownloadProgress(null);
          return;
        } catch (downloadErr) {
          downloadJobIdRef.current = null;
          await RNFS.unlink(tempPath).catch(() => {});
          const leftoverParts = await RNFS.readDir(RNFS.CachesDirectoryPath).catch(() => []);
          for (const entry of leftoverParts) {
            if (!entry.isFile()) continue;
            if (!entry.path.startsWith(localPath) || !entry.path.endsWith('.part')) continue;
            await RNFS.unlink(entry.path).catch(() => {});
          }
          continue;
        }
      }

      if (!cancelled) {
        setDownloading(false);
        setDownloadProgress(null);
        setFailedAll(true);
      }
    })();

    return () => {
      cancelled = true;
      stopCurrentDownload();
    };
  }, [
    visible,
    sourceCandidates,
    localCachePathFor,
    stopCurrentDownload,
    fileSize,
    waitForCacheWarmup,
    runDownloadWithTimeout,
    DOWNLOAD_TIMEOUT_MS,
  ]);

  useEffect(() => {
    if (!visible || !localUri || failedAll || !loading) return;

    const timer = setTimeout(() => {
      setLoading(false);
    }, LOAD_OVERLAY_FALLBACK_MS);

    return () => clearTimeout(timer);
  }, [visible, localUri, failedAll, loading, LOAD_OVERLAY_FALLBACK_MS]);

  const onNativePdfError = useCallback((err: any) => {
    console.warn('[PdfQuickPreviewModal] native pdf error', {
      localUri,
      error: err?.message || String(err || ''),
    });

    if (localUri) {
      const localPath = localUri.replace(/^file:\/\//, '');
      RNFS.unlink(localPath).catch(() => {});
      setLocalUri('');
    }

    setFailedAll(true);
    setLoading(false);
  }, [localUri]);

  if (!visible) return null;

  const topInset = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 44;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
      onRequestClose={requestClose}
    >
      <Animated.View style={{ flex: 1, backgroundColor: '#0D1518', opacity: backdropOpacity }}>
        <Animated.View
          style={{
            flex: 1,
            transform: [
              { translateY: enterTranslateY },
            ],
          }}
        >
          <View style={{ paddingTop: topInset + 8, paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#213238', flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D1518' }}>
            <Ionicons name="document-text-outline" size={19} color="#A7CFBE" />
            <Text style={{ marginLeft: 8, flex: 1, color: '#E7F1EC', fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
              {displayName || 'เอกสาร PDF'}
            </Text>
            <TouchableOpacity onPress={requestClose} style={{ padding: 4 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={20} color="#C7D8D1" />
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1, backgroundColor: '#101A1F' }}>
            {failedAll ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }}>
                <Ionicons name="document-lock-outline" size={34} color="#90A7A1" />
                <Text style={{ marginTop: 10, color: '#DCE9E4', fontSize: 14, fontWeight: '700', textAlign: 'center' }}>
                  พรีวิวไฟล์ไม่ได้ในหน้าต่างนี้
                </Text>
                <Text style={{ marginTop: 6, color: '#9FB3AD', fontSize: 12, textAlign: 'center' }}>
                  กดเปิดภายนอกเพื่อดูไฟล์ต่อได้ทันที
                </Text>
              </View>
            ) : !pdfSource ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }}>
                <ActivityIndicator size="small" color="#89B8A6" />
                <Text style={{ marginTop: 10, color: '#A7C2B8', fontSize: 12, textAlign: 'center' }}>
                  {downloading ? 'กำลังดาวน์โหลดไฟล์ก่อนเปิด...' : 'กำลังเตรียมพรีวิว...'}
                </Text>
                <Text style={{ marginTop: 4, color: '#9CB7AE', fontSize: 12, textAlign: 'center' }}>
                  ขนาดไฟล์: {formatFileSize(fileSizeBytes)}
                </Text>
                {downloading && downloadProgress != null ? (
                  <Text style={{ marginTop: 4, color: '#8FAEA3', fontSize: 12, textAlign: 'center' }}>
                    {downloadProgress}%
                  </Text>
                ) : null}
              </View>
            ) : (
              <>
                <Pdf
                  key={pdfSource.uri}
                  source={pdfSource}
                  trustAllCerts={false}
                  style={{ flex: 1, width: '100%', backgroundColor: '#101A1F' }}
                  onLoadComplete={(numberOfPages: number) => {
                    setLoading(false);
                    setPageInfo({ page: 1, total: numberOfPages || 0 });
                  }}
                  onPageChanged={(page: number, numberOfPages: number) => {
                    setLoading(false);
                    setPageInfo({ page, total: numberOfPages || 0 });
                  }}
                  onError={onNativePdfError}
                />

                {loading ? (
                  <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16,26,31,0.45)' }}>
                    <ActivityIndicator size="small" color="#89B8A6" />
                    <Text style={{ marginTop: 8, color: '#B5CDC4', fontSize: 12 }}>กำลังโหลดพรีวิว...</Text>
                  </View>
                ) : null}
              </>
            )}

            {pageInfo && pageInfo.total > 0 ? (
              <View
                style={{
                  position: 'absolute',
                  right: 12,
                  bottom: 12,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  backgroundColor: 'rgba(11,18,22,0.78)',
                  borderWidth: 1,
                  borderColor: '#355248',
                }}
                pointerEvents="none"
              >
                <Text style={{ color: '#E3F0EA', fontSize: 12, fontWeight: '800' }} numberOfLines={1}>
                  หน้า {pageInfo.page}/{pageInfo.total}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={{ paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#213238', flexDirection: 'row', gap: 8, backgroundColor: '#0D1518' }}>
            <TouchableOpacity
              onPress={onShare}
              activeOpacity={0.85}
              style={{ flex: 1, height: 42, borderRadius: 12, borderWidth: 1, borderColor: '#3B564C', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', backgroundColor: '#142027' }}
            >
              <Ionicons name="share-social-outline" size={16} color="#D2E5DD" />
              <Text style={{ marginLeft: 6, color: '#DCEDE6', fontSize: 13, fontWeight: '700' }}>แชร์</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onOpenInBrowser}
              activeOpacity={0.85}
              style={{ flex: 1.35, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', backgroundColor: '#5B8F79' }}
            >
              <Ionicons name="globe-outline" size={16} color="#fff" />
              <Text style={{ marginLeft: 6, color: '#fff', fontSize: 13, fontWeight: '800' }}>เปิดในเบราว์เซอร์</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onOpenExternal}
              activeOpacity={0.85}
              style={{ width: 44, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#446D5D' }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="open-outline" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const PdfQuickPreviewModal = React.memo(PdfQuickPreviewModalImpl);

export default PdfQuickPreviewModal;
