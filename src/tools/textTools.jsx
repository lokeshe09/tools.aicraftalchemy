import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Download } from 'lucide-react'
import TransformTool from '../components/TransformTool'
import { Field, Segmented, CopyButton, Toggle, Slider, NumberInput, Alert } from '../components/ui'
import { downloadBlob, formatBytes } from '../lib/files'

/* ---------------- JSON formatter ---------------- */
function jsonError(s, e) {
  const m = e.message.match(/position (\d+)/)
  if (!m) return e.message
  const pos = +m[1]
  const before = s.slice(0, pos)
  const line = before.split('\n').length
  const col = pos - before.lastIndexOf('\n')
  return `${e.message.replace(/ in JSON at position \d+.*/, '')} — line ${line}, column ${col}`
}
const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v)

export function JsonFormatter() {
  const [input, setInput] = useState('{"name":"tools.aicraftalchemy","private":true,"features":["pdf","image","media"],"version":2}')
  const [indent, setIndent] = useState(2)
  const [sorted, setSorted] = useState(false)
  const transform = useCallback((s) => {
    let v
    try { v = JSON.parse(s) } catch (e) { throw new Error(jsonError(s, e)) }
    if (sorted) v = sortKeys(v)
    return indent === 0 ? JSON.stringify(v) : JSON.stringify(v, null, indent)
  }, [indent, sorted])
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
      options={
        <div className="row-2">
          <Segmented value={indent} onChange={setIndent} options={[{ value: 2, label: '2 spaces' }, { value: 4, label: '4 spaces' }, { value: '\t', label: 'Tabs' }, { value: 0, label: 'Minify' }]} />
          <Toggle checked={sorted} onChange={setSorted} label="Sort keys" />
        </div>
      }
    />
  )
}

/* ---------------- Base64 ---------------- */
const b64encode = (s, url) => {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  const out = btoa(bin)
  return url ? out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : out
}
const b64decode = (s) => {
  let t = s.replace(/^data:[^,]*,/, '').replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  while (t.length % 4) t += '='
  return new TextDecoder().decode(Uint8Array.from(atob(t), (c) => c.charCodeAt(0)))
}

export function Base64Tool() {
  const [mode, setMode] = useState('encode')
  const [urlSafe, setUrlSafe] = useState(false)
  const [input, setInput] = useState('Hello from tools.aicraftalchemy! 👋')
  const transform = useCallback((s) => {
    if (mode === 'encode') return b64encode(s, urlSafe)
    try { return b64decode(s) } catch { throw new Error('This is not valid Base64.') }
  }, [mode, urlSafe])
  return (
    <TransformTool
      input={input}
      setInput={setInput}
      transform={transform}
      inputLabel={mode === 'encode' ? 'Text' : 'Base64'}
      outputLabel={mode === 'encode' ? 'Base64' : 'Text'}
      onSwap={(out) => { setMode(mode === 'encode' ? 'decode' : 'encode'); setInput(out) }}
      options={
        <div className="row-2">
          <Segmented value={mode} onChange={setMode} options={[{ value: 'encode', label: 'Encode' }, { value: 'decode', label: 'Decode' }]} />
          {mode === 'encode' && <Toggle checked={urlSafe} onChange={setUrlSafe} label="URL-safe" />}
        </div>
      }
    />
  )
}

/* ---------------- URL encode ---------------- */
export function UrlEncoder() {
  const [mode, setMode] = useState('encode')
  const [whole, setWhole] = useState(false)
  const [input, setInput] = useState('https://example.com/search?q=hello world&lang=en')
  const transform = useCallback((s) => {
    if (mode === 'encode') return whole ? encodeURI(s) : encodeURIComponent(s)
    if (mode === 'parse') {
      const u = new URL(s.trim())
      const params = [...u.searchParams.entries()].map(([k, v]) => `  ${k} = ${v}`).join('\n')
      return `Protocol: ${u.protocol}\nHost:     ${u.host}\nPath:     ${decodeURIComponent(u.pathname)}\nHash:     ${u.hash || '—'}\nQuery parameters:\n${params || '  (none)'}`
    }
    try { return decodeURIComponent(s.replace(/\+/g, ' ')) } catch { throw new Error('Malformed URL encoding.') }
  }, [mode, whole])
  return (
    <TransformTool
      input={input}
      setInput={setInput}
      transform={transform}
      onSwap={mode !== 'parse' ? (out) => { setMode(mode === 'encode' ? 'decode' : 'encode'); setInput(out) } : undefined}
      options={
        <div className="row-2">
          <Segmented value={mode} onChange={setMode} options={[{ value: 'encode', label: 'Encode' }, { value: 'decode', label: 'Decode' }, { value: 'parse', label: 'Parse URL' }]} />
          {mode === 'encode' && <Toggle checked={whole} onChange={setWhole} label="Keep URL structure (encodeURI)" />}
        </div>
      }
    />
  )
}

