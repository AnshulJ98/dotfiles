---
name: pdf-images
description: Extracts text, tables, and images from PDFs, merges and splits them, and OCRs scanned pages with local CLI tools (pdftotext, qpdf, tesseract, pypdf). Use whenever a task involves a .pdf file.
---

# PDF Operations

## Tools Available

- `pdftotext` — text extraction (`/opt/homebrew/bin/pdftotext`, installed)
- `qpdf` — merge/split/rotate/encrypt PDFs (installed via Homebrew)
- `tesseract` — OCR for scanned PDFs (installed)
- `imagemagick` — image extraction and processing (installed)
- `poppler` — PDF rendering utilities (pdftotext, pdfimages, pdfinfo)
- Python with `pypdf` via `uvx` for complex operations (PyPDF2 is deprecated; its code now lives in `pypdf`)

## Text Extraction

```bash
# Full text
pdftotext document.pdf -

# Specific pages
pdftotext -f 2 -l 5 document.pdf -

# Preserve layout
pdftotext -layout document.pdf -
```

## Merge / Split

```bash
# Merge
qpdf --empty --pages file1.pdf file2.pdf -- merged.pdf

# Extract pages 3-7
qpdf input.pdf --pages . 3-7 -- output.pdf

# Split into individual pages
qpdf --split-pages input.pdf page-%d.pdf
```

## OCR (Scanned PDFs)

```bash
# Convert PDF to images first
pdftoppm -r 300 -png input.pdf page

# OCR each page
tesseract page-1.png output -l eng

# Or process all pages
for f in page-*.png; do tesseract "$f" "${f%.png}-text" -l eng; done
```

## Extract Images

```bash
pdfimages -png document.pdf extracted-images/img
```

## Python Operations (for complex tasks)

```bash
uvx --with pypdf python3 -c "
from pypdf import PdfReader
for page in PdfReader('doc.pdf').pages:
    print(page.extract_text())
"
```

## Rules

- Never read PDF files directly with the Read tool — use pdftotext or the methods above
- For tables in PDFs, pdftotext -layout often preserves structure better
- OCR only when pdftotext returns empty or garbled text (scanned document)
