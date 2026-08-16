import { Link } from 'react-router-dom'
import { Button, Icon } from '../ui'

interface AppHeaderProps {
  isSigningOut: boolean
  onSignOut: () => void
}

export function AppHeader({ isSigningOut, onSignOut }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="header-inner">
        <Link className="header-brand" to="/" aria-label="返回首页">
          <img src={`${import.meta.env.BASE_URL}brand/app-icon.png`} alt="" />
          <span>蓝老师补习班</span>
        </Link>
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
