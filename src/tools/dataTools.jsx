import { useCallback, useEffect, useState } from 'react'
import FileTool from '../components/FileTool'
import TransformTool from '../components/TransformTool'
import { Field, Segmented } from '../components/ui'
import { baseName, zipBlobs } from '../utils/files'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const SHEETS = '.xlsx,.xls,.ods,.xlsb,.csv'

let XLSXmod = null
function useXlsx() {
  const [X, setX] = useState(XLSXmod)
  useEffect(() => { if (!X) import('xlsx').then((m) => { XLSXmod = m; setX(m) }) }, [X])
  return X
}

/* ---------------- Excel → CSV ---------------- */
export function ExcelToCsv() {
  const [sep, setSep] = useState(',')
  return (
    <FileTool
      accept={SHEETS}
      dropLabel="Select EXCEL file"
      actionLabel="Convert to CSV"
      options={
        <>
          <h3>Excel to CSV</h3>
          <Field label="Delimiter">
            <Segmented value={sep} onChange={setSep} options={[{ value: ',', label: 'Comma' }, { value: ';', label: 'Semicolon' }, { value: '\t', label: 'Tab' }]} />
          </Field>
          <p className="muted small">Workbooks with several sheets produce one CSV per sheet (ZIP).</p>
        </>
      }
      process={async ([file]) => {
        const XLSX = await import('xlsx')
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
        const out = wb.SheetNames.map((n) => ({
          name: wb.SheetNames.length > 1 ? `${baseName(file.name)}-${n}.csv` : `${baseName(file.name)}.csv`,
          blob: new Blob(['﻿' + XLSX.utils.sheet_to_csv(wb.Sheets[n], { FS: sep })], { type: 'text/csv;charset=utf-8' }),
        }))
        return out.length === 1 ? out[0] : { blob: await zipBlobs(out), name: `${baseName(file.name)}-csv.zip` }
      }}
    />
  )
}

/* ---------------- CSV / JSON → Excel ---------------- */
export function CsvToExcel() {
  return (
    <FileTool
      accept=".csv,.tsv,.txt,text/csv"
      multiple
      dropLabel="Select CSV file"
      actionLabel="Convert to EXCEL"
      options={<><h3>CSV to Excel</h3><p className="muted">Each CSV becomes a sheet in a single .xlsx workbook. Delimiters are detected automatically.</p></>}
      process={async (files) => {
        const XLSX = await import('xlsx')
        const wb = XLSX.utils.book_new()
        for (const f of files) {
          const src = XLSX.read(await f.text(), { type: 'string', raw: false })
          const ws = src.Sheets[src.SheetNames[0]]
          let name = baseName(f.name).replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Sheet'
          while (wb.SheetNames.includes(name)) name = name.slice(0, 28) + Math.floor(Math.random() * 99)
          XLSX.utils.book_append_sheet(wb, ws, name)
        }
        const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
        return { blob: new Blob([out], { type: XLSX_MIME }), name: files.length === 1 ? `${baseName(files[0].name)}.xlsx` : 'workbook.xlsx' }
      }}
    />
  )
}

export function JsonToExcel() {
  return (
    <FileTool
      accept=".json,application/json"
      dropLabel="Select JSON file"
      actionLabel="Convert to EXCEL"
      options={<><h3>JSON to Excel</h3><p className="muted">Expects an array of objects. Nested objects are flattened into dotted column names.</p></>}
      process={async ([file]) => {
        const XLSX = await import('xlsx')
        let data
        try { data = JSON.parse(await file.text()) } catch (e) { throw new Error('Invalid JSON: ' + e.message) }
        const rows = toRows(data)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Data')
        const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
        return { blob: new Blob([out], { type: XLSX_MIME }), name: `${baseName(file.name)}.xlsx` }
      }}
    />
  )
}

