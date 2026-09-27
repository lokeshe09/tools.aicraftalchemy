import { lazy } from 'react'
import {
  Combine, Scissors, Minimize2, FileMinus, FileOutput, LayoutGrid, RotateCw, Image, FileText, FileSpreadsheet,
  Presentation, Code2, Type, FileImage, Droplets, Hash, PenTool, Crop, Info, Layers, Lock, Unlock, Wrench, Palette,
  Maximize2, SlidersHorizontal, Stamp, Smartphone, Binary, Star, Braces, Table, FileJson, FileCode2, Link2, QrCode,
  Fingerprint, KeyRound, CaseSensitive, AlignLeft, Clock, Pipette, ScrollText, FileDown, Contrast, BookOpen, FileType2,
} from 'lucide-react'

export const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'organize', label: 'Organize PDF' },
  { id: 'optimize', label: 'Optimize PDF' },
  { id: 'to-pdf', label: 'Convert to PDF' },
  { id: 'from-pdf', label: 'Convert from PDF' },
  { id: 'edit', label: 'Edit PDF' },
  { id: 'security', label: 'PDF Security' },
  { id: 'image', label: 'Image tools' },
  { id: 'data', label: 'Documents & Data' },
  { id: 'dev', label: 'Text & Developer' },
]

const L = (loader, name, props) => ({ component: lazy(() => loader().then((m) => ({ default: m[name] }))), props })
const org = () => import('./tools/pdfOrganize.jsx')
const edit = () => import('./tools/pdfEdit.jsx')
const toPdf = () => import('./tools/toPdf.jsx')
const fromPdf = () => import('./tools/fromPdf.jsx')
const img = () => import('./tools/imageTools.jsx')
const data = () => import('./tools/dataTools.jsx')
const text = () => import('./tools/textTools.jsx')

