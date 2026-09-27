import { useEffect, useRef, useState } from 'react'
import FileTool from '../components/FileTool'
import { Field, Segmented } from '../components/ui'
import { baseName, formatBytes, pdfBlob } from '../utils/files'
import { openPdfjs, rasterizePdf, renderPage } from '../utils/pdf'
import { loadPdf } from './pdfOrganize'

const PDF = 'application/pdf,.pdf'

const hexToRgb = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function SizeCompare({ result, original }) {
  if (!original || !result?.blob) return null
  const saved = 1 - result.blob.size / original
  return (
    <p className="size-compare">
      {formatBytes(original)} → <strong>{formatBytes(result.blob.size)}</strong>
      {saved > 0 && <span className="badge-ok">−{Math.round(saved * 100)}%</span>}
    </p>
  )
}

/* ---------------- Compress ---------------- */
export function CompressPdf() {
  const [level, setLevel] = useState('recommended')
  const [original, setOriginal] = useState(0)
  const presets = {
    lossless: null,
    low: { scale: 1.6, quality: 0.8 },
    recommended: { scale: 1.25, quality: 0.62 },
    extreme: { scale: 0.95, quality: 0.42 },
  }
  return (
    <FileTool
      accept={PDF}
      dropLabel="Select PDF file"
      actionLabel="Compress PDF"
      resultTitle="Your PDF has been compressed!"
      resultExtra={(r) => <SizeCompare result={r} original={original} />}
      options={
        <>
          <h3>Compression level</h3>
          <div className="radio-cards">
            {[
              ['extreme', 'Extreme compression', 'Smallest file, lower quality'],
              ['recommended', 'Recommended', 'Good quality, good compression'],
              ['low', 'Less compression', 'High quality, less compression'],
              ['lossless', 'Lossless', 'Keeps text selectable, smaller gains'],
            ].map(([v, t, d]) => (
              <button key={v} className={`radio-card ${level === v ? 'active' : ''}`} onClick={() => setLevel(v)}>
                <strong>{t}</strong><span>{d}</span>
              </button>
            ))}
          </div>
          {level !== 'lossless' && <p className="muted small">Pages are re-rendered as optimized images, so text will no longer be selectable.</p>}
        </>
      }
      process={async ([file], progress) => {
        setOriginal(file.size)
        let blob
        if (level === 'lossless') {
          const doc = await loadPdf(file)
          blob = pdfBlob(await doc.save({ useObjectStreams: true }))
        } else {
          blob = await rasterizePdf(file, { ...presets[level], progress })
        }
        if (blob.size >= file.size) blob = file // already optimal
        return { blob, name: `${baseName(file.name)}-compressed.pdf` }
      }}
    />
  )
}

/* ---------------- Grayscale ---------------- */
export function GrayscalePdf() {
  return (
    <FileTool
      accept={PDF}
      dropLabel="Select PDF file"
      actionLabel="Convert to grayscale"
      options={<><h3>Grayscale PDF</h3><p className="muted">Removes all colour from your PDF — great for printing in black &amp; white.</p></>}
      process={async ([file], progress) => ({
        blob: await rasterizePdf(file, { scale: 1.6, quality: 0.8, grayscale: true, progress }),
        name: `${baseName(file.name)}-grayscale.pdf`,
      })}
    />
  )
}

