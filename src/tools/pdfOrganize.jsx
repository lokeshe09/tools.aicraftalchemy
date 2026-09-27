import { useEffect, useMemo, useState } from 'react'
import { RotateCw, RotateCcw, Trash2, ChevronLeft, ChevronRight, CopyPlus, FilePlus2, ArrowDownAZ, FlipVertical2, Wand2 } from 'lucide-react'
import FileTool from '../components/FileTool'
import { Field, Segmented, Section, Toggle, NumberInput, FileList, Spinner, Alert } from '../components/ui'
import { usePdfThumbs, ThumbGrid, ThumbsStatus } from '../components/PdfThumbs'
import { baseName, parseRanges, parseRangeGroups, pdfBlob, zipBlobs, oneOrZip, loadImage } from '../lib/files'
import { loadPdf, getPdfLib, saveBlob } from '../lib/pdfDoc'
import { openPdfjs, renderPage } from '../lib/pdf'

const PDF = 'application/pdf,.pdf'
const A4 = [595.28, 841.89]

/** Copy `indices` (0-based) of `src` into a new document, applying extra rotation per index. */
export async function buildFrom(src, indices, rotations = {}) {
  const { PDFDocument, degrees } = await getPdfLib()
  const out = await PDFDocument.create()
  const pages = await out.copyPages(src, indices)
  pages.forEach((p, k) => {
    const extra = rotations[indices[k]] || 0
    if (extra) p.setRotation(degrees((p.getRotation().angle + extra + 360) % 360))
    out.addPage(p)
  })
  return out
}

async function pageCountOf(file) {
  const doc = await openPdfjs(file)
  const n = doc.numPages
  doc.destroy()
  return n
}

/** Is a rendered thumbnail (data URL) essentially empty? */
export async function isBlankThumb(src, threshold = 0.004) {
  const img = await loadImage(src)
  const c = document.createElement('canvas')
  c.width = img.width
  c.height = img.height
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const d = ctx.getImageData(0, 0, c.width, c.height).data
  let ink = 0
  // Ignore a 3% border (scanner edges / shadows).
  const mx = Math.floor(c.width * 0.03)
  const my = Math.floor(c.height * 0.03)
  let total = 0
  for (let y = my; y < c.height - my; y++) {
    for (let x = mx; x < c.width - mx; x++) {
      const i = (y * c.width + x) * 4
      total++
      if (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114 < 200) ink++
    }
  }
  return ink / Math.max(1, total) < threshold
}

/* ---------------- Merge ---------------- */
export function MergePdf() {
  const [ranges, setRanges] = useState({})
  const [counts, setCounts] = useState({})
  const [interleave, setInterleave] = useState(false)
  const [oddStart, setOddStart] = useState(false)
  const [name, setName] = useState('merged')

  const keyOf = (f) => `${f.name}|${f.size}|${f.lastModified}`

  return (
    <FileTool
      accept={PDF}
      multiple
      minFiles={2}
      modifiesPdf
      dropLabel="Choose PDF files"
      actionLabel="Merge PDF"
      main={({ files, setFiles }) => (
        <>
          <div className="list-toolbar">
            <span className="muted small">{files.length} files · drag order with the arrows</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setFiles([...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })))}><ArrowDownAZ size={15} /> Sort A→Z</button>
          </div>
          <FileList
            files={files}
            setFiles={setFiles}
            reorder
            extra={(f) => (
              <input
                className="input range-input"
                placeholder={counts[keyOf(f)] ? `All ${counts[keyOf(f)]} pages` : 'All pages'}
                title="Pages to include, e.g. 1-3, 5"
                value={ranges[keyOf(f)] || ''}
                onFocus={() => { if (!counts[keyOf(f)]) pageCountOf(f).then((n) => setCounts((c) => ({ ...c, [keyOf(f)]: n }))).catch(() => {}) }}
                onChange={(e) => setRanges({ ...ranges, [keyOf(f)]: e.target.value })}
              />
            )}
          />
        </>
      )}
      options={({ files }) => (
        <>
          <h3>Merge options</h3>
          {files.length < 2 && <Alert kind="warn">Add at least one more PDF.</Alert>}
          <Section title="Page selection">
            <p className="muted small">Type page ranges next to any file to include only those pages (e.g. <code>1-3, 7</code>). Leave empty for all pages.</p>
          </Section>
          <Section title="Mode">
            <Toggle checked={interleave} onChange={setInterleave} label="Alternate & mix pages" hint="Takes one page from each file in turn — perfect for joining front/back scans." />
            <Toggle checked={oddStart} onChange={setOddStart} label="Start each file on a new sheet" hint="Adds a blank page where needed so every file begins on an odd page (duplex printing)." />
          </Section>
          <Field label="Output file name">
            <div className="input-suffix"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /><span>.pdf</span></div>
          </Field>
        </>
      )}
      process={async (files, progress) => {
        const { PDFDocument } = await getPdfLib()
        const out = await PDFDocument.create()
        const lists = []
        const srcs = []
        for (let i = 0; i < files.length; i++) {
          progress(`Reading ${i + 1} of ${files.length}`)
          const src = await loadPdf(files[i])
          const n = src.getPageCount()
          const r = (ranges[keyOf(files[i])] || '').trim()
          let idx
          try { idx = r ? parseRanges(r, n).map((p) => p - 1) : src.getPageIndices() } catch (e) { throw new Error(`${files[i].name}: ${e.message}`) }
          srcs.push(src)
          lists.push(await out.copyPages(src, idx))
        }
        progress('Merging')
        if (interleave) {
          const max = Math.max(...lists.map((l) => l.length))
          for (let k = 0; k < max; k++) for (const l of lists) if (l[k]) out.addPage(l[k])
        } else {
          for (const l of lists) {
            if (oddStart && out.getPageCount() % 2 === 1) {
              const prev = out.getPage(out.getPageCount() - 1).getSize()
              out.addPage([prev.width, prev.height])
            }
            l.forEach((p) => out.addPage(p))
          }
        }
        out.setTitle(name)
        return { blob: await saveBlob(out), name: `${(name || 'merged').replace(/[\\/:*?"<>|]/g, '_')}.pdf` }
      }}
    />
  )
}

