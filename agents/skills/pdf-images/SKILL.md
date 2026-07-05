---
name: pdf-images
description: Use this skill whenever the user wants to do anything with PDF files. This includes reading/extracting text/tables from PDFs, combining/merging/splitting PDFs, rotating pages, adding watermarks, creating new PDFs, filling PDF forms, encrypting/decrypting PDFs, extracting images, OCR on scanned PDFs, and image processing.
---

# PDF Operations

## Tools Available

- `pdftotext` — text extraction (`/opt/homebrew/bin/pdftotext`, installed)
- `qpdf` — merge/split/rotate/encrypt PDFs (installed via Homebrew)
- `tesseract` — OCR for scanned PDFs (installed)
- `imagemagick` — image extraction and processing (installed)
- `poppler` — PDF rendering utilities (pdftotext, pdfimages, pdfinfo)
- Python with `pypdf2` / `reportlab` via `uvx` for complex operations

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
uvx --with pypdf2 python3 -c "
import PyPDF2
with open('doc.pdf', 'rb') as f:
    reader = PyPDF2.PdfReader(f)
    for page in reader.pages:
        print(page.extract_text())
"
```

## Rules

- Never read PDF files directly with the Read tool — use pdftotext or the methods above
- For tables in PDFs, pdftotext -layout often preserves structure better
- OCR only when pdftotext returns empty or garbled text (scanned document)
