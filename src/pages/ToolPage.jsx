import { Component, Suspense, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Loader2, ShieldCheck } from 'lucide-react'
import { TOOL_MAP, TOOLS } from '../registry'
import { ToolCard } from './Home'
import NotFound from './NotFound'

class ToolBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div className="alert alert-error">
          Something went wrong while loading this tool. Please refresh the page and try again.
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
    if (tool) document.title = `${tool.name} — tools`
    return () => { document.title = 'tools — Every file tool you need, in your browser' }
  }, [tool])

  if (!tool) return <NotFound />
  const Tool = tool.component
  const related = TOOLS.filter((t) => t.cat === tool.cat && t.id !== tool.id).slice(0, 4)

  return (
    <div className="tool-page">
      <div className="tool-head">
        <h1>{tool.name}</h1>
        <p>{tool.desc}</p>
      </div>
      <ToolBoundary key={tool.id}>
        <Suspense fallback={<div className="loading-row center"><Loader2 className="spin" size={24} /> Loading tool…</div>}>
          <Tool {...(tool.props || {})} />
        </Suspense>
      </ToolBoundary>
      <p className="tool-privacy"><ShieldCheck size={16} /> Processed locally in your browser. Nothing is uploaded or stored.</p>
      {related.length > 0 && (
        <section className="related">
          <h2>Related tools</h2>
          <div className="tool-grid">{related.map((t) => <ToolCard key={t.id} tool={t} />)}</div>
          <p className="center"><Link to="/" className="btn btn-ghost">See all tools</Link></p>
        </section>
      )}
    </div>
  )
}
