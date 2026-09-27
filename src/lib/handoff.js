// Pass files from one place to the next tool ("Continue with…", home-page smart drop)
// in memory only — nothing is stored.
let pending = null

export function setHandoff(files) {
  pending = Array.isArray(files) ? files : [files]
}

/** Take the pending files if `accepts(file)` is true for at least one; returns the accepted ones. */
export function takeHandoff(accepts) {
  if (!pending) return []
  const ok = pending.filter(accepts)
  pending = null
  return ok
}

export function blobToFile(blob, name) {
  return new File([blob], name, { type: blob.type, lastModified: Date.now() })
}
