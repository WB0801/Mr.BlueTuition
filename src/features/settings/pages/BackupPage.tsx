import { useEffect } from 'react'
import { PageHeader } from '../../../components/shared/PageHeader'
import { BackupSection } from '../backup/BackupSection'
import { RestoreUnavailableSection } from '../backup/RestoreUnavailableSection'

export function BackupPage() {
  useEffect(() => { document.title = '资料备份 · 蓝老师补习班' }, [])

  return (
    <section>
      <PageHeader title="资料备份" backTo="/settings" backLabel="设置" />
      <div className="settings-sections">
        <BackupSection />
        <RestoreUnavailableSection />
      </div>
    </section>
  )
}
