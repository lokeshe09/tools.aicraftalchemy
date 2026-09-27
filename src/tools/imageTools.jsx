import { useEffect, useRef, useState } from 'react'
import { RotateCw, RotateCcw, FlipHorizontal, FlipVertical, Trash2, Pipette } from 'lucide-react'
import FileTool from '../components/FileTool'
import { Field, Segmented, Section, Toggle, Slider, NumberInput, CopyButton, FileList, DropZone, Alert, Spinner, useTask, ErrorBox, useHandoff } from '../components/ui'
import { baseName, canvasToBlob, fileToImage, formatBytes, readAsDataURL, zipBlobs, oneOrZip, downloadBlob, loadImage } from '../lib/files'
import { EXT, makeCanvas, imgW, imgH, resizeCanvas, encodeCanvas, encodeToTarget, setDpi, UNIT_TO_INCH } from '../lib/image'
import { OCR_LANGS, createOcr } from '../lib/ocr'

const IMG = 'image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.svg,.avif,.ico'
const FORMAT_OPTS = [{ value: 'original', label: 'Same' }, { value: 'image/jpeg', label: 'JPG' }, { value: 'image/png', label: 'PNG' }, { value: 'image/webp', label: 'WEBP' }]

const outType = (file, pref) => {
  if (pref && pref !== 'original') return pref
  if (['image/jpeg', 'image/webp', 'image/png'].includes(file.type)) return file.type
  return 'image/png'
}

/** Run draw(img, file) → canvas for each file, encode, and return one file or a ZIP. */
async function batchImages(files, progress, { type, quality = 0.92, suffix = '', draw, dpi, pngColors = 0, targetBytes }) {
  const out = []
  let original = 0
  const notes = []
  for (let i = 0; i < files.length; i++) {
    progress(`Image ${i + 1} of ${files.length}`)
    original += files[i].size
    const img = await fileToImage(files[i])
    const t = outType(files[i], type)
    const canvas = await draw(img, files[i], t)
    let blob
    if (targetBytes) {
      const r = await encodeToTarget(canvas, t, targetBytes)
      blob = r.blob
      if (!r.reached) notes.push(files[i].name)
    } else blob = await encodeCanvas(canvas, t, quality, { pngColors })
    if (dpi) blob = await setDpi(blob, dpi)
    out.push({ name: `${baseName(files[i].name)}${suffix}.${EXT[t]}`, blob })
    if (canvas.width) canvas.width = canvas.height = 0
  }
  const r = await oneOrZip(out, `images${suffix}.zip`)
  r.originalSize = original
  if (notes.length) { r.note = `Could not reach the target size for: ${notes.join(', ')}. The smallest possible version was saved.`; r.noteKind = 'warn' }
  return r
}

const plainDraw = (img) => {
  const [c, ctx] = makeCanvas(imgW(img), imgH(img))
  ctx.drawImage(img, 0, 0)
  return c
}

function useObjectUrl(file) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!file) { setUrl(null); return }
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  return url
}

function useImageSize(file) {
  const [size, setSize] = useState(null)
  useEffect(() => {
    setSize(null)
    if (file) fileToImage(file).then((i) => setSize({ w: imgW(i), h: imgH(i) })).catch(() => {})
  }, [file])
  return size
}

function TargetSize({ enabled, setEnabled, value, setValue, unit, setUnit }) {
  return (
    <>
      <Toggle checked={enabled} onChange={setEnabled} label="Compress to a target file size" hint="Finds the best quality under your limit — e.g. under 50 KB for exam forms." />
      {enabled && (
        <div className="input-suffix">
          <NumberInput min={1} max={1e6} value={value} onChange={setValue} />
          <select className="input unit" value={unit} onChange={(e) => setUnit(e.target.value)}><option>KB</option><option>MB</option></select>
        </div>
      )}
    </>
  )
}

/* ---------------- Compress ---------------- */
export function CompressImage() {
  const [quality, setQuality] = useState(72)
  const [format, setFormat] = useState('original')
  const [maxW, setMaxW] = useState(0)
  const [useTarget, setUseTarget] = useState(false)
  const [target, setTarget] = useState(100)
  const [unit, setUnit] = useState('KB')
  const [pngColors, setPngColors] = useState(256)
  return (
    <FileTool
      accept={IMG}
      multiple
      actionLabel="Compress images"
      formats="JPG, PNG, WEBP, GIF, BMP, SVG, AVIF"
      options={({ files }) => (
        <>
          <h3>Compress images</h3>
          {files.some((f) => f.type === 'image/png') && format === 'original' && !useTarget && <p className="muted small">PNG files are compressed with smart colour reduction (like TinyPNG).</p>}
          <Section title="Target">
            <TargetSize enabled={useTarget} setEnabled={setUseTarget} value={target} setValue={setTarget} unit={unit} setUnit={setUnit} />
            {!useTarget && <Slider label="Quality" suffix="%" min={10} max={100} value={quality} onChange={setQuality} />}
            {!useTarget && (format === 'image/png' || (format === 'original' && files.some((f) => f.type === 'image/png'))) && (
              <Field label="PNG colours"><Segmented full value={pngColors} onChange={setPngColors} options={[{ value: 0, label: 'Lossless' }, { value: 256, label: '256' }, { value: 128, label: '128' }, { value: 64, label: '64' }]} /></Field>
            )}
          </Section>
          <Field label="Output format"><Segmented full value={format} onChange={setFormat} options={FORMAT_OPTS} /></Field>
          <Field label="Max width (px, 0 = keep)"><NumberInput min={0} max={20000} value={maxW} onChange={(v) => setMaxW(Math.round(v))} /></Field>
          <p className="muted small">Location and camera data (EXIF) are removed automatically.</p>
        </>
      )}
      process={(files, p) =>
        batchImages(files, p, {
          type: format, quality: quality / 100, suffix: '-compressed', pngColors,
          targetBytes: useTarget ? target * (unit === 'MB' ? 1048576 : 1024) : 0,
          draw: (img) => {
            const s = maxW && imgW(img) > maxW ? maxW / imgW(img) : 1
            return s < 1 ? resizeCanvas(img, imgW(img) * s, imgH(img) * s) : plainDraw(img)
          },
        })
      }
    />
  )
}

/* ---------------- Resize ---------------- */
const PRESETS = {
  passport_in: { label: 'Passport photo (India) 35×45 mm', w: 35, h: 45, unit: 'mm', dpi: 300 },
  passport_us: { label: 'US passport / visa 2×2 in', w: 2, h: 2, unit: 'in', dpi: 300 },
  stamp: { label: 'Stamp size 20×25 mm', w: 20, h: 25, unit: 'mm', dpi: 300 },
  sign_ssc: { label: 'Signature 3.5×1.5 cm', w: 3.5, h: 1.5, unit: 'cm', dpi: 200 },
  ig_square: { label: 'Instagram post 1080×1080', w: 1080, h: 1080, unit: 'px' },
  ig_story: { label: 'Story / Reel 1080×1920', w: 1080, h: 1920, unit: 'px' },
  yt_thumb: { label: 'YouTube thumbnail 1280×720', w: 1280, h: 720, unit: 'px' },
  fb_cover: { label: 'Facebook cover 820×312', w: 820, h: 312, unit: 'px' },
  li_banner: { label: 'LinkedIn banner 1584×396', w: 1584, h: 396, unit: 'px' },
  hd: { label: 'Full HD 1920×1080', w: 1920, h: 1080, unit: 'px' },
}

