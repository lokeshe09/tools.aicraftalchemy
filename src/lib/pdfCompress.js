// "Smart" PDF compression: downsample + re-encode embedded images, keep text and vectors intact.
import { getPdfLib } from './pdfDoc'

function unpredictPng(data, width, colors, bpc, height) {
  const bpp = Math.max(1, (colors * bpc) >> 3)
  const rowBytes = Math.ceil((width * colors * bpc) / 8)
  const out = new Uint8Array(rowBytes * height)
  let prev = new Uint8Array(rowBytes)
  let p = 0
  for (let y = 0; y < height; y++) {
    const ft = data[p++]
    const row = out.subarray(y * rowBytes, (y + 1) * rowBytes)
    for (let x = 0; x < rowBytes; x++) {
      const raw = data[p++] ?? 0
      const a = x >= bpp ? row[x - bpp] : 0
      const b = prev[x]
      const c = x >= bpp ? prev[x - bpp] : 0
      let v
      switch (ft) {
        case 1: v = raw + a; break
        case 2: v = raw + b; break
        case 3: v = raw + ((a + b) >> 1); break
        case 4: {
          const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c)
          v = raw + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
          break
        }
        default: v = raw
      }
      row[x] = v & 255
    }
    prev = row
  }
  return out
}

// pdf-lib classes (loaded lazily). Class names are minified in production, so always use instanceof.
let L = null
const nameOf = (v) => (v instanceof L.PDFName ? v.asString() : '')

/** Collect image XObject refs used on each page → largest page dimension (in points) they appear on. */
function mapImageUsage(doc) {
  const { PDFName, PDFDict, PDFRef } = L
  const usage = new Map()
  const visit = (resources, pageMax, depth) => {
    if (!resources || depth > 6) return
    const xobjs = resources.lookupMaybe?.(PDFName.of('XObject'), PDFDict)
    if (!xobjs) return
    for (const [, ref] of xobjs.entries()) {
      if (!(ref instanceof PDFRef)) continue
      const obj = doc.context.lookup(ref)
      const sub = obj?.dict?.get(PDFName.of('Subtype'))
      const st = nameOf(sub)
      if (st === '/Image') usage.set(ref.toString(), Math.max(usage.get(ref.toString()) || 0, pageMax))
      else if (st === '/Form') visit(obj.dict.lookupMaybe(PDFName.of('Resources'), PDFDict), pageMax, depth + 1)
    }
  }
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize()
    visit(page.node.Resources(), Math.max(width, height), 0)
  }
  return usage
}

async function decodeToCanvas(obj) {
  const { PDFName, PDFArray, PDFNumber, PDFRef, PDFDict } = L
  const d = obj.dict
  const w = d.get(PDFName.of('Width'))?.asNumber?.()
  const h = d.get(PDFName.of('Height'))?.asNumber?.()
  if (!w || !h) return null
  if (d.get(PDFName.of('ImageMask'))?.toString() === 'true' || d.get(PDFName.of('Decode')) || d.get(PDFName.of('Mask')) instanceof PDFArray) return null
  let filter = d.get(PDFName.of('Filter'))
  if (filter instanceof PDFArray) {
    if (filter.size() !== 1) return null
    filter = filter.get(0)
  }
  const f = nameOf(filter)
  // Colour space → number of components (only simple spaces are safe to rewrite).
  let cs = d.get(PDFName.of('ColorSpace'))
  let comps = 0
  const csName = nameOf(cs)
  if (csName === '/DeviceRGB' || csName === '/CalRGB') comps = 3
  else if (csName === '/DeviceGray' || csName === '/CalGray') comps = 1
  else if (cs instanceof PDFArray || cs instanceof PDFRef) {
    const arr = cs instanceof PDFArray ? cs : obj.dict.context.lookup(cs)
    if (arr instanceof PDFArray && nameOf(arr.get(0)) === '/ICCBased') {
      const icc = obj.dict.context.lookup(arr.get(1))
      const n = icc?.dict?.get(PDFName.of('N'))
      comps = n instanceof PDFNumber ? n.asNumber() : 0
    }
  }
  if (comps !== 1 && comps !== 3) return null
  const bpc = d.get(PDFName.of('BitsPerComponent'))?.asNumber?.() || 8

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')

  if (f === '/DCTDecode') {
    const bmp = await createImageBitmap(new Blob([obj.contents], { type: 'image/jpeg' }))
    ctx.drawImage(bmp, 0, 0, w, h)
    bmp.close?.()
    return { canvas, w, h, comps }
  }
  if (f === '/FlateDecode' && bpc === 8) {
    const { inflate } = await import('pako')
    let raw = inflate(obj.contents)
    const parmsRaw = d.lookup(PDFName.of('DecodeParms'))
    const parms = parmsRaw instanceof PDFDict ? parmsRaw : null
    const pred = parms?.get(PDFName.of('Predictor'))?.asNumber?.() || 1
    if (pred >= 10) raw = unpredictPng(raw, w, comps, 8, h)
    else if (pred !== 1) return null
    if (raw.length < w * h * comps) return null
    const img = ctx.createImageData(w, h)
    const px = img.data
    for (let i = 0, j = 0; i < w * h; i++) {
      if (comps === 3) { px[j] = raw[i * 3]; px[j + 1] = raw[i * 3 + 1]; px[j + 2] = raw[i * 3 + 2] } else { px[j] = px[j + 1] = px[j + 2] = raw[i] }
      px[j + 3] = 255
      j += 4
    }
    ctx.putImageData(img, 0, 0)
    return { canvas, w, h, comps }
  }
  return null
}

