import { useState } from 'react'
import FileTool from '../components/FileTool'
import { Field, Segmented, Section, Toggle, Slider, NumberInput } from '../components/ui'
import { baseName, canvasToBlob, oneOrZip, parseRanges, MIME } from '../lib/files'
import { extractLines, lineToText, openPdfjs, renderPage, toGrayscale } from '../lib/pdf'
import { setDpi } from '../lib/image'

const PDF = 'application/pdf,.pdf'

function pageList(input, n) {
  const s = String(input || '').trim().toLowerCase()
  return !s || s === 'all' ? Array.from({ length: n }, (_, i) => i + 1) : parseRanges(s, n)
}

/* ---------------- PDF → JPG / PNG / WEBP ---------------- */
export function PdfToImage({ format: initial = 'jpeg' }) {
  const [format, setFormat] = useState(initial)
  const [dpi, setDpiState] = useState(150)
  const [quality, setQuality] = useState(90)
  const [pages, setPages] = useState('all')
  const [gray, setGray] = useState(false)
  const [combine, setCombine] = useState(false)
  const ext = format === 'jpeg' ? 'jpg' : format
  return (
    <FileTool
      accept={PDF}
      actionLabel={`Convert to ${ext.toUpperCase()}`}
      options={
        <>
          <h3>PDF to image</h3>
          <Field label="Format"><Segmented full value={format} onChange={setFormat} options={[{ value: 'jpeg', label: 'JPG' }, { value: 'png', label: 'PNG' }, { value: 'webp', label: 'WEBP' }]} /></Field>
          <Section title="Resolution">
            <Segmented full value={[72, 150, 300, 600].includes(dpi) ? dpi : 0} onChange={(v) => v && setDpiState(v)} options={[{ value: 72, label: '72' }, { value: 150, label: '150' }, { value: 300, label: '300' }, { value: 600, label: '600' }, { value: 0, label: 'Custom' }]} />
            <Field label="DPI" hint="Higher = sharper and larger. 300 DPI is print quality."><NumberInput min={24} max={1200} value={dpi} onChange={(v) => setDpiState(Math.round(v))} /></Field>
          </Section>
          {format !== 'png' && <Slider label="Quality" suffix="%" min={30} max={100} value={quality} onChange={setQuality} />}
          <Field label="Pages" hint="“all” or e.g. 1-3, 7"><input className="input" value={pages} onChange={(e) => setPages(e.target.value)} /></Field>
          <Toggle checked={gray} onChange={setGray} label="Grayscale" />
          <Toggle checked={combine} onChange={setCombine} label="Combine pages into one tall image" />
        </>
      }
      process={async ([file], progress) => {
        const doc = await openPdfjs(file)
        const list = pageList(pages, doc.numPages)
        const name = baseName(file.name)
        const mime = `image/${format}`
        const q = format === 'png' ? undefined : quality / 100
        if (combine) {
          const canvases = []
          for (let k = 0; k < list.length; k++) {
            progress(`Rendering page ${k + 1} of ${list.length}`)
            const { canvas } = await renderPage(doc, list[k], dpi / 72)
            if (gray) toGrayscale(canvas)
            canvases.push(canvas)
          }
          const w = Math.max(...canvases.map((c) => c.width))
          const h = canvases.reduce((s, c) => s + c.height, 0)
          if (w * h > 120e6 || h > 32000) throw new Error('The combined image would be too large. Lower the DPI or choose fewer pages.')
          const out = document.createElement('canvas')
          out.width = w
          out.height = h
          const ctx = out.getContext('2d')
          ctx.fillStyle = '#fff'
          ctx.fillRect(0, 0, w, h)
          let y = 0
          for (const c of canvases) { ctx.drawImage(c, (w - c.width) / 2, y); y += c.height; c.width = c.height = 0 }
          return { blob: await setDpi(await canvasToBlob(out, mime, q), dpi), name: `${name}.${ext}` }
        }
        const out = []
        for (let k = 0; k < list.length; k++) {
          progress(`Page ${k + 1} of ${list.length}`)
          const { canvas } = await renderPage(doc, list[k], dpi / 72)
          if (gray) toGrayscale(canvas)
          out.push({ name: `${name}-page-${list[k]}.${ext}`, blob: await setDpi(await canvasToBlob(canvas, mime, q), dpi) })
          canvas.width = canvas.height = 0
        }
        doc.destroy()
        return oneOrZip(out, `${name}-${ext}.zip`)
      }}
    />
  )
}

