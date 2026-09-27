import { useCallback, useEffect, useRef, useState } from 'react'
import { MousePointer2, Type, ImagePlus, Square, Eraser, Highlighter, Check, X, PenLine, Trash2, Copy, CalendarDays, Minus, ChevronUp, ChevronDown } from 'lucide-react'
import { openPdfjs, renderPage } from '../lib/pdf'
import { setPassword } from '../lib/passwords'
import { measureText, FONT_CSS, LINE_HEIGHT } from '../lib/pdfAnnotate'
import { readAsDataURL, fileToImage } from '../lib/files'
import { PasswordPrompt, Spinner, Alert, Segmented } from './ui'

export const TOOL_DEFS = {
  select: { icon: MousePointer2, label: 'Select' },
  text: { icon: Type, label: 'Text' },
  signature: { icon: PenLine, label: 'Signature' },
  initials: { icon: PenLine, label: 'Initials' },
  date: { icon: CalendarDays, label: 'Date' },
  image: { icon: ImagePlus, label: 'Image' },
  rect: { icon: Square, label: 'Shape' },
  whiteout: { icon: Eraser, label: 'Whiteout' },
  highlight: { icon: Highlighter, label: 'Highlight' },
  line: { icon: Minus, label: 'Line' },
  check: { icon: Check, label: 'Tick' },
  cross: { icon: X, label: 'Cross' },
  redact: { icon: Square, label: 'Redact' },
}
const DRAW_TYPES = new Set(['rect', 'whiteout', 'highlight', 'redact', 'line'])
const uid = () => Math.random().toString(36).slice(2, 10)

/** Pages of a PDF, rendered lazily when scrolled into view. */
function usePdfPages(file) {
  const [state, setState] = useState({ doc: null, sizes: [], error: '', needPassword: null })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let alive = true
    let d = null
    setState({ doc: null, sizes: [], error: '', needPassword: null })
    ;(async () => {
      d = await openPdfjs(file)
      const sizes = []
      for (let i = 1; i <= d.numPages; i++) {
        const vp = (await d.getPage(i)).getViewport({ scale: 1 })
        sizes.push({ width: vp.width, height: vp.height })
      }
      if (alive) setState({ doc: d, sizes, error: '', needPassword: null })
    })().catch((e) => {
      if (!alive) return
      if (e.name === 'PasswordRequiredError') setState((s) => ({ ...s, needPassword: e }))
      else setState((s) => ({ ...s, error: e.message }))
    })
    return () => { alive = false; d?.destroy?.() }
  }, [file, attempt])
  return { ...state, retry: () => setAttempt((a) => a + 1) }
}

function PageCanvas({ doc, index, width, size }) {
  const ref = useRef(null)
  const [src, setSrc] = useState(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !doc) return
    let alive = true
    let done = false
    const io = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting || done) return
      done = true
      const scale = (width * Math.min(2, window.devicePixelRatio || 1)) / size.width
      const { canvas } = await renderPage(doc, index + 1, scale)
      if (alive) setSrc(canvas.toDataURL('image/jpeg', 0.85))
      canvas.width = canvas.height = 0
    }, { rootMargin: '600px' })
    io.observe(el)
    return () => { alive = false; io.disconnect() }
  }, [doc, index, width, size])
  return <div ref={ref} className="ed-canvas">{src ? <img src={src} alt={`Page ${index + 1}`} draggable={false} /> : <div className="thumb-skeleton" />}</div>
}

