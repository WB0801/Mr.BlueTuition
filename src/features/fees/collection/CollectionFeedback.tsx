import type { CollectionState } from './collectionActions'
export function CollectionFeedback({ state, onVerify, onRefresh, onDismiss }: { state?: CollectionState; onVerify: () => void; onRefresh: () => void; onDismiss: () => void }) {
  if (!state?.message || state.phase === 'pending') return null
  return <div className="collection-feedback" role={state.phase === 'rejected' ? 'alert' : 'status'}>
    <span>{state.message}</span>
    {['uncertain','retry'].includes(state.phase) && <button type="button" className="button button-text button-small" onClick={onVerify}>核对付款</button>}
    {state.refreshFailed && <button type="button" className="button button-text button-small" onClick={onRefresh}>重试刷新</button>}
    {state.phase === 'verified' && <button type="button" className="button button-text button-small" onClick={onDismiss}>已核对，关闭</button>}
  </div>
}
