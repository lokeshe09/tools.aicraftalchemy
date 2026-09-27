import { useState } from 'react'
import FileTool from '../components/FileTool'
import { Field, Segmented } from '../components/ui'
import { baseName, canvasToBlob, zipBlobs } from '../utils/files'
import { extractLines, lineToText, openPdfjs, renderPage } from '../utils/pdf'

const PDF = 'application/pdf,.pdf'

/* ---------------- PDF → JPG / PNG / WEBP ---------------- */
export function PdfToImage({ format = 'jpeg' }) {
  const [dpi, setDpi] = useState(150)
  const ext = format === 'jpeg' ? 'jpg' : format
  return (
    <FileTool
      accept={PDF}
      dropLabel="Select PDF file"
      actionLabel={`Convert to ${ext.toUpperCase()}`}
      options={
        <>
          <h3>PDF to {ext.toUpperCase()}</h3>
          <p className="muted">Every page becomes a {ext.toUpperCase()} image. Multiple pages are bundled into a ZIP.</p>
          <Field label="Image quality">
            <Segmented value={dpi} onChange={setDpi} options={[{ value: 72, label: 'Low' }, { value: 150, label: 'Normal' }, { value: 300, label: 'High' }]} />
          </Field>
        </>
      }
      process={async ([file], progress) => {
        const doc = await openPdfjs(file)
        const name = baseName(file.name)
        const out = []
        for (let i = 1; i <= doc.numPages; i++) {
          progress(`Page ${i}/${doc.numPages}`)
          const { canvas } = await renderPage(doc, i, dpi / 72)
          out.push({ name: `${name}-page-${i}.${ext}`, blob: await canvasToBlob(canvas, `image/${format}`, 0.92) })
          canvas.width = canvas.height = 0
        }
        if (out.length === 1) return out[0]
        progress('Zipping')
        return { blob: await zipBlobs(out), name: `${name}-${ext}.zip` }
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
    const size = Math.round(line.height)
    const gap = prevY === null ? 0 : prevY - line.y
    if (!cur || gap > line.height * 1.8 || Math.abs(cur.size - size) > 1.5) {
      cur = { text, size }
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
      dropLabel="Select PDF file"
      actionLabel="Convert to WORD"
      options={
        <>
          <h3>PDF to Word</h3>
          <div className="radio-cards">
            <button className={`radio-card ${mode === 'text' ? 'active' : ''}`} onClick={() => setMode('text')}>
              <strong>Editable text</strong><span>Extracts text into editable paragraphs</span>
            </button>
            <button className={`radio-card ${mode === 'image' ? 'active' : ''}`} onClick={() => setMode('image')}>
              <strong>Exact layout</strong><span>Each page placed as an image (not editable)</span>
            </button>
          </div>
          <p className="muted small">Scanned PDFs contain no text — use "Exact layout" for those.</p>
        </>
      }
      process={async ([file], progress) => {
        const { Document, Packer, Paragraph, TextRun, ImageRun, PageBreak } = await import('docx')
        const children = []
        if (mode === 'text') {
          progress('Extracting text')
          const pages = await extractLines(file)
          const sizes = pages.flat().map((l) => Math.round(l.height)).sort((a, b) => a - b)
          const body = sizes[Math.floor(sizes.length / 2)] || 11
          pages.forEach((lines, pi) => {
            for (const p of linesToParagraphs(lines)) {
              const heading = p.size > body * 1.25
              children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: p.text, size: Math.max(16, Math.min(96, Math.round(p.size * 2))), bold: heading })] }))
            }
            if (pi < pages.length - 1) children.push(new Paragraph({ children: [new PageBreak()] }))
          })
          if (!children.length) throw new Error('No text found. This PDF is probably scanned — try "Exact layout".')
        } else {
          const doc = await openPdfjs(file)
          for (let i = 1; i <= doc.numPages; i++) {
            progress(`Page ${i}/${doc.numPages}`)
            const { canvas, page } = await renderPage(doc, i, 2)
            const vp = page.getViewport({ scale: 1 })
            const maxW = 600
            const w = Math.min(maxW, vp.width * (96 / 72))
            const h = (vp.height / vp.width) * w
            const data = await (await canvasToBlob(canvas, 'image/jpeg', 0.88)).arrayBuffer()
            children.push(new Paragraph({ children: [new ImageRun({ type: 'jpg', data, transformation: { width: w, height: h } })] }))
          }
        }
        const docx = new Document({
          creator: 'tools by aicraftalchemy',
          sections: [{ properties: { page: { margin: mode === 'image' ? { top: 400, bottom: 400, left: 400, right: 400 } : undefined } }, children }],
        })
        return { blob: await Packer.toBlob(docx), name: `${baseName(file.name)}.docx` }
      }}
    />
  )
}

