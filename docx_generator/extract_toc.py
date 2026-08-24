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
    doc = word.Documents.Open(target, ReadOnly=True)
    
    if doc.TablesOfContents.Count > 0:
        toc = doc.TablesOfContents(1)
        toc.Update()
        print("--- TOC ---")
        print(toc.Range.Text)
    else:
        print("No TOC found in document.")
        
    doc.Close(False)
    word.Quit()
    print("Done")
    
except Exception as e:
    print(f"Error: {e}")
    try:
        word.Quit()
    except:
        pass
