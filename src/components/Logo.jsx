import { Link } from 'react-router-dom'

export function LogoMark({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="logo-mark">
      <defs>
        <linearGradient id="lg-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c5cff" />
          <stop offset="1" stopColor="#d946ef" />
        </linearGradient>
        <linearGradient id="lg-b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd166" />
          <stop offset="1" stopColor="#ff9f1c" />
        </linearGradient>
      </defs>
      <path d="M24 2.5 42.6 13.25v21.5L24 45.5 5.4 34.75v-21.5Z" fill="url(#lg-a)" />
      <path d="M19 12h10M21 12v8.2l-7.4 12.3A3 3 0 0 0 16.2 37h15.6a3 3 0 0 0 2.6-4.5L27 20.2V12" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17.6 29.5h12.8l2.2 3.7a1.6 1.6 0 0 1-1.4 2.4H16.8a1.6 1.6 0 0 1-1.4-2.4Z" fill="url(#lg-b)" />
      <circle cx="33.5" cy="10.5" r="2.2" fill="#ffd166" />
    </svg>
  )
}

export default function Logo() {
  return (
    <Link to="/" className="logo" aria-label="tools.aicraftalchemy — home">
      <LogoMark />
      <span className="logo-text">tools<span className="logo-dot">.</span><span className="logo-sub">aicraftalchemy</span></span>
    </Link>
  )
}