/* ---------------- PDF → Word ---------------- */
function linesToParagraphs(lines) {
  const paras = []
  let cur = null
  let prevY = null
  for (const line of lines) {
    const text = lineToText(line)
    const size = Math.round(line.height * 2) / 2
    const bold = line.items.every((it) => /bold|black|heavy|semibold/i.test(`${it.fontName} ${it.family}`))
    const x = line.items[0]?.x ?? 0
    const gap = prevY === null ? 0 : prevY - line.y
    const bullet = /^\s*([•●▪◦\-–*]|\d+[.)])\s+/.test(text)
    if (!cur || gap > line.height * 1.75 || Math.abs(cur.size - size) > 1 || cur.bold !== bold || bullet) {
      cur = { text, size, bold, x }
      paras.push(cur)
    } else {
      cur.text += (cur.text.endsWith('-') ? '' : ' ') + text
    }
    prevY = line.y
  }
  return paras
}

export function PdfToWord() {
  const [mode, setMode] = useState('text')
  return (
    <FileTool
      accept={PDF}
      actionLabel="Convert to WORD"
      options={
        <>
          <h3>PDF to Word</h3>
          <div className="radio-cards">
            <button className={`radio-card ${mode === 'text' ? 'active' : ''}`} onClick={() => setMode('text')}><strong>Editable document</strong><span>Rebuilds paragraphs, headings and bold text you can edit</span></button>
            <button className={`radio-card ${mode === 'image' ? 'active' : ''}`} onClick={() => setMode('image')}><strong>Exact layout</strong><span>Each page placed as a picture — looks identical, not editable</span></button>
          </div>
          <p className="muted small">Scanned PDF? Run <strong>OCR PDF</strong> first, then convert.</p>
        </>
      }
      process={async ([file], progress) => {
        const { Document, Packer, Paragraph, TextRun, ImageRun, PageBreak, HeadingLevel } = await import('docx')
        const children = []
        let section = {}
        if (mode === 'text') {
          progress('Extracting text')
          const pages = await extractLines(file)
          const sizes = pages.flat().map((l) => Math.round(l.height)).sort((a, b) => a - b)
          const body = sizes[Math.floor(sizes.length / 2)] || 11
          pages.forEach((lines, pi) => {
            for (const p of linesToParagraphs(lines)) {
              const ratio = p.size / body
              const heading = ratio > 1.6 ? HeadingLevel.HEADING_1 : ratio > 1.3 ? HeadingLevel.HEADING_2 : ratio > 1.12 && p.bold ? HeadingLevel.HEADING_3 : undefined
              children.push(new Paragraph({
                heading,
                spacing: { after: 120 },
                children: [new TextRun({ text: p.text, size: Math.max(14, Math.min(96, Math.round(p.size * 2))), bold: p.bold || undefined })],
              }))
            }
            if (pi < pages.length - 1) children.push(new Paragraph({ children: [new PageBreak()] }))
          })
          if (!children.length) throw new Error('No text found — this PDF is probably a scan. Use OCR PDF first, or choose “Exact layout”.')
        } else {
          const doc = await openPdfjs(file)
          const first = (await doc.getPage(1)).getViewport({ scale: 1 })
          // Page size in twips (1/20 pt), zero margins so each page image fills its page.
          section = { properties: { page: { size: { width: Math.round(first.width * 20), height: Math.round(first.height * 20) }, margin: { top: 0, bottom: 0, left: 0, right: 0 } } } }
          for (let i = 1; i <= doc.numPages; i++) {
            progress(`Page ${i} of ${doc.numPages}`)
            const { canvas, width, height } = await renderPage(doc, i, 2)
            const w = Math.round(width * (96 / 72)) - 2
            const h = Math.round((height / width) * w) - 2
            const data = await (await canvasToBlob(canvas, 'image/jpeg', 0.88)).arrayBuffer()
            children.push(new Paragraph({ spacing: { before: 0, after: 0 }, children: [new ImageRun({ type: 'jpg', data, transformation: { width: w, height: h } })] }))
            canvas.width = canvas.height = 0
          }
          doc.destroy()
        }
        const docx = new Document({ creator: 'tools.aicraftalchemy', sections: [{ ...section, children }] })
        return { blob: await Packer.toBlob(docx), name: `${baseName(file.name)}.docx` }
      }}
    />
  )
}

