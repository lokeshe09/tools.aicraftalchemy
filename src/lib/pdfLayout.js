import { getPdfLib } from './pdfDoc'

/** Draw source page `src` (pdf-lib page) scaled into box (x,y,w,h) keeping it upright. */
export async function drawPageInto(out, target, src, box, { fit = 'contain' } = {}) {
  const { degrees } = await getPdfLib()
  const crop = src.getCropBox()
  const emb = await out.embedPage(src, { left: crop.x, bottom: crop.y, right: crop.x + crop.width, top: crop.y + crop.height })
  const rot = ((src.getRotation().angle % 360) + 360) % 360
  const swap = rot === 90 || rot === 270
  const vw = swap ? emb.height : emb.width
  const vh = swap ? emb.width : emb.height
  const s = fit === 'stretch' ? null : Math.min(box.w / vw, box.h / vh)
  const sx = s ?? box.w / vw
  const sy = s ?? box.h / vh
  const dw = vw * sx
  const dh = vh * sy
  const x0 = box.x + (box.w - dw) / 2
  const y0 = box.y + (box.h - dh) / 2
  const W = emb.width * (swap ? sy : sx)
  const H = emb.height * (swap ? sx : sy)
  // Rotate content clockwise by `rot` so it looks the way the source page was displayed.
  const pos = { 0: [x0, y0], 90: [x0, y0 + dh], 180: [x0 + dw, y0 + dh], 270: [x0 + dw, y0] }[rot]
  target.drawPage(emb, { x: pos[0], y: pos[1], width: W, height: H, rotate: degrees(-rot) })
}

