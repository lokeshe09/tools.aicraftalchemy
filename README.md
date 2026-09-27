# tools.aicraftalchemy

104 PDF, image, video, audio, document and developer tools that run **entirely in the browser**. Files are never uploaded, stored or tracked.

Crafted by **aicraftalchemy**. The site is a static React + Vite app with no backend.

## Deploy on Vercel

1. Push this folder to GitHub, GitLab or Bitbucket, or run `vercel` inside it.
2. Import the project in Vercel. `vercel.json` already sets the framework (Vite), the build command (`npm run build`), the output folder (`dist`), SPA routing and cache headers.
3. Deploy. Vercel installs the dependencies from `package-lock.json`.

## What runs where

| Engine | Used for | Loaded |
| --- | --- | --- |
| pdf-lib, pdf.js | Editing, rendering and text extraction for PDFs | Bundled |
| QPDF (WebAssembly) | Lossless unlock/protect (AES-256), repair, web optimisation | Bundled (`.wasm`) |
| node-forge + WebCrypto | Digital signatures: signing with .p12/.pfx and verification | Bundled |
| Tesseract | OCR in 20+ languages | Engine and language data come from the jsDelivr CDN on first use |
| FFmpeg (WebAssembly) | Video and audio tools | Single-threaded core (~30 MB) comes from the jsDelivr CDN on first use |

Heavy libraries are code-split, so each tool loads only what it needs. The first page load is about 80 KB gzipped.

## Tool categories

- **Organize PDF:** merge (with per-file page ranges and alternate/mix), split (by ranges, every N pages, odd/even or size), remove pages (with blank-page detection), extract pages, organize across several PDFs, rotate, N-up, resize pages.
- **Optimize PDF:** smart compress (custom DPI and quality, target file size, keeps text vector), OCR to a searchable PDF, repair, grayscale, fast web view.
- **Convert to PDF:** images (several per page, custom sizes, DPI cap), scan with camera, Word, Excel (sheet picker, fit to width), PowerPoint, HTML, Markdown, text. Word, HTML and Markdown can also be printed to a vector PDF.
- **Convert from PDF:** JPG/PNG/WEBP at any DPI, Word (editable or exact layout), Excel, CSV, PowerPoint, text, HTML, extract images.
- **Edit & sign PDF:** full editor (text, images, shapes, whiteout, highlight, lines, ticks), e-sign (draw, type or upload), fill forms, watermark, page numbers, header & footer, visual crop, true redaction (finds emails, phone numbers, Aadhaar and PAN), compare, metadata, flatten, remove annotations.
- **PDF security:** protect (AES-256 with permissions), unlock (lossless), digital signature (PKCS#7 with your certificate or a newly created one), signature verification with a green-tick report.
- **Image:** compress (quality or target KB), resize (px, %, cm/mm/in with DPI, passport and social presets), crop (presets, circle), convert, HEIC, SVG, rotate by any angle, photo editor, watermark, blur/pixelate, OCR, combine, EXIF viewer and remover, colour picker and palette, meme, favicon pack, Base64 both ways.
- **Video & audio:** convert, compress (by quality or target size), video to GIF, extract audio, audio converter, trim, mute.
- **Documents & data:** Excel ⇄ CSV/JSON/HTML, CSV ⇄ JSON, JSON ⇄ XML, YAML ⇄ JSON, HTML → Markdown, Word → text/HTML/Markdown, text/Markdown → Word.
- **Text & developer:** JSON formatter, Base64, URL encode and parse, Markdown → HTML, QR codes (URL, Wi-Fi, UPI, vCard…), MD5/SHA hashes and checksum check, passwords and passphrases, UUID v4/v7, case converter, word counter, line sorter/cleaner, text diff, colour converter, timestamp converter, JWT decoder, lorem ipsum.

## Notes on digital signatures

Adobe Reader sometimes shows a yellow "?" ("validity unknown") on a genuine signature, for example on an e-Aadhaar. That means the issuing certificate authority isn't trusted on that computer. The file itself is fine. **Verify signature** checks the signature cryptographically, shows the certificate chain, and explains how to make Adobe show the green tick. Any change to a signed PDF (including unlocking it) invalidates the signature, and the app warns about this before you change one.

## Adding a tool

Write a component in `src/tools/` (most tools wrap `FileTool`), then add one line to `src/registry.js`.
