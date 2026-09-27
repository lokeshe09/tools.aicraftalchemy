import { useEffect, useRef, useState } from 'react'
import { RotateCw, RotateCcw, FlipHorizontal, FlipVertical } from 'lucide-react'
import FileTool from '../components/FileTool'
import { Field, Segmented, CopyButton, FileList } from '../components/ui'
import { baseName, canvasToBlob, fileToImage, formatBytes, readAsDataURL, zipBlobs } from '../utils/files'

const IMG = 'image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.svg,.avif'
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

const outType = (file, pref) => {
  if (pref && pref !== 'original') return pref
  if (file.type === 'image/jpeg' || file.type === 'image/webp' || file.type === 'image/png') return file.type
  return 'image/png'
}

function makeCanvas(w, h, bg) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  const ctx = c.getContext('2d')
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height) }
  return [c, ctx]
}

/** Run `draw(img, file)` → canvas for every file, then return one file or a ZIP. */
async function batchImages(files, progress, { type, quality = 0.92, suffix, draw }) {
  const out = []
  for (let i = 0; i < files.length; i++) {
    progress(`Image ${i + 1}/${files.length}`)
    const img = await fileToImage(files[i])
    const t = outType(files[i], type)
    const canvas = await draw(img, files[i], t)
    // JPEG has no transparency: paint white behind.
    let final = canvas
    if (t === 'image/jpeg') {
      const [c, ctx] = makeCanvas(canvas.width, canvas.height, '#fff')
      ctx.drawImage(canvas, 0, 0)
      final = c
    }
    const blob = await canvasToBlob(final, t, quality)
    out.push({ name: `${baseName(files[i].name)}${suffix || ''}.${EXT[t]}`, blob })
  }
  if (out.length === 1) return out[0]
  progress('Zipping')
  return { blob: await zipBlobs(out), name: `images${suffix || ''}.zip` }
}

const imgW = (img) => img.naturalWidth || img.width
const imgH = (img) => img.naturalHeight || img.height
const plainDraw = (img) => {
  const [c, ctx] = makeCanvas(imgW(img), imgH(img))
  ctx.drawImage(img, 0, 0)
  return c
}

/* ---------------- Compress ---------------- */
export function CompressImage() {
  const [quality, setQuality] = useState(0.7)
  const [format, setFormat] = useState('image/jpeg')
  const [maxW, setMaxW] = useState(0)
  const [before, setBefore] = useState(0)
  return (
    <FileTool
      accept={IMG}
      multiple
      dropLabel="Select images"
      actionLabel="Compress images"
      resultExtra={(r) => before ? <p className="size-compare">{formatBytes(before)} → <strong>{formatBytes(r.blob.size)}</strong>{r.blob.size < before && <span className="badge-ok">−{Math.round((1 - r.blob.size / before) * 100)}%</span>}</p> : null}
      options={
        <>
          <h3>Compression</h3>
          <Field label={`Quality: ${Math.round(quality * 100)}%`}>
            <input type="range" min={0.1} max={1} step={0.05} value={quality} onChange={(e) => setQuality(+e.target.value)} />
          </Field>
          <Field label="Output format">
            <Segmented value={format} onChange={setFormat} options={[{ value: 'image/jpeg', label: 'JPG' }, { value: 'image/webp', label: 'WEBP' }, { value: 'original', label: 'Original' }]} />
          </Field>
          <Field label="Max width (px, 0 = keep)">
            <input className="input" type="number" min={0} value={maxW} onChange={(e) => setMaxW(Math.max(0, +e.target.value || 0))} />
          </Field>
          <p className="muted small">PNG ignores the quality setting — pick JPG or WEBP for the biggest savings. EXIF/location data is removed.</p>
        </>
      }
      process={(files, p) => {
        setBefore(files.reduce((a, f) => a + f.size, 0))
        return batchImages(files, p, {
          type: format, quality, suffix: '-compressed',
          draw: (img) => {
            const s = maxW && imgW(img) > maxW ? maxW / imgW(img) : 1
            const [c, ctx] = makeCanvas(imgW(img) * s, imgH(img) * s)
            ctx.imageSmoothingQuality = 'high'
            ctx.drawImage(img, 0, 0, c.width, c.height)
            return c
          },
        })
      }}
    />
  )
}