export function ResizeImage() {
  const [files, setFiles] = useState([])
  const [mode, setMode] = useState('px')
  const [w, setW] = useState(1280)
  const [h, setH] = useState(720)
  const [unit, setUnit] = useState('px')
  const [dpi, setDpiVal] = useState(300)
  const [pct, setPct] = useState(50)
  const [keep, setKeep] = useState(true)
  const [fit, setFit] = useState('contain')
  const [bg, setBg] = useState('#ffffff')
  const [noUpscale, setNoUpscale] = useState(false)
  const [format, setFormat] = useState('original')
  const [quality, setQuality] = useState(92)
  const [useTarget, setUseTarget] = useState(false)
  const [target, setTarget] = useState(50)
  const [tUnit, setTUnit] = useState('KB')
  const size = useImageSize(files[0])

  const applyPreset = (k) => {
    const p = PRESETS[k]
    if (!p) return
    setMode('px')
    setUnit(p.unit)
    setW(p.w)
    setH(p.h)
    if (p.dpi) setDpiVal(p.dpi)
    setKeep(false)
    setFit('cover')
  }
  const toPx = (v) => (unit === 'px' ? v : v * UNIT_TO_INCH[unit] * dpi)
  const onW = (v) => { setW(v); if (keep && size && mode === 'px') setH(+(v * (size.h / size.w)).toFixed(unit === 'px' ? 0 : 2)) }
  const onH = (v) => { setH(v); if (keep && size && mode === 'px') setW(+(v * (size.w / size.h)).toFixed(unit === 'px' ? 0 : 2)) }

  return (
    <FileTool
      files={files}
      setFiles={setFiles}
      accept={IMG}
      multiple
      actionLabel="Resize images"
      options={
        <>
          <h3>Resize</h3>
          {size && <p className="muted small">Original: {size.w} × {size.h} px</p>}
          <select className="input" value="" onChange={(e) => applyPreset(e.target.value)}>
            <option value="">Quick presets…</option>
            {Object.entries(PRESETS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
          </select>
          <Segmented full value={mode} onChange={setMode} options={[{ value: 'px', label: 'By size' }, { value: 'pct', label: 'By percentage' }]} />
          {mode === 'px' ? (
            <>
              <div className="grid-3">
                <Field label="Width"><NumberInput min={0.01} max={50000} step={unit === 'px' ? 1 : 0.1} value={w} onChange={onW} /></Field>
                <Field label="Height"><NumberInput min={0.01} max={50000} step={unit === 'px' ? 1 : 0.1} value={h} onChange={onH} /></Field>
                <Field label="Unit"><select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}><option value="px">px</option><option value="cm">cm</option><option value="mm">mm</option><option value="in">inch</option></select></Field>
              </div>
              {unit !== 'px' && <Field label="Resolution (DPI)" hint={`= ${Math.round(toPx(w))} × ${Math.round(toPx(h))} pixels`}><NumberInput min={30} max={1200} value={dpi} onChange={(v) => setDpiVal(Math.round(v))} /></Field>}
              <Toggle checked={keep} onChange={setKeep} label="Lock aspect ratio" />
              {!keep && (
                <Field label="When the shape differs">
                  <Segmented full value={fit} onChange={setFit} options={[{ value: 'cover', label: 'Crop to fill' }, { value: 'contain', label: 'Fit + pad' }, { value: 'stretch', label: 'Stretch' }]} />
                </Field>
              )}
              {!keep && fit === 'contain' && <Field label="Padding colour"><input className="input color" type="color" value={bg} onChange={(e) => setBg(e.target.value)} /></Field>}
              <Toggle checked={noUpscale} onChange={setNoUpscale} label="Don't enlarge smaller images" />
            </>
          ) : (
            <Slider label="Scale" suffix="%" min={1} max={500} value={pct} onChange={setPct} />
          )}
          <Section title="Output">
            <Segmented full value={format} onChange={setFormat} options={FORMAT_OPTS} />
            <TargetSize enabled={useTarget} setEnabled={setUseTarget} value={target} setValue={setTarget} unit={tUnit} setUnit={setTUnit} />
            {!useTarget && format !== 'image/png' && <Slider label="Quality" suffix="%" min={30} max={100} value={quality} onChange={setQuality} />}
          </Section>
        </>
      }
      process={(fs, p) =>
        batchImages(fs, p, {
          type: format, quality: quality / 100, suffix: '-resized',
          dpi: mode === 'px' && unit !== 'px' ? dpi : undefined,
          targetBytes: useTarget ? target * (tUnit === 'MB' ? 1048576 : 1024) : 0,
          draw: (img) => {
            const iw = imgW(img), ih = imgH(img)
            if (mode === 'pct') return resizeCanvas(img, (iw * pct) / 100, (ih * pct) / 100)
            let tw = Math.round(toPx(w)), th = Math.round(toPx(h))
            if (keep) {
              const s = Math.min(tw / iw, th / ih)
              const f = noUpscale ? Math.min(1, s) : s
              return resizeCanvas(img, iw * f, ih * f)
            }
            if (noUpscale && tw > iw && th > ih) { tw = iw; th = ih }
            if (fit === 'stretch') return resizeCanvas(img, tw, th)
            const s = fit === 'cover' ? Math.max(tw / iw, th / ih) : Math.min(tw / iw, th / ih)
            const scaled = resizeCanvas(img, iw * s, ih * s)
            const [c, ctx] = makeCanvas(tw, th, fit === 'contain' ? bg : null)
            ctx.drawImage(scaled, (tw - scaled.width) / 2, (th - scaled.height) / 2)
            return c
          },
        })
      }
    />
  )
}

/* ---------------- Crop (interactive) ---------------- */
const RATIOS = [['Free', 0], ['1:1', 1], ['4:3', 4 / 3], ['3:2', 3 / 2], ['16:9', 16 / 9], ['9:16', 9 / 16], ['Passport', 35 / 45], ['A4', 210 / 297]]

export function CropImage() {
  const [files, setFiles] = useState([])
  const url = useObjectUrl(files[0])
  const nat = useImageSize(files[0]) || { w: 0, h: 0 }
  const [sel, setSel] = useState({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 })
  const [ratio, setRatio] = useState(0)
  const [shape, setShape] = useState('rect')
  const [format, setFormat] = useState('original')
  const stage = useRef(null)
  const drag = useRef(null)

  useEffect(() => { setSel({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 }); setRatio(0) }, [files])

  const applyRatio = (r) => {
    setRatio(r)
    if (!r || !nat.w) return
    let w = 0.8
    let h = (w * nat.w) / r / nat.h
    if (h > 0.9) { h = 0.8; w = (h * nat.h * r) / nat.w }
    setSel({ x: (1 - w) / 2, y: (1 - h) / 2, w, h })
  }
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
    if (d.kind === 'move') { setSel({ ...s, x: Math.min(1 - s.w, Math.max(0, s.x + dx)), y: Math.min(1 - s.h, Math.max(0, s.y + dy)) }); return }
    let w = Math.max(0.02, Math.min(1 - s.x, s.w + dx))
    let h = Math.max(0.02, Math.min(1 - s.y, s.h + dy))
    if (ratio && nat.w) {
      h = (w * nat.w) / ratio / nat.h
      if (s.y + h > 1) { h = 1 - s.y; w = (h * nat.h * ratio) / nat.w }
    }
    setSel({ ...s, w, h })
  }
  const px = { x: Math.round(sel.x * nat.w), y: Math.round(sel.y * nat.h), w: Math.round(sel.w * nat.w), h: Math.round(sel.h * nat.h) }
  const setPx = (k, v) => {
    const f = { x: v / nat.w, y: v / nat.h, w: v / nat.w, h: v / nat.h }[k]
    if (k === 'x') setSel({ ...sel, x: Math.min(1 - sel.w, Math.max(0, f)) })
    if (k === 'y') setSel({ ...sel, y: Math.min(1 - sel.h, Math.max(0, f)) })
    if (k === 'w') setSel({ ...sel, w: Math.min(1 - sel.x, Math.max(0.001, f)) })
    if (k === 'h') setSel({ ...sel, h: Math.min(1 - sel.y, Math.max(0.001, f)) })
  }

  return (
    <FileTool
      files={files}
      setFiles={setFiles}
      accept={IMG}
      actionLabel="Crop image"
      main={
        url && (
          <div className="crop-wrap">
            <div className="crop-stage" ref={stage} onPointerMove={move} onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}>
              <img src={url} alt="To crop" draggable={false} />
              <div className={`crop-sel ${shape === 'circle' ? 'circle' : ''}`} style={{ left: `${sel.x * 100}%`, top: `${sel.y * 100}%`, width: `${sel.w * 100}%`, height: `${sel.h * 100}%` }} onPointerDown={(e) => down(e, 'move')}>
                <span className="crop-grid" />
                <span className="crop-handle se" onPointerDown={(e) => down(e, 'resize')} />
              </div>
            </div>
          </div>
        )
      }
      options={
        <>
          <h3>Crop image</h3>
          <Field label="Aspect ratio">
            <div className="chip-row">{RATIOS.map(([l, r]) => <button key={l} className={`chip ${ratio === r ? 'active' : ''}`} onClick={() => applyRatio(r)}>{l}</button>)}</div>
          </Field>
          <Field label="Shape"><Segmented full value={shape} onChange={setShape} options={[{ value: 'rect', label: 'Rectangle' }, { value: 'circle', label: 'Circle (PNG)' }]} /></Field>
          <div className="grid-2">
            <Field label="X (px)"><NumberInput min={0} max={nat.w} value={px.x} onChange={(v) => setPx('x', v)} /></Field>
            <Field label="Y (px)"><NumberInput min={0} max={nat.h} value={px.y} onChange={(v) => setPx('y', v)} /></Field>
            <Field label="Width (px)"><NumberInput min={1} max={nat.w} value={px.w} onChange={(v) => setPx('w', v)} /></Field>
            <Field label="Height (px)"><NumberInput min={1} max={nat.h} value={px.h} onChange={(v) => setPx('h', v)} /></Field>
          </div>
          {shape === 'rect' && <Field label="Format"><Segmented full value={format} onChange={setFormat} options={FORMAT_OPTS} /></Field>}
        </>
      }
      process={(fs, p) =>
        batchImages(fs, p, {
          type: shape === 'circle' ? 'image/png' : format,
          suffix: '-cropped',
          draw: (img) => {
            const [c, ctx] = makeCanvas(sel.w * imgW(img), sel.h * imgH(img))
            if (shape === 'circle') {
              ctx.beginPath()
              ctx.ellipse(c.width / 2, c.height / 2, c.width / 2, c.height / 2, 0, 0, Math.PI * 2)
              ctx.clip()
            }
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
  const [quality, setQuality] = useState(92)
  const [bg, setBg] = useState('#ffffff')
  const label = EXT[to].toUpperCase()
  return (
    <FileTool
      accept={from || IMG}
      multiple
      actionLabel={`Convert to ${label}`}
      options={
        <>
          <h3>Convert to {label}</h3>
          {to !== 'image/png' ? <Slider label="Quality" suffix="%" min={30} max={100} value={quality} onChange={setQuality} /> : <p className="muted small">PNG is lossless and keeps transparency.</p>}
          {to === 'image/jpeg' && <Field label="Background for transparent areas"><input className="input color" type="color" value={bg} onChange={(e) => setBg(e.target.value)} /></Field>}
        </>
      }
      process={(files, p) => batchImages(files, p, {
        type: to, quality: quality / 100,
        draw: (img) => { const [c, ctx] = makeCanvas(imgW(img), imgH(img), to === 'image/jpeg' ? bg : null); ctx.drawImage(img, 0, 0); return c },
      })}
    />
  )
}

/* ---------------- HEIC → JPG ---------------- */
export function HeicToJpg() {
  const [to, setTo] = useState('image/jpeg')
  const [quality, setQuality] = useState(92)
  return (
    <FileTool
      accept=".heic,.heif,image/heic,image/heif"
      multiple
      actionLabel="Convert"
      formats="HEIC / HEIF photos from iPhone and iPad"
      options={
        <>
          <h3>HEIC converter</h3>
          <Field label="Output"><Segmented full value={to} onChange={setTo} options={[{ value: 'image/jpeg', label: 'JPG' }, { value: 'image/png', label: 'PNG' }]} /></Field>
          {to === 'image/jpeg' && <Slider label="Quality" suffix="%" min={40} max={100} value={quality} onChange={setQuality} />}
        </>
      }
      process={async (files, progress) => {
        const { default: heic2any } = await import('heic2any')
        const out = []
        for (let i = 0; i < files.length; i++) {
          progress(`Photo ${i + 1} of ${files.length}`)
          let blob
          try { blob = await heic2any({ blob: files[i], toType: to, quality: quality / 100 }) } catch { throw new Error(`"${files[i].name}" is not a valid HEIC image.`) }
          const list = Array.isArray(blob) ? blob : [blob]
          list.forEach((b, k) => out.push({ name: `${baseName(files[i].name)}${list.length > 1 ? `-${k + 1}` : ''}.${EXT[to]}`, blob: b }))
        }
        return oneOrZip(out, 'converted.zip')
      }}
    />
  )
}

/* ---------------- Rotate / flip ---------------- */
export function RotateImage() {
  const [files, setFiles] = useState([])
  const url = useObjectUrl(files[0])
  const [angle, setAngle] = useState(0)
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)
  const [bg, setBg] = useState('transparent')
  return (
    <FileTool
      files={files}
      setFiles={setFiles}
      accept={IMG}
      multiple
      actionLabel="Apply"
      disabled={!angle && !flipH && !flipV}
      main={
        <>
          {url && <div className="preview-box"><img src={url} alt="Preview" style={{ transform: `rotate(${angle}deg) scale(${flipH ? -1 : 1}, ${flipV ? -1 : 1})` }} /></div>}
          <FileList files={files} setFiles={setFiles} />
        </>
      }
      options={
        <>
          <h3>Rotate &amp; flip</h3>
          <div className="btn-grid">
            <button className="btn btn-soft" onClick={() => setAngle((a) => ((a - 90 + 540) % 360) - 180)}><RotateCcw size={16} /> 90° left</button>
            <button className="btn btn-soft" onClick={() => setAngle((a) => ((a + 90 + 540) % 360) - 180)}><RotateCw size={16} /> 90° right</button>
            <button className={`btn ${flipH ? 'btn-primary' : 'btn-soft'}`} onClick={() => setFlipH(!flipH)}><FlipHorizontal size={16} /> Mirror</button>
            <button className={`btn ${flipV ? 'btn-primary' : 'btn-soft'}`} onClick={() => setFlipV(!flipV)}><FlipVertical size={16} /> Flip</button>
          </div>
          <Slider label="Free rotation" suffix="°" min={-180} max={180} step={0.5} value={angle} onChange={setAngle} />
          {angle % 90 !== 0 && (
            <Field label="Corner fill"><Segmented full value={bg} onChange={setBg} options={[{ value: 'transparent', label: 'Transparent' }, { value: '#ffffff', label: 'White' }, { value: '#000000', label: 'Black' }]} /></Field>
          )}
        </>
      }
      process={(fs, p) =>
        batchImages(fs, p, {
          type: angle % 90 !== 0 && bg === 'transparent' ? 'image/png' : 'original',
          suffix: '-rotated',
          draw: (img) => {
            const rad = (angle * Math.PI) / 180
            const iw = imgW(img), ih = imgH(img)
            const w = Math.abs(iw * Math.cos(rad)) + Math.abs(ih * Math.sin(rad))
            const h = Math.abs(iw * Math.sin(rad)) + Math.abs(ih * Math.cos(rad))
            const [c, ctx] = makeCanvas(w, h, bg !== 'transparent' ? bg : null)
            ctx.translate(c.width / 2, c.height / 2)
            ctx.rotate(rad)
            ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1)
            ctx.drawImage(img, -iw / 2, -ih / 2)
            return c
          },
        })
      }
    />
  )
}

/* ---------------- Photo editor (filters) ---------------- */
const DEFAULT_F = { brightness: 100, contrast: 100, saturate: 100, grayscale: 0, sepia: 0, blur: 0, invert: 0, hue: 0, sharpen: 0 }
const LOOKS = {
  Original: DEFAULT_F,
  'B&W': { ...DEFAULT_F, grayscale: 100, contrast: 115 },
  Vintage: { ...DEFAULT_F, sepia: 55, contrast: 90, brightness: 105, saturate: 80 },
  Vivid: { ...DEFAULT_F, saturate: 150, contrast: 115 },
  Cool: { ...DEFAULT_F, hue: 190, saturate: 80 },
  Document: { ...DEFAULT_F, grayscale: 100, contrast: 160, brightness: 110, sharpen: 40 },
}

function sharpenCanvas(c, amount) {
  if (!amount) return
  const ctx = c.getContext('2d')
  const { width: w, height: h } = c
  const src = ctx.getImageData(0, 0, w, h)
  const out = ctx.createImageData(w, h)
  const s = src.data, o = out.data
  const k = amount / 100
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      for (let ch = 0; ch < 3; ch++) {
        const c0 = s[i + ch]
        const n = (y > 0 ? s[i - w * 4 + ch] : c0) + (y < h - 1 ? s[i + w * 4 + ch] : c0) + (x > 0 ? s[i - 4 + ch] : c0) + (x < w - 1 ? s[i + 4 + ch] : c0)
        o[i + ch] = Math.min(255, Math.max(0, c0 + k * (4 * c0 - n)))
      }
      o[i + 3] = s[i + 3]
    }
  }
  ctx.putImageData(out, 0, 0)
}

