import { useCallback, useEffect, useState } from 'react'
import FileTool from '../components/FileTool'
import TransformTool from '../components/TransformTool'
import { Field, Segmented, Toggle } from '../components/ui'
import { baseName, oneOrZip, MIME } from '../lib/files'

const SHEETS = '.xlsx,.xls,.xlsm,.xlsb,.ods,.csv'
const DELIMS = [{ value: ',', label: 'Comma' }, { value: ';', label: 'Semicolon' }, { value: '\t', label: 'Tab' }, { value: '|', label: 'Pipe' }]

// Lazily loaded libraries shared by the live converters.
function useLib(loader) {
  const [lib, setLib] = useState(null)
  useEffect(() => { let alive = true; loader().then((m) => alive && setLib(() => m)); return () => { alive = false } }, [loader])
  return lib
}
const loadXlsx = () => import('xlsx')
const loadYaml = () => import('js-yaml')
const loadXml = () => import('fast-xml-parser')

/** Decode text files that may be UTF-8, UTF-16 (with BOM) or Windows-1252. */
async function readTextSmart(file) {
  const buf = new Uint8Array(await file.arrayBuffer())
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf)
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf)
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf) } catch { return new TextDecoder('windows-1252').decode(buf) }
}

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) flatten(v, key, out)
    else out[key] = Array.isArray(v) ? JSON.stringify(v) : v
  }
  return out
}
function toRows(data) {
  let arr = data
  if (!Array.isArray(arr) && arr && typeof arr === 'object') {
    // { "items": [...] } → use the first array property
    const firstArray = Object.values(arr).find(Array.isArray)
    arr = firstArray || [arr]
  }
  if (!Array.isArray(arr)) arr = [arr]
  return arr.map((r) => (r && typeof r === 'object' ? flatten(r) : { value: r }))
}

/* ---------------- Excel → CSV ---------------- */
export function ExcelToCsv() {
  const [sep, setSep] = useState(',')
  const [bom, setBom] = useState(true)
  return (
    <FileTool
      accept={SHEETS}
      formats="XLSX, XLS, XLSM, XLSB, ODS"
      actionLabel="Convert to CSV"
      options={
        <>
          <h3>Excel to CSV</h3>
          <Field label="Delimiter"><Segmented full value={sep} onChange={setSep} options={DELIMS} /></Field>
          <Toggle checked={bom} onChange={setBom} label="UTF-8 with BOM" hint="Makes Excel open accents and non-English text correctly." />
          <p className="muted small">Workbooks with several sheets produce one CSV per sheet (ZIP).</p>
        </>
      }
      process={async ([file]) => {
        const XLSX = await import('xlsx')
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
        const out = wb.SheetNames.map((n) => ({
          name: wb.SheetNames.length > 1 ? `${baseName(file.name)}-${n}.csv` : `${baseName(file.name)}.csv`,
          blob: new Blob([(bom ? '﻿' : '') + XLSX.utils.sheet_to_csv(wb.Sheets[n], { FS: sep, dateNF: 'yyyy-mm-dd' })], { type: 'text/csv;charset=utf-8' }),
        }))
        return oneOrZip(out, `${baseName(file.name)}-csv.zip`)
      }}
    />
  )
}

/* ---------------- CSV → Excel ---------------- */
export function CsvToExcel() {
  const [sep, setSep] = useState('auto')
  return (
    <FileTool
      accept=".csv,.tsv,.txt,text/csv"
      multiple
      actionLabel="Convert to EXCEL"
      options={
        <>
          <h3>CSV to Excel</h3>
          <Field label="Delimiter"><Segmented full value={sep} onChange={setSep} options={[{ value: 'auto', label: 'Auto' }, ...DELIMS]} /></Field>
          <p className="muted small">Each CSV becomes a sheet in one .xlsx workbook. Numbers and dates are detected automatically; UTF-8, UTF-16 and Windows encodings are supported.</p>
        </>
      }
      process={async (files) => {
        const XLSX = await import('xlsx')
        const wb = XLSX.utils.book_new()
        for (const f of files) {
          const text = await readTextSmart(f)
          const opts = { type: 'string', raw: false, cellDates: true }
          if (sep !== 'auto') opts.FS = sep
          else if (/\.tsv$/i.test(f.name)) opts.FS = '\t'
          const src = XLSX.read(text.replace(/^﻿/, ''), opts)
          const ws = src.Sheets[src.SheetNames[0]]
          let name = baseName(f.name).replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Sheet'
          let n = 2
          while (wb.SheetNames.includes(name)) name = `${name.slice(0, 27)} (${n++})`
          XLSX.utils.book_append_sheet(wb, ws, name)
        }
        const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
        return { blob: new Blob([out], { type: MIME.xlsx }), name: files.length === 1 ? `${baseName(files[0].name)}.xlsx` : 'workbook.xlsx' }
      }}
    />
  )
}

