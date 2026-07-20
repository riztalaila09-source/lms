import type { User } from '@/gen/user/v1/user_pb'
import { Role } from '@/gen/user/v1/user_pb'

// Access-right keys (must mirror the backend service constants).
export const PERMISSIONS: { key: string; label: string }[] = [
  { key: 'kelola_siswa', label: 'Kelola Murid' },
  { key: 'kelola_guru', label: 'Kelola Guru' },
  { key: 'kelola_ortu', label: 'Kelola Orang Tua' },
  { key: 'kelola_sekolah', label: 'Kelola Data Sekolah' },
  { key: 'kelola_nilai', label: 'Kelola Nilai' },
  { key: 'kelola_absensi', label: 'Kelola Absensi' },
  { key: 'kelola_materi', label: 'Kelola Materi' },
  { key: 'kelola_tugas', label: 'Kelola Tugas' },
  { key: 'kelola_pkl', label: 'Kelola Mitra PKL' },
  { key: 'kelola_log', label: 'Kelola Log Aktivitas' },
]

// Master-data account/school tabs — visibility of the Master Data menu.
export const MASTER_DATA_PERMS = ['kelola_siswa', 'kelola_guru', 'kelola_ortu', 'kelola_sekolah']

type MaybeUser = Pick<User, 'role' | 'permissions'> | null | undefined

export const isAdmin = (user: MaybeUser): boolean => user?.role === Role.ADMIN

// can reports whether the user holds a permission. Admins always do.
export function can(user: MaybeUser, key: string): boolean {
  if (!user) return false
  if (user.role === Role.ADMIN) return true
  if (user.role !== Role.TEACHER) return false
  return (user.permissions ?? []).includes(key)
}

// canAny reports whether the user holds at least one of the permissions.
export function canAny(user: MaybeUser, keys: string[]): boolean {
  return keys.some((k) => can(user, k))
}
