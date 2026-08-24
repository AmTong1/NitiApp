import React from 'react';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import { 
  Platform, 
  View, 
  TouchableOpacity, 
  Text, 
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { showAlert } from './src/components/GlobalAlert';

async function requestPermission() {
  if (Platform.OS === 'android') {
    // สำหรับ Android Emulator และ device ใหม่ ไม่ต้องขอ permission สำหรับ Downloads
    console.log('Android platform detected, allowing download without permission');
    return true;
  }
  return true;
}

const downloadPDF = async () => {
  // Show loading
  showAlert('กำลังเตรียมดาวน์โหลด...', 'กรุณารอสักครู่');
  
  const hasPermission = await requestPermission();
  if (!hasPermission) {
    return showAlert(
      'ไม่มีสิทธิ์ในการดาวน์โหลดไฟล์', 
      'กรุณาอนุญาตการเข้าถึงไฟล์ในการตั้งค่าแอป'
    );
  }

  try {
    // ใช้ IP address ที่ถูกต้องสำหรับ Android Emulator
    const baseUrl = Platform.OS === 'android' 
      ? 'http://10.0.2.2:3000'      // สำหรับ Android Emulator
      : 'http://192.168.2.12:3000'; // สำหรับ device จริง

    console.log('Connecting to:', baseUrl);
    
    const response = await fetch(`${baseUrl}/generate-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '25 กรกฎาคม 2568',
        fullName: 'นายสมชาย ใจดี',
        houseNumber: '99/12',
        contactAddress: '99/12 หมู่บ้านกาญจน์กนกวิลล์ 12',
        phone: '0891234567',
        Amount: '12',
        totalAmount: '2,400',
        installment: '200',
        firstPaymentDate: '1 สิงหาคม 2568',
        signDate: '25 กรกฎาคม 2568'
      }),
    });

    const resJson = await response.json();
    
    // สร้าง filename พร้อม timestamp
    const timestamp = new Date().getTime();
    const filename = `receipt-${timestamp}.pdf`;
    
    // Download path - ใช้ DocumentDirectory ที่เข้าถึงได้แน่นอน
    const downloadPath = `${RNFS.DocumentDirectoryPath}/${filename}`;
    
    console.log('Download path:', downloadPath);
    
    // Download the PDF file
    const downloadResult = await RNFS.downloadFile({
      fromUrl: resJson.url,
      toFile: downloadPath,
      progressInterval: 1000,
      begin: (res) => {
        console.log('Download started', res);
      },
      progress: (res) => {
        const progress = (res.bytesWritten / res.contentLength) * 100;
        console.log(`Progress: ${progress}%`);
      }
    }).promise;

    if (downloadResult.statusCode === 200) {
      // แสดงข้อความสำเร็จ
      const successMessage = `ดาวน์โหลดสำเร็จ! 🎉\n\nไฟล์: ${filename}\nบันทึกในแอปแล้ว`;
        
      showAlert(
        'ดาวน์โหลดสำเร็จ!',
        successMessage,
        [
          {
            text: 'เปิดไฟล์',
            onPress: () => {
              // เปิดไฟล์ด้วย share dialog
              const shareOptions = {
                title: 'เปิดไฟล์ PDF',
                url: `file://${downloadPath}`,
                type: 'application/pdf',
              };
              Share.open(shareOptions).catch((error) => {
                console.log('Share error:', error);
                showAlert('ข้อผิดพลาด', 'ไม่สามารถเปิดไฟล์ได้');
              });
            }
          },
          {
            text: 'แชร์ไฟล์',
            onPress: () => {
              const shareOptions = {
                title: 'แชร์ใบแจ้งชำระเงิน',
                url: `file://${downloadPath}`,
                type: 'application/pdf',
              };
              Share.open(shareOptions).catch((error) => {
                console.log('Share error:', error);
              });
            }
          },
          { text: 'ตกลง', style: 'default' }
        ]
      );
    } else {
      showAlert('ข้อผิดพลาด', 'ไม่สามารถดาวน์โหลดไฟล์ได้');
    }
  } catch (error) {
    console.error('Download error:', error);
    showAlert('ข้อผิดพลาด', 'เกิดข้อผิดพลาดในการดาวน์โหลด');
  }
};

const App = () => {
  // ฟังก์ชันดูไฟล์ที่ดาวน์โหลดแล้ว
  const viewDownloadedFiles = async () => {
    try {
      const downloadDir = RNFS.DocumentDirectoryPath;
      
      const files = await RNFS.readDir(downloadDir);
      const pdfFiles = files
        .filter(file => file.name.includes('receipt') && file.name.endsWith('.pdf'))
        .filter(file => file.mtime) // กรองไฟล์ที่มี mtime
        .sort((a, b) => (b.mtime!.getTime() - a.mtime!.getTime())) // เรียงตามวันที่ใหม่สุด
        .slice(0, 10); // เอาแค่ 10 ไฟล์ล่าสุด

      if (pdfFiles.length === 0) {
        showAlert('ไม่มีไฟล์', 'ยังไม่มีไฟล์ PDF ที่ดาวน์โหลด');
        return;
      }

      // แสดงรายการไฟล์
      const fileList = pdfFiles.map((file, index) => {
        const date = file.mtime!.toLocaleDateString('th-TH');
        const time = file.mtime!.toLocaleTimeString('th-TH', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        return `${index + 1}. ${file.name}\n   ${date} ${time}`;
      }).join('\n\n');

      showAlert(
        'ไฟล์ที่ดาวน์โหลดแล้ว',
        fileList,
        [
          {
            text: 'เปิดไฟล์ล่าสุด',
            onPress: () => {
              const latestFile = pdfFiles[0];
              const shareOptions = {
                title: 'เปิดไฟล์ PDF',
                url: `file://${latestFile.path}`,
                type: 'application/pdf',
              };
              Share.open(shareOptions).catch((error) => {
                console.log('Share error:', error);
                showAlert('ข้อผิดพลาด', 'ไม่สามารถเปิดไฟล์ได้');
              });
            }
          },
          { text: 'ปิด', style: 'cancel' }
        ]
      );
    } catch (error) {
      console.error('Error reading files:', error);
      showAlert('ข้อผิดพลาด', 'ไม่สามารถอ่านไฟล์ได้');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>ใบแจ้งชำระเงิน</Text>
        <Text style={styles.subtitle}>กาญจน์กนกวิลล์ 12</Text>
        
        <TouchableOpacity 
          style={styles.downloadButton} 
          onPress={downloadPDF}
          activeOpacity={0.8}
        >
          <View style={styles.buttonContent}>
            <Text style={styles.downloadIcon}>⬇️</Text>
            <Text style={styles.buttonText}>ดาวน์โหลด PDF</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.viewFilesButton} 
          onPress={viewDownloadedFiles}
          activeOpacity={0.8}
        >
          <View style={styles.buttonContent}>
            <Text style={styles.downloadIcon}>📁</Text>
            <Text style={styles.buttonText}>ดูไฟล์ที่ดาวน์โหลด</Text>
          </View>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 40,
    textAlign: 'center',
  },
  downloadButton: {
    backgroundColor: '#28a745',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    minWidth: 200,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  viewFilesButton: {
    backgroundColor: '#17a2b8',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    minWidth: 200,
    marginTop: 15,
  },
});

export default App;
