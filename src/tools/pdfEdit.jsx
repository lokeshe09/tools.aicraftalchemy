import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PenLine, Search, Trash2 } from 'lucide-react'
import FileTool from '../components/FileTool'
import PdfEditor from '../components/PdfEditor'
import SignatureCreator from '../components/SignatureCreator'
import { Field, Segmented, Section, Toggle, Slider, NumberInput, Alert, Spinner } from '../components/ui'
import { baseName, parseRanges } from '../lib/files'
import { loadPdf, getPdfLib, saveBlob, pageFrame, hexToRgb01, isWinAnsi, textToPng } from '../lib/pdfDoc'
import { applyElements, FONT_CSS } from '../lib/pdfAnnotate'
import { openPdfjs, renderPage } from '../lib/pdf'

const PDF = 'application/pdf,.pdf'

function pagesFromInput(input, n) {
  const s = String(input || '').trim().toLowerCase()
  if (!s || s === 'all') return Array.from({ length: n }, (_, i) => i)
  return parseRanges(s, n).map((p) => p - 1)
}

/** Draw a single line of text in visual coordinates. place(textWidth, frame) → { vx, vyBase }. */
async function textDrawer(doc, { font = 'helvetica', bold = false, italic = false, size = 12, color = '#000000', opacity = 1 }) {
  const { StandardFonts, rgb, degrees } = await getPdfLib()
  const fam = { helvetica: ['Helvetica', 'HelveticaBold', 'HelveticaOblique', 'HelveticaBoldOblique'], times: ['TimesRoman', 'TimesRomanBold', 'TimesRomanItalic', 'TimesRomanBoldItalic'], courier: ['Courier', 'CourierBold', 'CourierOblique', 'CourierBoldOblique'] }[font]
  const f = await doc.embedFont(StandardFonts[fam[(bold ? 1 : 0) + (italic ? 2 : 0)]])
  const pngCache = {}
  const col = rgb(...hexToRgb01(color))
  const measure = (text) => (isWinAnsi(text) ? f.widthOfTextAtSize(text, size) : textToPng(text, { size, family: FONT_CSS[font], bold, italic }).width)
  // anchorIsBox: place() returns the visual bottom-left of the text box instead of the baseline.
  const draw = async (page, text, place, extraAngle = 0, anchorIsBox = false) => {
    const fr = pageFrame(page)
    if (isWinAnsi(text)) {
      const tw = f.widthOfTextAtSize(text, size)
      const { vx, vyBase } = place(tw, fr, size * 0.7)
      const p = fr.map(vx, vyBase)
      page.drawText(text, { x: p.x, y: p.y, size, font: f, color: col, opacity, rotate: degrees(fr.rot + extraAngle) })
    } else {
      const png = (pngCache[text] ||= textToPng(text, { size, color, family: FONT_CSS[font], bold, italic }))
      png.img ||= await doc.embedPng(png.dataUrl)
      const { vx, vyBase } = place(png.width, fr, png.height, true)
      const p = fr.map(vx, vyBase + (anchorIsBox ? 0 : size * 0.26))
      page.drawImage(png.img, { x: p.x, y: p.y, width: png.width, height: png.height, opacity, rotate: degrees(fr.rot + extraAngle) })
    }
  }
  return { draw, measure, font: f }
}

/* ---------------- Edit PDF ---------------- */
function useSignatureAssets() {
  const [assets, setAssets] = useState({})
  const [creating, setCreating] = useState(null)
  const modal = creating && (
    <SignatureCreator kind={creating} onClose={() => setCreating(null)} onDone={(src) => { setAssets((a) => ({ ...a, [creating]: src })); setCreating(null) }} />
  )
  return { assets, setAssets, creating, setCreating, modal }
}

export function EditPdf() {
  const [files, setFiles] = useState([])
  const [elements, setElements] = useState([])
  const sig = useSignatureAssets()
  return (
    <>
      <FileTool
        files={files}
        setFiles={(f) => { setFiles(f); setElements([]) }}
        accept={PDF}
        modifiesPdf
        actionLabel="Save PDF"
        disabled={!elements.length}
        main={files[0] && (
          <PdfEditor
            file={files[0]}
            elements={elements}
            setElements={setElements}
            tools={['select', 'text', 'image', 'signature', 'rect', 'whiteout', 'highlight', 'line', 'check', 'cross', 'date']}
            assets={sig.assets}
            onNeedAsset={sig.setCreating}
          />
        )}
        options={
          <>
            <h3>Edit PDF</h3>
            <ul className="tips">
              <li><strong>Text</strong> — click anywhere to type. Change font, size and colour below the page.</li>
              <li><strong>Whiteout</strong> — drag over existing content to cover it, then add new text on top.</li>
              <li><strong>Image / Signature</strong> — place logos, stamps or your signature.</li>
              <li>Select an item and press <kbd>Delete</kbd> to remove it, or use “duplicate on every page”.</li>
            </ul>
            <p className="muted small">{elements.length} change{elements.length === 1 ? '' : 's'}</p>
          </>
        }
        process={async ([file]) => {
          const doc = await loadPdf(file)
          await applyElements(doc, elements)
          return { blob: await saveBlob(doc), name: `${baseName(file.name)}-edited.pdf` }
        }}
      />
      {sig.modal}
    </>
  )
}

