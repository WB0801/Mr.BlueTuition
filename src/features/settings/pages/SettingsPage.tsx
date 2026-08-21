import { useEffect } from 'react'
import { ContextLink } from '../../../components/navigation/ContextLink'
import { PageHeader } from '../../../components/shared/PageHeader'
import { Icon } from '../../../components/ui'

export function SettingsPage() {
  useEffect(() => { document.title = '设置 · 蓝老师补习班' }, [])

  return (
    <section>
      <PageHeader title="设置" />
      <div className="settings-menu">
        <section className="settings-menu-group" aria-labelledby="settings-general-heading">
          <h2 id="settings-general-heading">一般设置</h2>
          <ContextLink backLabel="设置" className="settings-menu-item" to="/settings/app">
            <span className="settings-menu-icon"><Icon name="settings" size={21} /></span>
            <span><strong>App、离线与更新</strong><small>安装状态、离线准备及版本检查</small></span>
            <Icon name="chevron-right" size={19} />
          </ContextLink>
        </section>
        <section className="settings-menu-group" aria-labelledby="settings-data-heading">
          <h2 id="settings-data-heading">资料管理</h2>
          <ContextLink backLabel="设置" className="settings-menu-item" to="/settings/backup">
            <span className="settings-menu-icon"><Icon name="classes" size={21} /></span>
            <span><strong>完整资料备份</strong><small>建立、验证并下载 ZIP 备份</small></span>
            <Icon name="chevron-right" size={19} />
          </ContextLink>
          <ContextLink backLabel="设置" className="settings-menu-item" to="/settings/activity">
            <span className="settings-menu-icon"><Icon name="attendance" size={21} /></span>
            <span><strong>最近操作</strong><small>查看最近 100 项系统操作</small></span>
            <Icon name="chevron-right" size={19} />
          </ContextLink>
        </section>
      </div>
    </section>
  )
}
