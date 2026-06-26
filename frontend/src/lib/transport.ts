import { createConnectTransport } from '@connectrpc/connect-web'
import type { Interceptor } from '@connectrpc/connect'

const TOKEN_KEY = 'lms_token'

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

// Attaches Bearer token from localStorage to every outgoing request.
const authInterceptor: Interceptor = (next) => async (req) => {
  const token = getStoredToken()
  if (token) {
    req.header.set('Authorization', `Bearer ${token}`)
  }
  return next(req)
}

// Empty baseUrl means requests go to the same origin.
// In dev, Vite proxies /user.v1.UserService/* to http://localhost:8080.
// In production, the Go binary serves both the API and frontend.
export const transport = createConnectTransport({
  baseUrl: '',
  interceptors: [authInterceptor],
})
