import zipfile
from xml.etree import ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"

def docx_text(path):
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml")
    root = ET.fromstring(xml)
    paras = []
    for p in root.iter(f"{W}p"):
        texts = [t.text for t in p.iter(f"{W}t") if t.text]
        if texts:
            paras.append("".join(texts))
    return "\n".join(paras)

def pptx_slides(path):
    with zipfile.ZipFile(path) as z:
        slides = sorted(
            n for n in z.namelist() if n.startswith("ppt/slides/slide") and n.endswith(".xml")
        )
    out = []
    for i, name in enumerate(slides, 1):
        with zipfile.ZipFile(path) as z:
            root = ET.fromstring(z.read(name))
        texts = [t.text.strip() for t in root.iter(f"{A}t") if t.text and t.text.strip()]
        out.append(f"--- SLIDE {i} ---\n" + "\n".join(texts))
    return "\n\n".join(out)

if __name__ == "__main__":
    base = r"c:\Users\tahsi\OneDrive\Desktop"
    docx = base + r"\Yapay Sinir Ağları ile Kalp Hastalığı Risk Tahmini Proje Raporu.docx"
    pptx = base + r"\kalp-hastaligi-sunum.pptx"
    with open(r"c:\Users\tahsi\OneDrive\Desktop\sertifika\docs\refs_extracted.txt", "w", encoding="utf-8") as f:
        f.write("=== DOCX ===\n")
        f.write(docx_text(docx))
        f.write("\n\n=== PPTX ===\n")
        f.write(pptx_slides(pptx))
