import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Search, ShieldCheck, Zap, Infinity as InfinityIcon, WifiOff, UploadCloud, Sparkles, X, ArrowRight, Lock, Cpu, Download } from 'lucide-react'
import { CATEGORIES, TOOLS, CAT_MAP } from '../registry'
import { searchTools } from '../components/CommandPalette'
import { acceptsFile, formatBytes } from '../lib/files'
import { setHandoff } from '../lib/handoff'

export function ToolCard({ tool }) {
  const Icon = tool.icon
  const c = CAT_MAP[tool.cat]
  return (
    <Link to={`/${tool.id}`} className="tool-card" style={{ '--c': c.color }}>
      <div className="tool-card-top">
        <span className="tool-icon"><Icon size={22} /></span>
        {tool.badge === 'new' && <span className="badge-new">New</span>}
        {tool.popular && tool.badge !== 'new' && <span className="badge-pop">Popular</span>}
      </div>
      <h3>{tool.name}</h3>
      <p>{tool.desc}</p>
      {tool.from && tool.to && <div className="fmt"><span>{tool.from}</span><ArrowRight size={12} /><span>{tool.to}</span></div>}
    </Link>
  )
}

/** Drop any file → suggest every tool that can open it. */
function SmartDrop() {
  const [files, setFiles] = useState([])
  const [over, setOver] = useState(false)
  const inputRef = useRef(null)
  const navigate = useNavigate()
  const matches = useMemo(() => {
    if (!files.length) return []
    const ok = TOOLS.filter((t) => t.accept && files.every((f) => acceptsFile(t.accept, f)))
    return ok.sort((a, b) => (b.popular ? 1 : 0) - (a.popular ? 1 : 0))
  }, [files])
  const kind = files[0] ? (files[0].name.split('.').pop() || '').toUpperCase() : ''

  return (
    <div
      className={`smart-drop ${over ? 'over' : ''} ${files.length ? 'has-files' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); setFiles(Array.from(e.dataTransfer.files || [])) }}
    >
      {!files.length ? (
        <>
          <div className="sd-orb"><UploadCloud size={30} /></div>
          <h3>Drop any file here</h3>
          <p className="muted">PDF, Word, Excel, images, videos… we'll show every tool that can handle it.</p>
          <button className="btn btn-primary btn-lg" onClick={() => inputRef.current?.click()}>Choose files</button>
          <p className="sd-privacy"><Lock size={13} /> Stays on your device</p>
        </>
      ) : (
        <>
          <div className="sd-head">
            <div>
              <strong>{files.length === 1 ? files[0].name : `${files.length} files`}</strong>
              <span className="muted small"> · {formatBytes(files.reduce((a, f) => a + f.size, 0))}</span>
            </div>
            <button className="icon-btn" onClick={() => setFiles([])} aria-label="Clear"><X size={16} /></button>
          </div>
          {matches.length ? (
            <>
              <p className="muted small">What do you want to do with {files.length === 1 ? `this ${kind}` : 'these files'}?</p>
              <div className="sd-list">
                {matches.slice(0, 14).map((t) => {
                  const Icon = t.icon
                  return (
                    <button key={t.id} className="sd-item" style={{ '--c': CAT_MAP[t.cat].color }} onClick={() => { setHandoff(files); navigate(`/${t.id}`) }}>
                      <Icon size={16} /> {t.name}
                    </button>
                  )
                })}
              </div>
            </>
          ) : <p className="muted">No tool accepts this file type yet.</p>}
        </>
      )}
      <input ref={inputRef} type="file" hidden multiple onChange={(e) => { setFiles(Array.from(e.target.files || [])); e.target.value = '' }} />
    </div>
  )
}

export default function Home() {
  const [params, setParams] = useSearchParams()
  const cat = params.get('cat') || 'all'
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const base = q.trim() ? searchTools(q) : TOOLS
    return base.filter((t) => cat === 'all' || t.cat === cat)
  }, [cat, q])
  const counts = useMemo(() => Object.fromEntries(CATEGORIES.map((c) => [c.id, c.id === 'all' ? TOOLS.length : TOOLS.filter((t) => t.cat === c.id).length])), [])
  const popular = TOOLS.filter((t) => t.popular).slice(0, 10)
  const { hash } = useLocation()
  useEffect(() => {
    if (hash === '#all-tools') setTimeout(() => document.getElementById('all-tools')?.scrollIntoView({ behavior: 'smooth' }), 60)
  }, [hash, cat])

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow"><Sparkles size={14} /> {TOOLS.length} tools · 100% in your browser</span>
          <h1>Every file tool.<br /><span className="grad">Zero uploads.</span></h1>
          <p className="lead">Convert, compress, edit, sign and secure PDFs, images, video, audio and documents — processed on your own device, so your files never touch a server.</p>
          <div className="hero-search">
            <Search size={18} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="What do you need? e.g. compress pdf to 200kb" aria-label="Search tools" onKeyDown={(e) => e.key === 'Enter' && document.getElementById('all-tools')?.scrollIntoView({ behavior: 'smooth' })} />
          </div>
          <div className="hero-pop">
            {popular.map((t) => <Link key={t.id} to={`/${t.id}`} className="chip">{t.name}</Link>)}
          </div>
        </div>
        <SmartDrop />
      </section>

      <section className="trust-row">
        <div><ShieldCheck size={20} /><span><strong>Private</strong> — no uploads, ever</span></div>
        <div><Zap size={20} /><span><strong>Instant</strong> — no queues or waiting</span></div>
        <div><InfinityIcon size={20} /><span><strong>Unlimited</strong> — no sign-up, no watermarks</span></div>
        <div><WifiOff size={20} /><span><strong>Offline-ready</strong> once loaded</span></div>
      </section>

      <section className="browser" id="all-tools">
        <aside className="cat-rail" aria-label="Categories">
          {CATEGORIES.map((c) => (
            <button key={c.id} className={`cat-item ${cat === c.id ? 'active' : ''}`} style={{ '--c': c.color }} onClick={() => setParams(c.id === 'all' ? {} : { cat: c.id }, { replace: true, preventScrollReset: true })}>
              <span className="dot" /> {c.label} <span className="count">{counts[c.id]}</span>
            </button>
          ))}
        </aside>
        <div className="browser-main">
          <div className="browser-head">
            <h2>{CAT_MAP[cat]?.label || 'All tools'}</h2>
            {q && <span className="muted small">{list.length} result{list.length === 1 ? '' : 's'} for “{q}” <button className="btn btn-ghost btn-sm" onClick={() => setQ('')}>Clear</button></span>}
          </div>
          <div className="tool-grid">
            {list.map((t) => <ToolCard key={t.id} tool={t} />)}
            {!list.length && <p className="muted">No tools match “{q}”. Try another word.</p>}
          </div>
        </div>
      </section>

      <section className="how">
        <h2>How it works</h2>
        <div className="how-grid">
          <div className="how-step"><span className="how-n">1</span><UploadCloud size={26} /><h3>Pick your files</h3><p>Drag & drop or choose files. They're opened by your browser — nothing is sent anywhere.</p></div>
          <div className="how-step"><span className="how-n">2</span><Cpu size={26} /><h3>Customize</h3><p>Fine-tune every option: DPI, quality, target size, page ranges, fonts, positions and more.</p></div>
          <div className="how-step"><span className="how-n">3</span><Download size={26} /><h3>Download</h3><p>Get your result instantly — or send it straight into another tool.</p></div>
        </div>
      </section>

      <section className="faq">
        <h2>Questions</h2>
        <details><summary>Are my files really never uploaded?</summary><p>Yes. Every tool runs as code inside your browser tab (JavaScript and WebAssembly). There is no server that receives files. You can even disconnect from the internet after the page loads and most tools keep working.</p></details>
        <details><summary>Is it free? Are there limits?</summary><p>Completely free, no account, no watermarks, no daily limits. The only limit is your device's memory for very large files.</p></details>
        <details><summary>Why do some tools download extra data the first time?</summary><p>OCR (text recognition) and video/audio tools need large engines (language models, FFmpeg). They are downloaded once from a public CDN and cached by your browser. Your files still never leave your device.</p></details>
        <details><summary>Can I unlock or edit a PDF with a digital signature (like e-Aadhaar)?</summary><p>You can — but any change to a digitally signed file makes its signature invalid. Use <Link to="/verify-signature">Verify signature</Link> to check the original, and keep it for official use.</p></details>
      </section>
    </>
  )
}
