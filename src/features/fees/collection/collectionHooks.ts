import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { collectionActions, type CollectionState } from './collectionActions'

export function useCollectionRecords<T>(records: T[], recordKey: (record: T) => string) {
  const store = collectionActions(useQueryClient()), states = useSyncExternalStore(store.subscribe, store.snapshot)
  const [remembered, remember] = useState(records)
  const merged = useMemo(() => {
    if (!remembered.some(record => states.has(recordKey(record)))) return records
    const result = new Map(records.map(record => [recordKey(record), record]))
    const ordered: T[] = []
    for (const record of remembered) {
      const key = recordKey(record), action = states.get(key)
      if (result.has(key) || (action && !action.visualDone)) ordered.push(result.get(key) ?? record)
      result.delete(key)
    }
    return [...ordered, ...result.values()]
  }, [records, recordKey, remembered, states])
  if (remembered.length !== merged.length || remembered.some((row, i) => row !== merged[i])) remember(merged)
  return { merged, store, states }
}

export function useCollectionGlow(state?: CollectionState) {
  const [expired, setExpired] = useState(0)
  const phase = state?.phase, startedAt = state?.startedAt ?? 0
  useEffect(() => {
    if (!phase || phase === 'pending' || phase === 'checking') return
    const timer = setTimeout(() => setExpired(startedAt), Math.max(0, 500 - (Date.now() - startedAt)))
    return () => clearTimeout(timer)
  }, [phase, startedAt])
  return Boolean(phase && (phase === 'pending' || phase === 'checking' || expired !== startedAt))
}

export const monthlyCollectionKey = (fee: { id: string }) => `monthly_fee:${fee.id}`
export const temporaryCollectionKey = (enrollment: { payment?: { id: string } | null; id: string }) => `temporary_class_payment:${enrollment.payment?.id ?? enrollment.id}`
