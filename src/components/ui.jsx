import { useCallback, useRef, useState } from 'react'
import { Upload, X, FileText, Download, RotateCcw, Loader2, AlertCircle, CheckCircle2, ShieldCheck, ArrowUp, ArrowDown } from 'lucide-react'
import { downloadBlob, formatBytes } from '../utils/files'

/* ---------- Drop zone ---------- */
export function DropZone({ accept, multiple = false, onFiles, label = 'Select files', hint, compact = false }) {
  const inputRef = useRef(null)
  const [over, setOver] = useState(false)

  const handle = useCallback(
    (list) => {
      const files = Array.from(list || [])
      if (!files.length) return
      onFiles(multiple ? files : [files[0]])
    },
    [multiple, onFiles]
  )

  return (
    <div
      className={`dropzone ${over ? 'over' : ''} ${compact ? 'compact' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files) }}
    >
      <button type="button" className="btn btn-primary btn-xl" onClick={() => inputRef.current?.click()}>
        <Upload size={22} /> {label}
      </button>
      {!compact && <p className="dz-hint">{hint || `or drop ${multiple ? 'files' : 'a file'} here`}</p>}
      <input
        ref={inputRef}
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        onChange={(e) => { handle(e.target.files); e.target.value = '' }}
      />
      {!compact && (
        <p className="dz-privacy"><ShieldCheck size={15} /> Processed locally in your browser — files are never uploaded.</p>
      )}
    </div>
  )
}

/* ---------- File list ---------- */
export function FileList({ files, setFiles, reorder = false }) {
  const move = (i, d) => {
    const next = [...files]
    const j = i + d
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    setFiles(next)
  }
  return (
    <ul className="file-list">
      {files.map((f, i) => (
        <li key={`${f.name}-${i}`} className="file-item">
          <FileText size={20} className="muted" />
          <div className="file-meta">
            <span className="file-name" title={f.name}>{f.name}</span>
            <span className="file-size">{formatBytes(f.size)}</span>
          </div>
          {reorder && files.length > 1 && (
            <>
              <button className="icon-btn" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={16} /></button>
              <button className="icon-btn" title="Move down" disabled={i === files.length - 1} onClick={() => move(i, 1)}><ArrowDown size={16} /></button>
            </>
          )}
          <button className="icon-btn" title="Remove" onClick={() => setFiles(files.filter((_, k) => k !== i))}><X size={16} /></button>
        </li>
      ))}
    </ul>
  )
}

/* ---------- Task state hook ---------- */
export function useTask() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null) // { blob, name } | { text } | custom
  const [progress, setProgress] = useState('')

  const run = useCallback(async (fn) => {
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const r = await fn(setProgress)
      if (r) setResult(r)
    } catch (e) {
      console.error(e)
      setError(e?.message || String(e))
    } finally {
      setBusy(false)
      setProgress('')
    }
  }, [])

  const reset = useCallback(() => { setResult(null); setError('') }, [])
  return { busy, error, result, progress, run, reset, setResult, setError }
}

/* ---------- Workspace layout: main area + options sidebar ---------- */
export function Workspace({ children, sidebar, action, actionLabel, busy, disabled, progress }) {
  return (
    <div className="workspace">
      <div className="ws-main">{children}</div>
      <aside className="ws-side">
        <div className="ws-options">{sidebar}</div>
        {action && (
          <button className="btn btn-primary btn-block btn-lg" onClick={action} disabled={busy || disabled}>
            {busy ? <><Loader2 size={20} className="spin" /> {progress || 'Processing…'}</> : actionLabel}
          </button>
        )}
      </aside>
    </div>
  )
}

export function ErrorBox({ error }) {
  if (!error) return null
  return <div className="alert alert-error"><AlertCircle size={18} /> {error}</div>
}

/* ---------- Result panel ---------- */
export function ResultPanel({ result, onReset, title = 'Your file is ready!', children }) {
  if (!result) return null
  const items = Array.isArray(result) ? result : [result]
  return (
    <div className="result">
      <CheckCircle2 size={48} className="ok" />
      <h2>{title}</h2>
      {children}
      <div className="result-actions">
        {items.filter((r) => r.blob).map((r) => (
          <button key={r.name} className="btn btn-primary btn-lg" onClick={() => downloadBlob(r.blob, r.name)}>
            <Download size={20} /> Download {items.length > 1 ? r.name : ''}
            <small className="size-tag">{formatBytes(r.blob.size)}</small>
          </button>
        ))}
      </div>
      {onReset && (
        <button className="btn btn-ghost" onClick={onReset}><RotateCcw size={16} /> Start over</button>
      )}
      <p className="muted small">Nothing was uploaded. Closing this tab removes every trace of your files.</p>
    </div>
  )
}

/* ---------- Form fields ---------- */
export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={value === o.value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function CopyButton({ text, label = 'Copy' }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        } catch { /* clipboard blocked */ }
      }}
    >
      {done ? 'Copied!' : label}
    </button>
  )
}
