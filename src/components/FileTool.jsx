import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DropZone, FileList, Workspace, ErrorBox, ResultPanel, useTask, Steps, Alert, PasswordPrompt } from './ui'
import ContinueWith from './ContinueWith'
import { acceptsFile } from '../lib/files'
import { takeHandoff } from '../lib/handoff'
import { setPassword } from '../lib/passwords'
import { hasDigitalSignature } from '../lib/pdfDoc'

/**
 * Shared "upload → customise → download" flow used by every file tool.
 *
 * - `process(files, setProgress)` returns { blob, name, originalSize?, note? } (or an array).
 * - `options` / `main` may be JSX or a function receiving { files, setFiles }.
 * - Pass `files` + `setFiles` to control file state from the tool.
 * - `modifiesPdf` shows a warning when a digitally signed PDF is loaded.
 */
export default function FileTool({
  accept,
  multiple = false,
  dropLabel,
  formats,
  actionLabel = 'Convert',
  actionHint,
  process,
  options,
  main,
  reorder = false,
  resultTitle,
  resultExtra,
  files: controlledFiles,
  setFiles: setControlledFiles,
  disabled,
  minFiles = 1,
  modifiesPdf = false,
  camera = false,
}) {
  const [localFiles, setLocalFiles] = useState([])
  const files = controlledFiles ?? localFiles
  const setFilesRaw = setControlledFiles ?? setLocalFiles
  const task = useTask()
  const [rejected, setRejected] = useState([])
  const [signed, setSigned] = useState(false)

  const setFiles = (list) => {
    const ok = list.filter((f) => acceptsFile(accept, f))
    setRejected(list.filter((f) => !acceptsFile(accept, f)).map((f) => f.name))
    task.reset()
    setFilesRaw(multiple ? ok : ok.slice(0, 1))
  }

  // Files handed over from another tool or the home page.
  useEffect(() => {
    const incoming = takeHandoff((f) => acceptsFile(accept, f))
    if (incoming.length) setFilesRaw(multiple ? incoming : incoming.slice(0, 1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!modifiesPdf || !files.length) { setSigned(false); return }
    let alive = true
    Promise.all(files.map(hasDigitalSignature)).then((r) => alive && setSigned(r.some(Boolean)))
    return () => { alive = false }
  }, [files, modifiesPdf])

  const ctx = { files, setFiles }
  const reset = () => { task.reset(); setFilesRaw([]); setRejected([]) }
  const start = () => task.run((p) => process(files, p))

  if (task.result) {
    return (
      <>
        <Steps step={2} />
        <ResultPanel result={task.result} onReset={reset} onBack={task.reset} title={resultTitle} continueWith={<ContinueWith result={task.result} />}>
          {typeof resultExtra === 'function' ? resultExtra(task.result) : resultExtra}
        </ResultPanel>
      </>
    )
  }

  const pwError = task.errorObj?.name === 'PasswordRequiredError' ? task.errorObj : null
  const label = dropLabel || (multiple ? 'Choose files' : 'Choose file')

  if (!files.length) {
    return (
      <>
        <Steps step={0} />
        {rejected.length > 0 && <Alert kind="warn" onClose={() => setRejected([])}>Skipped {rejected.join(', ')} — not a supported file type for this tool.</Alert>}
        <DropZone accept={accept} multiple={multiple} onFiles={setFiles} label={label} formats={formats} camera={camera} />
      </>
    )
  }

  return (
    <>
      <Steps step={1} />
      {rejected.length > 0 && <Alert kind="warn" onClose={() => setRejected([])}>Skipped {rejected.join(', ')} — not a supported file type for this tool.</Alert>}
      {signed && (
        <Alert kind="warn">
          This PDF is <strong>digitally signed</strong>. Any change to it will make the existing signature show as invalid. Keep the original if the signature matters —
          you can check it with <Link to="/verify-signature">Verify signature</Link>.
        </Alert>
      )}
      {pwError ? (
        <PasswordPrompt
          fileName={pwError.file?.name || 'This PDF'}
          wrong={pwError.wrong}
          onSubmit={(pw) => {
            if (pwError.file) setPassword(pwError.file, pw)
            start()
          }}
          onCancel={task.reset}
        />
      ) : (
        <ErrorBox error={task.error} onClose={task.reset} />
      )}
      <Workspace
        sidebar={typeof options === 'function' ? options(ctx) : options}
        action={start}
        actionLabel={actionLabel}
        actionHint={actionHint}
        busy={task.busy}
        progress={task.progress}
        disabled={disabled || files.length < minFiles}
      >
        {main ? (typeof main === 'function' ? main(ctx) : main) : <FileList files={files} setFiles={setFiles} reorder={reorder} />}
        {multiple && <DropZone accept={accept} multiple onFiles={(f) => setFiles([...files, ...f])} label="Add more files" compact />}
      </Workspace>
    </>
  )
}