/* ---------------- Sign PDF (electronic signature) ---------------- */
export function SignPdf() {
  const [files, setFiles] = useState([])
  const [elements, setElements] = useState([])
  const sig = useSignatureAssets()
  const placed = elements.filter((e) => e.type === 'signature').length
  return (
    <>
      <FileTool
        files={files}
        setFiles={(f) => { setFiles(f); setElements([]) }}
        accept={PDF}
        modifiesPdf
        actionLabel="Sign PDF"
        disabled={!elements.length}
        main={files[0] && (
          <PdfEditor
            file={files[0]}
            elements={elements}
            setElements={setElements}
            tools={['select', 'signature', 'initials', 'text', 'date', 'check', 'cross']}
            assets={sig.assets}
            onNeedAsset={sig.setCreating}
          />
        )}
        options={
          <>
            <h3>Your signature</h3>
            {['signature', 'initials'].map((k) => (
              <div key={k} className="sig-slot">
                <span className="field-label">{k === 'signature' ? 'Signature' : 'Initials'}</span>
                {sig.assets[k] ? (
                  <div className="sig-slot-img"><img src={sig.assets[k]} alt={k} /><button className="btn btn-ghost btn-sm" onClick={() => sig.setCreating(k)}>Change</button></div>
                ) : (
                  <button className="btn btn-soft btn-block" onClick={() => sig.setCreating(k)}><PenLine size={16} /> Create {k}</button>
                )}
              </div>
            ))}
            <p className="muted small">Pick <strong>Signature</strong> in the toolbar and click on the page where you want to sign. Add the date, your name or ticks the same way.</p>
            <p className="muted small">{placed} signature{placed === 1 ? '' : 's'} placed</p>
            <Alert kind="info">Need a cryptographic, tamper-proof signature? Use <Link to="/digital-sign-pdf">Digital signature</Link> after signing here.</Alert>
          </>
        }
        process={async ([file]) => {
          const doc = await loadPdf(file)
          await applyElements(doc, elements)
          return { blob: await saveBlob(doc), name: `${baseName(file.name)}-signed.pdf` }
        }}
      />
      {sig.modal}
    </>
  )
}

/* ---------------- Redact ---------------- */
const PATTERNS = {
  email: { label: 'Email addresses', re: /[\w.+-]+@[\w-]+\.[\w.-]+/g },
  phone: { label: 'Phone numbers', re: /(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,5}\)?[\s-]?)\d{3,5}[\s-]?\d{3,5}/g },
  aadhaar: { label: 'Aadhaar numbers', re: /\b\d{4}\s?\d{4}\s?\d{4}\b/g },
  pan: { label: 'PAN numbers', re: /\b[A-Z]{5}\d{4}[A-Z]\b/g },
  card: { label: 'Card numbers', re: /\b(?:\d[ -]?){13,19}\b/g },
}

async function findTextBoxes(file, terms, patterns) {
  const doc = await openPdfjs(file)
  const boxes = []
  const regs = [
    ...terms.map((t) => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')),
    ...patterns.map((k) => new RegExp(PATTERNS[k].re.source, 'g')),
  ]
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const vp = page.getViewport({ scale: 1 })
    const tc = await page.getTextContent()
    for (const item of tc.items) {
      if (!item.str) continue
      for (const re of regs) {
        re.lastIndex = 0
        let m
        while ((m = re.exec(item.str))) {
          if (!m[0]) { re.lastIndex++; continue }
          const [, b, , d, e, f] = item.transform
          const len = item.str.length || 1
          const h = Math.hypot(b, d) || 10
          const x0 = e + (item.width * m.index) / len
          const x1 = e + (item.width * (m.index + m[0].length)) / len
          const r = vp.convertToViewportRectangle([x0 - 1, f - h * 0.25, x1 + 1, f + h * 0.95])
          const [l, t, rr, bb] = [Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.max(r[0], r[2]), Math.max(r[1], r[3])]
          boxes.push({ page: i - 1, x: l / vp.width, y: t / vp.height, w: (rr - l) / vp.width, h: (bb - t) / vp.height })
        }
      }
    }
  }
  doc.destroy()
  return boxes
}

