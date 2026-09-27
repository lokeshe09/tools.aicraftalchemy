// FFmpeg compiled to WebAssembly (single-threaded core, no special server headers needed).
// The engine (~30 MB) is downloaded from a public CDN the first time a media tool runs;
// your media files are never uploaded.
const CORE_VERSION = '0.12.10'
const CORE_BASE = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`

let loading = null

async function getFFmpeg(progress) {
  if (!loading) {
    loading = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import('@ffmpeg/ffmpeg'), import('@ffmpeg/util')])
      const ffmpeg = new FFmpeg()
      progress?.('Downloading media engine (first time only)…')
      await ffmpeg.load({
        coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
      })
      return ffmpeg
    })().catch((e) => {
      loading = null
      throw new Error(`The media engine could not be loaded (${e.message}). Check your internet connection and try again.`)
    })
  }
  return loading
}

let busy = Promise.resolve()

/**
 * Run ffmpeg. `args` may contain the placeholders INPUT and OUTPUT.
 * Returns a Blob of `outName`.
 */
export function runFFmpeg(file, args, outName, mime, progress) {
  const job = busy.then(async () => {
    const ffmpeg = await getFFmpeg(progress)
    const ext = (file.name.match(/\.[^.]+$/)?.[0] || '.bin').toLowerCase()
    const inName = `input${ext}`
    const logs = []
    const onLog = ({ message }) => { logs.push(message); if (logs.length > 200) logs.shift() }
    const onProgress = ({ progress: p }) => {
      if (p >= 0 && p <= 1) progress?.(`Processing… ${Math.round(p * 100)}%`)
    }
    ffmpeg.on('log', onLog)
    ffmpeg.on('progress', onProgress)
    try {
      progress?.('Reading file…')
      await ffmpeg.writeFile(inName, new Uint8Array(await file.arrayBuffer()))
      const real = args.map((a) => (a === 'INPUT' ? inName : a === 'OUTPUT' ? outName : a))
      const code = await ffmpeg.exec(real)
      let data
      try {
        data = await ffmpeg.readFile(outName)
      } catch {
        data = null
      }
      if (code !== 0 || !data || !data.length) {
        const hint = logs.filter((l) => /error|invalid|not supported|could not|no such|does not contain/i.test(l)).slice(-2).join(' ')
        throw new Error(hint ? `Conversion failed: ${hint}` : 'Conversion failed. The file may be damaged or use an unsupported codec.')
      }
      return new Blob([data], { type: mime })
    } finally {
      ffmpeg.off('log', onLog)
      ffmpeg.off('progress', onProgress)
      try { await ffmpeg.deleteFile(inName) } catch { /* not created */ }
      try { await ffmpeg.deleteFile(outName) } catch { /* not created */ }
    }
  })
  busy = job.catch(() => {})
  return job
}

/** Probe duration (seconds) / dimensions with the browser's own decoder (fast, no ffmpeg). */
export function probeMedia(file) {
  return new Promise((resolve) => {
    const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi|m4v|3gp|ogv|flv|wmv)$/i.test(file.name)
    const el = document.createElement(isVideo ? 'video' : 'audio')
    const url = URL.createObjectURL(file)
    el.preload = 'metadata'
    el.onloadedmetadata = () => {
      resolve({ duration: isFinite(el.duration) ? el.duration : 0, width: el.videoWidth || 0, height: el.videoHeight || 0, url })
    }
    el.onerror = () => resolve({ duration: 0, width: 0, height: 0, url })
    el.src = url
  })
}
