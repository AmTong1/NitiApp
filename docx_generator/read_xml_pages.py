import zipfile
import xml.etree.ElementTree as ET
import glob
import re
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

files = glob.glob(r"C:\Users\tanut\Downloads\*V1.10.docx")
files = [f for f in files if '~$' not in f]

if not files:
    print("No V1.10 docx found.")
    sys.exit(0)

docx_path = files[0]
print(f"Reading {docx_path}")

try:
    with zipfile.ZipFile(docx_path) as docx:
        xml_content = docx.read('word/document.xml')
        
    tree = ET.fromstring(xml_content)
    
    # Namespaces
    ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    
    page_num = 1 # We start at page 1.
    
    # We will iterate through all elements in the body
    body = tree.find('w:body', ns)
    
    items = []
    
    for elem in body.iter():
        # Check for page breaks
        if elem.tag == '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}lastRenderedPageBreak':
            page_num += 1
        elif elem.tag == '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}br':
            if elem.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}type') == 'page':
                page_num += 1
                
        # Check for text in paragraphs
        if elem.tag == '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p':
            texts = []
            for t in elem.findall('.//w:t', ns):
                if t.text:
                    texts.append(t.text)
            full_text = "".join(texts).strip()
            
            if full_text:
                if full_text in ['บทคัดย่อ', 'บทคัดย่อภาษาไทย', 'บทคัดย่อภาษาอังกฤษ', 'ABSTRACT', 'กิตติกรรมประกาศ', 'สารบัญ', 'บรรณานุกรม']:
                    items.append((full_text, page_num))
                elif re.match(r'^บทที่\s*\d+$', full_text):
                    items.append((full_text, page_num))
                else:
                    m = re.match(r'^(\d+\.\d+)\s', full_text)
                    if m:
                        items.append((m.group(1), page_num))
                    else:
                        m = re.match(r'(รูปที่?\s*\d+\.\d+)', full_text)
                        if m:
                            items.append((m.group(1).strip(), page_num))
                        else:
                            m = re.match(r'(ตารางที่?\s*[\d.]+)', full_text)
                            if m:
                                items.append((m.group(1).strip().rstrip(':'), page_num))

    # Print first 50 items
    for k, v in items[:50]:
        print(f"Page {v}: {k}")
        
    # Write all to a file to use later
    with io.open("d:/upgit/proj/docx_generator/xml_pages.txt", "w", encoding='utf-8') as f:
        for k, v in items:
            f.write(f"{k}::::{v}\n")
            
except Exception as e:
    print(f"Error: {e}")
