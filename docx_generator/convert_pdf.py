import win32com.client
import os
import glob
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

try:
    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False

    files = glob.glob(r"C:\Users\tanut\Downloads\*V1.10.docx")
    files = [f for f in files if '~$' not in f]
    
    doc_path = os.path.abspath(files[0])
    pdf_path = os.path.abspath(r"C:\Users\tanut\Downloads\เล่มโปรเจ็ค-V1.10.pdf")
    
    print(f"Opening {doc_path}")
    doc = word.Documents.Open(doc_path, ReadOnly=True)
    
    print(f"Saving as {pdf_path}")
    doc.SaveAs(pdf_path, FileFormat=17) # 17 is wdFormatPDF
    
    doc.Close(False)
    word.Quit()
    print("Done")
    
except Exception as e:
    print(f"Error: {e}")
    try:
        word.Quit()
    except:
        pass
