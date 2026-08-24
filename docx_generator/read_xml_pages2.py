import zipfile
import xml.etree.ElementTree as ET
import glob
import re
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

files = glob.glob(r"C:\Users\tanut\Downloads\*V1.10.docx")
files = [f for f in files if '~$' not in f]
docx_path = files[0]

try:
    with zipfile.ZipFile(docx_path) as docx:
        xml_content = docx.read('word/document.xml')
        
    tree = ET.fromstring(xml_content)
    ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    
    page_num = 1
    items = []
    
    # We will walk the tree manually to maintain state
    # Ignore <w:sdt> elements entirely (they contain the TOC)
    
    def process_element(elem, in_sdt=False):
        global page_num
        
        # If we enter an SDT, we mark it, but we still process its children
        # EXCEPT for our heading matches. We don't want to match headings inside SDT.
        is_sdt = in_sdt or elem.tag == '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}sdt'
        
        if elem.tag == '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}lastRenderedPageBreak':
            page_num += 1
        elif elem.tag == '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}br':
            if elem.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}type') == 'page':
                page_num += 1
                
        if elem.tag == '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p' and not is_sdt:
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
                                
        for child in elem:
            process_element(child, is_sdt)

    body = tree.find('w:body', ns)
    process_element(body)
    
    with io.open("d:/upgit/proj/docx_generator/xml_pages2.txt", "w", encoding='utf-8') as f:
        for k, v in items:
            f.write(f"{k}::::{v}\n")
    print(f"Extracted {len(items)} items!")
except Exception as e:
    print(f"Error: {e}")
