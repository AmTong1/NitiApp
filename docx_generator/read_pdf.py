# -*- coding: utf-8 -*-
import sys, io, glob, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import pdfplumber

# Use V1.7 PDF as reference for page numbers
files = glob.glob(r"C:\Users\tanut\Downloads\*V1.7.pdf")
if not files:
    files = glob.glob(r"C:\Users\tanut\Downloads\*V1.5.pdf")
files = [f for f in files if '~$' not in f]
filepath = files[0]
print(f"Reading PDF: {filepath}")

pdf = pdfplumber.open(filepath)
print(f"Total pages: {len(pdf.pages)}")

# Search for key headings, figures, tables on each page
heading_pages = {}
figure_pages = {}
table_pages = {}

for i, page in enumerate(pdf.pages):
    text = page.extract_text()
    if not text:
        continue
    page_num = i + 1
    
    lines = text.split('\n')
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Match chapter headings
        if line.startswith('บทที่'):
            heading_pages[line[:20]] = page_num
        
        # Match section headings like "1.1", "2.3" etc
        m = re.match(r'^(\d+\.\d+)\s', line)
        if m:
            key = m.group(1)
            if key not in heading_pages:
                heading_pages[key] = page_num
        
        # Match front matter
        for kw in ['บทคัดย่อ', 'ABSTRACT', 'กิตติกรรมประกาศ', 'สารบัญ', 'บรรณานุกรม']:
            if line == kw or line.startswith(kw):
                if kw not in heading_pages:
                    heading_pages[kw] = page_num
        
        # Match figures
        if line.startswith('รูปที่') or line.startswith('รูปที '):
            m2 = re.match(r'(รูปที่?\s*\d+\.\d+)', line)
            if m2:
                figure_pages[m2.group(1).strip()] = page_num
        
        # Match tables
        if line.startswith('ตารางที่') or line.startswith('ตารางที '):
            m3 = re.match(r'(ตารางที่?\s*[\d.]+)', line)
            if m3:
                key = m3.group(1).strip()
                if key not in table_pages:
                    table_pages[key] = page_num

print("\n=== HEADING PAGES ===")
for k, v in sorted(heading_pages.items(), key=lambda x: x[1]):
    print(f"  Page {v}: {k}")

print("\n=== FIGURE PAGES ===")
for k, v in sorted(figure_pages.items(), key=lambda x: x[1]):
    print(f"  Page {v}: {k}")

print("\n=== TABLE PAGES ===")
for k, v in sorted(table_pages.items(), key=lambda x: x[1]):
    print(f"  Page {v}: {k}")

pdf.close()