/* ---------------- Resize ---------------- */
export function ResizeImage() {
  const [mode, setMode] = useState('px')
  const [w, setW] = useState(1280)
  const [h, setH] = useState(720)
  const [pct, setPct] = useState(50)
  const [keep, setKeep] = useState(true)
  const [noUpscale, setNoUpscale] = useState(true)
  return (
    <FileTool
      accept={IMG}
      multiple
      dropLabel="Select images"
      actionLabel="Resize images"
      options={
        <>
          <h3>Resize options</h3>
          <Segmented value={mode} onChange={setMode} options={[{ value: 'px', label: 'By pixels' }, { value: 'pct', label: 'By percentage' }]} />
          {mode === 'px' ? (
            <>
              <div className="grid-2">
                <Field label="Width (px)"><input className="input" type="number" value={w} onChange={(e) => setW(+e.target.value || 0)} /></Field>
                <Field label="Height (px)"><input className="input" type="number" value={h} onChange={(e) => setH(+e.target.value || 0)} /></Field>
              </div>
              <label className="check"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Maintain aspect ratio (fit inside)</label>
              <label className="check"><input type="checkbox" checked={noUpscale} onChange={(e) => setNoUpscale(e.target.checked)} /> Do not enlarge smaller images</label>
            </>
          ) : (
            <Field label={`Scale: ${pct}%`}><input type="range" min={5} max={400} step={5} value={pct} onChange={(e) => setPct(+e.target.value)} /></Field>
          )}
        </>
      }
      process={(files, p) =>
        batchImages(files, p, {
          suffix: '-resized',
          draw: (img) => {
            let tw, th
            if (mode === 'pct') { tw = (imgW(img) * pct) / 100; th = (imgH(img) * pct) / 100 } else if (keep) {
              const s = Math.min((w || Infinity) / imgW(img), (h || Infinity) / imgH(img))
              const f = noUpscale ? Math.min(1, s) : s
              tw = imgW(img) * f; th = imgH(img) * f
            } else {
              tw = w || imgW(img); th = h || imgH(img)
              if (noUpscale) { tw = Math.min(tw, imgW(img)); th = Math.min(th, imgH(img)) }
            }
            const [c, ctx] = makeCanvas(tw, th)
            ctx.imageSmoothingQuality = 'high'
            ctx.drawImage(img, 0, 0, c.width, c.height)
            return c
          },
        })
      }
    />
  )
}

