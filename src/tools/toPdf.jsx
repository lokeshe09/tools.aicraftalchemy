import { useState } from 'react'
import FileTool from '../components/FileTool'
import TextInputTool from '../components/TextInputTool'
import { Field, Segmented, Section, Toggle, Slider, NumberInput } from '../components/ui'
import { baseName, fileToImage, oneOrZip, MIME } from '../lib/files'
import { htmlToPdfBlob, printHtml, escapeHtml, sanitizeHtml, PAGE_SIZES } from '../lib/htmlToPdf'
import { makeCanvas, imgW, imgH } from '../lib/image'

const MM = 72 / 25.4
const SIZE_OPTS = [{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }, { value: 'legal', label: 'Legal' }, { value: 'a3', label: 'A3' }, { value: 'a5', label: 'A5' }]

/* ---------------- Images → PDF (and Scan to PDF) ---------------- */
export function ImagesToPdf({ scan = false }) {
  const [size, setSize] = useState('a4')
  const [custom, setCustom] = useState({ w: 210, h: 297 })
  const [orient, setOrient] = useState('auto')
  const [margin, setMargin] = useState(scan ? 0 : 10)
  const [fit, setFit] = useState('contain')
  const [perPage, setPerPage] = useState(1)
  const [quality, setQuality] = useState(90)
  const [maxDpi, setMaxDpi] = useState(300)
  const [enhance, setEnhance] = useState(scan)
  const [single, setSingle] = useState(true)

  return (
    <FileTool
      accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.svg,.avif"
      multiple
      reorder
      camera
      dropLabel="Choose images"
      formats="JPG, PNG, WEBP, GIF, BMP, SVG, AVIF · use HEIC to JPG first for iPhone photos"
      actionLabel="Convert to PDF"
      options={
        <>
          <h3>{scan ? 'Scan to PDF' : 'Image to PDF'}</h3>
          <Section title="Page">
            <select className="input" value={size} onChange={(e) => setSize(e.target.value)}>
              <option value="a4">A4</option><option value="letter">Letter</option><option value="legal">Legal</option><option value="a3">A3</option><option value="a5">A5</option>
              <option value="fit">Same as image</option><option value="custom">Custom size…</option>
            </select>
            {size === 'custom' && (
              <div className="grid-2">
                <Field label="Width (mm)"><NumberInput min={10} max={2000} value={custom.w} onChange={(v) => setCustom({ ...custom, w: v })} /></Field>
                <Field label="Height (mm)"><NumberInput min={10} max={2000} value={custom.h} onChange={(v) => setCustom({ ...custom, h: v })} /></Field>
              </div>
            )}
            {size !== 'fit' && <Segmented full value={orient} onChange={setOrient} options={[{ value: 'auto', label: 'Auto' }, { value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }]} />}
            <Field label="Margin (mm)"><NumberInput min={0} max={100} value={margin} onChange={setMargin} /></Field>
          </Section>
          <Section title="Layout">
            {size !== 'fit' && (
              <>
                <Field label="Images per page"><Segmented full value={perPage} onChange={setPerPage} options={[{ value: 1, label: '1' }, { value: 2, label: '2' }, { value: 4, label: '4' }, { value: 6, label: '6' }]} /></Field>
                <Field label="Fit"><Segmented full value={fit} onChange={setFit} options={[{ value: 'contain', label: 'Fit inside' }, { value: 'cover', label: 'Fill page' }, { value: 'original', label: 'Actual size' }]} /></Field>
              </>
            )}
            {perPage === 2 && <p className="muted small">Tip: perfect for ID cards — front and back on one page.</p>}
          </Section>
          <Section title="Quality">
            <Slider label="JPEG quality" suffix="%" min={30} max={100} value={quality} onChange={setQuality} />
            <Field label="Max resolution (DPI)" hint="Very large photos are scaled down to this — keeps the PDF small."><NumberInput min={72} max={1200} value={maxDpi} onChange={setMaxDpi} /></Field>
            <Toggle checked={enhance} onChange={setEnhance} label="Enhance as document" hint="Black & white, higher contrast — like a scanner." />
          </Section>
          <Toggle checked={single} onChange={setSingle} label="Merge all images into one PDF" />
        </>
      }
      process={async (files, progress) => {
        const { jsPDF } = await import('jspdf')
        const m = margin * MM
        const docs = []
        let pdf = null
        let slot = 0
        const cols = perPage === 1 ? 1 : 2
        const rows = Math.ceil(perPage / cols)
        const baseSize = size === 'custom' ? [custom.w * MM, custom.h * MM] : PAGE_SIZES[size]
        for (let i = 0; i < files.length; i++) {
          progress(`Image ${i + 1} of ${files.length}`)
          const img = await fileToImage(files[i])
          const iw = imgW(img) || 1000
          const ih = imgH(img) || 1000
          let pw, ph
          if (size === 'fit') { pw = iw * 0.75 + 2 * m; ph = ih * 0.75 + 2 * m } else {
            ;[pw, ph] = [Math.min(...baseSize), Math.max(...baseSize)]
            const land = orient === 'landscape' || (orient === 'auto' && perPage === 1 && iw > ih)
            if (land) [pw, ph] = [ph, pw]
          }
          const newPage = size === 'fit' || perPage === 1 || slot % perPage === 0
          if (!pdf || (!single && newPage)) {
            if (pdf) docs.push(pdf)
            pdf = new jsPDF({ unit: 'pt', format: [pw, ph], orientation: pw > ph ? 'landscape' : 'portrait', compress: true })
            slot = 0
          } else if (newPage) {
            pdf.addPage([pw, ph], pw > ph ? 'landscape' : 'portrait')
            slot = 0
          }
          const pageW = pdf.internal.pageSize.getWidth()
          const pageH = pdf.internal.pageSize.getHeight()
          const k = size === 'fit' ? 0 : slot % perPage
          const cellW = (pageW - 2 * m - (cols - 1) * m) / cols
          const cellH = (pageH - 2 * m - (rows - 1) * m) / rows
          const cx = m + (k % cols) * (cellW + m)
          const cy = m + Math.floor(k / cols) * (cellH + m)
          let dw, dh
          if (fit === 'original' && size !== 'fit') { dw = Math.min(cellW, iw * 0.75); dh = (dw / iw) * ih; if (dh > cellH) { dh = cellH; dw = (dh / ih) * iw } } else {
            const s = fit === 'cover' && size !== 'fit' ? Math.max(cellW / iw, cellH / ih) : Math.min(cellW / iw, cellH / ih)
            dw = iw * s
            dh = ih * s
          }
          // Downscale pixels to the chosen DPI at printed size.
          const scale = Math.min(1, ((dw / 72) * maxDpi) / iw)
          const [c, ctx] = makeCanvas(iw * scale, ih * scale, '#ffffff')
          if (enhance) ctx.filter = 'grayscale(1) contrast(1.45) brightness(1.08)'
          ctx.drawImage(img, 0, 0, c.width, c.height)
          const lossless = quality >= 100 && /png|gif|svg|bmp/i.test(files[i].type)
          const data = lossless ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', quality / 100)
          if (fit === 'cover' && size !== 'fit') {
            // Clip to the cell when filling.
            pdf.saveGraphicsState()
            pdf.rect(cx, cy, cellW, cellH, null)
            pdf.clip()
            pdf.discardPath()
          }
          pdf.addImage(data, lossless ? 'PNG' : 'JPEG', cx + (cellW - dw) / 2, cy + (cellH - dh) / 2, dw, dh, undefined, 'FAST')
          if (fit === 'cover' && size !== 'fit') pdf.restoreGraphicsState()
          c.width = c.height = 0
          slot++
        }
        docs.push(pdf)
        if (single || docs.length === 1) return { blob: docs[0].output('blob'), name: files.length === 1 ? `${baseName(files[0].name)}.pdf` : scan ? 'scan.pdf' : 'images.pdf' }
        return oneOrZip(docs.map((d, i) => ({ blob: d.output('blob'), name: `${baseName(files[Math.min(i * perPage, files.length - 1)].name)}.pdf` })), 'images-pdf.zip')
      }}
    />
  )
}