// color = icon tint on cards
export const TOOLS = [
  // Organize
  { id: 'merge-pdf', name: 'Merge PDF', desc: 'Combine PDFs in the order you want with the easiest PDF merger available.', cat: 'organize', icon: Combine, color: '#e5322d', ...L(org, 'MergePdf') },
  { id: 'split-pdf', name: 'Split PDF', desc: 'Separate one page or a whole set for easy conversion into independent PDF files.', cat: 'organize', icon: Scissors, color: '#e5322d', ...L(org, 'SplitPdf') },
  { id: 'remove-pages', name: 'Remove pages', desc: 'Select and remove the PDF pages you don’t need. Get a new file without them.', cat: 'organize', icon: FileMinus, color: '#e5322d', ...L(org, 'RemovePages') },
  { id: 'extract-pages', name: 'Extract pages', desc: 'Get a new document containing only the pages you want.', cat: 'organize', icon: FileOutput, color: '#e5322d', ...L(org, 'ExtractPages') },
  { id: 'organize-pdf', name: 'Organize PDF', desc: 'Sort, add, rotate and delete pages of your PDF file however you like.', cat: 'organize', icon: LayoutGrid, color: '#e5322d', ...L(org, 'OrganizePdf') },
  { id: 'rotate-pdf', name: 'Rotate PDF', desc: 'Rotate your PDFs the way you need them. Rotate single pages or the whole document.', cat: 'organize', icon: RotateCw, color: '#8e44ad', ...L(org, 'RotatePdf') },

  // Optimize
  { id: 'compress-pdf', name: 'Compress PDF', desc: 'Reduce file size while optimizing for maximal PDF quality.', cat: 'optimize', icon: Minimize2, color: '#27ae60', ...L(edit, 'CompressPdf') },
  { id: 'repair-pdf', name: 'Repair PDF', desc: 'Repair a damaged PDF and recover data from corrupt files.', cat: 'optimize', icon: Wrench, color: '#27ae60', ...L(edit, 'RepairPdf') },
  { id: 'grayscale-pdf', name: 'Grayscale PDF', desc: 'Convert a colour PDF to black & white to save ink when printing.', cat: 'optimize', icon: Contrast, color: '#27ae60', ...L(edit, 'GrayscalePdf') },

  // Convert to PDF
  { id: 'jpg-to-pdf', name: 'JPG to PDF', desc: 'Convert JPG, PNG, WEBP and other images to PDF. Adjust orientation and margins.', cat: 'to-pdf', icon: FileImage, color: '#f1c40f', ...L(toPdf, 'ImagesToPdf') },
  { id: 'word-to-pdf', name: 'WORD to PDF', desc: 'Make DOCX files easy to read by converting them to PDF.', cat: 'to-pdf', icon: FileText, color: '#2b579a', ...L(toPdf, 'WordToPdf') },
  { id: 'excel-to-pdf', name: 'EXCEL to PDF', desc: 'Make Excel spreadsheets easy to read by converting them to PDF.', cat: 'to-pdf', icon: FileSpreadsheet, color: '#217346', ...L(toPdf, 'ExcelToPdf') },
  { id: 'powerpoint-to-pdf', name: 'POWERPOINT to PDF', desc: 'Make PPTX slideshows easy to view by converting them to PDF.', cat: 'to-pdf', icon: Presentation, color: '#d24726', ...L(toPdf, 'PptToPdf') },
  { id: 'html-to-pdf', name: 'HTML to PDF', desc: 'Convert HTML code or .html files into a PDF document.', cat: 'to-pdf', icon: Code2, color: '#f39c12', ...L(toPdf, 'HtmlToPdf') },
  { id: 'markdown-to-pdf', name: 'Markdown to PDF', desc: 'Turn Markdown documents into beautifully formatted PDFs.', cat: 'to-pdf', icon: BookOpen, color: '#34495e', ...L(toPdf, 'MarkdownToPdf') },
  { id: 'text-to-pdf', name: 'Text to PDF', desc: 'Convert plain text or .txt files into a clean PDF.', cat: 'to-pdf', icon: Type, color: '#7f8c8d', ...L(toPdf, 'TextToPdf') },

  // Convert from PDF
  { id: 'pdf-to-jpg', name: 'PDF to JPG', desc: 'Convert each PDF page into a JPG image.', cat: 'from-pdf', icon: Image, color: '#f1c40f', ...L(fromPdf, 'PdfToImage', { format: 'jpeg' }) },
  { id: 'pdf-to-png', name: 'PDF to PNG', desc: 'Convert each PDF page into a lossless PNG image.', cat: 'from-pdf', icon: Image, color: '#16a085', ...L(fromPdf, 'PdfToImage', { format: 'png' }) },
  { id: 'pdf-to-word', name: 'PDF to WORD', desc: 'Convert your PDF files into editable DOCX documents.', cat: 'from-pdf', icon: FileText, color: '#2b579a', ...L(fromPdf, 'PdfToWord') },
  { id: 'pdf-to-excel', name: 'PDF to EXCEL', desc: 'Pull data straight from PDFs into Excel spreadsheets.', cat: 'from-pdf', icon: FileSpreadsheet, color: '#217346', ...L(fromPdf, 'PdfToExcel') },
  { id: 'pdf-to-powerpoint', name: 'PDF to POWERPOINT', desc: 'Turn your PDF files into easy-to-edit PPTX slideshows.', cat: 'from-pdf', icon: Presentation, color: '#d24726', ...L(fromPdf, 'PdfToPpt') },
  { id: 'pdf-to-text', name: 'PDF to Text', desc: 'Extract all text from a PDF into a plain .txt file.', cat: 'from-pdf', icon: ScrollText, color: '#7f8c8d', ...L(fromPdf, 'PdfToText') },

  // Edit
  { id: 'sign-pdf', name: 'Sign PDF', desc: 'Draw or type your signature and place it on any page.', cat: 'edit', icon: PenTool, color: '#2980b9', ...L(edit, 'SignPdf') },
  { id: 'watermark-pdf', name: 'Watermark', desc: 'Stamp an image or text over your PDF in seconds.', cat: 'edit', icon: Droplets, color: '#8e44ad', ...L(edit, 'WatermarkPdf') },
  { id: 'page-numbers', name: 'Page numbers', desc: 'Add page numbers into PDFs with ease. Choose position, format and size.', cat: 'edit', icon: Hash, color: '#8e44ad', ...L(edit, 'PageNumbers') },
  { id: 'crop-pdf', name: 'Crop PDF', desc: 'Trim the margins of every page in your PDF.', cat: 'edit', icon: Crop, color: '#8e44ad', ...L(edit, 'CropPdf') },
  { id: 'pdf-metadata', name: 'Edit metadata', desc: 'View, edit or strip the title, author and other PDF properties.', cat: 'edit', icon: Info, color: '#8e44ad', ...L(edit, 'EditMetadata') },
  { id: 'flatten-pdf', name: 'Flatten PDF', desc: 'Make fillable form fields permanent and non-editable.', cat: 'edit', icon: Layers, color: '#8e44ad', ...L(edit, 'FlattenPdf') },

  // Security
  { id: 'protect-pdf', name: 'Protect PDF', desc: 'Encrypt your PDF with a password to keep it confidential.', cat: 'security', icon: Lock, color: '#2c3e50', ...L(edit, 'ProtectPdf') },
  { id: 'unlock-pdf', name: 'Unlock PDF', desc: 'Remove the password from a PDF you have access to.', cat: 'security', icon: Unlock, color: '#2c3e50', ...L(edit, 'UnlockPdf') },

  // Image
  { id: 'compress-image', name: 'Compress IMAGE', desc: 'Compress JPG, PNG and WEBP with the best quality and compression.', cat: 'image', icon: Minimize2, color: '#16a085', ...L(img, 'CompressImage') },
  { id: 'resize-image', name: 'Resize IMAGE', desc: 'Define dimensions by percent or pixels and resize many images at once.', cat: 'image', icon: Maximize2, color: '#16a085', ...L(img, 'ResizeImage') },
  { id: 'crop-image', name: 'Crop IMAGE', desc: 'Crop images with an easy visual editor and aspect presets.', cat: 'image', icon: Crop, color: '#16a085', ...L(img, 'CropImage') },
  { id: 'convert-to-jpg', name: 'Convert to JPG', desc: 'Turn PNG, WEBP, GIF, BMP, SVG and more into JPG in bulk.', cat: 'image', icon: FileImage, color: '#f1c40f', ...L(img, 'ConvertImage', { to: 'image/jpeg' }) },
  { id: 'convert-to-png', name: 'Convert to PNG', desc: 'Convert any image to lossless PNG with transparency.', cat: 'image', icon: FileImage, color: '#3498db', ...L(img, 'ConvertImage', { to: 'image/png' }) },
  { id: 'convert-to-webp', name: 'Convert to WEBP', desc: 'Convert images to modern, lightweight WEBP.', cat: 'image', icon: FileImage, color: '#9b59b6', ...L(img, 'ConvertImage', { to: 'image/webp' }) },
  { id: 'heic-to-jpg', name: 'HEIC to JPG', desc: 'Convert iPhone HEIC photos to JPG or PNG.', cat: 'image', icon: Smartphone, color: '#e67e22', ...L(img, 'HeicToJpg') },
  { id: 'svg-to-png', name: 'SVG to PNG', desc: 'Render SVG vector graphics to high-resolution PNG.', cat: 'image', icon: FileType2, color: '#e67e22', ...L(img, 'SvgToPng') },
  { id: 'rotate-image', name: 'Rotate IMAGE', desc: 'Rotate or flip many images at once.', cat: 'image', icon: RotateCw, color: '#16a085', ...L(img, 'RotateImage') },
  { id: 'photo-editor', name: 'Photo editor', desc: 'Adjust brightness, contrast, saturation and apply filters.', cat: 'image', icon: SlidersHorizontal, color: '#16a085', ...L(img, 'ImageFilters') },
  { id: 'watermark-image', name: 'Watermark IMAGE', desc: 'Stamp text over your images in seconds.', cat: 'image', icon: Stamp, color: '#16a085', ...L(img, 'WatermarkImage') },
  { id: 'favicon-generator', name: 'Favicon generator', desc: 'Create favicon.ico and app icons in every size from one image.', cat: 'image', icon: Star, color: '#e67e22', ...L(img, 'FaviconGenerator') },
  { id: 'image-to-base64', name: 'Image to Base64', desc: 'Encode images as Base64 data URIs for HTML and CSS.', cat: 'image', icon: Binary, color: '#7f8c8d', ...L(img, 'ImageToBase64') },

  // Documents & data
  { id: 'excel-to-csv', name: 'EXCEL to CSV', desc: 'Export every sheet of a workbook to CSV.', cat: 'data', icon: Table, color: '#217346', ...L(data, 'ExcelToCsv') },
  { id: 'csv-to-excel', name: 'CSV to EXCEL', desc: 'Turn CSV files into a proper .xlsx workbook.', cat: 'data', icon: FileSpreadsheet, color: '#217346', ...L(data, 'CsvToExcel') },
  { id: 'excel-to-json', name: 'EXCEL to JSON', desc: 'Convert spreadsheet rows into JSON objects.', cat: 'data', icon: FileJson, color: '#217346', ...L(data, 'ExcelToJson') },
  { id: 'json-to-excel', name: 'JSON to EXCEL', desc: 'Convert a JSON array into an Excel spreadsheet.', cat: 'data', icon: FileSpreadsheet, color: '#217346', ...L(data, 'JsonToExcel') },
  { id: 'csv-to-json', name: 'CSV to JSON', desc: 'Convert CSV data to JSON instantly.', cat: 'data', icon: FileJson, color: '#f39c12', ...L(data, 'CsvToJson') },
  { id: 'json-to-csv', name: 'JSON to CSV', desc: 'Flatten JSON into CSV rows and columns.', cat: 'data', icon: Table, color: '#f39c12', ...L(data, 'JsonToCsv') },
  { id: 'word-to-text', name: 'WORD to Text', desc: 'Extract plain text from DOCX documents.', cat: 'data', icon: FileText, color: '#2b579a', ...L(data, 'WordToText') },
  { id: 'word-to-html', name: 'WORD to HTML', desc: 'Convert DOCX documents into clean HTML.', cat: 'data', icon: FileCode2, color: '#2b579a', ...L(data, 'WordToHtml') },
  { id: 'text-to-word', name: 'Text to WORD', desc: 'Turn a .txt file into an editable DOCX document.', cat: 'data', icon: FileDown, color: '#2b579a', ...L(data, 'TextToWord') },

  // Text & developer
  { id: 'json-formatter', name: 'JSON formatter', desc: 'Beautify, validate and minify JSON.', cat: 'dev', icon: Braces, color: '#34495e', ...L(text, 'JsonFormatter') },
  { id: 'base64', name: 'Base64 encode / decode', desc: 'Encode text to Base64 or decode it back (UTF-8 safe).', cat: 'dev', icon: Binary, color: '#34495e', ...L(text, 'Base64Tool') },
  { id: 'url-encode', name: 'URL encode / decode', desc: 'Percent-encode or decode URLs and query strings.', cat: 'dev', icon: Link2, color: '#34495e', ...L(text, 'UrlEncoder') },
  { id: 'markdown-to-html', name: 'Markdown to HTML', desc: 'Convert Markdown to HTML with a live preview.', cat: 'dev', icon: FileCode2, color: '#34495e', ...L(text, 'MarkdownToHtml') },
  { id: 'qr-code', name: 'QR code generator', desc: 'Create custom QR codes as PNG or SVG.', cat: 'dev', icon: QrCode, color: '#34495e', ...L(text, 'QrGenerator') },
  { id: 'hash-generator', name: 'Hash generator', desc: 'Compute SHA-1, SHA-256, SHA-384 and SHA-512 for text or files.', cat: 'dev', icon: Fingerprint, color: '#34495e', ...L(text, 'HashGenerator') },
  { id: 'password-generator', name: 'Password generator', desc: 'Generate strong, random passwords securely.', cat: 'dev', icon: KeyRound, color: '#34495e', ...L(text, 'PasswordGenerator') },
  { id: 'uuid-generator', name: 'UUID generator', desc: 'Generate random v4 UUIDs in bulk.', cat: 'dev', icon: Fingerprint, color: '#34495e', ...L(text, 'UuidGenerator') },
  { id: 'case-converter', name: 'Case converter', desc: 'Convert text to UPPER, lower, Title, camelCase, snake_case and more.', cat: 'dev', icon: CaseSensitive, color: '#34495e', ...L(text, 'CaseConverter') },
  { id: 'word-counter', name: 'Word counter', desc: 'Count words, characters, sentences and reading time.', cat: 'dev', icon: AlignLeft, color: '#34495e', ...L(text, 'WordCounter') },
  { id: 'color-converter', name: 'Color converter', desc: 'Convert colors between HEX, RGB, HSL and CMYK.', cat: 'dev', icon: Pipette, color: '#34495e', ...L(text, 'ColorConverter') },
  { id: 'timestamp-converter', name: 'Timestamp converter', desc: 'Convert Unix timestamps to dates and back.', cat: 'dev', icon: Clock, color: '#34495e', ...L(text, 'TimestampConverter') },
  { id: 'lorem-ipsum', name: 'Lorem ipsum', desc: 'Generate placeholder text for your designs.', cat: 'dev', icon: Palette, color: '#34495e', ...L(text, 'LoremIpsum') },
]

export const TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.id, t]))
