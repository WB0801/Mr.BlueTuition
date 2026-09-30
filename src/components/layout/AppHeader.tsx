import { useEffect, useRef } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Button, Icon } from '../ui'

interface AppHeaderProps {
  isSigningOut: boolean
  onSignOut: () => void
}

export function AppHeader({ isSigningOut, onSignOut }: AppHeaderProps) {
  const { pathname } = useLocation()
  const moreRef = useRef<HTMLDetailsElement>(null)
  const isMore = !['/', '/attendance', '/fees'].some((path) => path === '/' ? pathname === path : pathname.startsWith(path))
  const activeIndex = pathname === '/' ? 0 : pathname.startsWith('/attendance') ? 1 : pathname.startsWith('/fees') ? 2 : 3
  useEffect(() => { if (moreRef.current) moreRef.current.open = false }, [pathname])

  return (
    <header className="app-header">
      <div className="header-inner header-workflow-inner">
        <Link className="header-brand" to="/" aria-label="返回首页">
          <img src={`${import.meta.env.BASE_URL}brand/app-icon.png`} alt="" />
          <span>蓝老师补习班</span>
        </Link>
        <nav className="primary-navigation" aria-label="主要导航">
          <span aria-hidden="true" className="navigation-marker" style={{ transform: `translateX(${activeIndex * 100}%)` }} />
          <NavLink end to="/">首页</NavLink>
          <NavLink to="/attendance">点名</NavLink>
          <NavLink to="/fees">学费</NavLink>
          <details ref={moreRef} className={`more-navigation${isMore ? ' active' : ''}`} onKeyDown={(event) => {
            if (event.key === 'Escape' && moreRef.current) { moreRef.current.open = false; moreRef.current.querySelector('summary')?.focus() }
          }}>
            <summary>更多 <Icon name="chevron-right" size={14} /></summary>
            <div className="more-navigation-menu">
              {[['学生', '/students'], ['班级', '/classes'], ['成绩', '/grades'], ['临时班', '/temporary-classes'], ['设置', '/settings']].map(([label, to]) => <NavLink key={to} to={to} onClick={() => { if (moreRef.current) moreRef.current.open = false }}>{label}</NavLink>)}
            </div>
          </details>
        </nav>
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
