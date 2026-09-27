import { useMemo, useState } from 'react'
import FileTool from '../components/FileTool'
import { Field, Segmented, Toggle, Slider, NumberInput, Alert, DropZone, FileList, Spinner, useTask, ErrorBox } from '../components/ui'
import { baseName, canvasToBlob, zipBlobs, parseRanges, pdfBlob } from '../lib/files'
import { loadPdf, getPdfLib, saveBlob, pageFrame } from '../lib/pdfDoc'
import { drawPageInto } from '../lib/pdfLayout'
import { openPdfjs, renderPage, extractLines, lineToText } from '../lib/pdf'
import { listImages } from '../lib/pdfCompress'
import { OCR_LANGS, createOcr } from '../lib/ocr'

const PDF = 'application/pdf,.pdf'
const PAPER = { a4: [595.28, 841.89], letter: [612, 792], legal: [612, 1008], a3: [841.89, 1190.55], a5: [419.53, 595.28], tabloid: [792, 1224] }
const MM = 72 / 25.4

/* ---------------- N-up ---------------- */
export function NUpPdf() {
  const [per, setPer] = useState(2)
  const [paper, setPaper] = useState('a4')
  const [orient, setOrient] = useState('auto')
  const [margin, setMargin] = useState(18)
  const [gap, setGap] = useState(10)
  const [border, setBorder] = useState(false)
  const [order, setOrder] = useState('row')
  const grids = { 2: [2, 1], 4: [2, 2], 6: [3, 2], 8: [4, 2], 9: [3, 3], 16: [4, 4] }
  return (
    <FileTool
      accept={PDF}
      modifiesPdf
      actionLabel="Create N-up PDF"
      options={
        <>
          <h3>Pages per sheet</h3>
          <Segmented full value={per} onChange={setPer} options={Object.keys(grids).map((k) => ({ value: +k, label: k }))} />
          <Field label="Paper"><Segmented full value={paper} onChange={setPaper} options={[{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }, { value: 'a3', label: 'A3' }, { value: 'legal', label: 'Legal' }]} /></Field>
          <Field label="Orientation"><Segmented full value={orient} onChange={setOrient} options={[{ value: 'auto', label: 'Auto' }, { value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }]} /></Field>
          <Field label="Reading order"><Segmented full value={order} onChange={setOrder} options={[{ value: 'row', label: 'Across then down' }, { value: 'col', label: 'Down then across' }]} /></Field>
          <div className="grid-2">
            <Field label="Margin (pt)"><NumberInput min={0} max={100} value={margin} onChange={setMargin} /></Field>
            <Field label="Gap (pt)"><NumberInput min={0} max={100} value={gap} onChange={setGap} /></Field>
          </div>
          <Toggle checked={border} onChange={setBorder} label="Draw a border around each page" />
        </>
      }
      process={async ([file], progress) => {
        const { PDFDocument, rgb } = await getPdfLib()
        const src = await loadPdf(file)
        const out = await PDFDocument.create()
        let [cols, rows] = grids[per]
        let [pw, ph] = PAPER[paper]
        // 2-up and 8-up read best on landscape sheets; others on portrait.
        const land = orient === 'landscape' || (orient === 'auto' && (per === 2 || per === 8))
        if (land) [pw, ph] = [ph, pw]
        if (!land && cols > rows) [cols, rows] = [rows, cols]
        const cw = (pw - margin * 2 - gap * (cols - 1)) / cols
        const ch = (ph - margin * 2 - gap * (rows - 1)) / rows
        const pages = src.getPages()
        let sheet = null
        for (let i = 0; i < pages.length; i++) {
          const k = i % per
          if (k === 0) { sheet = out.addPage([pw, ph]); progress(`Sheet ${Math.floor(i / per) + 1}`) }
          const c = order === 'row' ? k % cols : Math.floor(k / rows)
          const r = order === 'row' ? Math.floor(k / cols) : k % rows
          const box = { x: margin + c * (cw + gap), y: ph - margin - (r + 1) * ch - r * gap, w: cw, h: ch }
          await drawPageInto(out, sheet, pages[i], box)
          if (border) sheet.drawRectangle({ x: box.x, y: box.y, width: box.w, height: box.h, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.5 })
        }
        return { blob: await saveBlob(out), name: `${baseName(file.name)}-${per}up.pdf` }
      }}
    />
  )
}

