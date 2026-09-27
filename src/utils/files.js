export const readAsArrayBuffer = (file) => file.arrayBuffer()

export const readAsText = (file) => file.text()

export const readAsDataURL = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })

export const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = src
  })

export async function fileToImage(file) {
  const url = URL.createObjectURL(file)
  try {
    return await loadImage(url)
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
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
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export const baseName = (name) => name.replace(/\.[^/.]+$/, '')

export const canvasToBlob = (canvas, type = 'image/png', quality) =>
  new Promise((resolve) => canvas.toBlob(resolve, type, quality))

/** Parse "1-3, 5, 8-10" into 1-based page numbers (unique, ordered as written). */
export function parseRanges(input, max) {
  const pages = []
  const parts = String(input || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  for (const part of parts) {
    const m = part.match(/^(\d+)\s*(?:-\s*(\d+))?$/)
    if (!m) throw new Error(`Invalid range: "${part}"`)
    let a = parseInt(m[1], 10)
    let b = m[2] ? parseInt(m[2], 10) : a
    if (a > b) [a, b] = [b, a]
    for (let p = a; p <= b; p++) {
      if (p < 1 || p > max) throw new Error(`Page ${p} is out of range (1-${max})`)
      if (!pages.includes(p)) pages.push(p)
    }
  }
  return pages
}

/** Parse ranges into groups: "1-3, 5" -> [[1,2,3],[5]] */
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
    while (used.has(n)) n = name.replace(/(\.[^.]+)?$/, `-${i++}$1`)
    used.add(n)
    zip.file(n, blob)
  }
  return zip.generateAsync({ type: 'blob' })
}

export const pdfBlob = (bytes) => new Blob([bytes], { type: 'application/pdf' })
