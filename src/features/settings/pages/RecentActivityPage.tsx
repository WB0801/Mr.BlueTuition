import { useEffect } from 'react'
import { PageHeader } from '../../../components/shared/PageHeader'
import { RecentActivitySection } from '../components/RecentActivitySection'

export function RecentActivityPage() {
  useEffect(() => { document.title = '最近操作 · 蓝老师补习班' }, [])

  return (
    <section>
      <PageHeader title="最近操作" backTo="/settings" backLabel="设置" />
      <RecentActivitySection standalone />
    </section>
  )
}
