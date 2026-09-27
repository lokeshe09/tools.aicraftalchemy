import { useState } from 'react'
import FileTool from '../components/FileTool'
import { Segmented, Section, Toggle, Slider, NumberInput } from '../components/ui'
import { baseName, formatBytes, pdfBlob } from '../lib/files'
import { loadPdf, getPdfLib } from '../lib/pdfDoc'
import { rasterizePdf } from '../lib/pdf'
import { recompressImages, stripExtras } from '../lib/pdfCompress'

const PDF = 'application/pdf,.pdf'

const PRESETS = {
  extreme: { dpi: 72, quality: 45, label: 'Extreme', desc: 'Smallest file · 72 DPI images' },
  recommended: { dpi: 144, quality: 65, label: 'Recommended', desc: 'Great quality · 144 DPI images' },
  high: { dpi: 220, quality: 82, label: 'High quality', desc: 'Print ready · 220 DPI images' },
  custom: { label: 'Custom', desc: 'Set DPI and quality yourself' },
}

async function smartCompress(file, { dpi, quality, grayscale, strip }, progress) {
  const doc = await loadPdf(file)
  const { PDFName } = await getPdfLib()
  const stats = await recompressImages(doc, { dpi, quality: quality / 100, grayscale, progress })
  if (strip) stripExtras(doc, PDFName)
  progress('Rebuilding document')
  let bytes = await doc.save({ useObjectStreams: true })
  try {
    const { qpdfOptimize } = await import('../lib/qpdf')
    const r = await qpdfOptimize(bytes)
    if (r.bytes.length < bytes.length) bytes = r.bytes
  } catch { /* optional lossless pass */ }
  return { blob: pdfBlob(bytes), stats }
}

