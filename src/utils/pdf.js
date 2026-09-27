let pdfjsPromise = null

export function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default
      return pdfjs
    })
  }
  return pdfjsPromise
}

export async function openPdfjs(file, password) {
  const pdfjs = await getPdfjs()
  const data = new Uint8Array(await file.arrayBuffer())
  try {
    return await pdfjs.getDocument({ data, password: password || undefined }).promise
  } catch (e) {
    if (e?.name === 'PasswordException') {
      throw new Error(password ? 'Incorrect password.' : 'This PDF is password protected. Use the Unlock PDF tool first.')
    }
    throw new Error(`Could not read "${file.name}". The file may be damaged or not a PDF.`)
  }
}

/**
 * Render every page to a JPEG image and rebuild a PDF with jsPDF (same page sizes).
 * Used by compress, grayscale, unlock, protect and repair.
 */
export async function rasterizePdf(file, { scale = 1.5, quality = 0.75, grayscale = false, password, encryption, progress } = {}) {
  const { jsPDF } = await import('jspdf')
  const doc = await openPdfjs(file, password)
  let pdf = null
  for (let i = 1; i <= doc.numPages; i++) {
    progress?.(`Page ${i}/${doc.numPages}`)
    const { canvas, page } = await renderPage(doc, i, scale)
    if (grayscale) {
      const ctx = canvas.getContext('2d')
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const d = img.data
      for (let k = 0; k < d.length; k += 4) {
        const g = 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2]
        d[k] = d[k + 1] = d[k + 2] = g
      }
      ctx.putImageData(img, 0, 0)
    }
    const vp = page.getViewport({ scale: 1 })
    const w = vp.width
    const h = vp.height
    const orientation = w > h ? 'landscape' : 'portrait'
    if (!pdf) pdf = new jsPDF({ unit: 'pt', format: [w, h], orientation, compress: true, ...(encryption ? { encryption } : {}) })
    else pdf.addPage([w, h], orientation)
    pdf.addImage(canvas.toDataURL('image/jpeg', quality), 'JPEG', 0, 0, w, h, undefined, 'FAST')
    canvas.width = canvas.height = 0
  }
  return pdf.output('blob')
}

export async function renderPage(doc, pageNumber, scale = 1.5, background = '#ffffff') {
  const page = await doc.getPage(pageNumber)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport }).promise
  return { canvas, page, viewport }
}

export async function renderThumbnails(file, maxWidth = 160) {
  const doc = await openPdfjs(file)
  const thumbs = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const vp = page.getViewport({ scale: 1 })
    const scale = maxWidth / vp.width
    const { canvas } = await renderPage(doc, i, scale)
    thumbs.push(canvas.toDataURL('image/jpeg', 0.7))
  }
  return thumbs
}

/** Returns text items of every page grouped into lines ({y, items:[{x,str,width}]}). */
export async function extractLines(file) {
  const doc = await openPdfjs(file)
  const pages = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const lines = []
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue
      const x = item.transform[4]
      const y = item.transform[5]
      const height = Math.abs(item.transform[3]) || item.height || 10
      let line = lines.find((l) => Math.abs(l.y - y) < Math.max(2, height * 0.4))
      if (!line) {
        line = { y, height, items: [] }
        lines.push(line)
      }
      line.items.push({ x, str: item.str, width: item.width })
    }
    lines.sort((a, b) => b.y - a.y)
    lines.forEach((l) => l.items.sort((a, b) => a.x - b.x))
    pages.push(lines)
  }
  return pages
}

export function lineToText(line) {
  let out = ''
  let lastEnd = null
  for (const it of line.items) {
    if (lastEnd !== null && it.x - lastEnd > 1.5 && !out.endsWith(' ') && !it.str.startsWith(' ')) out += ' '
    out += it.str
    lastEnd = it.x + it.width
  }
  return out
}
