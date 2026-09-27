import { Children, cloneElement, isValidElement, useCallback, useEffect, useId, useRef, useState } from 'react'
import { takeHandoff } from '../lib/handoff'
import { acceptsFile } from '../lib/files'
import {
  UploadCloud, X, Download, RotateCcw, Loader2, AlertCircle, CheckCircle2, ShieldCheck, ArrowUp, ArrowDown,
  Camera, ExternalLink, AlertTriangle, Info, Copy, Check, Lock,
} from 'lucide-react'
import { downloadBlob, formatBytes } from '../lib/files'

/* ---------- Drop zone ---------- */
export function DropZone({ accept, multiple = false, onFiles, label = 'Choose files', hint, compact = false, camera = false, formats }) {
  const inputRef = useRef(null)
  const camRef = useRef(null)
  const [over, setOver] = useState(false)
  const depth = useRef(0)

  const handle = useCallback(
    (list) => {
      const files = Array.from(list || [])
      if (files.length) onFiles(multiple ? files : [files[0]])
    },
    [multiple, onFiles]
  )

  if (compact) {
    return (
      <div className="dz-compact">
        <button type="button" className="btn btn-soft" onClick={() => inputRef.current?.click()}>
          <UploadCloud size={18} /> {label}
        </button>
        <input ref={inputRef} type="file" hidden accept={accept} multiple={multiple} onChange={(e) => { handle(e.target.files); e.target.value = '' }} />
      </div>
    )
  }

  return (
    <div
      className={`dropzone ${over ? 'over' : ''}`}
      onDragEnter={(e) => { e.preventDefault(); depth.current++; setOver(true) }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => { if (--depth.current <= 0) { depth.current = 0; setOver(false) } }}
      onDrop={(e) => { e.preventDefault(); depth.current = 0; setOver(false); handle(e.dataTransfer.files) }}
      onClick={(e) => { if (e.target === e.currentTarget) inputRef.current?.click() }}
    >
      <div className="dz-icon"><UploadCloud size={34} /></div>
      <h3 className="dz-title">{over ? 'Release to add' : `Drop ${multiple ? 'files' : 'your file'} here`}</h3>
      <p className="dz-hint">{hint || 'or'}</p>
      <div className="dz-actions">
        <button type="button" className="btn btn-primary btn-lg" onClick={() => inputRef.current?.click()}>
          {label}
        </button>
        {camera && (
          <button type="button" className="btn btn-soft btn-lg" onClick={() => camRef.current?.click()}>
            <Camera size={18} /> Scan with camera
          </button>
        )}
      </div>
      {formats && <p className="dz-formats">{formats}</p>}
      <input ref={inputRef} type="file" hidden accept={accept} multiple={multiple} onChange={(e) => { handle(e.target.files); e.target.value = '' }} />
      {camera && <input ref={camRef} type="file" hidden accept="image/*" capture="environment" onChange={(e) => { handle(e.target.files); e.target.value = '' }} />}
      <p className="dz-privacy"><ShieldCheck size={15} /> Processed on your device. Files are never uploaded.</p>
    </div>
  )
}

/* ---------- File list ---------- */
export function FileList({ files, setFiles, reorder = false, extra }) {
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
        <li key={`${f.name}-${f.size}-${i}`} className="file-item">
          <span className="file-badge">{(f.name.split('.').pop() || '?').slice(0, 4).toUpperCase()}</span>
          <div className="file-meta">
            <span className="file-name" title={f.name}>{f.name}</span>
            <span className="file-size">{formatBytes(f.size)}</span>
          </div>
          {extra?.(f, i)}
          {reorder && files.length > 1 && (
            <>
              <button className="icon-btn" title="Move up" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={16} /></button>
              <button className="icon-btn" title="Move down" aria-label="Move down" disabled={i === files.length - 1} onClick={() => move(i, 1)}><ArrowDown size={16} /></button>
            </>
          )}
          <button className="icon-btn" title="Remove" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, k) => k !== i))}><X size={16} /></button>
        </li>
      ))}
    </ul>
  )
}