/* ---------------- Compress ---------------- */
export function CompressPdf() {
  const [mode, setMode] = useState('smart')
  const [preset, setPreset] = useState('recommended')
  const [dpi, setDpi] = useState(144)
  const [quality, setQuality] = useState(65)
  const [grayscale, setGrayscale] = useState(false)
  const [strip, setStrip] = useState(true)
  const [useTarget, setUseTarget] = useState(false)
  const [target, setTarget] = useState(500)
  const [unit, setUnit] = useState('KB')

  const choose = (p) => {
    setPreset(p)
    if (PRESETS[p].dpi) { setDpi(PRESETS[p].dpi); setQuality(PRESETS[p].quality) }
  }

  return (
    <FileTool
      accept={PDF}
      modifiesPdf
      actionLabel="Compress PDF"
      resultTitle="Your PDF is compressed"
      options={({ files }) => (
        <>
          <h3>Compression</h3>
          {files[0] && <p className="muted small">Current size: <strong>{formatBytes(files[0].size)}</strong></p>}
          <Section title="Method">
            <Segmented full value={mode} onChange={setMode} options={[{ value: 'smart', label: 'Smart' }, { value: 'scan', label: 'Scan mode' }, { value: 'lossless', label: 'Lossless' }]} />
            <p className="muted small">
              {mode === 'smart' && 'Shrinks the images inside your PDF. Text and vector graphics stay sharp and selectable.'}
              {mode === 'scan' && 'Re-renders every page as an optimized image. Best for scanned documents; text will no longer be selectable.'}
              {mode === 'lossless' && 'Only restructures the file (no quality change). Smaller gains, zero quality loss.'}
            </p>
          </Section>
          {mode !== 'lossless' && (
            <>
              <Section title="Target file size">
                <Toggle checked={useTarget} onChange={setUseTarget} label="Compress to a specific size" hint="e.g. under 200 KB for an online form. We find the best quality that fits." />
                {useTarget && (
                  <div className="input-suffix">
                    <NumberInput min={10} max={1e6} value={target} onChange={setTarget} />
                    <select className="input unit" value={unit} onChange={(e) => setUnit(e.target.value)}><option>KB</option><option>MB</option></select>
                  </div>
                )}
              </Section>
              {!useTarget && (
                <Section title="Level">
                  <div className="radio-cards">
                    {Object.entries(PRESETS).map(([k, p]) => (
                      <button key={k} className={`radio-card ${preset === k ? 'active' : ''}`} onClick={() => choose(k)}>
                        <strong>{p.label}</strong><span>{p.desc}</span>
                      </button>
                    ))}
                  </div>
                  {preset === 'custom' && (
                    <>
                      <Slider label="Image resolution" suffix="DPI" min={36} max={600} step={1} value={dpi} onChange={setDpi} />
                      <Slider label="Image quality" suffix="%" min={10} max={100} step={1} value={quality} onChange={setQuality} />
                    </>
                  )}
                </Section>
              )}
              <Section title="Extras">
                <Toggle checked={grayscale} onChange={setGrayscale} label="Convert to grayscale" hint="Removes colour — big savings for colour scans." />
                {mode === 'smart' && <Toggle checked={strip} onChange={setStrip} label="Remove metadata & page thumbnails" />}
              </Section>
            </>
          )}
        </>
      )}
      process={async ([file], progress) => {
        const originalSize = file.size
        const name = `${baseName(file.name)}-compressed.pdf`
        if (mode === 'lossless') {
          const { qpdfOptimize } = await import('../lib/qpdf')
          const doc = await loadPdf(file)
          const { bytes } = await qpdfOptimize(await doc.save({ useObjectStreams: true }))
          const blob = pdfBlob(bytes)
          if (blob.size >= originalSize) return { blob: file, name, originalSize, note: 'This PDF is already optimally structured — no lossless savings possible. Try Smart mode for bigger reductions.' }
          return { blob, name, originalSize }
        }

        const run = (d, q) => (mode === 'scan'
          ? rasterizePdf(file, { dpi: d, quality: q / 100, grayscale, progress }).then((blob) => ({ blob }))
          : smartCompress(file, { dpi: d, quality: q, grayscale, strip }, progress))

        if (useTarget) {
          const limit = target * (unit === 'MB' ? 1024 * 1024 : 1024)
          if (originalSize <= limit && !grayscale) return { blob: file, name, originalSize, note: `The file is already under ${target} ${unit}.` }
          const ladder = [[200, 85], [170, 75], [144, 65], [120, 55], [100, 48], [85, 42], [72, 36], [60, 30], [50, 25], [40, 20]]
          let best = null
          for (let i = 0; i < ladder.length; i++) {
            const [d, q] = ladder[i]
            progress(`Trying ${d} DPI · ${q}% (${i + 1}/${ladder.length})`)
            const r = await run(d, q)
            if (!best || r.blob.size < best.blob.size) best = { ...r, d, q }
            if (r.blob.size <= limit) return { blob: r.blob, name, originalSize, note: `Fits the target: ${formatBytes(r.blob.size)} at ${d} DPI, ${q}% quality.`, noteKind: 'ok' }
          }
          // Smart mode can't shrink text-heavy pages further — fall back to scan mode.
          if (mode === 'smart') {
            for (const [d, q] of [[110, 45], [85, 38], [72, 30], [60, 25]]) {
              progress(`Trying scan mode ${d} DPI`)
              const blob = await rasterizePdf(file, { dpi: d, quality: q / 100, grayscale, progress })
              if (blob.size < best.blob.size) best = { blob, d, q }
              if (blob.size <= limit) return { blob, name, originalSize, note: `Reached the target using scan mode (${d} DPI, ${q}%). Text is no longer selectable.`, noteKind: 'warn' }
            }
          }
          return { blob: best.blob, name, originalSize, note: `Could not reach ${target} ${unit}; this is the smallest possible version (${formatBytes(best.blob.size)}). Try grayscale, or split the document.`, noteKind: 'warn' }
        }

        const r = await run(dpi, quality)
        if (r.blob.size >= originalSize) {
          return { blob: file, name, originalSize, note: 'This PDF is already well optimized — compressing further would make it bigger, so your original is kept. Try a lower level or Scan mode.', noteKind: 'warn' }
        }
        const note = r.stats && r.stats.images && !r.stats.replaced ? 'No images could be reduced further; savings come from restructuring the file.' : ''
        return { blob: r.blob, name, originalSize, note }
      }}
    />
  )
}

