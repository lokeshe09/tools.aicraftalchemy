import { useState } from 'react'
import { DropZone, FileList, Workspace, ErrorBox, ResultPanel, useTask } from './ui'

/**
 * Generic "upload → configure → process → download" flow shared by every file tool.
 *
 * - `process(files, setProgress)` returns { blob, name } (or an array of them).
 * - `options` / `main` may be JSX or a function receiving { files, setFiles }.
 * - Pass `files` + `setFiles` to control the file state from the tool.
 */
export default function FileTool({
  accept,
  multiple = false,
  dropLabel = 'Select file',
  actionLabel = 'Convert',
  process,
  options,
  main,
  reorder = false,
  resultTitle,
  resultExtra,
  files: controlledFiles,
  setFiles: setControlledFiles,
  disabled,
}) {
  const [localFiles, setLocalFiles] = useState([])
  const files = controlledFiles ?? localFiles
  const setFiles = setControlledFiles ?? setLocalFiles
  const task = useTask()
  const ctx = { files, setFiles }

  const reset = () => { task.reset(); setFiles([]) }

  if (task.result) {
    return (
      <ResultPanel result={task.result} onReset={reset} title={resultTitle}>
        {typeof resultExtra === 'function' ? resultExtra(task.result) : resultExtra}
      </ResultPanel>
    )
  }

  if (!files.length) {
    return <DropZone accept={accept} multiple={multiple} onFiles={setFiles} label={multiple ? dropLabel.replace(/file$/, 'files') : dropLabel} />
  }

  return (
    <>
      <ErrorBox error={task.error} />
      <Workspace
        sidebar={typeof options === 'function' ? options(ctx) : options}
        action={() => task.run((p) => process(files, p))}
        actionLabel={actionLabel}
        busy={task.busy}
        progress={task.progress}
        disabled={disabled}
      >
        {main ? (typeof main === 'function' ? main(ctx) : main) : <FileList files={files} setFiles={setFiles} reorder={reorder} />}
        {multiple && (
          <DropZone accept={accept} multiple onFiles={(f) => setFiles([...files, ...f])} label="Add more files" compact />
        )}
      </Workspace>
    </>
  )
}