/* ---------------- Markdown → HTML ---------------- */
export function MarkdownToHtml() {
  const [input, setInput] = useState('# Title\n\nSome **bold** and _italic_ text.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nconsole.log("hi")\n```\n')
  const [libs, setLibs] = useState(null)
  const [view, setView] = useState('preview')
  useEffect(() => { Promise.all([import('marked'), import('dompurify')]).then(([m, d]) => setLibs({ marked: m.marked, purify: d.default })) }, [])
  const transform = useCallback((s) => (libs ? libs.marked.parse(s, { async: false, gfm: true }) : ''), [libs])
  const safe = useMemo(() => { try { return libs ? libs.purify.sanitize(transform(input)) : '' } catch { return '' } }, [input, transform, libs])
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
      {view === 'preview' && <div className="md-preview" dangerouslySetInnerHTML={{ __html: safe }} />}
    </TransformTool>
  )
}

/* ---------------- Case converter ---------------- */
const words = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^\p{L}\p{N}]+/u).filter(Boolean)
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
const CASES = {
  upper: ['UPPER CASE', (s) => s.toUpperCase()],
  lower: ['lower case', (s) => s.toLowerCase()],
  title: ['Title Case', (s) => s.toLowerCase().replace(/(^|[\s\-–—(“"'])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())],
  sentence: ['Sentence case', (s) => s.toLowerCase().replace(/(^\s*|[.!?]\s+|\n\s*)(\p{L})/gu, (_, a, b) => a + b.toUpperCase())],
  camel: ['camelCase', (s) => words(s).map((w, i) => (i ? cap(w) : w.toLowerCase())).join('')],
  pascal: ['PascalCase', (s) => words(s).map(cap).join('')],
  snake: ['snake_case', (s) => words(s).map((w) => w.toLowerCase()).join('_')],
  kebab: ['kebab-case', (s) => words(s).map((w) => w.toLowerCase()).join('-')],
  constant: ['CONSTANT_CASE', (s) => words(s).map((w) => w.toUpperCase()).join('_')],
  dot: ['dot.case', (s) => words(s).map((w) => w.toLowerCase()).join('.')],
  alternating: ['aLtErNaTiNg', (s) => [...s].map((c, i) => (i % 2 ? c.toUpperCase() : c.toLowerCase())).join('')],
  inverse: ['iNVERSE', (s) => [...s].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('')],
}
export function CaseConverter() {
  const [input, setInput] = useState('The quick brown fox jumps over the lazy dog')
  const [mode, setMode] = useState('title')
  const transform = useCallback((s) => CASES[mode][1](s), [mode])
  return (
    <TransformTool
      input={input}
      setInput={setInput}
      transform={transform}
      mono={false}
      options={<div className="chip-row center-row">{Object.entries(CASES).map(([k, [l]]) => <button key={k} className={`chip ${mode === k ? 'active' : ''}`} onClick={() => setMode(k)}>{l}</button>)}</div>}
    />
  )
}

/* ---------------- Text cleaner ---------------- */
export function TextCleaner() {
  const [input, setInput] = useState('banana\napple\n\ncherry\napple\n  banana  \n')
  const [o, setO] = useState({ trim: true, empty: true, dedupe: true, sort: 'asc', ci: false, spaces: false, number: false })
  const transform = useCallback((s) => {
    let lines = s.split(/\r?\n/)
    if (o.trim) lines = lines.map((l) => l.trim())
    if (o.spaces) lines = lines.map((l) => l.replace(/\s+/g, ' '))
    if (o.empty) lines = lines.filter((l) => l.trim())
    if (o.dedupe) { const seen = new Set(); lines = lines.filter((l) => { const k = o.ci ? l.toLowerCase() : l; if (seen.has(k)) return false; seen.add(k); return true }) }
    const cmp = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: o.ci ? 'base' : 'variant' })
    if (o.sort === 'asc') lines.sort(cmp)
    if (o.sort === 'desc') lines.sort((a, b) => cmp(b, a))
    if (o.sort === 'reverse') lines.reverse()
    if (o.sort === 'shuffle') for (let i = lines.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [lines[i], lines[j]] = [lines[j], lines[i]] }
    if (o.number) lines = lines.map((l, i) => `${i + 1}. ${l}`)
    return lines.join('\n')
  }, [o])
  const t = (k) => (v) => setO({ ...o, [k]: v })
  return (
    <TransformTool
      input={input}
      setInput={setInput}
      transform={transform}
      mono={false}
      accept=".txt,.csv,.log"
      downloadName="cleaned.txt"
      options={
        <div className="cleaner-opts">
          <Segmented value={o.sort} onChange={t('sort')} options={[{ value: 'none', label: 'Keep order' }, { value: 'asc', label: 'A → Z' }, { value: 'desc', label: 'Z → A' }, { value: 'reverse', label: 'Reverse' }, { value: 'shuffle', label: 'Shuffle' }]} />
          <div className="chip-row">
            <Toggle checked={o.trim} onChange={t('trim')} label="Trim lines" />
            <Toggle checked={o.empty} onChange={t('empty')} label="Remove empty lines" />
            <Toggle checked={o.dedupe} onChange={t('dedupe')} label="Remove duplicates" />
            <Toggle checked={o.ci} onChange={t('ci')} label="Ignore case" />
            <Toggle checked={o.spaces} onChange={t('spaces')} label="Collapse spaces" />
            <Toggle checked={o.number} onChange={t('number')} label="Number lines" />
          </div>
        </div>
      }
    />
  )
}

/* ---------------- Text diff ---------------- */
export function TextDiff() {
  const [a, setA] = useState('The quick brown fox\njumps over the lazy dog.')
  const [b, setB] = useState('The quick red fox\njumped over the lazy dog!')
  const [mode, setMode] = useState('words')
  const [lib, setLib] = useState(null)
  useEffect(() => { import('diff').then(setLib) }, [])
  const parts = useMemo(() => {
    if (!lib) return []
    return mode === 'chars' ? lib.diffChars(a, b) : mode === 'lines' ? lib.diffLines(a, b) : lib.diffWordsWithSpace(a, b)
  }, [lib, a, b, mode])
  const changed = parts.filter((p) => p.added || p.removed).length
  return (
    <div className="transform">
      <div className="transform-options"><Segmented value={mode} onChange={setMode} options={[{ value: 'words', label: 'Words' }, { value: 'chars', label: 'Characters' }, { value: 'lines', label: 'Lines' }]} /></div>
      <div className="transform-panes">
        <div className="pane"><div className="pane-head"><span>Original</span></div><textarea className="textarea pane-text" value={a} onChange={(e) => setA(e.target.value)} /></div>
        <div className="pane"><div className="pane-head"><span>Changed</span></div><textarea className="textarea pane-text" value={b} onChange={(e) => setB(e.target.value)} /></div>
      </div>
      <div className="diff-stats">{changed ? `${changed} change${changed > 1 ? 's' : ''}` : a || b ? 'The texts are identical.' : ''}</div>
      <pre className="diff-view">{parts.map((p, i) => <span key={i} className={p.added ? 'diff-add' : p.removed ? 'diff-del' : ''}>{p.value}</span>)}</pre>
    </div>
  )
}

/* ---------------- Word counter ---------------- */
export function WordCounter() {
  const [text, setText] = useState('')
  const stats = useMemo(() => {
    const w = (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length
    const sentences = (text.match(/[^.!?।]+[.!?।]+(\s|$)/g) || []).length || (text.trim() ? 1 : 0)
    return [
      ['Words', w],
      ['Characters', [...text].length],
      ['Without spaces', [...text.replace(/\s/g, '')].length],
      ['Sentences', sentences],
      ['Paragraphs', text.split(/\n\s*\n/).filter((p) => p.trim()).length],
      ['Lines', text ? text.split('\n').length : 0],
      ['Reading time', `${w ? Math.max(1, Math.round(w / 230)) : 0} min`],
      ['Speaking time', `${w ? Math.max(1, Math.round(w / 140)) : 0} min`],
    ]
  }, [text])
  const top = useMemo(() => {
    const freq = {}
    const stop = new Set(['the', 'and', 'that', 'with', 'this', 'from', 'have', 'were', 'your', 'will', 'they', 'their', 'there', 'about', 'which', 'what', 'when', 'would'])
    text.toLowerCase().match(/[\p{L}\p{N}']+/gu)?.forEach((w) => { if (w.length > 3 && !stop.has(w)) freq[w] = (freq[w] || 0) + 1 })
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10)
  }, [text])
  return (
    <div className="workspace">
      <div className="ws-main">
        <textarea className="textarea tall" placeholder="Start typing or paste your text…" value={text} onChange={(e) => setText(e.target.value)} aria-label="Text to count" />
      </div>
      <aside className="ws-side">
        <div className="stat-grid">{stats.map(([k, v]) => <div key={k} className="stat"><strong>{v}</strong><span>{k}</span></div>)}</div>
        {top.length > 0 && (<><h3>Top keywords</h3><ul className="kw-list">{top.map(([w, n]) => <li key={w}><span>{w}</span><span>{n}</span></li>)}</ul></>)}
      </aside>
    </div>
  )
}

/* ---------------- QR code ---------------- */
function qrPayload(type, d) {
  const esc = (s) => String(s || '').replace(/([\\;,:"])/g, '\\$1')
  switch (type) {
    case 'wifi': return `WIFI:T:${d.enc};S:${esc(d.ssid)};P:${esc(d.pass)};${d.hidden ? 'H:true;' : ''};`
    case 'email': return `mailto:${d.email}?subject=${encodeURIComponent(d.subject || '')}&body=${encodeURIComponent(d.body || '')}`
    case 'phone': return `tel:${d.phone}`
    case 'sms': return `SMSTO:${d.phone}:${d.body || ''}`
    case 'upi': return `upi://pay?pa=${encodeURIComponent(d.vpa || '')}&pn=${encodeURIComponent(d.name || '')}${d.amount ? `&am=${d.amount}` : ''}&cu=INR`
    case 'vcard': return `BEGIN:VCARD\nVERSION:3.0\nN:${d.last || ''};${d.first || ''}\nFN:${`${d.first || ''} ${d.last || ''}`.trim()}\n${d.org ? `ORG:${d.org}\n` : ''}${d.phone ? `TEL:${d.phone}\n` : ''}${d.email ? `EMAIL:${d.email}\n` : ''}${d.url ? `URL:${d.url}\n` : ''}END:VCARD`
    default: return d.text || ''
  }
}
const QR_FIELDS = {
  text: [['text', 'Text or URL', 'textarea']],
  wifi: [['ssid', 'Network name (SSID)'], ['pass', 'Password'], ['enc', 'Security', 'select', ['WPA', 'WEP', 'nopass']]],
  email: [['email', 'Email address'], ['subject', 'Subject'], ['body', 'Message', 'textarea']],
  phone: [['phone', 'Phone number']],
  sms: [['phone', 'Phone number'], ['body', 'Message', 'textarea']],
  upi: [['vpa', 'UPI ID (e.g. name@bank)'], ['name', 'Payee name'], ['amount', 'Amount (optional)']],
  vcard: [['first', 'First name'], ['last', 'Last name'], ['org', 'Company'], ['phone', 'Phone'], ['email', 'Email'], ['url', 'Website']],
}
export function QrGenerator() {
  const [type, setType] = useState('text')
  const [data, setData] = useState({ text: 'https://example.com', enc: 'WPA' })
  const [size, setSize] = useState(512)
  const [fg, setFg] = useState('#111111')
  const [bg, setBg] = useState('#ffffff')
  const [ecl, setEcl] = useState('M')
  const [margin, setMargin] = useState(2)
  const [url, setUrl] = useState('')
  const [svg, setSvg] = useState('')
  const [err, setErr] = useState('')
  const payload = qrPayload(type, data)
  useEffect(() => {
    setErr('')
    if (!payload.trim()) { setUrl(''); setSvg(''); return }
    let alive = true
    import('qrcode').then(async ({ default: QR }) => {
      const opts = { width: size, margin, errorCorrectionLevel: ecl, color: { dark: fg, light: bg } }
      const [u, s] = await Promise.all([QR.toDataURL(payload, opts), QR.toString(payload, { ...opts, type: 'svg' })])
      if (alive) { setUrl(u); setSvg(s) }
    }).catch((e) => alive && setErr(e.message || 'Too much data for a QR code.'))
    return () => { alive = false }
  }, [payload, size, fg, bg, ecl, margin])
  return (
    <div className="workspace">
      <div className="ws-main center-col">
        {err ? <Alert kind="error">{err}</Alert> : url ? <img className="qr-img" src={url} alt="QR code" /> : <p className="muted">Fill in the details to generate a QR code</p>}
        {url && !err && (
          <div className="btn-row">
            <a className="btn btn-primary" href={url} download="qrcode.png"><Download size={18} /> PNG</a>
            <button className="btn btn-soft" onClick={() => downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), 'qrcode.svg')}><Download size={18} /> SVG</button>
          </div>
        )}
      </div>
      <aside className="ws-side">
        <h3>QR code generator</h3>
        <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="text">Text / URL</option><option value="wifi">Wi-Fi network</option><option value="upi">UPI payment</option><option value="vcard">Contact card</option>
          <option value="email">Email</option><option value="phone">Phone call</option><option value="sms">SMS</option>
        </select>
        {QR_FIELDS[type].map(([k, label, kind, opts]) => (
          <Field key={k} label={label}>
            {kind === 'textarea' ? <textarea className="textarea" rows={3} value={data[k] || ''} onChange={(e) => setData({ ...data, [k]: e.target.value })} />
              : kind === 'select' ? <select className="input" value={data[k] || opts[0]} onChange={(e) => setData({ ...data, [k]: e.target.value })}>{opts.map((o) => <option key={o}>{o}</option>)}</select>
                : <input className="input" value={data[k] || ''} onChange={(e) => setData({ ...data, [k]: e.target.value })} />}
          </Field>
        ))}
        <Slider label="Size" suffix="px" min={128} max={2048} step={32} value={size} onChange={setSize} />
        <div className="grid-2">
          <Field label="Foreground"><input className="input color" type="color" value={fg} onChange={(e) => setFg(e.target.value)} /></Field>
          <Field label="Background"><input className="input color" type="color" value={bg} onChange={(e) => setBg(e.target.value)} /></Field>
        </div>
        <Field label="Error correction"><Segmented full value={ecl} onChange={setEcl} options={[{ value: 'L', label: 'Low' }, { value: 'M', label: 'Medium' }, { value: 'Q', label: 'High' }, { value: 'H', label: 'Max' }]} /></Field>
        <Field label="Quiet zone"><NumberInput min={0} max={10} value={margin} onChange={(v) => setMargin(Math.round(v))} /></Field>
      </aside>
    </div>
  )
}

/* ---------------- Hash generator ---------------- */
async function hashAll(source, progress) {
  const [{ default: SparkMD5 }] = await Promise.all([import('spark-md5')])
  const out = {}
  if (source instanceof Blob) {
    // MD5 streamed in chunks; SHA via WebCrypto on the whole buffer.
    const md5 = new SparkMD5.ArrayBuffer()
    const chunk = 4 << 20
    for (let o = 0; o < source.size; o += chunk) {
      md5.append(await source.slice(o, o + chunk).arrayBuffer())
      progress?.(Math.min(100, Math.round(((o + chunk) / source.size) * 100)))
    }
    out.MD5 = md5.end()
    const buf = await source.arrayBuffer()
    for (const a of ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']) out[a] = [...new Uint8Array(await crypto.subtle.digest(a, buf))].map((b) => b.toString(16).padStart(2, '0')).join('')
  } else {
    out.MD5 = SparkMD5.hash(unescape(encodeURIComponent(source)))
    const data = new TextEncoder().encode(source)
    for (const a of ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']) out[a] = [...new Uint8Array(await crypto.subtle.digest(a, data))].map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  return out
}

export function HashGenerator() {
  const [text, setText] = useState('hello world')
  const [file, setFile] = useState(null)
  const [hashes, setHashes] = useState({})
  const [pct, setPct] = useState(null)
  const [compare, setCompare] = useState('')
  const [upper, setUpper] = useState(false)
  useEffect(() => {
    let alive = true
    setPct(file ? 0 : null)
    hashAll(file || text, (p) => alive && setPct(p)).then((h) => { if (alive) { setHashes(h); setPct(null) } })
    return () => { alive = false }
  }, [text, file])
  const cmp = compare.trim().toLowerCase()
  const match = cmp && Object.entries(hashes).find(([, v]) => v === cmp)
  return (
    <div className="workspace">
      <div className="ws-main">
        <Field label="Text"><textarea className="textarea mono" rows={6} value={text} disabled={!!file} onChange={(e) => setText(e.target.value)} /></Field>
        <Field label="…or hash a file (any size, never uploaded)"><input className="input" type="file" onChange={(e) => setFile(e.target.files[0] || null)} /></Field>
        {file && <p className="muted small">{file.name} · {formatBytes(file.size)} <button className="btn btn-ghost btn-sm" onClick={() => setFile(null)}>Use text instead</button></p>}
        <Field label="Compare with a known checksum"><input className="input mono" value={compare} onChange={(e) => setCompare(e.target.value)} placeholder="Paste a hash to verify a download" /></Field>
        {cmp && (match ? <Alert kind="ok">Match — {match[0]} is identical. The file is authentic.</Alert> : <Alert kind="error">No match — the checksum is different.</Alert>)}
      </div>
      <aside className="ws-side">
        <div className="row-2"><h3>Hashes</h3><Toggle checked={upper} onChange={setUpper} label="Uppercase" /></div>
        {pct !== null && <p className="muted small">Hashing… {pct}%</p>}
        {Object.entries(hashes).map(([k, v]) => {
          const val = upper ? v.toUpperCase() : v
          return (
            <div key={k} className="hash-row">
              <div className="hash-head"><strong>{k}</strong><CopyButton text={val} small /></div>
              <code className={`hash ${match?.[0] === k ? 'hit' : ''}`}>{val}</code>
            </div>
          )
        })}
      </aside>
    </div>
  )
}

/* ---------------- Password generator ---------------- */
function randomInt(max) {
  const a = new Uint32Array(1)
  const limit = Math.floor(0x100000000 / max) * max
  do crypto.getRandomValues(a); while (a[0] >= limit)
  return a[0] % max
}
const WORDS = 'able acid aged also area army away baby back ball band bank base bath bear beat been beer bell belt best bird blow blue boat body bomb bond bone book boom born boss both bowl bulk burn bush busy cake call calm came camp card care case cash cast cell chat chip city club coal coat code cold come cook cool cope copy core cost crew crop dark data date dawn days dead deal dear debt deep deny desk dial diet disc disk does done door dose down draw drew drop drug dual duke dust duty each earn ease east easy edge else even ever evil exit face fact fail fair fall farm fast fate fear feed feel feet fell felt file fill film find fine fire firm fish five flat flow food foot ford form fort four free from fuel full fund gain game gate gave gear gene gift girl give glad goal goes gold golf gone good gray grew grey grow gulf hair half hall hand hang hard harm hate have head hear heat held hell help here hero high hill hire hold hole holy home hope host hour huge hung hunt hurt idea inch into iron item jack jane jean john join jump jury just keen keep kent kept kick kill kind king knee knew know lack lady laid lake land lane last late lead left less life lift like line link list live load loan lock logo long look lord lose loss lost love luck made mail main make male many mark mass matt meal mean meat meet menu mere mike mile milk mill mind mine miss mode mood moon more most move much must name navy near neck need news next nice nick nine none nose note okay once only onto open oral over pace pack page paid pain pair palm park part pass past path peak pick pink pipe plan play plot plug plus poll pool poor port post pull pure push race rail rain rank rare rate read real rear rely rent rest rice rich ride ring rise risk road rock role roll roof room root rose rule rush safe said sake sale salt same sand save seat seed seek seem seen self sell send sent ship shop shot show shut sick side sign site size skin slip slow snow soft soil sold sole some song soon sort soul spot star stay step stop such suit sure take tale talk tall tank tape task team tech tell tend term test text than that them then they thin this thus till time tiny told toll tone tony took tool tour town tree trip true tune turn twin type unit upon used user vary vast very vice view vote wage wait wake walk wall want ward warm wash wave ways weak wear week well went were west what when whom wide wife wild will wind wine wing wire wise wish with wood word wore work yard yeah year your zero zone'.split(' ')

export function PasswordGenerator() {
  const [kind, setKind] = useState('random')
  const [len, setLen] = useState(20)
  const [nWords, setNWords] = useState(5)
  const [opts, setOpts] = useState({ upper: true, lower: true, digits: true, symbols: true, noAmbiguous: false })
  const [count, setCount] = useState(6)
  const [seed, setSeed] = useState(0)
  const list = useMemo(() => {
    void seed
    if (kind === 'phrase') return Array.from({ length: count }, () => Array.from({ length: nWords }, () => WORDS[randomInt(WORDS.length)]).map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : w)).join('-') + '-' + randomInt(100))
    let sets = [opts.upper && 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', opts.lower && 'abcdefghijklmnopqrstuvwxyz', opts.digits && '0123456789', opts.symbols && '!@#$%^&*()-_=+[]{};:,.<>?/~'].filter(Boolean)
    if (opts.noAmbiguous) sets = sets.map((s) => s.replace(/[Il1O0o|]/g, ''))
    if (!sets.length) return []
    const all = sets.join('')
    return Array.from({ length: count }, () => {
      const chars = sets.map((s) => s[randomInt(s.length)])
      while (chars.length < len) chars.push(all[randomInt(all.length)])
      for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]] }
      return chars.slice(0, len).join('')
    })
  }, [kind, len, nWords, opts, count, seed])
  const pool = kind === 'phrase' ? WORDS.length : [opts.upper && 26, opts.lower && 26, opts.digits && 10, opts.symbols && 27].filter(Boolean).reduce((a, b) => a + b, 0)
  const bits = Math.round(kind === 'phrase' ? nWords * Math.log2(pool) + Math.log2(100) : len * Math.log2(pool || 1))
  const label = bits >= 100 ? 'Excellent' : bits >= 75 ? 'Strong' : bits >= 50 ? 'Fair' : 'Weak'
  return (
    <div className="workspace">
      <div className="ws-main">
        <ul className="pw-list">{list.map((p, i) => <li key={i}><code>{p}</code><CopyButton text={p} small /></li>)}</ul>
        <button className="btn btn-primary" onClick={() => setSeed(seed + 1)}><RefreshCw size={18} /> Generate new</button>
      </div>
      <aside className="ws-side">
        <h3>Password options</h3>
        <Segmented full value={kind} onChange={setKind} options={[{ value: 'random', label: 'Random' }, { value: 'phrase', label: 'Passphrase' }]} />
        {kind === 'random' ? (
          <>
            <Slider label="Length" min={4} max={128} value={len} onChange={setLen} />
            {[['upper', 'Uppercase A-Z'], ['lower', 'Lowercase a-z'], ['digits', 'Numbers 0-9'], ['symbols', 'Symbols !@#'], ['noAmbiguous', 'Avoid look-alikes (I l 1 O 0)']].map(([k, l]) => (
              <Toggle key={k} checked={opts[k]} onChange={(v) => setOpts({ ...opts, [k]: v })} label={l} />
            ))}
          </>
        ) : <Slider label="Words" min={3} max={12} value={nWords} onChange={setNWords} />}
        <Field label="How many"><NumberInput min={1} max={100} value={count} onChange={(v) => setCount(Math.round(v))} /></Field>
        <div className={`strength ${bits >= 75 ? 'good' : bits >= 50 ? 'mid' : 'bad'}`}><span style={{ width: `${Math.min(100, bits)}%` }} /> {label} · {bits} bits</div>
        <p className="muted small">Generated with your browser's cryptographically secure random generator.</p>
      </aside>
    </div>
  )
}

/* ---------------- UUID ---------------- */
function uuidv7() {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  const ts = BigInt(Date.now())
  for (let i = 0; i < 6; i++) b[i] = Number((ts >> BigInt(8 * (5 - i))) & 0xffn)
  b[6] = (b[6] & 0x0f) | 0x70
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
export function UuidGenerator() {
  const [count, setCount] = useState(10)
  const [ver, setVer] = useState('v4')
  const [upper, setUpper] = useState(false)
  const [braces, setBraces] = useState(false)
  const [hyphens, setHyphens] = useState(true)
  const [seed, setSeed] = useState(0)
  const ids = useMemo(() => {
    void seed
    return Array.from({ length: count }, () => {
      let id = ver === 'v7' ? uuidv7() : crypto.randomUUID()
      if (!hyphens) id = id.replace(/-/g, '')
      if (upper) id = id.toUpperCase()
      return braces ? `{${id}}` : id
    })
  }, [count, ver, upper, braces, hyphens, seed])
  const text = ids.join('\n')
  return (
    <div className="workspace">
      <div className="ws-main"><textarea className="textarea mono tall" readOnly value={text} aria-label="Generated UUIDs" /></div>
      <aside className="ws-side">
        <h3>UUID generator</h3>
        <Segmented full value={ver} onChange={setVer} options={[{ value: 'v4', label: 'v4 (random)' }, { value: 'v7', label: 'v7 (time-ordered)' }]} />
        <Field label="How many"><NumberInput min={1} max={5000} value={count} onChange={(v) => setCount(Math.round(v))} /></Field>
        <Toggle checked={upper} onChange={setUpper} label="Uppercase" />
        <Toggle checked={hyphens} onChange={setHyphens} label="Hyphens" />
        <Toggle checked={braces} onChange={setBraces} label="{Braces}" />
        <div className="btn-col">
          <button className="btn btn-primary" onClick={() => setSeed(seed + 1)}><RefreshCw size={18} /> Regenerate</button>
          <CopyButton text={text} label="Copy all" />
          <button className="btn btn-soft" onClick={() => downloadBlob(new Blob([text], { type: 'text/plain' }), 'uuids.txt')}><Download size={16} /> Download .txt</button>
        </div>
      </aside>
    </div>
  )
}

/* ---------------- Colour converter ---------------- */
function parseColor(s) {
  const ctx = document.createElement('canvas').getContext('2d')
  ctx.fillStyle = '#010203'
  ctx.fillStyle = s.trim()
  const v = ctx.fillStyle
  if (v === '#010203' && !/^#?010203$/i.test(s.trim())) return null
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
const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }

export function ColorConverter() {
  const [input, setInput] = useState('#6d4aff')
  const c = useMemo(() => parseColor(input), [input])
  const rows = useMemo(() => {
    if (!c) return null
    const [r, g, b, a] = c
    const hex = '#' + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')
    const [h, s, l] = rgbToHsl(r, g, b)
    const k = 1 - Math.max(r, g, b) / 255
    const cmyk = k === 1 ? [0, 0, 0, 100] : [r, g, b].map((x) => Math.round(((1 - x / 255 - k) / (1 - k)) * 100)).concat(Math.round(k * 100))
    return [
      ['HEX', a < 1 ? hex + Math.round(a * 255).toString(16).padStart(2, '0') : hex],
      ['RGB', a < 1 ? `rgba(${r}, ${g}, ${b}, ${a})` : `rgb(${r}, ${g}, ${b})`],
      ['HSL', a < 1 ? `hsla(${h}, ${s}%, ${l}%, ${a})` : `hsl(${h}, ${s}%, ${l}%)`],
      ['CMYK', `cmyk(${cmyk.join('%, ')}%)`],
    ]
  }, [c])
  const contrast = c ? [['on white', (1.05) / (lum(c) + 0.05)], ['on black', (lum(c) + 0.05) / 0.05]] : []
  return (
    <div className="workspace">
      <div className="ws-main">
        <div className="color-swatch" style={{ background: c ? input : 'transparent' }} />
        <div className="grid-2">
          <Field label="Any CSS colour (hex, rgb, hsl, name)"><input className="input" value={input} onChange={(e) => setInput(e.target.value)} /></Field>
          <Field label="Picker"><input className="input color" type="color" value={rows ? rows[0][1].slice(0, 7) : '#000000'} onChange={(e) => setInput(e.target.value)} /></Field>
        </div>
        {c && (
          <div className="shades">
            {[-40, -25, -10, 0, 10, 25, 40].map((d) => {
              const [h, s, l] = rgbToHsl(c[0], c[1], c[2])
              const col = `hsl(${h}, ${s}%, ${Math.max(0, Math.min(100, l + d))}%)`
              return <button key={d} className="shade" style={{ background: col }} onClick={() => setInput(col)} title={col} />
            })}
          </div>
        )}
      </div>
      <aside className="ws-side">
        <h3>Converted</h3>
        {rows ? rows.map(([k, v]) => (
          <div key={k} className="hash-row"><div className="hash-head"><strong>{k}</strong><CopyButton text={v} small /></div><code className="hash">{v}</code></div>
        )) : <p className="warn">Unrecognised colour</p>}
        {c && (<><h3>Contrast (WCAG)</h3>{contrast.map(([k, v]) => <p key={k} className="small">{k}: <strong>{v.toFixed(2)}:1</strong> {v >= 7 ? 'AAA' : v >= 4.5 ? 'AA' : v >= 3 ? 'AA large' : 'Fail'}</p>)}</>)}
      </aside>
    </div>
  )
}

/* ---------------- Timestamp converter ---------------- */
const toLocalInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19)
export function TimestampConverter() {
  const [ts, setTs] = useState(String(Math.floor(Date.now() / 1000)))
  const [date, setDate] = useState(() => toLocalInput(new Date()))
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  const d = useMemo(() => {
    const t = ts.trim()
    if (!t) return null
    if (/^-?\d+(\.\d+)?$/.test(t)) { const n = Number(t); return new Date(Math.abs(n) >= 1e11 ? n : n * 1000) }
    const p = new Date(t)
    return isNaN(p) ? null : p
  }, [ts])
  const fromDate = new Date(date)
  const rel = (x) => {
    const s = Math.round((x - now) / 1000)
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
    const abs = Math.abs(s)
    return abs < 60 ? rtf.format(s, 'second') : abs < 3600 ? rtf.format(Math.round(s / 60), 'minute') : abs < 86400 ? rtf.format(Math.round(s / 3600), 'hour') : abs < 2592000 ? rtf.format(Math.round(s / 86400), 'day') : abs < 31536000 ? rtf.format(Math.round(s / 2592000), 'month') : rtf.format(Math.round(s / 31536000), 'year')
  }
  return (
    <div className="workspace">
      <div className="ws-main">
        <h3>Timestamp → date</h3>
        <Field label="Unix timestamp (seconds or milliseconds) or any date string"><input className="input mono" value={ts} onChange={(e) => setTs(e.target.value)} /></Field>
        {d ? (
          <ul className="kv">
            <li><span>Your time zone</span><code>{d.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'long' })}</code></li>
            <li><span>UTC</span><code>{d.toUTCString()}</code></li>
            <li><span>ISO 8601</span><code>{d.toISOString()}</code></li>
            <li><span>Relative</span><code>{rel(d.getTime())}</code></li>
            <li><span>Seconds / ms</span><code>{Math.floor(d.getTime() / 1000)} / {d.getTime()}</code></li>
          </ul>
        ) : <p className="warn">Not a valid timestamp or date</p>}
        <h3>Date → timestamp</h3>
        <Field label="Date & time (your time zone)"><input className="input" type="datetime-local" step="1" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        {!isNaN(fromDate) && (
          <ul className="kv">
            <li><span>Seconds</span><code>{Math.floor(fromDate.getTime() / 1000)}</code></li>
            <li><span>Milliseconds</span><code>{fromDate.getTime()}</code></li>
            <li><span>ISO 8601 (UTC)</span><code>{fromDate.toISOString()}</code></li>
          </ul>
        )}
      </div>
      <aside className="ws-side">
        <h3>Current time</h3>
        <p className="big-num mono">{Math.floor(now / 1000)}</p>
        <CopyButton text={String(Math.floor(now / 1000))} label="Copy" />
        <button className="btn btn-soft" onClick={() => { setTs(String(Math.floor(Date.now() / 1000))); setDate(toLocalInput(new Date())) }}><RefreshCw size={16} /> Use now</button>
        <p className="muted small">Time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
      </aside>
    </div>
  )
}

/* ---------------- JWT decoder ---------------- */
export function JwtDecoder() {
  const [input, setInput] = useState('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE5MTYyMzkwMjJ9.4Adcj3UFYzPUVaVF43FmMab6RlaQD8A9V8wFzzht-KQ')
  const transform = useCallback((s) => {
    const parts = s.trim().split('.')
    if (parts.length < 2) throw new Error('A JWT has three parts separated by dots.')
    const dec = (p) => JSON.parse(b64decode(p))
    let header, payload
    try { header = dec(parts[0]); payload = dec(parts[1]) } catch { throw new Error('This token is not valid Base64URL JSON.') }
    const notes = []
    for (const k of ['iat', 'nbf', 'exp']) if (typeof payload[k] === 'number') notes.push(`${k}: ${new Date(payload[k] * 1000).toLocaleString()}`)
    if (typeof payload.exp === 'number') notes.push(payload.exp * 1000 < Date.now() ? '⚠ Token has EXPIRED' : '✓ Token is not expired')
    return `// HEADER\n${JSON.stringify(header, null, 2)}\n\n// PAYLOAD\n${JSON.stringify(payload, null, 2)}\n\n// TIMES\n${notes.join('\n') || '(none)'}\n\n// The signature is not verified (that needs the secret key).`
  }, [])
  return <TransformTool input={input} setInput={setInput} transform={transform} inputLabel="JWT" outputLabel="Decoded" />
}

/* ---------------- Lorem ipsum ---------------- */
const LOREM = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'.split(' ')
export function LoremIpsum() {
  const [n, setN] = useState(3)
  const [unit, setUnit] = useState('p')
  const [html, setHtml] = useState(false)
  const [seed, setSeed] = useState(0)
  const text = useMemo(() => {
    void seed
    const w = () => LOREM[Math.floor(Math.random() * LOREM.length)]
    const sentence = () => { const s = Array.from({ length: 8 + Math.floor(Math.random() * 10) }, w).join(' '); return s[0].toUpperCase() + s.slice(1) + '.' }
    const para = () => Array.from({ length: 4 + Math.floor(Math.random() * 4) }, sentence).join(' ')
    if (unit === 'w') return Array.from({ length: n }, w).join(' ')
    if (unit === 's') return Array.from({ length: n }, sentence).join(' ')
    const ps = Array.from({ length: n }, para)
    ps[0] = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ' + ps[0]
    return html ? ps.map((p) => `<p>${p}</p>`).join('\n') : ps.join('\n\n')
  }, [n, unit, seed, html])
  return (
    <div className="workspace">
      <div className="ws-main"><textarea className="textarea tall" readOnly value={text} aria-label="Generated text" /></div>
      <aside className="ws-side">
        <h3>Lorem ipsum</h3>
        <Segmented full value={unit} onChange={setUnit} options={[{ value: 'p', label: 'Paragraphs' }, { value: 's', label: 'Sentences' }, { value: 'w', label: 'Words' }]} />
        <Field label="Amount"><NumberInput min={1} max={1000} value={n} onChange={(v) => setN(Math.round(v))} /></Field>
        {unit === 'p' && <Toggle checked={html} onChange={setHtml} label="Wrap in <p> tags" />}
        <div className="btn-col">
          <button className="btn btn-primary" onClick={() => setSeed(seed + 1)}><RefreshCw size={18} /> Regenerate</button>
          <CopyButton text={text} label="Copy text" />
        </div>
      </aside>
    </div>
  )
}
