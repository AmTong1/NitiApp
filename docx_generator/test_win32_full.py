import win32com.client
import os
import glob
import sys
import io
import re

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

try:
    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False

    files = glob.glob(r"C:\Users\tanut\Downloads\*V1.10.docx")
    files = [f for f in files if '~$' not in f]
    
    doc_path = os.path.abspath(files[0])
    print(f"Opening {doc_path}")
    doc = word.Documents.Open(doc_path, ReadOnly=True)

    items = []
    
    for i in range(1, doc.Paragraphs.Count + 1):
        p = doc.Paragraphs(i)
        text = p.Range.Text.strip()
        if not text:
            continue
            
        page_num = p.Range.Information(3) # wdActiveEndPageNumber
        
        # We need front matter
        if text in ['บทคัดย่อ', 'บทคัดย่อภาษาไทย', 'บทคัดย่อภาษาอังกฤษ', 'ABSTRACT', 'กิตติกรรมประกาศ', 'สารบัญ', 'บรรณานุกรม']:
            items.append((text, page_num))
            
        # Chapters
        if re.match(r'^บทที่\s*\d+$', text):
            items.append((text, page_num))
            
        # Sections
        m = re.match(r'^(\d+\.\d+)\s', text)
        if m:
            items.append((m.group(1), page_num))
            
        # Figures
        m = re.match(r'(รูปที่?\s*\d+\.\d+)', text)
        if m:
            items.append((m.group(1).strip(), page_num))
            
        # Tables
        m = re.match(r'(ตารางที่?\s*[\d.]+)', text)
        if m:
            items.append((m.group(1).strip().rstrip(':'), page_num))

    doc.Close(False)
    word.Quit()
    
    # Save to file
    with io.open(r"d:\upgit\proj\docx_generator\win32_pages.txt", "w", encoding='utf-8') as f:
        for k, v in items:
            f.write(f"{k}::::{v}\n")
    print("Done scanning all paragraphs.")
    
except Exception as e:
    print(f"Error: {e}")
    try:
        word.Quit()
    except:
        pass
