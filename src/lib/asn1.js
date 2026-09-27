// Minimal BER/DER reader — enough for X.509 certificates and CMS (PKCS#7) signatures.

export function parseAsn1(bytes, offset = 0, end = bytes.length) {
  const start = offset
  let b = bytes[offset++]
  if (b === undefined) throw new Error('Unexpected end of ASN.1 data')
  const cls = b >> 6
  const constructed = (b & 0x20) !== 0
  let tagNum = b & 0x1f
  if (tagNum === 0x1f) {
    tagNum = 0
    let t
    do {
      t = bytes[offset++]
      tagNum = tagNum * 128 + (t & 0x7f)
    } while (t & 0x80)
  }
  let len = bytes[offset++]
  let indefinite = false
  if (len === 0x80) {
    indefinite = true
    len = -1
  } else if (len & 0x80) {
    const n = len & 0x7f
    if (n > 4) throw new Error('ASN.1 length too large')
    len = 0
    for (let i = 0; i < n; i++) len = len * 256 + bytes[offset++]
  }
  const contentStart = offset
  const node = { cls, constructed, tagNum, tag: bytes[start], start, contentStart, end: 0, children: null, bytes }
  if (indefinite) {
    if (!constructed) throw new Error('Invalid indefinite length')
    node.children = []
    let p = contentStart
    while (!(bytes[p] === 0 && bytes[p + 1] === 0)) {
      const child = parseAsn1(bytes, p, end)
      node.children.push(child)
      p = child.end
      if (p >= end) throw new Error('Unterminated indefinite-length ASN.1')
    }
    node.contentEnd = p
    node.end = p + 2
    return node
  }
  node.contentEnd = contentStart + len
  node.end = node.contentEnd
  if (node.end > end) throw new Error('ASN.1 element exceeds buffer')
  // Universal constructed types, and all context/application-tagged constructed values, hold children.
  if (constructed) {
    node.children = []
    let p = contentStart
    while (p < node.contentEnd) {
      const child = parseAsn1(bytes, p, node.contentEnd)
      node.children.push(child)
      p = child.end
    }
  }
  return node
}

export const raw = (n) => n.bytes.subarray(n.start, n.end)
export const content = (n) => {
  if (n.constructed && n.children && n.tagNum === 4 && n.cls === 0) {
    // BER constructed OCTET STRING: concatenate the pieces.
    const parts = n.children.map(content)
    const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0))
    let o = 0
    for (const p of parts) { out.set(p, o); o += p.length }
    return out
  }
  return n.bytes.subarray(n.contentStart, n.contentEnd)
}
export const isCtx = (n, num) => n && n.cls === 2 && n.tagNum === num

export function oid(n) {
  const b = content(n)
  const parts = []
  let v = 0
  for (let i = 0; i < b.length; i++) {
    v = v * 128 + (b[i] & 0x7f)
    if (!(b[i] & 0x80)) {
      if (parts.length === 0) {
        const first = v < 80 ? Math.floor(v / 40) : 2
        parts.push(first, v - first * 40)
      } else parts.push(v)
      v = 0
    }
  }
  return parts.join('.')
}

export const toHex = (bytes) => Array.from(bytes, (x) => x.toString(16).padStart(2, '0')).join('')

export function intHex(n) {
  let b = content(n)
  while (b.length > 1 && b[0] === 0) b = b.subarray(1)
  return toHex(b)
}

export function time(n) {
  const s = new TextDecoder('latin1').decode(content(n))
  let m
  if (n.tagNum === 23) {
    m = s.match(/^(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?(Z|[+-]\d{4})?$/)
    if (!m) return null
    const yy = +m[1]
    return mkDate(yy < 50 ? 2000 + yy : 1900 + yy, m[2], m[3], m[4], m[5], m[6] || 0, m[7])
  }
  m = s.match(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)?(\d\d)?(?:\.\d+)?(Z|[+-]\d{4})?$/)
  if (!m) return null
  return mkDate(+m[1], m[2], m[3], m[4], m[5] || 0, m[6] || 0, m[7])
}
function mkDate(y, mo, d, h, mi, s, tz) {
  let t = Date.UTC(y, +mo - 1, +d, +h, +mi, +s)
  if (tz && tz !== 'Z') {
    const sign = tz[0] === '-' ? -1 : 1
    t -= sign * (+tz.slice(1, 3) * 60 + +tz.slice(3, 5)) * 60000
  }
  return new Date(t)
}

