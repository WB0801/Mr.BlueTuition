import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { PwaContext, type PwaContextValue } from './pwaContext'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function installedDisplayMode(): boolean {
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || standaloneNavigator.standalone === true
}

export function PwaProvider({ children }: PropsWithChildren) {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(installedDisplayMode)
  const [statusMessage, setStatusMessage] = useState('')
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
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    setStatusMessage(choice.outcome === 'accepted' ? 'App 安装已开始。' : '已取消安装。')
    setInstallPrompt(null)
  }, [installPrompt])

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
    canInstall: Boolean(installPrompt),
    isOfflineReady,
    needRefresh,
    statusMessage,
    install,
    checkForUpdate,
    reloadToUpdate: () => updateServiceWorker(true),
    dismissUpdate: () => setNeedRefresh(false),
  }), [checkForUpdate, install, installPrompt, isInstalled, isOfflineReady, needRefresh, setNeedRefresh, statusMessage, updateServiceWorker])

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>
}