/* ---------------- Watermark ---------------- */
export function WatermarkPdf() {
  const [kind, setKind] = useState('text')
  const [text, setText] = useState('CONFIDENTIAL')
  const [size, setSize] = useState(56)
  const [color, setColor] = useState('#e5322d')
  const [opacity, setOpacity] = useState(0.3)
  const [angle, setAngle] = useState(45)
  const [layout, setLayout] = useState('center')
  const [image, setImage] = useState(null)
  const [imgScale, setImgScale] = useState(0.4)

  return (
    <FileTool
      accept={PDF}
      dropLabel="Select PDF file"
      actionLabel="Add watermark"
      options={
        <>
          <h3>Watermark options</h3>
          <Segmented value={kind} onChange={setKind} options={[{ value: 'text', label: 'Text' }, { value: 'image', label: 'Image' }]} />
          {kind === 'text' ? (
            <>
              <Field label="Text"><input className="input" value={text} onChange={(e) => setText(e.target.value)} /></Field>
              <div className="grid-2">
                <Field label="Font size"><input className="input" type="number" value={size} onChange={(e) => setSize(+e.target.value || 12)} /></Field>
                <Field label="Color"><input className="input color" type="color" value={color} onChange={(e) => setColor(e.target.value)} /></Field>
              </div>
            </>
          ) : (
            <>
              <Field label="Image (PNG or JPG)">
                <input className="input" type="file" accept="image/png,image/jpeg" onChange={(e) => setImage(e.target.files[0] || null)} />
              </Field>
              <Field label={`Size: ${Math.round(imgScale * 100)}% of page width`}>
                <input type="range" min={0.05} max={1} step={0.05} value={imgScale} onChange={(e) => setImgScale(+e.target.value)} />
              </Field>
            </>
          )}
          <Field label={`Transparency: ${Math.round(opacity * 100)}%`}>
            <input type="range" min={0.05} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(+e.target.value)} />
          </Field>
          <Field label="Rotation">
            <Segmented value={angle} onChange={setAngle} options={[0, 45, 90, -45].map((v) => ({ value: v, label: `${v}°` }))} />
          </Field>
          <Field label="Position">
            <Segmented value={layout} onChange={setLayout} options={[{ value: 'center', label: 'Center' }, { value: 'tile', label: 'Mosaic' }, { value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' }]} />
          </Field>
        </>
      }
      process={async ([file]) => {
        const { StandardFonts, rgb, degrees } = await import('pdf-lib')
        const doc = await loadPdf(file)
        const font = await doc.embedFont(StandardFonts.HelveticaBold)
        let img = null
        if (kind === 'image') {
          if (!image) throw new Error('Choose a watermark image.')
          const bytes = await image.arrayBuffer()
          img = image.type === 'image/png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)
        } else if (!text.trim()) throw new Error('Enter watermark text.')

        const rad = (angle * Math.PI) / 180
        for (const page of doc.getPages()) {
          const { width: W, height: H } = page.getSize()
          let w, h
          if (img) { w = W * imgScale; h = (img.height / img.width) * w } else {
            try { w = font.widthOfTextAtSize(text, size) } catch { throw new Error('Watermark text supports Latin characters only.') }
            h = size * 0.7
          }
          const centers =
            layout === 'tile'
              ? [0.2, 0.5, 0.8].flatMap((fy) => [0.25, 0.75].map((fx) => [W * fx, H * fy]))
              : layout === 'top' ? [[W / 2, H - h - 30]] : layout === 'bottom' ? [[W / 2, h + 30]] : [[W / 2, H / 2]]
          for (const [cx, cy] of centers) {
            const x = cx - (w / 2) * Math.cos(rad) + (h / 2) * Math.sin(rad)
            const y = cy - (w / 2) * Math.sin(rad) - (h / 2) * Math.cos(rad)
            if (img) page.drawImage(img, { x, y, width: w, height: h, rotate: degrees(angle), opacity })
            else page.drawText(text, { x, y, size, font, color: rgb(...hexToRgb(color)), rotate: degrees(angle), opacity })
          }
        }
        return { blob: pdfBlob(await doc.save()), name: `${baseName(file.name)}-watermarked.pdf` }
      }}
    />
  )
}

/* ---------------- Page numbers ---------------- */
export function PageNumbers() {
  const [pos, setPos] = useState('bottom-center')
  const [format, setFormat] = useState('{n}')
  const [start, setStart] = useState(1)
  const [size, setSize] = useState(12)
  const [skipFirst, setSkipFirst] = useState(false)
  const positions = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right']

  return (
    <FileTool
      accept={PDF}
      dropLabel="Select PDF file"
      actionLabel="Add page numbers"
      options={
        <>
          <h3>Page number options</h3>
          <Field label="Position">
            <div className="pos-grid">
              {positions.map((p) => (
                <button key={p} className={`pos-cell ${pos === p ? 'active' : ''}`} onClick={() => setPos(p)} title={p}><span /></button>
              ))}
            </div>
          </Field>
          <Field label="Format">
            <select className="input" value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="{n}">1</option>
              <option value="Page {n}">Page 1</option>
              <option value="{n} / {total}">1 / 10</option>
              <option value="Page {n} of {total}">Page 1 of 10</option>
              <option value="- {n} -">- 1 -</option>
            </select>
          </Field>
          <div className="grid-2">
            <Field label="Start at"><input className="input" type="number" value={start} onChange={(e) => setStart(+e.target.value || 1)} /></Field>
            <Field label="Font size"><input className="input" type="number" value={size} onChange={(e) => setSize(+e.target.value || 12)} /></Field>
          </div>
          <label className="check"><input type="checkbox" checked={skipFirst} onChange={(e) => setSkipFirst(e.target.checked)} /> Don't number the first page</label>
        </>
      }
      process={async ([file]) => {
        const { StandardFonts, rgb } = await import('pdf-lib')
        const doc = await loadPdf(file)
        const font = await doc.embedFont(StandardFonts.Helvetica)
        const pages = doc.getPages()
        const total = pages.length - (skipFirst ? 1 : 0) + start - 1
        const [v, hz] = pos.split('-')
        pages.forEach((page, i) => {
          if (skipFirst && i === 0) return
          const n = i + start - (skipFirst ? 1 : 0)
          const label = format.replace('{n}', n).replace('{total}', total)
          const { width: W, height: H } = page.getSize()
          const tw = font.widthOfTextAtSize(label, size)
          const margin = 28
          const x = hz === 'left' ? margin : hz === 'right' ? W - margin - tw : (W - tw) / 2
          const y = v === 'top' ? H - margin - size : margin
          page.drawText(label, { x, y, size, font, color: rgb(0.15, 0.15, 0.15) })
        })
        return { blob: pdfBlob(await doc.save()), name: `${baseName(file.name)}-numbered.pdf` }
      }}
    />
  )
}

/* ---------------- Sign ---------------- */
function SignaturePad({ onChange }) {
  const ref = useRef(null)
  const drawing = useRef(false)
  const [color, setColor] = useState('#1a237e')

  useEffect(() => {
    const c = ref.current
    const ctx = c.getContext('2d')
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  const pos = (e) => {
    const r = ref.current.getBoundingClientRect()
    const p = e.touches ? e.touches[0] : e
    return [((p.clientX - r.left) * ref.current.width) / r.width, ((p.clientY - r.top) * ref.current.height) / r.height]
  }
  const startDraw = (e) => {
    e.preventDefault()
    drawing.current = true
    const ctx = ref.current.getContext('2d')
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.moveTo(...pos(e))
  }
  const draw = (e) => {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = ref.current.getContext('2d')
    ctx.lineTo(...pos(e))
    ctx.stroke()
  }
  const end = () => {
    if (!drawing.current) return
    drawing.current = false
    onChange(ref.current.toDataURL('image/png'))
  }
  const clear = () => {
    ref.current.getContext('2d').clearRect(0, 0, ref.current.width, ref.current.height)
    onChange(null)
  }

  return (
    <div>
      <canvas
        ref={ref}
        width={500}
        height={180}
        className="sig-pad"
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={end}
      />
      <div className="btn-row">
        <input className="input color" type="color" value={color} onChange={(e) => setColor(e.target.value)} title="Ink colour" />
        <button className="btn btn-ghost" onClick={clear}>Clear</button>
      </div>
    </div>
  )
}

function typedSignature(text, font, color) {
  const c = document.createElement('canvas')
  c.width = 600
  c.height = 160
  const ctx = c.getContext('2d')
  ctx.fillStyle = color
  ctx.font = `64px ${font}`
  ctx.textBaseline = 'middle'
  const w = Math.min(ctx.measureText(text).width, 580)
  ctx.fillText(text, (600 - w) / 2, 80, 580)
  return c.toDataURL('image/png')
}

export function SignPdf() {
  const [files, setFiles] = useState([])
  const [mode, setMode] = useState('draw')
  const [drawn, setDrawn] = useState(null)
  const [typed, setTyped] = useState('')
  const [typedFont, setTypedFont] = useState('"Brush Script MT", "Segoe Script", cursive')
  const [pageNum, setPageNum] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [preview, setPreview] = useState(null)
  const [spot, setSpot] = useState({ x: 0.75, y: 0.88 })
  const [width, setWidth] = useState(0.25)
  const [allPages, setAllPages] = useState(false)

  const sig = mode === 'draw' ? drawn : typed.trim() ? typedSignature(typed, typedFont, '#1a237e') : null

  useEffect(() => {
    if (!files[0]) return
    let alive = true
    ;(async () => {
      const doc = await openPdfjs(files[0])
      if (!alive) return
      setNumPages(doc.numPages)
      const p = Math.min(pageNum, doc.numPages)
      const { canvas } = await renderPage(doc, p, 1.2)
      if (alive) setPreview(canvas.toDataURL('image/jpeg', 0.8))
    })().catch(() => setPreview(null))
    return () => { alive = false }
  }, [files, pageNum])

  return (
    <FileTool
      files={files}
      setFiles={(f) => { setFiles(f); setPageNum(1); setPreview(null) }}
      accept={PDF}
      dropLabel="Select PDF file"
      actionLabel="Sign PDF"
      main={
        <div className="sign-stage">
          {preview ? (
            <div
              className="sign-page"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                setSpot({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height })
              }}
            >
              <img src={preview} alt="Page preview" />
              {sig && (
                <img
                  className="sign-overlay"
                  src={sig}
                  alt="Signature"
                  style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%`, width: `${width * 100}%` }}
                />
              )}
            </div>
          ) : (
            <p className="muted">Loading page…</p>
          )}
          <p className="muted small center">Click on the page to place your signature.</p>
        </div>
      }
      options={
        <>
          <h3>Signature</h3>
          <Segmented value={mode} onChange={setMode} options={[{ value: 'draw', label: 'Draw' }, { value: 'type', label: 'Type' }]} />
          {mode === 'draw' ? (
            <SignaturePad onChange={setDrawn} />
          ) : (
            <>
              <Field label="Your name"><input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="John Doe" /></Field>
              <Field label="Style">
                <select className="input" value={typedFont} onChange={(e) => setTypedFont(e.target.value)}>
                  <option value={'"Brush Script MT", "Segoe Script", cursive'}>Script</option>
                  <option value={'"Lucida Handwriting", "Segoe Print", cursive'}>Handwriting</option>
                  <option value={'Georgia, serif'}>Serif italic</option>
                </select>
              </Field>
            </>
          )}
          <Field label={`Page (1–${numPages || '?'})`}>
            <input className="input" type="number" min={1} max={numPages || 1} value={pageNum} onChange={(e) => setPageNum(Math.max(1, Math.min(numPages || 1, +e.target.value || 1)))} />
          </Field>
          <Field label={`Signature size: ${Math.round(width * 100)}%`}>
            <input type="range" min={0.08} max={0.6} step={0.01} value={width} onChange={(e) => setWidth(+e.target.value)} />
          </Field>
          <label className="check"><input type="checkbox" checked={allPages} onChange={(e) => setAllPages(e.target.checked)} /> Sign every page</label>
        </>
      }
      process={async ([file]) => {
        if (!sig) throw new Error('Draw or type your signature first.')
        const doc = await loadPdf(file)
        const png = await doc.embedPng(sig)
        const targets = allPages ? doc.getPages() : [doc.getPage(pageNum - 1)]
        for (const page of targets) {
          const { width: W, height: H } = page.getSize()
          const w = W * width
          const h = (png.height / png.width) * w
          page.drawImage(png, { x: spot.x * W - w / 2, y: H - spot.y * H - h / 2, width: w, height: h })
        }
        return { blob: pdfBlob(await doc.save()), name: `${baseName(file.name)}-signed.pdf` }
      }}
    />
  )
}

/* ---------------- Crop ---------------- */
export function CropPdf() {
  const [m, setM] = useState({ top: 5, right: 5, bottom: 5, left: 5 })
  return (
    <FileTool
      accept={PDF}
      dropLabel="Select PDF file"
      actionLabel="Crop PDF"
      options={
        <>
          <h3>Crop margins</h3>
          <p className="muted">Trim a percentage from each edge of every page.</p>
          <div className="grid-2">
            {['top', 'right', 'bottom', 'left'].map((k) => (
              <Field key={k} label={`${k[0].toUpperCase() + k.slice(1)} (%)`}>
                <input className="input" type="number" min={0} max={45} value={m[k]} onChange={(e) => setM({ ...m, [k]: Math.max(0, Math.min(45, +e.target.value || 0)) })} />
              </Field>
            ))}
          </div>
          <div className="crop-preview">
            <div style={{ top: `${m.top}%`, right: `${m.right}%`, bottom: `${m.bottom}%`, left: `${m.left}%` }} />
          </div>
        </>
      }
      process={async ([file]) => {
        const doc = await loadPdf(file)
        for (const page of doc.getPages()) {
          const box = page.getMediaBox()
          const x = box.x + (box.width * m.left) / 100
          const y = box.y + (box.height * m.bottom) / 100
          const w = box.width * (1 - (m.left + m.right) / 100)
          const h = box.height * (1 - (m.top + m.bottom) / 100)
          page.setMediaBox(x, y, w, h)
          page.setCropBox(x, y, w, h)
        }
        return { blob: pdfBlob(await doc.save()), name: `${baseName(file.name)}-cropped.pdf` }
      }}
    />
  )
}

/* ---------------- Metadata ---------------- */
export function EditMetadata() {
  const [files, setFiles] = useState([])
  const [meta, setMeta] = useState({ title: '', author: '', subject: '', keywords: '', creator: '', producer: '' })

  useEffect(() => {
    if (!files[0]) return
    loadPdf(files[0]).then((d) =>
      setMeta({
        title: d.getTitle() || '',
        author: d.getAuthor() || '',
        subject: d.getSubject() || '',
        keywords: d.getKeywords() || '',
        creator: d.getCreator() || '',
        producer: d.getProducer() || '',
      })
    ).catch(() => {})
  }, [files])

  return (
    <FileTool
      files={files}
      setFiles={setFiles}
      accept={PDF}
      dropLabel="Select PDF file"
      actionLabel="Save metadata"
      options={
        <>
          <h3>Document properties</h3>
          {Object.keys(meta).map((k) => (
            <Field key={k} label={k[0].toUpperCase() + k.slice(1)}>
              <input className="input" value={meta[k]} onChange={(e) => setMeta({ ...meta, [k]: e.target.value })} />
            </Field>
          ))}
          <button className="btn btn-ghost" onClick={() => setMeta({ title: '', author: '', subject: '', keywords: '', creator: '', producer: '' })}>Clear all (strip metadata)</button>
        </>
      }
      process={async ([file]) => {
        const doc = await loadPdf(file)
        doc.setTitle(meta.title)
        doc.setAuthor(meta.author)
        doc.setSubject(meta.subject)
        doc.setKeywords(meta.keywords ? meta.keywords.split(/[,;]\s*/) : [])
        doc.setCreator(meta.creator)
        doc.setProducer(meta.producer)
        return { blob: pdfBlob(await doc.save({ updateMetadata: false })), name: `${baseName(file.name)}.pdf` }
      }}
    />
  )
}

/* ---------------- Flatten ---------------- */
export function FlattenPdf() {
  return (
    <FileTool
      accept={PDF}
      dropLabel="Select PDF file"
      actionLabel="Flatten PDF"
      options={<><h3>Flatten PDF</h3><p className="muted">Merges fillable form fields into the page so they can no longer be edited.</p></>}
      process={async ([file]) => {
        const doc = await loadPdf(file)
        try { doc.getForm().flatten() } catch { throw new Error('This PDF has form fields that cannot be flattened.') }
        return { blob: pdfBlob(await doc.save()), name: `${baseName(file.name)}-flattened.pdf` }
      }}
    />
  )
}

/* ---------------- Protect ---------------- */
export function ProtectPdf() {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [allowPrint, setAllowPrint] = useState(true)
  const [allowCopy, setAllowCopy] = useState(false)
  return (
    <FileTool
      accept={PDF}
      dropLabel="Select PDF file"
      actionLabel="Protect PDF"
      options={
        <>
          <h3>Set a password</h3>
          <Field label="Password"><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          <Field label="Repeat password"><input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
          <label className="check"><input type="checkbox" checked={allowPrint} onChange={(e) => setAllowPrint(e.target.checked)} /> Allow printing</label>
          <label className="check"><input type="checkbox" checked={allowCopy} onChange={(e) => setAllowCopy(e.target.checked)} /> Allow copying</label>
          <p className="muted small">Pages are re-rendered into an encrypted PDF.</p>
        </>
      }
      process={async ([file], progress) => {
        if (!pw) throw new Error('Enter a password.')
        if (pw !== pw2) throw new Error('Passwords do not match.')
        const userPermissions = [allowPrint && 'print', allowCopy && 'copy'].filter(Boolean)
        const blob = await rasterizePdf(file, {
          scale: 2,
          quality: 0.85,
          progress,
          encryption: { userPassword: pw, ownerPassword: pw + '-owner-' + Math.random().toString(36).slice(2), userPermissions },
        })
        return { blob, name: `${baseName(file.name)}-protected.pdf` }
      }}
    />
  )
}

/* ---------------- Unlock ---------------- */
export function UnlockPdf() {
  const [pw, setPw] = useState('')
  return (
    <FileTool
      accept={PDF}
      dropLabel="Select PDF file"
      actionLabel="Unlock PDF"
      options={
        <>
          <h3>Unlock PDF</h3>
          <p className="muted">Enter the document's password to remove it. You must know the password — this tool does not crack files.</p>
          <Field label="Password"><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        </>
      }
      process={async ([file], progress) => {
        // Try a lossless unlock first for PDFs that only carry owner restrictions.
        if (!pw) {
          const { PDFDocument } = await import('pdf-lib')
          try {
            const doc = await PDFDocument.load(await file.arrayBuffer())
            return { blob: pdfBlob(await doc.save()), name: `${baseName(file.name)}-unlocked.pdf` }
          } catch { throw new Error('This PDF needs a password to open. Enter it and try again.') }
        }
        const blob = await rasterizePdf(file, { scale: 2, quality: 0.88, password: pw, progress })
        return { blob, name: `${baseName(file.name)}-unlocked.pdf` }
      }}
    />
  )
}

/* ---------------- Repair ---------------- */
export function RepairPdf() {
  return (
    <FileTool
      accept={PDF}
      dropLabel="Select PDF file"
      actionLabel="Repair PDF"
      options={<><h3>Repair PDF</h3><p className="muted">Rebuilds the document structure. If that fails, pages are recovered by re-rendering them.</p></>}
      process={async ([file], progress) => {
        const { PDFDocument } = await import('pdf-lib')
        try {
          const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true, throwOnInvalidObject: false })
          const out = await PDFDocument.create()
          const pages = await out.copyPages(src, src.getPageIndices())
          pages.forEach((p) => out.addPage(p))
          return { blob: pdfBlob(await out.save()), name: `${baseName(file.name)}-repaired.pdf` }
        } catch {
          const blob = await rasterizePdf(file, { scale: 1.8, quality: 0.85, progress })
          return { blob, name: `${baseName(file.name)}-repaired.pdf` }
        }
      }}
    />
  )
}

