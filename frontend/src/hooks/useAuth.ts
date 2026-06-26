import { useState, useCallback } from 'react'
import { userClient } from '@/lib/client'
import { clearStoredToken, getStoredToken, setStoredToken } from '@/lib/transport'
import type { AuthUser } from '@/types/auth'

export function useAuth() {
  const [token, setToken] = useState<string | null>(() => getStoredToken())
  const [user, setUser] = useState<AuthUser | null>(null)

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    const res = await userClient.login({ email, password })
    setStoredToken(res.token)
    setToken(res.token)
    if (res.user) {
      setUser(res.user)
    }
  }, [])

  const logout = useCallback((): void => {
    clearStoredToken()
    setToken(null)
    setUser(null)
  }, [])

  const loadProfile = useCallback(async (): Promise<void> => {
    const res = await userClient.getProfile({})
    setUser(res)
  }, [])

  return {
    token,
    user,
    isAuthenticated: !!token,
    login,
    logout,
    loadProfile,
  }
}
