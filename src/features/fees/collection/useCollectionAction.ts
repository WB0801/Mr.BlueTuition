import { useEffect, useLayoutEffect, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { usePwaUpdateGuard } from '../../settings/pwa/updateProtection'
import { collectionActions, type CollectionFact, type CollectionRequest } from './collectionActions'

export function useCollectionAction<T extends CollectionFact>(key: string, request: CollectionRequest<T>, incoming?: T) {
  const client = useQueryClient(), store = collectionActions(client)
  const states = useSyncExternalStore(store.subscribe, store.snapshot)
  const state = states.get(key)
  useEffect(() => store.retain(key), [key, store])
  useLayoutEffect(() => { if (incoming) store.observe(key, incoming) }, [key, store, incoming])
  const busy = state?.phase === 'pending' || state?.phase === 'checking'
  usePwaUpdateGuard(busy, '收款正在处理或核对，请完成后再更新。')
  return { state, busy, fact: store.resolveFact(key, incoming), start: () => store.run(key, request), verify: () => store.verify(key, request), refresh: () => store.refresh(key, request), dismiss: () => store.clear(key) }
}
