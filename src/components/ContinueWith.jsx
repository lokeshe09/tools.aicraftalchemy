import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { TOOLS } from '../registry'
import { acceptsFile } from '../lib/files'
import { blobToFile, setHandoff } from '../lib/handoff'

const PREFERRED = {
  pdf: ['compress-pdf', 'merge-pdf', 'split-pdf', 'organize-pdf', 'edit-pdf', 'sign-pdf', 'digital-sign-pdf', 'protect-pdf', 'page-numbers', 'watermark-pdf', 'pdf-to-jpg', 'pdf-to-word'],
  image: ['compress-image', 'resize-image', 'crop-image', 'jpg-to-pdf', 'convert-to-webp', 'photo-editor', 'image-to-text'],
  other: [],
}

/** "Continue with…" chips: send the result straight into another tool. */
export default function ContinueWith({ result }) {
  const navigate = useNavigate()
  const item = Array.isArray(result) ? (result.length === 1 ? result[0] : null) : result
  if (!item?.blob || /zip/.test(item.blob.type) || item.name?.endsWith('.zip')) return null
  const file = blobToFile(item.blob, item.name)
  const kind = file.type === 'application/pdf' ? 'pdf' : file.type.startsWith('image/') ? 'image' : 'other'
  const ids = PREFERRED[kind]
  const list = (ids.length ? ids.map((id) => TOOLS.find((t) => t.id === id)) : TOOLS)
    .filter((t) => t && t.accept && acceptsFile(t.accept, file) && !location.pathname.endsWith(`/${t.id}`))
    .slice(0, 8)
  if (!list.length) return null
  return (
    <div className="continue">
      <span className="continue-label">Continue with</span>
      <div className="continue-chips">
        {list.map((t) => {
          const Icon = t.icon
          return (
            <button key={t.id} className="chip" onClick={() => { setHandoff([file]); navigate(`/${t.id}`) }}>
              <Icon size={15} /> {t.name} <ArrowRight size={13} className="chip-arrow" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
