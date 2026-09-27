import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Download } from 'lucide-react'
import TransformTool from '../components/TransformTool'
import { Field, Segmented, CopyButton } from '../components/ui'
import { downloadBlob } from '../utils/files'

/* ---------------- JSON formatter ---------------- */
export function JsonFormatter() {
  const [input, setInput] = useState('{"name":"tools","by":"aicraftalchemy","features":["pdf","image","data"],"private":true}')
  const [indent, setIndent] = useState(2)
  const transform = useCallback((s) => (indent === 0 ? JSON.stringify(JSON.parse(s)) : JSON.stringify(JSON.parse(s), null, indent)), [indent])
  return (
    <TransformTool
      input={input}
      setInput={setInput}
      transform={transform}
      accept=".json"
      downloadName="formatted.json"
      downloadType="application/json"
      inputLabel="JSON"
      outputLabel={indent === 0 ? 'Minified' : 'Formatted'}
      options={<Segmented value={indent} onChange={setIndent} options={[{ value: 2, label: '2 spaces' }, { value: 4, label: '4 spaces' }, { value: '\t', label: 'Tabs' }, { value: 0, label: 'Minify' }]} />}
    />
  )
}

/* ---------------- Base64 ---------------- */
const b64encode = (s) => {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  bytes.forEach((b) => { bin += String.fromCharCode(b) })
  return btoa(bin)
}
const b64decode = (s) => {
  const bin = atob(s.replace(/^data:[^,]*,/, '').replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

export function Base64Tool() {
  const [mode, setMode] = useState('encode')
  const [input, setInput] = useState('Hello from tools!')
  const transform = useCallback((s) => {
    if (mode === 'encode') return b64encode(s)
    try { return b64decode(s) } catch { throw new Error('Input is not valid Base64.') }
  }, [mode])
  return (
    <TransformTool
      input={input}
      setInput={setInput}
      transform={transform}
      inputLabel={mode === 'encode' ? 'Text' : 'Base64'}
      outputLabel={mode === 'encode' ? 'Base64' : 'Text'}
      onSwap={(out) => { setMode(mode === 'encode' ? 'decode' : 'encode'); setInput(out) }}
      options={<Segmented value={mode} onChange={setMode} options={[{ value: 'encode', label: 'Encode' }, { value: 'decode', label: 'Decode' }]} />}
    />
  )
}

/* ---------------- URL encode ---------------- */
export function UrlEncoder() {
  const [mode, setMode] = useState('encode')
  const [input, setInput] = useState('https://example.com/search?q=hello world&lang=en')
  const transform = useCallback((s) => {
    if (mode === 'encode') return encodeURIComponent(s)
    try { return decodeURIComponent(s.replace(/\+/g, ' ')) } catch { throw new Error('Malformed URL encoding.') }
  }, [mode])
  return (
    <TransformTool
      input={input}
      setInput={setInput}
      transform={transform}
      onSwap={(out) => { setMode(mode === 'encode' ? 'decode' : 'encode'); setInput(out) }}
      options={<Segmented value={mode} onChange={setMode} options={[{ value: 'encode', label: 'Encode' }, { value: 'decode', label: 'Decode' }]} />}
    />
  )
}

/* ---------------- Markdown → HTML ---------------- */
export function MarkdownToHtml() {
  const [input, setInput] = useState('# Title\n\nSome **bold** and _italic_ text.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n')
  const [marked, setMarked] = useState(null)
  const [view, setView] = useState('preview')
  useEffect(() => { import('marked').then((m) => setMarked(() => m.marked)) }, [])
  const transform = useCallback((s) => (marked ? marked.parse(s, { async: false }) : ''), [marked])
  const html = useMemo(() => { try { return transform(input).replace(/<script[\s\S]*?<\/script>/gi, '') } catch { return '' } }, [input, transform])
  return (
    <TransformTool
      input={input}
      setInput={setInput}
      transform={transform}
      accept=".md,.markdown,.txt"
      inputLabel="Markdown"
      outputLabel="HTML"
      downloadName="document.html"
      downloadType="text/html"
      options={<Segmented value={view} onChange={setView} options={[{ value: 'preview', label: 'Show preview' }, { value: 'code', label: 'Code only' }]} />}
    >
      {view === 'preview' && <div className="md-preview" dangerouslySetInnerHTML={{ __html: html }} />}
    </TransformTool>
  )
}

/* ---------------- Case converter ---------------- */
const words = (s) => s.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9À-￿]+/).filter(Boolean)
const CASES = {
  upper: (s) => s.toUpperCase(),
  lower: (s) => s.toLowerCase(),
  title: (s) => s.toLowerCase().replace(/(^|\s)(\S)/g, (_, a, b) => a + b.toUpperCase()),
  sentence: (s) => s.toLowerCase().replace(/(^\s*|[.!?]\s+)([a-zà-ÿ])/g, (_, a, b) => a + b.toUpperCase()),
  camel: (s) => words(s).map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join(''),
  pascal: (s) => words(s).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(''),
  snake: (s) => words(s).map((w) => w.toLowerCase()).join('_'),
  kebab: (s) => words(s).map((w) => w.toLowerCase()).join('-'),
  constant: (s) => words(s).map((w) => w.toUpperCase()).join('_'),
  alternating: (s) => [...s].map((c, i) => (i % 2 ? c.toUpperCase() : c.toLowerCase())).join(''),
  inverse: (s) => [...s].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join(''),
}
export function CaseConverter() {
  const [input, setInput] = useState('The quick brown fox jumps over the lazy dog')
  const [mode, setMode] = useState('title')
  const transform = useCallback((s) => CASES[mode](s), [mode])
  return (
    <TransformTool
      input={input}
      setInput={setInput}
      transform={transform}
      mono={false}
      options={
        <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="upper">UPPER CASE</option>
          <option value="lower">lower case</option>
          <option value="title">Title Case</option>
          <option value="sentence">Sentence case</option>
          <option value="camel">camelCase</option>
          <option value="pascal">PascalCase</option>
          <option value="snake">snake_case</option>
          <option value="kebab">kebab-case</option>
          <option value="constant">CONSTANT_CASE</option>
          <option value="alternating">aLtErNaTiNg</option>
          <option value="inverse">iNVERSE</option>
        </select>
      }
    />
  )
}