/* ---------------- PDF → Excel / CSV ---------------- */
function linesToRows(lines) {
  return lines.map((line) => {
    const cells = []
    let cur = null
    let lastEnd = null
    for (const it of line.items) {
      const gap = lastEnd === null ? Infinity : it.x - lastEnd
      if (gap > Math.max(6, line.height * 0.9)) {
        cur = { text: it.str }
        cells.push(cur)
      } else cur.text += (gap > 1.5 ? ' ' : '') + it.str
      lastEnd = it.x + it.width
    }
    return cells.map((c) => {
      const t = c.text.trim()
      const n = t.replace(/,/g, '')
      return /^-?\d+(\.\d+)?$/.test(n) && n.length < 16 ? Number(n) : t
    })
  })
}

export function PdfToExcel({ csv = false }) {
  const [perPage, setPerPage] = useState(true)
  return (
    <FileTool
      accept={PDF}
      actionLabel={csv ? 'Convert to CSV' : 'Convert to EXCEL'}
      options={
        <>
          <h3>{csv ? 'PDF to CSV' : 'PDF to Excel'}</h3>
          <p className="muted small">Detects rows and columns from the layout of tables in your PDF. Numbers become real numbers you can calculate with.</p>
          <Field label={csv ? 'Files' : 'Sheets'}><Segmented full value={perPage} onChange={setPerPage} options={[{ value: true, label: 'One per page' }, { value: false, label: 'All in one' }]} /></Field>
        </>
      }
      process={async ([file], progress) => {
        progress('Reading tables')
        const XLSX = await import('xlsx')
        const pages = await extractLines(file)
        if (!pages.flat().length) throw new Error('No text found — this PDF is probably a scan. Use OCR PDF first.')
        const name = baseName(file.name)
        if (csv) {
          const sheets = perPage ? pages.map((l) => linesToRows(l)) : [pages.flatMap((l) => [...linesToRows(l), []])]
          const outs = sheets.map((rows, i) => ({
            name: sheets.length > 1 ? `${name}-page-${i + 1}.csv` : `${name}.csv`,
            blob: new Blob(['﻿' + XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(rows))], { type: 'text/csv;charset=utf-8' }),
          }))
          return oneOrZip(outs, `${name}-csv.zip`)
        }
        const wb = XLSX.utils.book_new()
        if (perPage) pages.forEach((lines, i) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linesToRows(lines)), `Page ${i + 1}`))
        else XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pages.flatMap((l) => [...linesToRows(l), []])), 'Sheet1')
        const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
        return { blob: new Blob([out], { type: MIME.xlsx }), name: `${name}.xlsx` }
      }}
    />
  )
}
export const PdfToCsv = () => <PdfToExcel csv />

