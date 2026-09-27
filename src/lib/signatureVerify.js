// Verifies PDF digital signatures (PKCS#7 / CAdES / RFC 3161 document timestamps) using WebCrypto.
// Works directly on the raw bytes, so encrypted PDFs (e.g. e-Aadhaar) verify without their password.
import { parseAsn1, parseCertificate, content, raw, oid, isCtx, time, bytesEqual, toHex, nameGet } from './asn1'
import { bytesToLatin1 } from './files'

const HASH = {
  '1.3.14.3.2.26': 'SHA-1',
  '2.16.840.1.101.3.4.2.1': 'SHA-256',
  '2.16.840.1.101.3.4.2.2': 'SHA-384',
  '2.16.840.1.101.3.4.2.3': 'SHA-512',
}
const SIG_HASH = {
  '1.2.840.113549.1.1.5': 'SHA-1', '1.2.840.113549.1.1.11': 'SHA-256', '1.2.840.113549.1.1.12': 'SHA-384', '1.2.840.113549.1.1.13': 'SHA-512',
  '1.2.840.10045.4.1': 'SHA-1', '1.2.840.10045.4.3.2': 'SHA-256', '1.2.840.10045.4.3.3': 'SHA-384', '1.2.840.10045.4.3.4': 'SHA-512',
}
const CURVES = { '1.2.840.10045.3.1.7': ['P-256', 32], '1.3.132.0.34': ['P-384', 48], '1.3.132.0.35': ['P-521', 66] }
const OID = {
  signedData: '1.2.840.113549.1.7.2',
  data: '1.2.840.113549.1.7.1',
  tstInfo: '1.2.840.113549.1.9.16.1.4',
  messageDigest: '1.2.840.113549.1.9.4',
  signingTime: '1.2.840.113549.1.9.5',
  timeStampToken: '1.2.840.113549.1.9.16.2.14',
  rsa: '1.2.840.113549.1.1.1',
  rsaPss: '1.2.840.113549.1.1.10',
  ec: '1.2.840.10045.2.1',
}

const subtle = () => globalThis.crypto.subtle
const digest = async (alg, data) => new Uint8Array(await subtle().digest(alg, data))

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

function ecdsaDerToRaw(sig, size) {
  const seq = parseAsn1(sig)
  const fix = (b) => {
    while (b.length > size && b[0] === 0) b = b.subarray(1)
    const out = new Uint8Array(size)
    out.set(b, size - b.length)
    return out
  }
  return concat(fix(content(seq.children[0])), fix(content(seq.children[1])))
}

function pssParams(paramsNode) {
  let hash = 'SHA-1'
  let salt = 20
  for (const c of paramsNode?.children || []) {
    if (isCtx(c, 0)) hash = HASH[oid(c.children[0].children[0])] || hash
    if (isCtx(c, 2)) salt = parseInt(toHex(content(c.children[0])), 16)
  }
  return { hash, salt }
}

/** Verify `sig` over `data` with the certificate's key. Returns true/false, or null if unsupported. */
export async function verifyWithCert(cert, sigAlgOid, sigAlgParams, hashName, data, sig) {
  try {
    if (cert.keyAlg === OID.rsa || cert.keyAlg === OID.rsaPss) {
      if (sigAlgOid === OID.rsaPss) {
        const { hash, salt } = pssParams(sigAlgParams)
        const key = await subtle().importKey('spki', cert.spki, { name: 'RSA-PSS', hash }, false, ['verify'])
        return await subtle().verify({ name: 'RSA-PSS', saltLength: salt }, key, sig, data)
      }
      const key = await subtle().importKey('spki', cert.spki, { name: 'RSASSA-PKCS1-v1_5', hash: SIG_HASH[sigAlgOid] || hashName }, false, ['verify'])
      return await subtle().verify('RSASSA-PKCS1-v1_5', key, sig, data)
    }
    if (cert.keyAlg === OID.ec && CURVES[cert.curve]) {
      const [namedCurve, size] = CURVES[cert.curve]
      const key = await subtle().importKey('spki', cert.spki, { name: 'ECDSA', namedCurve }, false, ['verify'])
      return await subtle().verify({ name: 'ECDSA', hash: SIG_HASH[sigAlgOid] || hashName }, key, ecdsaDerToRaw(sig, size), data)
    }
  } catch {
    return false
  }
  return null
}