export function RedactPdf() {
  const [files, setFiles] = useState([])
  const [elements, setElements] = useState([])
  const [terms, setTerms] = useState('')
  const [pats, setPats] = useState([])
  const [finding, setFinding] = useState(false)
  const [found, setFound] = useState(null)
  const [dpi, setDpi] = useState(200)
  const [strip, setStrip] = useState(true)

  const find = async () => {
    setFinding(true)
    try {
      const list = terms.split(',').map((t) => t.trim()).filter(Boolean)
      const boxes = await findTextBoxes(files[0], list, pats)
      setElements((els) => [...els, ...boxes.map((b) => ({ ...b, id: Math.random().toString(36).slice(2), type: 'redact' }))])
      setFound(boxes.length)
    } catch (e) {
      setFound(e.message)
    }
    setFinding(false)
  }
  const pagesAffected = new Set(elements.map((e) => e.page)).size

  return (
    <FileTool
      files={files}
      setFiles={(f) => { setFiles(f); setElements([]); setFound(null) }}
      accept={PDF}
      modifiesPdf
      actionLabel="Redact PDF"
      disabled={!elements.length}
      main={files[0] && <PdfEditor file={files[0]} elements={elements} setElements={setElements} tools={['select', 'redact']} />}
      options={
        <>
          <h3>Redact PDF</h3>
          <p className="muted small">Draw black boxes over anything sensitive. Redacted pages are flattened, so the hidden text is <strong>permanently removed</strong> — not just covered.</p>
          <Section title="Find & redact">
            <Field label="Words or phrases" hint="Separate with commas"><input className="input" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="John Smith, Account 1234" /></Field>
            <div className="check-grid">
              {Object.entries(PATTERNS).map(([k, p]) => (
                <label key={k} className="check"><input type="checkbox" checked={pats.includes(k)} onChange={(e) => setPats(e.target.checked ? [...pats, k] : pats.filter((x) => x !== k))} /> {p.label}</label>
              ))}
            </div>
            <button className="btn btn-soft btn-block" disabled={finding || (!terms.trim() && !pats.length)} onClick={find}><Search size={16} /> {finding ? 'Searching…' : 'Find & mark'}</button>
            {found !== null && <p className="muted small">{typeof found === 'number' ? `${found} match${found === 1 ? '' : 'es'} marked. Review them on the pages.` : found}</p>}
            {elements.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setElements([])}><Trash2 size={14} /> Clear all marks</button>}
          </Section>
          <Section title="Output">
            <Slider label="Quality of redacted pages" suffix="DPI" min={100} max={400} value={dpi} onChange={setDpi} />
            <Toggle checked={strip} onChange={setStrip} label="Remove metadata (author, title…)" />
          </Section>
          <p className="muted small">{elements.length} area{elements.length === 1 ? '' : 's'} on {pagesAffected} page{pagesAffected === 1 ? '' : 's'}</p>
        </>
      }
      process={async ([file], progress) => {
        const doc = await loadPdf(file)
        const pdfjsDoc = await openPdfjs(file)
        const byPage = new Map()
        for (const el of elements) byPage.set(el.page, [...(byPage.get(el.page) || []), el])
        let n = 0
        for (const [pi, boxes] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
          progress(`Redacting page ${++n} of ${byPage.size}`)
          const { canvas, width, height } = await renderPage(pdfjsDoc, pi + 1, dpi / 72)
          const ctx = canvas.getContext('2d')
          ctx.fillStyle = '#000'
          for (const b of boxes) ctx.fillRect(Math.floor(b.x * canvas.width), Math.floor(b.y * canvas.height), Math.ceil(b.w * canvas.width) + 1, Math.ceil(b.h * canvas.height) + 1)
          const jpg = await doc.embedJpg(canvas.toDataURL('image/jpeg', 0.9))
          canvas.width = canvas.height = 0
          const page = doc.insertPage(pi, [width, height])
          page.drawImage(jpg, { x: 0, y: 0, width, height })
          doc.removePage(pi + 1)
        }
        pdfjsDoc.destroy()
        if (strip) {
          const { PDFName } = await getPdfLib()
          doc.catalog.delete(PDFName.of('Metadata'))
          ;['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer'].forEach((k) => doc.getInfoDict().delete(PDFName.of(k)))
        }
        return { blob: await saveBlob(doc), name: `${baseName(file.name)}-redacted.pdf`, note: `${elements.length} area(s) permanently redacted on ${byPage.size} page(s).`, noteKind: 'ok' }
      }}
    />
  )
}

/* ---------------- Fill forms ---------------- */
export function FillForm() {
  const [files, setFiles] = useState([])
  const [fields, setFields] = useState(null)
  const [values, setValues] = useState({})
  const [flatten, setFlatten] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setFields(null); setValues({}); setError('')
    if (!files[0]) return
    let alive = true
    ;(async () => {
      const L = await getPdfLib()
      const doc = await loadPdf(files[0])
      const out = []
      const vals = {}
      for (const f of doc.getForm().getFields()) {
        const name = f.getName()
        let type = null
        let options = []
        let value = ''
        if (f instanceof L.PDFTextField) { type = f.isMultiline() ? 'textarea' : 'text'; value = f.getText() || '' }
        else if (f instanceof L.PDFCheckBox) { type = 'checkbox'; value = f.isChecked() }
        else if (f instanceof L.PDFRadioGroup) { type = 'radio'; options = f.getOptions(); value = f.getSelected() || '' }
        else if (f instanceof L.PDFDropdown) { type = 'select'; options = f.getOptions(); value = f.getSelected()[0] || '' }
        else if (f instanceof L.PDFOptionList) { type = 'select'; options = f.getOptions(); value = f.getSelected()[0] || '' }
        if (!type) continue
        out.push({ name, type, options, readOnly: f.isReadOnly(), label: name.split('.').pop().replace(/[_]+/g, ' ') })
        vals[name] = value
      }
      if (alive) { setFields(out); setValues(vals) }
    })().catch((e) => alive && setError(e.message))
    return () => { alive = false }
  }, [files])

  return (
    <FileTool
      files={files}
      setFiles={setFiles}
      accept={PDF}
      modifiesPdf
      actionLabel="Save filled PDF"
      disabled={!fields?.length}
      main={
        <>
          {error && <Alert kind="error">{error}</Alert>}
          {!fields && !error && <Spinner label="Reading form fields…" />}
          {fields && !fields.length && (
            <Alert kind="info">This PDF has no fillable form fields. Use <Link to="/edit-pdf">Edit PDF</Link> to type text anywhere on the page instead.</Alert>
          )}
          {fields?.length > 0 && (
            <div className="form-fields">
              {fields.map((f) => (
                <Field key={f.name} label={f.label} hint={f.readOnly ? 'Read-only field' : undefined}>
                  {f.type === 'text' && <input className="input" value={values[f.name]} disabled={f.readOnly} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />}
                  {f.type === 'textarea' && <textarea className="textarea" rows={3} value={values[f.name]} disabled={f.readOnly} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />}
                  {f.type === 'checkbox' && <Toggle checked={!!values[f.name]} onChange={(v) => setValues({ ...values, [f.name]: v })} label={values[f.name] ? 'Checked' : 'Unchecked'} />}
                  {(f.type === 'radio' || f.type === 'select') && (
                    <select className="input" value={values[f.name]} disabled={f.readOnly} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}>
                      <option value="">—</option>
                      {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  )}
                </Field>
              ))}
            </div>
          )}
        </>
      }
      options={
        <>
          <h3>Fill PDF form</h3>
          <p className="muted small">{fields ? `${fields.length} fillable field${fields.length === 1 ? '' : 's'} found.` : ''}</p>
          <Toggle checked={flatten} onChange={setFlatten} label="Flatten after filling" hint="Makes the answers permanent (no longer editable)." />
        </>
      }
      process={async ([file]) => {
        const L = await getPdfLib()
        const doc = await loadPdf(file)
        const form = doc.getForm()
        const nonLatin = []
        for (const f of form.getFields()) {
          const name = f.getName()
          if (!(name in values) || f.isReadOnly()) continue
          const v = values[name]
          if (f instanceof L.PDFTextField) {
            if (!isWinAnsi(String(v))) nonLatin.push(name)
            f.setText(String(v || ''))
          } else if (f instanceof L.PDFCheckBox) v ? f.check() : f.uncheck()
          else if (f instanceof L.PDFRadioGroup) { if (v) f.select(v); else f.clear() }
          else if (f instanceof L.PDFDropdown || f instanceof L.PDFOptionList) { if (v) f.select(v); else f.clear() }
        }
        if (nonLatin.length) throw new Error(`Fields ${nonLatin.join(', ')} contain characters the form's standard font can't display. Use Edit PDF to type them instead.`)
        const font = await doc.embedFont(L.StandardFonts.Helvetica)
        form.updateFieldAppearances(font)
        if (flatten) form.flatten()
        return { blob: await saveBlob(doc), name: `${baseName(file.name)}-filled.pdf` }
      }}
    />
  )
}