/* ---------------- Crop (interactive) ---------------- */
export function CropImage() {
  const [files, setFiles] = useState([])
  const [src, setSrc] = useState(null)
  const [sel, setSel] = useState({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 })
  const [ratio, setRatio] = useState(0)
  const [nat, setNat] = useState({ w: 0, h: 0 })
  const stage = useRef(null)
  const drag = useRef(null)

  useEffect(() => {
    if (!files[0]) return
    const url = URL.createObjectURL(files[0])
    setSrc(url)
    fileToImage(files[0]).then((img) => setNat({ w: imgW(img), h: imgH(img) }))
    setSel({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 })
    return () => URL.revokeObjectURL(url)
  }, [files])

  const applyRatio = (r) => {
    setRatio(r)
    if (!r || !nat.w) return
    // r is width/height in pixels; convert to fractions of the image.
    let w = 0.8
    let h = (w * nat.w) / r / nat.h
    if (h > 0.9) { h = 0.8; w = (h * nat.h * r) / nat.w }
    setSel({ x: (1 - w) / 2, y: (1 - h) / 2, w, h })
  }

  const pt = (e) => {
    const r = stage.current.getBoundingClientRect()
    const p = e.touches ? e.touches[0] : e
    return { x: Math.min(1, Math.max(0, (p.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (p.clientY - r.top) / r.height)) }
  }
  const down = (e, kind) => {
    e.stopPropagation()
    e.preventDefault()
    drag.current = { kind, start: pt(e), sel }
  }
  const move = (e) => {
    const d = drag.current
    if (!d) return
    const p = pt(e)
    const dx = p.x - d.start.x
    const dy = p.y - d.start.y
    if (d.kind === 'move') {
      setSel({ ...d.sel, x: Math.min(1 - d.sel.w, Math.max(0, d.sel.x + dx)), y: Math.min(1 - d.sel.h, Math.max(0, d.sel.y + dy)) })
    } else {
      let w = Math.max(0.02, Math.min(1 - d.sel.x, d.sel.w + dx))
      let h = Math.max(0.02, Math.min(1 - d.sel.y, d.sel.h + dy))
      if (ratio && nat.w) h = Math.min(1 - d.sel.y, (w * nat.w) / ratio / nat.h)
      setSel({ ...d.sel, w, h })
    }
  }
  const up = () => { drag.current = null }

  const px = { x: Math.round(sel.x * nat.w), y: Math.round(sel.y * nat.h), w: Math.round(sel.w * nat.w), h: Math.round(sel.h * nat.h) }

  return (
    <FileTool
      files={files}
      setFiles={setFiles}
      accept={IMG}
      dropLabel="Select image"
      actionLabel="Crop image"
      main={
        src && (
          <div className="crop-stage" ref={stage} onMouseMove={move} onMouseUp={up} onMouseLeave={up} onTouchMove={move} onTouchEnd={up}>
            <img src={src} alt="To crop" draggable={false} />
            <div
              className="crop-sel"
              style={{ left: `${sel.x * 100}%`, top: `${sel.y * 100}%`, width: `${sel.w * 100}%`, height: `${sel.h * 100}%` }}
              onMouseDown={(e) => down(e, 'move')}
              onTouchStart={(e) => down(e, 'move')}
            >
              <span className="crop-handle" onMouseDown={(e) => down(e, 'resize')} onTouchStart={(e) => down(e, 'resize')} />
            </div>
          </div>
        )
      }
      options={
        <>
          <h3>Crop image</h3>
          <p className="muted">Drag the box to move it; drag the corner handle to resize.</p>
          <Field label="Aspect ratio">
            <Segmented value={ratio} onChange={applyRatio} options={[{ value: 0, label: 'Free' }, { value: 1, label: '1:1' }, { value: 4 / 3, label: '4:3' }, { value: 16 / 9, label: '16:9' }]} />
          </Field>
          <div className="grid-2">
            <Field label="X"><input className="input" type="number" value={px.x} onChange={(e) => setSel({ ...sel, x: Math.min(1 - sel.w, (+e.target.value || 0) / nat.w) })} /></Field>
            <Field label="Y"><input className="input" type="number" value={px.y} onChange={(e) => setSel({ ...sel, y: Math.min(1 - sel.h, (+e.target.value || 0) / nat.h) })} /></Field>
            <Field label="Width"><input className="input" type="number" value={px.w} onChange={(e) => setSel({ ...sel, w: Math.min(1 - sel.x, (+e.target.value || 1) / nat.w) })} /></Field>
            <Field label="Height"><input className="input" type="number" value={px.h} onChange={(e) => setSel({ ...sel, h: Math.min(1 - sel.y, (+e.target.value || 1) / nat.h) })} /></Field>
          </div>
        </>
      }
      process={(fs, p) =>
        batchImages(fs, p, {
          suffix: '-cropped',
          draw: (img) => {
            const [c, ctx] = makeCanvas(sel.w * imgW(img), sel.h * imgH(img))
            ctx.drawImage(img, sel.x * imgW(img), sel.y * imgH(img), c.width, c.height, 0, 0, c.width, c.height)
            return c
          },
        })
      }
    />
  )
}

/* ---------------- Convert format ---------------- */
export function ConvertImage({ to = 'image/jpeg', from }) {
  const [quality, setQuality] = useState(0.92)
  const label = EXT[to].toUpperCase()
  return (
    <FileTool
      accept={from || IMG}
      multiple
      dropLabel="Select images"
      actionLabel={`Convert to ${label}`}
      options={
        <>
          <h3>Convert to {label}</h3>
          {to !== 'image/png' ? (
            <Field label={`Quality: ${Math.round(quality * 100)}%`}>
              <input type="range" min={0.3} max={1} step={0.02} value={quality} onChange={(e) => setQuality(+e.target.value)} />
            </Field>
          ) : (
            <p className="muted">PNG is lossless and keeps transparency.</p>
          )}
        </>
      }
      process={(files, p) => batchImages(files, p, { type: to, quality, draw: plainDraw })}
    />
  )
}

/* ---------------- HEIC → JPG ---------------- */
export function HeicToJpg() {
  const [to, setTo] = useState('image/jpeg')
  return (
    <FileTool
      accept=".heic,.heif,image/heic,image/heif"
      multiple
      dropLabel="Select HEIC images"
      actionLabel="Convert"
      options={
        <>
          <h3>HEIC converter</h3>
          <p className="muted">Convert iPhone photos (HEIC/HEIF) to universally supported formats.</p>
          <Field label="Output">
            <Segmented value={to} onChange={setTo} options={[{ value: 'image/jpeg', label: 'JPG' }, { value: 'image/png', label: 'PNG' }]} />
          </Field>
        </>
      }
      process={async (files, progress) => {
        const { default: heic2any } = await import('heic2any')
        const out = []
        for (let i = 0; i < files.length; i++) {
          progress(`Image ${i + 1}/${files.length}`)
          let blob
          try { blob = await heic2any({ blob: files[i], toType: to, quality: 0.92 }) } catch { throw new Error(`"${files[i].name}" is not a valid HEIC image.`) }
          out.push({ name: `${baseName(files[i].name)}.${EXT[to]}`, blob: Array.isArray(blob) ? blob[0] : blob })
        }
        return out.length === 1 ? out[0] : { blob: await zipBlobs(out), name: 'converted.zip' }
      }}
    />
  )
}

/* ---------------- Rotate / flip ---------------- */
export function RotateImage() {
  const [angle, setAngle] = useState(90)
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)
  return (
    <FileTool
      accept={IMG}
      multiple
      dropLabel="Select images"
      actionLabel="Apply"
      options={
        <>
          <h3>Rotate &amp; flip</h3>
          <div className="btn-row">
            <button className="btn btn-secondary" onClick={() => setAngle((angle + 270) % 360)}><RotateCcw size={16} /> Left</button>
            <button className="btn btn-secondary" onClick={() => setAngle((angle + 90) % 360)}><RotateCw size={16} /> Right</button>
          </div>
          <p className="muted small">Rotation: {angle}°</p>
          <div className="btn-row">
            <button className={`btn ${flipH ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFlipH(!flipH)}><FlipHorizontal size={16} /> Flip H</button>
            <button className={`btn ${flipV ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFlipV(!flipV)}><FlipVertical size={16} /> Flip V</button>
          </div>
        </>
      }
      process={(files, p) =>
        batchImages(files, p, {
          suffix: '-rotated',
          draw: (img) => {
            const swap = angle % 180 !== 0
            const [c, ctx] = makeCanvas(swap ? imgH(img) : imgW(img), swap ? imgW(img) : imgH(img))
            ctx.translate(c.width / 2, c.height / 2)
            ctx.rotate((angle * Math.PI) / 180)
            ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1)
            ctx.drawImage(img, -imgW(img) / 2, -imgH(img) / 2)
            return c
          },
        })
      }
    />
  )
}