export function ImageFilters() {
  const [files, setFiles] = useState([])
  const url = useObjectUrl(files[0])
  const [f, setF] = useState(DEFAULT_F)
  const [compare, setCompare] = useState(false)
  const filter = `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturate}%) grayscale(${f.grayscale}%) sepia(${f.sepia}%) blur(${f.blur}px) invert(${f.invert}%) hue-rotate(${f.hue}deg)`
  const sliders = [['brightness', 0, 200, '%'], ['contrast', 0, 200, '%'], ['saturate', 0, 300, '%'], ['sharpen', 0, 100, '%'], ['grayscale', 0, 100, '%'], ['sepia', 0, 100, '%'], ['invert', 0, 100, '%'], ['hue', 0, 360, '°'], ['blur', 0, 20, 'px']]
  return (
    <FileTool
      files={files}
      setFiles={setFiles}
      accept={IMG}
      multiple
      actionLabel="Save edited image"
      main={url && (
        <div className="preview-box" onPointerDown={() => setCompare(true)} onPointerUp={() => setCompare(false)} onPointerLeave={() => setCompare(false)}>
          <img src={url} alt="Preview" style={{ filter: compare ? 'none' : filter }} />
          <span className="preview-hint">Hold to compare with original</span>
        </div>
      )}
      options={
        <>
          <h3>Photo editor</h3>
          <div className="chip-row">{Object.keys(LOOKS).map((k) => <button key={k} className="chip" onClick={() => setF(LOOKS[k])}>{k}</button>)}</div>
          {sliders.map(([k, min, max, u]) => <Slider key={k} label={k[0].toUpperCase() + k.slice(1)} suffix={u} min={min} max={max} value={f[k]} onChange={(v) => setF({ ...f, [k]: v })} />)}
          <p className="muted small">Settings apply to every image you added.</p>
        </>
      }
      process={(fs, p) =>
        batchImages(fs, p, {
          suffix: '-edited',
          draw: (img) => {
            const [c, ctx] = makeCanvas(imgW(img), imgH(img))
            ctx.filter = filter
            ctx.drawImage(img, 0, 0)
            ctx.filter = 'none'
            sharpenCanvas(c, f.sharpen)
            return c
          },
        })
      }
    />
  )
}