/* ---------------- Watermark ---------------- */
const POS9 = ['top-left', 'top-center', 'top-right', 'middle-left', 'center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right']

function PosGrid({ value, onChange, options = POS9 }) {
  return (
    <div className={`pos-grid ${options.length === 6 ? 'six' : ''}`}>
      {options.map((p) => (
        <button key={p} className={`pos-cell ${value === p ? 'active' : ''}`} onClick={() => onChange(p)} title={p.replace('-', ' ')} aria-label={p}><span /></button>
      ))}
    </div>
  )
}

export function WatermarkPdf() {
  const [kind, setKind] = useState('text')
  const [text, setText] = useState('CONFIDENTIAL')
  const [font, setFont] = useState('helvetica')
  const [bold, setBold] = useState(true)
  const [size, setSize] = useState(60)
  const [color, setColor] = useState('#d32f2f')
  const [opacity, setOpacity] = useState(25)
  const [angle, setAngle] = useState(45)
  const [pos, setPos] = useState('center')
  const [tile, setTile] = useState(false)
  const [image, setImage] = useState(null)
  const [imgScale, setImgScale] = useState(40)
  const [pages, setPages] = useState('all')

  return (
    <FileTool
      accept={PDF}
      modifiesPdf
      actionLabel="Add watermark"
      options={
        <>
          <h3>Watermark</h3>
          <Segmented full value={kind} onChange={setKind} options={[{ value: 'text', label: 'Text' }, { value: 'image', label: 'Image' }]} />
          {kind === 'text' ? (
            <>
              <Field label="Text"><input className="input" value={text} onChange={(e) => setText(e.target.value)} /></Field>
              <div className="row-2">
                <Segmented value={font} onChange={setFont} options={[{ value: 'helvetica', label: 'Sans' }, { value: 'times', label: 'Serif' }, { value: 'courier', label: 'Mono' }]} />
                <button className={`btn btn-sm ${bold ? 'btn-primary' : 'btn-soft'}`} onClick={() => setBold(!bold)}><b>B</b></button>
                <input className="input color sm" type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Colour" />
              </div>
              <Slider label="Font size" suffix="pt" min={8} max={200} value={size} onChange={setSize} />
            </>
          ) : (
            <>
              <Field label="Image (PNG or JPG)"><input className="input" type="file" accept="image/png,image/jpeg" onChange={(e) => setImage(e.target.files[0] || null)} /></Field>
              <Slider label="Width" suffix="% of page" min={5} max={100} value={imgScale} onChange={setImgScale} />
            </>
          )}
          <Slider label="Opacity" suffix="%" min={5} max={100} value={opacity} onChange={setOpacity} />
          <Slider label="Rotation" suffix="°" min={-180} max={180} value={angle} onChange={setAngle} />
          <Toggle checked={tile} onChange={setTile} label="Mosaic (repeat across the page)" />
          {!tile && <Field label="Position"><PosGrid value={pos} onChange={setPos} /></Field>}
          <Field label="Pages" hint="“all” or ranges like 1-3, 8"><input className="input" value={pages} onChange={(e) => setPages(e.target.value)} /></Field>
        </>
      }
      process={async ([file]) => {
        const { degrees } = await getPdfLib()
        const doc = await loadPdf(file)
        const targets = pagesFromInput(pages, doc.getPageCount())
        const rad = (angle * Math.PI) / 180
        const op = opacity / 100
        let img = null
        let drawer = null
        if (kind === 'image') {
          if (!image) throw new Error('Choose a watermark image.')
          const bytes = await image.arrayBuffer()
          img = image.type === 'image/png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)
        } else {
          if (!text.trim()) throw new Error('Enter watermark text.')
          drawer = await textDrawer(doc, { font, bold, size, color, opacity: op })
        }
        for (const i of targets) {
          const page = doc.getPage(i)
          const fr = pageFrame(page)
          let w, h
          if (img) { w = (fr.vw * imgScale) / 100; h = (img.height / img.width) * w } else {
            w = drawer.measure(text)
            h = isWinAnsi(text) ? size * 0.7 : size * 1.2
          }
          const m = 36
          const centers = []
          if (tile) {
            const stepX = w * Math.abs(Math.cos(rad)) + h * Math.abs(Math.sin(rad)) + 70
            const stepY = w * Math.abs(Math.sin(rad)) + h * Math.abs(Math.cos(rad)) + 70
            for (let y = stepY / 2; y < fr.vh + stepY; y += stepY) for (let x = stepX / 2; x < fr.vw + stepX; x += stepX) centers.push([x, y])
          } else {
            const [v, hz] = pos === 'center' ? ['middle', 'center'] : pos.split('-')
            const bw = w * Math.abs(Math.cos(rad)) + h * Math.abs(Math.sin(rad))
            const bh = w * Math.abs(Math.sin(rad)) + h * Math.abs(Math.cos(rad))
            const cx = hz === 'left' ? m + bw / 2 : hz === 'right' ? fr.vw - m - bw / 2 : fr.vw / 2
            const cy = v === 'top' ? m + bh / 2 : v === 'bottom' ? fr.vh - m - bh / 2 : fr.vh / 2
            centers.push([cx, cy])
          }
          for (const [cx, cyTop] of centers) {
            // Work in a y-up visual system so the rotation maths is standard.
            const cy = fr.vh - cyTop
            const ax = cx - (w / 2) * Math.cos(rad) + (h / 2) * Math.sin(rad)
            const ay = cy - (w / 2) * Math.sin(rad) - (h / 2) * Math.cos(rad)
            if (img) {
              const p = fr.map(ax, fr.vh - ay)
              page.drawImage(img, { x: p.x, y: p.y, width: w, height: h, rotate: degrees(fr.rot + angle), opacity: op })
            } else {
              await drawer.draw(page, text, () => ({ vx: ax, vyBase: fr.vh - ay }), angle, true)
            }
          }
        }
        return { blob: await saveBlob(doc), name: `${baseName(file.name)}-watermarked.pdf` }
      }}
    />
  )
}