/* ---------------- JSON → Excel ---------------- */
export function JsonToExcel() {
  return (
    <FileTool
      accept=".json,application/json"
      actionLabel="Convert to EXCEL"
      options={<><h3>JSON to Excel</h3><p className="muted small">Works with an array of objects (or an object containing one). Nested objects become dotted column names like <code>address.city</code>.</p></>}
      process={async ([file]) => {
        const XLSX = await import('xlsx')
        let data
        try { data = JSON.parse(await readTextSmart(file)) } catch (e) { throw new Error('Invalid JSON: ' + e.message) }
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toRows(data)), 'Data')
        const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
        return { blob: new Blob([out], { type: MIME.xlsx }), name: `${baseName(file.name)}.xlsx` }
      }}
    />
  )
}

/* ---------------- Excel → JSON ---------------- */
export function ExcelToJson() {
  const [header, setHeader] = useState(true)
  return (
    <FileTool
      accept={SHEETS}
      actionLabel="Convert to JSON"
      options={
        <>
          <h3>Excel to JSON</h3>
          <Toggle checked={header} onChange={setHeader} label="First row contains column names" />
          <p className="muted small">Multiple sheets become an object keyed by sheet name.</p>
        </>
      }
      process={async ([file]) => {
        const XLSX = await import('xlsx')
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
        const sheets = Object.fromEntries(wb.SheetNames.map((n) => [n, XLSX.utils.sheet_to_json(wb.Sheets[n], header ? { defval: null } : { header: 1, defval: null })]))
        const data = wb.SheetNames.length === 1 ? sheets[wb.SheetNames[0]] : sheets
        return { blob: new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), name: `${baseName(file.name)}.json` }
      }}
    />
  )
}

/* ---------------- Excel → HTML table ---------------- */
export function ExcelToHtml() {
  return (
    <FileTool
      accept={SHEETS}
      actionLabel="Convert to HTML"
      options={<><h3>Excel to HTML</h3><p className="muted small">Creates a web page with every sheet as a styled HTML table.</p></>}
      process={async ([file]) => {
        const XLSX = await import('xlsx')
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
        const body = wb.SheetNames.map((n) => `<h2>${n.replace(/</g, '&lt;')}</h2>\n${XLSX.utils.sheet_to_html(wb.Sheets[n], { header: '', footer: '' })}`).join('\n')
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>${baseName(file.name)}</title><style>body{font-family:system-ui,sans-serif;margin:24px}table{border-collapse:collapse;margin-bottom:32px}td,th{border:1px solid #ccc;padding:4px 8px}tr:nth-child(even){background:#f7f7f7}</style></head><body>\n${body}\n</body></html>`
        return { blob: new Blob([html], { type: 'text/html' }), name: `${baseName(file.name)}.html` }
      }}
    />
  )
}

/* ---------------- Live converters ---------------- */
export function CsvToJson() {
  const X = useLib(loadXlsx)
  const [input, setInput] = useState('name,age,city\nAlice,30,Paris\nBob,25,"New York"')
  const [typed, setTyped] = useState(true)
  const transform = useCallback((s) => {
    if (!X) return ''
    const wb = X.read(s, { type: 'string', raw: !typed })
    return JSON.stringify(X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: typed }), null, 2)
  }, [X, typed])
  return <TransformTool input={input} setInput={setInput} transform={transform} inputLabel="CSV" outputLabel="JSON" accept=".csv,.tsv,.txt" downloadName="data.json" downloadType="application/json" options={<Toggle checked={typed} onChange={setTyped} label="Detect numbers & booleans" />} />
}