/* ---------------- Resize pages ---------------- */
export function ResizePages() {
  const [paper, setPaper] = useState('a4')
  const [cw, setCw] = useState(210)
  const [chh, setChh] = useState(297)
  const [unit, setUnit] = useState('mm')
  const [orient, setOrient] = useState('auto')
  const [fit, setFit] = useState('contain')
  const [margin, setMargin] = useState(0)
  return (
    <FileTool
      accept={PDF}
      modifiesPdf
      actionLabel="Resize pages"
      options={
        <>
          <h3>Page size</h3>
          <select className="input" value={paper} onChange={(e) => setPaper(e.target.value)}>
            <option value="a4">A4 (210 × 297 mm)</option>
            <option value="a3">A3 (297 × 420 mm)</option>
            <option value="a5">A5 (148 × 210 mm)</option>
            <option value="letter">Letter (8.5 × 11 in)</option>
            <option value="legal">Legal (8.5 × 14 in)</option>
            <option value="tabloid">Tabloid (11 × 17 in)</option>
            <option value="custom">Custom size…</option>
          </select>
          {paper === 'custom' && (
            <div className="grid-3">
              <Field label="Width"><NumberInput min={1} max={5000} value={cw} onChange={setCw} /></Field>
              <Field label="Height"><NumberInput min={1} max={5000} value={chh} onChange={setChh} /></Field>
              <Field label="Unit"><select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}><option>mm</option><option>cm</option><option>in</option><option>pt</option></select></Field>
            </div>
          )}
          <Field label="Orientation"><Segmented full value={orient} onChange={setOrient} options={[{ value: 'auto', label: 'Match each page' }, { value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }]} /></Field>
          <Field label="Content"><Segmented full value={fit} onChange={setFit} options={[{ value: 'contain', label: 'Scale to fit' }, { value: 'stretch', label: 'Stretch' }]} /></Field>
          <Field label="Margin (mm)"><NumberInput min={0} max={100} value={margin} onChange={setMargin} /></Field>
        </>
      }
      process={async ([file], progress) => {
        const { PDFDocument } = await getPdfLib()
        const src = await loadPdf(file)
        const out = await PDFDocument.create()
        const k = { mm: MM, cm: MM * 10, in: 72, pt: 1 }[unit]
        const [bw, bh] = paper === 'custom' ? [cw * k, chh * k] : PAPER[paper]
        const m = margin * MM
        const pages = src.getPages()
        for (let i = 0; i < pages.length; i++) {
          progress(`Page ${i + 1} of ${pages.length}`)
          const fr = pageFrame(pages[i])
          let [pw, ph] = [Math.min(bw, bh), Math.max(bw, bh)]
          const land = orient === 'landscape' || (orient === 'auto' && fr.vw > fr.vh)
          if (paper === 'custom' && orient === 'auto') [pw, ph] = fr.vw > fr.vh === bw > bh ? [bw, bh] : [bh, bw]
          else if (land) [pw, ph] = [ph, pw]
          const sheet = out.addPage([pw, ph])
          await drawPageInto(out, sheet, pages[i], { x: m, y: m, w: pw - 2 * m, h: ph - 2 * m }, { fit })
        }
        return { blob: await saveBlob(out), name: `${baseName(file.name)}-${paper}.pdf` }
      }}
    />
  )
}

