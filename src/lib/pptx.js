// Lightweight PowerPoint (.pptx) renderer: draws each slide to a canvas.
// Supports backgrounds, theme colours, text boxes (fonts, sizes, colours, bullets, alignment,
// autofit), placeholders inherited from layouts/masters, pictures, basic shapes, groups and tables.
const EMU = 12700 // EMU per point

const q = (el, tag) => (el ? el.getElementsByTagName(tag)[0] || null : null)
const qa = (el, tag) => (el ? Array.from(el.getElementsByTagName(tag)) : [])
const kids = (el, tag) => (el ? Array.from(el.children).filter((c) => !tag || c.tagName === tag) : [])
const attr = (el, name, def = null) => (el && el.hasAttribute(name) ? el.getAttribute(name) : def)

function resolvePath(base, target) {
  if (target.startsWith('/')) return target.slice(1)
  const parts = base.split('/').slice(0, -1)
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

function applyMods(hex, node) {
  let [r, g, b] = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
  const mod = (tag) => { const m = q(node, tag); return m ? +attr(m, 'val') / 100000 : null }
  const lumMod = mod('a:lumMod')
  const lumOff = mod('a:lumOff')
  const tint = mod('a:tint')
  const shade = mod('a:shade')
  const f = (c) => {
    let v = c / 255
    if (lumMod !== null) v *= lumMod
    if (lumOff !== null) v += lumOff
    if (tint !== null) v = v * tint + (1 - tint)
    if (shade !== null) v *= shade
    return Math.round(Math.min(1, Math.max(0, v)) * 255)
  }
  ;[r, g, b] = [f(r), f(g), f(b)]
  const alpha = mod('a:alpha')
  return alpha !== null ? `rgba(${r},${g},${b},${alpha})` : `rgb(${r},${g},${b})`
}

export async function renderPptx(buffer, { width = 1600, progress } = {}) {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(buffer)
  const parser = new DOMParser()
  const cache = new Map()
  const xml = async (path) => {
    if (!cache.has(path)) {
      const f = zip.file(path)
      cache.set(path, f ? parser.parseFromString(await f.async('string'), 'application/xml') : null)
    }
    return cache.get(path)
  }
  const rels = async (path) => {
    const relPath = path.replace(/([^/]+)$/, '_rels/$1.rels')
    const doc = await xml(relPath)
    const map = {}
    for (const r of qa(doc, 'Relationship')) map[attr(r, 'Id')] = { target: resolvePath(path, attr(r, 'Target')), type: attr(r, 'Type') || '', external: attr(r, 'TargetMode') === 'External' }
    return map
  }

  const pres = await xml('ppt/presentation.xml')
  if (!pres) throw new Error('This is not a valid PowerPoint (.pptx) file.')
  const sz = q(pres, 'p:sldSz')
  const W = sz ? +attr(sz, 'cx') / EMU : 720
  const H = sz ? +attr(sz, 'cy') / EMU : 405
  const presRels = await rels('ppt/presentation.xml')
  const slidePaths = qa(pres, 'p:sldId').map((s) => presRels[attr(s, 'r:id')]?.target).filter(Boolean)

  // Theme colours
  const themeRel = Object.values(presRels).find((r) => /theme$/.test(r.type))
  const theme = themeRel ? await xml(themeRel.target) : null
  const scheme = {}
  const cs = q(theme, 'a:clrScheme')
  for (const c of kids(cs)) {
    const name = c.tagName.replace('a:', '')
    const v = q(c, 'a:srgbClr') ? attr(q(c, 'a:srgbClr'), 'val') : q(c, 'a:sysClr') ? attr(q(c, 'a:sysClr'), 'lastClr') : null
    if (v) scheme[name] = v
  }
  const alias = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' }
  const majorFont = attr(q(q(theme, 'a:majorFont'), 'a:latin'), 'typeface') || 'Calibri'
  const minorFont = attr(q(q(theme, 'a:minorFont'), 'a:latin'), 'typeface') || 'Calibri'

  const colorOf = (parent) => {
    if (!parent) return null
    const s = kids(parent).find((c) => /a:(srgbClr|schemeClr|sysClr|prstClr)/.test(c.tagName))
    if (!s) return null
    if (s.tagName === 'a:srgbClr') return applyMods(attr(s, 'val'), s)
    if (s.tagName === 'a:sysClr') return applyMods(attr(s, 'lastClr') || '000000', s)
    if (s.tagName === 'a:prstClr') return attr(s, 'val')
    const v = attr(s, 'val')
    const hex = scheme[alias[v] || v]
    return hex ? applyMods(hex, s) : null
  }
  // Only a *direct* solidFill child counts (a nested one may belong to the outline).
  const solid = (el) => (el ? colorOf(kids(el, 'a:solidFill')[0]) : null)

  const scale = width / W
  const px = (emu) => (emu / EMU) * scale

  async function loadImage(path) {
    const f = zip.file(path)
    if (!f) return null
    const blob = await f.async('blob')
    const ext = path.split('.').pop().toLowerCase()
    if (['emf', 'wmf', 'tif', 'tiff'].includes(ext)) return null
    const typed = new Blob([blob], { type: ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}` })
    try { return await createImageBitmap(typed) } catch {
      const url = URL.createObjectURL(typed)
      try {
        return await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
      } catch { return null } finally { setTimeout(() => URL.revokeObjectURL(url), 1000) }
    }
  }

  function xfrmOf(el) {
    const x = q(el, 'a:xfrm')
    if (!x) return null
    const off = q(x, 'a:off')
    const ext = q(x, 'a:ext')
    if (!off || !ext) return null
    return { x: +attr(off, 'x'), y: +attr(off, 'y'), w: +attr(ext, 'cx'), h: +attr(ext, 'cy'), rot: +attr(x, 'rot', 0) / 60000, flipH: attr(x, 'flipH') === '1', flipV: attr(x, 'flipV') === '1' }
  }

  function phKey(sp) {
    const ph = q(q(sp, 'p:nvPr'), 'p:ph')
    if (!ph) return null
    return { type: attr(ph, 'type', 'body'), idx: attr(ph, 'idx') }
  }
  function findPh(doc, key) {
    if (!doc || !key) return null
    const sps = qa(doc, 'p:sp')
    return sps.find((s) => { const k = phKey(s); return k && key.idx != null && k.idx === key.idx })
      || sps.find((s) => { const k = phKey(s); return k && k.type === key.type })
      || (/title|ctrTitle/.test(key.type) ? sps.find((s) => /title/i.test(phKey(s)?.type || '')) : null)
  }

  function defaultSize(master, key, lvl) {
    const styles = q(master, 'p:txStyles')
    const group = !key ? q(styles, 'p:otherStyle') : /title/i.test(key.type) ? q(styles, 'p:titleStyle') : q(styles, 'p:bodyStyle')
    const lp = q(group, `a:lvl${lvl + 1}pPr`)
    const d = q(lp, 'a:defRPr')
    return d && attr(d, 'sz') ? +attr(d, 'sz') / 100 : !key ? 18 : /title/i.test(key.type) ? 40 : [28, 24, 20, 18, 18][lvl] || 18
  }

  async function drawBackground(ctx, docs) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, H * scale)
    for (const { doc, path } of docs) {
      const bg = q(q(doc, 'p:cSld'), 'p:bg')
      if (!bg) continue
      const pr = q(bg, 'p:bgPr')
      const c = solid(pr) || colorOf(q(bg, 'p:bgRef'))
      if (c) { ctx.fillStyle = c; ctx.fillRect(0, 0, width, H * scale); return }
      const grad = q(pr, 'a:gradFill')
      if (grad) {
        const stops = qa(grad, 'a:gs')
        const g = ctx.createLinearGradient(0, 0, 0, H * scale)
        stops.forEach((s) => { const col = colorOf(s); if (col) g.addColorStop(+attr(s, 'pos') / 100000, col) })
        ctx.fillStyle = g
        ctx.fillRect(0, 0, width, H * scale)
        return
      }
      const blip = q(q(pr, 'a:blipFill'), 'a:blip')
      if (blip) {
        const r = (await rels(path))[attr(blip, 'r:embed')]
        const img = r && (await loadImage(r.target))
        if (img) { ctx.drawImage(img, 0, 0, width, H * scale); return }
      }
    }
  }

  function wrapText(ctx, runs, maxW) {
    // runs: [{text, font, color, size, u}] → lines of segments
    const lines = []
    let line = []
    let lineW = 0
    for (const run of runs) {
      if (run.br) { lines.push(line); line = []; lineW = 0; continue }
      ctx.font = run.font
      const words = run.text.split(/(\s+)/)
      for (const word of words) {
        if (!word) continue
        const w = ctx.measureText(word).width
        if (lineW + w > maxW && line.length && !/^\s+$/.test(word)) {
          lines.push(line)
          line = []
          lineW = 0
        }
        if (!line.length && /^\s+$/.test(word)) continue
        line.push({ ...run, text: word, w })
        lineW += w
      }
    }
    lines.push(line)
    return lines
  }

  async function drawText(ctx, sp, box, key, layoutSp, masterSp, master) {
    const body = q(sp, 'p:txBody')
    if (!body) return
    const bodyPr = q(body, 'a:bodyPr')
    const inherit = (tag, name) => attr(q(bodyPr, tag), name) ?? attr(q(q(layoutSp, 'a:bodyPr'), tag), name) ?? attr(q(q(masterSp, 'a:bodyPr'), tag), name)
    const anchor = attr(bodyPr, 'anchor') || attr(q(layoutSp, 'a:bodyPr'), 'anchor') || attr(q(masterSp, 'a:bodyPr'), 'anchor') || (key && /title/i.test(key.type) ? 'ctr' : 't')
    const ins = (n, d) => px(+(attr(bodyPr, n) ?? d))
    const l = ins('lIns', 91440), r = ins('rIns', 91440), t = ins('tIns', 45720), b = ins('bIns', 45720)
    const fontScale = +(inherit('a:normAutofit', 'fontScale') || 100000) / 100000
    const spacingScale = 1 - +(inherit('a:normAutofit', 'lnSpcReduction') || 0) / 100000
    const maxW = Math.max(10, box.w - l - r)

    const paraBlocks = []
    let autoNum = 0
    for (const p of kids(body, 'a:p')) {
      const pPr = q(p, 'a:pPr')
      const lvl = +attr(pPr, 'lvl', 0)
      const algn = attr(pPr, 'algn') || (key && /ctrTitle|subTitle/.test(key.type) ? 'ctr' : 'l')
      const base = defaultSize(master, key, lvl)
      const endSz = attr(q(p, 'a:endParaRPr'), 'sz')
      const runs = []
      for (const c of kids(p)) {
        if (c.tagName === 'a:br') { runs.push({ br: true }); continue }
        if (c.tagName !== 'a:r' && c.tagName !== 'a:fld') continue
        const rPr = q(c, 'a:rPr')
        const size = (attr(rPr, 'sz') ? +attr(rPr, 'sz') / 100 : endSz ? +endSz / 100 : base) * fontScale
        const bold = attr(rPr, 'b') === '1'
        const italic = attr(rPr, 'i') === '1'
        const face = attr(q(rPr, 'a:latin'), 'typeface')
        const family = !face || face.startsWith('+mj') ? (key && /title/i.test(key.type) ? majorFont : minorFont) : face.startsWith('+mn') ? minorFont : face
        const color = solid(rPr) || solid(q(q(layoutSp, 'a:lstStyle'), 'a:defRPr')) || (scheme.dk1 ? `#${scheme.dk1}` : '#000')
        const text = q(c, 'a:t')?.textContent || ''
        runs.push({ text, size, color, u: attr(rPr, 'u') && attr(rPr, 'u') !== 'none', font: `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${px(size * EMU)}px "${family}", Calibri, Arial, sans-serif` })
      }
      const hasText = runs.some((x) => x.text?.trim())
      const bu = q(pPr, 'a:buChar')
      const buAuto = q(pPr, 'a:buAutoNum')
      const noBu = q(pPr, 'a:buNone')
      let bullet = ''
      if (hasText && !noBu) {
        if (bu) bullet = attr(bu, 'char') || '•'
        else if (buAuto) bullet = `${++autoNum}.`
        else if (key && key.type === 'body' && !q(pPr, 'a:buNone') && masterSp) bullet = '•'
      }
      const size = runs.find((x) => x.size)?.size || (endSz ? +endSz / 100 : base) * fontScale
      const indent = px(+(attr(pPr, 'marL') ?? (lvl * 457200 + (bullet ? 342900 : 0))))
      paraBlocks.push({ runs, algn, bullet, size, indent, lvl })
    }

    const lineH = (s) => px(s * EMU) * 1.2 * spacingScale
    const laid = paraBlocks.map((pb) => {
      const lines = wrapText(ctx, pb.runs, Math.max(10, maxW - pb.indent))
      return { ...pb, lines, height: lines.length * lineH(pb.size) + lineH(pb.size) * 0.2 }
    })
    const total = laid.reduce((s, x) => s + x.height, 0)
    let y = box.y + t
    if (anchor === 'ctr') y = box.y + (box.h - total) / 2
    else if (anchor === 'b') y = box.y + box.h - b - total

    for (const pb of laid) {
      const lh = lineH(pb.size)
      pb.lines.forEach((line, li) => {
        const lw = line.reduce((s, seg) => s + seg.w, 0)
        let x = box.x + l + pb.indent
        if (pb.algn === 'ctr') x = box.x + l + pb.indent + (maxW - pb.indent - lw) / 2
        else if (pb.algn === 'r') x = box.x + box.w - r - lw
        const baseline = y + lh * 0.82
        if (li === 0 && pb.bullet && line.length) {
          ctx.font = line[0].font
          ctx.fillStyle = line[0].color
          ctx.fillText(pb.bullet, x - px(285750), baseline)
        }
        for (const seg of line) {
          ctx.font = seg.font
          ctx.fillStyle = seg.color
          ctx.fillText(seg.text, x, baseline)
          if (seg.u) ctx.fillRect(x, baseline + 2, seg.w, Math.max(1, px(seg.size * EMU) / 16))
          x += seg.w
        }
        y += lh
      })
      y += lh * 0.2
    }
  }

  function shapePath(ctx, geom, box) {
    ctx.beginPath()
    if (geom === 'ellipse') ctx.ellipse(box.x + box.w / 2, box.y + box.h / 2, box.w / 2, box.h / 2, 0, 0, Math.PI * 2)
    else if (geom === 'roundRect') {
      const rr = Math.min(box.w, box.h) * 0.16
      ctx.roundRect ? ctx.roundRect(box.x, box.y, box.w, box.h, rr) : ctx.rect(box.x, box.y, box.w, box.h)
    } else if (geom === 'triangle') { ctx.moveTo(box.x + box.w / 2, box.y); ctx.lineTo(box.x + box.w, box.y + box.h); ctx.lineTo(box.x, box.y + box.h); ctx.closePath() }
    else if (geom === 'line' || geom === 'straightConnector1') { ctx.moveTo(box.x, box.y); ctx.lineTo(box.x + box.w, box.y + box.h) }
    else ctx.rect(box.x, box.y, box.w, box.h)
  }

  async function drawTree(ctx, tree, path, ctxDocs, map = (x) => x) {
    const { layout, master } = ctxDocs
    for (const el of kids(tree)) {
      if (el.tagName === 'p:grpSp') {
        const gx = q(q(el, 'p:grpSpPr'), 'a:xfrm')
        const off = q(gx, 'a:off'), ext = q(gx, 'a:ext'), chOff = q(gx, 'a:chOff'), chExt = q(gx, 'a:chExt')
        const inner = (b) => {
          if (!off || !chExt || +attr(chExt, 'cx') === 0) return map(b)
          const sx = +attr(ext, 'cx') / +attr(chExt, 'cx')
          const sy = +attr(ext, 'cy') / (+attr(chExt, 'cy') || 1)
          return map({ ...b, x: +attr(off, 'x') + (b.x - +attr(chOff, 'x')) * sx, y: +attr(off, 'y') + (b.y - +attr(chOff, 'y')) * sy, w: b.w * sx, h: b.h * sy })
        }
        await drawTree(ctx, el, path, ctxDocs, inner)
        continue
      }
      if (el.tagName === 'p:pic') {
        const x = xfrmOf(q(el, 'p:spPr'))
        const blip = q(el, 'a:blip')
        if (!x || !blip) continue
        const rel = (await rels(path))[attr(blip, 'r:embed')]
        const img = rel && !rel.external && (await loadImage(rel.target))
        if (!img) continue
        const b = map(x)
        const src = q(q(el, 'p:blipFill'), 'a:srcRect')
        const iw = img.width, ih = img.height
        const cl = +attr(src, 'l', 0) / 1e5, ct = +attr(src, 't', 0) / 1e5, cr = +attr(src, 'r', 0) / 1e5, cb = +attr(src, 'b', 0) / 1e5
        ctx.save()
        ctx.translate(px(b.x + b.w / 2), px(b.y + b.h / 2))
        if (x.rot) ctx.rotate((x.rot * Math.PI) / 180)
        ctx.drawImage(img, iw * cl, ih * ct, iw * (1 - cl - cr), ih * (1 - ct - cb), -px(b.w) / 2, -px(b.h) / 2, px(b.w), px(b.h))
        ctx.restore()
        continue
      }
      if (el.tagName === 'p:graphicFrame') {
        const tbl = q(el, 'a:tbl')
        const x = xfrmOf(q(el, 'p:xfrm')) || (() => { const xf = q(el, 'p:xfrm'); const o = q(xf, 'a:off'); const e = q(xf, 'a:ext'); return o && e ? { x: +attr(o, 'x'), y: +attr(o, 'y'), w: +attr(e, 'cx'), h: +attr(e, 'cy') } : null })()
        if (!tbl || !x) continue
        const b = map(x)
        const cols = qa(tbl, 'a:gridCol').map((c) => +attr(c, 'w'))
        let yy = b.y
        for (const tr of qa(tbl, 'a:tr')) {
          const rh = Math.max(+attr(tr, 'h', 0), 370840)
          let xx = b.x
          qa(tr, 'a:tc').forEach((tc, ci) => {
            const cw = cols[ci] || b.w / cols.length
            const cell = { x: px(xx), y: px(yy), w: px(cw), h: px(rh) }
            const fill = solid(q(tc, 'a:tcPr'))
            ctx.fillStyle = fill || 'rgba(0,0,0,0)'
            if (fill) ctx.fillRect(cell.x, cell.y, cell.w, cell.h)
            ctx.strokeStyle = '#9e9e9e'
            ctx.lineWidth = 1
            ctx.strokeRect(cell.x, cell.y, cell.w, cell.h)
            const txt = qa(tc, 'a:t').map((n) => n.textContent).join(' ')
            ctx.fillStyle = '#111'
            ctx.font = `${px(12 * EMU)}px Calibri, Arial, sans-serif`
            ctx.save()
            ctx.beginPath(); ctx.rect(cell.x, cell.y, cell.w, cell.h); ctx.clip()
            ctx.fillText(txt, cell.x + 6, cell.y + px(rh) / 2 + px(4 * EMU))
            ctx.restore()
            xx += cw
          })
          yy += rh
        }
        continue
      }
      if (el.tagName !== 'p:sp' && el.tagName !== 'p:cxnSp') continue
      const key = phKey(el)
      const layoutSp = findPh(layout, key)
      const masterSp = findPh(master, key)
      const spPr = q(el, 'p:spPr')
      const x = xfrmOf(spPr) || xfrmOf(q(layoutSp, 'p:spPr')) || xfrmOf(q(masterSp, 'p:spPr'))
      if (!x) continue
      const b = map(x)
      const box = { x: px(b.x), y: px(b.y), w: px(b.w), h: px(b.h) }
      const geom = attr(q(spPr, 'a:prstGeom'), 'prst') || 'rect'
      const style = q(el, 'p:style')
      const isTextBox = attr(q(el, 'p:cNvSpPr'), 'txBox') === '1'
      const themed = !!style && !key && !isTextBox
      let fill = null
      if (!kids(spPr, 'a:noFill').length) {
        fill = solid(spPr)
        if (!fill && themed && el.tagName === 'p:sp' && attr(q(style, 'a:fillRef'), 'idx', '0') !== '0') fill = colorOf(q(style, 'a:fillRef'))
      }
      const ln = q(spPr, 'a:ln')
      let stroke = null
      if (!(ln && kids(ln, 'a:noFill').length)) {
        stroke = ln ? solid(ln) : null
        if (!stroke && themed && attr(q(style, 'a:lnRef'), 'idx', '0') !== '0') stroke = colorOf(q(style, 'a:lnRef'))
      }
      ctx.save()
      if (x.rot) {
        ctx.translate(box.x + box.w / 2, box.y + box.h / 2)
        ctx.rotate((x.rot * Math.PI) / 180)
        ctx.translate(-(box.x + box.w / 2), -(box.y + box.h / 2))
      }
      if (fill) { shapePath(ctx, geom, box); ctx.fillStyle = fill; ctx.fill() }
      if (stroke) { shapePath(ctx, geom, box); ctx.strokeStyle = stroke; ctx.lineWidth = Math.max(1, px(+attr(ln, 'w', 12700))); ctx.stroke() }
      await drawText(ctx, el, box, key, layoutSp, masterSp, master)
      ctx.restore()
    }
  }

  const canvases = []
  for (let i = 0; i < slidePaths.length; i++) {
    progress?.(`Rendering slide ${i + 1} of ${slidePaths.length}`)
    const path = slidePaths[i]
    const slide = await xml(path)
    if (!slide) continue
    const sRels = await rels(path)
    const layoutPath = Object.values(sRels).find((r) => /slideLayout$/.test(r.type))?.target
    const layout = layoutPath ? await xml(layoutPath) : null
    const masterPath = layoutPath ? Object.values(await rels(layoutPath)).find((r) => /slideMaster$/.test(r.type))?.target : null
    const master = masterPath ? await xml(masterPath) : null

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = Math.round(H * scale)
    const ctx = canvas.getContext('2d')
    ctx.textBaseline = 'alphabetic'
    await drawBackground(ctx, [{ doc: slide, path }, { doc: layout, path: layoutPath }, { doc: master, path: masterPath }].filter((d) => d.doc))
    // Master / layout decorations (non-placeholder shapes) first, unless the slide hides them.
    const docsCtx = { layout, master }
    if (attr(slide.documentElement, 'showMasterSp') !== '0') {
      for (const [doc, p] of [[master, masterPath], [layout, layoutPath]]) {
        const tree = q(q(doc, 'p:cSld'), 'p:spTree')
        if (!tree) continue
        const deco = tree.cloneNode(true)
        for (const sp of kids(deco)) if (phKey(sp)) deco.removeChild(sp)
        await drawTree(ctx, deco, p, { layout: null, master: null })
      }
    }
    await drawTree(ctx, q(q(slide, 'p:cSld'), 'p:spTree'), path, docsCtx)
    canvases.push(canvas)
  }
  if (!canvases.length) throw new Error('No slides were found in this presentation.')
  return { canvases, width: W, height: H }
}