/* ---------------- Split ---------------- */
export function SplitPdf() {
  const [files, setFiles] = useState([])
  const [mode, setMode] = useState('ranges')
  const [ranges, setRanges] = useState('')
  const [every, setEvery] = useState(2)
  const [maxMb, setMaxMb] = useState(5)
  const [merge, setMerge] = useState(false)
  const [count, setCount] = useState(0)

  useEffect(() => {
    setCount(0)
    if (files[0]) pageCountOf(files[0]).then(setCount).catch(() => {})
  }, [files])

  const preview = useMemo(() => {
    if (!count) return ''
    try {
      if (mode === 'ranges') return ranges.trim() ? `${parseRangeGroups(ranges, count).length} PDF file(s)` : ''
      if (mode === 'every') return `${Math.ceil(count / every)} PDF file(s)`
      if (mode === 'all') return `${count} PDF files`
      if (mode === 'odd-even') return '2 PDF files (odd pages, even pages)'
    } catch (e) { return e.message }
    return ''
  }, [mode, ranges, every, count])

  return (
    <FileTool
      files={files}
      setFiles={setFiles}
      accept={PDF}
      actionLabel="Split PDF"
      options={
        <>
          <h3>Split options</h3>
          {count > 0 && <p className="muted small">This document has <strong>{count}</strong> pages.</p>}
          <Segmented full value={mode} onChange={setMode} options={[{ value: 'ranges', label: 'Ranges' }, { value: 'every', label: 'Every N' }, { value: 'all', label: 'All pages' }, { value: 'size', label: 'By size' }, { value: 'odd-even', label: 'Odd/Even' }]} />
          {mode === 'ranges' && (
            <>
              <Field label="Page ranges" hint="Each comma-separated range becomes one PDF, e.g. 1-3, 4-8, 9-end">
                <input className="input" value={ranges} placeholder={count ? `1-${Math.ceil(count / 2)}, ${Math.ceil(count / 2) + 1}-end` : '1-3, 4-end'} onChange={(e) => setRanges(e.target.value)} />
              </Field>
              <Toggle checked={merge} onChange={setMerge} label="Merge all ranges into one PDF" />
            </>
          )}
          {mode === 'every' && <Field label="Pages per file"><NumberInput min={1} max={10000} value={every} onChange={(v) => setEvery(Math.round(v))} /></Field>}
          {mode === 'size' && <Field label="Maximum size per file (MB)" hint="Pages are grouped so that each file stays under this size."><NumberInput min={0.1} max={2000} step={0.5} value={maxMb} onChange={setMaxMb} /></Field>}
          {mode === 'all' && <p className="muted small">Every page is saved as its own PDF.</p>}
          {preview && <p className="preview-note">Result: {preview}</p>}
        </>
      }
      process={async ([file], progress) => {
        const src = await loadPdf(file)
        const n = src.getPageCount()
        const name = baseName(file.name)
        const save = async (idx) => pdfBlob(await (await buildFrom(src, idx)).save({ useObjectStreams: true }))
        let groups
        if (mode === 'ranges') {
          if (!ranges.trim()) throw new Error('Enter at least one page range, for example 1-3.')
          groups = parseRangeGroups(ranges, n)
        } else if (mode === 'every') groups = Array.from({ length: Math.ceil(n / every) }, (_, g) => Array.from({ length: Math.min(every, n - g * every) }, (_, k) => g * every + k + 1))
        else if (mode === 'all') groups = Array.from({ length: n }, (_, i) => [i + 1])
        else if (mode === 'odd-even') groups = [Array.from({ length: Math.ceil(n / 2) }, (_, i) => i * 2 + 1), Array.from({ length: Math.floor(n / 2) }, (_, i) => i * 2 + 2)].filter((g) => g.length)
        else {
          // By size: grow each group while it stays under the limit.
          const limit = maxMb * 1024 * 1024
          const outs = []
          let cur = []
          let curBlob = null
          for (let p = 0; p < n; p++) {
            progress(`Sizing page ${p + 1} of ${n}`)
            const trial = [...cur, p]
            const blob = await save(trial)
            if (blob.size > limit && cur.length) {
              outs.push({ pages: cur, blob: curBlob })
              cur = [p]
              curBlob = await save(cur)
            } else {
              cur = trial
              curBlob = blob
            }
          }
          if (cur.length) outs.push({ pages: cur, blob: curBlob })
          const files2 = outs.map((o, i) => ({ name: `${name}-part-${i + 1}.pdf`, blob: o.blob }))
          const over = outs.filter((o) => o.blob.size > limit).length
          const r = await oneOrZip(files2, `${name}-split.zip`)
          if (over) r.note = `${over} single page(s) are larger than ${maxMb} MB on their own and could not be split further. Try Compress PDF first.`
          return r
        }
        if (mode === 'ranges' && merge) return { blob: await save(groups.flat().map((p) => p - 1)), name: `${name}-selected.pdf` }
        const outputs = []
        for (let g = 0; g < groups.length; g++) {
          progress(`Creating file ${g + 1} of ${groups.length}`)
          const pages = groups[g]
          const label = mode === 'odd-even' ? (g === 0 ? 'odd' : 'even') : pages.length > 1 ? `pages-${pages[0]}-${pages[pages.length - 1]}` : `page-${pages[0]}`
          outputs.push({ name: `${name}-${label}.pdf`, blob: await save(pages.map((p) => p - 1)) })
        }
        return oneOrZip(outputs, `${name}-split.zip`)
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
  const [detecting, setDetecting] = useState(false)
  const [note, setNote] = useState('')
  const thumbs = usePdfThumbs(files[0])
  const isRemove = mode === 'remove'
  const count = thumbs.count

  const setAndReset = (f) => { setFiles(f); setSelected(new Set()); setText(''); setNote('') }
  const apply = (set) => {
    setSelected(set)
    setText(compress([...set].sort((a, b) => a - b).map((x) => x + 1)))
  }
  const toggle = (i) => {
    const s = new Set(selected)
    s.has(i) ? s.delete(i) : s.add(i)
    apply(s)
  }
  const applyText = (v) => {
    setText(v)
    try { setSelected(new Set(parseRanges(v, count).map((p) => p - 1))) } catch { /* still typing */ }
  }
  const pick = (fn) => apply(new Set(Array.from({ length: count }, (_, i) => i).filter(fn)))

  const detectBlank = async () => {
    setDetecting(true)
    const found = new Set()
    for (let i = 0; i < count; i++) if (thumbs.thumbs[i] && (await isBlankThumb(thumbs.thumbs[i]))) found.add(i)
    setDetecting(false)
    setNote(found.size ? `Found ${found.size} blank page${found.size > 1 ? 's' : ''}.` : 'No blank pages found.')
    if (found.size) apply(found)
  }

  return (
    <FileTool
      files={files}
      setFiles={setAndReset}
      accept={PDF}
      modifiesPdf
      actionLabel={isRemove ? `Remove ${selected.size || ''} page${selected.size === 1 ? '' : 's'}` : `Extract ${selected.size || ''} page${selected.size === 1 ? '' : 's'}`}
      disabled={!selected.size}
      main={
        <>
          <ThumbsStatus state={thumbs} file={files[0]} />
          <ThumbGrid thumbs={thumbs.thumbs} count={count} sizes={thumbs.sizes} selected={isRemove ? undefined : selected} dimmed={isRemove ? selected : undefined} onToggle={toggle} />
        </>
      }
      options={
        <>
          <h3>{isRemove ? 'Remove pages' : 'Extract pages'}</h3>
          <p className="muted small">Click pages to {isRemove ? 'mark them for removal' : 'select them'}, or type page numbers.</p>
          <Field label={isRemove ? 'Pages to remove' : 'Pages to extract'} hint="e.g. 1, 3-5, 9-end">
            <input className="input" value={text} onChange={(e) => applyText(e.target.value)} placeholder="1, 3-5" />
          </Field>
          <div className="chip-row">
            <button className="chip" onClick={() => pick((i) => i % 2 === 0)}>Odd</button>
            <button className="chip" onClick={() => pick((i) => i % 2 === 1)}>Even</button>
            <button className="chip" onClick={() => pick(() => true)}>All</button>
            <button className="chip" onClick={() => apply(new Set())}>None</button>
            <button className="chip" onClick={() => pick((i) => !selected.has(i))}>Invert</button>
          </div>
          <button className="btn btn-soft btn-block" onClick={detectBlank} disabled={detecting || thumbs.loading || !count}>
            <Wand2 size={16} /> {detecting ? 'Scanning…' : 'Auto-select blank pages'}
          </button>
          {note && <p className="muted small">{note}</p>}
          {!isRemove && <Toggle checked={separate} onChange={setSeparate} label="Save each page as a separate PDF" />}
          <p className="muted small">{selected.size} of {count} pages selected</p>
        </>
      }
      process={async ([file]) => {
        const src = await loadPdf(file)
        const chosen = [...selected].sort((a, b) => a - b)
        if (!chosen.length) throw new Error('Select at least one page.')
        const name = baseName(file.name)
        if (isRemove) {
          const keep = src.getPageIndices().filter((i) => !selected.has(i))
          if (!keep.length) throw new Error('You cannot remove every page.')
          return { blob: await saveBlob(await buildFrom(src, keep)), name: `${name}-edited.pdf` }
        }
        if (separate && chosen.length > 1) {
          const outs = []
          for (const i of chosen) outs.push({ name: `${name}-page-${i + 1}.pdf`, blob: await saveBlob(await buildFrom(src, [i])) })
          return { blob: await zipBlobs(outs), name: `${name}-pages.zip`, count: outs.length }
        }
        return { blob: await saveBlob(await buildFrom(src, chosen)), name: `${name}-extracted.pdf` }
      }}
    />
  )
}

/** [1,2,3,5,7,8] -> "1-3, 5, 7-8" */
function compress(nums) {
  const out = []
  for (let i = 0; i < nums.length; i++) {
    let j = i
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++
    out.push(j > i ? `${nums[i]}-${nums[j]}` : `${nums[i]}`)
    i = j
  }
  return out.join(', ')
}

export const RemovePages = () => <PagePickerTool mode="remove" />
export const ExtractPages = () => <PagePickerTool mode="extract" />

/* ---------------- Organize (multi-file: reorder / rotate / delete / insert) ---------------- */
let uidN = 0
const nid = () => `p${++uidN}`

async function thumbsOf(file, onPage) {
  const doc = await openPdfjs(file)
  for (let i = 1; i <= doc.numPages; i++) {
    const vp = (await doc.getPage(i)).getViewport({ scale: 1 })
    const { canvas } = await renderPage(doc, i, 150 / vp.width)
    onPage(i - 1, canvas.toDataURL('image/jpeg', 0.7), { width: vp.width, height: vp.height }, doc.numPages)
    canvas.width = canvas.height = 0
  }
  doc.destroy()
}

export function OrganizePdf() {
  const [files, setFiles] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Load thumbnails for any file not yet represented.
  useEffect(() => {
    let alive = true
    const known = new Set(items.filter((it) => !it.blank).map((it) => it.src))
    const todo = files.filter((f) => !known.has(f))
    if (!todo.length) return
    setLoading(true)
    ;(async () => {
      for (const f of todo) {
        const fileIdx = files.indexOf(f)
        await thumbsOf(f, (page, thumb, size) => {
          if (!alive) return
          setItems((cur) => [...cur, { id: nid(), src: f, fileIdx, page, rot: 0, thumb, size, key: `${fileIdx}-${page}` }])
        })
      }
    })().catch((e) => alive && setError(e.message)).finally(() => alive && setLoading(false))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files])

  const setFilesAndItems = (f) => {
    setFiles(f)
    setItems((cur) => cur.filter((it) => it.blank || f.includes(it.src)))
    setError('')
  }
  const move = (from, to) => setItems((cur) => { const n = [...cur]; const [x] = n.splice(from, 1); n.splice(to, 0, x); return n })
  const patch = (pos, p) => setItems((cur) => cur.map((it, k) => (k === pos ? { ...it, ...p } : it)))
  const multi = files.length > 1
  const letter = (i) => String.fromCharCode(65 + (i % 26))

  return (
    <FileTool
      files={files}
      setFiles={setFilesAndItems}
      accept={PDF}
      multiple
      modifiesPdf
      actionLabel="Save organized PDF"
      disabled={!items.length || loading}
      main={({ files: fs }) => (
        <>
          {error && <Alert kind="error">{error}</Alert>}
          {loading && <Spinner label="Loading pages…" />}
          <ThumbGrid
            order={items}
            draggable
            onDrop={move}
            labels={(it) => (it.blank ? 'Blank' : multi ? `${letter(it.fileIdx)}${it.page + 1}` : it.page + 1)}
            renderActions={(it, pos) => (
              <>
                <button className="icon-btn" title="Move left" disabled={pos === 0} onClick={() => move(pos, pos - 1)}><ChevronLeft size={14} /></button>
                <button className="icon-btn" title="Rotate" onClick={() => patch(pos, { rot: ((it.rot || 0) + 90) % 360 })}><RotateCw size={14} /></button>
                <button className="icon-btn" title="Duplicate" onClick={() => setItems((cur) => { const n = [...cur]; n.splice(pos + 1, 0, { ...it, id: nid() }); return n })}><CopyPlus size={14} /></button>
                <button className="icon-btn" title="Insert blank page after" onClick={() => setItems((cur) => { const n = [...cur]; n.splice(pos + 1, 0, { id: nid(), blank: true, size: it.size, key: nid(), rot: 0 }); return n })}><FilePlus2 size={14} /></button>
                <button className="icon-btn danger" title="Delete" onClick={() => setItems((cur) => cur.filter((_, k) => k !== pos))}><Trash2 size={14} /></button>
                <button className="icon-btn" title="Move right" disabled={pos === items.length - 1} onClick={() => move(pos, pos + 1)}><ChevronRight size={14} /></button>
              </>
            )}
          />
          {multi && <p className="muted small">Pages are labelled by file: {fs.map((f, i) => `${letter(i)} = ${f.name}`).join(' · ')}</p>}
        </>
      )}
      options={
        <>
          <h3>Organize PDF</h3>
          <p className="muted small">Drag pages to reorder. Use the buttons under each page to move, rotate, duplicate, insert a blank page or delete. Add more PDFs to combine them.</p>
          <div className="btn-grid">
            <button className="btn btn-soft" onClick={() => setItems((c) => [...c].reverse())}><FlipVertical2 size={16} /> Reverse</button>
            <button className="btn btn-soft" onClick={() => setItems((c) => c.map((it) => ({ ...it, rot: ((it.rot || 0) + 90) % 360 })))}><RotateCw size={16} /> Rotate all</button>
            <button className="btn btn-soft" onClick={() => setItems((c) => [...c, { id: nid(), blank: true, size: c[c.length - 1]?.size || { width: A4[0], height: A4[1] }, key: nid(), rot: 0 }])}><FilePlus2 size={16} /> Blank page</button>
            <button className="btn btn-soft" onClick={() => setItems((c) => [...c].sort((a, b) => (a.blank ? 1 : 0) - (b.blank ? 1 : 0) || a.fileIdx - b.fileIdx || a.page - b.page))}><ArrowDownAZ size={16} /> Original order</button>
          </div>
          <p className="muted small">{items.length} pages in result</p>
        </>
      }
      process={async () => {
        if (!items.length) throw new Error('There are no pages left.')
        const { PDFDocument, degrees } = await getPdfLib()
        const out = await PDFDocument.create()
        const loaded = new Map()
        for (const it of items) {
          if (it.blank) {
            const pg = out.addPage([it.size?.width || A4[0], it.size?.height || A4[1]])
            if (it.rot) pg.setRotation(degrees(it.rot))
            continue
          }
          if (!loaded.has(it.src)) loaded.set(it.src, await loadPdf(it.src))
          const [p] = await out.copyPages(loaded.get(it.src), [it.page])
          if (it.rot) p.setRotation(degrees((p.getRotation().angle + it.rot) % 360))
          out.addPage(p)
        }
        return { blob: await saveBlob(out), name: `${baseName(files[0].name)}-organized.pdf` }
      }}
    />
  )
}

/* ---------------- Rotate ---------------- */
export function RotatePdf() {
  const [files, setFiles] = useState([])
  const [rot, setRot] = useState({})
  const thumbs = usePdfThumbs(files[0])
  const n = thumbs.count
  const setAndReset = (f) => { setFiles(f); setRot({}) }
  const turn = (filter, d) => {
    const next = { ...rot }
    for (let i = 0; i < n; i++) if (filter(i)) next[i] = (((next[i] || 0) + d) % 360 + 360) % 360
    setRot(next)
  }
  const changed = Object.values(rot).filter(Boolean).length

  return (
    <FileTool
      files={files}
      setFiles={setAndReset}
      accept={PDF}
      modifiesPdf
      actionLabel="Rotate PDF"
      disabled={!changed}
      main={
        <>
          <ThumbsStatus state={thumbs} file={files[0]} />
          <ThumbGrid
            thumbs={thumbs.thumbs}
            count={n}
            sizes={thumbs.sizes}
            rotations={rot}
            onToggle={(i) => setRot({ ...rot, [i]: ((rot[i] || 0) + 90) % 360 })}
            renderActions={(i) => (
              <>
                <button className="icon-btn" title="Rotate left" onClick={() => setRot({ ...rot, [i]: ((rot[i] || 0) + 270) % 360 })}><RotateCcw size={14} /></button>
                <button className="icon-btn" title="Rotate right" onClick={() => setRot({ ...rot, [i]: ((rot[i] || 0) + 90) % 360 })}><RotateCw size={14} /></button>
              </>
            )}
          />
        </>
      }
      options={
        <>
          <h3>Rotate PDF</h3>
          <p className="muted small">Click a page to rotate it 90°, or rotate groups of pages at once.</p>
          <Section title="All pages">
            <div className="btn-row">
              <button className="btn btn-soft" onClick={() => turn(() => true, -90)}><RotateCcw size={16} /> Left</button>
              <button className="btn btn-soft" onClick={() => turn(() => true, 90)}><RotateCw size={16} /> Right</button>
            </div>
          </Section>
          <Section title="Only some pages">
            <div className="chip-row">
              <button className="chip" onClick={() => turn((i) => i % 2 === 0, 90)}>Odd pages ↻</button>
              <button className="chip" onClick={() => turn((i) => i % 2 === 1, 90)}>Even pages ↻</button>
              <button className="chip" onClick={() => turn((i) => thumbs.sizes[i] && thumbs.sizes[i].width > thumbs.sizes[i].height, 90)}>Landscape ↻</button>
              <button className="chip" onClick={() => turn((i) => thumbs.sizes[i] && thumbs.sizes[i].width <= thumbs.sizes[i].height, 90)}>Portrait ↻</button>
            </div>
          </Section>
          <button className="btn btn-ghost" onClick={() => setRot({})} disabled={!changed}>Reset</button>
          <p className="muted small">{changed} page{changed === 1 ? '' : 's'} will be rotated</p>
        </>
      }
      process={async ([file]) => {
        const src = await loadPdf(file)
        const { degrees } = await getPdfLib()
        src.getPages().forEach((p, i) => { if (rot[i]) p.setRotation(degrees((p.getRotation().angle + rot[i]) % 360)) })
        return { blob: await saveBlob(src), name: `${baseName(file.name)}-rotated.pdf` }
      }}
    />
  )
}

