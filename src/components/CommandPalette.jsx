import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, CornerDownLeft } from 'lucide-react'
import { TOOLS, CAT_MAP } from '../registry'

export function searchTools(q) {
  const s = q.trim().toLowerCase()
  if (!s) return TOOLS.filter((t) => t.popular)
  const terms = s.split(/\s+/)
  return TOOLS.map((t) => {
    const hay = `${t.name} ${t.desc} ${t.tags || ''} ${t.from || ''} ${t.to || ''} ${CAT_MAP[t.cat].label}`.toLowerCase()
    if (!terms.every((w) => hay.includes(w))) return null
    const name = t.name.toLowerCase()
    const score = (name.startsWith(s) ? 100 : 0) + (name.includes(s) ? 50 : 0) + (t.popular ? 10 : 0) - name.length / 100
    return { t, score }
  }).filter(Boolean).sort((a, b) => b.score - a.score).map((x) => x.t)
}

/** ⌘K / Ctrl+K quick switcher for every tool. */
export default function CommandPalette({ open, onClose }) {
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const results = useMemo(() => searchTools(q).slice(0, 12), [q])

  useEffect(() => {
    if (open) { setQ(''); setIdx(0); setTimeout(() => inputRef.current?.focus(), 10) }
  }, [open])
  useEffect(() => setIdx(0), [q])

  if (!open) return null
  const go = (t) => { onClose(); navigate(`/${t.id}`) }
  return (
    <div className="palette-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette-box" role="dialog" aria-modal="true" aria-label="Search tools">
        <div className="palette-input">
          <Search size={18} />
          <input
            ref={inputRef}
            value={q}
            placeholder="Search 100+ tools… e.g. “compress pdf”, “heic”, “mp3”"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(results.length - 1, i + 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)) }
              if (e.key === 'Enter' && results[idx]) go(results[idx])
              if (e.key === 'Escape') onClose()
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <ul className="palette-list" role="listbox">
          {!q && <li className="palette-label">Popular</li>}
          {results.map((t, i) => {
            const Icon = t.icon
            const c = CAT_MAP[t.cat]
            return (
              <li key={t.id} role="option" aria-selected={i === idx} className={i === idx ? 'active' : ''} onMouseEnter={() => setIdx(i)} onClick={() => go(t)}>
                <span className="palette-icon" style={{ '--c': c.color }}><Icon size={17} /></span>
                <span className="palette-name">{t.name}</span>
                <span className="palette-cat">{c.label}</span>
                {i === idx && <CornerDownLeft size={14} className="muted" />}
              </li>
            )
          })}
          {!results.length && <li className="palette-empty">No tools match “{q}”.</li>}
        </ul>
      </div>
    </div>
  )
}