/* ---------------- Page numbers ---------------- */
const POS6 = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right']

export function PageNumbers() {
  const [pos, setPos] = useState('bottom-center')
  const [format, setFormat] = useState('{n}')
  const [custom, setCustom] = useState('Page {n} of {total}')
  const [start, setStart] = useState(1)
  const [size, setSize] = useState(11)
  const [margin, setMargin] = useState(28)
  const [font, setFont] = useState('helvetica')
  const [color, setColor] = useState('#333333')
  const [pages, setPages] = useState('all')
  const [mirror, setMirror] = useState(false)

  return (
    <FileTool
      accept={PDF}
      modifiesPdf
      actionLabel="Add page numbers"
      options={
        <>
          <h3>Page numbers</h3>
          <Field label="Position"><PosGrid value={pos} onChange={setPos} options={POS6} /></Field>
          <Toggle checked={mirror} onChange={setMirror} label="Mirror on facing pages" hint="Left/right swap on even pages, for booklets." />
          <Field label="Format">
            <select className="input" value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="{n}">1</option>
              <option value="Page {n}">Page 1</option>
              <option value="{n} / {total}">1 / 10</option>
              <option value="Page {n} of {total}">Page 1 of 10</option>
              <option value="- {n} -">- 1 -</option>
              <option value="custom">Custom…</option>
            </select>
          </Field>
          {format === 'custom' && <Field label="Custom text" hint="Use {n} for the number and {total} for the page count"><input className="input" value={custom} onChange={(e) => setCustom(e.target.value)} /></Field>}
          <div className="grid-2">
            <Field label="First number"><NumberInput value={start} onChange={(v) => setStart(Math.round(v))} /></Field>
            <Field label="Pages to number"><input className="input" value={pages} onChange={(e) => setPages(e.target.value)} placeholder="all or 3-end" /></Field>
          </div>
          <div className="row-2">
            <Segmented value={font} onChange={setFont} options={[{ value: 'helvetica', label: 'Sans' }, { value: 'times', label: 'Serif' }, { value: 'courier', label: 'Mono' }]} />
            <input className="input color sm" type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Colour" />
          </div>
          <div className="grid-2">
            <Field label="Font size (pt)"><NumberInput min={4} max={72} value={size} onChange={setSize} /></Field>
            <Field label="Margin (pt)"><NumberInput min={0} max={200} value={margin} onChange={setMargin} /></Field>
          </div>
        </>
      }
      process={async ([file]) => {
        const doc = await loadPdf(file)
        const n = doc.getPageCount()
        const targets = pagesFromInput(pages, n)
        const total = targets.length + start - 1
        const tpl = format === 'custom' ? custom : format
        const drawer = await textDrawer(doc, { font, size, color })
        const [v, hz0] = pos.split('-')
        for (let k = 0; k < targets.length; k++) {
          const i = targets[k]
          const label = tpl.replaceAll('{n}', String(k + start)).replaceAll('{total}', String(total))
          const hz = mirror && i % 2 === 1 ? (hz0 === 'left' ? 'right' : hz0 === 'right' ? 'left' : hz0) : hz0
          await drawer.draw(doc.getPage(i), label, (tw, fr) => ({
            vx: hz === 'left' ? margin : hz === 'right' ? fr.vw - margin - tw : (fr.vw - tw) / 2,
            vyBase: v === 'top' ? margin + size * 0.8 : fr.vh - margin,
          }))
        }
        return { blob: await saveBlob(doc), name: `${baseName(file.name)}-numbered.pdf` }
      }}
    />
  )
}

