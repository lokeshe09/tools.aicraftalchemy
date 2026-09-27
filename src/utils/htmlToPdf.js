/**
 * Render an HTML string to a multi-page A4 PDF entirely in the browser.
 * The HTML is laid out in an off-screen container, rasterised with html2canvas,
 * and sliced into pages.
 */
export async function htmlToPdfBlob(html, { landscape = false, margin = 36, css = '' } = {}) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])

  const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const contentW = pageW - margin * 2
  const contentH = pageH - margin * 2

  const cssWidth = landscape ? 1040 : 720
  const host = document.createElement('div')
  host.style.cssText = `position:absolute;left:-10000px;top:0;width:${cssWidth}px;background:#fff;color:#111;`
  host.innerHTML = `<style>
    .h2p{font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111;word-wrap:break-word}
    .h2p img{max-width:100%;height:auto}
    .h2p table{border-collapse:collapse;width:100%;font-size:12px}
    .h2p td,.h2p th{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}
    .h2p th{background:#f0f0f0}
    .h2p h1{font-size:26px}.h2p h2{font-size:21px}.h2p h3{font-size:17px}
    .h2p pre{white-space:pre-wrap;background:#f6f6f6;padding:8px;border-radius:4px}
    ${css}
  </style><div class="h2p">${html}</div>`
  document.body.appendChild(host)

  try {
    await Promise.all(
      [...host.querySelectorAll('img')].map((img) =>
        img.complete ? null : new Promise((r) => { img.onload = img.onerror = r })
      )
    )
    // Render page-sized slices one by one so very long documents never exceed canvas limits.
    const cssPerPt = cssWidth / contentW
    const sliceCss = Math.floor(contentH * cssPerPt)
    const totalCss = host.scrollHeight
    for (let offset = 0, first = true; offset < totalCss; offset += sliceCss, first = false) {
      const h = Math.min(sliceCss, totalCss - offset)
      const canvas = await html2canvas(host, {
        scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false,
        y: offset, height: h, width: cssWidth,
      })
      if (!first) pdf.addPage()
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, contentW, h / cssPerPt)
    }
    return pdf.output('blob')
  } finally {
    host.remove()
  }
}

export const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
