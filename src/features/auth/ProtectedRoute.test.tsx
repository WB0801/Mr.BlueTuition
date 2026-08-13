import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from './authContext'
import { ProtectedRoute } from './ProtectedRoute'

const signedOutContext: AuthContextValue = {
  session: null,
  user: null,
  isLoading: false,
  isConfigured: true,
  signIn: async () => undefined,
  signOut: async () => undefined,
}

describe('ProtectedRoute', () => {
  it('redirects signed-out visitors to login', () => {
    render(
      <AuthContext.Provider value={signedOutContext}>
        <MemoryRouter initialEntries={['/students']}>
          <Routes>
            <Route path="/login" element={<h1>登录页面</h1>} />
            <Route element={<ProtectedRoute />}>
              <Route path="/students" element={<h1>学生页面</h1>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    )

    expect(screen.getByRole('heading', { name: '登录页面' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '学生页面' })).not.toBeInTheDocument()
  })
})
