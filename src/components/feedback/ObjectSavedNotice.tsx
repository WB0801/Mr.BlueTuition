import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

// Consume only this location's object-bound feedback; keep source/scroll state.
export function ObjectSavedNotice({ kind, id }: { kind: 'students' | 'classes'; id: string }) {
  const location = useLocation(), navigate = useNavigate()
  const incoming = location.state?.objectSaved as { kind?: string; id?: string } | undefined
  const [notice] = useState(() => incoming?.kind === kind && incoming.id === id ? { kind, id } : null)
  useEffect(() => {
    if (!incoming) return
    const state = { ...location.state }; delete state.objectSaved
    navigate(location.pathname + location.search + location.hash, { replace: true, state })
  }, [incoming, location, navigate])
  return notice?.kind === kind && notice.id === id ? <p role="status" className="notice inline-notice">{kind === 'students' ? '学生资料已保存' : '班级资料已保存'}</p> : null
}
