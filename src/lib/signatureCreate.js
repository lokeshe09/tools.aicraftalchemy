// Digitally sign a PDF with a PKCS#12 (.p12/.pfx) certificate, fully in the browser.
// Produces a standard detached PKCS#7 signature (adbe.pkcs7.detached) that Adobe Acrobat and
// other readers validate.
import { bytesToLatin1 } from './files'

const SIG_BYTES = 16384 // reserved space for the DER signature (certificate chains fit comfortably)
const BR_PLACEHOLDER = '/ByteRange [ 0 /********** /********** /********** ]' // pdf-lib's array spacing

let forgePromise = null
const getForge = () => (forgePromise ||= import('node-forge').then((m) => m.default || m))

/** Read a .p12/.pfx file. Returns { key, cert, chain, info }. */
export async function readP12(bytes, password) {
  const forge = await getForge()
  let p12
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(bytesToLatin1(new Uint8Array(bytes))))
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password)
  } catch (e) {
    if (/mac|password|Invalid/i.test(e?.message || '')) throw new Error('Could not open the certificate: the password is wrong or the file is not a valid .p12/.pfx.')
    throw new Error(`Could not open the certificate: ${e.message}`)
  }
  const keyBags = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []),
  ]
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []
  const key = keyBags.find((b) => b.key)?.key
  if (!key) throw new Error('This certificate file does not contain a private key (or it uses an unsupported key type such as ECDSA). An RSA key is required.')
  const certs = certBags.map((b) => b.cert).filter(Boolean)
  if (!certs.length) throw new Error('This certificate file does not contain a certificate.')
  const cert = certs.find((c) => c.publicKey?.n && c.publicKey.n.equals(key.n)) || certs[0]
  const chain = certs.filter((c) => c !== cert)
  const attr = (name) => cert.subject.getField(name)?.value || ''
  return {
    key,
    cert,
    chain,
    info: {
      name: attr('CN') || attr('O') || 'Unknown',
      email: attr('E') || cert.subject.getField({ type: '1.2.840.113549.1.9.1' })?.value || '',
      org: attr('O'),
      issuer: cert.issuer.getField('CN')?.value || cert.issuer.getField('O')?.value || '',
      notBefore: cert.validity.notBefore,
      notAfter: cert.validity.notAfter,
      selfSigned: cert.isIssuer(cert),
    },
  }
}

/** Create a self-signed certificate (RSA-2048, key generated with WebCrypto) and return it as a .p12. */
export async function createSelfSignedP12({ name, email, org, country, years = 3, password }) {
  const forge = await getForge()
  const kp = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  )
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey))
  const privateKey = forge.pki.privateKeyFromAsn1(forge.asn1.fromDer(forge.util.createBuffer(bytesToLatin1(pkcs8))))
  const publicKey = forge.pki.setRsaPublicKey(privateKey.n, privateKey.e)
  const cert = forge.pki.createCertificate()
  cert.publicKey = publicKey
  const serial = new Uint8Array(16)
  crypto.getRandomValues(serial)
  serial[0] &= 0x7f
  cert.serialNumber = Array.from(serial, (b) => b.toString(16).padStart(2, '0')).join('')
  cert.validity.notBefore = new Date(Date.now() - 60000)
  cert.validity.notAfter = new Date(Date.now() + years * 365.25 * 864e5)
  const attrs = [{ name: 'commonName', value: name }]
  if (org) attrs.push({ name: 'organizationName', value: org })
  if (country) attrs.push({ name: 'countryName', value: country.toUpperCase().slice(0, 2) })
  if (email) attrs.push({ name: 'emailAddress', value: email })
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, nonRepudiation: true },
    { name: 'extKeyUsage', emailProtection: true },
    { name: 'subjectKeyIdentifier' },
  ])
  cert.sign(privateKey, forge.md.sha256.create())
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(privateKey, [cert], password, { algorithm: '3des', friendlyName: name })
  const der = forge.asn1.toDer(p12Asn1).getBytes()
  const out = new Uint8Array(der.length)
  for (let i = 0; i < der.length; i++) out[i] = der.charCodeAt(i)
  return out
}

function pdfDateString(d) {
  const pad = (n) => String(Math.abs(n)).padStart(2, '0')
  const off = -d.getTimezoneOffset()
  return `D:${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${off >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(off) / 60))}'${pad(Math.abs(off) % 60)}'`
}

