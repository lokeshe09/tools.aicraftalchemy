import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { renderThumbnails } from '../utils/pdf'

export function usePdfThumbs(file) {
  const [state, setState] = useState({ thumbs: [], loading: false, error: '' })
  useEffect(() => {
    if (!file) { setState({ thumbs: [], loading: false, error: '' }); return }
    let alive = true
    setState({ thumbs: [], loading: true, error: '' })
    renderThumbnails(file)
      .then((thumbs) => alive && setState({ thumbs, loading: false, error: '' }))
      .catch((e) => alive && setState({ thumbs: [], loading: false, error: e.message || 'Could not read PDF (it may be password protected).' }))
    return () => { alive = false }
  }, [file])
  return state
}

export function ThumbsLoading({ loading, error }) {
  if (error) return <div className="alert alert-error">{error}</div>
  if (loading) return <div className="loading-row"><Loader2 className="spin" size={20} /> Reading pages…</div>
  return null
}

/** Grid of page thumbnails. `renderBadge(i)` and `renderActions(i)` customise each tile. */
export function ThumbGrid({ thumbs, order, selected, onToggle, rotations = {}, renderActions, draggable, onDrop, dimmed }) {
  const [dragIdx, setDragIdx] = useState(null)
  const list = order || thumbs.map((_, i) => i)
  return (
    <div className="thumb-grid">
      {list.map((pageIdx, pos) => (
        <div
          key={`${pageIdx}-${pos}`}
          className={`thumb ${selected?.has(pageIdx) ? 'selected' : ''} ${dimmed?.has(pageIdx) ? 'dimmed' : ''} ${onToggle ? 'clickable' : ''}`}
          onClick={() => onToggle?.(pageIdx)}
          draggable={draggable}
          onDragStart={() => setDragIdx(pos)}
          onDragOver={(e) => draggable && e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            if (draggable && dragIdx !== null && dragIdx !== pos) onDrop?.(dragIdx, pos)
            setDragIdx(null)
          }}
        >
          <div className="thumb-img">
            <img src={thumbs[pageIdx]} alt={`Page ${pageIdx + 1}`} style={{ transform: `rotate(${rotations[pageIdx] || 0}deg)` }} />
          </div>
          <div className="thumb-foot">
            <span>{pageIdx + 1}</span>
            {renderActions && <div className="thumb-actions" onClick={(e) => e.stopPropagation()}>{renderActions(pageIdx, pos)}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}