/* ---------------- PDF → PowerPoint ---------------- */
export function PdfToPpt() {
  const [dpi, setDpiState] = useState(150)
  return (
    <FileTool
      accept={PDF}
      actionLabel="Convert to PPTX"
      options={
        <>
          <h3>PDF to PowerPoint</h3>
          <p className="muted small">Each PDF page becomes a full slide in a .pptx presentation, sized to match your PDF.</p>
          <Slider label="Slide image quality" suffix="DPI" min={72} max={300} value={dpi} onChange={setDpiState} />
        </>
      }
      process={async ([file], progress) => {
        const { default: PptxGenJS } = await import('pptxgenjs')
        const doc = await openPdfjs(file)
        const first = (await doc.getPage(1)).getViewport({ scale: 1 })
        const pptx = new PptxGenJS()
        const W = first.width / 72
        const H = first.height / 72
        pptx.defineLayout({ name: 'PDF', width: W, height: H })
        pptx.layout = 'PDF'
        pptx.author = 'tools.aicraftalchemy'
        for (let i = 1; i <= doc.numPages; i++) {
          progress(`Slide ${i} of ${doc.numPages}`)
          const { canvas, width, height } = await renderPage(doc, i, dpi / 72)
          const s = Math.min(W / (width / 72), H / (height / 72))
          const w = (width / 72) * s
          const h = (height / 72) * s
          pptx.addSlide().addImage({ data: canvas.toDataURL('image/jpeg', 0.9), x: (W - w) / 2, y: (H - h) / 2, w, h })
          canvas.width = canvas.height = 0
        }
        doc.destroy()
        return { blob: await pptx.write({ outputType: 'blob' }), name: `${baseName(file.name)}.pptx` }
      }}
    />
  )
}

/* ---------------- PDF → Text ---------------- */
export function PdfToText() {
  const [preview, setPreview] = useState('')
  const [layout, setLayout] = useState(true)
  return (
    <FileTool
      accept={PDF}
      actionLabel="Extract text"
      resultTitle="Text extracted"
      resultExtra={<textarea className="textarea mono" rows={12} readOnly value={preview} aria-label="Extracted text" />}
      options={
        <>
          <h3>PDF to Text</h3>
          <p className="muted small">Pulls all selectable text into a UTF-8 .txt file. For scans, run OCR PDF.</p>
          <Toggle checked={layout} onChange={setLayout} label="Page separators" />
        </>
      }
      process={async ([file], progress) => {
        progress('Extracting text')
        const pages = await extractLines(file)
        if (!pages.flat().length) throw new Error('No text found — this PDF is probably a scan. Use OCR PDF to extract it.')
        const text = pages.map((lines, i) => (layout ? `--- Page ${i + 1} ---\n` : '') + lines.map(lineToText).join('\n')).join('\n\n')
        setPreview(text.slice(0, 200000))
        return { blob: new Blob([text], { type: 'text/plain;charset=utf-8' }), name: `${baseName(file.name)}.txt` }
      }}
    />
  )
}

/* ---------------- PDF → HTML ---------------- */
export function PdfToHtml() {
  return (
    <FileTool
      accept={PDF}
      actionLabel="Convert to HTML"
      options={<><h3>PDF to HTML</h3><p className="muted small">Creates a clean, readable web page from the text of your PDF, with headings detected from font sizes.</p></>}
      process={async ([file]) => {
        const pages = await extractLines(file)
        if (!pages.flat().length) throw new Error('No text found — this PDF is probably a scan. Use OCR PDF first.')
        const sizes = pages.flat().map((l) => Math.round(l.height)).sort((a, b) => a - b)
        const body = sizes[Math.floor(sizes.length / 2)] || 11
        const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
        const html = pages.map((lines, i) => `<section class="page" id="page-${i + 1}">\n` + linesToParagraphs(lines).map((p) => {
          const r = p.size / body
          const tag = r > 1.6 ? 'h1' : r > 1.3 ? 'h2' : r > 1.12 && p.bold ? 'h3' : 'p'
          return `<${tag}>${p.bold && tag === 'p' ? `<strong>${esc(p.text)}</strong>` : esc(p.text)}</${tag}>`
        }).join('\n') + '\n</section>').join('\n<hr>\n')
        const doc = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(baseName(file.name))}</title>\n<style>body{font-family:system-ui,sans-serif;max-width:820px;margin:40px auto;padding:0 16px;line-height:1.6;color:#222}hr{border:0;border-top:1px solid #ddd;margin:32px 0}</style></head>\n<body>\n${html}\n</body></html>`
        return { blob: new Blob([doc], { type: 'text/html' }), name: `${baseName(file.name)}.html` }
      }}
    />
  )
}
