import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronDown, Menu, X, Moon, Sun } from 'lucide-react'
import { CATEGORIES, TOOLS } from '../registry'

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="tools home">
      <span className="logo-mark">t</span>
      <span className="logo-text">tools</span>
    </Link>
  )
}

function useTheme() {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('theme') || '' } catch { return '' }
  })
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme
    else delete document.documentElement.dataset.theme
    try { theme ? localStorage.setItem('theme', theme) : localStorage.removeItem('theme') } catch { /* private mode */ }
  }, [theme])
  const dark = theme ? theme === 'dark' : window.matchMedia?.('(prefers-color-scheme: dark)').matches
  return [dark, () => setTheme(dark ? 'light' : 'dark')]
}

export default function Header() {
  const [open, setOpen] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [dark, toggleTheme] = useTheme()
  const { pathname } = useLocation()
  const ref = useRef(null)

  useEffect(() => { setOpen(false); setMobile(false) }, [pathname])
  useEffect(() => {
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const quick = ['merge-pdf', 'split-pdf', 'compress-pdf', 'pdf-to-word', 'jpg-to-pdf']

  return (
    <header className="header" ref={ref}>
      <div className="header-inner">
        <Logo />
        <nav className={`nav ${mobile ? 'open' : ''}`}>
          {quick.map((id) => {
            const t = TOOLS.find((x) => x.id === id)
            return <Link key={id} to={`/${id}`} className="nav-link">{t.name.toUpperCase()}</Link>
          })}
          <button className={`nav-link nav-drop ${open ? 'active' : ''}`} onClick={() => setOpen(!open)}>
            ALL TOOLS <ChevronDown size={16} />
          </button>
        </nav>
        <div className="header-actions">
          <button className="icon-btn theme-btn" onClick={toggleTheme} title="Toggle theme" aria-label="Toggle theme">
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="icon-btn burger" onClick={() => setMobile(!mobile)} aria-label="Menu">
            {mobile ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
      {open && (
        <div className="mega">
          <div className="mega-inner">
            {CATEGORIES.filter((c) => c.id !== 'all').map((c) => (
              <div key={c.id} className="mega-col">
                <h4>{c.label}</h4>
                {TOOLS.filter((t) => t.cat === c.id).map((t) => {
                  const Icon = t.icon
                  return (
                    <Link key={t.id} to={`/${t.id}`} className="mega-link">
                      <Icon size={16} style={{ color: t.color }} /> {t.name}
                    </Link>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </header>
  )
}
