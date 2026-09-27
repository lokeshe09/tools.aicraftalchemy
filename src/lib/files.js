export const readAsDataURL = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })

export const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('This image could not be decoded by your browser.'))
    img.src = src
  })

/** Decode any browser-supported image file into an <img>. */
export async function fileToImage(file) {
  const url = URL.createObjectURL(file)
  try {
    return await loadImage(url)
  } catch {
    throw new Error(`"${file.name}" could not be opened as an image.`)
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

export function formatBytes(bytes) {
  if (bytes == null || isNaN(bytes)) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(i === 0 ? 0 : n < 10 ? 2 : 1)} ${units[i]}`
}

export const baseName = (name) => String(name || 'file').replace(/\.[^/.]+$/, '')
export const extOf = (name) => (String(name).match(/\.([^./]+)$/)?.[1] || '').toLowerCase()

export const canvasToBlob = (canvas, type = 'image/png', quality) =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The image is too large for your browser to encode.'))), type, quality)
  )

/** Does `file` satisfy an <input accept> string? */
export function acceptsFile(accept, file) {
  if (!accept || accept === '*') return true
  const name = file.name.toLowerCase()
  const type = (file.type || '').toLowerCase()
  return accept
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .some((a) => {
      if (a.startsWith('.')) return name.endsWith(a)
      if (a.endsWith('/*')) return type.startsWith(a.slice(0, -1))
      return type === a
    })
}

/** Parse "1-3, 5, 8-10" into 1-based page numbers (unique, in written order). "end"/"last" allowed. */
export function parseRanges(input, max) {
  const pages = []
  const parts = String(input || '')
    .toLowerCase()
    .replace(/\b(end|last)\b/g, String(max))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  for (const part of parts) {
    const m = part.match(/^(\d+)\s*(?:-\s*(\d+)?)?$/)
    if (!m) throw new Error(`"${part}" is not a valid page range. Use e.g. 1-3, 5, 8-end`)
    let a = parseInt(m[1], 10)
    let b = m[2] ? parseInt(m[2], 10) : part.includes('-') ? max : a
    const step = a <= b ? 1 : -1
    for (let p = a; step > 0 ? p <= b : p >= b; p += step) {
      if (p < 1 || p > max) throw new Error(`Page ${p} does not exist — this document has ${max} page${max === 1 ? '' : 's'}.`)
      if (!pages.includes(p)) pages.push(p)
    }
  }
  return pages
}

/** "1-3, 5" -> [[1,2,3],[5]] */
export function parseRangeGroups(input, max) {
  return String(input || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => parseRanges(part, max))
}

export async function zipBlobs(entries) {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const used = new Set()
  for (const { name, blob } of entries) {
    let n = name
    let i = 1
    while (used.has(n.toLowerCase())) n = name.replace(/(\.[^.]+)?$/, `-${i++}$1`)
    used.add(n.toLowerCase())
    zip.file(n, blob)
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

/** Return one file directly or several as a ZIP. */
export async function oneOrZip(outputs, zipName) {
  if (outputs.length === 1) return outputs[0]
  return { blob: await zipBlobs(outputs), name: zipName, count: outputs.length }
}

export const pdfBlob = (bytes) => new Blob([bytes], { type: 'application/pdf' })

export function bytesToLatin1(bytes) {
  let s = ''
  const CH = 0x8000
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH))
  return s
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export const MIME = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}
