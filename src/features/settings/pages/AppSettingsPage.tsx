import { useEffect } from 'react'
import { PageHeader } from '../../../components/shared/PageHeader'
import { AppSection } from '../pwa/AppSection'

export function AppSettingsPage() {
  useEffect(() => { document.title = 'App 与离线 · 蓝老师补习班' }, [])

  return (
    <section>
      <PageHeader title="App、离线与更新" backTo="/settings" backLabel="设置" />
      <AppSection />
    </section>
  )
}