export const ScanToPdf = () => <ImagesToPdf scan />

/* ---------------- Document → PDF (shared) ---------------- */
function PageOptions({ size, setSize, landscape, setLandscape, margin, setMargin }) {
  return (
    <Section title="Page">
      <Segmented full value={size} onChange={setSize} options={SIZE_OPTS} />
      <Segmented full value={landscape} onChange={setLandscape} options={[{ value: false, label: 'Portrait' }, { value: true, label: 'Landscape' }]} />
      <Field label="Margin (mm)"><NumberInput min={0} max={60} value={margin} onChange={setMargin} /></Field>
    </Section>
  )
}

function usePageOpts(defaults = {}) {
  const [size, setSize] = useState(defaults.size || 'a4')
  const [landscape, setLandscape] = useState(!!defaults.landscape)
  const [margin, setMargin] = useState(defaults.margin ?? 15)
  return { size, setSize, landscape, setLandscape, margin, setMargin, opts: { pageSize: size, landscape, margin: margin * MM } }
}

async function docxToHtml(file) {
  const mammoth = (await import('mammoth')).default
  const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() }, { styleMap: ["p[style-name='Title'] => h1.title:fresh"] })
  return value || '<p></p>'
}

/* ---------------- Word → PDF ---------------- */
export function WordToPdf() {
  const page = usePageOpts()
  const [files, setFiles] = useState([])
  return (
    <FileTool
      files={files}
      setFiles={setFiles}
      accept={`.docx,${MIME.docx}`}
      formats=".docx (Word 2007 and newer). Save old .doc files as .docx first."
      actionLabel="Convert to PDF"
      options={
        <>
          <h3>Word to PDF</h3>
          <p className="muted small">Converts headings, paragraphs, lists, tables, links and images.</p>
          <PageOptions {...page} />
          <button className="btn btn-soft btn-block" onClick={async () => printHtml(await docxToHtml(files[0]), { title: baseName(files[0].name), landscape: page.landscape })}>
            Print / Save as vector PDF
          </button>
          <p className="muted small">“Print” uses your browser's PDF printer for selectable, razor-sharp text.</p>
        </>
      }
      process={async ([file], progress) => {
        progress('Reading document')
        const html = await docxToHtml(file)
        return { blob: await htmlToPdfBlob(html, { ...page.opts, progress }), name: `${baseName(file.name)}.pdf` }
      }}
    />
  )
}