function parseAttributes(node) {
  const out = {}
  for (const a of node?.children || []) {
    out[oid(a.children[0])] = a.children[1].children
  }
  return out
}

/** Parse a CMS SignedData ContentInfo. */
function parseSignedData(der) {
  const ci = parseAsn1(der)
  if (oid(ci.children[0]) !== OID.signedData) throw new Error('Not a CMS SignedData structure')
  const sd = ci.children[1].children[0]
  const kids = sd.children
  const encap = kids[2]
  const eContentType = oid(encap.children[0])
  const eContent = encap.children[1] ? content(encap.children[1].children[0]) : null
  const certs = []
  let signerInfos = null
  for (let i = 3; i < kids.length; i++) {
    if (isCtx(kids[i], 0)) {
      for (const c of kids[i].children) {
        if (c.cls === 0 && c.tagNum === 16) {
          try { certs.push(parseCertificate(c)) } catch { /* skip unusual certificate */ }
        }
      }
    } else if (kids[i].cls === 0 && kids[i].tagNum === 17) signerInfos = kids[i]
  }
  const si = signerInfos.children[0].children
  let j = 0
  j++ // version
  const sid = si[j++]
  const digestAlg = oid(si[j++].children[0])
  let signedAttrsNode = null
  if (isCtx(si[j], 0)) signedAttrsNode = si[j++]
  const sigAlgNode = si[j++]
  const signature = content(si[j++])
  const unsignedAttrs = isCtx(si[j], 1) ? parseAttributes(si[j]) : {}
  return {
    eContentType, eContent, certs, sid, digestAlg,
    signedAttrsNode, signedAttrs: signedAttrsNode ? parseAttributes(signedAttrsNode) : {},
    sigAlg: oid(sigAlgNode.children[0]), sigAlgParams: sigAlgNode.children[1], signature, unsignedAttrs,
  }
}

function parseTstInfo(bytes) {
  const n = parseAsn1(bytes)
  const f = n.children
  const imprint = f[2]
  return {
    hashAlg: HASH[oid(imprint.children[0].children[0])],
    hashed: content(imprint.children[1]),
    genTime: time(f[4]),
  }
}

/** Order certificates signer → root by matching issuer/subject. */
function buildChain(signer, certs) {
  const chain = [signer]
  let cur = signer
  for (let guard = 0; guard < 10 && !cur.selfSigned; guard++) {
    const parent = certs.find((c) => c !== cur && bytesEqual(c.subjectRaw, cur.issuerRaw))
    if (!parent || chain.includes(parent)) break
    chain.push(parent)
    cur = parent
  }
  return chain
}

