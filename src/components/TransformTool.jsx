import { useMemo, useRef } from 'react'
import { Download, FileUp, ArrowLeftRight, Eraser } from 'lucide-react'
import { CopyButton } from './ui'
import { downloadBlob } from '../lib/files'

/**
 * Live two-pane text transformer: input on the left, output on the right.
 * `transform(input)` must be synchronous and may throw to show an error.
 */
export default function TransformTool({
  input, setInput, transform, options, inputLabel = 'Input', outputLabel = 'Output',
  accept, downloadName, downloadType = 'text/plain', placeholder, onSwap, mono = true, children,
}) {
  const fileRef = useRef(null)
  const { output, error } = useMemo(() => {
    if (!input) return { output: '', error: '' }
    try {
      return { output: String(transform(input) ?? ''), error: '' }
    } catch (e) {
      return { output: '', error: e.message || String(e) }
    }
  }, [input, transform])

  return (
    <div className="transform">
      {options && <div className="transform-options">{options}</div>}
      <div className={`transform-panes ${onSwap ? 'has-swap' : ''}`}>
        <div className="pane">
          <div className="pane-head">
            <span>{inputLabel}</span>
            <div className="pane-actions">
              {accept && (
                <>
                  <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}><FileUp size={15} /> Open file</button>
                  <input ref={fileRef} type="file" hidden accept={accept} onChange={async (e) => { const f = e.target.files[0]; if (f) setInput(await f.text()); e.target.value = '' }} />
                </>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => setInput('')} disabled={!input}><Eraser size={15} /> Clear</button>
            </div>
          </div>
          <textarea className={`textarea pane-text ${mono ? 'mono' : ''}`} value={input} placeholder={placeholder} onChange={(e) => setInput(e.target.value)} spellCheck={false} aria-label={inputLabel} />
          <div className="pane-foot">{input.length.toLocaleString()} characters</div>
        </div>
        {onSwap && (
          <button className="swap-btn" title="Swap input and output" aria-label="Swap input and output" onClick={() => onSwap(output)} disabled={!output}><ArrowLeftRight size={18} /></button>
        )}
        <div className="pane">
          <div className="pane-head">
            <span>{outputLabel}</span>
            <div className="pane-actions">
              <CopyButton text={output} small />
              {downloadName && (
                <button className="btn btn-soft btn-sm" disabled={!output} onClick={() => downloadBlob(new Blob([output], { type: downloadType }), downloadName)}>
                  <Download size={15} /> Download
                </button>
              )}
            </div>
          </div>
          {error ? <div className="alert alert-error pane-error">{error}</div> : <textarea className={`textarea pane-text ${mono ? 'mono' : ''}`} value={output} readOnly spellCheck={false} aria-label={outputLabel} />}
          <div className="pane-foot">{output.length.toLocaleString()} characters</div>
        </div>
      </div>
      {children}
    </div>
  )
}