/* ---------------- Watermark image ---------------- */
export function WatermarkImage() {
  const [kind, setKind] = useState('text')
  const [text, setText] = useState('© tools.aicraftalchemy')
  const [logo, setLogo] = useState(null)
  const [size, setSize] = useState(6)
  const [color, setColor] = useState('#ffffff')
  const [opacity, setOpacity] = useState(70)
  const [angle, setAngle] = useState(0)
  const [pos, setPos] = useState('bottom-right')
  return (
    <FileTool
      accept={IMG}
      multiple
      actionLabel="Add watermark"
      options={
        <>
          <h3>Watermark</h3>
          <Segmented full value={kind} onChange={setKind} options={[{ value: 'text', label: 'Text' }, { value: 'logo', label: 'Logo' }]} />
          {kind === 'text' ? (
            <>
              <Field label="Text"><input className="input" value={text} onChange={(e) => setText(e.target.value)} /></Field>
              <Field label="Colour"><input className="input color" type="color" value={color} onChange={(e) => setColor(e.target.value)} /></Field>
            </>
          ) : (
            <Field label="Logo image (PNG with transparency works best)"><input className="input" type="file" accept="image/*" onChange={(e) => setLogo(e.target.files[0] || null)} /></Field>
          )}
          <Slider label={kind === 'text' ? 'Text height' : 'Logo width'} suffix="%" min={1} max={60} value={size} onChange={setSize} />
          <Slider label="Opacity" suffix="%" min={5} max={100} value={opacity} onChange={setOpacity} />
          <Slider label="Rotation" suffix="°" min={-90} max={90} value={angle} onChange={setAngle} />
          <Field label="Position">
            <select className="input" value={pos} onChange={(e) => setPos(e.target.value)}>
              {['top-left', 'top-center', 'top-right', 'center', 'bottom-left', 'bottom-center', 'bottom-right', 'tile'].map((p) => <option key={p} value={p}>{p.replace('-', ' ')}</option>)}
            </select>
          </Field>
        </>
      }
      process={async (files, p) => {
        const logoImg = kind === 'logo' ? (logo ? await fileToImage(logo) : null) : null
        if (kind === 'logo' && !logoImg) throw new Error('Choose a logo image.')
        if (kind === 'text' && !text.trim()) throw new Error('Enter watermark text.')
        return batchImages(files, p, {
          suffix: '-watermarked',
          draw: (img) => {
            const c = plainDraw(img)
            const ctx = c.getContext('2d')
            ctx.globalAlpha = opacity / 100
            let w, h
            if (logoImg) { w = (c.width * size) / 100; h = (imgH(logoImg) / imgW(logoImg)) * w } else {
              const fs = Math.max(8, (Math.min(c.width, c.height) * size) / 100)
              ctx.font = `600 ${fs}px Inter, "Segoe UI", Arial, sans-serif`
              ctx.fillStyle = color
              ctx.shadowColor = 'rgba(0,0,0,.35)'
              ctx.shadowBlur = fs / 6
              w = ctx.measureText(text).width
              h = fs
            }
            const m = Math.min(c.width, c.height) * 0.03
            const drawAt = (cx, cy) => {
              ctx.save()
              ctx.translate(cx, cy)
              ctx.rotate((angle * Math.PI) / 180)
              if (logoImg) ctx.drawImage(logoImg, -w / 2, -h / 2, w, h)
              else { ctx.textBaseline = 'middle'; ctx.fillText(text, -w / 2, 0) }
              ctx.restore()
            }
            if (pos === 'tile') {
              for (let row = 0, y = h; y < c.height + h; y += h * 3.5, row++) for (let x = w / 2 - (row % 2) * w * 0.8; x < c.width + w; x += w * 1.6) drawAt(x, y)
            } else {
              const [v, hz] = pos === 'center' ? ['middle', 'center'] : pos.split('-')
              drawAt(hz === 'left' ? m + w / 2 : hz === 'right' ? c.width - m - w / 2 : c.width / 2, v === 'top' ? m + h / 2 : v === 'bottom' ? c.height - m - h / 2 : c.height / 2)
            }
            return c
          },
        })
      }}
    />
  )
}