export function JsonToCsv() {
  const X = useLib(loadXlsx)
  const [input, setInput] = useState('[\n  { "name": "Alice", "age": 30, "address": { "city": "Paris" } },\n  { "name": "Bob", "age": 25, "address": { "city": "New York" } }\n]')
  const [sep, setSep] = useState(',')
  const transform = useCallback((s) => (X ? X.utils.sheet_to_csv(X.utils.json_to_sheet(toRows(JSON.parse(s))), { FS: sep }) : ''), [X, sep])
  return <TransformTool input={input} setInput={setInput} transform={transform} inputLabel="JSON" outputLabel="CSV" accept=".json" downloadName="data.csv" downloadType="text/csv" options={<Segmented value={sep} onChange={setSep} options={DELIMS} />} />
}

export function JsonToXml() {
  const P = useLib(loadXml)
  const [input, setInput] = useState('{\n  "note": {\n    "to": "Tove",\n    "from": "Jani",\n    "body": "Don\'t forget me this weekend!"\n  }\n}')
  const transform = useCallback((s) => {
    if (!P) return ''
    let data = JSON.parse(s)
    if (Array.isArray(data) || typeof data !== 'object' || Object.keys(data).length !== 1) data = { root: Array.isArray(data) ? { item: data } : data }
    const b = new P.XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', format: true, indentBy: '  ', suppressEmptyNode: true })
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + b.build(data)
  }, [P])
  return <TransformTool input={input} setInput={setInput} transform={transform} inputLabel="JSON" outputLabel="XML" accept=".json" downloadName="data.xml" downloadType="application/xml" />
}

export function XmlToJson() {
  const P = useLib(loadXml)
  const [input, setInput] = useState('<?xml version="1.0"?>\n<note priority="high">\n  <to>Tove</to>\n  <from>Jani</from>\n  <body>Don\'t forget me this weekend!</body>\n</note>')
  const [attrs, setAttrs] = useState(true)
  const transform = useCallback((s) => {
    if (!P) return ''
    const valid = P.XMLValidator.validate(s)
    if (valid !== true) throw new Error(`Invalid XML (line ${valid.err.line}): ${valid.err.msg}`)
    const parser = new P.XMLParser({ ignoreAttributes: !attrs, attributeNamePrefix: '@_', parseAttributeValue: true, trimValues: true })
    return JSON.stringify(parser.parse(s), null, 2)
  }, [P, attrs])
  return <TransformTool input={input} setInput={setInput} transform={transform} inputLabel="XML" outputLabel="JSON" accept=".xml,text/xml" downloadName="data.json" downloadType="application/json" options={<Toggle checked={attrs} onChange={setAttrs} label="Include attributes (@_name)" />} />
}

export function YamlJson() {
  const Y = useLib(loadYaml)
  const [mode, setMode] = useState('y2j')
  const [input, setInput] = useState('name: tools.aicraftalchemy\nprivate: true\nfeatures:\n  - pdf\n  - images\n  - media\n')
  const transform = useCallback((s) => {
    if (!Y) return ''
    return mode === 'y2j' ? JSON.stringify(Y.load(s), null, 2) : Y.dump(JSON.parse(s), { lineWidth: 120 })
  }, [Y, mode])
  return (
    <TransformTool
      input={input}
      setInput={setInput}
      transform={transform}
      inputLabel={mode === 'y2j' ? 'YAML' : 'JSON'}
      outputLabel={mode === 'y2j' ? 'JSON' : 'YAML'}
      accept=".yaml,.yml,.json"
      downloadName={mode === 'y2j' ? 'data.json' : 'data.yaml'}
      onSwap={(out) => { setMode(mode === 'y2j' ? 'j2y' : 'y2j'); setInput(out) }}
      options={<Segmented value={mode} onChange={setMode} options={[{ value: 'y2j', label: 'YAML → JSON' }, { value: 'j2y', label: 'JSON → YAML' }]} />}
    />
  )
}

