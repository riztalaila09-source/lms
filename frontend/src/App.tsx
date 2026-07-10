import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import UsersPage from '@/pages/UsersPage'
import CoursesPage from '@/pages/CoursesPage'
import CourseDetailPage from '@/pages/CourseDetailPage'
import TugasPage from '@/pages/TugasPage'
import AbsensiPage from '@/pages/AbsensiPage'
import MitraPklPage from '@/pages/MitraPklPage'
import PengumpulanPage from '@/pages/PengumpulanPage'
import NilaiPage from '@/pages/NilaiPage'
import LogAktivitasPage from '@/pages/LogAktivitasPage'
import PengaturanPage from '@/pages/PengaturanPage'
import { Role } from '@/gen/user/v1/user_pb'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

// Teacher (or legacy admin) only — full-control roles.
function StaffGuard({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, loadingProfile } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  // Wait for the profile before deciding, so we don't bounce to /dashboard.
  if (!user || loadingProfile) return null
  if (user.role !== Role.ADMIN && user.role !== Role.TEACHER) {
    return <Navigate to="/dashboard" replace />
  }
  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<AuthGuard><DashboardPage /></AuthGuard>} />
        <Route path="/users" element={<StaffGuard><UsersPage /></StaffGuard>} />
        <Route path="/courses" element={<AuthGuard><CoursesPage /></AuthGuard>} />
        <Route path="/courses/:id" element={<AuthGuard><CourseDetailPage /></AuthGuard>} />
        <Route path="/materi" element={<AuthGuard><CourseDetailPage forcedCourseId="general" /></AuthGuard>} />
        <Route path="/tugas" element={<AuthGuard><TugasPage /></AuthGuard>} />
        <Route path="/absensi" element={<AuthGuard><AbsensiPage /></AuthGuard>} />
        <Route path="/mitra-pkl" element={<AuthGuard><MitraPklPage /></AuthGuard>} />
        <Route path="/pengumpulan" element={<StaffGuard><PengumpulanPage /></StaffGuard>} />
        <Route path="/nilai" element={<AuthGuard><NilaiPage /></AuthGuard>} />
        <Route path="/log" element={<StaffGuard><LogAktivitasPage /></StaffGuard>} />
        <Route path="/pengaturan" element={<AuthGuard><PengaturanPage /></AuthGuard>} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
