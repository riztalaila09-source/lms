import type { User } from '@/gen/user/v1/user_pb'

export type AuthUser = User

export interface AuthState {
  user: AuthUser | null
  token: string | null
  isAuthenticated: boolean
}