/* ---------------- Excel → PDF ---------------- */
export function ExcelToPdf() {
  const page = usePageOpts({ landscape: true, margin: 10 })
  const [files, setFiles] = useState([])
  const [sheets, setSheets] = useState([])
  const [chosen, setChosen] = useState(null)
  const [grid, setGrid] = useState(true)
  const [fitWidth, setFitWidth] = useState(true)
  const [titles, setTitles] = useState(true)

  const onFiles = async (f) => {
    setFiles(f)
    setSheets([])
    setChosen(null)
    if (f[0]) {
      try {
        const XLSX = await import('xlsx')
        const wb = XLSX.read(await f[0].arrayBuffer(), { type: 'array', bookSheets: true })
        setSheets(wb.SheetNames)
        setChosen(new Set(wb.SheetNames))
      } catch { /* shown on convert */ }
    }
  }
  const buildHtml = async (file) => {
    const XLSX = await import('xlsx')
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
    const names = wb.SheetNames.filter((n) => !chosen || chosen.has(n))
    if (!names.length) throw new Error('Select at least one sheet.')
    return names.map((n, i) => {
      const table = XLSX.utils.sheet_to_html(wb.Sheets[n], { header: '', footer: '' }).replace(/<\/?(html|body)>|<head>[\s\S]*?<\/head>|<meta[^>]*>|<title>[\s\S]*?<\/title>/gi, '')
      return `${i ? '<div style="height:28px"></div>' : ''}${titles ? `<h2>${escapeHtml(n)}</h2>` : ''}${table}`
    }).join('')
  }
  const css = `.h2p table{width:auto;min-width:100%;white-space:nowrap}${grid ? '' : '.h2p td,.h2p th{border-color:transparent}'}`

  return (
    <FileTool
      files={files}
      setFiles={onFiles}
      accept=".xlsx,.xls,.xlsm,.ods,.csv"
      formats="XLSX, XLS, XLSM, ODS, CSV"
      actionLabel="Convert to PDF"
      options={
        <>
          <h3>Excel to PDF</h3>
          {sheets.length > 1 && (
            <Section title="Sheets">
              {sheets.map((n) => (
                <label key={n} className="check"><input type="checkbox" checked={chosen?.has(n)} onChange={(e) => { const s = new Set(chosen); e.target.checked ? s.add(n) : s.delete(n); setChosen(s) }} /> {n}</label>
              ))}
            </Section>
          )}
          <PageOptions {...page} />
          <Toggle checked={fitWidth} onChange={setFitWidth} label="Fit all columns on the page width" />
          <Toggle checked={grid} onChange={setGrid} label="Show gridlines" />
          <Toggle checked={titles} onChange={setTitles} label="Sheet names as headings" />
        </>
      }
      process={async ([file], progress) => {
        const html = await buildHtml(file)
        return { blob: await htmlToPdfBlob(html, { ...page.opts, css, autoWidth: fitWidth, progress }), name: `${baseName(file.name)}.pdf` }
      }}
    />
  )
}

