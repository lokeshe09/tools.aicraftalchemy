import { useState } from 'react'
import FileTool from '../components/FileTool'
import TextInputTool from '../components/TextInputTool'
import { Field, Segmented } from '../components/ui'
import { baseName, fileToImage, readAsDataURL, loadImage, zipBlobs } from '../utils/files'
import { htmlToPdfBlob, escapeHtml } from '../utils/htmlToPdf'

const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792], legal: [612, 1008] }

/* ---------------- Images → PDF ---------------- */
export function ImagesToPdf() {
  const [size, setSize] = useState('a4')
  const [orient, setOrient] = useState('auto')
  const [margin, setMargin] = useState(20)
  const [single, setSingle] = useState(true)

  return (
    <FileTool
      accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.svg"
      multiple
      reorder
      dropLabel="Select images"
      actionLabel="Convert to PDF"
      options={
        <>
          <h3>Image to PDF options</h3>
          <Field label="Page size">
            <Segmented value={size} onChange={setSize} options={[{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }, { value: 'fit', label: 'Fit image' }]} />
          </Field>
          {size !== 'fit' && (
            <Field label="Orientation">
              <Segmented value={orient} onChange={setOrient} options={[{ value: 'auto', label: 'Auto' }, { value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }]} />
            </Field>
          )}
          <Field label="Margin">
            <Segmented value={margin} onChange={setMargin} options={[{ value: 0, label: 'None' }, { value: 20, label: 'Small' }, { value: 50, label: 'Big' }]} />
          </Field>
          <label className="check"><input type="checkbox" checked={single} onChange={(e) => setSingle(e.target.checked)} /> Merge all images into one PDF</label>
        </>
      }
      process={async (files, progress) => {
        const { jsPDF } = await import('jspdf')
        let pdf = null
        const outputs = []
        for (let i = 0; i < files.length; i++) {
          progress(`Image ${i + 1}/${files.length}`)
          const img = await fileToImage(files[i])
          const c = document.createElement('canvas')
          c.width = img.naturalWidth || img.width
          c.height = img.naturalHeight || img.height
          const ctx = c.getContext('2d')
          ctx.fillStyle = '#fff'
          ctx.fillRect(0, 0, c.width, c.height)
          ctx.drawImage(img, 0, 0)
          const data = c.toDataURL('image/jpeg', 0.92)
          const landscapeImg = c.width > c.height
          let pw, ph
          if (size === 'fit') {
            pw = c.width * 0.75 + margin * 2
            ph = c.height * 0.75 + margin * 2
          } else {
            ;[pw, ph] = PAGE_SIZES[size]
            const land = orient === 'landscape' || (orient === 'auto' && landscapeImg)
            if (land) [pw, ph] = [ph, pw]
          }
          const o = pw > ph ? 'landscape' : 'portrait'
          if (!pdf || !single) {
            if (pdf && !single) outputs.push({ name: `${baseName(files[i - 1].name)}.pdf`, blob: pdf.output('blob') })
            pdf = new jsPDF({ unit: 'pt', format: [pw, ph], orientation: o })
          } else pdf.addPage([pw, ph], o)
          const aw = pw - margin * 2
          const ah = ph - margin * 2
          const s = Math.min(aw / c.width, ah / c.height)
          const w = c.width * s
          const h = c.height * s
          pdf.addImage(data, 'JPEG', (pw - w) / 2, (ph - h) / 2, w, h, undefined, 'FAST')
        }
        if (single) return { blob: pdf.output('blob'), name: files.length === 1 ? `${baseName(files[0].name)}.pdf` : 'images.pdf' }
        outputs.push({ name: `${baseName(files[files.length - 1].name)}.pdf`, blob: pdf.output('blob') })
        if (outputs.length === 1) return outputs[0]
        return { blob: await zipBlobs(outputs), name: 'images-pdf.zip' }
      }}
    />
  )
}

/* ---------------- Word → PDF ---------------- */
export function WordToPdf() {
  return (
    <FileTool
      accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      dropLabel="Select WORD file"
      actionLabel="Convert to PDF"
      options={<><h3>Word to PDF</h3><p className="muted">Converts .docx documents including headings, lists, tables and images. Legacy .doc files are not supported — save them as .docx first.</p></>}
      process={async ([file], progress) => {
        progress('Reading document')
        const mammoth = (await import('mammoth')).default
        const { value: html } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })
        progress('Rendering PDF')
        return { blob: await htmlToPdfBlob(html || '<p></p>'), name: `${baseName(file.name)}.pdf` }
      }}
    />
  )
}