/**
 * Sign `pdfDoc` (a loaded pdf-lib PDFDocument).
 * `appearance` (optional): { pageIndex, rect:[x,y,w,h] in PDF user space, draw(page) } — draws a visible stamp.
 */
export async function signPdf(pdfDoc, { key, cert, chain = [] }, { reason, location, contactInfo, name, appearance } = {}) {
  const forge = await getForge()
  const { PDFName, PDFNumber, PDFHexString, PDFString, PDFArray } = await import('pdf-lib')
  const ctx = pdfDoc.context
  const pages = pdfDoc.getPages()
  const pageIndex = appearance?.pageIndex ?? 0
  const page = pages[Math.min(pageIndex, pages.length - 1)]
  const now = new Date()

  if (appearance?.draw) await appearance.draw(page)

  const byteRange = PDFArray.withContext(ctx)
  byteRange.push(PDFNumber.of(0))
  byteRange.push(PDFName.of('**********'))
  byteRange.push(PDFName.of('**********'))
  byteRange.push(PDFName.of('**********'))

  const sigDict = ctx.obj({
    Type: 'Sig',
    Filter: 'Adobe.PPKLite',
    SubFilter: 'adbe.pkcs7.detached',
    ByteRange: byteRange,
    Contents: PDFHexString.of('0'.repeat(SIG_BYTES * 2)),
    M: PDFString.of(pdfDateString(now)),
    ...(reason ? { Reason: PDFHexString.fromText(reason) } : {}),
    ...(location ? { Location: PDFHexString.fromText(location) } : {}),
    ...(contactInfo ? { ContactInfo: PDFHexString.fromText(contactInfo) } : {}),
    ...(name ? { Name: PDFHexString.fromText(name) } : {}),
  })
  const sigRef = ctx.register(sigDict)

  const acroForm = pdfDoc.catalog.getOrCreateAcroForm()
  const existing = acroForm.getAllFields().length
  const rect = appearance?.rect ? [appearance.rect[0], appearance.rect[1], appearance.rect[0] + appearance.rect[2], appearance.rect[1] + appearance.rect[3]] : [0, 0, 0, 0]
  const widget = ctx.obj({
    Type: 'Annot',
    Subtype: 'Widget',
    FT: 'Sig',
    Rect: rect,
    V: sigRef,
    T: PDFHexString.fromText(`Signature${existing + 1}`),
    F: 132, // Print + Locked
    P: page.ref,
  })
  const widgetRef = ctx.register(widget)
  page.node.addAnnot(widgetRef)
  acroForm.addField(widgetRef)
  acroForm.dict.set(PDFName.of('SigFlags'), PDFNumber.of(3))

  // Object streams would compress the signature dictionary, so they must be off.
  const pdf = await pdfDoc.save({ useObjectStreams: false, addDefaultPage: false })
  const text = bytesToLatin1(pdf)

  const brPos = text.indexOf(BR_PLACEHOLDER)
  if (brPos < 0) throw new Error('Could not prepare the signature placeholder.')
  const contentsTag = text.indexOf('/Contents <', brPos)
  const cStart = contentsTag + '/Contents '.length
  const cEnd = text.indexOf('>', cStart) + 1
  if (contentsTag < 0 || cEnd - cStart !== SIG_BYTES * 2 + 2) throw new Error('Could not locate the signature placeholder.')

  const br = [0, cStart, cEnd, pdf.length - cEnd]
  const brText = `/ByteRange [${br.join(' ')}]`.padEnd(BR_PLACEHOLDER.length, ' ')
  for (let i = 0; i < brText.length; i++) pdf[brPos + i] = brText.charCodeAt(i)

  // PKCS#7 detached signature over both byte ranges.
  const data = bytesToLatin1(pdf.subarray(0, cStart)) + bytesToLatin1(pdf.subarray(cEnd))
  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(data)
  p7.addCertificate(cert)
  chain.forEach((c) => p7.addCertificate(c))
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: now },
    ],
  })
  p7.sign({ detached: true })
  const hex = forge.util.bytesToHex(forge.asn1.toDer(p7.toAsn1()).getBytes())
  if (hex.length > SIG_BYTES * 2) throw new Error('The certificate chain is too large to embed.')
  const padded = hex.padEnd(SIG_BYTES * 2, '0')
  for (let i = 0; i < padded.length; i++) pdf[cStart + 1 + i] = padded.charCodeAt(i)
  return pdf
}
