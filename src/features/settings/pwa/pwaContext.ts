import { createContext, useContext } from 'react'

export interface PwaContextValue {
  isSupported: boolean
  isInstalled: boolean
  isOnline: boolean
  canInstall: boolean
  isOfflineReady: boolean
  needRefresh: boolean
  statusMessage: string
  connectionMessage: string
  install: () => Promise<void>
  checkForUpdate: () => Promise<void>
  reloadToUpdate: () => Promise<void>
  dismissUpdate: () => void
  dismissStatus: () => void
}

export const PwaContext = createContext<PwaContextValue | null>(null)

export function usePwa() {
  const context = useContext(PwaContext)
  if (!context) throw new Error('usePwa 必须在 PwaProvider 内使用。')
  return context
}
