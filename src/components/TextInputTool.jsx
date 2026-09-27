import { useRef } from 'react'
import { FileUp, Printer } from 'lucide-react'
import { ErrorBox, ResultPanel, Workspace, useTask } from './ui'
import ContinueWith from './ContinueWith'

/** Paste-or-upload text → process → downloadable result. `onPrint` adds a vector "Print / Save as PDF" option. */
export default function TextInputTool({ value, onChange, placeholder, accept, actionLabel, options, process, rows = 18, mono = false, onPrint }) {
  const task = useTask()
  const fileRef = useRef(null)

  if (task.result) return <ResultPanel result={task.result} onReset={() => { task.reset(); onChange('') }} onBack={task.reset} continueWith={<ContinueWith result={task.result} />} />

  return (
    <>
      <ErrorBox error={task.error} onClose={task.reset} />
      <Workspace
        sidebar={
          <>
            {options}
            {onPrint && (
              <button className="btn btn-soft btn-block" disabled={!value.trim()} onClick={onPrint} title="Opens your browser's print dialog — choose “Save as PDF” for selectable text">
                <Printer size={17} /> Print / Save as vector PDF
              </button>
            )}
          </>
        }
        action={() => task.run(process)}
        actionLabel={actionLabel}
        busy={task.busy}
        progress={task.progress}
        disabled={!value.trim()}
      >
        <div className="editor-head">
          <span className="muted small">Type, paste, or load a file</span>
          {accept && (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}><FileUp size={16} /> Load from file</button>
              <input
                ref={fileRef}
                type="file"
                hidden
                accept={accept}
                onChange={async (e) => {
                  const f = e.target.files[0]
                  if (f) onChange(await f.text())
                  e.target.value = ''
                }}
              />
            </>
          )}
        </div>
        <textarea className={`textarea ${mono ? 'mono' : ''}`} rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} spellCheck={!mono} />
      </Workspace>
    </>
  )
}