/* ---------------- Excel → PDF ---------------- */
export function ExcelToPdf() {
  const [landscape, setLandscape] = useState(true)
  return (
    <FileTool
      accept=".xlsx,.xls,.ods,.csv"
      dropLabel="Select EXCEL file"
      actionLabel="Convert to PDF"
      options={
        <>
          <h3>Excel to PDF</h3>
          <Field label="Orientation">
            <Segmented value={landscape} onChange={setLandscape} options={[{ value: false, label: 'Portrait' }, { value: true, label: 'Landscape' }]} />
          </Field>
          <p className="muted small">Every sheet is included, each with its name as a heading.</p>
        </>
      }
      process={async ([file], progress) => {
        const XLSX = await import('xlsx')
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
        let html = ''
        wb.SheetNames.forEach((n, i) => {
          const table = XLSX.utils.sheet_to_html(wb.Sheets[n], { header: '', footer: '' })
          html += `${i ? '<div style="height:24px"></div>' : ''}<h2>${escapeHtml(n)}</h2>${table.replace(/<\/?html>|<\/?body>|<head>.*?<\/head>/gs, '')}`
        })
        progress('Rendering PDF')
        return { blob: await htmlToPdfBlob(html, { landscape }), name: `${baseName(file.name)}.pdf` }
      }}
    />
  )
}

/* ---------------- PowerPoint → PDF ---------------- */
const EMU_PER_PT = 12700