/* ---------------- Grayscale ---------------- */
export function GrayscalePdf() {
  const [mode, setMode] = useState('smart')
  const [dpi, setDpi] = useState(150)
  return (
    <FileTool
      accept={PDF}
      modifiesPdf
      actionLabel="Convert to grayscale"
      options={
        <>
          <h3>Grayscale PDF</h3>
          <Segmented full value={mode} onChange={setMode} options={[{ value: 'smart', label: 'Images only' }, { value: 'full', label: 'Entire page' }]} />
          <p className="muted small">
            {mode === 'smart' ? 'Turns every photo/scan to black & white while text stays sharp and selectable. Coloured text and vector drawings keep their colour.' : 'Renders every page in grayscale — removes all colour including text. Text will no longer be selectable.'}
          </p>
          {mode === 'full' && <Slider label="Resolution" suffix="DPI" min={72} max={400} value={dpi} onChange={setDpi} />}
        </>
      }
      process={async ([file], progress) => {
        const name = `${baseName(file.name)}-grayscale.pdf`
        if (mode === 'full') return { blob: await rasterizePdf(file, { dpi, quality: 0.85, grayscale: true, progress }), name }
        const { blob, stats } = await smartCompress(file, { dpi: 600, quality: 90, grayscale: true, strip: false }, progress)
        return { blob, name, note: stats.images ? '' : 'This PDF has no images; use "Entire page" to remove colour from text as well.' }
      }}
    />
  )
}

/* ---------------- Repair ---------------- */
export function RepairPdf() {
  return (
    <FileTool
      accept={PDF}
      actionLabel="Repair PDF"
      options={<><h3>Repair PDF</h3><p className="muted small">Rebuilds the cross-reference table and damaged objects with QPDF. If the structure is beyond repair, pages are recovered by re-rendering them.</p></>}
      process={async ([file], progress) => {
        const name = `${baseName(file.name)}-repaired.pdf`
        const bytes = new Uint8Array(await file.arrayBuffer())
        try {
          progress('Rebuilding structure')
          const { qpdfRepair } = await import('../lib/qpdf')
          const r = await qpdfRepair(bytes)
          const { PDFDocument } = await getPdfLib()
          await PDFDocument.load(r.bytes, { ignoreEncryption: true })
          return { blob: pdfBlob(r.bytes), name, note: r.warnings ? 'The file had problems that were fixed.' : 'No structural damage was found; the file was rebuilt cleanly.', noteKind: 'ok' }
        } catch (e) {
          if (e.code === 'password') throw e
          progress('Recovering pages')
          return { blob: await rasterizePdf(file, { dpi: 170, quality: 0.85, progress }), name, note: 'The structure could not be repaired, so pages were recovered as images.', noteKind: 'warn' }
        }
      }}
    />
  )
}

/* ---------------- Optimize for web ---------------- */
export function LinearizePdf() {
  return (
    <FileTool
      accept={PDF}
      modifiesPdf
      actionLabel="Optimize for web"
      options={<><h3>Fast web view</h3><p className="muted small">Linearizes the PDF so the first page shows instantly in browsers while the rest downloads. Lossless.</p></>}
      process={async ([file]) => {
        const { qpdfOptimize } = await import('../lib/qpdf')
        const doc = await loadPdf(file)
        const { bytes } = await qpdfOptimize(await doc.save(), { linearize: true })
        return { blob: pdfBlob(bytes), name: `${baseName(file.name)}-web.pdf`, originalSize: file.size }
      }}
    />
  )
}