/** Core check of one SignedData blob against the signed byte ranges. */
async function checkCms(der, data) {
  const cms = parseSignedData(der)
  const hashName = HASH[cms.digestAlg]
  if (!hashName) throw new Error(`Unsupported digest algorithm (${cms.digestAlg})`)

  let integrity = null
  let target = data // what the messageDigest attribute is computed over
  let tst = null
  if (cms.eContent) {
    target = cms.eContent
    if (cms.eContentType === OID.tstInfo) {
      tst = parseTstInfo(cms.eContent)
      integrity = tst.hashAlg ? bytesEqual(tst.hashed, await digest(tst.hashAlg, data)) : null
    } else {
      // adbe.pkcs7.sha1: the encapsulated content is the SHA-1 of the document.
      integrity = bytesEqual(cms.eContent, await digest('SHA-1', data))
    }
  }

  let signedData = target
  if (cms.signedAttrsNode) {
    const md = cms.signedAttrs[OID.messageDigest]?.[0]
    const mdOk = md ? bytesEqual(content(md), await digest(hashName, target)) : false
    integrity = integrity === null ? mdOk : integrity && mdOk
    signedData = raw(cms.signedAttrsNode).slice()
    signedData[0] = 0x31 // [0] IMPLICIT → SET OF for the signature input
  }

  // Find the signer certificate: the one whose key verifies the signature.
  let signer = null
  let sigValid = false
  for (const cert of cms.certs) {
    const ok = await verifyWithCert(cert, cms.sigAlg, cms.sigAlgParams, hashName, signedData, cms.signature)
    if (ok) { signer = cert; sigValid = true; break }
  }
  if (!signer) {
    // Fall back to the issuer+serial match, for reporting.
    const sidSerial = cms.sid?.children?.[1] ? toHex(content(cms.sid.children[1])).replace(/^0+/, '') : ''
    signer = cms.certs.find((c) => c.serial.replace(/^0+/, '') === sidSerial) || cms.certs[0] || null
  }
  if (!cms.signedAttrsNode && integrity === null) integrity = sigValid

  const signingTimeAttr = cms.signedAttrs[OID.signingTime]?.[0]
  const signingTime = signingTimeAttr ? time(signingTimeAttr) : null

  // Embedded timestamp (unsigned attribute) — check it stamps this signature value.
  let timestamp = tst ? { time: tst.genTime, valid: integrity } : null
  const tsTok = cms.unsignedAttrs[OID.timeStampToken]?.[0]
  if (tsTok) {
    try {
      const inner = parseSignedData(raw(tsTok))
      const info = parseTstInfo(inner.eContent)
      const ok = info.hashAlg ? bytesEqual(info.hashed, await digest(info.hashAlg, cms.signature)) : false
      const tsaCert = inner.certs.find((c) => c.selfSigned === false) || inner.certs[0]
      timestamp = { time: info.genTime, valid: ok, authority: tsaCert ? nameGet(tsaCert.subject, 'CN') || nameGet(tsaCert.subject, 'O') : '' }
    } catch { /* malformed timestamp: ignore */ }
  }

  // Certificate chain links.
  const chain = signer ? buildChain(signer, cms.certs) : []
  const links = []
  for (let i = 0; i < chain.length; i++) {
    const c = chain[i]
    const issuer = c.selfSigned ? c : chain[i + 1]
    let ok = null
    if (issuer) ok = await verifyWithCert(issuer, c.sigAlg, c.sigAlgParams, SIG_HASH[c.sigAlg] || 'SHA-256', c.tbsRaw, c.signature)
    links.push({ cert: c, issuerPresent: !!issuer, signatureOk: ok })
  }

  return { cms, hashName, integrity: !!integrity, sigValid, signer, signingTime, timestamp, chain: links, isDocTimestamp: !!tst }
}

function decodePdfString(s) {
  if (!s) return ''
  if (s.startsWith('<')) {
    const hex = s.slice(1, -1).replace(/\s+/g, '')
    const bytes = hex.match(/../g)?.map((h) => parseInt(h, 16)) || []
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      let out = ''
      for (let i = 2; i + 1 < bytes.length; i += 2) out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1])
      return out
    }
    return String.fromCharCode(...bytes)
  }
  let body = s.slice(1, -1).replace(/\\([nrtbf()\\]|[0-7]{1,3}|\r?\n)/g, (_, e) => {
    const map = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }
    if (map[e] !== undefined) return map[e]
    if (/^[0-7]+$/.test(e)) return String.fromCharCode(parseInt(e, 8))
    return ''
  })
  if (body.charCodeAt(0) === 0xfe && body.charCodeAt(1) === 0xff) {
    let out = ''
    for (let i = 2; i + 1 < body.length; i += 2) out += String.fromCharCode((body.charCodeAt(i) << 8) | body.charCodeAt(i + 1))
    body = out
  }
  return body
}

