import win32com.client
import os
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

try:
    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    
    target = os.path.abspath(r"C:\Users\tanut\Downloads\temp_v1.10.docx")
    
    print(f"Opening {target}")
    doc = word.Documents.Open(target)
    
    pdf_path = os.path.abspath(r"C:\Users\tanut\Downloads\เล่มโปรเจ็ค-V1.10.pdf")
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