export function HtmlToMarkdown() {
  const [T, setT] = useState(null)
  useEffect(() => { import('turndown').then((m) => setT(() => m.default)) }, [])
  const [input, setInput] = useState('<h1>Title</h1>\n<p>Some <strong>bold</strong> and <em>italic</em> text with a <a href="https://example.com">link</a>.</p>\n<ul><li>One</li><li>Two</li></ul>')
  const transform = useCallback((s) => (T ? new T({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' }).turndown(s) : ''), [T])
  return <TransformTool input={input} setInput={setInput} transform={transform} inputLabel="HTML" outputLabel="Markdown" accept=".html,.htm" downloadName="document.md" downloadType="text/markdown" />
}

/* ---------------- Word → Text / HTML / Markdown ---------------- */
export function WordToText() {
  return (
    <FileTool
      accept=".docx"
      actionLabel="Extract text"
      options={<><h3>Word to Text</h3><p className="muted small">Extracts plain text from a .docx document.</p></>}
      process={async ([file]) => {
        const mammoth = (await import('mammoth')).default
        const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
        return { blob: new Blob([value], { type: 'text/plain;charset=utf-8' }), name: `${baseName(file.name)}.txt` }
      }}
    />
  )
}

export function WordToHtml({ markdown = false }) {
  return (
    <FileTool
      accept=".docx"
      actionLabel={markdown ? 'Convert to Markdown' : 'Convert to HTML'}
      options={<><h3>Word to {markdown ? 'Markdown' : 'HTML'}</h3><p className="muted small">{markdown ? 'Headings, lists, links, bold and italics are kept as Markdown.' : 'Creates clean, semantic HTML with images embedded.'}</p></>}
      process={async ([file]) => {
        const mammoth = (await import('mammoth')).default
        const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })
        if (markdown) {
          const { default: Turndown } = await import('turndown')
          const md = new Turndown({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' }).turndown(value)
          return { blob: new Blob([md], { type: 'text/markdown;charset=utf-8' }), name: `${baseName(file.name)}.md` }
        }
        const html = `<!doctype html>\n<html><head><meta charset="utf-8"><title>${baseName(file.name)}</title></head>\n<body>\n${value}\n</body></html>`
        return { blob: new Blob([html], { type: 'text/html' }), name: `${baseName(file.name)}.html` }
      }}
    />
  )
}
export const WordToMarkdown = () => <WordToHtml markdown />

/* ---------------- Text / Markdown → Word ---------------- */
export function TextToWord() {
  const [font, setFont] = useState('Calibri')
  const [size, setSize] = useState(11)
  return (
    <FileTool
      accept=".txt,.md,.markdown,text/plain"
      actionLabel="Convert to WORD"
      options={
        <>
          <h3>Text / Markdown to Word</h3>
          <p className="muted small">Plain text becomes paragraphs. Markdown headings (#), bullet lists (-) and **bold** are converted to real Word formatting.</p>
          <Field label="Font"><Segmented full value={font} onChange={setFont} options={['Calibri', 'Arial', 'Times New Roman', 'Consolas'].map((f) => ({ value: f, label: f.split(' ')[0] }))} /></Field>
          <Field label="Size"><Segmented full value={size} onChange={setSize} options={[10, 11, 12, 14].map((s) => ({ value: s, label: `${s} pt` }))} /></Field>
        </>
      }
      process={async ([file]) => {
        const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx')
        const lines = (await readTextSmart(file)).split(/\r?\n/)
        const runs = (t) => t.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/).filter(Boolean).map((part) =>
          part.startsWith('**') ? new TextRun({ text: part.slice(2, -2), bold: true }) : part.startsWith('*') && part.length > 2 ? new TextRun({ text: part.slice(1, -1), italics: true }) : new TextRun(part))
        const children = lines.map((l) => {
          const h = l.match(/^(#{1,6})\s+(.*)/)
          if (h) return new Paragraph({ heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6][h[1].length - 1], children: runs(h[2]) })
          const b = l.match(/^\s*[-*+]\s+(.*)/)
          if (b) return new Paragraph({ bullet: { level: 0 }, children: runs(b[1]) })
          return new Paragraph({ children: runs(l) })
        })
        const doc = new Document({ styles: { default: { document: { run: { font, size: size * 2 } } } }, sections: [{ children }] })
        return { blob: await Packer.toBlob(doc), name: `${baseName(file.name)}.docx` }
      }}
    />
  )
}
