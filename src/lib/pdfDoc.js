// pdf-lib helpers shared by every PDF tool.
import { getPassword } from './passwords'
import { PasswordRequiredError } from './pdf'
import { bytesToLatin1, pdfBlob } from './files'

let pdfLibPromise = null
export const getPdfLib = () => (pdfLibPromise ||= import('pdf-lib'))

/**
 * Load a PDF for editing. Encrypted files are decrypted losslessly with qpdf first
 * (owner-restricted PDFs open automatically; open-password PDFs need the password).
 */
export async function loadPdf(file, { password = getPassword(file) } = {}) {
  const { PDFDocument } = await getPdfLib()
  const bytes = new Uint8Array(await file.arrayBuffer())
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false })
  } catch (e) {
    if (!/encrypt/i.test(e?.message || '')) {
      // Not an encryption problem: try a structural repair before giving up.
      try {
        const { qpdfRepair } = await import('./qpdf')
        const { bytes: fixed } = await qpdfRepair(bytes)
        return await PDFDocument.load(fixed, { updateMetadata: false })
      } catch {
        throw new Error(`"${file.name}" could not be read. It may be damaged or not a PDF.`)
      }
    }
  }
  const { qpdfDecrypt } = await import('./qpdf')
  try {
    const { bytes: plain } = await qpdfDecrypt(bytes, password || '')
    return await PDFDocument.load(plain, { updateMetadata: false })
  } catch (e) {
    if (e.code === 'password') throw new PasswordRequiredError(file, !!password)
    throw new Error(`"${file.name}" is encrypted and could not be opened: ${e.message}`)
  }
}

export async function saveBlob(doc, opts = {}) {
  return pdfBlob(await doc.save({ useObjectStreams: true, ...opts }))
}

/** Quick check for embedded digital signatures (any /ByteRange array). */
export async function hasDigitalSignature(file) {
  if (!file || !/\.pdf$/i.test(file.name)) return false
  const bytes = new Uint8Array(await file.arrayBuffer())
  return /\/ByteRange\s*\[\s*\d+\s+\d+\s+\d+\s+\d+\s*\]/.test(bytesToLatin1(bytes))
}

/**
 * Map "visual" coordinates (origin top-left of the page as displayed, in points)
 * into PDF user space, honouring the CropBox and the page /Rotate value.
 * Anything drawn at `map(vx, vy)` with `rotate: degrees(rot)` appears upright.
 */
export function pageFrame(page) {
  const box = page.getCropBox()
  const rot = ((page.getRotation().angle % 360) + 360) % 360
  const { x, y, width: w, height: h } = box
  const swap = rot === 90 || rot === 270
  const vw = swap ? h : w
  const vh = swap ? w : h
  const map = (vx, vy) => {
    switch (rot) {
      case 90: return { x: x + vy, y: y + vx }
      case 180: return { x: x + w - vx, y: y + vy }
      case 270: return { x: x + w - vy, y: y + h - vx }
      default: return { x: x + vx, y: y + h - vy }
    }
  }
  return { vw, vh, rot, map }
}

/**
 * Place a box whose visual top-left is (vx, vy) and visual size (w, h).
 * Returns the anchor point for pdf-lib draw calls (the box's visual bottom-left).
 */
export function anchorFor(frame, vx, vy, h) {
  return frame.map(vx, vy + h)
}

export const hexToRgb01 = (hex) => {
  const n = parseInt(String(hex).replace('#', '').padEnd(6, '0').slice(0, 6), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** Standard 14 fonts only cover WinAnsi; true if `text` can be drawn with them. */
export const isWinAnsi = (text) => /^[\x20-\x7e\xa0-\xff\n\r\t–—‘’“”•…€]*$/.test(text)

/** Render text to a transparent PNG (used for scripts the standard PDF fonts can't encode). */
export function textToPng(text, { size = 24, color = '#000', family = 'Arial, sans-serif', bold = false, italic = false, scale = 4 } = {}) {
  const lines = String(text).split('\n')
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')
  const font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size * scale}px ${family}`
  ctx.font = font
  const width = Math.max(1, ...lines.map((l) => ctx.measureText(l).width))
  const lh = size * scale * 1.2
  c.width = Math.ceil(width + 2)
  c.height = Math.ceil(lh * lines.length)
  ctx.font = font
  ctx.fillStyle = color
  ctx.textBaseline = 'alphabetic'
  lines.forEach((l, i) => ctx.fillText(l, 1, i * lh + size * scale * 0.94))
  return { dataUrl: c.toDataURL('image/png'), width: c.width / scale, height: c.height / scale }
}
