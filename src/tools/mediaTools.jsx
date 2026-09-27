import { useEffect, useRef, useState } from 'react'
import FileTool from '../components/FileTool'
import { Field, Segmented, Toggle, Slider, NumberInput, Alert } from '../components/ui'
import { baseName, formatBytes } from '../lib/files'
import { runFFmpeg, probeMedia } from '../lib/ffmpeg'

const VIDEO = 'video/*,.mp4,.mov,.webm,.mkv,.avi,.m4v,.3gp,.flv,.wmv,.mpeg,.mpg,.ts,.ogv'
const AUDIO = 'audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus,.wma,.amr,.aiff,.webm'
const MEDIA = `${VIDEO},${AUDIO}`

const VIDEO_FORMATS = {
  mp4: { mime: 'video/mp4', args: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart'] },
  webm: { mime: 'video/webm', args: ['-c:v', 'libvpx', '-b:v', '1500k', '-crf', '10', '-deadline', 'realtime', '-cpu-used', '8', '-c:a', 'libvorbis', '-q:a', '4'] },
  mov: { mime: 'video/quicktime', args: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k'] },
  mkv: { mime: 'video/x-matroska', args: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '160k'] },
  avi: { mime: 'video/x-msvideo', args: ['-c:v', 'mpeg4', '-q:v', '4', '-c:a', 'libmp3lame', '-q:a', '4'] },
}
const AUDIO_FORMATS = {
  mp3: { mime: 'audio/mpeg', codec: ['-c:a', 'libmp3lame'], bitrate: true },
  m4a: { mime: 'audio/mp4', codec: ['-c:a', 'aac'], bitrate: true },
  wav: { mime: 'audio/wav', codec: ['-c:a', 'pcm_s16le'], bitrate: false },
  ogg: { mime: 'audio/ogg', codec: ['-c:a', 'libvorbis'], bitrate: true },
  opus: { mime: 'audio/ogg', codec: ['-c:a', 'libopus'], bitrate: true },
  flac: { mime: 'audio/flac', codec: ['-c:a', 'flac'], bitrate: false },
}

const fmtTime = (s) => {
  if (!isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = s - m * 60
  return `${m}:${sec < 10 ? '0' : ''}${sec.toFixed(1)}`
}
function parseTime(v) {
  const t = String(v).trim()
  if (!t) return 0
  if (/^\d+(\.\d+)?$/.test(t)) return +t
  const parts = t.split(':').map(Number)
  if (parts.some(isNaN)) return NaN
  return parts.reduce((a, p) => a * 60 + p, 0)
}

function useProbe(file) {
  const [info, setInfo] = useState(null)
  useEffect(() => {
    setInfo(null)
    if (!file) return
    let url
    probeMedia(file).then((i) => { url = i.url; setInfo(i) })
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [file])
  return info
}

function MediaPreview({ file, info, videoRef }) {
  if (!info) return null
  const isVideo = info.width > 0
  return (
    <div className="media-preview">
      {isVideo ? <video ref={videoRef} src={info.url} controls playsInline preload="metadata" /> : <audio ref={videoRef} src={info.url} controls preload="metadata" />}
      <p className="muted small">
        {file.name} · {formatBytes(file.size)}{info.duration ? ` · ${fmtTime(info.duration)}` : ''}{isVideo ? ` · ${info.width}×${info.height}` : ''}
      </p>
    </div>
  )
}

const ENGINE_NOTE = <p className="muted small">Uses FFmpeg in your browser. The media engine (~30 MB) downloads once; your files are never uploaded. Long videos can take a while.</p>

/* ---------------- Video converter ---------------- */
export function ConvertVideo() {
  const [files, setFiles] = useState([])
  const info = useProbe(files[0])
  const [to, setTo] = useState('mp4')
  const [res, setRes] = useState(0)
  return (
    <FileTool
      files={files}
      setFiles={setFiles}
      accept={VIDEO}
      formats="MP4, MOV, WEBM, MKV, AVI, M4V, 3GP, FLV, WMV, MPEG"
      actionLabel={`Convert to ${to.toUpperCase()}`}
      main={<MediaPreview file={files[0]} info={info} />}
      options={
        <>
          <h3>Convert video</h3>
          <Field label="Output format"><Segmented full value={to} onChange={setTo} options={Object.keys(VIDEO_FORMATS).map((k) => ({ value: k, label: k.toUpperCase() }))} /></Field>
          <Field label="Resolution"><Segmented full value={res} onChange={setRes} options={[{ value: 0, label: 'Original' }, { value: 1080, label: '1080p' }, { value: 720, label: '720p' }, { value: 480, label: '480p' }]} /></Field>
          {ENGINE_NOTE}
        </>
      }
      process={async ([file], progress) => {
        const f = VIDEO_FORMATS[to]
        const vf = res && info?.height > res ? ['-vf', `scale=-2:${res}`] : []
        const blob = await runFFmpeg(file, ['-i', 'INPUT', ...vf, ...f.args, 'OUTPUT'], `output.${to}`, f.mime, progress)
        return { blob, name: `${baseName(file.name)}.${to}`, originalSize: file.size }
      }}
    />
  )
}

/* ---------------- Compress video ---------------- */
export function CompressVideo() {
  const [files, setFiles] = useState([])
  const info = useProbe(files[0])
  const [mode, setMode] = useState('quality')
  const [crf, setCrf] = useState(28)
  const [target, setTarget] = useState(25)
  const [res, setRes] = useState(720)
  const [audio, setAudio] = useState('96k')
  const [speed, setSpeed] = useState('veryfast')
  return (
    <FileTool
      files={files}
      setFiles={setFiles}
      accept={VIDEO}
      actionLabel="Compress video"
      main={<MediaPreview file={files[0]} info={info} />}
      options={
        <>
          <h3>Compress video</h3>
          <Segmented full value={mode} onChange={setMode} options={[{ value: 'quality', label: 'By quality' }, { value: 'size', label: 'Target size' }]} />
          {mode === 'quality' ? (
            <Slider label="Compression (CRF — higher = smaller)" min={18} max={40} value={crf} onChange={setCrf} />
          ) : (
            <Field label="Target size (MB)" hint={info?.duration ? `≈ ${Math.max(50, Math.round((target * 8192) / info.duration - 96))} kbps video` : ''}><NumberInput min={1} max={10000} value={target} onChange={setTarget} /></Field>
          )}
          <Field label="Max resolution"><Segmented full value={res} onChange={setRes} options={[{ value: 0, label: 'Keep' }, { value: 1080, label: '1080p' }, { value: 720, label: '720p' }, { value: 480, label: '480p' }, { value: 360, label: '360p' }]} /></Field>
          <Field label="Audio"><Segmented full value={audio} onChange={setAudio} options={[{ value: '128k', label: '128k' }, { value: '96k', label: '96k' }, { value: '64k', label: '64k' }, { value: 'none', label: 'Remove' }]} /></Field>
          <Field label="Speed"><Segmented full value={speed} onChange={setSpeed} options={[{ value: 'ultrafast', label: 'Fastest' }, { value: 'veryfast', label: 'Balanced' }, { value: 'medium', label: 'Smallest' }]} /></Field>
          {ENGINE_NOTE}
        </>
      }
      process={async ([file], progress) => {
        const vf = res && info?.height > res ? ['-vf', `scale=-2:${res}`] : []
        let rate = ['-crf', String(crf)]
        if (mode === 'size') {
          if (!info?.duration) throw new Error('Could not read the video length, so a target size cannot be calculated. Use “By quality”.')
          const kbps = Math.max(50, Math.floor((target * 8192) / info.duration - (audio === 'none' ? 0 : parseInt(audio))))
          rate = ['-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.2)}k`, '-bufsize', `${kbps * 2}k`]
        }
        const a = audio === 'none' ? ['-an'] : ['-c:a', 'aac', '-b:a', audio]
        const blob = await runFFmpeg(file, ['-i', 'INPUT', ...vf, '-c:v', 'libx264', '-preset', speed, ...rate, '-pix_fmt', 'yuv420p', ...a, '-movflags', '+faststart', 'OUTPUT'], 'output.mp4', 'video/mp4', progress)
        if (blob.size >= file.size) return { blob: file, name: file.name, originalSize: file.size, note: 'The video is already well compressed — your original was kept. Try a higher CRF or lower resolution.', noteKind: 'warn' }
        return { blob, name: `${baseName(file.name)}-compressed.mp4`, originalSize: file.size }
      }}
    />
  )
}

/* ---------------- Video → GIF ---------------- */
export function VideoToGif() {
  const [files, setFiles] = useState([])
  const info = useProbe(files[0])
  const ref = useRef(null)
  const [start, setStart] = useState('0')
  const [dur, setDur] = useState(5)
  const [fps, setFps] = useState(12)
  const [width, setWidth] = useState(480)
  return (
    <FileTool
      files={files}
      setFiles={setFiles}
      accept={VIDEO}
      actionLabel="Create GIF"
      main={
        <>
          <MediaPreview file={files[0]} info={info} videoRef={ref} />
          {info && <div className="btn-row center-row"><button className="btn btn-soft btn-sm" onClick={() => setStart(ref.current.currentTime.toFixed(1))}>Start at current position</button></div>}
        </>
      }
      options={
        <>
          <h3>Video to GIF</h3>
          <div className="grid-2">
            <Field label="Start (s or m:ss)"><input className="input" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="Length (s)"><NumberInput min={0.5} max={60} step={0.5} value={dur} onChange={setDur} /></Field>
          </div>
          <Slider label="Frames per second" min={5} max={30} value={fps} onChange={setFps} />
          <Slider label="Width" suffix="px" min={120} max={1080} step={10} value={width} onChange={setWidth} />
          <p className="muted small">Uses an optimized colour palette for crisp GIFs. Keep clips short for small files.</p>
          {ENGINE_NOTE}
        </>
      }
      process={async ([file], progress) => {
        const ss = parseTime(start)
        if (isNaN(ss)) throw new Error('Start time is not valid. Use seconds (12.5) or m:ss (1:05).')
        const vf = `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=192[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4`
        const blob = await runFFmpeg(file, ['-ss', String(ss), '-t', String(dur), '-i', 'INPUT', '-vf', vf, '-loop', '0', 'OUTPUT'], 'output.gif', 'image/gif', progress)
        return { blob, name: `${baseName(file.name)}.gif` }
      }}
    />
  )
}

/* ---------------- Audio converter / extract audio ---------------- */
function AudioOut({ to, setTo, bitrate, setBitrate, mono, setMono }) {
  return (
    <>
      <Field label="Output format"><Segmented full value={to} onChange={setTo} options={Object.keys(AUDIO_FORMATS).map((k) => ({ value: k, label: k.toUpperCase() }))} /></Field>
      {AUDIO_FORMATS[to].bitrate && <Field label="Bitrate"><Segmented full value={bitrate} onChange={setBitrate} options={['96k', '128k', '192k', '256k', '320k'].map((b) => ({ value: b, label: b }))} /></Field>}
      <Toggle checked={mono} onChange={setMono} label="Mono (half the size, for voice)" />
    </>
  )
}

function audioArgs(to, bitrate, mono) {
  const f = AUDIO_FORMATS[to]
  return [...f.codec, ...(f.bitrate ? ['-b:a', bitrate] : []), ...(mono ? ['-ac', '1'] : [])]
}

export function VideoToAudio() {
  const [files, setFiles] = useState([])
  const info = useProbe(files[0])
  const [to, setTo] = useState('mp3')
  const [bitrate, setBitrate] = useState('192k')
  const [mono, setMono] = useState(false)
  return (
    <FileTool
      files={files}
      setFiles={setFiles}
      accept={VIDEO}
      actionLabel={`Extract ${to.toUpperCase()}`}
      main={<MediaPreview file={files[0]} info={info} />}
      options={<><h3>Extract audio</h3><AudioOut {...{ to, setTo, bitrate, setBitrate, mono, setMono }} />{ENGINE_NOTE}</>}
      process={async ([file], progress) => {
        const blob = await runFFmpeg(file, ['-i', 'INPUT', '-vn', ...audioArgs(to, bitrate, mono), 'OUTPUT'], `output.${to}`, AUDIO_FORMATS[to].mime, progress)
        return { blob, name: `${baseName(file.name)}.${to}` }
      }}
    />
  )
}

export function ConvertAudio() {
  const [files, setFiles] = useState([])
  const info = useProbe(files[0])
  const [to, setTo] = useState('mp3')
  const [bitrate, setBitrate] = useState('192k')
  const [mono, setMono] = useState(false)
  const [rate, setRate] = useState(0)
  return (
    <FileTool
      files={files}
      setFiles={setFiles}
      accept={MEDIA}
      formats="MP3, WAV, OGG, M4A, AAC, FLAC, OPUS, WMA, AMR, AIFF — or any video"
      actionLabel={`Convert to ${to.toUpperCase()}`}
      main={<MediaPreview file={files[0]} info={info} />}
      options={
        <>
          <h3>Convert audio</h3>
          <AudioOut {...{ to, setTo, bitrate, setBitrate, mono, setMono }} />
          <Field label="Sample rate"><Segmented full value={rate} onChange={setRate} options={[{ value: 0, label: 'Keep' }, { value: 44100, label: '44.1 kHz' }, { value: 48000, label: '48 kHz' }, { value: 22050, label: '22 kHz' }]} /></Field>
          {ENGINE_NOTE}
        </>
      }
      process={async ([file], progress) => {
        const blob = await runFFmpeg(file, ['-i', 'INPUT', '-vn', ...audioArgs(to, bitrate, mono), ...(rate ? ['-ar', String(rate)] : []), 'OUTPUT'], `output.${to}`, AUDIO_FORMATS[to].mime, progress)
        return { blob, name: `${baseName(file.name)}.${to}` }
      }}
    />
  )
}

/* ---------------- Trim ---------------- */
export function TrimMedia() {
  const [files, setFiles] = useState([])
  const info = useProbe(files[0])
  const ref = useRef(null)
  const [start, setStart] = useState('0')
  const [end, setEnd] = useState('')
  const [precise, setPrecise] = useState(true)
  useEffect(() => { if (info?.duration) setEnd(info.duration.toFixed(1)) }, [info])
  const s = parseTime(start)
  const e = parseTime(end)
  const bad = isNaN(s) || isNaN(e) || e <= s
  return (
    <FileTool
      files={files}
      setFiles={setFiles}
      accept={MEDIA}
      actionLabel="Trim"
      disabled={bad}
      main={
        <>
          <MediaPreview file={files[0]} info={info} videoRef={ref} />
          {info && (
            <div className="btn-row center-row">
              <button className="btn btn-soft btn-sm" onClick={() => setStart(ref.current.currentTime.toFixed(1))}>Set start here</button>
              <button className="btn btn-soft btn-sm" onClick={() => setEnd(ref.current.currentTime.toFixed(1))}>Set end here</button>
            </div>
          )}
        </>
      }
      options={
        <>
          <h3>Trim video / audio</h3>
          <div className="grid-2">
            <Field label="Start (s or m:ss)"><input className="input" value={start} onChange={(ev) => setStart(ev.target.value)} /></Field>
            <Field label="End (s or m:ss)"><input className="input" value={end} onChange={(ev) => setEnd(ev.target.value)} /></Field>
          </div>
          {!bad && <p className="muted small">Result length: {fmtTime(e - s)}</p>}
          {bad && <Alert kind="warn">End must be after start.</Alert>}
          <Toggle checked={precise} onChange={setPrecise} label="Frame-accurate cut" hint="Off = instant cut without re-encoding (may start at the nearest keyframe)." />
          {ENGINE_NOTE}
        </>
      }
      process={async ([file], progress) => {
        const ext = (file.name.match(/\.([^.]+)$/)?.[1] || 'mp4').toLowerCase()
        const isVideo = info?.width > 0
        const outExt = precise ? (isVideo ? 'mp4' : ext === 'wav' ? 'wav' : 'mp3') : ext
        const mime = isVideo ? (outExt === 'mp4' ? 'video/mp4' : file.type) : outExt === 'mp3' ? 'audio/mpeg' : file.type || 'audio/wav'
        const enc = precise ? (isVideo ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k'] : outExt === 'wav' ? ['-c:a', 'pcm_s16le'] : ['-c:a', 'libmp3lame', '-b:a', '192k']) : ['-c', 'copy']
        const args = precise
          ? ['-i', 'INPUT', '-ss', String(s), '-to', String(e), ...enc, 'OUTPUT']
          : ['-ss', String(s), '-i', 'INPUT', '-t', String(e - s), ...enc, 'OUTPUT']
        const blob = await runFFmpeg(file, args, `output.${outExt}`, mime, progress)
        return { blob, name: `${baseName(file.name)}-trimmed.${outExt}` }
      }}
    />
  )
}

/* ---------------- Mute ---------------- */
export function MuteVideo() {
  const [files, setFiles] = useState([])
  const info = useProbe(files[0])
  return (
    <FileTool
      files={files}
      setFiles={setFiles}
      accept={VIDEO}
      actionLabel="Remove audio"
      main={<MediaPreview file={files[0]} info={info} />}
      options={<><h3>Mute video</h3><p className="muted small">Removes the sound track instantly — the video itself is copied without re-encoding, so quality is identical.</p>{ENGINE_NOTE}</>}
      process={async ([file], progress) => {
        const ext = (file.name.match(/\.([^.]+)$/)?.[1] || 'mp4').toLowerCase()
        const blob = await runFFmpeg(file, ['-i', 'INPUT', '-c:v', 'copy', '-an', 'OUTPUT'], `output.${ext}`, file.type || 'video/mp4', progress)
        return { blob, name: `${baseName(file.name)}-muted.${ext}` }
      }}
    />
  )
}

