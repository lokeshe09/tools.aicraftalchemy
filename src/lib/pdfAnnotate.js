// Draw editor elements (text, images, shapes, marks) onto a pdf-lib document.
// Element coordinates are fractions of the page as displayed (top-left origin, rotation applied).
import { getPdfLib, pageFrame, hexToRgb01, isWinAnsi, textToPng } from './pdfDoc'

export const FONT_CSS = {
  helvetica: 'Helvetica, Arial, sans-serif',
  times: '"Times New Roman", Times, serif',
  courier: '"Courier New", Courier, monospace',
}
// Baseline position inside a CSS line box of line-height 1.2, as a fraction of font size.
const BASELINE = { helvetica: 0.945, times: 0.937, courier: 0.866 }
export const LINE_HEIGHT = 1.2

let measureCtx = null
/** Size of a text block in points (1 pt of font size == 1 unit). */
export function measureText(text, { size = 16, font = 'helvetica', bold = false, italic = false } = {}) {
  measureCtx ||= document.createElement('canvas').getContext('2d')
  measureCtx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px ${FONT_CSS[font] || FONT_CSS.helvetica}`
  const lines = String(text || ' ').split('\n')
  const w = Math.max(...lines.map((l) => measureCtx.measureText(l || ' ').width))
  return { w: w + size * 0.1, h: lines.length * size * LINE_HEIGHT }
}

function standardFontName(StandardFonts, font, bold, italic) {
  const map = {
    helvetica: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
    times: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
    courier: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
  }[font] || []
  return map[(bold ? 1 : 0) + (italic ? 2 : 0)] || StandardFonts.Helvetica
}

export async function applyElements(doc, elements) {
  const { StandardFonts, rgb, degrees, BlendMode } = await getPdfLib()
  const fonts = {}
  const images = {}
  const getFont = async (name) => (fonts[name] ||= await doc.embedFont(name))
  const getImage = async (src) => {
    if (!images[src]) images[src] = /^data:image\/jpe?g/i.test(src) ? await doc.embedJpg(src) : await doc.embedPng(src)
    return images[src]
  }
  const pages = doc.getPages()

  for (const el of elements) {
    const page = pages[el.page]
    if (!page) continue
    const frame = pageFrame(page)
    const { vw, vh, rot, map } = frame
    const vx = el.x * vw
    const vy = el.y * vh
    const w = el.w * vw
    const h = el.h * vh
    const anchor = map(vx, vy + h)
    const rotate = degrees(rot)
    const color = rgb(...hexToRgb01(el.color || '#000000'))

    if (el.type === 'rect' || el.type === 'whiteout' || el.type === 'highlight') {
      const fill = el.type === 'whiteout' ? '#ffffff' : el.fill || el.color || '#ffeb3b'
      page.drawRectangle({
        x: anchor.x, y: anchor.y, width: w, height: h, rotate,
        color: el.type === 'rect' && el.noFill ? undefined : rgb(...hexToRgb01(fill)),
        opacity: el.type === 'highlight' ? 0.4 : el.opacity ?? 1,
        borderColor: el.type === 'rect' && el.border ? rgb(...hexToRgb01(el.borderColor || '#000000')) : undefined,
        borderWidth: el.type === 'rect' && el.border ? el.borderWidth || 1.5 : 0,
        blendMode: el.type === 'highlight' ? BlendMode.Multiply : undefined,
      })
    } else if (el.type === 'image' || el.type === 'signature' || el.type === 'initials') {
      const img = await getImage(el.src)
      page.drawImage(img, { x: anchor.x, y: anchor.y, width: w, height: h, rotate, opacity: el.opacity ?? 1 })
    } else if (el.type === 'check' || el.type === 'cross' || el.type === 'line') {
      const thickness = Math.max(1, Math.min(w, h) * 0.12)
      const seg = (ax, ay, bx, by) => {
        const s = map(vx + ax * w, vy + ay * h)
        const e = map(vx + bx * w, vy + by * h)
        page.drawLine({ start: s, end: e, thickness: el.type === 'line' ? el.thickness || 2 : thickness, color, lineCap: 1 })
      }
      if (el.type === 'check') { seg(0.1, 0.55, 0.4, 0.85); seg(0.4, 0.85, 0.92, 0.12) }
      else if (el.type === 'cross') { seg(0.12, 0.12, 0.88, 0.88); seg(0.88, 0.12, 0.12, 0.88) }
      else seg(0, 0.5, 1, 0.5)
    } else if (el.type === 'text') {
      const text = String(el.text || '')
      if (!text.trim()) continue
      const size = el.size || 16
      if (isWinAnsi(text)) {
        const font = await getFont(standardFontName(StandardFonts, el.font, el.bold, el.italic))
        const lines = text.split('\n')
        lines.forEach((line, i) => {
          if (!line) return
          const p = map(vx, vy + size * (BASELINE[el.font] || BASELINE.helvetica) + i * size * LINE_HEIGHT)
          page.drawText(line, { x: p.x, y: p.y, size, font, color, rotate, opacity: el.opacity ?? 1 })
        })
      } else {
        // Scripts outside the standard fonts (Hindi, Tamil, Chinese, emoji…) are drawn as a crisp image.
        const png = textToPng(text, { size, color: el.color, family: FONT_CSS[el.font], bold: el.bold, italic: el.italic })
        const img = await getImage(png.dataUrl)
        const a2 = map(vx, vy + png.height)
        page.drawImage(img, { x: a2.x, y: a2.y, width: png.width, height: png.height, rotate, opacity: el.opacity ?? 1 })
      }
    }
  }
}