/* ---------- Task state hook ---------- */
export function useTask() {
  const [busy, setBusy] = useState(false)
  const [error, setErrorObj] = useState(null)
  const [result, setResult] = useState(null)
  const [progress, setProgress] = useState('')
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  const run = useCallback(async (fn) => {
    setBusy(true)
    setErrorObj(null)
    setResult(null)
    try {
      const r = await fn((p) => alive.current && setProgress(p))
      if (alive.current && r) setResult(r)
    } catch (e) {
      console.error(e)
      if (alive.current) setErrorObj(e instanceof Error ? e : new Error(String(e)))
    } finally {
      if (alive.current) {
        setBusy(false)
        setProgress('')
      }
    }
  }, [])

  const reset = useCallback(() => { setResult(null); setErrorObj(null) }, [])
  const setError = useCallback((m) => setErrorObj(m ? new Error(m) : null), [])
  return { busy, error: error?.message || '', errorObj: error, result, progress, run, reset, setResult, setError }
}

/* ---------- Layout ---------- */
export function Workspace({ children, sidebar, action, actionLabel, busy, disabled, progress, actionHint }) {
  return (
    <div className="workspace">
      <div className="ws-main">{children}</div>
      <aside className="ws-side">
        <div className="ws-options">{sidebar}</div>
        {action && (
          <div className="ws-action">
            {actionHint && <p className="action-hint">{actionHint}</p>}
            <button className="btn btn-primary btn-block btn-lg" onClick={action} disabled={busy || disabled}>
              {busy ? <><Loader2 size={20} className="spin" /> {progress || 'Working…'}</> : actionLabel}
            </button>
          </div>
        )}
      </aside>
    </div>
  )
}

export function Steps({ step }) {
  const labels = ['Upload', 'Customize', 'Download']
  return (
    <ol className="steps" aria-label="Progress">
      {labels.map((l, i) => (
        <li key={l} className={i < step ? 'done' : i === step ? 'current' : ''}>
          <span className="step-dot">{i < step ? <Check size={13} /> : i + 1}</span>
          <span className="step-label">{l}</span>
        </li>
      ))}
    </ol>
  )
}

export function Alert({ kind = 'info', children, onClose }) {
  if (!children) return null
  const Icon = kind === 'error' ? AlertCircle : kind === 'warn' ? AlertTriangle : kind === 'ok' ? CheckCircle2 : Info
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon size={18} className="alert-icon" />
      <div className="alert-body">{children}</div>
      {onClose && <button className="icon-btn" aria-label="Dismiss" onClick={onClose}><X size={16} /></button>}
    </div>
  )
}

export const ErrorBox = ({ error, onClose }) => (error ? <Alert kind="error" onClose={onClose}>{error}</Alert> : null)

export function PasswordPrompt({ fileName, wrong, onSubmit, onCancel }) {
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  return (
    <form className="pw-prompt" onSubmit={(e) => { e.preventDefault(); if (pw) onSubmit(pw) }}>
      <div className="pw-prompt-head"><Lock size={18} /> <strong>{fileName}</strong> is password protected</div>
      <p className="muted small">{wrong ? 'That password was not correct — please try again.' : 'Enter the password used to open this PDF. It stays in this tab only.'}</p>
      <div className="pw-row">
        <input className="input" type={show ? 'text' : 'password'} autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" autoComplete="off" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
      </div>
      <div className="btn-row">
        <button type="submit" className="btn btn-primary" disabled={!pw}>Unlock &amp; continue</button>
        {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  )
}

/* ---------- Result panel ---------- */
export function ResultPanel({ result, onReset, onBack, title, children, continueWith }) {
  if (!result) return null
  const items = Array.isArray(result) ? result : [result]
  const main = items[0]
  const previewable = main?.blob && items.length === 1 && /^(application\/pdf|image\/)/.test(main.blob.type)
  const open = () => {
    const url = URL.createObjectURL(main.blob)
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 120000)
  }
  const original = main?.originalSize
  return (
    <div className="result">
      <div className="result-badge"><CheckCircle2 size={40} /></div>
      <h2>{title || (main?.count ? `${main.count} files are ready` : 'Your file is ready')}</h2>
      {original > 0 && main.blob && (
        <p className="size-compare">
          <span>{formatBytes(original)}</span> → <strong>{formatBytes(main.blob.size)}</strong>
          {main.blob.size < original ? <span className="badge badge-ok">−{Math.max(1, Math.round((1 - main.blob.size / original) * 100))}% smaller</span> : null}
        </p>
      )}
      {main?.note && <Alert kind={main.noteKind || 'info'}>{main.note}</Alert>}
      {children}
      <div className="result-actions">
        {items.filter((r) => r.blob).map((r) => (
          <button key={r.name} className="btn btn-primary btn-lg" onClick={() => downloadBlob(r.blob, r.name)}>
            <Download size={20} /> Download{items.length > 1 ? ` ${r.name}` : ''}
            <small className="size-tag">{formatBytes(r.blob.size)}</small>
          </button>
        ))}
        {previewable && <button className="btn btn-soft btn-lg" onClick={open}><ExternalLink size={18} /> Open</button>}
      </div>
      {main?.blob && <p className="result-name" title={main.name}>{main.name}</p>}
      {continueWith}
      <div className="btn-row center-row">
        {onBack && <button className="btn btn-ghost" onClick={onBack}><RotateCcw size={16} /> Change settings</button>}
        {onReset && <button className="btn btn-ghost" onClick={onReset}><X size={16} /> Start over</button>}
      </div>
      <p className="muted small">Nothing was uploaded. Closing this tab removes every trace of your files.</p>
    </div>
  )
}

