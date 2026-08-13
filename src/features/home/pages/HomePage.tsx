import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { GlobalStudentSearch } from '../../students/components/GlobalStudentSearch'

const entries = [
  { label: '学生', description: '学生资料与报读', path: '/students', icon: '学' },
  { label: '班级', description: '常态班与课表', path: '/classes', icon: '班' },
  { label: '点名', description: '今天课程与签名', path: '/attendance', icon: '点' },
  { label: '学费', description: '缴费与待开收据', path: '/fees', icon: '费', receiptCount: 0 },
  { label: '成绩', description: '学校考试与小测', path: '/grades', icon: '成' },
  { label: '临时班', description: '一次性冲刺班', path: '/temporary-classes', icon: '临' },
  { label: '设置', description: '备份与最近操作', path: '/settings', icon: '设' },
] as const

export function HomePage() {
  useEffect(() => {
    document.title = '蓝老师补习班'
  }, [])

  return (
    <section aria-labelledby="home-title">
      <div className="page-heading">
        <h1 id="home-title">蓝老师补习班</h1>
      </div>

      <GlobalStudentSearch />

      <nav className="home-grid" aria-label="主要功能">
        {entries.map((entry) => (
          <Link className="home-entry" to={entry.path} key={entry.path}>
            <span className="entry-icon" aria-hidden="true">{entry.icon}</span>
            <span className="entry-content">
              <span className="entry-label">{entry.label}</span>
              <span className="entry-description">{entry.description}</span>
              {'receiptCount' in entry && (
                <span className="receipt-reminder">待开收据 {entry.receiptCount}</span>
              )}
            </span>
          </Link>
        ))}
      </nav>
    </section>
  )
}
