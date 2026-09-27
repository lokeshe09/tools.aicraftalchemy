import { useRef } from 'react'
import { FileUp } from 'lucide-react'
import { ErrorBox, ResultPanel, Workspace, useTask } from './ui'

/** Paste-or-upload text input → process → downloadable result. */
export default function TextInputTool({ value, onChange, placeholder, accept, actionLabel, options, process, rows = 16, mono = false }) {
  const task = useTask()
  const fileRef = useRef(null)

  if (task.result) return <ResultPanel result={task.result} onReset={task.reset} />

  return (
    <>
      <ErrorBox error={task.error} />
      <Workspace
        sidebar={options}
        action={() => task.run(process)}
        actionLabel={actionLabel}
        busy={task.busy}
        progress={task.progress}
        disabled={!value.trim()}
      >
        <div className="editor-head">
          <span className="muted small">Paste your content below</span>
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
        <textarea className={`textarea ${mono ? 'mono' : ''}`} rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      </Workspace>
    </>
  )
}
