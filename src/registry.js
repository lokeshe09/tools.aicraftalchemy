import { lazy } from 'react'
import {
  Combine, Scissors, FileMinus, FileOutput, LayoutGrid, RotateCw, Grid2x2, Scaling, Minimize2, Wrench, Contrast, ScanText, Gauge,
  FileImage, ScanLine, FileText, FileSpreadsheet, Presentation, Code2, BookOpen, Type, Image, Table, ScrollText, Images, FileCode2,
  FilePenLine, Signature, Droplets, Hash, PanelTop, Crop, EyeOff, FormInput, Tags, Layers, MessageSquareOff, GitCompare, Lock, Unlock,
  FileKey2, BadgeCheck, Maximize2, Smartphone, FileType2, SlidersHorizontal, Stamp, Pipette, Laugh, Star, Binary, FileVideo, Film,
  Clapperboard, Music, AudioLines, VolumeX, FileJson, Braces, Link2, QrCode, Fingerprint, KeyRound, CaseSensitive, AlignLeft,
  ListFilter, Diff, Palette, Clock, KeySquare, Pilcrow, Sheet, FileDown, FileCog, Blend, LayoutPanelLeft, ImagePlus,
} from 'lucide-react'

export const CATEGORIES = [
  { id: 'all', label: 'All tools', color: '#6d4aff' },
  { id: 'organize', label: 'Organize PDF', color: '#7c5cff' },
  { id: 'optimize', label: 'Optimize PDF', color: '#10b981' },
  { id: 'to-pdf', label: 'Convert to PDF', color: '#3b82f6' },
  { id: 'from-pdf', label: 'Convert from PDF', color: '#f97316' },
  { id: 'edit', label: 'Edit & Sign PDF', color: '#ec4899' },
  { id: 'security', label: 'PDF Security', color: '#f59e0b' },
  { id: 'image', label: 'Image', color: '#06b6d4' },
  { id: 'media', label: 'Video & Audio', color: '#ef4444' },
  { id: 'data', label: 'Documents & Data', color: '#84cc16' },
  { id: 'dev', label: 'Text & Developer', color: '#8b5cf6' },
]
export const CAT_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]))

const L = (loader, name, props) => ({ component: lazy(() => loader().then((m) => ({ default: m[name] }))), props })
const org = () => import('./tools/pdfOrganize.jsx')
const opt = () => import('./tools/pdfOptimize.jsx')
const edit = () => import('./tools/pdfEdit.jsx')
const more = () => import('./tools/pdfMore.jsx')
const sec = () => import('./tools/pdfSecurity.jsx')
const toPdf = () => import('./tools/toPdf.jsx')
const fromPdf = () => import('./tools/fromPdf.jsx')
const img = () => import('./tools/imageTools.jsx')
const media = () => import('./tools/mediaTools.jsx')
const data = () => import('./tools/dataTools.jsx')
const text = () => import('./tools/textTools.jsx')

const PDF = 'application/pdf,.pdf'
const IMG = 'image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.svg,.avif'
const VID = 'video/*,.mp4,.mov,.webm,.mkv,.avi,.m4v,.3gp,.flv,.wmv,.mpeg,.mpg'
const AUD = 'audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus,.wma,.amr,.aiff'
const XLS = '.xlsx,.xls,.xlsm,.xlsb,.ods,.csv'

const T = (id, name, desc, cat, icon, loader, comp, extra = {}) => ({ id, name, desc, cat, icon, ...L(loader, comp, extra.props), ...extra })

