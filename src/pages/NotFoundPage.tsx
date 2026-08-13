import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section className="simple-page">
      <h1>找不到此页面</h1>
      <p className="muted">网址可能不正确，或页面尚未建立。</p>
      <Link className="button button-primary" to="/">返回首页</Link>
    </section>
  )
}