/* ---------------- SVG → PNG ---------------- */
export function SvgToPng() {
  const [width, setWidth] = useState(1024)
  const [bg, setBg] = useState('transparent')
  const [to, setTo] = useState('image/png')
  return (
    <FileTool
      accept=".svg,image/svg+xml"
      multiple
      actionLabel="Convert SVG"
      options={
        <>
          <h3>SVG to image</h3>
          <Field label="Output"><Segmented full value={to} onChange={setTo} options={[{ value: 'image/png', label: 'PNG' }, { value: 'image/jpeg', label: 'JPG' }, { value: 'image/webp', label: 'WEBP' }]} /></Field>
          <Field label="Width (px)" hint="Height follows the SVG's proportions."><NumberInput min={8} max={16000} value={width} onChange={(v) => setWidth(Math.round(v))} /></Field>
          <Field label="Background"><Segmented full value={bg} onChange={setBg} options={[{ value: 'transparent', label: 'Transparent' }, { value: '#ffffff', label: 'White' }, { value: '#000000', label: 'Black' }]} /></Field>
        </>
      }
      process={(files, p) =>
        batchImages(files, p, {
          type: to,
          draw: (img) => {
            const iw = imgW(img) || 512
            const ih = imgH(img) || 512
            const [c, ctx] = makeCanvas(width, (width * ih) / iw, bg !== 'transparent' ? bg : null)
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
  const [pad, setPad] = useState(0)
  const [bg, setBg] = useState('transparent')
  const [radius, setRadius] = useState(0)
  return (
    <FileTool
      accept={IMG}
      actionLabel="Generate favicons"
      options={
        <>
          <h3>Favicon generator</h3>
          <p className="muted small">Creates favicon.ico (16/32/48), PNG icons from 16 to 512 px, the Apple touch icon, a web manifest and the HTML snippet — all in one ZIP.</p>
          <Slider label="Padding" suffix="%" min={0} max={30} value={pad} onChange={setPad} />
          <Field label="Background"><Segmented full value={bg} onChange={setBg} options={[{ value: 'transparent', label: 'None' }, { value: '#ffffff', label: 'White' }, { value: '#000000', label: 'Black' }]} /></Field>
          {bg !== 'transparent' && <Slider label="Corner radius" suffix="%" min={0} max={50} value={radius} onChange={setRadius} />}
        </>
      }
      process={async ([file]) => {
        const img = await fileToImage(file)
        const sizes = [16, 32, 48, 64, 128, 180, 192, 256, 512]
        const out = []
        const icoParts = []
        for (const s of sizes) {
          const [c, ctx] = makeCanvas(s, s)
          if (bg !== 'transparent') {
            ctx.fillStyle = bg
            ctx.beginPath()
            ctx.roundRect ? ctx.roundRect(0, 0, s, s, (s * radius) / 100) : ctx.rect(0, 0, s, s)
            ctx.fill()
          }
          const inner = s * (1 - (2 * pad) / 100)
          const r = Math.min(inner / imgW(img), inner / imgH(img))
          const w = imgW(img) * r
          const h = imgH(img) * r
          const src = resizeCanvas(img, w, h)
          ctx.drawImage(src, (s - w) / 2, (s - h) / 2)
          const blob = await canvasToBlob(c, 'image/png')
          out.push({ name: s === 180 ? 'apple-touch-icon.png' : s === 192 ? 'android-chrome-192x192.png' : s === 512 ? 'android-chrome-512x512.png' : `favicon-${s}x${s}.png`, blob })
          if ([16, 32, 48].includes(s)) icoParts.push({ s, data: new Uint8Array(await blob.arrayBuffer()) })
        }
        const header = 6 + 16 * icoParts.length
        const ico = new Uint8Array(header + icoParts.reduce((a, p) => a + p.data.length, 0))
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
        const manifest = { name: '', short_name: '', icons: [{ src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' }, { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' }], theme_color: '#ffffff', background_color: '#ffffff', display: 'standalone' }
        out.push({ name: 'site.webmanifest', blob: new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }) })
        out.push({ name: 'snippet.html', blob: new Blob([`<link rel="icon" href="/favicon.ico" sizes="any">\n<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">\n<link rel="apple-touch-icon" href="/apple-touch-icon.png">\n<link rel="manifest" href="/site.webmanifest">\n`], { type: 'text/html' }) })
        return { blob: await zipBlobs(out), name: 'favicons.zip', count: out.length }
      }}
    />
  )
}

/* ---------------- Image ⇄ Base64 ---------------- */
export function ImageToBase64() {
  const [files, setFiles] = useState([])
  useHandoff(IMG, setFiles)
  const [data, setData] = useState('')
  useEffect(() => {
    if (files[0]) readAsDataURL(files[0]).then(setData)
    else setData('')
  }, [files])
  if (!files.length) return <DropZone accept={IMG} onFiles={setFiles} label="Choose image" />
  return (
    <div className="workspace">
      <div className="ws-main">
        <FileList files={files} setFiles={setFiles} />
        <Field label="Data URI"><textarea className="textarea mono" rows={9} readOnly value={data} /></Field>
        <Field label="CSS"><textarea className="textarea mono" rows={3} readOnly value={`background-image: url("${data}");`} /></Field>
      </div>
      <aside className="ws-side">
        <h3>Base64 output</h3>
        <p className="muted small">{formatBytes(data.length)} of text ({Math.round((data.length / (files[0]?.size || 1)) * 100)}% of the file size)</p>
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

export function Base64ToImage() {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [img, setImg] = useState(null)
  useEffect(() => {
    setError('')
    setImg(null)
    const t = text.trim()
    if (!t) return
    const m = t.match(/^data:(image\/[\w+.-]+);base64,(.*)$/s)
    const mime = m ? m[1] : 'image/png'
    const b64 = (m ? m[2] : t).replace(/\s+/g, '')
    try {
      const bin = atob(b64)
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
      let type = mime
      if (!m) {
        if (bytes[0] === 0xff && bytes[1] === 0xd8) type = 'image/jpeg'
        else if (bytes[0] === 0x47 && bytes[1] === 0x49) type = 'image/gif'
        else if (bytes[0] === 0x52 && bytes[8] === 0x57) type = 'image/webp'
        else if (bin.trimStart().startsWith('<svg') || bin.includes('<svg')) type = 'image/svg+xml'
      }
      const blob = new Blob([bytes], { type })
      loadImage(URL.createObjectURL(blob)).then((im) => setImg({ blob, url: im.src, w: im.naturalWidth, h: im.naturalHeight })).catch(() => setError('This Base64 text is not a valid image.'))
    } catch { setError('This is not valid Base64.') }
  }, [text])
  return (
    <div className="workspace">
      <div className="ws-main">
        <Field label="Paste Base64 or a data URI"><textarea className="textarea mono" rows={14} value={text} onChange={(e) => setText(e.target.value)} placeholder="data:image/png;base64,iVBORw0KGgo…" /></Field>
        {error && <Alert kind="error">{error}</Alert>}
      </div>
      <aside className="ws-side">
        <h3>Image</h3>
        {img ? (
          <>
            <img className="b64-preview" src={img.url} alt="Decoded" />
            <p className="muted small">{img.w} × {img.h} px · {formatBytes(img.blob.size)}</p>
            <button className="btn btn-primary" onClick={() => downloadBlob(img.blob, `image.${img.blob.type.split('/')[1].replace('svg+xml', 'svg').replace('jpeg', 'jpg')}`)}>Download image</button>
          </>
        ) : <p className="muted small">The decoded image appears here.</p>}
      </aside>
    </div>
  )
}

/* ---------------- Image → Text (OCR) ---------------- */
export function ImageToText() {
  const [langs, setLangs] = useState(['eng'])
  const [text, setText] = useState('')
  const toggle = (l) => setLangs((cur) => (cur.includes(l) ? cur.filter((x) => x !== l) : cur.length >= 3 ? cur : [...cur, l]))
  return (
    <FileTool
      accept={IMG}
      multiple
      camera
      actionLabel="Extract text"
      disabled={!langs.length}
      resultTitle="Text extracted"
      resultExtra={<><textarea className="textarea" rows={12} readOnly value={text} aria-label="Recognised text" /><CopyButton text={text} label="Copy text" /></>}
      options={
        <>
          <h3>Image to text (OCR)</h3>
          <p className="muted small">Recognises printed text in photos, screenshots and scans. Language data downloads once; images stay on your device.</p>
          <div className="lang-grid">{OCR_LANGS.map(([c, l]) => <button key={c} className={`chip ${langs.includes(c) ? 'active' : ''}`} onClick={() => toggle(c)}>{l}</button>)}</div>
        </>
      }
      process={async (files, progress) => {
        const ocr = await createOcr(langs.join('+'), progress)
        const parts = []
        try {
          for (let i = 0; i < files.length; i++) {
            const data = await ocr.recognize(files[i], { page: files.length > 1 ? `${i + 1}/${files.length}` : '' })
            parts.push(files.length > 1 ? `--- ${files[i].name} ---\n${data.text.trim()}` : data.text.trim())
          }
        } finally { await ocr.terminate() }
        const all = parts.join('\n\n')
        if (!all.replace(/-+.*-+/g, '').trim()) throw new Error('No text could be recognised. Try a sharper image or another language.')
        setText(all)
        return { blob: new Blob([all], { type: 'text/plain;charset=utf-8' }), name: `${baseName(files[0].name)}.txt` }
      }}
    />
  )
}

/* ---------------- Combine images ---------------- */
export function CombineImages() {
  const [dir, setDir] = useState('vertical')
  const [cols, setCols] = useState(2)
  const [gap, setGap] = useState(0)
  const [bg, setBg] = useState('#ffffff')
  const [align, setAlign] = useState('fit')
  const [format, setFormat] = useState('image/jpeg')
  return (
    <FileTool
      accept={IMG}
      multiple
      reorder
      minFiles={2}
      actionLabel="Combine images"
      options={
        <>
          <h3>Combine images</h3>
          <Field label="Layout"><Segmented full value={dir} onChange={setDir} options={[{ value: 'vertical', label: 'Vertical' }, { value: 'horizontal', label: 'Horizontal' }, { value: 'grid', label: 'Grid' }]} /></Field>
          {dir === 'grid' && <Field label="Columns"><NumberInput min={1} max={20} value={cols} onChange={(v) => setCols(Math.round(v))} /></Field>}
          <Field label="Sizing"><Segmented full value={align} onChange={setAlign} options={[{ value: 'fit', label: 'Match sizes' }, { value: 'original', label: 'Original sizes' }]} /></Field>
          <Field label="Gap (px)"><NumberInput min={0} max={500} value={gap} onChange={(v) => setGap(Math.round(v))} /></Field>
          <Field label="Background"><input className="input color" type="color" value={bg} onChange={(e) => setBg(e.target.value)} /></Field>
          <Field label="Format"><Segmented full value={format} onChange={setFormat} options={FORMAT_OPTS.slice(1)} /></Field>
        </>
      }
      process={async (files, progress) => {
        const imgs = []
        for (let i = 0; i < files.length; i++) { progress(`Loading ${i + 1}`); imgs.push(await fileToImage(files[i])) }
        let placed = []
        let W, H
        if (dir === 'grid') {
          const cw = Math.max(...imgs.map(imgW))
          const ratio = Math.max(...imgs.map((i) => imgH(i) / imgW(i)))
          const ch = Math.round(cw * ratio)
          const rows = Math.ceil(imgs.length / cols)
          W = cols * cw + (cols - 1) * gap
          H = rows * ch + (rows - 1) * gap
          placed = imgs.map((im, k) => {
            const s = Math.min(cw / imgW(im), ch / imgH(im))
            const w = imgW(im) * s, h = imgH(im) * s
            return { im, x: (k % cols) * (cw + gap) + (cw - w) / 2, y: Math.floor(k / cols) * (ch + gap) + (ch - h) / 2, w, h }
          })
        } else if (dir === 'vertical') {
          const base = Math.max(...imgs.map(imgW))
          let y = 0
          placed = imgs.map((im) => {
            const s = align === 'fit' ? base / imgW(im) : 1
            const p = { im, x: (base - imgW(im) * s) / 2, y, w: imgW(im) * s, h: imgH(im) * s }
            y += p.h + gap
            return p
          })
          W = base
          H = y - gap
        } else {
          const base = Math.max(...imgs.map(imgH))
          let x = 0
          placed = imgs.map((im) => {
            const s = align === 'fit' ? base / imgH(im) : 1
            const p = { im, x, y: (base - imgH(im) * s) / 2, w: imgW(im) * s, h: imgH(im) * s }
            x += p.w + gap
            return p
          })
          W = x - gap
          H = base
        }
        const k = Math.min(1, Math.sqrt(100e6 / (W * H)), 16000 / Math.max(W, H))
        const [c, ctx] = makeCanvas(W * k, H * k, bg)
        for (const p of placed) ctx.drawImage(p.im, p.x * k, p.y * k, p.w * k, p.h * k)
        return { blob: await encodeCanvas(c, format, 0.92), name: `combined.${EXT[format]}`, note: k < 1 ? 'The result was scaled down to stay within browser limits.' : '' }
      }}
    />
  )
}

/* ---------------- Blur / pixelate regions ---------------- */
export function BlurImage() {
  const [files, setFiles] = useState([])
  const url = useObjectUrl(files[0])
  const [boxes, setBoxes] = useState([])
  const [mode, setMode] = useState('pixelate')
  const [strength, setStrength] = useState(12)
  const [whole, setWhole] = useState(false)
  const stage = useRef(null)
  const drag = useRef(null)
  const [draft, setDraft] = useState(null)
  useEffect(() => setBoxes([]), [files])
  const pt = (e) => {
    const r = stage.current.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
  }
  return (
    <FileTool
      files={files}
      setFiles={setFiles}
      accept={IMG}
      actionLabel={mode === 'pixelate' ? 'Pixelate' : 'Blur'}
      disabled={!whole && !boxes.length}
      main={url && (
        <div className="crop-wrap">
          <div
            className="crop-stage draw"
            ref={stage}
            onPointerDown={(e) => { if (whole) return; e.preventDefault(); stage.current.setPointerCapture(e.pointerId); drag.current = pt(e); setDraft({ ...drag.current, w: 0, h: 0 }) }}
            onPointerMove={(e) => { if (!drag.current) return; const p = pt(e); const s = drag.current; setDraft({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) }) }}
            onPointerUp={() => { if (draft && draft.w > 0.01 && draft.h > 0.01) setBoxes((b) => [...b, draft]); drag.current = null; setDraft(null) }}
          >
            <img src={url} alt="Preview" draggable={false} />
            {[...boxes, ...(draft ? [draft] : [])].map((b, i) => <div key={i} className="blur-box" style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }} />)}
          </div>
        </div>
      )}
      options={
        <>
          <h3>Blur / pixelate</h3>
          <p className="muted small">Drag on the image to cover faces, number plates, addresses or anything private.</p>
          <Segmented full value={mode} onChange={setMode} options={[{ value: 'pixelate', label: 'Pixelate' }, { value: 'blur', label: 'Blur' }, { value: 'black', label: 'Black box' }]} />
          {mode !== 'black' && <Slider label="Strength" min={2} max={60} value={strength} onChange={setStrength} />}
          <Toggle checked={whole} onChange={setWhole} label="Apply to the whole image" />
          {boxes.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setBoxes([])}><Trash2 size={14} /> Clear {boxes.length} area{boxes.length > 1 ? 's' : ''}</button>}
        </>
      }
      process={(fs, p) =>
        batchImages(fs, p, {
          suffix: '-private',
          draw: (img) => {
            const c = plainDraw(img)
            const ctx = c.getContext('2d')
            const list = whole ? [{ x: 0, y: 0, w: 1, h: 1 }] : boxes
            for (const b of list) {
              const x = Math.round(b.x * c.width), y = Math.round(b.y * c.height), w = Math.max(1, Math.round(b.w * c.width)), h = Math.max(1, Math.round(b.h * c.height))
              if (mode === 'black') { ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, h); continue }
              if (mode === 'pixelate') {
                const block = Math.max(2, Math.round((Math.min(c.width, c.height) * strength) / 600))
                const [t, tctx] = makeCanvas(Math.max(1, w / block), Math.max(1, h / block))
                tctx.drawImage(c, x, y, w, h, 0, 0, t.width, t.height)
                ctx.imageSmoothingEnabled = false
                ctx.drawImage(t, 0, 0, t.width, t.height, x, y, w, h)
                ctx.imageSmoothingEnabled = true
              } else {
                const [t, tctx] = makeCanvas(w, h)
                tctx.filter = `blur(${Math.max(1, (Math.min(c.width, c.height) * strength) / 900)}px)`
                tctx.drawImage(c, x - strength * 2, y - strength * 2, w + strength * 4, h + strength * 4, -strength * 2, -strength * 2, w + strength * 4, h + strength * 4)
                ctx.drawImage(t, x, y)
              }
            }
            return c
          },
        })
      }
    />
  )
}

