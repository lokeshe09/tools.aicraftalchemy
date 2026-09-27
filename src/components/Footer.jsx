import { Link } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { CATEGORIES, TOOLS } from '../registry'
import { Logo } from './Header'

export default function Footer() {
  const cols = ['organize', 'to-pdf', 'from-pdf', 'image']
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Logo />
          <p>Every tool you need to work with PDFs, images, documents and data — free, fast and 100% in your browser.</p>
          <p className="footer-privacy"><ShieldCheck size={16} /> Your files never leave your device.</p>
        </div>
        {cols.map((c) => (
          <div key={c} className="footer-col">
            <h4>{CATEGORIES.find((x) => x.id === c).label}</h4>
            {TOOLS.filter((t) => t.cat === c).slice(0, 6).map((t) => (
              <Link key={t.id} to={`/${t.id}`}>{t.name}</Link>
            ))}
          </div>
        ))}
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} tools. All rights reserved.</span>
        <span>
          Built by <strong>aicraftalchemy</strong> · <Link to="/privacy">Privacy</Link>
        </span>
      </div>
    </footer>
  )
}