/* ---------------- Word counter ---------------- */
export function WordCounter() {
  const [text, setText] = useState('')
  const stats = useMemo(() => {
    const w = text.trim() ? text.trim().split(/\s+/).length : 0
    return [
      ['Words', w],
      ['Characters', text.length],
      ['Characters (no spaces)', text.replace(/\s/g, '').length],
      ['Sentences', (text.match(/[^.!?]+[.!?]+(\s|$)/g) || []).length || (text.trim() ? 1 : 0)],
      ['Paragraphs', text.split(/\n\s*\n/).filter((p) => p.trim()).length],
      ['Lines', text ? text.split('\n').length : 0],
      ['Reading time', `${Math.max(w ? 1 : 0, Math.round(w / 230))} min`],
      ['Speaking time', `${Math.max(w ? 1 : 0, Math.round(w / 140))} min`],
    ]
  }, [text])
  const top = useMemo(() => {
    const freq = {}
    text.toLowerCase().match(/[\p{L}\p{N}']+/gu)?.forEach((w) => { if (w.length > 3) freq[w] = (freq[w] || 0) + 1 })
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [text])
  return (
    <div className="workspace">
      <div className="ws-main">
        <textarea className="textarea tall" placeholder="Start typing or paste your text…" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <aside className="ws-side">
        <div className="stat-grid">
          {stats.map(([k, v]) => <div key={k} className="stat"><strong>{v}</strong><span>{k}</span></div>)}
        </div>
        {top.length > 0 && (
          <>
            <h3>Top keywords</h3>
            <ul className="kw-list">{top.map(([w, n]) => <li key={w}><span>{w}</span><span>{n}</span></li>)}</ul>
          </>
        )}
      </aside>
    </div>
  )
}

/* ---------------- QR code ---------------- */
export function QrGenerator() {
  const [text, setText] = useState('https://example.com')
  const [size, setSize] = useState(512)
  const [fg, setFg] = useState('#111111')
  const [bg, setBg] = useState('#ffffff')
  const [ecl, setEcl] = useState('M')
  const [url, setUrl] = useState('')
  const [svg, setSvg] = useState('')
  useEffect(() => {
    if (!text) { setUrl(''); return }
    import('qrcode').then(async ({ default: QR }) => {
      const opts = { width: size, margin: 2, errorCorrectionLevel: ecl, color: { dark: fg, light: bg } }
      setUrl(await QR.toDataURL(text, opts))
      setSvg(await QR.toString(text, { ...opts, type: 'svg' }))
    }).catch(() => setUrl(''))
  }, [text, size, fg, bg, ecl])
  return (
    <div className="workspace">
      <div className="ws-main center-col">
        {url ? <img className="qr-img" src={url} alt="QR code" /> : <p className="muted">Enter text to generate a QR code</p>}
        {url && (
          <div className="btn-row">
            <a className="btn btn-primary" href={url} download="qrcode.png"><Download size={18} /> PNG</a>
            <button className="btn btn-secondary" onClick={() => downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), 'qrcode.svg')}><Download size={18} /> SVG</button>
          </div>
        )}
      </div>
      <aside className="ws-side">
        <h3>QR code generator</h3>
        <Field label="Text or URL"><textarea className="textarea" rows={4} value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <Field label={`Size: ${size}px`}><input type="range" min={128} max={1024} step={32} value={size} onChange={(e) => setSize(+e.target.value)} /></Field>
        <div className="grid-2">
          <Field label="Foreground"><input className="input color" type="color" value={fg} onChange={(e) => setFg(e.target.value)} /></Field>
          <Field label="Background"><input className="input color" type="color" value={bg} onChange={(e) => setBg(e.target.value)} /></Field>
        </div>
        <Field label="Error correction">
          <Segmented value={ecl} onChange={setEcl} options={['L', 'M', 'Q', 'H'].map((v) => ({ value: v, label: v }))} />
        </Field>
      </aside>
    </div>
  )
}

/* ---------------- Hash generator ---------------- */
export function HashGenerator() {
  const [text, setText] = useState('hello world')
  const [file, setFile] = useState(null)
  const [hashes, setHashes] = useState({})
  useEffect(() => {
    let alive = true
    ;(async () => {
      const data = file ? await file.arrayBuffer() : new TextEncoder().encode(text)
      const out = {}
      for (const algo of ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']) {
        const buf = await crypto.subtle.digest(algo, data)
        out[algo] = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
      }
      if (alive) setHashes(out)
    })()
    return () => { alive = false }
  }, [text, file])
  return (
    <div className="workspace">
      <div className="ws-main">
        <Field label="Text">
          <textarea className="textarea mono" rows={6} value={text} disabled={!!file} onChange={(e) => setText(e.target.value)} />
        </Field>
        <Field label="…or hash a file (never uploaded)">
          <input className="input" type="file" onChange={(e) => setFile(e.target.files[0] || null)} />
        </Field>
        {file && <button className="btn btn-ghost" onClick={() => setFile(null)}>Use text instead</button>}
      </div>
      <aside className="ws-side">
        <h3>Hashes</h3>
        {Object.entries(hashes).map(([k, v]) => (
          <div key={k} className="hash-row">
            <div className="hash-head"><strong>{k}</strong><CopyButton text={v} /></div>
            <code className="hash">{v}</code>
          </div>
        ))}
      </aside>
    </div>
  )
}

/* ---------------- Password generator ---------------- */
function randomInt(max) {
  const a = new Uint32Array(1)
  const limit = Math.floor(0xffffffff / max) * max
  do crypto.getRandomValues(a); while (a[0] >= limit)
  return a[0] % max
}
export function PasswordGenerator() {
  const [len, setLen] = useState(20)
  const [opts, setOpts] = useState({ upper: true, lower: true, digits: true, symbols: true, noAmbiguous: false })
  const [count, setCount] = useState(5)
  const [seed, setSeed] = useState(0)
  const list = useMemo(() => {
    let sets = [opts.upper && 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', opts.lower && 'abcdefghijklmnopqrstuvwxyz', opts.digits && '0123456789', opts.symbols && '!@#$%^&*()-_=+[]{};:,.<>?/~']
      .filter(Boolean)
    if (opts.noAmbiguous) sets = sets.map((s) => s.replace(/[Il1O0o]/g, ''))
    if (!sets.length) return []
    const all = sets.join('')
    return Array.from({ length: count }, () => {
      const chars = sets.map((s) => s[randomInt(s.length)])
      while (chars.length < len) chars.push(all[randomInt(all.length)])
      for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]] }
      return chars.slice(0, len).join('')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [len, opts, count, seed])
  const strength = len >= 16 && Object.values(opts).filter(Boolean).length >= 3 ? 'Very strong' : len >= 12 ? 'Strong' : len >= 8 ? 'Fair' : 'Weak'
  return (
    <div className="workspace">
      <div className="ws-main">
        <ul className="pw-list">
          {list.map((p, i) => <li key={i}><code>{p}</code><CopyButton text={p} /></li>)}
        </ul>
        <button className="btn btn-primary" onClick={() => setSeed(seed + 1)}><RefreshCw size={18} /> Generate new</button>
      </div>
      <aside className="ws-side">
        <h3>Password options</h3>
        <Field label={`Length: ${len}`}><input type="range" min={4} max={128} value={len} onChange={(e) => setLen(+e.target.value)} /></Field>
        <Field label="How many"><input className="input" type="number" min={1} max={50} value={count} onChange={(e) => setCount(Math.max(1, Math.min(50, +e.target.value || 1)))} /></Field>
        {[['upper', 'Uppercase (A-Z)'], ['lower', 'Lowercase (a-z)'], ['digits', 'Numbers (0-9)'], ['symbols', 'Symbols (!@#…)'], ['noAmbiguous', 'Avoid ambiguous (I, l, 1, O, 0)']].map(([k, l]) => (
          <label key={k} className="check"><input type="checkbox" checked={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} /> {l}</label>
        ))}
        <p className="muted small">Strength: <strong>{strength}</strong>. Generated with your browser's cryptographic random generator.</p>
      </aside>
    </div>
  )
}

/* ---------------- UUID ---------------- */
export function UuidGenerator() {
  const [count, setCount] = useState(10)
  const [upper, setUpper] = useState(false)
  const [seed, setSeed] = useState(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ids = useMemo(() => Array.from({ length: count }, () => (upper ? crypto.randomUUID().toUpperCase() : crypto.randomUUID())), [count, upper, seed])
  const text = ids.join('\n')
  return (
    <div className="workspace">
      <div className="ws-main">
        <textarea className="textarea mono tall" readOnly value={text} />
      </div>
      <aside className="ws-side">
        <h3>UUID v4 generator</h3>
        <Field label="How many"><input className="input" type="number" min={1} max={1000} value={count} onChange={(e) => setCount(Math.max(1, Math.min(1000, +e.target.value || 1)))} /></Field>
        <label className="check"><input type="checkbox" checked={upper} onChange={(e) => setUpper(e.target.checked)} /> Uppercase</label>
        <div className="btn-col">
          <button className="btn btn-primary" onClick={() => setSeed(seed + 1)}><RefreshCw size={18} /> Regenerate</button>
          <CopyButton text={text} label="Copy all" />
        </div>
      </aside>
    </div>
  )
}

/* ---------------- Color converter ---------------- */
function parseColor(s) {
  const ctx = document.createElement('canvas').getContext('2d')
  ctx.fillStyle = '#000'
  ctx.fillStyle = s.trim()
  const v = ctx.fillStyle
  if (v.startsWith('#')) return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16), 1]
  const m = v.match(/[\d.]+/g)
  return m ? [+m[0], +m[1], +m[2], m[3] !== undefined ? +m[3] : 1] : null
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h /= 6
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}
export function ColorConverter() {
  const [input, setInput] = useState('#e5322d')
  const c = useMemo(() => parseColor(input), [input])
  const rows = c && (() => {
    const [r, g, b, a] = c
    const hex = '#' + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')
    const [h, s, l] = rgbToHsl(r, g, b)
    const k = 1 - Math.max(r, g, b) / 255
    const cmyk = k === 1 ? [0, 0, 0, 100] : [r, g, b].map((x) => Math.round(((1 - x / 255 - k) / (1 - k)) * 100)).concat(Math.round(k * 100))
    return [
      ['HEX', hex],
      ['RGB', a < 1 ? `rgba(${r}, ${g}, ${b}, ${a})` : `rgb(${r}, ${g}, ${b})`],
      ['HSL', a < 1 ? `hsla(${h}, ${s}%, ${l}%, ${a})` : `hsl(${h}, ${s}%, ${l}%)`],
      ['CMYK', `cmyk(${cmyk.join('%, ')}%)`],
    ]
  })()
  return (
    <div className="workspace">
      <div className="ws-main">
        <div className="color-swatch" style={{ background: c ? input : 'transparent' }} />
        <div className="grid-2">
          <Field label="Any CSS color (hex, rgb, hsl, name)"><input className="input" value={input} onChange={(e) => setInput(e.target.value)} /></Field>
          <Field label="Picker"><input className="input color" type="color" value={rows ? rows[0][1] : '#000000'} onChange={(e) => setInput(e.target.value)} /></Field>
        </div>
      </div>
      <aside className="ws-side">
        <h3>Converted</h3>
        {rows ? rows.map(([k, v]) => (
          <div key={k} className="hash-row"><div className="hash-head"><strong>{k}</strong><CopyButton text={v} /></div><code className="hash">{v}</code></div>
        )) : <p className="warn">Unrecognized color</p>}
      </aside>
    </div>
  )
}

/* ---------------- Timestamp converter ---------------- */
export function TimestampConverter() {
  const [ts, setTs] = useState(String(Math.floor(Date.now() / 1000)))
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 16))
  const d = useMemo(() => {
    const n = Number(ts)
    if (!ts || Number.isNaN(n)) return null
    return new Date(ts.length > 11 ? n : n * 1000)
  }, [ts])
  const fromDate = new Date(date)
  return (
    <div className="workspace">
      <div className="ws-main">
        <h3>Unix timestamp → Date</h3>
        <Field label="Timestamp (seconds or milliseconds)"><input className="input mono" value={ts} onChange={(e) => setTs(e.target.value.trim())} /></Field>
        {d && !isNaN(d) ? (
          <ul className="kv">
            <li><span>Local</span><code>{d.toString()}</code></li>
            <li><span>UTC</span><code>{d.toUTCString()}</code></li>
            <li><span>ISO 8601</span><code>{d.toISOString()}</code></li>
          </ul>
        ) : <p className="warn">Invalid timestamp</p>}
        <h3>Date → Unix timestamp</h3>
        <Field label="Date & time (local)"><input className="input" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        {!isNaN(fromDate) && (
          <ul className="kv">
            <li><span>Seconds</span><code>{Math.floor(fromDate.getTime() / 1000)}</code></li>
            <li><span>Milliseconds</span><code>{fromDate.getTime()}</code></li>
          </ul>
        )}
      </div>
      <aside className="ws-side">
        <h3>Now</h3>
        <button className="btn btn-secondary" onClick={() => { setTs(String(Math.floor(Date.now() / 1000))); setDate(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)) }}>
          <RefreshCw size={16} /> Use current time
        </button>
      </aside>
    </div>
  )
}