/* ---------------- EXIF viewer / remover ---------------- */
function stripJpegMetadata(bytes) {
  // Lossless: drop APP1 (EXIF/XMP), APP12/13 (Photoshop/IPTC) and comments; keep JFIF, ICC (APP2), Adobe (APP14).
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  const parts = [bytes.subarray(0, 2)]
  let p = 2
  while (p < bytes.length) {
    if (bytes[p] !== 0xff) return null
    const marker = bytes[p + 1]
    if (marker === 0xda) { parts.push(bytes.subarray(p)); break }
    const len = (bytes[p + 2] << 8) | bytes[p + 3]
    const drop = marker === 0xe1 || marker === 0xec || marker === 0xed || marker === 0xfe
    if (!drop) parts.push(bytes.subarray(p, p + 2 + len))
    p += 2 + len
  }
  return new Blob(parts, { type: 'image/jpeg' })
}

export function ImageMetadata() {
  const [files, setFiles] = useState([])
  useHandoff(IMG, setFiles)
  const [meta, setMeta] = useState(null)
  const task = useTask()
  useEffect(() => {
    setMeta(null)
    if (!files[0]) return
    import('exifr').then(async ({ default: exifr }) => {
      try {
        const data = await exifr.parse(files[0], { tiff: true, exif: true, gps: true, iptc: true, xmp: true, icc: false, mergeOutput: true, translateValues: true, reviveValues: true })
        setMeta(data || {})
      } catch { setMeta({}) }
    })
  }, [files])
  if (!files.length) return <DropZone accept={IMG + ',.heic,.tif,.tiff'} onFiles={setFiles} label="Choose photo" />
  const entries = meta ? Object.entries(meta).filter(([, v]) => v !== undefined && v !== null && typeof v !== 'object' || v instanceof Date) : []
  const gps = meta && typeof meta.latitude === 'number' ? meta : null
  const important = ['Make', 'Model', 'LensModel', 'DateTimeOriginal', 'ExposureTime', 'FNumber', 'ISO', 'FocalLength', 'Software', 'Artist', 'Copyright', 'ImageWidth', 'ImageHeight']
  const sorted = [...entries].sort((a, b) => (important.indexOf(a[0]) + 1 || 99) - (important.indexOf(b[0]) + 1 || 99))
  const clean = () => task.run(async (progress) => {
    progress('Removing metadata')
    const f = files[0]
    let blob = f.type === 'image/jpeg' ? stripJpegMetadata(new Uint8Array(await f.arrayBuffer())) : null
    if (!blob) {
      const img = await fileToImage(f)
      blob = await encodeCanvas(plainDraw(img), outType(f), 0.95)
    }
    downloadBlob(blob, `${baseName(f.name)}-clean.${EXT[blob.type] || 'jpg'}`)
    return { done: true }
  })
  return (
    <div className="workspace">
      <div className="ws-main">
        <FileList files={files} setFiles={setFiles} />
        {!meta && <Spinner label="Reading metadata…" />}
        {meta && !entries.length && <Alert kind="ok">This image has no EXIF metadata.</Alert>}
        {gps && (
          <Alert kind="warn">
            This photo contains its <strong>GPS location</strong> ({gps.latitude.toFixed(5)}, {gps.longitude.toFixed(5)}). <a href={`https://www.openstreetmap.org/?mlat=${gps.latitude}&mlon=${gps.longitude}#map=16/${gps.latitude}/${gps.longitude}`} target="_blank" rel="noreferrer">View on map</a>
          </Alert>
        )}
        {entries.length > 0 && (
          <table className="meta-table">
            <tbody>{sorted.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v instanceof Date ? v.toLocaleString() : String(v).slice(0, 300)}</td></tr>)}</tbody>
          </table>
        )}
      </div>
      <aside className="ws-side">
        <h3>Photo metadata</h3>
        <p className="muted small">See hidden camera details, dates and location — then download a clean copy. JPEGs are cleaned losslessly (no re-compression).</p>
        <ErrorBox error={task.error} />
        <button className="btn btn-primary btn-block" disabled={task.busy} onClick={clean}>{task.busy ? 'Working…' : 'Download without metadata'}</button>
        {task.result && <p className="muted small">Clean copy downloaded.</p>}
      </aside>
    </div>
  )
}