/* ---------------- Extract images ---------------- */
export function ExtractImages() {
  const [minSize, setMinSize] = useState(48)
  const [format, setFormat] = useState('original')
  return (
    <FileTool
      accept={PDF}
      actionLabel="Extract images"
      options={
        <>
          <h3>Extract images</h3>
          <p className="muted small">Saves every picture embedded in the PDF at its original resolution. JPEG images are extracted byte-for-byte (no quality loss).</p>
          <Field label="Format"><Segmented full value={format} onChange={setFormat} options={[{ value: 'original', label: 'Original' }, { value: 'png', label: 'All PNG' }, { value: 'jpg', label: 'All JPG' }]} /></Field>
          <Field label="Ignore images smaller than (px)"><NumberInput min={1} max={2000} value={minSize} onChange={setMinSize} /></Field>
        </>
      }
      process={async ([file], progress) => {
        const doc = await loadPdf(file)
        const list = (await listImages(doc)).filter((im) => im.width >= minSize && im.height >= minSize)
        const out = []
        let skipped = 0
        for (let i = 0; i < list.length; i++) {
          progress(`Image ${i + 1} of ${list.length}`)
          const im = list[i]
          const n = String(out.length + 1).padStart(3, '0')
          if (im.filter === '/DCTDecode' && format !== 'png') {
            out.push({ name: `image-${n}.jpg`, blob: new Blob([im.obj.contents], { type: 'image/jpeg' }) })
            continue
          }
          if (im.filter === '/JPXDecode' && format === 'original') {
            out.push({ name: `image-${n}.jp2`, blob: new Blob([im.obj.contents], { type: 'image/jp2' }) })
            continue
          }
          let dec = null
          try { dec = await im.decode() } catch { dec = null }
          if (!dec) { skipped++; continue }
          const type = format === 'jpg' ? 'image/jpeg' : 'image/png'
          out.push({ name: `image-${n}.${format === 'jpg' ? 'jpg' : 'png'}`, blob: await canvasToBlob(dec.canvas, type, 0.95) })
          dec.canvas.width = dec.canvas.height = 0
        }
        if (!out.length) throw new Error(list.length ? 'The images in this PDF use formats that cannot be extracted here. Try PDF to JPG instead.' : 'No images found in this PDF.')
        const zip = await zipBlobs(out)
        return { blob: zip, name: `${baseName(file.name)}-images.zip`, count: out.length, note: skipped ? `${skipped} image(s) in special formats (e.g. CMYK, JBIG2) were skipped — use PDF to JPG to capture them.` : '' }
      }}
    />
  )
}

/* ---------------- Compare ---------------- */
export function ComparePdf() {
  const [a, setA] = useState([])
  const [b, setB] = useState([])
  const [mode, setMode] = useState('words')
  const task = useTask()
  const run = () => task.run(async (progress) => {
    const { diffWordsWithSpace, diffLines } = await import('diff')
    progress('Reading first PDF')
    const ta = (await extractLines(a[0])).map((p) => p.map(lineToText).join('\n')).join('\n\n')
    progress('Reading second PDF')
    const tb = (await extractLines(b[0])).map((p) => p.map(lineToText).join('\n')).join('\n\n')
    if (!ta.trim() && !tb.trim()) throw new Error('Neither PDF contains selectable text (they may be scans). Run OCR PDF first.')
    const parts = mode === 'words' ? diffWordsWithSpace(ta, tb) : diffLines(ta, tb)
    const added = parts.filter((p) => p.added).reduce((s, p) => s + p.value.length, 0)
    const removed = parts.filter((p) => p.removed).reduce((s, p) => s + p.value.length, 0)
    return { parts, added, removed, same: !added && !removed }
  })
  const r = task.result
  return (
    <div className="compare">
      <div className="grid-2 compare-inputs">
        <div>
          <h4>Original</h4>
          {a.length ? <FileList files={a} setFiles={setA} /> : <DropZone compact accept={PDF} onFiles={setA} label="Choose first PDF" />}
        </div>
        <div>
          <h4>Changed version</h4>
          {b.length ? <FileList files={b} setFiles={setB} /> : <DropZone compact accept={PDF} onFiles={setB} label="Choose second PDF" />}
        </div>
      </div>
      <div className="btn-row center-row">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'words', label: 'Word by word' }, { value: 'lines', label: 'Line by line' }]} />
        <button className="btn btn-primary btn-lg" disabled={!a.length || !b.length || task.busy} onClick={run}>{task.busy ? task.progress || 'Comparing…' : 'Compare PDFs'}</button>
      </div>
      <ErrorBox error={task.error} onClose={task.reset} />
      {task.busy && <Spinner label={task.progress} />}
      {r && (
        <>
          <div className="diff-stats">
            {r.same ? <Alert kind="ok">The text of both documents is identical.</Alert> : (
              <p><span className="diff-add">+{r.added.toLocaleString()} characters added</span> · <span className="diff-del">−{r.removed.toLocaleString()} removed</span></p>
            )}
          </div>
          <pre className="diff-view">
            {r.parts.map((p, i) => <span key={i} className={p.added ? 'diff-add' : p.removed ? 'diff-del' : ''}>{p.value}</span>)}
          </pre>
        </>
      )}
      <p className="muted small">Compares the text content. Layout, images and formatting changes are not detected.</p>
    </div>
  )
}

