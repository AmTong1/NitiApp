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
    if not files:
        print("No V1.10 docx found.")
        sys.exit(0)
        
    doc_path = os.path.abspath(files[0])
    print(f"Opening {doc_path}")
    doc = word.Documents.Open(doc_path, ReadOnly=True)

    count = 0
    for i in range(1, min(100, doc.Paragraphs.Count + 1)):
        p = doc.Paragraphs(i)
        text = p.Range.Text.strip()
        if text.startswith("บทที่") or text.startswith("รูปที่") or text.startswith("ตารางที่"):
            page_num = p.Range.Information(3) # wdActiveEndPageNumber
            print(f"Page {page_num}: {text}")
            count += 1
            if count > 20: break

    doc.Close(False)
    word.Quit()
    print("Done")
except Exception as e:
    print(f"Error: {e}")
    try:
        word.Quit()
    except:
        pass