/* ---------------- Header & footer ---------------- */
export function HeaderFooter() {
  const [slots, setSlots] = useState({ 'top-left': '', 'top-center': '', 'top-right': '{date}', 'bottom-left': '{filename}', 'bottom-center': '', 'bottom-right': 'Page {n} of {total}' })
  const [size, setSize] = useState(9)
  const [color, setColor] = useState('#444444')
  const [font, setFont] = useState('helvetica')
  const [margin, setMargin] = useState(24)
  const [pages, setPages] = useState('all')
  const [line, setLine] = useState(false)
  return (
    <FileTool
      accept={PDF}
      modifiesPdf
      actionLabel="Add header & footer"
      options={
        <>
          <h3>Header &amp; footer</h3>
          <p className="muted small">Tokens: <code>{'{n}'}</code> page, <code>{'{total}'}</code> pages, <code>{'{date}'}</code>, <code>{'{filename}'}</code></p>
          <Section title="Header">
            {['top-left', 'top-center', 'top-right'].map((k) => <input key={k} className="input" placeholder={k.split('-')[1]} value={slots[k]} onChange={(e) => setSlots({ ...slots, [k]: e.target.value })} />)}
          </Section>
          <Section title="Footer">
            {['bottom-left', 'bottom-center', 'bottom-right'].map((k) => <input key={k} className="input" placeholder={k.split('-')[1]} value={slots[k]} onChange={(e) => setSlots({ ...slots, [k]: e.target.value })} />)}
          </Section>
          <div className="row-2">
            <Segmented value={font} onChange={setFont} options={[{ value: 'helvetica', label: 'Sans' }, { value: 'times', label: 'Serif' }, { value: 'courier', label: 'Mono' }]} />
            <input className="input color sm" type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Colour" />
          </div>
          <div className="grid-2">
            <Field label="Font size (pt)"><NumberInput min={4} max={48} value={size} onChange={setSize} /></Field>
            <Field label="Margin (pt)"><NumberInput min={0} max={150} value={margin} onChange={setMargin} /></Field>
          </div>
          <Field label="Pages"><input className="input" value={pages} onChange={(e) => setPages(e.target.value)} /></Field>
          <Toggle checked={line} onChange={setLine} label="Separator lines" />
        </>
      }
      process={async ([file]) => {
        const { rgb } = await getPdfLib()
        const doc = await loadPdf(file)
        const targets = pagesFromInput(pages, doc.getPageCount())
        const drawer = await textDrawer(doc, { font, size, color })
        const date = new Date().toLocaleDateString(undefined, { dateStyle: 'medium' })
        for (let k = 0; k < targets.length; k++) {
          const page = doc.getPage(targets[k])
          for (const [slot, tpl] of Object.entries(slots)) {
            if (!tpl.trim()) continue
            const label = tpl.replaceAll('{n}', String(k + 1)).replaceAll('{total}', String(targets.length)).replaceAll('{date}', date).replaceAll('{filename}', file.name)
            const [v, hz] = slot.split('-')
            await drawer.draw(page, label, (tw, fr) => ({
              vx: hz === 'left' ? margin : hz === 'right' ? fr.vw - margin - tw : (fr.vw - tw) / 2,
              vyBase: v === 'top' ? margin + size * 0.8 : fr.vh - margin,
            }))
          }
          if (line) {
            const fr = pageFrame(page)
            const c = rgb(...hexToRgb01(color))
            const hasTop = ['top-left', 'top-center', 'top-right'].some((s) => slots[s].trim())
            const hasBottom = ['bottom-left', 'bottom-center', 'bottom-right'].some((s) => slots[s].trim())
            if (hasTop) page.drawLine({ start: fr.map(margin, margin + size * 1.4), end: fr.map(fr.vw - margin, margin + size * 1.4), thickness: 0.5, color: c })
            if (hasBottom) page.drawLine({ start: fr.map(margin, fr.vh - margin - size * 1.3), end: fr.map(fr.vw - margin, fr.vh - margin - size * 1.3), thickness: 0.5, color: c })
          }
        }
        return { blob: await saveBlob(doc), name: `${baseName(file.name)}-header-footer.pdf` }
      }}
    />
  )
}

