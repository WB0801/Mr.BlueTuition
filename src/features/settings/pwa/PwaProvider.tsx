import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type PropsWithChildren } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { PwaContext, type PwaContextValue } from './pwaContext'
import { fetchPublishedVersion, runningBuild } from './buildVersion'
import { consumeUpdateConfirmation, UpdateController, UPDATE_ATTEMPT_KEY, type UpdateState } from './updateController'
import { createFormProtection, updateProtection } from './updateProtection'
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}
function installedDisplayMode(): boolean {
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || standaloneNavigator.standalone === true
}
export function PwaProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient()
  const [controller] = useState(() => new UpdateController({
    baseUrl: new URL(import.meta.env.BASE_URL, location.origin).href,
    buildId: runningBuild.id,
    container: navigator.serviceWorker,
    fetchVersion: fetchPublishedVersion,
    online: () => navigator.onLine,
    blocked: () => updateProtection.reason() || (queryClient.isMutating() ? '操作正在提交，请完成后再更新。' : ''),
    reload: () => window.location.reload(),
    saveConfirmation: value => { try { sessionStorage.setItem(UPDATE_ATTEMPT_KEY, JSON.stringify(value)) } catch { /* Feedback optional; safety is not. */ } },
  }))
  const update = useSyncExternalStore(controller.subscribe, controller.snapshot)
  const [feedback, setFeedback] = useState(() => consumeUpdateConfirmation(runningBuild.id))
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(installedDisplayMode)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [connectionMessage, setConnectionMessage] = useState('')
  const [dismissedUpdate, setDismissedUpdate] = useState<UpdateState | null>(null)
  useEffect(() => {
    controller.mount()
    const formProtection = createFormProtection(document)
    let lastAutomatic = 0
    function automatic() {
      if (!navigator.onLine || document.visibilityState !== 'visible') return
      if (Date.now() - lastAutomatic < 10000) return
      lastAutomatic = Date.now()
      void controller.check()
    }
    function visibility() { automatic() }
    let reconnectTimer = 0
    function offline() { lastAutomatic = 0; setIsOnline(false); setConnectionMessage(''); clearTimeout(reconnectTimer) }
    function online() { setIsOnline(true); setConnectionMessage('网络已重新连接。'); clearTimeout(reconnectTimer); reconnectTimer = window.setTimeout(() => setConnectionMessage(''), 4000); automatic() }
    window.addEventListener('offline', offline)
    window.addEventListener('online', online)
    document.addEventListener('visibilitychange', visibility)
    const interval = window.setInterval(automatic, 5 * 60 * 1000)
    void controller.initialize().then(automatic)
    return () => {
      clearInterval(interval); clearTimeout(reconnectTimer)
      window.removeEventListener('offline', offline); window.removeEventListener('online', online)
      document.removeEventListener('visibilitychange', visibility)
      formProtection.dispose(); controller.unmount()
    }
  }, [controller])
  useEffect(() => {
    function handleInstallPrompt(event: Event) { event.preventDefault(); setInstallPrompt(event as BeforeInstallPromptEvent) }
    function handleInstalled() { setInstallPrompt(null); setIsInstalled(true); setFeedback('App 已安装。') }
    window.addEventListener('beforeinstallprompt', handleInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    return () => { window.removeEventListener('beforeinstallprompt', handleInstallPrompt); window.removeEventListener('appinstalled', handleInstalled) }
  }, [])
  const install = useCallback(async () => {
    if (!installPrompt) return
    try { await installPrompt.prompt(); const choice = await installPrompt.userChoice; setFeedback(choice.outcome === 'accepted' ? 'App 安装已开始。' : '已取消安装。'); setInstallPrompt(null) }
    catch { setFeedback('无法启动安装，请从浏览器菜单加入主画面。') }
  }, [installPrompt])
  const checkForUpdate = useCallback(() => { setDismissedUpdate(null); setFeedback(''); return controller.check() }, [controller])
  const reloadToUpdate = useCallback(() => { setDismissedUpdate(null); return controller.apply() }, [controller])
  const value = useMemo<PwaContextValue>(() => ({
    isSupported: 'serviceWorker' in navigator,
    isInstalled, isOnline, canInstall: Boolean(installPrompt), isOfflineReady: update.isOfflineReady,
    needRefresh: update.needRefresh && dismissedUpdate !== update,
    phase: update.phase, buildId: runningBuild.id, checking: update.phase === 'checking' || update.phase === 'preparing', applying: update.phase === 'applying',
    statusMessage: update.needRefresh || update.phase === 'error' ? update.message : feedback || update.message, connectionMessage,
    install, checkForUpdate, reloadToUpdate,
    dismissUpdate: () => setDismissedUpdate(update),
    dismissStatus: () => { setFeedback(''); setConnectionMessage(''); controller.dismiss() },
  }), [isInstalled, isOnline, installPrompt, update, dismissedUpdate, feedback, connectionMessage, install, checkForUpdate, reloadToUpdate, controller])
  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>
}