/* ---------------- Filters / photo editor ---------------- */
export function ImageFilters() {
  const [files, setFiles] = useState([])
  const [f, setF] = useState({ brightness: 100, contrast: 100, saturate: 100, grayscale: 0, sepia: 0, blur: 0, invert: 0, hue: 0 })
  const [preview, setPreview] = useState(null)
  useEffect(() => {
    if (!files[0]) return
    const u = URL.createObjectURL(files[0])
    setPreview(u)
    return () => URL.revokeObjectURL(u)
  }, [files])
  const filter = `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturate}%) grayscale(${f.grayscale}%) sepia(${f.sepia}%) blur(${f.blur}px) invert(${f.invert}%) hue-rotate(${f.hue}deg)`
  const sliders = [
    ['brightness', 0, 200, '%'], ['contrast', 0, 200, '%'], ['saturate', 0, 300, '%'], ['grayscale', 0, 100, '%'],
    ['sepia', 0, 100, '%'], ['invert', 0, 100, '%'], ['hue', 0, 360, '°'], ['blur', 0, 20, 'px'],
  ]
  return (
    <FileTool
      files={files}
      setFiles={setFiles}
      accept={IMG}
      dropLabel="Select image"
      actionLabel="Save image"
      main={preview && <div className="preview-box"><img src={preview} alt="Preview" style={{ filter }} /></div>}
      options={
        <>
          <h3>Photo filters</h3>
          {sliders.map(([k, min, max, u]) => (
            <Field key={k} label={`${k[0].toUpperCase() + k.slice(1)}: ${f[k]}${u}`}>
              <input type="range" min={min} max={max} value={f[k]} onChange={(e) => setF({ ...f, [k]: +e.target.value })} />
            </Field>
          ))}
          <div className="btn-row">
            <button className="btn btn-ghost" onClick={() => setF({ brightness: 100, contrast: 100, saturate: 100, grayscale: 0, sepia: 0, blur: 0, invert: 0, hue: 0 })}>Reset</button>
            <button className="btn btn-ghost" onClick={() => setF({ ...f, grayscale: 100 })}>B&amp;W</button>
            <button className="btn btn-ghost" onClick={() => setF({ ...f, sepia: 80 })}>Vintage</button>
          </div>
        </>
      }
      process={(fs, p) =>
        batchImages(fs, p, {
          suffix: '-edited',
          draw: (img) => {
            const [c, ctx] = makeCanvas(imgW(img), imgH(img))
            ctx.filter = filter
            ctx.drawImage(img, 0, 0)
            return c
          },
        })
      }
    />
  )
}