/* ---------------- Crop (visual) ---------------- */
export function CropPdf() {
  const [files, setFiles] = useState([])
  const [preview, setPreview] = useState(null)
  const [pageCount, setPageCount] = useState(0)
  const [pageNo, setPageNo] = useState(1)
  const [sel, setSel] = useState({ x: 0.06, y: 0.06, w: 0.88, h: 0.88 })
  const [scope, setScope] = useState('all')
  const stage = useRef(null)
  const drag = useRef(null)

  useEffect(() => {
    if (!files[0]) return
    let alive = true
    ;(async () => {
      const doc = await openPdfjs(files[0])
      const p = Math.min(pageNo, doc.numPages)
      const { canvas } = await renderPage(doc, p, 1.4)
      if (!alive) return
      setPageCount(doc.numPages)
      setPreview(canvas.toDataURL('image/jpeg', 0.85))
      doc.destroy()
    })().catch(() => setPreview(null))
    return () => { alive = false }
  }, [files, pageNo])

  const pt = (e) => {
    const r = stage.current.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
  }
  const down = (e, kind) => {
    e.stopPropagation()
    e.preventDefault()
    stage.current.setPointerCapture(e.pointerId)
    drag.current = { kind, start: pt(e), sel }
  }
  const move = (e) => {
    const d = drag.current
    if (!d) return
    const p = pt(e)
    const dx = p.x - d.start.x
    const dy = p.y - d.start.y
    const s = d.sel
    if (d.kind === 'move') setSel({ ...s, x: Math.min(1 - s.w, Math.max(0, s.x + dx)), y: Math.min(1 - s.h, Math.max(0, s.y + dy)) })
    else if (d.kind === 'se') setSel({ ...s, w: Math.max(0.05, Math.min(1 - s.x, s.w + dx)), h: Math.max(0.05, Math.min(1 - s.y, s.h + dy)) })
    else if (d.kind === 'nw') {
      const x = Math.min(s.x + s.w - 0.05, Math.max(0, s.x + dx))
      const y = Math.min(s.y + s.h - 0.05, Math.max(0, s.y + dy))
      setSel({ x, y, w: s.w + (s.x - x), h: s.h + (s.y - y) })
    }
  }
  const pct = (v) => Math.round(v * 1000) / 10

  return (
    <FileTool
      files={files}
      setFiles={(f) => { setFiles(f); setPageNo(1); setPreview(null) }}
      accept={PDF}
      modifiesPdf
      actionLabel="Crop PDF"
      main={
        preview ? (
          <div className="crop-wrap">
            <div className="crop-stage" ref={stage} onPointerMove={move} onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}>
              <img src={preview} alt="Page preview" draggable={false} />
              <div className="crop-sel" style={{ left: `${sel.x * 100}%`, top: `${sel.y * 100}%`, width: `${sel.w * 100}%`, height: `${sel.h * 100}%` }} onPointerDown={(e) => down(e, 'move')}>
                <span className="crop-handle nw" onPointerDown={(e) => down(e, 'nw')} />
                <span className="crop-handle se" onPointerDown={(e) => down(e, 'se')} />
              </div>
            </div>
            {pageCount > 1 && (
              <div className="btn-row center-row">
                <button className="btn btn-ghost btn-sm" disabled={pageNo <= 1} onClick={() => setPageNo(pageNo - 1)}>‹ Prev</button>
                <span className="muted small">Page {pageNo} / {pageCount}</span>
                <button className="btn btn-ghost btn-sm" disabled={pageNo >= pageCount} onClick={() => setPageNo(pageNo + 1)}>Next ›</button>
              </div>
            )}
          </div>
        ) : <Spinner label="Loading page…" />
      }
      options={
        <>
          <h3>Crop PDF</h3>
          <p className="muted small">Drag the box or its corners to choose the area to keep.</p>
          <div className="grid-2">
            <Field label="Left %"><NumberInput min={0} max={95} step={0.5} value={pct(sel.x)} onChange={(v) => setSel({ ...sel, x: Math.min(v / 100, 1 - sel.w) })} /></Field>
            <Field label="Top %"><NumberInput min={0} max={95} step={0.5} value={pct(sel.y)} onChange={(v) => setSel({ ...sel, y: Math.min(v / 100, 1 - sel.h) })} /></Field>
            <Field label="Width %"><NumberInput min={5} max={100} step={0.5} value={pct(sel.w)} onChange={(v) => setSel({ ...sel, w: Math.min(v / 100, 1 - sel.x) })} /></Field>
            <Field label="Height %"><NumberInput min={5} max={100} step={0.5} value={pct(sel.h)} onChange={(v) => setSel({ ...sel, h: Math.min(v / 100, 1 - sel.y) })} /></Field>
          </div>
          <Field label="Apply to">
            <Segmented full value={scope} onChange={setScope} options={[{ value: 'all', label: 'All pages' }, { value: 'this', label: `Page ${pageNo} only` }]} />
          </Field>
          <button className="btn btn-ghost btn-sm" onClick={() => setSel({ x: 0, y: 0, w: 1, h: 1 })}>Reset</button>
        </>
      }
      process={async ([file]) => {
        const doc = await loadPdf(file)
        const pages = doc.getPages()
        const list = scope === 'all' ? pages : [pages[pageNo - 1]]
        for (const page of list) {
          const fr = pageFrame(page)
          const a = fr.map(sel.x * fr.vw, sel.y * fr.vh)
          const b = fr.map((sel.x + sel.w) * fr.vw, (sel.y + sel.h) * fr.vh)
          const x = Math.min(a.x, b.x)
          const y = Math.min(a.y, b.y)
          const w = Math.abs(a.x - b.x)
          const h = Math.abs(a.y - b.y)
          page.setCropBox(x, y, w, h)
          page.setMediaBox(x, y, w, h)
          page.setTrimBox(x, y, w, h)
          page.setBleedBox(x, y, w, h)
        }
        return { blob: await saveBlob(doc), name: `${baseName(file.name)}-cropped.pdf` }
      }}
    />
  )
}

