import RNFS from 'react-native-fs';
import FileViewer from 'react-native-file-viewer';

import { Linking } from 'react-native';
import { showAlert } from '../../components/GlobalAlert';

export async function openPdfFromUrl(url: string, displayName?: string) {
  // Sanitize filename
  const safeName = (displayName || 'document').replace(/[^a-zA-Z0-9.-]/g, '_');
  const fileName = safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`;
  const localPath = `${RNFS.CachesDirectoryPath}/${fileName}`;

  try {
    const res = await RNFS.downloadFile({ fromUrl: url, toFile: localPath }).promise;
    if (res.statusCode && res.statusCode >= 400) throw new Error(`Download failed: ${res.statusCode}`);
    
    await FileViewer.open(localPath, { showOpenWithDialog: true });
  } catch (err: any) {
    // If FileViewer fails (no app), try opening in browser/external handler
    console.log('FileViewer failed, trying Linking:', err);
    
    if (err?.message?.includes('No app associated')) {
       showAlert(
         'ไม่พบแอปเปิดไฟล์', 
         'เครื่องของคุณไม่มีแอปสำหรับเปิดไฟล์ PDF กรุณาติดตั้งแอป (เช่น Adobe Acrobat)',
         [
           { text: 'ดาวน์โหลดไฟล์ผ่าน Browser', onPress: () => Linking.openURL(url).catch(() => {}) },
           { text: 'ตกลง' }
         ]
       );
    } else {
       // Silent fallback or rethrow
       try {
         await Linking.openURL(url);
       } catch {
         throw err;
       }
    }
  }
}

export async function openPdfLocal(localPath: string, displayName?: string) {
  await FileViewer.open(localPath, { showOpenWithDialog: true, displayName });
}