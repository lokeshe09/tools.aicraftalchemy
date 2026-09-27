import { useState } from 'react'
import { RotateCw, RotateCcw, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import FileTool from '../components/FileTool'
import { Field, Segmented } from '../components/ui'
import { usePdfThumbs, ThumbGrid, ThumbsLoading } from '../components/PdfThumbs'
import { baseName, parseRanges, parseRangeGroups, pdfBlob, zipBlobs } from '../utils/files'

const PDF = 'application/pdf,.pdf'

async function loadPdf(file) {
  const { PDFDocument } = await import('pdf-lib')
  try {
    return await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true })
  } catch {
    throw new Error(`"${file.name}" could not be read. It may be damaged or password protected.`)
  }
}

async function buildFrom(src, indices, rotations = {}) {
  const { PDFDocument, degrees } = await import('pdf-lib')
  const out = await PDFDocument.create()
  const pages = await out.copyPages(src, indices)
  pages.forEach((p, k) => {
    const extra = rotations[indices[k]] || 0
    if (extra) p.setRotation(degrees((p.getRotation().angle + extra) % 360))
    out.addPage(p)
  })
  return out.save()
}

/* ---------------- Merge ---------------- */
export function MergePdf() {
  return (
    <FileTool
      accept={PDF}
      multiple
      reorder
      dropLabel="Select PDF file"
      actionLabel="Merge PDF"
      options={({ files }) => (
        <>
          <h3>Merge PDF</h3>
          <p className="muted">Files are merged in the order shown. Use the arrows to reorder them.</p>
          {files.length < 2 && <p className="warn">Add at least 2 PDF files.</p>}
        </>
      )}
      disabled={false}
      process={async (files, progress) => {
        if (files.length < 2) throw new Error('Please add at least 2 PDF files to merge.')
        const { PDFDocument } = await import('pdf-lib')
        const out = await PDFDocument.create()
        for (let i = 0; i < files.length; i++) {
          progress(`Merging ${i + 1}/${files.length}`)
          const src = await loadPdf(files[i])
          const pages = await out.copyPages(src, src.getPageIndices())
          pages.forEach((p) => out.addPage(p))
        }
        return { blob: pdfBlob(await out.save()), name: 'merged.pdf' }
      }}
    />
  )
}

/* ---------------- Split ---------------- */
export function SplitPdf() {
  const [mode, setMode] = useState('ranges')
  const [ranges, setRanges] = useState('1-2, 3-5')
  const [every, setEvery] = useState(1)
  const [merge, setMerge] = useState(false)

  return (
    <FileTool
      accept={PDF}
      dropLabel="Select PDF file"
      actionLabel="Split PDF"
      options={
        <>
          <h3>Split PDF</h3>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[{ value: 'ranges', label: 'Custom ranges' }, { value: 'every', label: 'Fixed ranges' }, { value: 'all', label: 'Every page' }]}
          />
          {mode === 'ranges' && (
            <>
              <Field label="Ranges" hint="Each comma-separated range becomes its own PDF, e.g. 1-3, 4, 5-9">
                <input className="input" value={ranges} onChange={(e) => setRanges(e.target.value)} />
              </Field>
              <label className="check"><input type="checkbox" checked={merge} onChange={(e) => setMerge(e.target.checked)} /> Merge all ranges into one PDF</label>
            </>
          )}
          {mode === 'every' && (
            <Field label="Split every N pages">
              <input className="input" type="number" min={1} value={every} onChange={(e) => setEvery(Math.max(1, +e.target.value || 1))} />
            </Field>
          )}
          {mode === 'all' && <p className="muted">Every page will be saved as a separate PDF inside a ZIP file.</p>}
        </>
      }
      process={async ([file], progress) => {
        const src = await loadPdf(file)
        const n = src.getPageCount()
        let groups
        if (mode === 'ranges') groups = parseRangeGroups(ranges, n)
        else if (mode === 'every') groups = Array.from({ length: Math.ceil(n / every) }, (_, g) => Array.from({ length: Math.min(every, n - g * every) }, (_, k) => g * every + k + 1))
        else groups = Array.from({ length: n }, (_, i) => [i + 1])
        if (!groups.length) throw new Error('Enter at least one page range.')
        const name = baseName(file.name)
        if (mode === 'ranges' && merge) {
          const bytes = await buildFrom(src, groups.flat().map((p) => p - 1))
          return { blob: pdfBlob(bytes), name: `${name}-split.pdf` }
        }
        const outputs = []
        for (let g = 0; g < groups.length; g++) {
          progress(`Creating ${g + 1}/${groups.length}`)
          const pages = groups[g]
          const bytes = await buildFrom(src, pages.map((p) => p - 1))
          const label = pages.length > 1 ? `${pages[0]}-${pages[pages.length - 1]}` : `${pages[0]}`
          outputs.push({ name: `${name}-pages-${label}.pdf`, blob: pdfBlob(bytes) })
        }
        if (outputs.length === 1) return outputs[0]
        return { blob: await zipBlobs(outputs), name: `${name}-split.zip` }
      }}
    />
  )
}