/* ---------------- Watermark image ---------------- */
export function WatermarkImage() {
  const [text, setText] = useState('© tools')
  const [size, setSize] = useState(5)
  const [color, setColor] = useState('#ffffff')
  const [opacity, setOpacity] = useState(0.6)
  const [pos, setPos] = useState('bottom-right')
  return (
    <FileTool
      accept={IMG}
      multiple
      dropLabel="Select images"
      actionLabel="Add watermark"
      options={
        <>
          <h3>Watermark</h3>
          <Field label="Text"><input className="input" value={text} onChange={(e) => setText(e.target.value)} /></Field>
          <Field label={`Size: ${size}% of width`}><input type="range" min={1} max={25} value={size} onChange={(e) => setSize(+e.target.value)} /></Field>
          <div className="grid-2">
            <Field label="Color"><input className="input color" type="color" value={color} onChange={(e) => setColor(e.target.value)} /></Field>
            <Field label={`Opacity ${Math.round(opacity * 100)}%`}><input type="range" min={0.1} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(+e.target.value)} /></Field>
          </div>
          <Field label="Position">
            <Segmented value={pos} onChange={setPos} options={[{ value: 'center', label: 'Center' }, { value: 'bottom-right', label: 'Corner' }, { value: 'tile', label: 'Tiled' }]} />
          </Field>
        </>
      }
      process={(files, p) =>
        batchImages(files, p, {
          suffix: '-watermarked',
          draw: (img) => {
            const c = plainDraw(img)
            const ctx = c.getContext('2d')
            const fs = Math.max(10, (c.width * size) / 100 / Math.max(1, text.length / 6))
            ctx.font = `bold ${fs}px Inter, Arial, sans-serif`
            ctx.fillStyle = color
            ctx.globalAlpha = opacity
            ctx.shadowColor = 'rgba(0,0,0,.35)'
            ctx.shadowBlur = fs / 8
            const tw = ctx.measureText(text).width
            if (pos === 'tile') {
              ctx.save()
              ctx.translate(c.width / 2, c.height / 2)
              ctx.rotate(-Math.PI / 6)
              const d = Math.hypot(c.width, c.height)
              for (let y = -d / 2; y < d / 2; y += fs * 3) for (let x = -d / 2; x < d / 2; x += tw + fs * 2) ctx.fillText(text, x, y)
              ctx.restore()
            } else if (pos === 'center') {
              ctx.textBaseline = 'middle'
              ctx.fillText(text, (c.width - tw) / 2, c.height / 2)
            } else {
              ctx.textBaseline = 'bottom'
              ctx.fillText(text, c.width - tw - fs * 0.6, c.height - fs * 0.5)
            }
            return c
          },
        })
      }
    />
  )
}

