import { useEffect, useState } from 'react'
import { openPdfjs, renderPage } from '../lib/pdf'
import { setPassword } from '../lib/passwords'
import { PasswordPrompt, Spinner, Alert } from './ui'

/**
 * Render page thumbnails progressively. Returns { thumbs, sizes, count, loading, error, needPassword }.
 * `thumbs[i]` is a data URL (or undefined while rendering).
 */
export function usePdfThumbs(file, maxWidth = 170) {
  const [state, setState] = useState({ thumbs: [], sizes: [], count: 0, loading: false, error: '', needPassword: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!file) { setState({ thumbs: [], sizes: [], count: 0, loading: false, error: '', needPassword: null }); return }
    let alive = true
    let doc = null
    setState((s) => ({ ...s, thumbs: [], loading: true, error: '', needPassword: null }))
    ;(async () => {
      doc = await openPdfjs(file)
      const sizes = []
      for (let i = 1; i <= doc.numPages; i++) {
        const vp = (await doc.getPage(i)).getViewport({ scale: 1 })
        sizes.push({ width: vp.width, height: vp.height })
      }
      if (!alive) return
      setState((s) => ({ ...s, sizes, count: doc.numPages }))
      for (let i = 1; i <= doc.numPages && alive; i++) {
        const { canvas } = await renderPage(doc, i, maxWidth / sizes[i - 1].width)
        const url = canvas.toDataURL('image/jpeg', 0.72)
        canvas.width = canvas.height = 0
        if (!alive) return
        setState((s) => {
          const thumbs = s.thumbs.slice()
          thumbs[i - 1] = url
          return { ...s, thumbs }
        })
      }
      if (alive) setState((s) => ({ ...s, loading: false }))
    })().catch((e) => {
      if (!alive) return
      if (e.name === 'PasswordRequiredError') setState((s) => ({ ...s, loading: false, needPassword: e }))
      else setState((s) => ({ ...s, loading: false, error: e.message }))
    })
    return () => {
      alive = false
      doc?.destroy?.()
    }
  }, [file, maxWidth, attempt])

  const retry = () => setAttempt((a) => a + 1)
  return { ...state, retry }
}

export function ThumbsStatus({ state, file }) {
  if (state.needPassword) {
    return (
      <PasswordPrompt
        fileName={file?.name || 'This PDF'}
        wrong={state.needPassword.wrong}
        onSubmit={(pw) => { setPassword(file, pw); state.retry() }}
      />
    )
  }
  if (state.error) return <Alert kind="error">{state.error}</Alert>
  if (state.loading && !state.count) return <Spinner label="Reading pages…" />
  return null
}

/** Grid of page thumbnails. */
export function ThumbGrid({ thumbs, count, order, selected, onToggle, rotations = {}, renderActions, draggable, onDrop, dimmed, labels, sizes }) {
  const [dragIdx, setDragIdx] = useState(null)
  const [overIdx, setOverIdx] = useState(null)
  const list = order || Array.from({ length: count ?? thumbs.length }, (_, i) => i)
  return (
    <div className="thumb-grid">
      {list.map((item, pos) => {
        const pageIdx = typeof item === 'object' ? item.key : item
        const src = typeof item === 'object' ? item.thumb : thumbs[pageIdx]
        const rot = typeof item === 'object' ? item.rot || 0 : rotations[pageIdx] || 0
        const size = typeof item === 'object' ? item.size : sizes?.[pageIdx]
        return (
          <div
            key={typeof item === 'object' ? item.id : `${pageIdx}`}
            className={`thumb ${selected?.has(pageIdx) ? 'selected' : ''} ${dimmed?.has(pageIdx) ? 'dimmed' : ''} ${onToggle ? 'clickable' : ''} ${overIdx === pos && dragIdx !== pos ? 'drop-target' : ''}`}
            onClick={() => onToggle?.(pageIdx)}
            draggable={draggable}
            onDragStart={(e) => { setDragIdx(pos); e.dataTransfer.effectAllowed = 'move' }}
            onDragEnter={() => draggable && setOverIdx(pos)}
            onDragOver={(e) => draggable && e.preventDefault()}
            onDragEnd={() => { setDragIdx(null); setOverIdx(null) }}
            onDrop={(e) => {
              e.preventDefault()
              if (draggable && dragIdx !== null && dragIdx !== pos) onDrop?.(dragIdx, pos)
              setDragIdx(null)
              setOverIdx(null)
            }}
          >
            <div className="thumb-img" style={size ? { aspectRatio: `${size.width} / ${size.height}` } : undefined}>
              {src ? (
                <img src={src} alt={`Page ${pageIdx + 1}`} style={{ transform: `rotate(${rot}deg)` }} draggable={false} />
              ) : item?.blank ? (
                <div className="thumb-blank">Blank</div>
              ) : (
                <div className="thumb-skeleton" />
              )}
            </div>
            <div className="thumb-foot">
              <span className="thumb-num">{labels ? labels(item, pos) : pageIdx + 1}</span>
              {renderActions && <div className="thumb-actions" onClick={(e) => e.stopPropagation()}>{renderActions(item, pos)}</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