function ElementView({ el, scale, size, selected, onPointerDown, onResizeDown }) {
  const style = { left: `${el.x * 100}%`, top: `${el.y * 100}%`, width: `${el.w * 100}%`, height: `${el.h * 100}%` }
  let body = null
  if (el.type === 'text') {
    body = (
      <div className="ed-text" style={{ fontFamily: FONT_CSS[el.font], fontSize: el.size * scale, lineHeight: LINE_HEIGHT, color: el.color, fontWeight: el.bold ? 700 : 400, fontStyle: el.italic ? 'italic' : 'normal' }}>
        {el.text || ' '}
      </div>
    )
  } else if (el.src) body = <img src={el.src} alt="" draggable={false} />
  else if (el.type === 'check' || el.type === 'cross' || el.type === 'line') {
    body = (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%">
        {el.type === 'check' && <polyline points="10,55 40,85 92,12" fill="none" stroke={el.color} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ strokeWidth: Math.max(2, Math.min(el.w * size.width, el.h * size.height) * 0.12 * scale) }} />}
        {el.type === 'cross' && <path d="M12 12 L88 88 M88 12 L12 88" stroke={el.color} strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ strokeWidth: Math.max(2, Math.min(el.w * size.width, el.h * size.height) * 0.12 * scale) }} />}
        {el.type === 'line' && <line x1="0" y1="50" x2="100" y2="50" stroke={el.color} vectorEffect="non-scaling-stroke" style={{ strokeWidth: (el.thickness || 2) * scale }} />}
      </svg>
    )
  }
  const cls = `ed-el ed-${el.type} ${selected ? 'selected' : ''}`
  const boxStyle = { ...style }
  if (el.type === 'rect') Object.assign(boxStyle, { background: el.noFill ? 'transparent' : el.fill, border: el.border ? `${(el.borderWidth || 1.5) * scale}px solid ${el.borderColor}` : undefined, opacity: el.opacity ?? 1 })
  if (el.type === 'whiteout') boxStyle.background = '#fff'
  if (el.type === 'highlight') Object.assign(boxStyle, { background: el.fill || '#ffeb3b', opacity: 0.45, mixBlendMode: 'multiply' })
  if (el.type === 'redact') boxStyle.background = '#000'
  return (
    <div className={cls} style={boxStyle} onPointerDown={onPointerDown}>
      {body}
      {selected && <span className="ed-handle" onPointerDown={onResizeDown} />}
    </div>
  )
}

/**
 * Visual page editor. Controlled: `elements` / `setElements`.
 * `tools` = allowed element types. `assets` = { signature, initials } data URLs.
 * `onNeedAsset(type)` is called when the user picks signature/initials but none exists yet.
 */