/* ---------- Form fields ---------- */
// Only a single native control (or NumberInput) gets a real <label>; groups of buttons get a plain caption,
// so clicking the caption never "clicks" the first button of the group.
export function Field({ label, children, hint, inline }) {
  const id = useId()
  const only = Children.count(children) === 1 && isValidElement(children) && (['input', 'select', 'textarea'].includes(children.type) || children.type === NumberInput)
  return (
    <div className={`field ${inline ? 'field-inline' : ''}`} role={only ? undefined : 'group'} aria-label={only || typeof label !== 'string' ? undefined : label}>
      {label && (only ? <label className="field-label" htmlFor={children.props.id || id}>{label}</label> : <span className="field-label">{label}</span>)}
      {only ? cloneElement(children, { id: children.props.id || id }) : children}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  )
}

/** Accept files passed from the home page / another tool (for tools that don't use FileTool). */
export function useHandoff(accept, setFiles) {
  useEffect(() => {
    const incoming = takeHandoff((f) => acceptsFile(accept, f))
    if (incoming.length) setFiles(incoming.slice(0, 1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

export function Section({ title, children, aside }) {
  return (
    <section className="opt-section">
      {(title || aside) && <div className="opt-head"><h4>{title}</h4>{aside}</div>}
      {children}
    </section>
  )
}

export function Segmented({ value, onChange, options, full }) {
  return (
    <div className={`segmented ${full ? 'full' : ''}`} role="radiogroup">
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)} title={o.title}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track"><span className="toggle-thumb" /></span>
      <span className="toggle-text">{label}{hint && <small>{hint}</small>}</span>
    </label>
  )
}

export function Slider({ label, value, onChange, min, max, step = 1, format = (v) => v, suffix = '' }) {
  return (
    <div className="field slider">
      <div className="slider-head">
        <span className="field-label">{label}</span>
        <input className="slider-num" type="number" value={value} min={min} max={max} step={step} onChange={(e) => { const v = +e.target.value; if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v))) }} />
        {suffix && <span className="muted small">{suffix}</span>}
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} aria-label={label} />
      <span className="sr-only">{format(value)}</span>
    </div>
  )
}

export function NumberInput({ value, onChange, min, max, step = 1, ...rest }) {
  const [text, setText] = useState(String(value))
  useEffect(() => { setText(String(value)) }, [value])
  return (
    <input
      className="input"
      type="number"
      inputMode="decimal"
      value={text}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        setText(e.target.value)
        const v = parseFloat(e.target.value)
        if (!isNaN(v) && (min == null || v >= min) && (max == null || v <= max)) onChange(v)
      }}
      onBlur={() => {
        let v = parseFloat(text)
        if (isNaN(v)) v = value
        if (min != null) v = Math.max(min, v)
        if (max != null) v = Math.min(max, v)
        setText(String(v))
        onChange(v)
      }}
      {...rest}
    />
  )
}

export function CopyButton({ text, label = 'Copy', small }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className={`btn btn-soft ${small ? 'btn-sm' : ''}`}
      disabled={!text}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
        } catch {
          const ta = document.createElement('textarea')
          ta.value = text
          document.body.appendChild(ta)
          ta.select()
          document.execCommand('copy')
          ta.remove()
        }
        setDone(true)
        setTimeout(() => setDone(false), 1400)
      }}
    >
      {done ? <><Check size={15} /> Copied</> : <><Copy size={15} /> {label}</>}
    </button>
  )
}

export function Spinner({ label }) {
  return <div className="loading-row"><Loader2 className="spin" size={20} /> {label}</div>
}
