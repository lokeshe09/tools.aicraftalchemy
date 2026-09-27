// Helpers for unlocking digitally signed PDFs (e.g. e-Aadhaar).
//
// A digital signature is a hash of the file's exact bytes. Unlocking has to rewrite those bytes,
// so the original signature can never stay valid in the unlocked copy. What we can do honestly:
//  • verify the original first (it's still intact),
//  • replace the now-broken signature box with a clear "verified" stamp stating who signed and when,
//  • embed the untouched original inside the copy so anyone can still check the real signature.
import { getPdfLib, pageFrame } from './pdfDoc'

const fmtWhen = (d) =>
  d instanceof Date && !isNaN(d)
    ? d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZoneName: 'short' })
    : 'unknown'

const ascii = (s) => String(s || '').replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, ' ').trim()

/** One entry per signature in a verifyPdfSignatures() result. */
export function summarize(verification, describeCert) {
  return (verification?.signatures || []).map((s) => {
    const cert = describeCert(s.signer)
    return {
      key: s.byteRange.join(','),
      valid: !s.error && s.integrity && s.sigValid,
      signer: cert?.name || s.name || 'Unknown signer',
      org: cert?.org || '',
      when: s.timestamp?.time || s.signingTime || s.pdfDate || null,
    }
  })
}

/** Locate signature widgets (and their fields) in a pdf-lib document. */
function findSignatureWidgets(doc, L) {
  const { PDFName, PDFArray, PDFDict, PDFNumber } = L
  const out = []
  doc.getPages().forEach((page, pageIndex) => {
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray)
    if (!annots) return
    for (let i = 0; i < annots.size(); i++) {
      const ref = annots.get(i)
      const widget = doc.context.lookup(ref)
      if (!(widget instanceof PDFDict) || widget.get(PDFName.of('Subtype')) !== PDFName.of('Widget')) continue
      let field = widget
      let fieldRef = ref
      if (!widget.get(PDFName.of('FT')) && widget.get(PDFName.of('Parent'))) {
        fieldRef = widget.get(PDFName.of('Parent'))
        field = doc.context.lookup(fieldRef)
      }
      if (!(field instanceof PDFDict) || field.get(PDFName.of('FT')) !== PDFName.of('Sig')) continue
      const value = field.lookup(PDFName.of('V'))
      const br = value instanceof PDFDict ? value.lookup(PDFName.of('ByteRange')) : null
      const key = br instanceof PDFArray ? br.asArray().map((n) => (n instanceof PDFNumber ? n.asNumber() : NaN)).join(',') : null
      const rectArr = widget.lookup(PDFName.of('Rect'))
      const rect = rectArr instanceof PDFArray ? rectArr.asRectangle() : null
      out.push({ page, pageIndex, ref, widget, field, fieldRef, valueRef: field.get(PDFName.of('V')), key, rect })
    }
  })
  return out
}

/** Remove a signature widget + field (and the signature value object) from the document. */
function removeSignature(doc, L, sig) {
  const { PDFName, PDFArray, PDFDict, PDFRef } = L
  const annots = sig.page.node.lookupMaybe(PDFName.of('Annots'), PDFArray)
  if (annots) {
    const keep = annots.asArray().filter((r) => r !== sig.ref)
    if (keep.length) sig.page.node.set(PDFName.of('Annots'), doc.context.obj(keep))
    else sig.page.node.delete(PDFName.of('Annots'))
  }
  // A widget may be a kid of a field that has other widgets: only drop the field when it's empty.
  let removeField = true
  if (sig.field !== sig.widget) {
    const kids = sig.field.lookupMaybe(PDFName.of('Kids'), PDFArray)
    const rest = kids ? kids.asArray().filter((r) => r !== sig.ref) : []
    if (rest.length) {
      sig.field.set(PDFName.of('Kids'), doc.context.obj(rest))
      removeField = false
    }
  }
  const acro = doc.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict)
  if (acro && removeField) {
    const fields = acro.lookupMaybe(PDFName.of('Fields'), PDFArray)
    if (fields) {
      const remaining = fields.asArray().filter((r) => r !== sig.fieldRef)
      acro.set(PDFName.of('Fields'), doc.context.obj(remaining))
      const anySig = remaining.some((r) => doc.context.lookup(r)?.get?.(PDFName.of('FT')) === PDFName.of('Sig'))
      if (!anySig) acro.delete(PDFName.of('SigFlags'))
    }
  }
  if (removeField) {
    if (sig.valueRef instanceof PDFRef) doc.context.delete(sig.valueRef)
    if (sig.fieldRef instanceof PDFRef && sig.fieldRef !== sig.ref) doc.context.delete(sig.fieldRef)
  }
  doc.context.delete(sig.ref)
}

