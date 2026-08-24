# -*- coding: utf-8 -*-
import sys, io, glob, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import pdfplumber

files = glob.glob(r"C:\Users\tanut\Downloads\*V1.7.pdf")
files = [f for f in files if '~$' not in f]
filepath = files[0]

pdf = pdfplumber.open(filepath)

# ---- Scan ALL pages for ALL items ----
all_items = []  # (page, type, key, full_text)

for i, page in enumerate(pdf.pages):
    text = page.extract_text()
    if not text:
        continue
    pn = i + 1
    
    for line in text.split('\n'):
        line = line.strip()
        if not line:
            continue
            
        # Skip if line is from existing TOC (pages 8-9 based on earlier scan)
        if 8 <= pn <= 9:
            continue
        
        # Figures
        m = re.match(r'(รูปที่?\s*\d+\.\d+)\s*(.*)', line)
        if m:
            all_items.append((pn, 'fig', m.group(1).strip(), line))
        
        # Tables  
        m = re.match(r'(ตารางที่?\s*[\d.]+[:\s]?)', line)
        if m:
            all_items.append((pn, 'tbl', m.group(1).strip(), line))

        # Chapter starts
        if re.match(r'^บทที่\s*\d+$', line):
            all_items.append((pn, 'ch', line, line))
        
        # Section headings (only on content pages, not TOC)
        m = re.match(r'^(\d+\.\d+)\s+(.+)', line)
        if m:
            sec = m.group(1)
            all_items.append((pn, 'sec', sec, line))
        
        # Front matter
        if line in ['บทคัดย่อ', 'ABSTRACT', 'กิตติกรรมประกาศ', 'บรรณานุกรม']:
            all_items.append((pn, 'front', line, line))

# Deduplicate: keep first occurrence
seen = set()
unique = []
for item in all_items:
    key = (item[1], item[2])  # (type, key)
    if key not in seen:
        seen.add(key)
        unique.append(item)

print(f"Total unique items: {len(unique)}")
for pn, typ, key, full in sorted(unique, key=lambda x: x[0]):
    print(f"  Page {pn:3d} [{typ:5s}] {key} -> {full[:80]}")

pdf.close()