/**
 * Recompress images in-place. Returns stats { images, replaced }.
 * dpi: maximum resolution relative to the page an image appears on.
 */
export async function recompressImages(doc, { dpi = 150, quality = 0.65, grayscale = false, progress }) {
  L = await getPdfLib()
  const { PDFName, PDFRef, PDFRawStream } = L
  const usage = mapImageUsage(doc)
  // Images used as soft masks must stay lossless & untouched.
  const maskRefs = new Set()
  const all = doc.context.enumerateIndirectObjects()
  for (const [, obj] of all) {
    const sm = obj?.dict?.get?.(PDFName.of('SMask'))
    if (sm instanceof PDFRef) maskRefs.add(sm.toString())
    const m = obj?.dict?.get?.(PDFName.of('Mask'))
    if (m instanceof PDFRef) maskRefs.add(m.toString())
  }
  const images = all.filter(([ref, obj]) => obj instanceof PDFRawStream && nameOf(obj.dict.get(PDFName.of('Subtype'))) === '/Image' && !maskRefs.has(ref.toString()))
  let replaced = 0
  for (let k = 0; k < images.length; k++) {
    const [ref, obj] = images[k]
    progress?.(`Optimizing image ${k + 1} of ${images.length}`)
    let decoded
    try { decoded = await decodeToCanvas(obj) } catch { decoded = null }
    if (!decoded) continue
    const { canvas, w, h } = decoded
    const pagePts = usage.get(ref.toString()) || 842
    const maxPx = Math.max(16, Math.round((pagePts / 72) * dpi))
    const s = Math.min(1, maxPx / Math.max(w, h))
    let out = canvas
    if (s < 1 || grayscale) {
      out = document.createElement('canvas')
      out.width = Math.max(1, Math.round(w * s))
      out.height = Math.max(1, Math.round(h * s))
      const ctx = out.getContext('2d')
      ctx.imageSmoothingQuality = 'high'
      if (grayscale) ctx.filter = 'grayscale(1)'
      ctx.drawImage(canvas, 0, 0, out.width, out.height)
    }
    const blob = await new Promise((r) => out.toBlob(r, 'image/jpeg', quality))
    canvas.width = canvas.height = 0
    if (!blob) continue
    const bytes = new Uint8Array(await blob.arrayBuffer())
    if (bytes.length >= obj.contents.length * 0.92) continue // not worth it
    const dict = {
      Type: 'XObject', Subtype: 'Image', Width: out.width, Height: out.height,
      ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'DCTDecode',
    }
    const stream = doc.context.stream(bytes, dict)
    for (const key of ['SMask', 'Mask', 'Intent', 'Interpolate', 'OC', 'Metadata']) {
      const v = obj.dict.get(PDFName.of(key))
      if (v) stream.dict.set(PDFName.of(key), v)
    }
    doc.context.assign(ref, stream)
    out.width = out.height = 0
    replaced++
  }
  return { images: images.length, replaced }
}

export function stripExtras(doc, PDFName) {
  doc.catalog.delete(PDFName.of('Metadata'))
  doc.catalog.delete(PDFName.of('PieceInfo'))
  for (const p of doc.getPages()) {
    p.node.delete(PDFName.of('Thumb'))
    p.node.delete(PDFName.of('PieceInfo'))
  }
}

/** All image XObjects of a document (excluding soft masks), decoded lazily. */
export async function listImages(doc) {
  L = await getPdfLib()
  const { PDFName, PDFRef, PDFRawStream } = L
  const maskRefs = new Set()
  const all = doc.context.enumerateIndirectObjects()
  for (const [, obj] of all) {
    for (const key of ['SMask', 'Mask']) {
      const v = obj?.dict?.get?.(PDFName.of(key))
      if (v instanceof PDFRef) maskRefs.add(v.toString())
    }
  }
  return all
    .filter(([ref, obj]) => obj instanceof PDFRawStream && nameOf(obj.dict.get(PDFName.of('Subtype'))) === '/Image' && !maskRefs.has(ref.toString()))
    .map(([ref, obj]) => {
      let filter = obj.dict.get(PDFName.of('Filter'))
      if (filter instanceof L.PDFArray) filter = filter.size() === 1 ? filter.get(0) : null
      return {
        ref,
        obj,
        width: obj.dict.get(PDFName.of('Width'))?.asNumber?.() || 0,
        height: obj.dict.get(PDFName.of('Height'))?.asNumber?.() || 0,
        filter: filter ? nameOf(filter) : '',
        decode: () => decodeToCanvas(obj),
      }
    })
}