/* ---------------- Lorem ipsum ---------------- */
const LOREM = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'.split(' ')
export function LoremIpsum() {
  const [n, setN] = useState(3)
  const [unit, setUnit] = useState('p')
  const [seed, setSeed] = useState(0)
  const text = useMemo(() => {
    const w = () => LOREM[Math.floor(Math.random() * LOREM.length)]
    const sentence = () => {
      const s = Array.from({ length: 8 + Math.floor(Math.random() * 10) }, w).join(' ')
      return s[0].toUpperCase() + s.slice(1) + '.'
    }
    const para = () => Array.from({ length: 4 + Math.floor(Math.random() * 4) }, sentence).join(' ')
    if (unit === 'w') return Array.from({ length: n }, w).join(' ')
    if (unit === 's') return Array.from({ length: n }, sentence).join(' ')
    const ps = Array.from({ length: n }, para)
    ps[0] = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ' + ps[0]
    return ps.join('\n\n')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, unit, seed])
  return (
    <div className="workspace">
      <div className="ws-main"><textarea className="textarea tall" readOnly value={text} /></div>
      <aside className="ws-side">
        <h3>Lorem ipsum</h3>
        <Field label="Amount"><input className="input" type="number" min={1} max={500} value={n} onChange={(e) => setN(Math.max(1, Math.min(500, +e.target.value || 1)))} /></Field>
        <Segmented value={unit} onChange={setUnit} options={[{ value: 'p', label: 'Paragraphs' }, { value: 's', label: 'Sentences' }, { value: 'w', label: 'Words' }]} />
        <div className="btn-col">
          <button className="btn btn-primary" onClick={() => setSeed(seed + 1)}><RefreshCw size={18} /> Regenerate</button>
          <CopyButton text={text} label="Copy text" />
        </div>
      </aside>
    </div>
  )
}
