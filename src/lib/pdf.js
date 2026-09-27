// pdf.js helpers: rendering, text extraction and rasterisation.
import { getPassword } from './passwords'

let pdfjsPromise = null

export function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default
      return pdfjs
    })
  }
  return pdfjsPromise
}

export class PasswordRequiredError extends Error {
  constructor(file, wrong) {
    super(wrong ? `The password for "${file?.name || 'this PDF'}" is incorrect.` : `"${file?.name || 'This PDF'}" is protected with an open password.`)
    this.name = 'PasswordRequiredError'
    this.file = file
    this.wrong = wrong
  }
}

/** Open with pdf.js. Accepts File/Blob or bytes. Uses a remembered password for the file if any. */
export async function openPdfjs(src, password = getPassword(src)) {
  const pdfjs = await getPdfjs()
  const data = src instanceof Uint8Array ? src.slice() : new Uint8Array(await src.arrayBuffer())
  try {
    return await pdfjs.getDocument({ data, password: password || undefined, isEvalSupported: false }).promise
  } catch (e) {
    if (e?.name === 'PasswordException') throw new PasswordRequiredError(src instanceof Uint8Array ? null : src, !!password)
    throw new Error(`Could not read ${src.name ? `"${src.name}"` : 'the PDF'}. The file may be damaged or not a PDF.`)
  }
}

const MAX_PIXELS = 24e6

/** Render a page to a canvas. `scale` 1 = 72 DPI. Output is always visually upright (rotation applied). */
export async function renderPage(doc, pageNumber, scale = 1.5, background = '#ffffff') {
  const page = await doc.getPage(pageNumber)
  const base = page.getViewport({ scale: 1 })
  const safe = Math.min(scale, Math.sqrt(MAX_PIXELS / (base.width * base.height)))
  const viewport = page.getViewport({ scale: safe })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.floor(viewport.width))
  canvas.height = Math.max(1, Math.floor(viewport.height))
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport, annotationMode: 2 /* ENABLE_FORMS: draw form values */ }).promise
  page.cleanup()
  return { canvas, page, viewport, width: base.width, height: base.height }
}

/** Visual (rotated) page sizes in PDF points. */
export async function getPageSizes(doc) {
  const out = []
  for (let i = 1; i <= doc.numPages; i++) {
    const vp = (await doc.getPage(i)).getViewport({ scale: 1 })
    out.push({ width: vp.width, height: vp.height })
  }
  return out
}

export function toGrayscale(canvas) {
  const ctx = canvas.getContext('2d')
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = img.data
  for (let k = 0; k < d.length; k += 4) {
    const g = 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2]
    d[k] = d[k + 1] = d[k + 2] = g
  }
  ctx.putImageData(img, 0, 0)
}

/**
 * Re-render every page as a JPEG and rebuild the PDF (same page sizes).
 * Used where a raster result is the point (max compression, grayscale, redaction).
 */
export async function rasterizePdf(src, { dpi = 150, quality = 0.75, grayscale = false, password = getPassword(src), progress, pages } = {}) {
  const { jsPDF } = await import('jspdf')
  const doc = await openPdfjs(src, password)
  const list = pages || Array.from({ length: doc.numPages }, (_, i) => i + 1)
  let pdf = null
  for (let n = 0; n < list.length; n++) {
    const i = list[n]
    progress?.(`Rendering page ${n + 1} of ${list.length}`)
    const { canvas, width: vw, height: vh } = await renderPage(doc, i, dpi / 72)
    if (grayscale) toGrayscale(canvas)
    const orientation = vw > vh ? 'landscape' : 'portrait'
    if (!pdf) pdf = new jsPDF({ unit: 'pt', format: [vw, vh], orientation, compress: true })
    else pdf.addPage([vw, vh], orientation)
    pdf.addImage(canvas.toDataURL('image/jpeg', quality), 'JPEG', 0, 0, vw, vh, undefined, 'FAST')
    canvas.width = canvas.height = 0
  }
  await doc.destroy()
  return pdf.output('blob')
}

/** Text of every page grouped into lines: [{ y, height, items:[{x,str,width,fontName}] }]. */
export async function extractLines(src, password = getPassword(src)) {
  const doc = await openPdfjs(src, password)
  const pages = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const lines = []
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue
      const x = item.transform[4]
      const y = item.transform[5]
      const height = Math.hypot(item.transform[2], item.transform[3]) || item.height || 10
      let line = lines.find((l) => Math.abs(l.y - y) < Math.max(2, Math.min(height, l.height) * 0.45))
      if (!line) {
        line = { y, height, items: [] }
        lines.push(line)
      }
      line.height = Math.max(line.height, height)
      const style = content.styles?.[item.fontName]
      line.items.push({ x, str: item.str, width: item.width, fontName: item.fontName, family: style?.fontFamily || '' })
    }
    lines.sort((a, b) => b.y - a.y)
    lines.forEach((l) => l.items.sort((a, b) => a.x - b.x))
    pages.push(lines)
  }
  await doc.destroy()
  return pages
}

export function lineToText(line) {
  let out = ''
  let lastEnd = null
  for (const it of line.items) {
    if (lastEnd !== null && it.x - lastEnd > line.height * 0.18 && !out.endsWith(' ') && !it.str.startsWith(' ')) out += ' '
    out += it.str
    lastEnd = it.x + it.width
  }
  return out
}
