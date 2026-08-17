import { Link, useLocation } from 'react-router-dom'
import { Button, Icon } from '../ui'
import { GlobalStudentSearch } from '../../features/students/components/GlobalStudentSearch'

interface AppHeaderProps {
  isSigningOut: boolean
  onSignOut: () => void
}

export function AppHeader({ isSigningOut, onSignOut }: AppHeaderProps) {
  const { pathname } = useLocation()
  const showsStudentSearch = pathname === '/'

  return (
    <header className="app-header">
      <div className={`header-inner${showsStudentSearch ? ' header-inner-with-search' : ''}`}>
        <Link className="header-brand" to="/" aria-label="返回首页">
          <img src={`${import.meta.env.BASE_URL}brand/app-icon.png`} alt="" />
          <span>蓝老师补习班</span>
        </Link>
        {showsStudentSearch && (
          <div className="header-search">
            <GlobalStudentSearch placeholder="搜索学生" />
          </div>
        )}
        <Button
          className="header-sign-out"
          disabled={isSigningOut}
          leadingIcon={<Icon name="logout" size={18} />}
          onClick={onSignOut}
          type="button"
          variant="ghost"
        >
          {isSigningOut ? '退出中…' : '退出'}
        </Button>
      </div>
    </header>
  )
}
