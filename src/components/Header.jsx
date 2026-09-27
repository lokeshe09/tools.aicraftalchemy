import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronDown, Menu, X, Moon, Sun, Search } from 'lucide-react'
import { CATEGORIES, TOOLS } from '../registry'
import Logo from './Logo'
import CommandPalette from './CommandPalette'

function useTheme() {
  const read = () => { try { return localStorage.getItem('theme') || '' } catch { return '' } }
  const [theme, setTheme] = useState(read)
  const [sysDark, setSysDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const on = (e) => setSysDark(e.matches)
    mq?.addEventListener?.('change', on)
    return () => mq?.removeEventListener?.('change', on)
  }, [])
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme
    else delete document.documentElement.dataset.theme
    try { theme ? localStorage.setItem('theme', theme) : localStorage.removeItem('theme') } catch { /* storage blocked */ }
  }, [theme])
  const dark = theme ? theme === 'dark' : sysDark
  return [dark, () => setTheme(dark ? 'light' : 'dark')]
}

const NAV = [
  { label: 'PDF', cats: ['organize', 'optimize', 'edit', 'security'] },
  { label: 'Convert', cats: ['to-pdf', 'from-pdf', 'data'] },
  { label: 'Image', cats: ['image'] },
  { label: 'Video & Audio', cats: ['media'] },
  { label: 'Dev', cats: ['dev'] },
]

export default function Header() {
  const [menu, setMenu] = useState(null)
  const [mobile, setMobile] = useState(false)
  const [palette, setPalette] = useState(false)
  const [dark, toggleTheme] = useTheme()
  const { pathname } = useLocation()
  const ref = useRef(null)

  useEffect(() => { setMenu(null); setMobile(false) }, [pathname])
  useEffect(() => {
    const close = (e) => { if (!ref.current?.contains(e.target)) setMenu(null) }
    const key = (e) => {
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) && !document.activeElement?.isContentEditable)) {
        e.preventDefault()
        setPalette(true)
      }
      if (e.key === 'Escape') setMenu(null)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key) }
  }, [])

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  const open = NAV.find((n) => n.label === menu)

  return (
    <header className="header" ref={ref}>
      <div className="header-inner">
        <Logo />
        <nav className={`nav ${mobile ? 'open' : ''}`} aria-label="Tool categories">
          {NAV.map((n) => (
            <button key={n.label} className={`nav-link ${menu === n.label ? 'active' : ''}`} onClick={() => setMenu(menu === n.label ? null : n.label)} aria-expanded={menu === n.label}>
              {n.label} <ChevronDown size={15} className={`chev ${menu === n.label ? 'open' : ''}`} />
            </button>
          ))}
          <Link to="/#all-tools" className="nav-link" onClick={() => setTimeout(() => document.getElementById('all-tools')?.scrollIntoView({ behavior: 'smooth' }), 50)}>All tools</Link>
        </nav>
        <div className="header-actions">
          <button className="search-btn" onClick={() => setPalette(true)} aria-label="Search tools">
            <Search size={16} /> <span>Search tools</span> <kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
          </button>
          <button className="icon-btn" onClick={toggleTheme} title={dark ? 'Light mode' : 'Dark mode'} aria-label="Toggle colour theme">
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="icon-btn burger" onClick={() => setMobile(!mobile)} aria-label="Menu" aria-expanded={mobile}>
            {mobile ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
      {open && (
        <div className="mega" role="menu">
          <div className="mega-inner">
            {open.cats.map((cid) => {
              const c = CATEGORIES.find((x) => x.id === cid)
              return (
                <div key={cid} className="mega-col">
                  <h4 style={{ '--c': c.color }}><span className="dot" /> {c.label}</h4>
                  {TOOLS.filter((t) => t.cat === cid).map((t) => {
                    const Icon = t.icon
                    return (
                      <Link key={t.id} to={`/${t.id}`} className="mega-link" role="menuitem">
                        <Icon size={16} style={{ color: c.color }} /> {t.name}
                        {t.badge === 'new' && <span className="badge-new">New</span>}
                      </Link>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      )}
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </header>
  )
}