/* ---------------- PowerPoint → PDF ---------------- */
export function PptToPdf() {
  const [quality, setQuality] = useState('high')
  return (
    <FileTool
      accept={`.pptx,${MIME.pptx}`}
      formats=".pptx (PowerPoint 2007 and newer). Save old .ppt files as .pptx first."
      actionLabel="Convert to PDF"
      options={
        <>
          <h3>PowerPoint to PDF</h3>
          <p className="muted small">Each slide becomes a PDF page with its backgrounds, text, shapes, pictures and tables. Animations, charts and SmartArt are simplified.</p>
          <Field label="Quality"><Segmented full value={quality} onChange={setQuality} options={[{ value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }, { value: 'max', label: 'Print' }]} /></Field>
        </>
      }
      process={async ([file], progress) => {
        const [{ renderPptx }, { jsPDF }] = await Promise.all([import('../lib/pptx'), import('jspdf')])
        const width = { normal: 1280, high: 1920, max: 2800 }[quality]
        const { canvases, width: W, height: H } = await renderPptx(await file.arrayBuffer(), { width, progress })
        const pdf = new jsPDF({ unit: 'pt', format: [W, H], orientation: W > H ? 'landscape' : 'portrait', compress: true })
        canvases.forEach((c, i) => {
          if (i) pdf.addPage([W, H], W > H ? 'landscape' : 'portrait')
          pdf.addImage(c.toDataURL('image/jpeg', quality === 'normal' ? 0.85 : 0.92), 'JPEG', 0, 0, W, H, undefined, 'FAST')
          c.width = c.height = 0
        })
        return { blob: pdf.output('blob'), name: `${baseName(file.name)}.pdf` }
      }}
    />
  )
}

/* ---------------- HTML → PDF ---------------- */
export function HtmlToPdf() {
  const [html, setHtml] = useState('<h1>Hello from tools.aicraftalchemy</h1>\n<p>Paste or load any <strong>HTML</strong> and convert it to a PDF.</p>')
  const page = usePageOpts()
  return (
    <TextInputTool
      value={html}
      onChange={setHtml}
      mono
      accept=".html,.htm,text/html"
      actionLabel="Convert to PDF"
      placeholder="<h1>My page</h1>"
      onPrint={async () => printHtml(await sanitizeHtml(html), { landscape: page.landscape })}
      options={
        <>
          <h3>HTML to PDF</h3>
          <PageOptions {...page} />
          <p className="muted small">Scripts are removed for safety. External images must allow cross-origin access to appear.</p>
        </>
      }
      process={async (progress) => ({ blob: await htmlToPdfBlob(await sanitizeHtml(html), { ...page.opts, progress }), name: 'page.pdf' })}
    />
  )
}

