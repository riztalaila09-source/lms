import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { userClient } from '@/lib/client'
import { clearStoredToken, getStoredToken, setStoredToken } from '@/lib/transport'
import type { AuthUser } from '@/types/auth'

interface AuthContextValue {
  token: string | null
  user: AuthUser | null
  isAuthenticated: boolean
  /** True while we have a token but are still fetching the profile. */
  loadingProfile: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  loadProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getStoredToken())
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loadingProfile, setLoadingProfile] = useState<boolean>(!!getStoredToken())

  const loadProfile = useCallback(async (): Promise<void> => {
    setLoadingProfile(true)
    try {
      const res = await userClient.getProfile({})
      setUser(res)
    } finally {
      setLoadingProfile(false)
    }
  }, [])

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    const res = await userClient.login({ email, password })
    setStoredToken(res.token)
    setToken(res.token)
    if (res.user) setUser(res.user)
  }, [])

  const logout = useCallback((): void => {
    clearStoredToken()
    setToken(null)
    setUser(null)
  }, [])

  // Hydrate the profile once when a token exists but the user isn't loaded yet
  // (e.g. after a page refresh).
  useEffect(() => {
    if (token && !user) {
      loadProfile().catch(() => {
        clearStoredToken()
        setToken(null)
        setUser(null)
      })
    } else if (!token) {
      setLoadingProfile(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  return (
    <AuthContext.Provider
      value={{ token, user, isAuthenticated: !!token, loadingProfile, login, logout, loadProfile }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
