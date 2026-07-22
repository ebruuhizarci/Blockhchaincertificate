from docx import Document
from pathlib import Path

p = Path(r"C:\Users\tahsi\OneDrive\Desktop\zbeubilgisayardiplomacalismasisablon2024.docx")
d = Document(str(p))
out = Path(r"C:\Users\tahsi\OneDrive\Desktop\sertifika\docs\template_dump.txt")
lines = []
for i, para in enumerate(d.paragraphs):
    t = para.text.replace("\n", " ")
    if t.strip():
        lines.append(f"{i}\t{para.style.name}\t{t[:120]}")
out.write_text("\n".join(lines), encoding="utf-8")
print("written", len(lines))
