import { Badge } from '../../../components/ui'

export function RestoreUnavailableSection() {
  return (
    <section className="settings-danger-section" aria-labelledby="restore-heading">
      <div className="settings-section-heading">
        <div>
          <h2 id="restore-heading">恢复备份</h2>
          <p>恢复会改写现有业务资料，必须经过完整验证与明确确认。</p>
        </div>
        <Badge tone="neutral">尚未开放</Badge>
      </div>
      <p className="impact-notice">当前版本只有完整备份导出，没有安全的恢复执行功能；这里不会读取或上传备份档案。</p>
      <button className="button button-danger" type="button" disabled>恢复备份</button>
    </section>
  )
}
