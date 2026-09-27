// Thin wrapper around QPDF compiled to WebAssembly. Every call gets a fresh
// instance so no file data survives between operations.
let factoryPromise = null

function getFactory() {
  if (!factoryPromise) {
    factoryPromise = Promise.all([
      import('@neslinesli93/qpdf-wasm'),
      import('@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url'),
    ]).then(([mod, wasm]) => ({ create: mod.default || mod, wasmUrl: wasm.default }))
  }
  return factoryPromise
}

export class QpdfError extends Error {
  constructor(message, code, log) {
    super(message)
    this.code = code
    this.log = log
  }
}

/**
 * Run qpdf with `args`. `input` bytes are written to /in.pdf; the result is read from /out.pdf.
 * Use the placeholders IN and OUT in args.
 */
export async function runQpdf(input, args) {
  const { create, wasmUrl } = await getFactory()
  const log = []
  // The emscripten build binds console.error at instantiation time, so capture it for this instance only.
  const origErr = console.error
  const origLog = console.log
  console.error = (...a) => log.push(a.join(' '))
  console.log = (...a) => log.push(a.join(' '))
  let q
  try {
    q = await create({ locateFile: () => wasmUrl, noInitialRun: true })
  } finally {
    console.error = origErr
    console.log = origLog
  }
  q.FS.writeFile('/in.pdf', input instanceof Uint8Array ? input : new Uint8Array(input))
  const real = args.map((a) => (a === 'IN' ? '/in.pdf' : a === 'OUT' ? '/out.pdf' : a))
  let code
  try {
    code = q.callMain(real)
  } catch (e) {
    code = typeof e?.status === 'number' ? e.status : 2
  }
  const text = log.join('\n')
  // qpdf exit codes: 0 ok, 3 ok with warnings, 2 error.
  if (code !== 0 && code !== 3) {
    if (/invalid password/i.test(text)) throw new QpdfError('The password is incorrect.', 'password', text)
    throw new QpdfError(text.split('\n').filter(Boolean).pop()?.replace(/^.*?:\s*/, '') || 'The PDF could not be processed.', 'error', text)
  }
  let out
  try {
    out = q.FS.readFile('/out.pdf')
  } catch {
    throw new QpdfError('The PDF could not be processed.', 'error', text)
  }
  return { bytes: out, warnings: code === 3 ? text : '' }
}

export const qpdfDecrypt = (bytes, password = '') =>
  runQpdf(bytes, ['--decrypt', `--password=${password}`, 'IN', 'OUT'])

/** AES-256 encryption with permission flags. */
export function qpdfEncrypt(bytes, { userPassword, ownerPassword, print = 'full', modify = 'none', extract = true, annotate = false, form = true, assemble = false }) {
  return runQpdf(bytes, [
    '--encrypt', userPassword, ownerPassword, '256',
    `--print=${print}`,
    `--modify=${modify}`,
    `--extract=${extract ? 'y' : 'n'}`,
    `--annotate=${annotate ? 'y' : 'n'}`,
    `--form=${form ? 'y' : 'n'}`,
    `--assemble=${assemble ? 'y' : 'n'}`,
    '--', 'IN', 'OUT',
  ])
}

/** Lossless structural optimisation. */
export const qpdfOptimize = (bytes, { linearize = false } = {}) =>
  runQpdf(bytes, [
    '--object-streams=generate', '--compress-streams=y', '--recompress-flate', '--compression-level=9',
    '--remove-unreferenced-resources=yes', ...(linearize ? ['--linearize'] : []), 'IN', 'OUT',
  ])

export const qpdfRepair = (bytes) => runQpdf(bytes, ['--object-streams=preserve', 'IN', 'OUT'])