/* ---------------- Metadata ---------------- */
const EMPTY_META = { title: '', author: '', subject: '', keywords: '', creator: '', producer: '' }
export function EditMetadata() {
  const [files, setFiles] = useState([])
  const [meta, setMeta] = useState(EMPTY_META)
  const [dates, setDates] = useState({})
  const [strip, setStrip] = useState(false)

  useEffect(() => {
    if (!files[0]) return
    loadPdf(files[0]).then((d) => {
      setMeta({ title: d.getTitle() || '', author: d.getAuthor() || '', subject: d.getSubject() || '', keywords: d.getKeywords() || '', creator: d.getCreator() || '', producer: d.getProducer() || '' })
      setDates({ created: d.getCreationDate(), modified: d.getModificationDate() })
    }).catch(() => {})
  }, [files])

  return (
    <FileTool
      files={files}
      setFiles={setFiles}
      accept={PDF}
      modifiesPdf
      actionLabel="Save properties"
      options={
        <>
          <h3>Document properties</h3>
          {Object.keys(meta).map((k) => (
            <Field key={k} label={k[0].toUpperCase() + k.slice(1)}>
              <input className="input" value={meta[k]} disabled={strip} onChange={(e) => setMeta({ ...meta, [k]: e.target.value })} />
            </Field>
          ))}
          {(dates.created || dates.modified) && <p className="muted small">Created {dates.created?.toLocaleString() || '—'} · Modified {dates.modified?.toLocaleString() || '—'}</p>}
          <Toggle checked={strip} onChange={setStrip} label="Remove all metadata" hint="Clears every property, dates and the XMP packet — good for privacy." />
        </>
      }
      process={async ([file]) => {
        const { PDFName } = await getPdfLib()
        const doc = await loadPdf(file)
        if (strip) {
          const info = doc.getInfoDict()
          for (const k of info.keys()) info.delete(k)
          doc.catalog.delete(PDFName.of('Metadata'))
        } else {
          doc.setTitle(meta.title)
          doc.setAuthor(meta.author)
          doc.setSubject(meta.subject)
          doc.setKeywords(meta.keywords ? meta.keywords.split(/[,;]\s*/).filter(Boolean) : [])
          doc.setCreator(meta.creator)
          doc.setProducer(meta.producer)
          doc.setModificationDate(new Date())
        }
        return { blob: await saveBlob(doc), name: `${baseName(file.name)}.pdf` }
      }}
    />
  )
}

/* ---------------- Flatten ---------------- */
export function FlattenPdf() {
  return (
    <FileTool
      accept={PDF}
      modifiesPdf
      actionLabel="Flatten PDF"
      options={<><h3>Flatten PDF</h3><p className="muted small">Merges fillable form fields into the page so the answers are permanent and can't be edited.</p></>}
      process={async ([file]) => {
        const doc = await loadPdf(file)
        const form = doc.getForm()
        const count = form.getFields().length
        if (!count) return { blob: file, name: `${baseName(file.name)}.pdf`, note: 'This PDF has no form fields, so there was nothing to flatten.', noteKind: 'info' }
        try {
          form.updateFieldAppearances()
          form.flatten()
        } catch (e) {
          throw new Error(`Some form fields could not be flattened: ${e.message}`)
        }
        return { blob: await saveBlob(doc), name: `${baseName(file.name)}-flattened.pdf`, note: `${count} field${count === 1 ? '' : 's'} flattened.`, noteKind: 'ok' }
      }}
    />
  )
}

/* ---------------- Remove annotations ---------------- */
export function RemoveAnnotations() {
  const [keepLinks, setKeepLinks] = useState(true)
  const [keepForms, setKeepForms] = useState(true)
  return (
    <FileTool
      accept={PDF}
      modifiesPdf
      actionLabel="Remove annotations"
      options={
        <>
          <h3>Remove annotations</h3>
          <p className="muted small">Deletes comments, highlights, sticky notes, stamps and drawings.</p>
          <Toggle checked={keepLinks} onChange={setKeepLinks} label="Keep hyperlinks" />
          <Toggle checked={keepForms} onChange={setKeepForms} label="Keep form fields" />
        </>
      }
      process={async ([file]) => {
        const { PDFName, PDFArray, PDFDict } = await getPdfLib()
        const doc = await loadPdf(file)
        let removed = 0
        for (const page of doc.getPages()) {
          const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray)
          if (!annots) continue
          const keep = PDFArray.withContext(doc.context)
          for (let i = 0; i < annots.size(); i++) {
            const ref = annots.get(i)
            const a = doc.context.lookup(ref)
            const sub = a instanceof PDFDict ? a.get(PDFName.of('Subtype'))?.toString() : ''
            if ((keepLinks && sub === '/Link') || (keepForms && sub === '/Widget')) keep.push(ref)
            else removed++
          }
          if (keep.size()) page.node.set(PDFName.of('Annots'), keep)
          else page.node.delete(PDFName.of('Annots'))
        }
        if (!keepForms) doc.catalog.delete(PDFName.of('AcroForm'))
        return { blob: await saveBlob(doc), name: `${baseName(file.name)}-clean.pdf`, note: `${removed} annotation${removed === 1 ? '' : 's'} removed.`, noteKind: removed ? 'ok' : 'info' }
      }}
    />
  )
}

