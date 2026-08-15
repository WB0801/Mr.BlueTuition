import { useEffect } from 'react'
import { PageHeader } from '../../../components/shared/PageHeader'
import { BackupSection } from '../backup/BackupSection'
import { RecentActivitySection } from '../components/RecentActivitySection'
import { AppSection } from '../pwa/AppSection'

export function SettingsPage() {
  useEffect(() => { document.title = '设置 · 蓝老师补习班' }, [])

  return (
    <section>
      <PageHeader title="设置" backLabel="首页" />
      <div className="settings-sections">
        <BackupSection />
        <AppSection />
        <RecentActivitySection />
      </div>
    </section>
  )
}