/* ---------------- SVG → PNG ---------------- */
export function SvgToPng() {
  const [scale, setScale] = useState(2)
  return (
    <FileTool
      accept=".svg,image/svg+xml"
      multiple
      dropLabel="Select SVG files"
      actionLabel="Convert to PNG"
      options={
        <>
          <h3>SVG to PNG</h3>
          <Field label="Scale"><Segmented value={scale} onChange={setScale} options={[1, 2, 4, 8].map((v) => ({ value: v, label: `${v}x` }))} /></Field>
        </>
      }
      process={(files, p) =>
        batchImages(files, p, {
          type: 'image/png',
          draw: (img) => {
            const w = imgW(img) || 512
            const h = imgH(img) || 512
            const [c, ctx] = makeCanvas(w * scale, h * scale)
            ctx.drawImage(img, 0, 0, c.width, c.height)
            return c
          },
        })
      }
    />
  )
}

/* ---------------- Favicon generator ---------------- */
export function FaviconGenerator() {
  return (
    <FileTool
      accept={IMG}
      dropLabel="Select image"
      actionLabel="Generate favicons"
      options={<><h3>Favicon generator</h3><p className="muted">Creates PNG icons at 16, 32, 48, 64, 128, 180 (Apple), 192 and 512 px plus a favicon.ico, bundled as a ZIP.</p></>}
      process={async ([file]) => {
        const img = await fileToImage(file)
        const sizes = [16, 32, 48, 64, 128, 180, 192, 512]
        const out = []
        const icoParts = []
        for (const s of sizes) {
          const [c, ctx] = makeCanvas(s, s)
          const r = Math.min(s / imgW(img), s / imgH(img))
          const w = imgW(img) * r
          const h = imgH(img) * r
          ctx.imageSmoothingQuality = 'high'
          ctx.drawImage(img, (s - w) / 2, (s - h) / 2, w, h)
          const blob = await canvasToBlob(c, 'image/png')
          const name = s === 180 ? 'apple-touch-icon.png' : `favicon-${s}x${s}.png`
          out.push({ name, blob })
          if ([16, 32, 48].includes(s)) icoParts.push({ s, data: new Uint8Array(await blob.arrayBuffer()) })
        }
        // Build a PNG-compressed .ico containing 16/32/48.
        const header = 6 + 16 * icoParts.length
        const total = header + icoParts.reduce((a, p) => a + p.data.length, 0)
        const ico = new Uint8Array(total)
        const dv = new DataView(ico.buffer)
        dv.setUint16(2, 1, true)
        dv.setUint16(4, icoParts.length, true)
        let offset = header
        icoParts.forEach((p, i) => {
          const e = 6 + i * 16
          ico[e] = p.s
          ico[e + 1] = p.s
          dv.setUint16(e + 4, 1, true)
          dv.setUint16(e + 6, 32, true)
          dv.setUint32(e + 8, p.data.length, true)
          dv.setUint32(e + 12, offset, true)
          ico.set(p.data, offset)
          offset += p.data.length
        })
        out.push({ name: 'favicon.ico', blob: new Blob([ico], { type: 'image/x-icon' }) })
        return { blob: await zipBlobs(out), name: 'favicons.zip' }
      }}
    />
  )
}

/* ---------------- Image → Base64 ---------------- */
export function ImageToBase64() {
  const [files, setFiles] = useState([])
  const [data, setData] = useState('')
  useEffect(() => {
    if (files[0]) readAsDataURL(files[0]).then(setData)
    else setData('')
  }, [files])
  if (!files.length) return <FileTool files={files} setFiles={setFiles} accept={IMG} dropLabel="Select image" process={async () => null} />
  return (
    <div className="workspace">
      <div className="ws-main">
        <FileList files={files} setFiles={setFiles} />
        <Field label="Data URI"><textarea className="textarea mono" rows={10} readOnly value={data} /></Field>
        <Field label="CSS"><textarea className="textarea mono" rows={3} readOnly value={`background-image: url("${data}");`} /></Field>
      </div>
      <aside className="ws-side">
        <h3>Base64 output</h3>
        <p className="muted small">{formatBytes(data.length)} of text</p>
        <div className="btn-col">
          <CopyButton text={data} label="Copy data URI" />
          <CopyButton text={data.split(',')[1] || ''} label="Copy raw Base64" />
          <CopyButton text={`<img src="${data}" alt="" />`} label="Copy <img> tag" />
        </div>
        {data && <img className="b64-preview" src={data} alt="Preview" />}
      </aside>
    </div>
  )
}
