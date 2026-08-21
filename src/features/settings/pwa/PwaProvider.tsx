import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { PwaContext, type PwaContextValue } from './pwaContext'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const UPDATE_FEEDBACK_KEY = 'lan-laoshi-pwa-update-completed'

function initialStatusMessage() {
  try {
    if (window.sessionStorage.getItem(UPDATE_FEEDBACK_KEY) === '1') {
      window.sessionStorage.removeItem(UPDATE_FEEDBACK_KEY)
      return 'App 已更新至最新版本。'
    }
  } catch { /* status feedback is optional */ }
  return ''
}

function installedDisplayMode(): boolean {
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || standaloneNavigator.standalone === true
}

export function PwaProvider({ children }: PropsWithChildren) {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(installedDisplayMode)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [connectionMessage, setConnectionMessage] = useState('')
  const [statusMessage, setStatusMessage] = useState(initialStatusMessage)
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [isOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, nextRegistration) {
      setRegistration(nextRegistration ?? null)
    },
    onRegisterError(error) {
      console.error('PWA service worker 注册失败', error)
    },
  })

  useEffect(() => {
    function handleInstallPrompt(event: Event) {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }
    function handleInstalled() {
      setInstallPrompt(null)
      setIsInstalled(true)
      setStatusMessage('App 已安装。')
    }
    window.addEventListener('beforeinstallprompt', handleInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  useEffect(() => {
    let reconnectTimer = 0
    function handleOffline() {
      window.clearTimeout(reconnectTimer)
      setIsOnline(false)
      setConnectionMessage('')
    }
    function handleOnline() {
      setIsOnline(true)
      setConnectionMessage('网络已重新连接。')
      window.clearTimeout(reconnectTimer)
      reconnectTimer = window.setTimeout(() => setConnectionMessage(''), 4000)
    }
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      window.clearTimeout(reconnectTimer)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  useEffect(() => {
    if (!registration) return
    const activeRegistration = registration
    const interval = window.setInterval(() => {
      if (navigator.onLine) void activeRegistration.update().catch((error) => console.error('PWA 自动检查更新失败', error))
    }, 60 * 60 * 1000)
    function handleVisibility() {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void activeRegistration.update().catch((error) => console.error('PWA 自动检查更新失败', error))
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [registration])

  const install = useCallback(async () => {
    if (!installPrompt) return
    try {
      await installPrompt.prompt()
      const choice = await installPrompt.userChoice
      setStatusMessage(choice.outcome === 'accepted' ? 'App 安装已开始。' : '已取消安装。')
      setInstallPrompt(null)
    } catch (error) {
      console.error('PWA 安装提示失败', error)
      setStatusMessage('无法启动安装，请从浏览器菜单加入主画面。')
    }
  }, [installPrompt])

  const reloadToUpdate = useCallback(async () => {
    try { window.sessionStorage.setItem(UPDATE_FEEDBACK_KEY, '1') } catch { /* feedback is optional */ }
    await updateServiceWorker(true)
  }, [updateServiceWorker])

  const checkForUpdate = useCallback(async () => {
    if (!('serviceWorker' in navigator)) {
      setStatusMessage('此浏览器不支持 App 更新检查。')
      return
    }
    try {
      setStatusMessage('正在检查更新…')
      const activeRegistration = registration ?? await navigator.serviceWorker.getRegistration()
      if (!activeRegistration) {
        setStatusMessage('App 尚未完成安装准备，请稍后再试。')
        return
      }
      await activeRegistration.update()
      setRegistration(activeRegistration)
      setStatusMessage('已检查更新；有新版本时会显示重新载入提示。')
    } catch (error) {
      console.error('PWA 手动检查更新失败', error)
      setStatusMessage('检查更新失败，请确认网络后重试。')
    }
  }, [registration])

  const value = useMemo<PwaContextValue>(() => ({
    isSupported: 'serviceWorker' in navigator,
    isInstalled,
    isOnline,
    canInstall: Boolean(installPrompt),
    isOfflineReady,
    needRefresh,
    statusMessage,
    connectionMessage,
    install,
    checkForUpdate,
    reloadToUpdate,
    dismissUpdate: () => setNeedRefresh(false),
    dismissStatus: () => {
      setConnectionMessage('')
      setStatusMessage('')
    },
  }), [checkForUpdate, connectionMessage, install, installPrompt, isInstalled, isOfflineReady, isOnline, needRefresh, reloadToUpdate, setNeedRefresh, statusMessage])

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>
}
