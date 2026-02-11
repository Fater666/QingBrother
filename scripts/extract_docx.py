# -*- coding: utf-8 -*-
import zipfile
import xml.etree.ElementTree as ET
import sys
import os

path = os.path.join(os.path.dirname(__file__), '..', 'docs', 'privacy-policy-template.docx')
with zipfile.ZipFile(path, 'r') as z:
    xml_content = z.read('word/document.xml').decode('utf-8')

root = ET.fromstring(xml_content)
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
parts = []
for e in root.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t'):
    if e.text:
        parts.append(e.text)
    if e.tail:
        parts.append(e.tail)
text = ''.join(parts)
out_path = os.path.join(os.path.dirname(__file__), '..', 'docs', 'privacy-policy-template-extracted.txt')
with open(out_path, 'w', encoding='utf-8') as f:
    f.write(text)
print('Written to', out_path)
print(text[:3000])
