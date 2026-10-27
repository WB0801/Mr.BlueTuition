import { useContext, useEffect } from 'react'
import { UNSAFE_DataRouterContext, useBeforeUnload, useBlocker } from 'react-router-dom'
import { consumeCompletedContextOperation, useContextDataBusy, useContextDataUnsaved } from '../contextual/contextDataState'

export function FormLeaveGuard({ dirty, saving }: { dirty: boolean; saving: boolean }) {
  const router = useContext(UNSAFE_DataRouterContext)
  const nested = useContextDataUnsaved(dirty ? '有未保存修改，确定离开吗？' : '')
  useContextDataBusy(saving)
  useBeforeUnload(event => { if (dirty || saving) { event.preventDefault(); event.returnValue = '' } })
  return router && !nested ? <RouterGuard dirty={dirty} saving={saving} /> : null
}

function RouterGuard({ dirty, saving }: { dirty: boolean; saving: boolean }) {
  const blocker = useBlocker(({ nextLocation }) => (dirty || saving) && !consumeCompletedContextOperation(nextLocation.state))
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (!saving && window.confirm('有未保存修改，确定离开吗？')) blocker.proceed()
    else blocker.reset()
  }, [blocker, saving])
  return null
}