async function pptxToPdf(file, progress) {
  const [{ default: JSZip }, { jsPDF }] = await Promise.all([import('jszip'), import('jspdf')])
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const parse = (s) => new DOMParser().parseFromString(s, 'application/xml')

  const pres = parse(await zip.file('ppt/presentation.xml').async('string'))
  const sz = pres.getElementsByTagName('p:sldSz')[0]
  const W = sz ? +sz.getAttribute('cx') / EMU_PER_PT : 720
  const H = sz ? +sz.getAttribute('cy') / EMU_PER_PT : 405

  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => +a.match(/(\d+)\.xml/)[1] - +b.match(/(\d+)\.xml/)[1])
  if (!slideFiles.length) throw new Error('No slides found in this presentation.')

  const pdf = new jsPDF({ unit: 'pt', format: [W, H], orientation: W > H ? 'landscape' : 'portrait' })

  for (let s = 0; s < slideFiles.length; s++) {
    progress(`Slide ${s + 1}/${slideFiles.length}`)
    if (s) pdf.addPage([W, H], W > H ? 'landscape' : 'portrait')
    const path = slideFiles[s]
    const xml = parse(await zip.file(path).async('string'))
    const relsPath = path.replace('slides/', 'slides/_rels/') + '.rels'
    const rels = {}
    if (zip.file(relsPath)) {
      const r = parse(await zip.file(relsPath).async('string'))
      for (const el of r.getElementsByTagName('Relationship')) rels[el.getAttribute('Id')] = el.getAttribute('Target')
    }

    const xfrmOf = (el) => {
      const off = el.getElementsByTagName('a:off')[0]
      const ext = el.getElementsByTagName('a:ext')[0]
      if (!off || !ext) return null
      return {
        x: +off.getAttribute('x') / EMU_PER_PT,
        y: +off.getAttribute('y') / EMU_PER_PT,
        w: +ext.getAttribute('cx') / EMU_PER_PT,
        h: +ext.getAttribute('cy') / EMU_PER_PT,
      }
    }

    // Pictures
    for (const pic of xml.getElementsByTagName('p:pic')) {
      const blip = pic.getElementsByTagName('a:blip')[0]
      const id = blip?.getAttribute('r:embed')
      const box = xfrmOf(pic)
      if (!id || !box || !rels[id]) continue
      const target = 'ppt/' + rels[id].replace(/^\.\.\//, '')
      const f = zip.file(target)
      if (!f) continue
      const ext = target.split('.').pop().toLowerCase()
      if (!['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(ext)) continue
      try {
        const blob = await f.async('blob')
        const img = await loadImage(await readAsDataURL(blob))
        const c = document.createElement('canvas')
        c.width = img.width
        c.height = img.height
        c.getContext('2d').drawImage(img, 0, 0)
        pdf.addImage(c.toDataURL('image/png'), 'PNG', box.x, box.y, box.w, box.h, undefined, 'FAST')
      } catch { /* skip unreadable image */ }
    }

    // Text shapes
    let flowY = 40
    for (const sp of xml.getElementsByTagName('p:sp')) {
      const ph = sp.getElementsByTagName('p:ph')[0]
      const phType = ph?.getAttribute('type') || ''
      const isTitle = /title|ctrTitle/i.test(phType)
      const paras = [...sp.getElementsByTagName('a:p')]
        .map((p) => {
          const text = [...p.getElementsByTagName('a:t')].map((t) => t.textContent).join('')
          const rpr = p.getElementsByTagName('a:rPr')[0]
          const szAttr = rpr?.getAttribute('sz')
          const bullet = p.getElementsByTagName('a:buNone').length === 0 && !isTitle && phType !== 'subTitle'
          return { text, size: szAttr ? +szAttr / 100 : isTitle ? 32 : 18, bold: rpr?.getAttribute('b') === '1' || isTitle, bullet: bullet && !!ph }
        })
        .filter((p) => p.text.trim())
      if (!paras.length) continue
      const box = xfrmOf(sp) || { x: 40, y: flowY, w: W - 80, h: H - flowY - 20 }
      let y = box.y + 6
      for (const p of paras) {
        const size = Math.min(p.size, 60)
        pdf.setFont('helvetica', p.bold ? 'bold' : 'normal')
        pdf.setFontSize(size)
        const lines = pdf.splitTextToSize((p.bullet ? '• ' : '') + p.text, Math.max(box.w - 8, 40))
        for (const line of lines) {
          y += size * 1.1
          if (y > H - 4) break
          pdf.text(line, box.x + 4, y)
        }
        y += size * 0.3
      }
      flowY = Math.max(flowY, y + 10)
    }
  }
  return pdf.output('blob')
}

export function PptToPdf() {
  return (
    <FileTool
      accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
      dropLabel="Select POWERPOINT file"
      actionLabel="Convert to PDF"
      options={<><h3>PowerPoint to PDF</h3><p className="muted">Each slide becomes a PDF page with its text and pictures. Complex effects, charts and SmartArt are simplified. Only .pptx is supported.</p></>}
      process={async ([file], progress) => ({ blob: await pptxToPdf(file, progress), name: `${baseName(file.name)}.pdf` })}
    />
  )
}

/* ---------------- HTML → PDF ---------------- */
export function HtmlToPdf() {
  const [html, setHtml] = useState('<h1>Hello from tools</h1>\n<p>Paste or load any <strong>HTML</strong> here and convert it to a PDF.</p>')
  const [landscape, setLandscape] = useState(false)
  return (
    <TextInputTool
      value={html}
      onChange={setHtml}
      mono
      accept=".html,.htm,text/html"
      actionLabel="Convert to PDF"
      placeholder="<h1>My page</h1>"
      options={
        <>
          <h3>HTML to PDF</h3>
          <Field label="Orientation">
            <Segmented value={landscape} onChange={setLandscape} options={[{ value: false, label: 'Portrait' }, { value: true, label: 'Landscape' }]} />
          </Field>
          <p className="muted small">Scripts are not executed. External images must allow cross-origin access.</p>
        </>
      }
      process={async () => {
        const clean = html.replace(/<script[\s\S]*?<\/script>/gi, '')
        return { blob: await htmlToPdfBlob(clean, { landscape }), name: 'page.pdf' }
      }}
    />
  )
}

/* ---------------- Markdown → PDF ---------------- */
export function MarkdownToPdf() {
  const [md, setMd] = useState('# My document\n\nWrite **Markdown** here.\n\n- Lists\n- Tables\n- `code`\n')
  return (
    <TextInputTool
      value={md}
      onChange={setMd}
      mono
      accept=".md,.markdown,.txt"
      actionLabel="Convert to PDF"
      options={<><h3>Markdown to PDF</h3><p className="muted">Supports GitHub-flavoured Markdown: headings, lists, tables, code blocks and links.</p></>}
      process={async () => {
        const { marked } = await import('marked')
        const html = (await marked.parse(md)).replace(/<script[\s\S]*?<\/script>/gi, '')
        return { blob: await htmlToPdfBlob(html), name: 'document.pdf' }
      }}
    />
  )
}

/* ---------------- Text → PDF ---------------- */
export function TextToPdf() {
  const [text, setText] = useState('')
  const [font, setFont] = useState('helvetica')
  const [size, setSize] = useState(12)
  return (
    <TextInputTool
      value={text}
      onChange={setText}
      accept=".txt,text/plain,.csv,.log,.json,.xml,.js,.css"
      actionLabel="Convert to PDF"
      placeholder="Type or paste text here…"
      options={
        <>
          <h3>Text to PDF</h3>
          <Field label="Font">
            <Segmented value={font} onChange={setFont} options={[{ value: 'helvetica', label: 'Sans' }, { value: 'times', label: 'Serif' }, { value: 'courier', label: 'Mono' }]} />
          </Field>
          <Field label="Font size"><input className="input" type="number" min={6} max={48} value={size} onChange={(e) => setSize(+e.target.value || 12)} /></Field>
        </>
      }
      process={async () => {
        // Non-Latin text can't use jsPDF's built-in fonts, so render it through the browser instead.
        if (/[^\u0000-ÿ–-…]/.test(text)) {
          const family = font === 'courier' ? 'Courier New, monospace' : font === 'times' ? 'Times New Roman, serif' : 'Arial, sans-serif'
          const html = `<pre style="font-family:${family};font-size:${size}px;background:none;padding:0;white-space:pre-wrap">${escapeHtml(text)}</pre>`
          return { blob: await htmlToPdfBlob(html), name: 'text.pdf' }
        }
        const { jsPDF } = await import('jspdf')
        const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
        const M = 56
        const W = pdf.internal.pageSize.getWidth() - M * 2
        const H = pdf.internal.pageSize.getHeight()
        pdf.setFont(font, 'normal')
        pdf.setFontSize(size)
        const lines = pdf.splitTextToSize(text.replace(/\t/g, '    '), W)
        let y = M
        for (const line of lines) {
          if (y + size > H - M) { pdf.addPage(); y = M }
          y += size * 1.35
          pdf.text(line, M, y)
        }
        return { blob: pdf.output('blob'), name: 'text.pdf' }
      }}
    />
  )
}