export const TOOLS = [
  // Organize
  T('merge-pdf', 'Merge PDF', 'Combine PDFs in any order, pick page ranges per file, or alternate pages from scans.', 'organize', Combine, org, 'MergePdf', { accept: PDF, from: 'PDF', to: 'PDF', popular: true, tags: 'join combine append' }),
  T('split-pdf', 'Split PDF', 'Split by ranges, every N pages, odd/even or by file size.', 'organize', Scissors, org, 'SplitPdf', { accept: PDF, from: 'PDF', to: 'PDF/ZIP', popular: true, tags: 'separate divide' }),
  T('remove-pages', 'Remove pages', 'Delete pages visually — with automatic blank-page detection.', 'organize', FileMinus, org, 'RemovePages', { accept: PDF, tags: 'delete blank' }),
  T('extract-pages', 'Extract pages', 'Pick the pages you need and save them as a new PDF.', 'organize', FileOutput, org, 'ExtractPages', { accept: PDF, tags: 'select save' }),
  T('organize-pdf', 'Organize PDF', 'Drag to reorder, rotate, duplicate, insert blanks and combine pages from several PDFs.', 'organize', LayoutGrid, org, 'OrganizePdf', { accept: PDF, tags: 'reorder sort arrange move' }),
  T('rotate-pdf', 'Rotate PDF', 'Rotate single pages, odd/even or landscape pages — without losing quality.', 'organize', RotateCw, org, 'RotatePdf', { accept: PDF }),
  T('n-up-pdf', 'N-up / pages per sheet', 'Print 2, 4, 6, 8, 9 or 16 pages on one sheet to save paper.', 'organize', Grid2x2, more, 'NUpPdf', { accept: PDF, badge: 'new', tags: 'multiple pages per sheet handout' }),
  T('resize-pdf-pages', 'Resize pages', 'Change page size to A4, Letter, A3 or any custom size.', 'organize', Scaling, more, 'ResizePages', { accept: PDF, badge: 'new', tags: 'a4 letter page size scale' }),

  // Optimize
  T('compress-pdf', 'Compress PDF', 'Shrink PDFs with custom DPI & quality, or to an exact target size — text stays sharp.', 'optimize', Minimize2, opt, 'CompressPdf', { accept: PDF, from: 'PDF', to: 'Smaller PDF', popular: true, tags: 'reduce size kb mb shrink' }),
  T('ocr-pdf', 'OCR PDF', 'Turn scanned PDFs into searchable, selectable text in 20+ languages.', 'optimize', ScanText, more, 'OcrPdf', { accept: PDF, badge: 'new', tags: 'scan recognize searchable text hindi tamil' }),
  T('repair-pdf', 'Repair PDF', 'Fix damaged or corrupt PDF files and recover their pages.', 'optimize', Wrench, opt, 'RepairPdf', { accept: PDF, tags: 'fix corrupt broken' }),
  T('grayscale-pdf', 'Grayscale PDF', 'Convert colour PDFs to black & white for cheaper printing.', 'optimize', Contrast, opt, 'GrayscalePdf', { accept: PDF, tags: 'black white monochrome' }),
  T('optimize-pdf-web', 'Fast web view', 'Linearize PDFs so the first page opens instantly online.', 'optimize', Gauge, opt, 'LinearizePdf', { accept: PDF, tags: 'linearize web optimize' }),

  // Convert to PDF
  T('jpg-to-pdf', 'Image to PDF', 'JPG, PNG, WEBP & more to PDF — page size, margins, several images per page.', 'to-pdf', FileImage, toPdf, 'ImagesToPdf', { accept: IMG, from: 'JPG/PNG', to: 'PDF', popular: true, tags: 'jpg png photo picture' }),
  T('scan-to-pdf', 'Scan to PDF', 'Use your phone camera to scan documents into a clean PDF.', 'to-pdf', ScanLine, toPdf, 'ScanToPdf', { accept: IMG, badge: 'new', tags: 'camera phone scanner' }),
  T('word-to-pdf', 'Word to PDF', 'Convert DOCX documents to PDF — or print as a vector PDF.', 'to-pdf', FileText, toPdf, 'WordToPdf', { accept: '.docx', from: 'DOCX', to: 'PDF', popular: true, tags: 'docx doc' }),
  T('excel-to-pdf', 'Excel to PDF', 'Spreadsheets to PDF with sheet selection and fit-to-width.', 'to-pdf', FileSpreadsheet, toPdf, 'ExcelToPdf', { accept: XLS, from: 'XLSX', to: 'PDF', tags: 'xlsx xls sheet' }),
  T('powerpoint-to-pdf', 'PowerPoint to PDF', 'Slides with backgrounds, text, shapes, pictures and tables to PDF.', 'to-pdf', Presentation, toPdf, 'PptToPdf', { accept: '.pptx', from: 'PPTX', to: 'PDF', tags: 'pptx ppt slides' }),
  T('html-to-pdf', 'HTML to PDF', 'Convert HTML code or .html files into a PDF.', 'to-pdf', Code2, toPdf, 'HtmlToPdf', { accept: '.html,.htm', tags: 'web page' }),
  T('markdown-to-pdf', 'Markdown to PDF', 'Turn Markdown into a beautifully formatted PDF.', 'to-pdf', BookOpen, toPdf, 'MarkdownToPdf', { accept: '.md,.markdown', tags: 'md readme' }),
  T('text-to-pdf', 'Text to PDF', 'Plain text or .txt files to PDF, any language.', 'to-pdf', Type, toPdf, 'TextToPdf', { accept: '.txt', tags: 'txt' }),

  // Convert from PDF
  T('pdf-to-jpg', 'PDF to JPG', 'Every page to JPG at any DPI — or one tall image.', 'from-pdf', Image, fromPdf, 'PdfToImage', { props: { format: 'jpeg' }, accept: PDF, from: 'PDF', to: 'JPG', popular: true, tags: 'image picture' }),
  T('pdf-to-png', 'PDF to PNG', 'Lossless PNG images of your PDF pages at any resolution.', 'from-pdf', Image, fromPdf, 'PdfToImage', { props: { format: 'png' }, accept: PDF, from: 'PDF', to: 'PNG', tags: 'image' }),
  T('pdf-to-word', 'PDF to Word', 'Editable DOCX with headings and bold text — or an exact-layout copy.', 'from-pdf', FileText, fromPdf, 'PdfToWord', { accept: PDF, from: 'PDF', to: 'DOCX', popular: true, tags: 'docx doc editable' }),
  T('pdf-to-excel', 'PDF to Excel', 'Pull tables out of PDFs into real spreadsheet rows and columns.', 'from-pdf', FileSpreadsheet, fromPdf, 'PdfToExcel', { accept: PDF, from: 'PDF', to: 'XLSX', tags: 'xlsx table' }),
  T('pdf-to-csv', 'PDF to CSV', 'Export PDF tables as CSV files.', 'from-pdf', Sheet, fromPdf, 'PdfToCsv', { accept: PDF, from: 'PDF', to: 'CSV', badge: 'new', tags: 'table data' }),
  T('pdf-to-powerpoint', 'PDF to PowerPoint', 'Each page becomes a slide in a PPTX presentation.', 'from-pdf', Presentation, fromPdf, 'PdfToPpt', { accept: PDF, from: 'PDF', to: 'PPTX', tags: 'pptx slides' }),
  T('pdf-to-text', 'PDF to Text', 'Extract all text into a UTF-8 .txt file.', 'from-pdf', ScrollText, fromPdf, 'PdfToText', { accept: PDF, from: 'PDF', to: 'TXT', tags: 'txt extract' }),
  T('pdf-to-html', 'PDF to HTML', 'A clean, readable web page from your PDF text.', 'from-pdf', FileCode2, fromPdf, 'PdfToHtml', { accept: PDF, from: 'PDF', to: 'HTML', badge: 'new', tags: 'web' }),
  T('extract-images', 'Extract images', 'Save every picture inside a PDF at original quality.', 'from-pdf', Images, more, 'ExtractImages', { accept: PDF, badge: 'new', tags: 'photos pictures save' }),

  // Edit & sign
  T('edit-pdf', 'Edit PDF', 'Add text, images, shapes, highlights, whiteout, ticks and more.', 'edit', FilePenLine, edit, 'EditPdf', { accept: PDF, popular: true, tags: 'write type annotate add text' }),
  T('sign-pdf', 'Sign PDF', 'Draw, type or upload your signature and place it anywhere.', 'edit', Signature, edit, 'SignPdf', { accept: PDF, popular: true, tags: 'esign signature initials' }),
  T('fill-pdf-form', 'Fill PDF form', 'Fill in fillable PDF forms and optionally lock the answers.', 'edit', FormInput, edit, 'FillForm', { accept: PDF, badge: 'new', tags: 'form fields acroform' }),
  T('watermark-pdf', 'Watermark PDF', 'Stamp text or a logo on pages — any angle, position or mosaic.', 'edit', Droplets, edit, 'WatermarkPdf', { accept: PDF, tags: 'stamp confidential logo' }),
  T('page-numbers', 'Page numbers', 'Add page numbers with position, format, font and range options.', 'edit', Hash, edit, 'PageNumbers', { accept: PDF, tags: 'numbering bates' }),
  T('header-footer', 'Header & footer', 'Add text, dates, file names and page numbers to headers & footers.', 'edit', PanelTop, edit, 'HeaderFooter', { accept: PDF, badge: 'new', tags: 'header footer date' }),
  T('crop-pdf', 'Crop PDF', 'Visually crop margins on all pages or just one.', 'edit', Crop, edit, 'CropPdf', { accept: PDF, tags: 'trim margins' }),
  T('redact-pdf', 'Redact PDF', 'Permanently black out text — find emails, phones, Aadhaar & PAN automatically.', 'edit', EyeOff, edit, 'RedactPdf', { accept: PDF, badge: 'new', tags: 'hide blackout censor privacy' }),
  T('compare-pdf', 'Compare PDF', 'See what changed between two versions of a document.', 'edit', GitCompare, more, 'ComparePdf', { accept: PDF, badge: 'new', tags: 'diff difference versions' }),
  T('pdf-metadata', 'Edit metadata', 'View, edit or strip title, author and other properties.', 'edit', Tags, edit, 'EditMetadata', { accept: PDF, tags: 'properties author title' }),
  T('flatten-pdf', 'Flatten PDF', 'Make form answers permanent and uneditable.', 'edit', Layers, edit, 'FlattenPdf', { accept: PDF, tags: 'form' }),
  T('remove-annotations', 'Remove annotations', 'Strip comments, highlights and stamps from a PDF.', 'edit', MessageSquareOff, edit, 'RemoveAnnotations', { accept: PDF, badge: 'new', tags: 'comments clean' }),

  // Security
  T('protect-pdf', 'Protect PDF', 'AES-256 password protection with printing/copying permissions. Lossless.', 'security', Lock, sec, 'ProtectPdf', { accept: PDF, popular: true, tags: 'password encrypt secure' }),
  T('unlock-pdf', 'Unlock PDF', 'Remove passwords and restrictions — same quality, same size.', 'security', Unlock, sec, 'UnlockPdf', { accept: PDF, popular: true, tags: 'remove password decrypt aadhaar' }),
  T('digital-sign-pdf', 'Digital signature', 'Cryptographically sign with your .p12/.pfx certificate — or create one.', 'security', FileKey2, sec, 'DigitalSignPdf', { accept: PDF, badge: 'new', tags: 'certificate dsc pades pkcs7 pfx' }),
  T('verify-signature', 'Verify signature', 'Check digital signatures (Aadhaar, DigiLocker, DSC) and get the green tick.', 'security', BadgeCheck, sec, 'VerifySignature', { accept: PDF, badge: 'new', tags: 'validate aadhaar certificate green tick digilocker' }),

  // Image
  T('compress-image', 'Compress image', 'Shrink JPG, PNG & WEBP by quality or to an exact size like 50 KB.', 'image', Minimize2, img, 'CompressImage', { accept: IMG, popular: true, tags: 'reduce kb size tinypng' }),
  T('resize-image', 'Resize image', 'Pixels, %, cm/mm/inch with DPI — passport & social presets.', 'image', Maximize2, img, 'ResizeImage', { accept: IMG, popular: true, tags: 'passport dpi cm dimension scale' }),
  T('crop-image', 'Crop image', 'Crop with aspect presets, exact pixels or a circle.', 'image', Crop, img, 'CropImage', { accept: IMG, tags: 'cut trim circle' }),
  T('convert-to-jpg', 'Convert to JPG', 'PNG, WEBP, GIF, BMP, SVG, AVIF to JPG in bulk.', 'image', FileImage, img, 'ConvertImage', { props: { to: 'image/jpeg' }, accept: IMG, from: 'Any', to: 'JPG', tags: 'png webp jpeg' }),
  T('convert-to-png', 'Convert to PNG', 'Convert any image to lossless PNG.', 'image', FileImage, img, 'ConvertImage', { props: { to: 'image/png' }, accept: IMG, from: 'Any', to: 'PNG', tags: 'jpg webp' }),
  T('convert-to-webp', 'Convert to WEBP', 'Modern, lightweight WEBP images for the web.', 'image', FileImage, img, 'ConvertImage', { props: { to: 'image/webp' }, accept: IMG, from: 'Any', to: 'WEBP', tags: 'jpg png' }),
  T('heic-to-jpg', 'HEIC to JPG', 'Convert iPhone HEIC photos to JPG or PNG.', 'image', Smartphone, img, 'HeicToJpg', { accept: '.heic,.heif,image/heic,image/heif', from: 'HEIC', to: 'JPG', tags: 'iphone apple' }),
  T('svg-to-png', 'SVG to PNG', 'Render SVGs to PNG/JPG/WEBP at any width.', 'image', FileType2, img, 'SvgToPng', { accept: '.svg,image/svg+xml', from: 'SVG', to: 'PNG', tags: 'vector' }),
  T('rotate-image', 'Rotate image', 'Rotate by any angle and mirror or flip images.', 'image', RotateCw, img, 'RotateImage', { accept: IMG, tags: 'flip mirror straighten' }),
  T('photo-editor', 'Photo editor', 'Brightness, contrast, saturation, sharpen and one-click looks.', 'image', SlidersHorizontal, img, 'ImageFilters', { accept: IMG, tags: 'filter adjust enhance' }),
  T('watermark-image', 'Watermark image', 'Protect photos with text or your logo.', 'image', Stamp, img, 'WatermarkImage', { accept: IMG, tags: 'logo copyright' }),
  T('blur-image', 'Blur / pixelate', 'Hide faces, plates and private details in photos.', 'image', Blend, img, 'BlurImage', { accept: IMG, badge: 'new', tags: 'censor privacy hide face' }),
  T('image-to-text', 'Image to text (OCR)', 'Copy text from photos, screenshots and scans.', 'image', ScanText, img, 'ImageToText', { accept: IMG, popular: true, tags: 'ocr extract read' }),
  T('combine-images', 'Combine images', 'Join images vertically, horizontally or in a grid.', 'image', LayoutPanelLeft, img, 'CombineImages', { accept: IMG, badge: 'new', tags: 'merge stitch collage' }),
  T('image-metadata', 'Photo metadata (EXIF)', 'See hidden camera & GPS data — and remove it.', 'image', Tags, img, 'ImageMetadata', { accept: IMG, badge: 'new', tags: 'exif gps location remove' }),
  T('color-picker', 'Image colour picker', 'Pick exact colours and extract a palette from any image.', 'image', Pipette, img, 'ColorPicker', { accept: IMG, badge: 'new', tags: 'palette hex eyedropper' }),
  T('meme-generator', 'Meme generator', 'Classic top and bottom meme text in seconds.', 'image', Laugh, img, 'MemeGenerator', { accept: IMG, tags: 'funny caption' }),
  T('favicon-generator', 'Favicon generator', 'favicon.ico, app icons and manifest from one image.', 'image', Star, img, 'FaviconGenerator', { accept: IMG, tags: 'ico icon website' }),
  T('image-to-base64', 'Image to Base64', 'Encode images as data URIs for HTML and CSS.', 'image', Binary, img, 'ImageToBase64', { accept: IMG, tags: 'data uri encode' }),
  T('base64-to-image', 'Base64 to image', 'Decode Base64 / data URIs back into image files.', 'image', ImagePlus, img, 'Base64ToImage', { badge: 'new', tags: 'decode data uri' }),

  // Media
  T('convert-video', 'Video converter', 'MP4, WEBM, MOV, MKV, AVI — with optional downscaling.', 'media', FileVideo, media, 'ConvertVideo', { accept: VID, from: 'Video', to: 'MP4…', badge: 'new', tags: 'mp4 mov webm mkv avi' }),
  T('compress-video', 'Compress video', 'Smaller videos by quality or target size (e.g. 25 MB for email).', 'media', Film, media, 'CompressVideo', { accept: VID, badge: 'new', popular: true, tags: 'reduce size mp4 whatsapp' }),
  T('video-to-gif', 'Video to GIF', 'Make high-quality GIFs from any video clip.', 'media', Clapperboard, media, 'VideoToGif', { accept: VID, from: 'Video', to: 'GIF', badge: 'new', tags: 'animation' }),
  T('video-to-mp3', 'Video to MP3', 'Extract the audio track as MP3, WAV, M4A, OGG or FLAC.', 'media', Music, media, 'VideoToAudio', { accept: VID, from: 'Video', to: 'MP3', badge: 'new', tags: 'audio extract sound' }),
  T('convert-audio', 'Audio converter', 'Convert between MP3, WAV, M4A, OGG, OPUS and FLAC.', 'media', AudioLines, media, 'ConvertAudio', { accept: `${AUD},${VID}`, from: 'Audio', to: 'MP3…', badge: 'new', tags: 'mp3 wav flac m4a' }),
  T('trim-media', 'Trim video / audio', 'Cut clips to the exact start and end you want.', 'media', Scissors, media, 'TrimMedia', { accept: `${VID},${AUD}`, badge: 'new', tags: 'cut clip shorten' }),
  T('mute-video', 'Mute video', 'Remove the sound from a video instantly, no quality loss.', 'media', VolumeX, media, 'MuteVideo', { accept: VID, badge: 'new', tags: 'remove audio silent' }),

  // Documents & data
  T('excel-to-csv', 'Excel to CSV', 'Export every sheet to CSV with your choice of delimiter.', 'data', Table, data, 'ExcelToCsv', { accept: XLS, from: 'XLSX', to: 'CSV' }),
  T('csv-to-excel', 'CSV to Excel', 'Turn CSV files into a proper .xlsx workbook.', 'data', FileSpreadsheet, data, 'CsvToExcel', { accept: '.csv,.tsv,.txt', from: 'CSV', to: 'XLSX' }),
  T('excel-to-json', 'Excel to JSON', 'Spreadsheet rows to JSON objects.', 'data', FileJson, data, 'ExcelToJson', { accept: XLS, from: 'XLSX', to: 'JSON' }),
  T('json-to-excel', 'JSON to Excel', 'JSON arrays to an Excel sheet, nested keys flattened.', 'data', FileSpreadsheet, data, 'JsonToExcel', { accept: '.json', from: 'JSON', to: 'XLSX' }),
  T('excel-to-html', 'Excel to HTML', 'Every sheet as a styled HTML table.', 'data', FileCode2, data, 'ExcelToHtml', { accept: XLS, from: 'XLSX', to: 'HTML', badge: 'new' }),
  T('csv-to-json', 'CSV to JSON', 'Live CSV → JSON conversion with type detection.', 'data', FileJson, data, 'CsvToJson', { from: 'CSV', to: 'JSON' }),
  T('json-to-csv', 'JSON to CSV', 'Flatten JSON into CSV rows and columns.', 'data', Table, data, 'JsonToCsv', { from: 'JSON', to: 'CSV' }),
  T('json-to-xml', 'JSON to XML', 'Convert JSON data into well-formed XML.', 'data', FileCode2, data, 'JsonToXml', { from: 'JSON', to: 'XML', badge: 'new' }),
  T('xml-to-json', 'XML to JSON', 'Validate and convert XML into JSON.', 'data', Braces, data, 'XmlToJson', { from: 'XML', to: 'JSON', badge: 'new' }),
  T('yaml-json', 'YAML ⇄ JSON', 'Convert between YAML and JSON both ways.', 'data', FileCog, data, 'YamlJson', { from: 'YAML', to: 'JSON', badge: 'new', tags: 'yml config' }),
  T('html-to-markdown', 'HTML to Markdown', 'Clean Markdown from any HTML.', 'data', Pilcrow, data, 'HtmlToMarkdown', { from: 'HTML', to: 'MD', badge: 'new' }),
  T('word-to-text', 'Word to Text', 'Extract plain text from DOCX documents.', 'data', FileText, data, 'WordToText', { accept: '.docx', from: 'DOCX', to: 'TXT' }),
  T('word-to-html', 'Word to HTML', 'DOCX to clean, semantic HTML.', 'data', FileCode2, data, 'WordToHtml', { accept: '.docx', from: 'DOCX', to: 'HTML' }),
  T('word-to-markdown', 'Word to Markdown', 'DOCX to Markdown for docs, wikis and GitHub.', 'data', Pilcrow, data, 'WordToMarkdown', { accept: '.docx', from: 'DOCX', to: 'MD', badge: 'new' }),
  T('text-to-word', 'Text / Markdown to Word', 'TXT or Markdown into a formatted DOCX document.', 'data', FileDown, data, 'TextToWord', { accept: '.txt,.md,.markdown', from: 'TXT/MD', to: 'DOCX' }),

  // Text & developer
  T('json-formatter', 'JSON formatter', 'Beautify, validate (with line numbers), sort and minify JSON.', 'dev', Braces, text, 'JsonFormatter', { tags: 'beautify validate lint' }),
  T('base64', 'Base64 encode / decode', 'UTF-8 safe Base64 with URL-safe option.', 'dev', Binary, text, 'Base64Tool', { tags: 'encode decode' }),
  T('url-encode', 'URL encode / decode', 'Encode, decode and parse URLs and query strings.', 'dev', Link2, text, 'UrlEncoder', { tags: 'percent encoding query' }),
  T('markdown-to-html', 'Markdown to HTML', 'Markdown to HTML with a safe live preview.', 'dev', FileCode2, text, 'MarkdownToHtml', { tags: 'md preview' }),
  T('qr-code', 'QR code generator', 'QR codes for links, Wi-Fi, UPI, contacts, SMS — PNG or SVG.', 'dev', QrCode, text, 'QrGenerator', { popular: true, tags: 'qr wifi upi vcard' }),
  T('hash-generator', 'Hash / checksum', 'MD5, SHA-1, SHA-256, SHA-512 for text or files of any size.', 'dev', Fingerprint, text, 'HashGenerator', { tags: 'md5 sha256 checksum verify' }),
  T('password-generator', 'Password generator', 'Strong random passwords and memorable passphrases.', 'dev', KeyRound, text, 'PasswordGenerator', { tags: 'secure random passphrase' }),
  T('uuid-generator', 'UUID generator', 'Random v4 and time-ordered v7 UUIDs in bulk.', 'dev', Fingerprint, text, 'UuidGenerator', { tags: 'guid' }),
  T('case-converter', 'Case converter', 'UPPER, lower, Title, camelCase, snake_case and more.', 'dev', CaseSensitive, text, 'CaseConverter', { tags: 'uppercase lowercase camel snake' }),
  T('word-counter', 'Word counter', 'Words, characters, sentences, reading time and keywords.', 'dev', AlignLeft, text, 'WordCounter', { tags: 'count characters' }),
  T('text-cleaner', 'Sort & clean lines', 'Sort, dedupe, trim and number lines of text.', 'dev', ListFilter, text, 'TextCleaner', { badge: 'new', tags: 'sort duplicate remove lines' }),
  T('text-diff', 'Text compare', 'Highlight differences between two texts.', 'dev', Diff, text, 'TextDiff', { badge: 'new', tags: 'diff compare' }),
  T('color-converter', 'Colour converter', 'HEX, RGB, HSL, CMYK plus shades and contrast check.', 'dev', Palette, text, 'ColorConverter', { tags: 'hex rgb hsl cmyk' }),
  T('timestamp-converter', 'Timestamp converter', 'Unix timestamps to dates and back, in your time zone.', 'dev', Clock, text, 'TimestampConverter', { tags: 'epoch unix time date' }),
  T('jwt-decoder', 'JWT decoder', 'Decode JSON Web Tokens and check expiry.', 'dev', KeySquare, text, 'JwtDecoder', { badge: 'new', tags: 'token jwt auth' }),
  T('lorem-ipsum', 'Lorem ipsum', 'Placeholder text for your designs.', 'dev', AlignLeft, text, 'LoremIpsum', { tags: 'dummy placeholder' }),
]

export const TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.id, t]))
