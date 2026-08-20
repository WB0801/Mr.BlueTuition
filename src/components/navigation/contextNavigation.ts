export interface ContextBackTarget {
  to: string
  label: string
  state?: unknown
}

export interface ContextNavigationState {
  contextBack?: ContextBackTarget
  restoreContextScroll?: boolean
  [key: string]: unknown
}

const internalRoutePatterns = [
  /^\/$/,
  /^\/students(?:\/new|\/[A-Za-z0-9_-]+(?:\/edit|\/enrollments\/[A-Za-z0-9_-]+)?)?$/,
  /^\/classes(?:\/subjects|\/new|\/[A-Za-z0-9_-]+(?:\/edit|\/sessions)?)?$/,
  /^\/attendance(?:\/session\/[A-Za-z0-9_-]+(?:\/sign\/[A-Za-z0-9_-]+|\/record\/[A-Za-z0-9_-]+)?)?$/,
  /^\/fees(?:\/unpaid|\/receipts|\/history)?$/,
  /^\/grades(?:\/school(?:\/new|\/[A-Za-z0-9_-]+(?:\/classes\/[A-Za-z0-9_-]+)?)?|\/quizzes(?:\/new|\/[A-Za-z0-9_-]+)?)?$/,
  /^\/temporary-classes(?:\/new|\/[A-Za-z0-9_-]+(?:\/edit)?)?$/,
  /^\/settings$/,
]

export function isSafeInternalRoute(to: unknown): to is string {
  if (typeof to !== 'string' || !to.startsWith('/') || to.startsWith('//')) return false
  if (to.includes('#') || to.includes('\\') || Array.from(to).some((character) => character.charCodeAt(0) < 32)) return false
  const queryIndex = to.indexOf('?')
  const pathname = queryIndex === -1 ? to : to.slice(0, queryIndex)
  if (!pathname || pathname.includes('//')) return false
  try {
    const decodedPath = decodeURIComponent(pathname)
    if (decodedPath.includes('..') || decodedPath.includes('/') && decodedPath !== pathname) return false
  } catch {
    return false
  }
  return internalRoutePatterns.some((pattern) => pattern.test(pathname))
}

export function createContextBack(
  sourcePath: string,
  label: string,
  sourceState: unknown,
): ContextBackTarget | null {
  if (!isSafeInternalRoute(sourcePath) || !label.trim()) return null
  return { to: sourcePath, label: label.trim(), state: sourceState }
}

export function readContextBack(state: unknown): ContextBackTarget | null {
  if (!state || typeof state !== 'object') return null
  const candidate = (state as ContextNavigationState).contextBack
  if (!candidate || !isSafeInternalRoute(candidate.to) || typeof candidate.label !== 'string' || !candidate.label.trim()) return null
  return { to: candidate.to, label: candidate.label.trim(), state: candidate.state }
}

export function getDefaultBackTarget(pathname: string): ContextBackTarget | null {
  if (pathname === '/') return null
  if (/^\/(students|classes|attendance|fees|grades|temporary-classes|settings)$/.test(pathname)) {
    return { to: '/', label: '首页' }
  }
  if (/^\/students\/[A-Za-z0-9_-]+\/enrollments\/[A-Za-z0-9_-]+$/.test(pathname)) {
    const [, , studentId] = pathname.split('/')
    return { to: `/students/${studentId}`, label: '学生' }
  }
  if (/^\/students\/[A-Za-z0-9_-]+\/edit$/.test(pathname)) {
    return { to: pathname.replace(/\/edit$/, ''), label: '学生' }
  }
  if (pathname === '/students/new' || /^\/students\/[A-Za-z0-9_-]+$/.test(pathname)) {
    return { to: '/students', label: '学生' }
  }
  if (/^\/classes\/[A-Za-z0-9_-]+\/(edit|sessions)$/.test(pathname)) {
    return { to: pathname.replace(/\/(edit|sessions)$/, ''), label: '班级' }
  }
  if (pathname === '/classes/new' || pathname === '/classes/subjects' || /^\/classes\/[A-Za-z0-9_-]+$/.test(pathname)) {
    return { to: '/classes', label: '班级' }
  }
  if (/^\/attendance\/session\/[A-Za-z0-9_-]+\/(sign\/[A-Za-z0-9_-]+|record\/[A-Za-z0-9_-]+)$/.test(pathname)) {
    return { to: pathname.replace(/\/(sign\/[A-Za-z0-9_-]+|record\/[A-Za-z0-9_-]+)$/, ''), label: '课程' }
  }
  if (/^\/attendance\/session\/[A-Za-z0-9_-]+$/.test(pathname)) {
    return { to: '/attendance', label: '课程' }
  }
  if (/^\/fees\//.test(pathname)) return { to: '/fees', label: '学费' }
  if (/^\/grades\/school\/[A-Za-z0-9_-]+\/classes\/[A-Za-z0-9_-]+$/.test(pathname)) {
    return { to: pathname.replace(/\/classes\/[A-Za-z0-9_-]+$/, ''), label: '考试' }
  }
  if (/^\/grades\/school\/[A-Za-z0-9_-]+$/.test(pathname)) return { to: '/grades/school', label: '学校考试' }
  if (pathname === '/grades/school/new') return { to: '/grades/school', label: '学校考试' }
  if (pathname.startsWith('/grades/school')) return { to: '/grades', label: '成绩' }
  if (/^\/grades\/quizzes\/[A-Za-z0-9_-]+$/.test(pathname)) return { to: '/grades/quizzes', label: '小测' }
  if (pathname === '/grades/quizzes/new') return { to: '/grades/quizzes', label: '小测' }
  if (pathname.startsWith('/grades/quizzes')) return { to: '/grades', label: '成绩' }
  if (/^\/temporary-classes\/[A-Za-z0-9_-]+\/edit$/.test(pathname)) {
    return { to: pathname.replace(/\/edit$/, ''), label: '临时班' }
  }
  if (pathname === '/temporary-classes/new' || /^\/temporary-classes\/[A-Za-z0-9_-]+$/.test(pathname)) {
    return { to: '/temporary-classes', label: '临时班' }
  }
  return { to: '/', label: '首页' }
}

export function resolveBackTarget(
  pathname: string,
  state: unknown,
  fallbackTo?: string,
  fallbackLabel?: string,
) {
  const contextual = readContextBack(state)
  if (contextual) return contextual
  if (isSafeInternalRoute(fallbackTo) && fallbackLabel?.trim()) {
    return { to: fallbackTo, label: fallbackLabel.trim() }
  }
  return getDefaultBackTarget(pathname)
}

export function scrollPositionKey(path: string) {
  return `context-scroll:${path}`
}
