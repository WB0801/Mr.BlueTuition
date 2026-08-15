import { createContext, useContext } from 'react'

export interface PwaContextValue {
  isSupported: boolean
  isInstalled: boolean
  canInstall: boolean
  isOfflineReady: boolean
  needRefresh: boolean
  statusMessage: string
  install: () => Promise<void>
  checkForUpdate: () => Promise<void>
  reloadToUpdate: () => Promise<void>
  dismissUpdate: () => void
}

export const PwaContext = createContext<PwaContextValue | null>(null)

export function usePwa() {
  const context = useContext(PwaContext)
  if (!context) throw new Error('usePwa 必须在 PwaProvider 内使用。')
  return context
}

