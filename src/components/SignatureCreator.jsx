import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Segmented } from './ui'
import { fileToImage } from '../lib/files'

const INKS = ['#0d1b6e', '#111111', '#1565c0', '#b71c1c']
const STYLES = [
  ['Signature', '"Segoe Script", "Brush Script MT", "Snell Roundhand", cursive'],
  ['Handwritten', '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive'],
  ['Elegant', '"Lucida Handwriting", "Apple Chancery", cursive'],
  ['Classic', 'Georgia, "Times New Roman", serif'],
]

/** Crop transparent (or near-white) margins so the signature is tight to its ink. */
function trimCanvas(src, whiteToAlpha = false) {
  const ctx = src.getContext('2d')
  const { width, height } = src
  const img = ctx.getImageData(0, 0, width, height)
  const d = img.data
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (whiteToAlpha) {
        const lum = (d[i] + d[i + 1] + d[i + 2]) / 3
        if (lum > 215) d[i + 3] = 0
        else d[i + 3] = Math.min(d[i + 3], Math.round(255 * (1 - lum / 215) * 1.6))
      }
      if (d[i + 3] > 12) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  if (whiteToAlpha) ctx.putImageData(img, 0, 0)
  const pad = 6
  const out = document.createElement('canvas')
  out.width = maxX - minX + 1 + pad * 2
  out.height = maxY - minY + 1 + pad * 2
  out.getContext('2d').drawImage(src, minX, minY, out.width - pad * 2, out.height - pad * 2, pad, pad, out.width - pad * 2, out.height - pad * 2)
  return out.toDataURL('image/png')
}

function DrawPad({ color, onChange }) {
  const ref = useRef(null)
  const drawing = useRef(false)
  const last = useRef(null)
  useEffect(() => {
    const c = ref.current
    const ctx = c.getContext('2d')
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])
  const pos = (e) => {
    const r = ref.current.getBoundingClientRect()
    return [((e.clientX - r.left) * ref.current.width) / r.width, ((e.clientY - r.top) * ref.current.height) / r.height]
  }
  const down = (e) => {
    e.preventDefault()
    ref.current.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = pos(e)
  }
  const move = (e) => {
    if (!drawing.current) return
    const ctx = ref.current.getContext('2d')
    const p = pos(e)
    const [lx, ly] = last.current
    const speed = Math.hypot(p[0] - lx, p[1] - ly)
    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(2.2, 5 - speed * 0.08) // thinner when moving fast, like real ink
    ctx.beginPath()
    ctx.moveTo(lx, ly)
    ctx.lineTo(p[0], p[1])
    ctx.stroke()
    last.current = p
  }
  const up = () => {
    if (!drawing.current) return
    drawing.current = false
    onChange(trimCanvas(ref.current))
  }
  const clear = () => {
    ref.current.getContext('2d').clearRect(0, 0, ref.current.width, ref.current.height)
    onChange(null)
  }
  return (
    <div className="sig-draw">
      <canvas ref={ref} width={900} height={300} className="sig-pad" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      <div className="sig-line"><span>Sign above</span><button className="btn btn-ghost btn-sm" onClick={clear}>Clear</button></div>
    </div>
  )
}

function typed(text, family, color) {
  const c = document.createElement('canvas')
  c.width = 1200
  c.height = 300
  const ctx = c.getContext('2d')
  ctx.fillStyle = color
  let size = 150
  ctx.font = `${size}px ${family}`
  while (ctx.measureText(text).width > 1150 && size > 30) {
    size -= 6
    ctx.font = `${size}px ${family}`
  }
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 20, 150)
  return trimCanvas(c)
}

/** Modal to draw / type / upload a signature. Calls onDone(dataUrl). */
export default function SignatureCreator({ kind = 'signature', onDone, onClose, defaultName = '' }) {
  const [tab, setTab] = useState('draw')
  const [color, setColor] = useState(INKS[0])
  const [drawn, setDrawn] = useState(null)
  const [name, setName] = useState(defaultName)
  const [style, setStyle] = useState(0)
  const [uploaded, setUploaded] = useState(null)
  const [removeBg, setRemoveBg] = useState(true)
  const [uploadFile, setUploadFile] = useState(null)

  const text = kind === 'initials' ? name.split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase()).join('') : name

  useEffect(() => {
    if (!uploadFile) return
    fileToImage(uploadFile).then((img) => {
      const c = document.createElement('canvas')
      const s = Math.min(1, 1400 / img.naturalWidth)
      c.width = img.naturalWidth * s
      c.height = img.naturalHeight * s
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      setUploaded(trimCanvas(c, removeBg))
    })
  }, [uploadFile, removeBg])

  const value = tab === 'draw' ? drawn : tab === 'type' ? (text.trim() ? typed(text, STYLES[style][1], color) : null) : uploaded

  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Create ${kind}`}>
        <div className="modal-head">
          <h3>Create your {kind}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <Segmented value={tab} onChange={setTab} full options={[{ value: 'draw', label: 'Draw' }, { value: 'type', label: 'Type' }, { value: 'upload', label: 'Upload' }]} />
        {tab !== 'upload' && (
          <div className="ink-row">
            <span className="muted small">Ink</span>
            {INKS.map((c) => <button key={c} className={`swatch ${color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Ink ${c}`} />)}
          </div>
        )}
        {tab === 'draw' && <DrawPad color={color} onChange={setDrawn} />}
        {tab === 'type' && (
          <>
            <input className="input" placeholder="Your full name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <div className="sig-styles">
              {STYLES.map(([label, fam], i) => (
                <button key={label} className={`sig-style ${style === i ? 'active' : ''}`} style={{ fontFamily: fam, color }} onClick={() => setStyle(i)}>
                  {text || (kind === 'initials' ? 'JD' : 'Your Name')}
                </button>
              ))}
            </div>
          </>
        )}
        {tab === 'upload' && (
          <>
            <input className="input" type="file" accept="image/*" onChange={(e) => setUploadFile(e.target.files[0] || null)} />
            <label className="check"><input type="checkbox" checked={removeBg} onChange={(e) => setRemoveBg(e.target.checked)} /> Remove white background (for photos of paper signatures)</label>
            {uploaded && <div className="sig-preview"><img src={uploaded} alt="Signature preview" /></div>}
          </>
        )}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!value} onClick={() => onDone(value)}>Use this {kind}</button>
        </div>
      </div>
    </div>
  )
}
