import RNFS from 'react-native-fs';
import FileViewer from 'react-native-file-viewer';
import ReactNativeBlobUtil from 'react-native-blob-util';

import { Linking, Platform } from 'react-native';
import { showAlert } from '../../components/GlobalAlert';

function decodeFileName(name?: string | null) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  try {
    return decodeURIComponent(raw.replace(/\+/g, '%20'));
  } catch {
    return raw;
  }
}

function extractExt(raw?: string | null) {
  const value = decodeFileName(raw);
  if (!value) return '';
  const clean = value.split('?')[0].split('#')[0];
  const match = clean.match(/\.([a-z0-9]{1,8})$/i);
  return match?.[1]?.toLowerCase() || '';
}

function extFromMime(mimeType?: string | null) {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('msword')) return 'doc';
  if (mime.includes('wordprocessingml')) return 'docx';
  if (mime.includes('ms-excel')) return 'xls';
  if (mime.includes('spreadsheetml')) return 'xlsx';
  if (mime.includes('csv')) return 'csv';
  if (mime.includes('powerpoint')) return 'ppt';
  if (mime.includes('presentationml')) return 'pptx';
  if (mime.includes('text/plain')) return 'txt';
  return '';
}

function buildLocalFileName(displayName?: string, sourceUrl?: string, mimeType?: string | null) {
  const decodedName = decodeFileName(displayName);
  const ext = extractExt(decodedName) || extractExt(sourceUrl) || extFromMime(mimeType) || 'bin';
  const baseName = decodeFileName(decodedName || `file_${Date.now()}`)
    .replace(/\.[a-z0-9]{1,8}$/i, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || `file_${Date.now()}`;
  return `${baseName}.${ext}`;
}

async function buildUniqueAndroidDownloadTarget(fileName: string) {
  const safeName = String(fileName || `file_${Date.now()}`).replace(/[\\/:*?"<>|]/g, '_');
  const dir = ReactNativeBlobUtil.fs.dirs.DownloadDir;
  const dot = safeName.lastIndexOf('.');
  const base = dot > 0 ? safeName.slice(0, dot) : safeName;
  const ext = dot > 0 ? safeName.slice(dot) : '';

  const firstPath = `${dir}/${safeName}`;
  const firstExists = await ReactNativeBlobUtil.fs.exists(firstPath);
  if (!firstExists) {
    return { title: safeName, path: firstPath };
  }

  for (let i = 1; i <= 200; i++) {
    const candidateName = `${base}_${i}${ext}`;
    const candidatePath = `${dir}/${candidateName}`;
    const exists = await ReactNativeBlobUtil.fs.exists(candidatePath);
    if (!exists) {
      return { title: candidateName, path: candidatePath };
    }
  }

  const fallbackName = `${base}_${Date.now()}${ext}`;
  return { title: fallbackName, path: `${dir}/${fallbackName}` };
}

export async function openAttachmentFromUrl(url: string, displayName?: string, mimeType?: string | null) {
  const sourceUrl = encodeURI(String(url || '').trim());
  if (!sourceUrl) throw new Error('INVALID_URL');

  const fileName = buildLocalFileName(displayName, sourceUrl, mimeType);
  const localPath = `${RNFS.CachesDirectoryPath}/${fileName}`;

  try {
    const res = await RNFS.downloadFile({ fromUrl: sourceUrl, toFile: localPath }).promise;
    if (res.statusCode && res.statusCode >= 400) throw new Error(`Download failed: ${res.statusCode}`);

    await FileViewer.open(localPath, { showOpenWithDialog: true, displayName: decodeFileName(displayName) || fileName });
  } catch (err: any) {
    console.log('FileViewer failed, trying Linking:', err);

    if (err?.message?.includes('No app associated')) {
      showAlert(
        'ไม่พบแอปเปิดไฟล์',
        'เครื่องของคุณไม่มีแอปสำหรับเปิดไฟล์ประเภทนี้',
        [
          { text: 'ดาวน์โหลดไฟล์ผ่าน Browser', onPress: () => Linking.openURL(sourceUrl).catch(() => {}) },
          { text: 'ตกลง' },
        ]
      );
      return;
    }

    try {
      await Linking.openURL(sourceUrl);
    } catch {
      throw err;
    }
  }
}

export async function openPdfFromUrl(url: string, displayName?: string) {
  await openAttachmentFromUrl(url, displayName || 'document.pdf', 'application/pdf');
}

export async function openPdfLocal(localPath: string, displayName?: string) {
  await FileViewer.open(localPath, { showOpenWithDialog: true, displayName });
}

export async function downloadOriginalAttachment(
  url: string,
  displayName?: string,
  mimeType?: string | null,
  onProgress?: (percent: number) => void,
) {
  const sourceUrl = encodeURI(String(url || '').trim());
  if (!sourceUrl) throw new Error('INVALID_URL');

  const fileName = buildLocalFileName(displayName, sourceUrl, mimeType);

  if (Platform.OS === 'android') {
    const target = await buildUniqueAndroidDownloadTarget(fileName);
    const task = ReactNativeBlobUtil
      .config({
        fileCache: false,
        addAndroidDownloads: {
          useDownloadManager: true,
          notification: true,
          title: target.title,
          description: 'Downloading file',
          path: target.path,
          mime: mimeType || undefined,
          mediaScannable: true,
        },
      })
      .fetch('GET', sourceUrl);

    task.progress({ interval: 180 }, (received, total) => {
      if (!onProgress || !total) return;
      const percent = Math.max(0, Math.min(100, Math.round((received / total) * 100)));
      onProgress(percent);
    });

    await task;
    if (onProgress) onProgress(100);
    return target.path;
  }

  const downloadPath = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/${fileName}`;
  const task = ReactNativeBlobUtil
    .config({
      fileCache: true,
      path: downloadPath,
    })
    .fetch('GET', sourceUrl);

  task.progress({ interval: 180 }, (received, total) => {
    if (!onProgress || !total) return;
    const percent = Math.max(0, Math.min(100, Math.round((received / total) * 100)));
    onProgress(percent);
  });

  await task;
  if (onProgress) onProgress(100);
  return downloadPath;
}