export function str(n) {
  const b = content(n)
  switch (n.tagNum) {
    case 30: { // BMPString (UTF-16BE)
      let s = ''
      for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode((b[i] << 8) | b[i + 1])
      return s
    }
    case 28: { // UniversalString (UTF-32BE)
      let s = ''
      for (let i = 0; i + 3 < b.length; i += 4) s += String.fromCodePoint(((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0)
      return s
    }
    case 12: return new TextDecoder('utf-8').decode(b)
    default: return new TextDecoder('latin1').decode(b)
  }
}

const NAME_OIDS = {
  '2.5.4.3': 'CN', '2.5.4.4': 'SN', '2.5.4.42': 'GN', '2.5.4.5': 'serialNumber', '2.5.4.6': 'C', '2.5.4.7': 'L', '2.5.4.8': 'ST',
  '2.5.4.9': 'street', '2.5.4.10': 'O', '2.5.4.11': 'OU', '2.5.4.12': 'title', '2.5.4.17': 'postalCode', '2.5.4.46': 'dnQualifier',
  '2.5.4.65': 'pseudonym', '2.5.4.20': 'telephone', '1.2.840.113549.1.9.1': 'E', '0.9.2342.19200300.100.1.25': 'DC', '2.5.4.97': 'organizationIdentifier',
}

export function parseName(n) {
  const out = []
  for (const set of n.children || []) {
    for (const atv of set.children || []) {
      const [o, v] = atv.children
      const key = NAME_OIDS[oid(o)] || oid(o)
      let value
      try { value = str(v) } catch { value = '' }
      out.push([key, value])
    }
  }
  return out
}

export const nameGet = (name, key) => name.filter(([k]) => k === key).map(([, v]) => v).join(', ')
export const nameToString = (name) => name.map(([k, v]) => `${k}=${v}`).join(', ')

export function bytesEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/** Parse an X.509 certificate node. */
export function parseCertificate(node) {
  const [tbs, sigAlgNode, sigValue] = node.children
  let i = 0
  const f = tbs.children
  let version = 1
  if (isCtx(f[0], 0)) { version = Number(intHex(f[0].children[0]) || 0) + 1; i++ }
  const serialNode = f[i++]
  i++ // signature algorithm inside tbs
  const issuerNode = f[i++]
  const validity = f[i++]
  const subjectNode = f[i++]
  const spki = f[i++]
  const keyAlg = oid(spki.children[0].children[0])
  const keyParams = spki.children[0].children[1]
  const curve = keyParams && keyParams.tagNum === 6 && keyParams.cls === 0 ? oid(keyParams) : null
  let keyBits = 0
  try {
    const bitstr = content(spki.children[1]).subarray(1)
    if (keyAlg === '1.2.840.113549.1.1.1' || keyAlg === '1.2.840.113549.1.1.10') {
      const rsa = parseAsn1(bitstr)
      keyBits = (content(rsa.children[0]).length - (content(rsa.children[0])[0] === 0 ? 1 : 0)) * 8
    } else if (curve) keyBits = { '1.2.840.10045.3.1.7': 256, '1.3.132.0.34': 384, '1.3.132.0.35': 521 }[curve] || 0
  } catch { /* informational only */ }
  let keyUsage = null
  for (; i < f.length; i++) {
    if (isCtx(f[i], 3)) {
      for (const ext of f[i].children[0].children) {
        if (oid(ext.children[0]) === '2.5.29.15') {
          const bs = content(parseAsn1(content(ext.children[ext.children.length - 1])))
          keyUsage = bs[1] ?? 0
        }
      }
    }
  }
  const issuer = parseName(issuerNode)
  const subject = parseName(subjectNode)
  return {
    node,
    version,
    serial: intHex(serialNode),
    serialBytes: content(serialNode),
    issuer,
    subject,
    issuerRaw: raw(issuerNode),
    subjectRaw: raw(subjectNode),
    notBefore: time(validity.children[0]),
    notAfter: time(validity.children[1]),
    spki: raw(spki),
    keyAlg,
    curve,
    keyBits,
    keyUsage,
    tbsRaw: raw(tbs),
    sigAlg: oid(sigAlgNode.children[0]),
    sigAlgParams: sigAlgNode.children[1],
    signature: content(sigValue).subarray(1),
    selfSigned: bytesEqual(raw(issuerNode), raw(subjectNode)),
  }
}