function pdfDate(s) {
  const m = s?.match(/D:(\d{4})(\d\d)?(\d\d)?(\d\d)?(\d\d)?(\d\d)?([Zz+-])?(\d\d)?'?(\d\d)?/)
  if (!m) return null
  let t = Date.UTC(+m[1], +(m[2] || 1) - 1, +(m[3] || 1), +(m[4] || 0), +(m[5] || 0), +(m[6] || 0))
  if (m[7] === '+' || m[7] === '-') t -= (m[7] === '-' ? -1 : 1) * ((+m[8] || 0) * 60 + (+m[9] || 0)) * 60000
  return new Date(t)
}

/** Find the literal/hex string value of `key` inside a dictionary text. */
function dictValue(dict, key) {
  const i = dict.search(new RegExp(`/${key}\\s*[(<]`))
  if (i < 0) return null
  let p = dict.indexOf(dict.slice(i).match(/[(<]/)[0], i)
  if (dict[p] === '<') return dict.slice(p, dict.indexOf('>', p) + 1)
  let depth = 0
  for (let q = p; q < dict.length; q++) {
    if (dict[q] === '\\') { q++; continue }
    if (dict[q] === '(') depth++
    else if (dict[q] === ')' && --depth === 0) return dict.slice(p, q + 1)
  }
  return null
}

/** Verify every signature in a PDF. */
export async function verifyPdfSignatures(bytes) {
  const s = bytesToLatin1(bytes)
  const encrypted = /\/Encrypt\s+\d+\s+\d+\s+R/.test(s)
  const re = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g
  const seen = new Set()
  const results = []
  let m
  while ((m = re.exec(s))) {
    const [a, b, c, d] = m.slice(1, 5).map(Number)
    const key = `${a},${b},${c},${d}`
    if (seen.has(key)) continue
    seen.add(key)
    const entry = { byteRange: [a, b, c, d], coversWholeFile: a === 0 && c + d === bytes.length }
    try {
      if (a !== 0 || b <= 0 || c <= b || c + d > bytes.length) throw new Error('The signature byte range is malformed.')
      const gap = s.slice(a + b, c).trim()
      if (!gap.startsWith('<') || !gap.endsWith('>')) throw new Error('Signature contents are not where the byte range says.')
      const hex = gap.slice(1, -1).replace(/\s+/g, '')
      const der = new Uint8Array(hex.length / 2)
      for (let i = 0; i < der.length; i++) der[i] = parseInt(hex.substr(i * 2, 2), 16)
      const data = concat(bytes.subarray(a, a + b), bytes.subarray(c, c + d))

      // Signature dictionary: the text around the /ByteRange, excluding the big hex blob.
      const dictText = s.slice(Math.max(0, m.index - 3000), a + b) + s.slice(c, Math.min(s.length, c + 3000))
      const near = s.slice(Math.max(0, m.index - 1500), m.index + 200) + s.slice(c, Math.min(s.length, c + 1500))
      entry.subFilter = near.match(/\/SubFilter\s*\/([A-Za-z0-9.#_-]+)/)?.[1]?.replace(/#2E/gi, '.') || ''
      if (!encrypted) {
        entry.reason = decodePdfString(dictValue(near, 'Reason'))
        entry.location = decodePdfString(dictValue(near, 'Location'))
        entry.name = decodePdfString(dictValue(near, 'Name'))
        entry.contactInfo = decodePdfString(dictValue(near, 'ContactInfo'))
        entry.pdfDate = pdfDate(decodePdfString(dictValue(near, 'M')))
      } else {
        entry.pdfDate = pdfDate(dictText.match(/\/M\s*\((D:[^)]*)\)/)?.[1])
      }

      if (entry.subFilter === 'adbe.x509.rsa_sha1') throw new Error('Legacy "adbe.x509.rsa_sha1" signatures cannot be verified here.')
      Object.assign(entry, await checkCms(der, data))
      delete entry.cms
    } catch (e) {
      entry.error = e.message || String(e)
    }
    results.push(entry)
  }
  return { signatures: results, encrypted, size: bytes.length }
}

export function describeCert(cert) {
  if (!cert) return null
  return {
    name: nameGet(cert.subject, 'CN') || nameGet(cert.subject, 'O') || 'Unknown',
    org: nameGet(cert.subject, 'O'),
    email: nameGet(cert.subject, 'E'),
    country: nameGet(cert.subject, 'C'),
    issuer: nameGet(cert.issuer, 'CN') || nameGet(cert.issuer, 'O'),
    serial: cert.serial,
    notBefore: cert.notBefore,
    notAfter: cert.notAfter,
    selfSigned: cert.selfSigned,
    keyInfo: `${cert.keyAlg === OID.ec ? 'ECDSA' : 'RSA'}${cert.keyBits ? ` ${cert.keyBits}-bit` : ''}`,
  }
}