/* ---------------- Colour picker & palette ---------------- */
function palette(img, count = 8) {
  const s = Math.min(1, 160 / Math.max(imgW(img), imgH(img)))
  const [c, ctx] = makeCanvas(imgW(img) * s, imgH(img) * s)
  ctx.drawImage(img, 0, 0, c.width, c.height)
  const d = ctx.getImageData(0, 0, c.width, c.height).data
  const buckets = new Map()
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue
    const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4)
    const b = buckets.get(key) || [0, 0, 0, 0]
    b[0] += d[i]; b[1] += d[i + 1]; b[2] += d[i + 2]; b[3]++
    buckets.set(key, b)
  }
  const sorted = [...buckets.values()].sort((a, b) => b[3] - a[3])
  const picked = []
  for (const [r, g, b, n] of sorted) {
    const col = [r / n, g / n, b / n].map(Math.round)
    if (picked.every((p) => Math.hypot(p[0] - col[0], p[1] - col[1], p[2] - col[2]) > 48)) picked.push(col)
    if (picked.length >= count) break
  }
  return picked.map((c2) => '#' + c2.map((v) => v.toString(16).padStart(2, '0')).join(''))
}

export function ColorPicker() {
  const [files, setFiles] = useState([])
  useHandoff(IMG, setFiles)
  const url = useObjectUrl(files[0])
  const [picked, setPicked] = useState(null)
  const [colors, setColors] = useState([])
  const canvasRef = useRef(null)
  useEffect(() => {
    setPicked(null)
    setColors([])
    if (!files[0]) return
    fileToImage(files[0]).then((img) => {
      setColors(palette(img))
      const [c, ctx] = makeCanvas(imgW(img), imgH(img))
      ctx.drawImage(img, 0, 0)
      canvasRef.current = c
    })
  }, [files])
  const pick = (e) => {
    const c = canvasRef.current
    if (!c) return
    const r = e.currentTarget.getBoundingClientRect()
    const x = Math.floor(((e.clientX - r.left) / r.width) * c.width)
    const y = Math.floor(((e.clientY - r.top) / r.height) * c.height)
    const [R, G, B] = c.getContext('2d').getImageData(x, y, 1, 1).data
    setPicked({ hex: '#' + [R, G, B].map((v) => v.toString(16).padStart(2, '0')).join(''), rgb: `rgb(${R}, ${G}, ${B})` })
  }
  if (!files.length) return <DropZone accept={IMG} onFiles={setFiles} label="Choose image" />
  return (
    <div className="workspace">
      <div className="ws-main">
        {url && <div className="preview-box pick"><img src={url} alt="Pick a colour" onClick={pick} /></div>}
        <p className="muted small center"><Pipette size={14} /> Click anywhere on the image to pick a colour.</p>
      </div>
      <aside className="ws-side">
        <h3>Picked colour</h3>
        {picked ? (
          <div className="picked">
            <span className="swatch big" style={{ background: picked.hex }} />
            <div className="btn-col"><CopyButton text={picked.hex} label={picked.hex} /><CopyButton text={picked.rgb} label={picked.rgb} /></div>
          </div>
        ) : <p className="muted small">None yet</p>}
        <h3>Palette</h3>
        <div className="palette">{colors.map((c) => <button key={c} className="pal" style={{ background: c }} onClick={() => navigator.clipboard?.writeText(c)} title={`Copy ${c}`}><span>{c}</span></button>)}</div>
        <button className="btn btn-ghost btn-sm" onClick={() => setFiles([])}>Choose another image</button>
      </aside>
    </div>
  )
}

