import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, ShieldCheck, Zap, Gift, WifiOff } from 'lucide-react'
import { CATEGORIES, TOOLS } from '../registry'

export function ToolCard({ tool }) {
  const Icon = tool.icon
  return (
    <Link to={`/${tool.id}`} className="tool-card">
      <span className="tool-icon" style={{ background: `${tool.color}1a`, color: tool.color }}>
        <Icon size={26} />
      </span>
      <h3>{tool.name}</h3>
      <p>{tool.desc}</p>
    </Link>
  )
}

export default function Home() {
  const [params, setParams] = useSearchParams()
  const cat = params.get('cat') || 'all'
  const [q, setQ] = useState('')

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return TOOLS.filter((t) => (cat === 'all' || t.cat === cat) && (!s || `${t.name} ${t.desc}`.toLowerCase().includes(s)))
  }, [cat, q])

  return (
    <>
      <section className="hero">
        <h1>Every tool you need to work with your files</h1>
        <p>
          All the PDF, image, document and data converters you need — merge, split, compress, convert, rotate, sign and watermark.
          100% free and everything runs <strong>right in your browser</strong>.
        </p>
        <div className="search">
          <Search size={20} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${TOOLS.length} tools…`} aria-label="Search tools" />
        </div>
      </section>

      <div className="cats" role="tablist">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={cat === c.id}
            className={`cat ${cat === c.id ? 'active' : ''}`}
            onClick={() => setParams(c.id === 'all' ? {} : { cat: c.id }, { replace: true })}
          >
            {c.label}
          </button>
        ))}
      </div>

      <section className="tool-grid">
        {list.map((t) => <ToolCard key={t.id} tool={t} />)}
        {!list.length && <p className="muted center full">No tools match “{q}”.</p>}
      </section>

      <section className="features">
        <div className="feature"><ShieldCheck size={32} /><h3>Private by design</h3><p>No uploads, no servers, no storage. Files are processed on your device and vanish when you close the tab.</p></div>
        <div className="feature"><Zap size={32} /><h3>Lightning fast</h3><p>No waiting for uploads or queues — conversions start instantly using your browser's power.</p></div>
        <div className="feature"><Gift size={32} /><h3>Completely free</h3><p>No sign-up, no watermarks, no limits on how many files you process.</p></div>
        <div className="feature"><WifiOff size={32} /><h3>Works anywhere</h3><p>Desktop, tablet or phone — any modern browser on any operating system.</p></div>
      </section>
    </>
  )
}
