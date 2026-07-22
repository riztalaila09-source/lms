import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export type Lang = 'id' | 'en'

// Translations for the student-facing chrome (top nav, home, footer). Deeper
// management pages stay Indonesian for now.
const DICT: Record<string, { id: string; en: string }> = {
  'nav.home': { id: 'Beranda', en: 'Home' },
  'nav.courses': { id: 'Mata Pelajaran', en: 'Subjects' },
  'nav.materials': { id: 'Materi Umum', en: 'General Materials' },
  'nav.tasks': { id: 'Tugas', en: 'Assignments' },
  'nav.attendance': { id: 'Absensi', en: 'Attendance' },
  'nav.pkl': { id: 'Mitra PKL', en: 'Internship Partners' },
  'nav.grades': { id: 'Nilai', en: 'Grades' },
  'nav.settings': { id: 'Pengaturan', en: 'Settings' },
  'nav.logout': { id: 'Keluar', en: 'Log out' },
  'search.placeholder': { id: 'Cari materi…', en: 'Search materials…' },

  'home.exploreGeneral': { id: 'Jelajahi Materi Umum', en: 'Explore General Materials' },
  'home.popular': { id: 'Materi Populer', en: 'Popular Materials' },
  'home.readMaterial': { id: 'Baca Materi', en: 'Read Material' },
  'home.storiesTitle': { id: 'Bergabung dengan yang lain mengubah cara belajar mereka', en: 'Join others transforming the way they learn' },
  'home.storiesSub': { id: 'Cerita dari murid & guru', en: 'Stories from students & teachers' },
  'home.seeAllStories': { id: 'Lihat semua cerita', en: 'See all stories' },
  'home.hide': { id: 'Sembunyikan', en: 'Hide' },
  'home.showAll': { id: 'Tampilkan semua materi', en: 'Show all materials' },
  'home.showAllPopular': { id: 'Tampilkan semua materi populer', en: 'Show all popular materials' },
  'home.noGeneral': { id: 'Belum ada materi umum.', en: 'No general materials yet.' },
  'home.noneInCat': { id: 'Tidak ada materi di kategori ini.', en: 'No materials in this category.' },
  'home.quick.subjects': { id: 'Kelas yang Anda ikuti', en: 'Classes you are enrolled in' },
  'home.quick.tasks': { id: 'Kerjakan & kumpulkan tugas', en: 'Do & submit assignments' },
  'home.quick.grades': { id: 'Lihat nilai per mapel', en: 'See grades per subject' },

  'promo.title': { id: 'Dapatkan sertifikasi dan maju dalam karier Anda', en: 'Get certified and advance your career' },
  'promo.desc': { id: 'Siapkan diri untuk sertifikasi TKJ dengan materi terarah — jaringan, keamanan siber, dan server.', en: 'Prepare for vocational IT certifications with focused materials — networking, cyber security, and servers.' },
  'promo.cta': { id: 'Jelajahi jalur sertifikasi', en: 'Explore certification tracks' },
  'promo.c1.t': { id: 'Jaringan', en: 'Networking' },
  'promo.c1.d': { id: 'MikroTik (MTCNA), Cisco (CCNA)', en: 'MikroTik (MTCNA), Cisco (CCNA)' },
  'promo.c2.t': { id: 'Keamanan Siber', en: 'Cyber Security' },
  'promo.c2.d': { id: 'CompTIA Security+, Network+', en: 'CompTIA Security+, Network+' },
  'promo.c3.t': { id: 'Server & Cloud', en: 'Server & Cloud' },
  'promo.c3.d': { id: 'Linux, Administrasi Server', en: 'Linux, Server Administration' },

  'footer.explore': { id: 'Jelajahi', en: 'Explore' },
  'footer.about': { id: 'Tentang', en: 'About' },
  'footer.help': { id: 'Bantuan', en: 'Help' },
  'footer.aboutSchool': { id: 'Tentang Sekolah', en: 'About the School' },
  'footer.contact': { id: 'Hubungi Kami', en: 'Contact Us' },
  'footer.privacy': { id: 'Kebijakan Privasi', en: 'Privacy Policy' },
  'footer.terms': { id: 'Ketentuan', en: 'Terms' },
  'footer.lang': { id: 'Bahasa', en: 'Language' },

  // --- Management shell: sidebar (admin/teacher) ---
  'sb.panel.admin': { id: 'Panel Admin', en: 'Admin Panel' },
  'sb.panel.teacher': { id: 'Panel Guru', en: 'Teacher Panel' },
  'sb.panel.student': { id: 'Panel Murid', en: 'Student Panel' },
  'sb.panel.default': { id: 'Portal Belajar', en: 'Learning Portal' },
  'sb.learning': { id: 'Pembelajaran', en: 'Learning' },
  'sb.courses': { id: 'Daftar Mapel', en: 'Subjects' },
  'sb.submissions': { id: 'Pengumpulan', en: 'Submissions' },
  'sb.log': { id: 'Log Aktivitas', en: 'Activity Log' },
  'sb.academicData': { id: 'Data Akademik', en: 'Academic Data' },
  'sb.schoolProfile': { id: 'Profil Sekolah', en: 'School Profile' },
  'sb.sp.home': { id: 'Beranda', en: 'Home' },
  'sb.sp.ppdb': { id: 'PPDB', en: 'Admissions' },
  'sb.sp.gallery': { id: 'Galeri', en: 'Gallery' },
  'sb.sp.news': { id: 'Berita', en: 'News' },
  'sb.sp.academic': { id: 'Akademik', en: 'Academic' },
  'sb.users': { id: 'Pengguna', en: 'Users' },
  'sb.teachers': { id: 'Guru', en: 'Teachers' },
  'sb.students': { id: 'Murid', en: 'Students' },
  'sb.parents': { id: 'Orang Tua', en: 'Parents' },
  'sb.admins': { id: 'Admin', en: 'Admins' },
  'sb.collapse': { id: 'Ciutkan menu', en: 'Collapse menu' },
  'sb.expand': { id: 'Buka menu', en: 'Expand menu' },
  'sb.logoutConfirm': { id: 'Yakin ingin keluar?', en: 'Are you sure you want to log out?' },

  'role.admin': { id: 'Admin', en: 'Admin' },
  'role.teacher': { id: 'Guru', en: 'Teacher' },
  'role.student': { id: 'Murid', en: 'Student' },

  'common.user': { id: 'Pengguna', en: 'User' },
  'common.save': { id: 'Simpan', en: 'Save' },
  'common.saving': { id: 'Menyimpan…', en: 'Saving…' },

  // --- Appearance / theme + language controls ---
  'appear.theme': { id: 'Tema', en: 'Theme' },
  'appear.light': { id: 'Terang', en: 'Light' },
  'appear.dark': { id: 'Gelap', en: 'Dark' },
  'appear.language': { id: 'Bahasa', en: 'Language' },
  'appear.langId': { id: 'Bahasa Indonesia', en: 'Indonesian' },
  'appear.langEn': { id: 'Bahasa Inggris', en: 'English' },

  // --- Settings page (Pengaturan) shell ---
  'settings.title': { id: 'Pengaturan', en: 'Settings' },
  'settings.subtitle': { id: 'Kelola profil, keamanan, dan preferensi akun Anda.', en: 'Manage your profile, security, and account preferences.' },
  'settings.tab.profile': { id: 'Profil', en: 'Profile' },
  'settings.tab.password': { id: 'Password', en: 'Password' },
  'settings.tab.story': { id: 'Cerita', en: 'Story' },
  'settings.tab.appearance': { id: 'Tampilan', en: 'Appearance' },
  'settings.tab.access': { id: 'Hak Akses', en: 'Access Rights' },
  'settings.tab.backup': { id: 'Backup', en: 'Backup' },
  'settings.appearance.title': { id: 'Tampilan', en: 'Appearance' },
  'settings.appearance.desc': { id: 'Sesuaikan tema warna dan bahasa antarmuka.', en: 'Customize the color theme and interface language.' },
}

interface LangCtx { lang: Lang; setLang: (l: Lang) => void; t: (key: string) => string }
const LangContext = createContext<LangCtx | null>(null)

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try { return (localStorage.getItem('lms_lang') as Lang) || 'id' } catch { return 'id' }
  })
  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try { localStorage.setItem('lms_lang', l) } catch { /* ignore */ }
  }, [])
  const t = useCallback((key: string) => DICT[key]?.[lang] ?? key, [lang])
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function useLang(): LangCtx {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang must be used within <LangProvider>')
  return ctx
}