/* ---------------- Page picker tools (remove / extract) ---------------- */
function PagePickerTool({ mode }) {
  const [files, setFiles] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [text, setText] = useState('')
  const [separate, setSeparate] = useState(false)
  const { thumbs, loading, error } = usePdfThumbs(files[0])
  const isRemove = mode === 'remove'

  const setAndReset = (f) => { setFiles(f); setSelected(new Set()); setText('') }
  const toggle = (i) => {
    const s = new Set(selected)
    s.has(i) ? s.delete(i) : s.add(i)
    setSelected(s)
    setText([...s].sort((a, b) => a - b).map((x) => x + 1).join(', '))
  }
  const applyText = (v) => {
    setText(v)
    try { setSelected(new Set(parseRanges(v, thumbs.length).map((p) => p - 1))) } catch { /* typing */ }
  }

  return (
    <FileTool
      files={files}
      setFiles={setAndReset}
      accept={PDF}
      dropLabel="Select PDF file"
      actionLabel={isRemove ? 'Remove pages' : 'Extract pages'}
      main={
        <>
          <ThumbsLoading loading={loading} error={error} />
          <ThumbGrid thumbs={thumbs} selected={isRemove ? undefined : selected} dimmed={isRemove ? selected : undefined} onToggle={toggle} />
        </>
      }
      options={
        <>
          <h3>{isRemove ? 'Remove pages' : 'Extract pages'}</h3>
          <p className="muted">Click pages to {isRemove ? 'mark them for removal' : 'select them'}, or type page numbers.</p>
          <Field label={isRemove ? 'Pages to remove' : 'Pages to extract'} hint="e.g. 1, 3-5, 9">
            <input className="input" value={text} onChange={(e) => applyText(e.target.value)} placeholder="1, 3-5" />
          </Field>
          {!isRemove && (
            <label className="check"><input type="checkbox" checked={separate} onChange={(e) => setSeparate(e.target.checked)} /> Save each page as a separate PDF</label>
          )}
          <p className="muted small">{selected.size} of {thumbs.length} pages selected</p>
        </>
      }
      process={async ([file]) => {
        const src = await loadPdf(file)
        const n = src.getPageCount()
        const chosen = [...selected].sort((a, b) => a - b)
        if (!chosen.length) throw new Error('Select at least one page.')
        const name = baseName(file.name)
        if (isRemove) {
          const keep = src.getPageIndices().filter((i) => !selected.has(i))
          if (!keep.length) throw new Error('You cannot remove every page.')
          return { blob: pdfBlob(await buildFrom(src, keep)), name: `${name}-edited.pdf` }
        }
        if (separate && chosen.length > 1) {
          const outs = []
          for (const i of chosen) outs.push({ name: `${name}-page-${i + 1}.pdf`, blob: pdfBlob(await buildFrom(src, [i])) })
          return { blob: await zipBlobs(outs), name: `${name}-pages.zip` }
        }
        if (chosen.some((i) => i >= n)) throw new Error('Invalid page selection.')
        return { blob: pdfBlob(await buildFrom(src, chosen)), name: `${name}-extracted.pdf` }
      }}
    />
  )
}

export const RemovePages = () => <PagePickerTool mode="remove" />
export const ExtractPages = () => <PagePickerTool mode="extract" />

