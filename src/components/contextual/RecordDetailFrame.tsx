import type { ReactNode } from 'react'
import { useContextDataLocked } from './contextDataState'

export function RecordDetailFrame({ title, backLabel = '记录列表', onBack, children }: { title: string; backLabel?: string; onBack: () => void; children: ReactNode }) {
  const locked = useContextDataLocked()
  return <section className="context-record-detail">
    <button type="button" className="context-back-link" onClick={onBack} disabled={locked}>← 返回{backLabel}</button>
    <h2>{title}</h2>
    {children}
  </section>
}
