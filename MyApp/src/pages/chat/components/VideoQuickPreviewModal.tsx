import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { WebView } from 'react-native-webview';
import { useI18n } from '../../../i18n';

type Props = {
  visible: boolean;
  url: string;
  fallbackUrls?: string[];
  onClose: () => void;
  onDownload: () => void;
  onShare: () => void;
};

function escapeHtmlAttr(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildVideoHtml(videoUrl: string) {
  const safeUrl = escapeHtmlAttr(videoUrl);
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #090e16;
      }
      .wrap {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: radial-gradient(circle at top, #1a2432 0%, #090e16 62%);
      }
      video {
        width: 100%;
        height: 100%;
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        background: #000;
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <video id="player" controls controlsList="nofullscreen noremoteplayback" disablepictureinpicture autoplay playsinline webkit-playsinline preload="auto" src="${safeUrl}"></video>
    </div>
    <script>
      (function () {
        var video = document.getElementById('player');
        if (!video) return;

        var tryPlay = function () {
          var promise = video.play();
          if (promise && promise.catch) {
            promise.catch(function () {
              try {
                video.muted = true;
                var retry = video.play();
                if (retry && retry.catch) retry.catch(function () {});
              } catch (e) {}
            });
          }
        };

        video.muted = false;
        video.playsInline = true;
        document.addEventListener('DOMContentLoaded', function () {
          tryPlay();
          setTimeout(tryPlay, 120);
          setTimeout(tryPlay, 420);
        });
        window.addEventListener('focus', tryPlay);
      })();
    </script>
  </body>
</html>`;
}

function VideoQuickPreviewModalImpl({
  visible,
  url,
  fallbackUrls,
  onClose,
  onDownload,
  onShare,
}: Props) {
  const { t } = useI18n();
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failedAll, setFailedAll] = useState(false);

  const topInset = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 8 : 12;

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
    return out.slice(0, 6);
  }, [url, fallbackUrls]);

  const currentUrl = sourceCandidates[candidateIndex] || '';

  useEffect(() => {
    if (!visible) return;
    setCandidateIndex(0);
    setLoading(true);
    setFailedAll(false);
  }, [visible, url, fallbackUrls]);

  useEffect(() => {
    if (!visible) return;
    if (currentUrl) return;
    setFailedAll(true);
    setLoading(false);
  }, [visible, currentUrl]);

  const moveToNextCandidate = useCallback(() => {
    setCandidateIndex((prev) => {
      if (prev < sourceCandidates.length - 1) {
        return prev + 1;
      }
      setFailedAll(true);
      return prev;
    });
  }, [sourceCandidates.length]);

  const onPreviewError = useCallback(() => {
    setLoading(false);
    moveToNextCandidate();
  }, [moveToNextCandidate]);

  const webSource = useMemo(() => {
    if (!currentUrl) return undefined;
    return {
      html: buildVideoHtml(currentUrl),
      baseUrl: currentUrl,
    };
  }, [currentUrl]);

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <View style={[styles.topBar, { paddingTop: topInset }]}>
          <TouchableOpacity style={styles.circleBtn} onPress={onClose} activeOpacity={0.85}>
            <Ionicons name="close" size={25} color="#F1F6FF" />
          </TouchableOpacity>

          <View style={styles.topBarRight}>
            <TouchableOpacity style={styles.circleBtn} onPress={onShare} activeOpacity={0.85}>
              <Ionicons name="share-social-outline" size={19} color="#F1F6FF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.circleBtn} onPress={onDownload} activeOpacity={0.85}>
              <Ionicons name="download-outline" size={19} color="#F1F6FF" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.playerArea}>
          {failedAll || !webSource ? (
            <View style={styles.failedWrap}>
              <Ionicons name="alert-circle-outline" size={36} color="#FCA5A5" />
              <Text style={styles.failedText}>{t('chatVideoPreviewFailed')}</Text>
              <View style={styles.failedActionRow}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={onDownload} activeOpacity={0.85}>
                  <Ionicons name="download-outline" size={16} color="#D6E4F3" />
                  <Text style={styles.secondaryBtnText}>{t('save')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.videoCard}>
              <View style={styles.videoFrame}>
                <WebView
                  key={`video_${candidateIndex}_${currentUrl}`}
                  originWhitelist={['*']}
                  source={webSource}
                  allowsInlineMediaPlayback
                  mediaPlaybackRequiresUserAction={false}
                  allowsFullscreenVideo={false}
                  javaScriptEnabled
                  domStorageEnabled
                  mixedContentMode="always"
                  setSupportMultipleWindows={false}
                  onLoadStart={() => {
                    setLoading(true);
                    setFailedAll(false);
                  }}
                  onLoadEnd={() => setLoading(false)}
                  onError={onPreviewError}
                  onHttpError={onPreviewError}
                  style={styles.webview}
                />
              </View>

              {loading ? (
                <View style={styles.loadingOverlay}>
                  <ActivityIndicator size="small" color="#E2E8F0" />
                  <Text style={styles.loadingText}>{t('chatLoading')}</Text>
                </View>
              ) : null}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const VideoQuickPreviewModal = React.memo(VideoQuickPreviewModalImpl);

export default VideoQuickPreviewModal;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0B1018',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  circleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20, 30, 44, 0.62)',
    borderWidth: 1,
    borderColor: 'rgba(201, 219, 237, 0.24)',
  },
  playerArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'android' ? 60 : 66,
    paddingBottom: 20,
  },
  videoCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoFrame: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(186, 206, 228, 0.22)',
    backgroundColor: '#000',
  },
  webview: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5, 9, 14, 0.35)',
    gap: 8,
    borderRadius: 22,
  },
  loadingText: {
    color: '#DDE8F3',
    fontSize: 12,
    fontWeight: '600',
  },
  failedWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(186, 206, 228, 0.18)',
    backgroundColor: 'rgba(18, 26, 37, 0.72)',
    paddingHorizontal: 18,
  },
  failedText: {
    marginTop: 10,
    color: '#F5B4B4',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  failedActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(174, 193, 212, 0.3)',
    backgroundColor: 'rgba(54, 68, 84, 0.6)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  secondaryBtnText: {
    color: '#E1EDF9',
    fontSize: 12,
    fontWeight: '600',
  },
});