/* ---------------- OCR PDF ---------------- */
export function OcrPdf() {
  const [langs, setLangs] = useState(['eng'])
  const [output, setOutput] = useState('pdf')
  const [pages, setPages] = useState('all')
  const [dpi, setDpi] = useState(250)
  const toggleLang = (l) => setLangs((cur) => (cur.includes(l) ? cur.filter((x) => x !== l) : cur.length >= 3 ? cur : [...cur, l]))
  const langLabel = useMemo(() => langs.map((l) => OCR_LANGS.find((x) => x[0] === l)?.[1]).join(' + '), [langs])
  return (
    <FileTool
      accept={PDF}
      actionLabel="Run OCR"
      disabled={!langs.length}
      options={
        <>
          <h3>OCR — make scans searchable</h3>
          <p className="muted small">Recognises text in scanned pages so you can search, select and copy it. The OCR engine and language data download once from a CDN; your file stays on your device.</p>
          <Field label={`Languages (up to 3): ${langLabel || 'none'}`}>
            <div className="lang-grid">
              {OCR_LANGS.map(([code, label]) => (
                <button key={code} className={`chip ${langs.includes(code) ? 'active' : ''}`} onClick={() => toggleLang(code)}>{label}</button>
              ))}
            </div>
          </Field>
          <Field label="Output"><Segmented full value={output} onChange={setOutput} options={[{ value: 'pdf', label: 'Searchable PDF' }, { value: 'txt', label: 'Text file' }]} /></Field>
          <Field label="Pages"><input className="input" value={pages} onChange={(e) => setPages(e.target.value)} placeholder="all or 1-5" /></Field>
          <Slider label="Scan resolution" suffix="DPI" min={150} max={400} value={dpi} onChange={setDpi} />
        </>
      }
      process={async ([file], progress) => {
        const doc = await openPdfjs(file)
        const list = pages.trim().toLowerCase() === 'all' || !pages.trim() ? Array.from({ length: doc.numPages }, (_, i) => i + 1) : parseRanges(pages, doc.numPages)
        const ocr = await createOcr(langs.join('+'), progress)
        const { PDFDocument } = await getPdfLib()
        const out = await PDFDocument.create()
        const texts = []
        try {
          for (let k = 0; k < list.length; k++) {
            const { canvas, width, height } = await renderPage(doc, list[k], dpi / 72)
            const data = await ocr.recognize(canvas, { pdf: output === 'pdf', page: `${k + 1}/${list.length}` })
            texts.push(`--- Page ${list[k]} ---\n${data.text}`)
            if (output === 'pdf' && data.pdf) {
              const one = await PDFDocument.load(new Uint8Array(data.pdf))
              const [p] = await out.copyPages(one, [0])
              p.scale(width / p.getWidth(), height / p.getHeight())
              out.addPage(p)
            }
            canvas.width = canvas.height = 0
          }
        } finally {
          await ocr.terminate()
          doc.destroy()
        }
        const name = baseName(file.name)
        if (output === 'txt') return { blob: new Blob([texts.join('\n\n')], { type: 'text/plain;charset=utf-8' }), name: `${name}-ocr.txt` }
        return { blob: pdfBlob(await out.save({ useObjectStreams: true })), name: `${name}-ocr.pdf`, note: 'Text is now searchable and selectable.', noteKind: 'ok' }
      }}
    />
  )
}

