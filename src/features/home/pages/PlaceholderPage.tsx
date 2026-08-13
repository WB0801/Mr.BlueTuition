import { Link } from 'react-router-dom'

interface PlaceholderPageProps {
  title: string
  phase: string
}

export function PlaceholderPage({ title, phase }: PlaceholderPageProps) {
  return (
    <section className="simple-page" aria-labelledby="placeholder-title">
      <h1 id="placeholder-title">{title}</h1>
      <p className="muted">此功能将在 {phase} 开发。</p>
      <Link className="button button-secondary" to="/">返回首页</Link>
    </section>
  )
}