export default function PdfEditor({ file, elements, setElements, tools, assets = {}, onNeedAsset, defaults = {}, dateFormat }) {
  const pages = usePdfPages(file)
  const [mode, setMode] = useState(tools.includes('select') ? 'select' : tools[0])
  const [selected, setSelected] = useState(null)
  const [width, setWidth] = useState(760)
  const wrapRef = useRef(null)
  const imgInput = useRef(null)
  const pendingImagePos = useRef(null)
  const drag = useRef(null)
  const [drawBox, setDrawBox] = useState(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, Math.min(900, Math.floor(e.contentRect.width) - 8))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const sel = elements.find((e) => e.id === selected)
  const update = useCallback((id, patch) => setElements((els) => els.map((e) => (e.id === id ? { ...e, ...patch } : e))), [setElements])
  const remove = useCallback((id) => { setElements((els) => els.filter((e) => e.id !== id)); setSelected(null) }, [setElements])

  // Keep text boxes sized to their content.
  const fitText = (el, size) => {
    const m = measureText(el.text, el)
    return { w: Math.min(1, m.w / size.width), h: Math.min(1, m.h / size.height) }
  }

  useEffect(() => {
    const onKey = (e) => {
      if (!sel || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(sel.id) }
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sel, remove])

  const today = () => {
    const d = new Date()
    if (dateFormat === 'iso') return d.toISOString().slice(0, 10)
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
  }

  async function addImageFromFile(f) {
    const pos = pendingImagePos.current
    if (!f || !pos) return
    const img = await fileToImage(f)
    let src = await readAsDataURL(f)
    if (!/^data:image\/(png|jpe?g)/i.test(src)) {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      c.getContext('2d').drawImage(img, 0, 0)
      src = c.toDataURL('image/png')
    }
    placeAsset('image', src, img.naturalWidth / img.naturalHeight, pos)
  }

  function placeAsset(type, src, ratio, { page, fx, fy }) {
    const size = pages.sizes[page]
    const wPt = Math.min(size.width * 0.35, type === 'image' ? 220 : 170)
    const hPt = wPt / ratio
    const el = { id: uid(), page, type, src, x: Math.max(0, fx - wPt / size.width / 2), y: Math.max(0, fy - hPt / size.height / 2), w: wPt / size.width, h: hPt / size.height, ratio }
    setElements((els) => [...els, el])
    setSelected(el.id)
    setMode('select')
  }

  function createAt(page, fx, fy) {
    const size = pages.sizes[page]
    if (mode === 'image') {
      pendingImagePos.current = { page, fx, fy }
      imgInput.current?.click()
      return
    }
    if (mode === 'signature' || mode === 'initials') {
      const src = assets[mode]
      if (!src) { onNeedAsset?.(mode); return }
      const img = new Image()
      img.onload = () => placeAsset(mode, src, img.width / img.height, { page, fx, fy })
      img.src = src
      return
    }
    if (mode === 'text' || mode === 'date') {
      const base = { id: uid(), page, type: 'text', text: mode === 'date' ? today() : 'Your text', size: defaults.size || 14, font: defaults.font || 'helvetica', color: defaults.color || '#111111', bold: false, italic: false }
      const { w, h } = fitText(base, size)
      const el = { ...base, x: Math.min(1 - w, fx), y: Math.max(0, fy - h / 2), w, h }
      setElements((els) => [...els, el])
      setSelected(el.id)
      setMode('select')
      if (mode === 'text') setTimeout(() => document.getElementById('ed-text-input')?.select(), 50)
      return
    }
    if (mode === 'check' || mode === 'cross') {
      const s = 16
      const el = { id: uid(), page, type: mode, color: mode === 'check' ? '#0a7d33' : '#c62828', x: fx - s / size.width / 2, y: fy - s / size.height / 2, w: s / size.width, h: s / size.height, ratio: 1 }
      setElements((els) => [...els, el])
      setSelected(el.id)
    }
  }

  const pointFrac = (e, pageEl) => {
    const r = pageEl.getBoundingClientRect()
    return { fx: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), fy: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
  }

  const onPagePointerDown = (e, page) => {
    if (e.target !== e.currentTarget && !e.target.classList.contains('ed-canvas') && e.target.tagName !== 'IMG') return
    const pageEl = e.currentTarget
    const { fx, fy } = pointFrac(e, pageEl)
    if (mode === 'select') { setSelected(null); return }
    if (DRAW_TYPES.has(mode)) {
      e.preventDefault()
      pageEl.setPointerCapture(e.pointerId)
      drag.current = { kind: 'draw', page, pageEl, fx, fy }
      setDrawBox({ page, x: fx, y: fy, w: 0, h: 0 })
      return
    }
    createAt(page, fx, fy)
  }

  const onPagePointerMove = (e) => {
    const d = drag.current
    if (!d) return
    const { fx, fy } = pointFrac(e, d.pageEl)
    if (d.kind === 'draw') {
      const isLine = mode === 'line'
      setDrawBox({ page: d.page, x: Math.min(fx, d.fx), y: isLine ? d.fy - 0.004 : Math.min(fy, d.fy), w: Math.abs(fx - d.fx), h: isLine ? 0.008 : Math.abs(fy - d.fy) })
    } else if (d.kind === 'move') {
      const el = d.el
      update(el.id, { x: Math.min(1 - el.w, Math.max(0, el.x + fx - d.fx)), y: Math.min(1 - el.h, Math.max(0, el.y + fy - d.fy)) })
    } else if (d.kind === 'resize') {
      const el = d.el
      const size = pages.sizes[el.page]
      let w = Math.max(0.01, Math.min(1 - el.x, el.w + fx - d.fx))
      let h = Math.max(0.005, Math.min(1 - el.y, el.h + fy - d.fy))
      if (el.type === 'text') {
        const k = w / el.w
        const newSize = Math.max(4, Math.min(200, Math.round(el.size * k * 2) / 2))
        const next = { ...el, size: newSize }
        update(el.id, { size: newSize, ...fitText(next, size) })
        return
      }
      if (el.ratio) h = Math.min(1 - el.y, (w * size.width) / el.ratio / size.height)
      update(el.id, { w, h })
    }
  }

  const onPagePointerUp = () => {
    const d = drag.current
    drag.current = null
    if (d?.kind === 'draw' && drawBox) {
      const size = pages.sizes[d.page]
      const min = 6
      let box = { ...drawBox }
      if (box.w * size.width < min) box = { ...box, x: box.x - 40 / size.width, w: 80 / size.width }
      if (mode !== 'line' && box.h * size.height < min) box = { ...box, y: box.y - 12 / size.height, h: 24 / size.height }
      const el = {
        id: uid(), page: d.page, type: mode, ...box,
        ...(mode === 'rect' ? { fill: '#1e88e5', opacity: 0.25, border: true, borderColor: '#1e88e5', borderWidth: 1.5 } : {}),
        ...(mode === 'highlight' ? { fill: '#ffeb3b' } : {}),
        ...(mode === 'line' ? { color: '#111111', thickness: 2 } : {}),
      }
      setElements((els) => [...els, el])
      setSelected(el.id)
    }
    setDrawBox(null)
  }

  const startMove = (e, el) => {
    e.stopPropagation()
    setSelected(el.id)
    if (mode !== 'select' && !DRAW_TYPES.has(mode)) setMode('select')
    const pageEl = e.currentTarget.closest('.ed-page')
    pageEl.setPointerCapture(e.pointerId)
    const { fx, fy } = pointFrac(e, pageEl)
    drag.current = { kind: 'move', el, pageEl, fx, fy }
  }
  const startResize = (e, el) => {
    e.stopPropagation()
    const pageEl = e.currentTarget.closest('.ed-page')
    pageEl.setPointerCapture(e.pointerId)
    const { fx, fy } = pointFrac(e, pageEl)
    drag.current = { kind: 'resize', el, pageEl, fx, fy }
  }

  if (pages.needPassword) return <PasswordPrompt fileName={file.name} wrong={pages.needPassword.wrong} onSubmit={(pw) => { setPassword(file, pw); pages.retry() }} />
  if (pages.error) return <Alert kind="error">{pages.error}</Alert>
  if (!pages.doc) return <Spinner label="Opening PDF…" />

  return (
    <div className="editor">
      <div className="ed-toolbar" role="toolbar">
        {tools.map((t) => {
          const def = TOOL_DEFS[t]
          const Icon = def.icon
          return (
            <button key={t} className={`ed-tool ${mode === t ? 'active' : ''}`} onClick={() => setMode(t)} title={def.label}>
              <Icon size={18} /> <span>{def.label}</span>
            </button>
          )
        })}
      </div>
      <p className="ed-hint">
        {mode === 'select' ? 'Click an item to select it. Drag to move, use the corner handle to resize, Delete to remove.'
          : DRAW_TYPES.has(mode) ? `Drag on the page to draw a ${TOOL_DEFS[mode].label.toLowerCase()} area.`
            : `Click on the page where the ${TOOL_DEFS[mode].label.toLowerCase()} should go.`}
      </p>

      <div className="ed-body">
        <div className="ed-pages" ref={wrapRef}>
          {pages.sizes.map((size, i) => {
            const scale = width / size.width
            return (
              <div key={i} className="ed-page-wrap">
                <div className="ed-page-num">Page {i + 1} of {pages.sizes.length}</div>
                <div
                  className={`ed-page mode-${mode}`}
                  style={{ width, height: size.height * scale }}
                  onPointerDown={(e) => onPagePointerDown(e, i)}
                  onPointerMove={onPagePointerMove}
                  onPointerUp={onPagePointerUp}
                  onPointerCancel={onPagePointerUp}
                >
                  <PageCanvas doc={pages.doc} index={i} width={width} size={size} />
                  {elements.filter((el) => el.page === i).map((el) => (
                    <ElementView key={el.id} el={el} scale={scale} size={size} selected={el.id === selected} onPointerDown={(e) => startMove(e, el)} onResizeDown={(e) => startResize(e, el)} />
                  ))}
                  {drawBox && drawBox.page === i && (
                    <div className={`ed-el ed-${mode} drawing`} style={{ left: `${drawBox.x * 100}%`, top: `${drawBox.y * 100}%`, width: `${drawBox.w * 100}%`, height: `${drawBox.h * 100}%` }} />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {sel && (
        <div className="ed-props" onPointerDown={(e) => e.stopPropagation()}>
          <div className="ed-props-head">
            <strong>{TOOL_DEFS[sel.type]?.label || 'Item'}</strong> <span className="muted small">page {sel.page + 1}</span>
            <div className="ed-props-actions">
              <button className="icon-btn" title="Move to previous page" disabled={sel.page === 0} onClick={() => update(sel.id, { page: sel.page - 1 })}><ChevronUp size={16} /></button>
              <button className="icon-btn" title="Move to next page" disabled={sel.page >= pages.sizes.length - 1} onClick={() => update(sel.id, { page: sel.page + 1 })}><ChevronDown size={16} /></button>
              <button className="icon-btn" title="Duplicate on every page" onClick={() => setElements((els) => [...els, ...pages.sizes.map((_, p) => p).filter((p) => p !== sel.page).map((p) => ({ ...sel, id: uid(), page: p }))])}><Copy size={16} /></button>
              <button className="icon-btn danger" title="Delete" onClick={() => remove(sel.id)}><Trash2 size={16} /></button>
            </div>
          </div>
          {sel.type === 'text' && (
            <>
              <textarea id="ed-text-input" className="textarea" rows={3} value={sel.text} onChange={(e) => { const next = { ...sel, text: e.target.value }; update(sel.id, { text: e.target.value, ...fitText(next, pages.sizes[sel.page]) }) }} />
              <div className="ed-props-row">
                <Segmented value={sel.font} onChange={(v) => { const n = { ...sel, font: v }; update(sel.id, { font: v, ...fitText(n, pages.sizes[sel.page]) }) }} options={[{ value: 'helvetica', label: 'Sans' }, { value: 'times', label: 'Serif' }, { value: 'courier', label: 'Mono' }]} />
                <button className={`btn btn-sm ${sel.bold ? 'btn-primary' : 'btn-soft'}`} onClick={() => { const n = { ...sel, bold: !sel.bold }; update(sel.id, { bold: n.bold, ...fitText(n, pages.sizes[sel.page]) }) }}><b>B</b></button>
                <button className={`btn btn-sm ${sel.italic ? 'btn-primary' : 'btn-soft'}`} onClick={() => { const n = { ...sel, italic: !sel.italic }; update(sel.id, { italic: n.italic, ...fitText(n, pages.sizes[sel.page]) }) }}><i>I</i></button>
                <input className="input color sm" type="color" value={sel.color} onChange={(e) => update(sel.id, { color: e.target.value })} title="Colour" />
                <label className="inline-num">Size <input className="input sm" type="number" min={4} max={200} value={sel.size} onChange={(e) => { const v = Math.max(4, Math.min(200, +e.target.value || 12)); const n = { ...sel, size: v }; update(sel.id, { size: v, ...fitText(n, pages.sizes[sel.page]) }) }} /></label>
              </div>
            </>
          )}
          {(sel.type === 'rect') && (
            <div className="ed-props-row">
              <label className="inline-num">Fill <input className="input color sm" type="color" value={sel.fill} onChange={(e) => update(sel.id, { fill: e.target.value, noFill: false })} /></label>
              <label className="inline-num">Border <input className="input color sm" type="color" value={sel.borderColor} onChange={(e) => update(sel.id, { borderColor: e.target.value, border: true })} /></label>
              <label className="inline-num">Opacity <input type="range" min={0} max={1} step={0.05} value={sel.opacity ?? 1} onChange={(e) => update(sel.id, { opacity: +e.target.value })} /></label>
              <label className="check"><input type="checkbox" checked={!!sel.noFill} onChange={(e) => update(sel.id, { noFill: e.target.checked })} /> Outline only</label>
            </div>
          )}
          {sel.type === 'highlight' && (
            <div className="ed-props-row">
              {['#ffeb3b', '#a5d6a7', '#90caf9', '#f48fb1', '#ffcc80'].map((c) => (
                <button key={c} className={`swatch ${sel.fill === c ? 'active' : ''}`} style={{ background: c }} onClick={() => update(sel.id, { fill: c })} aria-label={`Colour ${c}`} />
              ))}
            </div>
          )}
          {(sel.type === 'check' || sel.type === 'cross' || sel.type === 'line') && (
            <div className="ed-props-row">
              <label className="inline-num">Colour <input className="input color sm" type="color" value={sel.color} onChange={(e) => update(sel.id, { color: e.target.value })} /></label>
              {sel.type === 'line' && <label className="inline-num">Thickness <input className="input sm" type="number" min={0.5} max={20} step={0.5} value={sel.thickness || 2} onChange={(e) => update(sel.id, { thickness: +e.target.value || 2 })} /></label>}
            </div>
          )}
          {(sel.type === 'image' || sel.type === 'signature' || sel.type === 'initials') && (
            <div className="ed-props-row">
              <label className="inline-num">Opacity <input type="range" min={0.1} max={1} step={0.05} value={sel.opacity ?? 1} onChange={(e) => update(sel.id, { opacity: +e.target.value })} /></label>
            </div>
          )}
        </div>
      )}

      <input ref={imgInput} type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={(e) => { addImageFromFile(e.target.files[0]); e.target.value = '' }} />
      {elements.length > 0 && <p className="muted small ed-count">{elements.length} item{elements.length === 1 ? '' : 's'} added</p>}
    </div>
  )
}