/* ---------------- Markdown → PDF ---------------- */
export function MarkdownToPdf() {
  const [md, setMd] = useState('# My document\n\nWrite **Markdown** here.\n\n- Lists\n- Tables\n- `code`\n\n| Name | Value |\n|------|-------|\n| A | 1 |\n')
  const page = usePageOpts()
  const toHtml = async () => {
    const { marked } = await import('marked')
    return sanitizeHtml(await marked.parse(md, { gfm: true }))
  }
  return (
    <TextInputTool
      value={md}
      onChange={setMd}
      mono
      accept=".md,.markdown,.txt"
      actionLabel="Convert to PDF"
      onPrint={async () => printHtml(await toHtml(), { landscape: page.landscape })}
      options={<><h3>Markdown to PDF</h3><p className="muted small">GitHub-flavoured Markdown: headings, lists, tables, code blocks, quotes and links.</p><PageOptions {...page} /></>}
      process={async (progress) => ({ blob: await htmlToPdfBlob(await toHtml(), { ...page.opts, progress }), name: 'document.pdf' })}
    />
  )
}

/* ---------------- Text → PDF ---------------- */
export function TextToPdf() {
  const [text, setText] = useState('')
  const [font, setFont] = useState('helvetica')
  const [size, setSize] = useState(11)
  const [spacing, setSpacing] = useState(1.4)
  const page = usePageOpts({ margin: 20 })
  return (
    <TextInputTool
      value={text}
      onChange={setText}
      accept=".txt,text/plain,.csv,.log,.json,.xml,.js,.css,.md,.ini,.yaml,.yml"
      actionLabel="Convert to PDF"
      placeholder="Type or paste text here…"
      options={
        <>
          <h3>Text to PDF</h3>
          <Field label="Font"><Segmented full value={font} onChange={setFont} options={[{ value: 'helvetica', label: 'Sans' }, { value: 'times', label: 'Serif' }, { value: 'courier', label: 'Mono' }]} /></Field>
          <div className="grid-2">
            <Field label="Size (pt)"><NumberInput min={5} max={48} value={size} onChange={setSize} /></Field>
            <Field label="Line spacing"><NumberInput min={1} max={3} step={0.1} value={spacing} onChange={setSpacing} /></Field>
          </div>
          <PageOptions {...page} />
        </>
      }
      process={async (progress) => {
        // Scripts outside Latin-1 can't use the built-in PDF fonts, so render them through the browser.
        if (/[^\u0000-ÿ–-…€]/.test(text)) {
          const family = font === 'courier' ? 'Courier New, monospace' : font === 'times' ? 'Times New Roman, serif' : 'Arial, sans-serif'
          const html = `<pre style="font-family:${family};font-size:${size * 1.333}px;line-height:${spacing};background:none;padding:0;white-space:pre-wrap">${escapeHtml(text)}</pre>`
          return { blob: await htmlToPdfBlob(html, { ...page.opts, progress }), name: 'text.pdf' }
        }
        const { jsPDF } = await import('jspdf')
        let [pw, ph] = PAGE_SIZES[page.size]
        if (page.landscape) [pw, ph] = [ph, pw]
        const pdf = new jsPDF({ unit: 'pt', format: [pw, ph], orientation: page.landscape ? 'landscape' : 'portrait' })
        const M = page.margin * MM
        pdf.setFont(font, 'normal')
        pdf.setFontSize(size)
        const lines = pdf.splitTextToSize(text.replace(/\t/g, '    '), pw - M * 2)
        let y = M
        for (const line of lines) {
          if (y + size * spacing > ph - M) { pdf.addPage([pw, ph], page.landscape ? 'landscape' : 'portrait'); y = M }
          y += size * spacing
          pdf.text(line, M, y)
        }
        return { blob: pdf.output('blob'), name: 'text.pdf' }
      }}
    />
  )
}

