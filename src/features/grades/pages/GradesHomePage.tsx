import { Navigate, useLocation } from 'react-router-dom'

export function GradesHomePage() {
  const location = useLocation()
  return <Navigate to="/grades/school" replace state={location.state} />
}
