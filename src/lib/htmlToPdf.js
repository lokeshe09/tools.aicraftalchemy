const BASE_CSS = `
  .h2p{font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111;word-wrap:break-word;overflow-wrap:anywhere}
  .h2p img{max-width:100%;height:auto}
  .h2p table{border-collapse:collapse;width:100%;font-size:12px;margin:8px 0}
  .h2p td,.h2p th{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}
  .h2p th{background:#f0f0f0}
  .h2p h1{font-size:26px}.h2p h2{font-size:21px}.h2p h3{font-size:17px}
  .h2p pre{white-space:pre-wrap;background:#f6f6f6;padding:8px;border-radius:4px}
  .h2p code{font-family:Consolas,monospace}
  .h2p blockquote{border-left:3px solid #ccc;margin:8px 0;padding-left:12px;color:#444}
`

const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792], legal: [612, 1008], a3: [841.89, 1190.55], a5: [419.53, 595.28] }

function mountHtml(html, cssWidth, css) {
  const host = document.createElement('div')
  host.style.cssText = `position:absolute;left:-20000px;top:0;width:${cssWidth}px;background:#fff;color:#111;`
  host.innerHTML = `<style>${BASE_CSS}${css}</style><div class="h2p">${html}</div>`
  document.body.appendChild(host)
  return host
}

async function waitForImages(host) {
  await Promise.all(
    [...host.querySelectorAll('img')].map((img) =>
      img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; setTimeout(r, 8000) })
    )
  )
  if (document.fonts?.ready) await document.fonts.ready
}

/** Candidate page-break positions: the tops of block-level things, so lines are never cut in half. */
function breakCandidates(host) {
  const top = host.getBoundingClientRect().top
  const ys = new Set()
  host.querySelectorAll('p,li,tr,h1,h2,h3,h4,h5,h6,img,pre,blockquote,table,hr,dt,dd,figure,.h2p > div,.h2p > *').forEach((el) => {
    const r = el.getBoundingClientRect()
    if (r.height > 0) ys.add(Math.round(r.top - top))
  })
  // Line boxes inside long paragraphs / pre blocks.
  host.querySelectorAll('p,pre,li,td').forEach((el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    for (const r of range.getClientRects()) ys.add(Math.round(r.top - top))
  })
  return [...ys].sort((a, b) => a - b)
}

/**
 * Render HTML to a multi-page PDF entirely in the browser.
 * Pages are cut at element / line boundaries so text is never sliced through.
 */
export async function htmlToPdfBlob(html, { landscape = false, margin = 36, css = '', pageSize = 'a4', progress, autoWidth = false } = {}) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
  let [pw, ph] = PAGE_SIZES[pageSize] || PAGE_SIZES.a4
  if (landscape) [pw, ph] = [ph, pw]
  const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: [pw, ph] })
  const contentW = pw - margin * 2
  const contentH = ph - margin * 2
  let cssWidth = Math.round(contentW * (96 / 72))
  const host = mountHtml(html, cssWidth, css)
  try {
    await waitForImages(host)
    if (autoWidth) {
      // Wide content (e.g. spreadsheets): lay out at its natural width and scale the result down to the page.
      const inner = host.querySelector('.h2p')
      inner.style.width = 'max-content'
      inner.style.minWidth = `${cssWidth}px`
      const need = Math.ceil(inner.scrollWidth)
      inner.style.width = ''
      if (need > cssWidth) {
        cssWidth = need
        host.style.width = `${need}px`
      }
    }
    const cssPerPt = cssWidth / contentW
    const pageCss = Math.floor(contentH * cssPerPt)
    const total = Math.max(1, host.scrollHeight)
    const cands = breakCandidates(host)
    let offset = 0
    let page = 0
    while (offset < total - 1) {
      let end = Math.min(total, offset + pageCss)
      if (end < total) {
        const good = cands.filter((y) => y > offset + pageCss * 0.5 && y <= offset + pageCss)
        if (good.length) end = good[good.length - 1]
      }
      const h = Math.max(1, end - offset)
      progress?.(`Rendering page ${page + 1}`)
      const canvas = await html2canvas(host, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false, y: offset, height: h, width: cssWidth, windowWidth: cssWidth + 40 })
      if (page > 0) pdf.addPage([pw, ph], landscape ? 'landscape' : 'portrait')
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, contentW, h / cssPerPt, undefined, 'FAST')
      canvas.width = canvas.height = 0
      offset = end
      page++
    }
    return pdf.output('blob')
  } finally {
    host.remove()
  }
}

/**
 * Open the browser's print dialog for the HTML — "Save as PDF" there gives a vector PDF with
 * selectable text and perfect fonts.
 */
export function printHtml(html, { title = 'document', landscape = false, css = '' } = {}) {
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  doc.open()
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    @page{size:${landscape ? 'A4 landscape' : 'A4'};margin:16mm}
    body{margin:0}${BASE_CSS}${css}
    .h2p tr,.h2p img,.h2p pre{break-inside:avoid}
  </style></head><body><div class="h2p">${html}</div></body></html>`)
  doc.close()
  const go = () => {
    frame.contentWindow.focus()
    frame.contentWindow.print()
    setTimeout(() => frame.remove(), 60000)
  }
  if (doc.readyState === 'complete') setTimeout(go, 300)
  else frame.onload = () => setTimeout(go, 300)
}

export const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/** Remove scripts / event handlers from untrusted HTML. */
export async function sanitizeHtml(html) {
  const { default: DOMPurify } = await import('dompurify')
  return DOMPurify.sanitize(html, { WHOLE_DOCUMENT: false, ADD_TAGS: ['style'], FORBID_TAGS: ['script', 'iframe', 'object', 'embed'] })
}

export { PAGE_SIZES }
