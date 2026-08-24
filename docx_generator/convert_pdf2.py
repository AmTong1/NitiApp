import win32com.client
import os
import glob
import sys
import io
import shutil

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

try:
    files = glob.glob(r"C:\Users\tanut\Downloads\*V1.10.docx")
    files = [f for f in files if '~$' not in f]
    
    source = os.path.abspath(files[0])
    target = os.path.abspath(r"C:\Users\tanut\Downloads\temp_v1.10.docx")
    
    shutil.copy2(source, target)
    print(f"Copied to {target}")

    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    
    print(f"Opening {target}")
    doc = word.Documents.Open(target)
    
    pdf_path = os.path.abspath(r"C:\Users\tanut\Downloads\เล่มโปรเจ็ค-V1.10.pdf")
    print(f"Saving as {pdf_path}")
    doc.SaveAs(pdf_path, FileFormat=17) # 17 is wdFormatPDF
    
    doc.Close(False)
    word.Quit()
    print("Done")
    
    # Try to clean up temp
    os.remove(target)
    
except Exception as e:
    print(f"Error: {e}")
    try:
        word.Quit()
    except:
        pass