/** Draw an upright "verified" stamp filling the PDF-space rectangle `rect`. Returns false if it's too small. */
async function drawStamp(doc, L, page, rect, info, fonts) {
  const { rgb, degrees } = L
  const fr = pageFrame(page)
  const corners = [fr.unmap(rect.x, rect.y), fr.unmap(rect.x + rect.width, rect.y + rect.height)]
  const vx = Math.min(corners[0].vx, corners[1].vx)
  const vy = Math.min(corners[0].vy, corners[1].vy)
  const w = Math.abs(corners[0].vx - corners[1].vx)
  const h = Math.abs(corners[0].vy - corners[1].vy)
  if (w < 50 || h < 16) return false

  const green = rgb(0.05, 0.5, 0.25)
  page.drawRectangle({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, color: rgb(0.94, 0.99, 0.95), borderColor: green, borderWidth: 0.8 })

  const pad = Math.max(2, Math.min(w, h) * 0.06)
  const tick = Math.min(h - pad * 2, w * 0.2)
  const lines = [
    [fonts.bold, 'Digital signature verified'],
    [fonts.regular, `Signed by: ${ascii(info.signer)}`],
    [fonts.regular, `Date: ${ascii(fmtWhen(info.when))}`],
    ...(info.attached ? [[fonts.regular, 'Original signed PDF attached']] : []),
    [fonts.regular, `Checked with tools.aicraftalchemy, ${ascii(fmtWhen(info.checkedAt)).replace(/, \d\d:\d\d:\d\d.*$/, '')}`],
  ]
  const textW = w - tick - pad * 3
  const byHeight = (h - pad * 2) / (lines.length * 1.22)
  const byWidth = Math.min(...lines.map(([f, t]) => textW / Math.max(1, f.widthOfTextAtSize(t, 1))))
  const size = Math.max(3, Math.min(11, byHeight, byWidth))

  // Tick mark, drawn as two strokes so it needs no special font.
  const tx = vx + pad
  const ty = vy + h / 2 - tick / 2
  const seg = (ax, ay, bx, by) => page.drawLine({ start: fr.map(tx + ax * tick, ty + ay * tick), end: fr.map(tx + bx * tick, ty + by * tick), thickness: Math.max(1, tick * 0.13), color: green, lineCap: 1 })
  seg(0.1, 0.55, 0.4, 0.85)
  seg(0.4, 0.85, 0.92, 0.15)

  const blockH = lines.length * size * 1.22
  let baseline = vy + (h - blockH) / 2 + size * 0.95
  for (const [font, text] of lines) {
    const p = fr.map(tx + tick + pad, baseline)
    page.drawText(text, { x: p.x, y: p.y, size, font, color: font === fonts.bold ? green : rgb(0.12, 0.2, 0.16), rotate: degrees(fr.rot) })
    baseline += size * 1.22
  }
  return true
}

/**
 * Build the unlocked copy.
 * @param decrypted  Uint8Array of the decrypted PDF
 * @param original   Uint8Array of the untouched original
 * @param options    { name, signatures: summarize(...), stamp: boolean, attach: boolean }
 * @returns { bytes, stamped, attached, invisible, skipped }
 */
export async function buildSignedUnlockCopy(decrypted, original, { name, signatures, stamp, attach }) {
  const L = await getPdfLib()
  const { PDFDocument, PDFName, StandardFonts, AFRelationship } = L
  const doc = await PDFDocument.load(decrypted, { updateMetadata: false })
  let stamped = 0
  let invisible = 0
  let skipped = 0

  if (stamp) {
    const fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) }
    const checkedAt = new Date()
    for (const sig of findSignatureWidgets(doc, L)) {
      const info = signatures.find((s) => s.key === sig.key) || (signatures.length === 1 ? signatures[0] : null)
      if (!info?.valid) { skipped++; continue }
      removeSignature(doc, L, sig)
      const hasArea = sig.rect && sig.rect.width > 1 && sig.rect.height > 1
      if (!hasArea) { invisible++; continue }
      if (await drawStamp(doc, L, sig.page, sig.rect, { ...info, attached: attach, checkedAt }, fonts)) stamped++
      else invisible++
    }
    // Certification permissions refer to the removed signature.
    if (stamped || invisible) doc.catalog.delete(PDFName.of('Perms'))
  }

  if (attach) {
    const now = new Date()
    await doc.attach(original, name.replace(/\.pdf$/i, '') + ' (original signed).pdf', {
      mimeType: 'application/pdf',
      description: 'Original digitally signed document — open this attachment to check the signature.',
      creationDate: now,
      modificationDate: now,
      afRelationship: AFRelationship.Source,
    })
    // Open the attachments panel automatically in Acrobat and other viewers.
    doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseAttachments'))
  }

  const bytes = await doc.save({ useObjectStreams: true })
  return { bytes, stamped, attached: !!attach, invisible, skipped }
}