/* ---------------- Excel → JSON ---------------- */
export function ExcelToJson() {
  return (
    <FileTool
      accept={SHEETS}
      dropLabel="Select EXCEL file"
      actionLabel="Convert to JSON"
      options={<><h3>Excel to JSON</h3><p className="muted">The first row is used as keys. Multiple sheets become an object keyed by sheet name.</p></>}
      process={async ([file]) => {
        const XLSX = await import('xlsx')
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
        const sheets = Object.fromEntries(wb.SheetNames.map((n) => [n, XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: null })]))
        const data = wb.SheetNames.length === 1 ? sheets[wb.SheetNames[0]] : sheets
        return { blob: new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), name: `${baseName(file.name)}.json` }
      }}
    />
  )
}

/* ---------------- CSV ⇄ JSON (live) ---------------- */
function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out)
    else out[key] = Array.isArray(v) ? JSON.stringify(v) : v
  }
  return out
}
function toRows(data) {
  const arr = Array.isArray(data) ? data : [data]
  return arr.map((r) => (r && typeof r === 'object' ? flatten(r) : { value: r }))
}

export function CsvToJson() {
  const X = useXlsx()
  const [input, setInput] = useState('name,age,city\nAlice,30,Paris\nBob,25,"New York"')
  const transform = useCallback(
    (s) => {
      if (!X) return 'Loading…'
      const wb = X.read(s, { type: 'string' })
      return JSON.stringify(X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }), null, 2)
    },
    [X]
  )
  return <TransformTool input={input} setInput={setInput} transform={transform} inputLabel="CSV" outputLabel="JSON" accept=".csv,.tsv,.txt" downloadName="data.json" downloadType="application/json" />
}

export function JsonToCsv() {
  const X = useXlsx()
  const [input, setInput] = useState('[\n  { "name": "Alice", "age": 30, "address": { "city": "Paris" } },\n  { "name": "Bob", "age": 25, "address": { "city": "New York" } }\n]')
  const transform = useCallback(
    (s) => {
      if (!X) return 'Loading…'
      return X.utils.sheet_to_csv(X.utils.json_to_sheet(toRows(JSON.parse(s))))
    },
    [X]
  )
  return <TransformTool input={input} setInput={setInput} transform={transform} inputLabel="JSON" outputLabel="CSV" accept=".json" downloadName="data.csv" downloadType="text/csv" />
}

/* ---------------- Word → Text / HTML ---------------- */
export function WordToText() {
  return (
    <FileTool
      accept=".docx"
      dropLabel="Select WORD file"
      actionLabel="Extract text"
      options={<><h3>Word to Text</h3><p className="muted">Extracts plain text from a .docx document.</p></>}
      process={async ([file]) => {
        const mammoth = (await import('mammoth')).default
        const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
        return { blob: new Blob([value], { type: 'text/plain;charset=utf-8' }), name: `${baseName(file.name)}.txt` }
      }}
    />
  )
}

export function WordToHtml() {
  return (
    <FileTool
      accept=".docx"
      dropLabel="Select WORD file"
      actionLabel="Convert to HTML"
      options={<><h3>Word to HTML</h3><p className="muted">Creates clean, semantic HTML with images embedded.</p></>}
      process={async ([file]) => {
        const mammoth = (await import('mammoth')).default
        const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })
        const html = `<!doctype html>\n<html><head><meta charset="utf-8"><title>${baseName(file.name)}</title></head>\n<body>\n${value}\n</body></html>`
        return { blob: new Blob([html], { type: 'text/html' }), name: `${baseName(file.name)}.html` }
      }}
    />
  )
}

/* ---------------- Text → Word ---------------- */
export function TextToWord() {
  return (
    <FileTool
      accept=".txt,.md,text/plain"
      dropLabel="Select text file"
      actionLabel="Convert to WORD"
      options={<><h3>Text to Word</h3><p className="muted">Each line of your text file becomes a paragraph in a .docx document.</p></>}
      process={async ([file]) => {
        const { Document, Packer, Paragraph } = await import('docx')
        const lines = (await file.text()).split(/\r?\n/)
        const doc = new Document({ sections: [{ children: lines.map((l) => new Paragraph({ text: l })) }] })
        return { blob: await Packer.toBlob(doc), name: `${baseName(file.name)}.docx` }
      }}
    />
  )
}
