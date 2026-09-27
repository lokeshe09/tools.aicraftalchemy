import { Component, Suspense, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ShieldCheck, ChevronRight, ArrowRight } from 'lucide-react'
import { TOOL_MAP, TOOLS, CAT_MAP } from '../registry'
import { ToolCard } from './Home'
import NotFound from './NotFound'
import { Spinner } from '../components/ui'

class ToolBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error) { console.error(error) }
  render() {
    if (this.state.error) {
      const chunk = /dynamically imported module|Loading chunk|Failed to fetch/i.test(String(this.state.error?.message))
      return (
        <div className="alert alert-error" role="alert">
          <div className="alert-body">
            {chunk ? 'This tool could not be loaded — the site may have been updated or you are offline.' : 'Something went wrong in this tool.'}{' '}
            <button className="btn btn-soft btn-sm" onClick={() => window.location.reload()}>Reload page</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function ToolPage() {
  const { toolId } = useParams()
  const tool = TOOL_MAP[toolId]

  useEffect(() => {
    if (!tool) return
    document.title = `${tool.name} — free & private | tools.aicraftalchemy`
    document.querySelector('meta[name="description"]')?.setAttribute('content', `${tool.desc} Runs 100% in your browser — files are never uploaded.`)
    return () => { document.title = 'tools.aicraftalchemy — Every file tool, zero uploads' }
  }, [tool])

  if (!tool) return <NotFound />
  const Tool = tool.component
  const cat = CAT_MAP[tool.cat]
  const Icon = tool.icon
  const related = TOOLS.filter((t) => t.cat === tool.cat && t.id !== tool.id).slice(0, 4)

  return (
    <div className="tool-page" style={{ '--c': cat.color }}>
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link><ChevronRight size={14} />
        <Link to={`/?cat=${tool.cat}#all-tools`}>{cat.label}</Link><ChevronRight size={14} />
        <span>{tool.name}</span>
      </nav>
      <header className="tool-head">
        <span className="tool-head-icon"><Icon size={30} /></span>
        <div>
          <h1>{tool.name}</h1>
          <p>{tool.desc}</p>
          <div className="tool-head-meta">
            {tool.from && tool.to && <span className="fmt"><span>{tool.from}</span><ArrowRight size={12} /><span>{tool.to}</span></span>}
            <span className="priv"><ShieldCheck size={14} /> Private · on-device</span>
          </div>
        </div>
      </header>
      <ToolBoundary key={tool.id}>
        <Suspense fallback={<Spinner label="Loading tool…" />}>
          <Tool key={tool.id} {...(tool.props || {})} />
        </Suspense>
      </ToolBoundary>
      {related.length > 0 && (
        <section className="related">
          <h2>More {cat.label.toLowerCase()} tools</h2>
          <div className="tool-grid">{related.map((t) => <ToolCard key={t.id} tool={t} />)}</div>
        </section>
      )}
    </div>
  )
}
