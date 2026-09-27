// Canvas-based image helpers: encoding, target-size search, DPI metadata.
import { canvasToBlob } from './files'

export const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export function makeCanvas(w, h, bg) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  const ctx = c.getContext('2d')
  if (bg) {
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, c.width, c.height)
  }
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  return [c, ctx]
}

export const imgW = (img) => img.naturalWidth || img.width
export const imgH = (img) => img.naturalHeight || img.height

/** High-quality downscale using successive halving (avoids aliasing on big reductions). */
export function resizeCanvas(src, w, h) {
  w = Math.max(1, Math.round(w))
  h = Math.max(1, Math.round(h))
  let cur = src
  let cw = src.width || imgW(src)
  let ch = src.height || imgH(src)
  while (cw / 2 >= w && ch / 2 >= h) {
    const [c, ctx] = makeCanvas(cw / 2, ch / 2)
    ctx.drawImage(cur, 0, 0, c.width, c.height)
    cur = c
    cw = c.width
    ch = c.height
  }
  const [out, ctx] = makeCanvas(w, h)
  ctx.drawImage(cur, 0, 0, w, h)
  return out
}

/** Paint on white (JPEG has no alpha). */
export function flatten(canvas, bg = '#ffffff') {
  const [c, ctx] = makeCanvas(canvas.width, canvas.height, bg)
  ctx.drawImage(canvas, 0, 0)
  return c
}

/** Lossy PNG (colour quantisation, like TinyPNG) via UPNG. colors = 0 → lossless. */
export async function encodePngQuantized(canvas, colors = 256) {
  const { default: UPNG } = await import('upng-js')
  const ctx = canvas.getContext('2d')
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  const buf = UPNG.encode([data.buffer], canvas.width, canvas.height, colors)
  return new Blob([buf], { type: 'image/png' })
}

export async function encodeCanvas(canvas, type, quality = 0.92, { pngColors = 0 } = {}) {
  if (type === 'image/png' && pngColors) return encodePngQuantized(canvas, pngColors)
  const src = type === 'image/jpeg' ? flatten(canvas) : canvas
  return canvasToBlob(src, type, type === 'image/png' ? undefined : quality)
}

/**
 * Find the best quality that fits `targetBytes`. If even the lowest sensible quality is too big,
 * dimensions are reduced step by step. Returns { blob, quality, scale, reached }.
 */
export async function encodeToTarget(canvas, type, targetBytes) {
  if (type === 'image/png') {
    // PNG: try lossless, then fewer colours, then smaller dimensions.
    let cur = canvas
    for (let scale = 1; scale > 0.05; scale *= 0.85) {
      if (scale < 1) cur = resizeCanvas(canvas, canvas.width * scale, canvas.height * scale)
      for (const colors of [0, 256, 128, 64, 32, 16]) {
        const blob = colors ? await encodePngQuantized(cur, colors) : await canvasToBlob(cur, 'image/png')
        if (blob.size <= targetBytes) return { blob, quality: colors ? `${colors} colours` : 'lossless', scale, reached: true }
      }
    }
    return { blob: await encodePngQuantized(cur, 16), quality: '16 colours', scale: 0.05, reached: false }
  }
  const prep = (c) => (type === 'image/jpeg' ? flatten(c) : c)
  let cur = prep(canvas)
  let scale = 1
  let fallback = null
  for (let step = 0; step < 30; step++) {
    const top = await canvasToBlob(cur, type, 0.95)
    if (top.size <= targetBytes) return { blob: top, quality: 0.95, scale, reached: true }
    let lo = 0.1
    let hi = 0.95
    let best = null
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2
      const b = await canvasToBlob(cur, type, mid)
      if (b.size <= targetBytes) { best = { blob: b, quality: mid }; lo = mid } else hi = mid
    }
    // Accept once quality is reasonable; otherwise shrink dimensions instead of wrecking quality.
    if (best && best.quality >= 0.4) return { ...best, scale, reached: true }
    if (best) fallback = { ...best, scale }
    if (cur.width <= 48 || cur.height <= 48) break
    scale *= 0.85
    cur = prep(resizeCanvas(canvas, canvas.width * scale, canvas.height * scale))
  }
  if (fallback) return { ...fallback, reached: true }
  const blob = await canvasToBlob(cur, type, 0.1)
  return { blob, quality: 0.1, scale, reached: blob.size <= targetBytes }
}

/* ---------- DPI metadata ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Write DPI into a JPEG (JFIF density) or PNG (pHYs chunk). Other types are returned unchanged. */
export async function setDpi(blob, dpi) {
  dpi = Math.round(dpi)
  if (!dpi || dpi < 1 || dpi > 65535) return blob
  const b = new Uint8Array(await blob.arrayBuffer())
  if (blob.type === 'image/jpeg' && b[0] === 0xff && b[1] === 0xd8) {
    if (b[2] === 0xff && b[3] === 0xe0 && String.fromCharCode(b[6], b[7], b[8], b[9]) === 'JFIF') {
      b[13] = 1 // units: dots per inch
      b[14] = dpi >> 8; b[15] = dpi & 255
      b[16] = dpi >> 8; b[17] = dpi & 255
      return new Blob([b], { type: 'image/jpeg' })
    }
    // No JFIF header: insert one.
    const app0 = new Uint8Array([0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1, dpi >> 8, dpi & 255, dpi >> 8, dpi & 255, 0, 0])
    return new Blob([b.subarray(0, 2), app0, b.subarray(2)], { type: 'image/jpeg' })
  }
  if (blob.type === 'image/png' && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const ppm = Math.round(dpi / 0.0254)
    const chunk = new Uint8Array(21)
    const dv = new DataView(chunk.buffer)
    dv.setUint32(0, 9)
    chunk.set([0x70, 0x48, 0x59, 0x73], 4) // "pHYs"
    dv.setUint32(8, ppm)
    dv.setUint32(12, ppm)
    chunk[16] = 1
    dv.setUint32(17, crc32(chunk.subarray(4, 17)))
    // Drop an existing pHYs, insert ours right after IHDR (8 sig + 25 IHDR).
    const parts = [b.subarray(0, 33), chunk]
    let p = 33
    while (p < b.length) {
      const len = new DataView(b.buffer, b.byteOffset + p).getUint32(0)
      const type = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7])
      if (type !== 'pHYs') parts.push(b.subarray(p, p + 12 + len))
      p += 12 + len
    }
    return new Blob(parts, { type: 'image/png' })
  }
  return blob
}

export const UNIT_TO_INCH = { px: null, in: 1, cm: 1 / 2.54, mm: 1 / 25.4 }
