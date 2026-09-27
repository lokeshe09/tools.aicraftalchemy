import { Link } from 'react-router-dom'
import { LogoMark } from '../components/Logo'

export default function NotFound() {
  return (
    <div className="page-narrow center">
      <LogoMark size={64} />
      <h1 className="big-404">404</h1>
      <p className="muted">This page doesn't exist — but 100+ tools do.</p>
      <Link to="/" className="btn btn-primary">Browse all tools</Link>
    </div>
  )
}