/* ---------------- Organize (reorder / rotate / delete) ---------------- */
export function OrganizePdf() {
  const [files, setFiles] = useState([])
  const [order, setOrder] = useState(null)
  const [rot, setRot] = useState({})
  const { thumbs, loading, error } = usePdfThumbs(files[0])
  const current = order || thumbs.map((_, i) => i)

  const setAndReset = (f) => { setFiles(f); setOrder(null); setRot({}) }
  const move = (from, to) => {
    const next = [...current]
    const [x] = next.splice(from, 1)
    next.splice(to, 0, x)
    setOrder(next)
  }

  return (
    <FileTool
      files={files}
      setFiles={setAndReset}
      accept={PDF}
      dropLabel="Select PDF file"
      actionLabel="Organize PDF"
      main={
        <>
          <ThumbsLoading loading={loading} error={error} />
          <ThumbGrid
            thumbs={thumbs}
            order={current}
            rotations={rot}
            draggable
            onDrop={move}
            renderActions={(i, pos) => (
              <>
                <button className="icon-btn" title="Move left" disabled={pos === 0} onClick={() => move(pos, pos - 1)}><ChevronLeft size={14} /></button>
                <button className="icon-btn" title="Rotate" onClick={() => setRot({ ...rot, [i]: ((rot[i] || 0) + 90) % 360 })}><RotateCw size={14} /></button>
                <button className="icon-btn" title="Delete" onClick={() => setOrder(current.filter((_, k) => k !== pos))}><Trash2 size={14} /></button>
                <button className="icon-btn" title="Move right" disabled={pos === current.length - 1} onClick={() => move(pos, pos + 1)}><ChevronRight size={14} /></button>
              </>
            )}
          />
        </>
      }
      options={
        <>
          <h3>Organize PDF</h3>
          <p className="muted">Drag pages to reorder them, or use the buttons under each page to move, rotate and delete.</p>
          <div className="btn-row">
            <button className="btn btn-secondary" onClick={() => setOrder([...current].reverse())}>Reverse order</button>
            <button className="btn btn-secondary" onClick={() => { setOrder(null); setRot({}) }}>Reset</button>
          </div>
          <p className="muted small">{current.length} pages</p>
        </>
      }
      process={async ([file]) => {
        if (!current.length) throw new Error('The document has no pages left.')
        const src = await loadPdf(file)
        return { blob: pdfBlob(await buildFrom(src, current, rot)), name: `${baseName(file.name)}-organized.pdf` }
      }}
    />
  )
}

/* ---------------- Rotate ---------------- */
export function RotatePdf() {
  const [files, setFiles] = useState([])
  const [rot, setRot] = useState({})
  const { thumbs, loading, error } = usePdfThumbs(files[0])
  const setAndReset = (f) => { setFiles(f); setRot({}) }
  const all = (d) => {
    const next = {}
    thumbs.forEach((_, i) => { next[i] = (((rot[i] || 0) + d) % 360 + 360) % 360 })
    setRot(next)
  }

  return (
    <FileTool
      files={files}
      setFiles={setAndReset}
      accept={PDF}
      dropLabel="Select PDF file"
      actionLabel="Rotate PDF"
      main={
        <>
          <ThumbsLoading loading={loading} error={error} />
          <ThumbGrid
            thumbs={thumbs}
            rotations={rot}
            onToggle={(i) => setRot({ ...rot, [i]: ((rot[i] || 0) + 90) % 360 })}
            renderActions={(i) => (
              <button className="icon-btn" title="Rotate" onClick={() => setRot({ ...rot, [i]: ((rot[i] || 0) + 90) % 360 })}><RotateCw size={14} /></button>
            )}
          />
        </>
      }
      options={
        <>
          <h3>Rotate PDF</h3>
          <p className="muted">Click a page to rotate it, or rotate all pages at once.</p>
          <div className="btn-row">
            <button className="btn btn-secondary" onClick={() => all(-90)}><RotateCcw size={16} /> Left</button>
            <button className="btn btn-secondary" onClick={() => all(90)}><RotateCw size={16} /> Right</button>
          </div>
          <button className="btn btn-ghost" onClick={() => setRot({})}>Reset all</button>
        </>
      }
      process={async ([file]) => {
        const src = await loadPdf(file)
        return { blob: pdfBlob(await buildFrom(src, src.getPageIndices(), rot)), name: `${baseName(file.name)}-rotated.pdf` }
      }}
    />
  )
}

export { loadPdf, buildFrom }