/* ---------------- PDF → Excel ---------------- */
export function PdfToExcel() {
  const [perPage, setPerPage] = useState(true)
  return (
    <FileTool
      accept={PDF}
      dropLabel="Select PDF file"
      actionLabel="Convert to EXCEL"
      options={
        <>
          <h3>PDF to Excel</h3>
          <p className="muted">Detects rows and columns from the text layout of your PDF tables.</p>
          <Field label="Sheets">
            <Segmented value={perPage} onChange={setPerPage} options={[{ value: true, label: 'One per page' }, { value: false, label: 'Single sheet' }]} />
          </Field>
        </>
      }
      process={async ([file], progress) => {
        progress('Extracting tables')
        const XLSX = await import('xlsx')
        const pages = await extractLines(file)
        const toRows = (lines) =>
          lines.map((line) => {
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
              return /^-?\d+(\.\d+)?$/.test(n) ? Number(n) : t
            })
          })
        const wb = XLSX.utils.book_new()
        if (perPage) pages.forEach((lines, i) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(toRows(lines)), `Page ${i + 1}`))
        else XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pages.flatMap((l) => [...toRows(l), []])), 'Sheet1')
        if (!pages.flat().length) throw new Error('No text found in this PDF (it may be scanned).')
        const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
        return { blob: new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name: `${baseName(file.name)}.xlsx` }
      }}
    />
  )
}

/* ---------------- PDF → PowerPoint ---------------- */
export function PdfToPpt() {
  return (
    <FileTool
      accept={PDF}
      dropLabel="Select PDF file"
      actionLabel="Convert to PPTX"
      options={<><h3>PDF to PowerPoint</h3><p className="muted">Each PDF page becomes a high-quality slide in a .pptx presentation.</p></>}
      process={async ([file], progress) => {
        const { default: PptxGenJS } = await import('pptxgenjs')
        const doc = await openPdfjs(file)
        const first = (await doc.getPage(1)).getViewport({ scale: 1 })
        const pptx = new PptxGenJS()
        pptx.defineLayout({ name: 'PDF', width: first.width / 72, height: first.height / 72 })
        pptx.layout = 'PDF'
        pptx.author = 'tools by aicraftalchemy'
        for (let i = 1; i <= doc.numPages; i++) {
          progress(`Slide ${i}/${doc.numPages}`)
          const { canvas } = await renderPage(doc, i, 2)
          const slide = pptx.addSlide()
          slide.addImage({ data: canvas.toDataURL('image/jpeg', 0.9), x: 0, y: 0, w: first.width / 72, h: first.height / 72 })
          canvas.width = canvas.height = 0
        }
        const blob = await pptx.write({ outputType: 'blob' })
        return { blob, name: `${baseName(file.name)}.pptx` }
      }}
    />
  )
}

/* ---------------- PDF → Text ---------------- */
export function PdfToText() {
  const [preview, setPreview] = useState('')
  return (
    <FileTool
      accept={PDF}
      dropLabel="Select PDF file"
      actionLabel="Extract text"
      resultTitle="Text extracted!"
      resultExtra={<textarea className="textarea mono" rows={12} readOnly value={preview} />}
      options={<><h3>PDF to Text</h3><p className="muted">Pulls all selectable text out of your PDF into a plain .txt file.</p></>}
      process={async ([file], progress) => {
        progress('Extracting text')
        const pages = await extractLines(file)
        const text = pages.map((lines, i) => `--- Page ${i + 1} ---\n` + lines.map(lineToText).join('\n')).join('\n\n')
        if (!pages.flat().length) throw new Error('No text found in this PDF (it may be scanned).')
        setPreview(text)
        return { blob: new Blob([text], { type: 'text/plain;charset=utf-8' }), name: `${baseName(file.name)}.txt` }
      }}
    />
  )
}