/* ---------------- Meme generator ---------------- */
export function MemeGenerator() {
  const [files, setFiles] = useState([])
  const url = useObjectUrl(files[0])
  const [top, setTop] = useState('WHEN THE PDF')
  const [bottom, setBottom] = useState('NEVER LEAVES YOUR DEVICE')
  const [size, setSize] = useState(10)
  const draw = (img) => {
    const c = plainDraw(img)
    const ctx = c.getContext('2d')
    const fs = (c.width * size) / 100
    ctx.font = `900 ${fs}px Impact, "Anton", "Arial Black", sans-serif`
    ctx.textAlign = 'center'
    ctx.fillStyle = '#fff'
    ctx.strokeStyle = '#000'
    ctx.lineWidth = fs / 8
    ctx.lineJoin = 'round'
    const wrap = (text) => {
      const words = text.toUpperCase().split(/\s+/).filter(Boolean)
      const lines = []
      let cur = ''
      for (const w of words) {
        const t = cur ? `${cur} ${w}` : w
        if (ctx.measureText(t).width > c.width * 0.94 && cur) { lines.push(cur); cur = w } else cur = t
      }
      if (cur) lines.push(cur)
      return lines
    }
    wrap(top).forEach((l, i) => { const y = fs * 1.05 * (i + 1); ctx.strokeText(l, c.width / 2, y); ctx.fillText(l, c.width / 2, y) })
    const bl = wrap(bottom)
    bl.forEach((l, i) => { const y = c.height - fs * 0.3 - fs * 1.05 * (bl.length - 1 - i); ctx.strokeText(l, c.width / 2, y); ctx.fillText(l, c.width / 2, y) })
    return c
  }
  const [preview, setPreview] = useState(null)
  useEffect(() => {
    if (!files[0]) return
    let alive = true
    fileToImage(files[0]).then((img) => { if (alive) setPreview(draw(img).toDataURL('image/jpeg', 0.8)) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, top, bottom, size])
  return (
    <FileTool
      files={files}
      setFiles={setFiles}
      accept={IMG}
      actionLabel="Download meme"
      main={<div className="preview-box">{preview ? <img src={preview} alt="Meme preview" /> : url && <img src={url} alt="" />}</div>}
      options={
        <>
          <h3>Meme generator</h3>
          <Field label="Top text"><input className="input" value={top} onChange={(e) => setTop(e.target.value)} /></Field>
          <Field label="Bottom text"><input className="input" value={bottom} onChange={(e) => setBottom(e.target.value)} /></Field>
          <Slider label="Text size" suffix="%" min={4} max={20} value={size} onChange={setSize} />
        </>
      }
      process={(fs, p) => batchImages(fs, p, { type: 'image/jpeg', quality: 0.92, suffix: '-meme', draw })}
    />
  )
}

