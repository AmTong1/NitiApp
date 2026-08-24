import win32com.client
import os
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8') if sys.version_info[0] > 2 else sys.stdout

try:
    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    
    target = os.path.abspath(r"C:\Users\tanut\Downloads\temp_v1.10.docx")
    
    print(f"Opening {target}")
    doc = word.Documents.Open(target)
    
    # Insert a blank page at the beginning
    range_obj = doc.Range(0, 0)
    range_obj.InsertBreak(Type=7) # wdPageBreak
    
    # Go to the beginning again
    toc_range = doc.Range(0, 0)
    
    print("Inserting TOC...")
    # Add Table of Contents
    doc.TablesOfContents.Add(Range=toc_range, UseHeadingStyles=True, UpperHeadingLevel=1, LowerHeadingLevel=3)
    
    # Update it
    doc.TablesOfContents(1).Update()
    
    # Save as new file
    out_path = os.path.abspath(r"C:\Users\tanut\Downloads\เล่มโปรเจ็ค-V1.10_AutoTOC.docx")
    print(f"Saving to {out_path}")
    doc.SaveAs(out_path)
    
    doc.Close(False)
    word.Quit()
    print("Done")
except Exception as e:
    print(f"Error: {e}")
    try:
        word.Quit()
    except:
        pass
