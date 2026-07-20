import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import {
  Badge, Box, Button, Checkbox, Dialog, Field, Flex, Icon, IconButton, Input, NativeSelect, Stack, Table, Text, Textarea,
} from '@chakra-ui/react'
import {
  LuPlus, LuTrash2, LuPencil, LuSearch, LuUpload, LuDownload, LuFileText, LuCopy, LuArrowRightLeft,
  LuSave, LuCircleCheck, LuBuilding, LuSquare, LuSquareCheck, LuUser,
} from 'react-icons/lu'
import { userClient, classClient, jurusanClient, schoolClient, parentClient } from '@/lib/client'
import type { User } from '@/gen/user/v1/user_pb'
import { Role } from '@/gen/user/v1/user_pb'
import type { Class } from '@/gen/class/v1/class_pb'
import type { Jurusan } from '@/gen/jurusan/v1/jurusan_pb'
import type { Semester } from '@/gen/school/v1/school_pb'
import type { Parent } from '@/gen/parent/v1/parent_pb'
import AppLayout from '@/components/AppLayout'
import { Card } from '@/components/Card'
import ConfirmDialog, { type ConfirmState } from '@/components/ConfirmDialog'
import Pagination, { usePaged } from '@/components/Pagination'
import { COLORS, labelColor } from '@/theme/tokens'
import { toaster } from '@/components/ui/toaster'
import { useAuth } from '@/hooks/useAuth'
import { can, isAdmin, PERMISSIONS } from '@/lib/permissions'

// Chip pilih-kelas yang bisa dicentang banyak. Sengaja pakai onClick eksplisit
// (bukan Chakra Checkbox.Root) agar toggle tetap andal di dalam Dialog/portal.
function KelasChip({ name, on, onToggle }: { name: string; on: boolean; onToggle: () => void }) {
  return (
    <Flex align="center" gap="6px" onClick={onToggle} role="checkbox" aria-checked={on} userSelect="none"
      px="10px" py="6px" borderRadius="7px" border="1px solid" cursor="pointer"
      borderColor={on ? COLORS.primary : COLORS.border} bg={on ? COLORS.primaryTint : COLORS.surface}>
      <Icon as={on ? LuSquareCheck : LuSquare} boxSize="16px" color={on ? COLORS.primary : COLORS.muted} />
      <Text fontSize="13px">{name}</Text>
    </Flex>
  )
}

// Searchable + class-filterable multi-select of students, for picking a parent's children.
function StudentPicker({ students, selected, onToggle, search, onSearch, kelasOptions }: {
  students: User[]; selected: string[]; onToggle: (id: string) => void
  search: string; onSearch: (v: string) => void; kelasOptions: string[]
}) {
  const [filterKelas, setFilterKelas] = useState('')
  const q = search.trim().toLowerCase()
  const filtered = students.filter((s) =>
    (!filterKelas || s.kelas === filterKelas) &&
    (!q || (s.fullName || s.username).toLowerCase().includes(q) || s.kelas.toLowerCase().includes(q)),
  )
  return (
    <Box>
      <Flex align="center" gap="8px" mb="6px" wrap="wrap">
        <Flex align="center" gap="6px">
          <Icon as={LuSearch} color={COLORS.muted} />
          <Input size="sm" maxW="220px" value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Cari nama murid…" />
        </Flex>
        <NativeSelect.Root size="sm" maxW="150px">
          <NativeSelect.Field value={filterKelas} onChange={(e) => setFilterKelas(e.target.value)}>
            <option value="">— Semua kelas —</option>
            {kelasOptions.map((k) => <option key={k} value={k}>{k}</option>)}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
        <Text fontSize="12px" color={COLORS.muted}>{selected.length} anak dipilih</Text>
      </Flex>
      <Flex gap="8px" wrap="wrap" maxH="180px" overflowY="auto">
        {filtered.length === 0 ? <Text fontSize="12px" color={COLORS.muted}>Tidak ada murid.</Text> : filtered.map((s) => (
          <KelasChip key={s.id} name={`${s.fullName || s.username}${s.kelas ? ` (${s.kelas})` : ''}`}
            on={selected.includes(s.id)} onToggle={() => onToggle(s.id)} />
        ))}
      </Flex>
    </Box>
  )
}

type Tab = 'sekolah' | 'semester' | 'kelas' | 'jurusan' | 'wali' | 'guru' | 'siswa' | 'ortu' | 'admin'

interface EditForm {
  fullName: string
  username: string
  email: string
  kelas: string
  mapel: string
  gender: string
  phone: string
  password: string
}

interface ImportRow {
  fullName: string; username: string; email: string; password: string; kelas: string; gender: string; phone: string
}

const TEMPLATE_CSV = [
  'Nama Lengkap,Username,Email,Password,Kelas,Jenis Kelamin,No HP',
  'Andi Pratama,andi.pratama,andi@sekolah.com,Password123,X-TKJ-1,L,081234567890',
  'Citra Dewi,citra.dewi,citra@sekolah.com,Password123,X-TKR-1,P,081298765432',
].join('\n')

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function parseCSV(text: string): ImportRow[] {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = lines[0].toLowerCase().split(',').map(s => s.trim().replace(/['"]/g, ''))
  const idx = {
    fullName: headers.findIndex(h => h.includes('nama')),
    username: headers.findIndex(h => h === 'username'),
    email: headers.findIndex(h => h === 'email'),
    password: headers.findIndex(h => h === 'password'),
    kelas: headers.findIndex(h => h === 'kelas'),
    gender: headers.findIndex(h => h.includes('kelamin') || h === 'gender' || h === 'jk' || h === 'l/p'),
    phone: headers.findIndex(h => h.includes('hp') || h.includes('telp') || h.includes('telepon') || h.includes('phone') || h.includes('wa')),
  }
  // Accepts "L"/"P", "Laki-laki"/"Perempuan", "male"/"female".
  const normGender = (v: string) => {
    const s = v.trim().toLowerCase()
    if (s.startsWith('l') || s.startsWith('m')) return 'L'
    if (s.startsWith('p') || s.startsWith('w') || s.startsWith('f')) return 'P'
    return ''
  }
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''))
    const get = (i: number) => (i >= 0 ? vals[i] || '' : '')
    return { fullName: get(idx.fullName), username: get(idx.username), email: get(idx.email), password: get(idx.password), kelas: get(idx.kelas), gender: normGender(get(idx.gender)), phone: get(idx.phone) }
  }).filter(r => r.fullName || r.username || r.email)
}

// ── Orang Tua CSV (import/export/template) ──
const TEMPLATE_ORTU_CSV = [
  'Nama Orang Tua,Hubungan,No HP,Alamat,Anak,Kelas Anak',
  'Bapak Slamet,Ayah,081234567890,Jl. Mawar No.1,Andi Pratama;Budi Santoso,X-TKJ-1;X-TKR-1',
  'Ibu Sri,Ibu,081298765432,Jl. Melati No.2,Citra Dewi,X-TKJ-1',
].join('\n')

// Splits one CSV line, respecting double-quoted fields (so Alamat may contain commas).
function splitCSVLine(line: string): string[] {
  const out: string[] = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else inQ = false } else cur += ch
    } else if (ch === '"') inQ = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

interface ParentImportRow { namaOrtu: string; hubungan: string; phone: string; alamat: string; anak: string }
function parseParentsCSV(text: string): ParentImportRow[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const headers = splitCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/['"]/g, ''))
  const find = (...keys: string[]) => headers.findIndex((h) => keys.some((k) => h.includes(k)))
  const idx = {
    namaOrtu: find('nama orang tua', 'nama ortu', 'nama'),
    hubungan: find('hubungan'),
    phone: find('no hp', 'no. hp', 'telp', 'phone', 'wa', 'hp'),
    alamat: find('alamat'),
    anak: find('anak'),
  }
  return lines.slice(1).map((line) => {
    const vals = splitCSVLine(line)
    const get = (i: number) => (i >= 0 ? (vals[i] || '') : '')
    return { namaOrtu: get(idx.namaOrtu), hubungan: get(idx.hubungan), phone: get(idx.phone), alamat: get(idx.alamat), anak: get(idx.anak) }
  }).filter((r) => r.namaOrtu)
}

// Small badge for a user's gender ('L' | 'P' | '').
function GenderBadge({ g }: { g: string }) {
  if (g === 'L') return <Badge colorPalette="blue">L</Badge>
  if (g === 'P') return <Badge colorPalette="pink">P</Badge>
  return <Text as="span" color={COLORS.muted}>-</Text>
}

type Section = 'akademik' | 'guru' | 'siswa' | 'ortu' | 'admin'
// Which tabs belong to each menu/page. Single-tab sections hide the tab bar.
const SECTION_TABS: Record<Section, Tab[]> = {
  akademik: ['sekolah', 'semester', 'kelas', 'jurusan', 'wali'],
  guru: ['guru'],
  siswa: ['siswa'],
  ortu: ['ortu'],
  admin: ['admin'],
}
const SECTION_TITLE: Record<Section, string> = {
  akademik: 'Data Akademik', guru: 'Data Guru', siswa: 'Data Murid', ortu: 'Data Orang Tua', admin: 'Data Admin',
}
const SECTION_SUB: Record<Section, string> = {
  akademik: 'Data Sekolah, Semester, Kelas, dan Jurusan',
  guru: 'Kelola akun guru', siswa: 'Kelola akun murid', ortu: 'Kelola data & kontak orang tua', admin: 'Kelola akun admin',
}

export default function UsersPage({ section = 'guru' }: { section?: Section } = {}) {
  const { user: me } = useAuth()
  const [tab, setTab] = useState<Tab>(SECTION_TABS[section][0])
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  // Access-right required per tab (admins see all).
  const tabPerm: Record<Tab, string | 'admin'> = {
    sekolah: 'kelola_sekolah', semester: 'kelola_sekolah', kelas: 'kelola_sekolah', jurusan: 'kelola_sekolah', wali: 'kelola_sekolah',
    guru: 'kelola_guru', siswa: 'kelola_siswa', ortu: 'kelola_ortu', admin: 'admin',
  }
  const canTab = (t: Tab) => (tabPerm[t] === 'admin' ? isAdmin(me) : can(me, tabPerm[t]))
  const inSection = (t: Tab) => SECTION_TABS[section].includes(t)

  // plain passwords typed this session (fallback before the list reloads)
  const [passwords, setPasswords] = useState<Record<string, string>>({})

  // edit dialog
  const [editTarget, setEditTarget] = useState<{ user: User; role: 'guru' | 'siswa' | 'admin' } | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ fullName: '', username: '', email: '', kelas: '', mapel: '', gender: '', phone: '', password: '' })
  const [editGuruKelas, setEditGuruKelas] = useState<string[]>([])
  const [editGuruPerms, setEditGuruPerms] = useState<string[]>([]) // Hak Akses (admin editing a guru)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  // shared data
  const [classes, setClasses] = useState<Class[]>([])
  const [jurusans, setJurusans] = useState<Jurusan[]>([])
  const [teachers, setTeachers] = useState<User[]>([])
  const [students, setStudents] = useState<User[]>([])

  const loadClasses = useCallback(async () => {
    try { const r = await classClient.listClasses({}); setClasses(r.classes) } catch { setClasses([]) }
  }, [])
  const loadJurusans = useCallback(async () => {
    try { const r = await jurusanClient.listJurusans({}); setJurusans(r.jurusans) } catch { setJurusans([]) }
  }, [])
  const loadTeachers = useCallback(async () => {
    try {
      const r = await userClient.listUsers({ roleFilter: Role.TEACHER, pagination: { page: 1, pageSize: 100 } })
      setTeachers(r.users)
    } catch { setTeachers([]) }
  }, [])

  // ── Wali Kelas ──
  const [waliKelas, setWaliKelas] = useState('')   // class id
  const [waliGuru, setWaliGuru] = useState('')     // teacher id
  const [waliPhone, setWaliPhone] = useState('')
  const [waliErr, setWaliErr] = useState('')
  const [waliSaving, setWaliSaving] = useState(false)
  // Selecting a class prefills its current wali; selecting a teacher fills their No. HP.
  const pickWaliKelas = (id: string) => {
    setWaliKelas(id)
    const c = classes.find((x) => x.id === id)
    setWaliGuru(c?.waliTeacherId || '')
    setWaliPhone(c?.waliPhone || '')
  }
  const pickWaliGuru = (id: string) => {
    setWaliGuru(id)
    setWaliPhone(teachers.find((t) => t.id === id)?.phone || '')
  }
  const saveWali = async (e: React.FormEvent) => {
    e.preventDefault(); setWaliErr(''); setWaliSaving(true)
    try {
      if (!waliKelas) throw new Error('Pilih kelas dulu.')
      if (!waliGuru) throw new Error('Pilih guru wali kelas.')
      const t = teachers.find((x) => x.id === waliGuru)
      // Save a manually-typed No. HP onto the teacher's account (single source).
      if (t && waliPhone.trim() && waliPhone.trim() !== t.phone) {
        await userClient.updateUser({ id: t.id, phone: waliPhone.trim() })
      }
      await classClient.setClassWali({ classId: waliKelas, teacherId: waliGuru })
      setWaliKelas(''); setWaliGuru(''); setWaliPhone('')
      await loadClasses(); await loadTeachers()
    } catch (err: unknown) { setWaliErr(err instanceof Error ? err.message : 'Gagal menyimpan wali kelas') }
    finally { setWaliSaving(false) }
  }
  const removeWali = (c: Class) => setConfirm({
    title: 'Hapus Wali Kelas', message: `Hapus wali kelas untuk "${c.name}"?`,
    variant: 'danger', confirmLabel: 'Ya, Hapus',
    onConfirm: async () => { try { await classClient.setClassWali({ classId: c.id, teacherId: '' }); await loadClasses() } catch (e: unknown) { toaster.create({ description: e instanceof Error ? e.message : 'Gagal', type: 'error' }) } },
  })

  // ── Admin ──
  const [admins, setAdmins] = useState<User[]>([])
  const emptyAdmin = { fullName: '', username: '', email: '', password: '', phone: '' }
  const [adminForm, setAdminForm] = useState(emptyAdmin)
  const [adminErr, setAdminErr] = useState('')
  const [adminSaving, setAdminSaving] = useState(false)
  const loadAdmins = useCallback(async () => {
    try {
      const r = await userClient.listUsers({ roleFilter: Role.ADMIN, pagination: { page: 1, pageSize: 100 } })
      setAdmins(r.users)
    } catch { setAdmins([]) }
  }, [])
  const addAdmin = async (e: React.FormEvent) => {
    e.preventDefault(); setAdminErr(''); setAdminSaving(true)
    try {
      const u = await userClient.createUser({ ...adminForm, role: Role.ADMIN, kelas: '', jurusan: '' })
      if (adminForm.password) setPasswords((p) => ({ ...p, [u.id]: adminForm.password }))
      setAdminForm(emptyAdmin); await loadAdmins()
    } catch (err: unknown) { setAdminErr(err instanceof Error ? err.message : 'Gagal menambah admin') }
    finally { setAdminSaving(false) }
  }
  const delAdmin = (u: User) => setConfirm({
    title: 'Hapus Admin', message: `Hapus akun admin "${u.fullName || u.username}"?`,
    variant: 'danger', confirmLabel: 'Ya, Hapus',
    onConfirm: async () => { try { await userClient.deleteUser({ id: u.id }); await loadAdmins() } catch (e: unknown) { toaster.create({ description: e instanceof Error ? e.message : 'Gagal', type: 'error' }) } },
  })

  // ── Kelas (format gabungan: Tingkat-Jurusan-Nomor, mis. X-TKJ-1) ──
  const [kTingkat, setKTingkat] = useState('X')
  const [kJurusan, setKJurusan] = useState('')
  const [kNomor, setKNomor] = useState('1')
  const [kelasErr, setKelasErr] = useState('')
  const [editKelas, setEditKelas] = useState<Class | null>(null)
  const [editKelasName, setEditKelasName] = useState('')
  const [editKelasErr, setEditKelasErr] = useState('')
  const [savingKelas, setSavingKelas] = useState(false)
  const kelasPreview = `${kTingkat}-${kJurusan || '…'}-${kNomor || '…'}`
  const addKelas = async () => {
    const t = kTingkat.trim(), j = kJurusan.trim(), n = kNomor.trim()
    if (!t || !j || !n) { setKelasErr('Lengkapi Tingkat, Jurusan, dan Nomor.'); return }
    const name = `${t}-${j}-${n}`
    setKelasErr('')
    try { await classClient.createClass({ name }); setKNomor('1'); await loadClasses() }
    catch (err: unknown) { setKelasErr(err instanceof Error ? err.message : 'Gagal membuat kelas') }
  }
  const startEditKelas = (c: Class) => { setEditKelas(c); setEditKelasName(c.name); setEditKelasErr('') }
  const saveEditKelas = async () => {
    if (!editKelas) return
    const name = editKelasName.trim()
    if (!name) { setEditKelasErr('Nama kelas wajib diisi.'); return }
    setSavingKelas(true); setEditKelasErr('')
    try {
      await classClient.updateClass({ id: editKelas.id, name })
      setEditKelas(null)
      await Promise.all([loadClasses(), tab === 'siswa' ? loadStudents() : Promise.resolve()])
    } catch (err: unknown) {
      setEditKelasErr(err instanceof Error ? err.message : 'Gagal mengubah kelas')
    } finally { setSavingKelas(false) }
  }

  // ── Jurusan ──
  const [newJurusan, setNewJurusan] = useState('')
  const [jurusanErr, setJurusanErr] = useState('')
  const [editJurusan, setEditJurusan] = useState<Jurusan | null>(null)
  const [editJurusanName, setEditJurusanName] = useState('')
  const [editJurusanErr, setEditJurusanErr] = useState('')
  const [savingJurusan, setSavingJurusan] = useState(false)
  const addJurusan = async () => {
    const name = newJurusan.trim()
    if (!name) return
    setJurusanErr('')
    try { await jurusanClient.createJurusan({ name }); setNewJurusan(''); await loadJurusans() }
    catch (err: unknown) { setJurusanErr(err instanceof Error ? err.message : 'Gagal membuat jurusan') }
  }
  const delJurusan = (j: Jurusan) => setConfirm({
    title: 'Hapus Jurusan', message: `Hapus jurusan "${j.name}"? Murid yang memakai jurusan ini tetap ada, tapi opsinya hilang.`,
    variant: 'danger', confirmLabel: 'Ya, Hapus',
    onConfirm: async () => { try { await jurusanClient.deleteJurusan({ id: j.id }); await loadJurusans() } catch (e: unknown) { toaster.create({ description: e instanceof Error ? e.message : 'Gagal', type: 'error' }) } },
  })
  const startEditJurusan = (j: Jurusan) => { setEditJurusan(j); setEditJurusanName(j.name); setEditJurusanErr('') }
  const saveEditJurusan = async () => {
    if (!editJurusan) return
    const name = editJurusanName.trim()
    if (!name) { setEditJurusanErr('Nama jurusan wajib diisi.'); return }
    setSavingJurusan(true); setEditJurusanErr('')
    try {
      await jurusanClient.updateJurusan({ id: editJurusan.id, name })
      setEditJurusan(null)
      await Promise.all([loadJurusans(), tab === 'siswa' ? loadStudents() : Promise.resolve()])
    } catch (err: unknown) {
      setEditJurusanErr(err instanceof Error ? err.message : 'Gagal mengubah jurusan')
    } finally { setSavingJurusan(false) }
  }
  const delKelas = (c: Class) => setConfirm({
    title: 'Hapus Kelas', message: `Hapus kelas "${c.name}"? Mapel yang memakai kelas ini akan kehilangan kaitannya.`,
    variant: 'danger', confirmLabel: 'Ya, Hapus',
    onConfirm: async () => { try { await classClient.deleteClass({ id: c.id }); await loadClasses() } catch (e: unknown) { toaster.create({ description: e instanceof Error ? e.message : 'Gagal', type: 'error' }) } },
  })

  // ── Guru ──
  // ── Data Sekolah ──
  const [schoolName, setSchoolName] = useState('')
  const [schoolAddr, setSchoolAddr] = useState('')
  const [schoolMsg, setSchoolMsg] = useState('')
  const [savingSchool, setSavingSchool] = useState(false)
  const loadSchool = useCallback(async () => {
    try { const s = await schoolClient.getSchool({}); setSchoolName(s.name); setSchoolAddr(s.address) } catch { /* ignore */ }
  }, [])
  const saveSchool = async () => {
    setSchoolMsg(''); setSavingSchool(true)
    try { await schoolClient.updateSchool({ name: schoolName, address: schoolAddr }); setSchoolMsg('Data sekolah tersimpan.') }
    catch (e: unknown) { setSchoolMsg(e instanceof Error ? e.message : 'Gagal menyimpan') }
    finally { setSavingSchool(false) }
  }

  // ── Semester ──
  const [semesters, setSemesters] = useState<Semester[]>([])
  const [semSel, setSemSel] = useState('ganjil')
  const [semTahun, setSemTahun] = useState('')
  const [semErr, setSemErr] = useState('')
  const loadSemesters = useCallback(async () => {
    try { const r = await schoolClient.listSemesters({}); setSemesters(r.semesters) } catch { setSemesters([]) }
  }, [])
  const addSemester = async () => {
    if (!semTahun.trim()) { setSemErr('Isi tahun ajaran, mis. 2026/2027.'); return }
    setSemErr('')
    try { await schoolClient.createSemester({ semester: semSel, tahunAjaran: semTahun.trim() }); setSemTahun(''); await loadSemesters() }
    catch (e: unknown) { setSemErr(e instanceof Error ? e.message : 'Gagal menambah semester') }
  }
  const activateSemester = async (id: string) => {
    try { await schoolClient.setActiveSemester({ id }); await loadSemesters() } catch (e: unknown) { toaster.create({ description: e instanceof Error ? e.message : 'Gagal', type: 'error' }) }
  }
  const delSemester = (s: Semester) => setConfirm({
    title: 'Hapus Semester', message: `Hapus ${s.semester} ${s.tahunAjaran}?`,
    variant: 'danger', confirmLabel: 'Ya, Hapus',
    onConfirm: async () => { try { await schoolClient.deleteSemester({ id: s.id }); await loadSemesters() } catch (e: unknown) { toaster.create({ description: e instanceof Error ? e.message : 'Gagal', type: 'error' }) } },
  })

  const emptyGuru = { fullName: '', username: '', email: '', password: '', mapel: '', gender: '', phone: '' }
  const [guruForm, setGuruForm] = useState(emptyGuru)
  const [guruKelas, setGuruKelas] = useState<string[]>([])
  const [guruErr, setGuruErr] = useState('')
  const [guruSaving, setGuruSaving] = useState(false)
  const toggleGuruKelas = (name: string) =>
    setGuruKelas((arr) => (arr.includes(name) ? arr.filter((x) => x !== name) : [...arr, name]))
  const addGuru = async (e: React.FormEvent) => {
    e.preventDefault(); setGuruErr(''); setGuruSaving(true)
    try {
      const u = await userClient.createUser({ ...guruForm, role: Role.TEACHER, kelas: guruKelas.join(', '), jurusan: '' })
      if (guruForm.password) setPasswords(p => ({ ...p, [u.id]: guruForm.password }))
      setGuruForm(emptyGuru); setGuruKelas([]); await loadTeachers()
    } catch (err: unknown) { setGuruErr(err instanceof Error ? err.message : 'Gagal menambah guru') }
    finally { setGuruSaving(false) }
  }
  const delGuru = (u: User) => setConfirm({
    title: 'Hapus Guru', message: `Hapus akun guru "${u.fullName || u.username}"?`,
    variant: 'danger', confirmLabel: 'Ya, Hapus',
    onConfirm: async () => { try { await userClient.deleteUser({ id: u.id }); await loadTeachers() } catch (e: unknown) { toaster.create({ description: e instanceof Error ? e.message : 'Gagal', type: 'error' }) } },
  })

  // ── Murid ──
  const emptySiswa = { fullName: '', username: '', email: '', password: '', kelas: '', gender: '', phone: '' }
  const [siswaForm, setSiswaForm] = useState(emptySiswa)
  const [siswaErr, setSiswaErr] = useState('')
  const [siswaSaving, setSiswaSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filterKelas, setFilterKelas] = useState('')
  // Quick client-side search for the Guru / Admin / Orang Tua tabs (fully loaded lists).
  const [guruSearch, setGuruSearch] = useState('')
  const [adminSearch, setAdminSearch] = useState('')
  const [parentSearch, setParentSearch] = useState('')

  const importRef = useRef<HTMLInputElement>(null)
  const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null)
  const [importing, setImporting] = useState(false)

  // ── Mutasi Kelas ──
  const [mutasiOpen, setMutasiOpen] = useState(false)
  const [mutFrom, setMutFrom] = useState('')
  const [mutTo, setMutTo] = useState('')
  const [mutMsg, setMutMsg] = useState('')
  const [mutSaving, setMutSaving] = useState(false)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [bulkTo, setBulkTo] = useState('')

  const loadStudents = useCallback(async () => {
    try {
      const r = await userClient.listUsers({
        roleFilter: Role.STUDENT,
        search: search || undefined,
        kelas: filterKelas || undefined,
        pagination: { page: 1, pageSize: 200 },
      })
      setStudents(r.users)
    } catch { setStudents([]) }
  }, [search, filterKelas])

  const addSiswa = async (e: React.FormEvent) => {
    e.preventDefault(); setSiswaErr(''); setSiswaSaving(true)
    try {
      const u = await userClient.createUser({ ...siswaForm, role: Role.STUDENT })
      if (siswaForm.password) setPasswords(p => ({ ...p, [u.id]: siswaForm.password }))
      setSiswaForm(emptySiswa); await loadStudents()
    } catch (err: unknown) { setSiswaErr(err instanceof Error ? err.message : 'Gagal menambah murid') }
    finally { setSiswaSaving(false) }
  }
  const delSiswa = (u: User) => setConfirm({
    title: 'Hapus Murid', message: `Hapus akun murid "${u.fullName || u.username}"?`,
    variant: 'danger', confirmLabel: 'Ya, Hapus',
    onConfirm: async () => { try { await userClient.deleteUser({ id: u.id }); await loadStudents() } catch (e: unknown) { toaster.create({ description: e instanceof Error ? e.message : 'Gagal', type: 'error' }) } },
  })

  // ── Edit ──
  const startEdit = (user: User, role: 'guru' | 'siswa' | 'admin') => {
    setEditTarget({ user, role })
    setEditForm({ fullName: user.fullName, username: user.username, email: user.email, kelas: user.kelas, mapel: user.mapel, gender: user.gender, phone: user.phone, password: '' })
    setEditGuruKelas(role === 'guru' && user.kelas ? user.kelas.split(',').map((k) => k.trim()).filter(Boolean) : [])
    setEditGuruPerms(role === 'guru' ? [...(user.permissions ?? [])] : [])
    setEditError('')
  }
  const cancelEdit = () => { setEditTarget(null); setEditError('') }
  const saveEdit = async () => {
    if (!editTarget) return
    setEditSaving(true); setEditError('')
    try {
      // Only admins may (re)assign a teacher's access rights.
      const setPerms = editTarget.role === 'guru' && isAdmin(me)
      await userClient.updateUser({
        id: editTarget.user.id,
        fullName: editForm.fullName || undefined,
        email: editForm.email || undefined,
        username: editForm.username || undefined,
        kelas: editTarget.role === 'siswa' ? editForm.kelas : (editTarget.role === 'guru' ? editGuruKelas.join(', ') : undefined),
        mapel: editTarget.role === 'guru' ? editForm.mapel : undefined,
        gender: editForm.gender || undefined,
        phone: editForm.phone || undefined,
        password: editForm.password || undefined,
        ...(setPerms ? { permissions: editGuruPerms, setPermissions: true } : {}),
      })
      if (editForm.password) setPasswords(p => ({ ...p, [editTarget.user.id]: editForm.password }))
      setEditTarget(null)
      if (editTarget.role === 'guru') await loadTeachers()
      else if (editTarget.role === 'admin') await loadAdmins()
      else await loadStudents()
    } catch (err: unknown) { setEditError(err instanceof Error ? err.message : 'Gagal menyimpan') }
    finally { setEditSaving(false) }
  }

  // ── Mutasi Kelas ──
  const selectedIds = Object.keys(selected).filter((id) => selected[id])
  const openMutasi = () => { setMutFrom(''); setMutTo(''); setMutMsg(''); setMutasiOpen(true) }
  const doMutasiBulk = () => {
    if (!mutFrom || !mutTo) { setMutMsg('Pilih kelas asal dan tujuan.'); return }
    if (mutFrom === mutTo) { setMutMsg('Kelas asal dan tujuan sama.'); return }
    const count = classes.find((c) => c.name === mutFrom)?.studentCount ?? 0
    setConfirm({
      title: 'Konfirmasi Mutasi Kelas',
      message: `Pindahkan semua ${count} murid dari kelas "${mutFrom}" ke "${mutTo}"? Kelas semua murid tersebut akan berubah.`,
      variant: 'primary', confirmLabel: 'Ya, Mutasi',
      onConfirm: async () => {
        setMutMsg(''); setMutSaving(true)
        try {
          const r = await userClient.mutateClass({ fromKelas: mutFrom, toKelas: mutTo })
          setMutMsg(`✓ ${r.moved} murid dipindah dari ${mutFrom} ke ${mutTo}.`)
          await Promise.all([loadStudents(), loadClasses()])
        } catch (e: unknown) { setMutMsg(e instanceof Error ? e.message : 'Gagal mutasi') }
        finally { setMutSaving(false) }
      },
    })
  }
  const doMutasiSelected = () => {
    if (!bulkTo || selectedIds.length === 0) return
    setConfirm({
      title: 'Konfirmasi Mutasi Kelas',
      message: `Pindahkan ${selectedIds.length} murid terpilih ke kelas "${bulkTo}"?`,
      variant: 'primary', confirmLabel: 'Ya, Mutasi',
      onConfirm: async () => {
        setMutSaving(true)
        try {
          const r = await userClient.mutateClass({ toKelas: bulkTo, studentIds: selectedIds })
          setSelected({}); setBulkTo('')
          await Promise.all([loadStudents(), loadClasses()])
          toaster.create({ description: `${r.moved} murid dipindah ke ${bulkTo}.`, type: 'success' })
        } catch (e: unknown) { toaster.create({ description: e instanceof Error ? e.message : 'Gagal mutasi', type: 'error' }) }
        finally { setMutSaving(false) }
      },
    })
  }
  // Bulk-delete the selected murid (respects the central "Hapus Pengguna" access policy on the backend).
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const delSelectedMurid = () => {
    if (selectedIds.length === 0) return
    setConfirm({
      title: 'Hapus Murid Terpilih',
      message: `Hapus ${selectedIds.length} akun murid terpilih? Tindakan ini tidak bisa dibatalkan.`,
      variant: 'danger', confirmLabel: 'Ya, Hapus',
      onConfirm: async () => {
        setBulkDeleting(true)
        let ok = 0; const errs: string[] = []
        for (const id of selectedIds) {
          try { await userClient.deleteUser({ id }); ok++ }
          catch (e: unknown) { errs.push(e instanceof Error ? e.message : 'gagal') }
        }
        setSelected({})
        await loadStudents()
        setBulkDeleting(false)
        toaster.create({
          description: `${ok} murid dihapus${errs.length ? `, ${errs.length} gagal (mis. tak berizin)` : ''}.`,
          type: errs.length ? 'warning' : 'success',
        })
      },
    })
  }

  // ── Import CSV ──
  const handleImport = async (file: File) => {
    setImporting(true); setImportResult(null)
    try {
      const text = await file.text()
      const rows = parseCSV(text)
      if (!rows.length) { setImportResult({ success: 0, failed: 0, errors: ['File CSV kosong atau format tidak sesuai template'] }); return }
      let success = 0; const errors: string[] = []
      for (const row of rows) {
        try {
          const u = await userClient.createUser({
            fullName: row.fullName, username: row.username, email: row.email,
            password: row.password || 'Password123', kelas: row.kelas,
            gender: row.gender, phone: row.phone,
            role: Role.STUDENT,
          })
          if (row.password) setPasswords(p => ({ ...p, [u.id]: row.password }))
          success++
        } catch (e: unknown) {
          errors.push(`${row.username || row.email}: ${e instanceof Error ? e.message : 'Gagal'}`)
        }
      }
      setImportResult({ success, failed: errors.length, errors })
      if (success > 0) await loadStudents()
    } catch (e: unknown) {
      setImportResult({ success: 0, failed: 1, errors: [`Error membaca file: ${e instanceof Error ? e.message : 'unknown'}`] })
    } finally {
      setImporting(false)
      if (importRef.current) importRef.current.value = ''
    }
  }

  const handleExport = () => {
    const esc = (v: string) => `"${(v || '').replace(/"/g, '""')}"`
    const rows = [
      'Nama Lengkap,Username,Email,Kelas,Jenis Kelamin,No HP',
      ...students.map(s => [esc(s.fullName), esc(s.username), esc(s.email), esc(s.kelas), esc(s.gender), esc(s.phone)].join(',')),
    ]
    downloadCSV(rows.join('\n'), 'data-murid.csv')
  }

  // ── Orang Tua ──
  const emptyOrtu = { namaOrtu: '', hubungan: '', phone: '', alamat: '' }
  const [parents, setParents] = useState<Parent[]>([])
  const [ortuFilterKelas, setOrtuFilterKelas] = useState('') // filter tabel ortu by kelas anak
  const [ortuForm, setOrtuForm] = useState(emptyOrtu)
  const [ortuChildren, setOrtuChildren] = useState<string[]>([])
  const [ortuSearch, setOrtuSearch] = useState('')
  const [ortuErr, setOrtuErr] = useState('')
  const [ortuSaving, setOrtuSaving] = useState(false)
  // All students, for the child picker (independent of the Murid-tab filters).
  const [allStudents, setAllStudents] = useState<User[]>([])
  // edit ortu
  const [editOrtu, setEditOrtu] = useState<Parent | null>(null)
  const [editOrtuForm, setEditOrtuForm] = useState(emptyOrtu)
  const [editOrtuChildren, setEditOrtuChildren] = useState<string[]>([])
  const [editOrtuSearch, setEditOrtuSearch] = useState('')
  const [editOrtuErr, setEditOrtuErr] = useState('')
  const [editOrtuSaving, setEditOrtuSaving] = useState(false)
  // Murid yang SUDAH punya orang tua (satu murid hanya boleh satu orang tua).
  const assignedChildIds = useMemo(() => new Set(parents.flatMap((p) => p.children.map((c) => c.studentId))), [parents])
  // Picker "Tambah": hanya tampilkan murid yang belum punya orang tua.
  const unassignedStudents = useMemo(() => allStudents.filter((s) => !assignedChildIds.has(s.id)), [allStudents, assignedChildIds])
  // Picker "Edit": murid belum punya ortu + anak milik ortu yang sedang diedit.
  const editableStudents = useMemo(() => {
    const own = new Set(editOrtu?.children.map((c) => c.studentId) ?? [])
    return allStudents.filter((s) => !assignedChildIds.has(s.id) || own.has(s.id))
  }, [allStudents, assignedChildIds, editOrtu])

  const loadParents = useCallback(async () => {
    try {
      const res = await parentClient.listParents({ pagination: { page: 1, pageSize: 200 } })
      setParents(res.parents)
    } catch (e: unknown) { toaster.create({ description: e instanceof Error ? e.message : 'Gagal memuat data orang tua', type: 'error' }) }
  }, [])
  const loadAllStudents = useCallback(async () => {
    try {
      const r = await userClient.listUsers({ roleFilter: Role.STUDENT, pagination: { page: 1, pageSize: 1000 } })
      setAllStudents(r.users)
    } catch { setAllStudents([]) }
  }, [])

  const toggleId = (arr: string[], id: string) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id])
  const ortuFromForm = (p: Parent) => ({
    namaOrtu: p.namaOrtu, hubungan: p.hubungan, phone: p.phone, alamat: p.alamat,
  })

  // ── Orang Tua: Import / Export CSV ──
  const ortuImportRef = useRef<HTMLInputElement>(null)
  const [ortuImporting, setOrtuImporting] = useState(false)
  const [ortuImportResult, setOrtuImportResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null)

  const handleImportOrtu = async (file: File) => {
    setOrtuImporting(true); setOrtuImportResult(null)
    try {
      // Ensure the student pool is loaded so we can resolve "Anak" names → ids.
      let pool = allStudents
      if (pool.length === 0) {
        const r = await userClient.listUsers({ roleFilter: Role.STUDENT, pagination: { page: 1, pageSize: 1000 } })
        pool = r.users; setAllStudents(r.users)
      }
      const byUser = new Map(pool.map((s) => [s.username.toLowerCase(), s.id]))
      const byName = new Map(pool.map((s) => [(s.fullName || '').toLowerCase(), s.id]))
      const rows = parseParentsCSV(await file.text())
      if (!rows.length) { setOrtuImportResult({ success: 0, failed: 0, errors: ['File CSV kosong atau format tidak sesuai template'] }); return }
      let success = 0, failed = 0; const msgs: string[] = []
      for (const row of rows) {
        try {
          const ids: string[] = []; const unmatched: string[] = []
          row.anak.split(/[;|]/).map((x) => x.trim()).filter(Boolean).forEach((name) => {
            const id = byUser.get(name.toLowerCase()) ?? byName.get(name.toLowerCase())
            if (id) ids.push(id); else unmatched.push(name)
          })
          await parentClient.createParent({ namaOrtu: row.namaOrtu, hubungan: row.hubungan, phone: row.phone, alamat: row.alamat, studentIds: ids })
          success++
          if (unmatched.length) msgs.push(`${row.namaOrtu}: anak tak ditemukan → ${unmatched.join(', ')}`)
        } catch (e: unknown) { failed++; msgs.push(`${row.namaOrtu}: ${e instanceof Error ? e.message : 'Gagal'}`) }
      }
      setOrtuImportResult({ success, failed, errors: msgs })
      if (success > 0) await loadParents()
    } catch (e: unknown) {
      setOrtuImportResult({ success: 0, failed: 1, errors: [`Error membaca file: ${e instanceof Error ? e.message : 'unknown'}`] })
    } finally {
      setOrtuImporting(false)
      if (ortuImportRef.current) ortuImportRef.current.value = ''
    }
  }

  const handleExportOrtu = () => {
    const esc = (v: string) => `"${(v || '').replace(/"/g, '""')}"`
    const rows = [
      'Nama Orang Tua,Hubungan,No HP,Alamat,Anak,Kelas Anak',
      ...parents.map((p) => [
        esc(p.namaOrtu), esc(p.hubungan), esc(p.phone), esc(p.alamat),
        esc(p.children.map((c) => c.fullName).join('; ')),
        esc(Array.from(new Set(p.children.map((c) => c.kelas).filter(Boolean))).join('; ')),
      ].join(',')),
    ]
    downloadCSV(rows.join('\r\n'), 'data-orang-tua.csv')
  }

  const addOrtu = async (e: React.FormEvent) => {
    e.preventDefault(); setOrtuErr(''); setOrtuSaving(true)
    try {
      await parentClient.createParent({ ...ortuForm, studentIds: ortuChildren })
      setOrtuForm(emptyOrtu); setOrtuChildren([]); setOrtuSearch(''); await loadParents()
    } catch (err: unknown) { setOrtuErr(err instanceof Error ? err.message : 'Gagal menyimpan orang tua') }
    finally { setOrtuSaving(false) }
  }
  const startEditOrtu = (p: Parent) => {
    setEditOrtu(p); setEditOrtuForm(ortuFromForm(p))
    setEditOrtuChildren(p.children.map((c) => c.studentId)); setEditOrtuSearch(''); setEditOrtuErr('')
  }
  const saveEditOrtu = async () => {
    if (!editOrtu) return
    setEditOrtuSaving(true); setEditOrtuErr('')
    try {
      await parentClient.updateParent({ id: editOrtu.id, ...editOrtuForm, studentIds: editOrtuChildren })
      setEditOrtu(null); await loadParents()
    } catch (err: unknown) { setEditOrtuErr(err instanceof Error ? err.message : 'Gagal menyimpan') }
    finally { setEditOrtuSaving(false) }
  }
  const delOrtu = (p: Parent) => setConfirm({
    title: 'Hapus Orang Tua',
    message: 'Hapus data orang tua ini? Anak yang tertaut akan dilepas (murid tetap ada).',
    variant: 'danger', confirmLabel: 'Ya, Hapus',
    onConfirm: async () => { try { await parentClient.deleteParent({ id: p.id }); await loadParents() } catch (e: unknown) { toaster.create({ description: e instanceof Error ? e.message : 'Gagal', type: 'error' }) } },
  })
  // Bulk select + delete for Orang Tua (mirrors the Murid tab). Respects the
  // central "Hapus Pengguna" access policy on the backend.
  const [ortuSelected, setOrtuSelected] = useState<Record<string, boolean>>({})
  const ortuSelectedIds = Object.keys(ortuSelected).filter((id) => ortuSelected[id])
  const [ortuBulkDeleting, setOrtuBulkDeleting] = useState(false)
  const delSelectedOrtu = () => {
    if (ortuSelectedIds.length === 0) return
    setConfirm({
      title: 'Hapus Orang Tua Terpilih',
      message: `Hapus ${ortuSelectedIds.length} data orang tua terpilih? Anak yang tertaut akan dilepas (murid tetap ada).`,
      variant: 'danger', confirmLabel: 'Ya, Hapus',
      onConfirm: async () => {
        setOrtuBulkDeleting(true)
        let ok = 0; const errs: string[] = []
        for (const id of ortuSelectedIds) {
          try { await parentClient.deleteParent({ id }); ok++ }
          catch (e: unknown) { errs.push(e instanceof Error ? e.message : 'gagal') }
        }
        setOrtuSelected({})
        await loadParents()
        setOrtuBulkDeleting(false)
        toaster.create({
          description: `${ok} orang tua dihapus${errs.length ? `, ${errs.length} gagal (mis. tak berizin)` : ''}.`,
          type: errs.length ? 'warning' : 'success',
        })
      },
    })
  }

  // ── Load per tab ──
  useEffect(() => { loadClasses(); loadJurusans(); loadSchool(); loadSemesters() }, [loadClasses, loadJurusans, loadSchool, loadSemesters])
  useEffect(() => { if (tab === 'guru' || tab === 'wali') loadTeachers() }, [tab, loadTeachers])
  useEffect(() => {
    if (tab !== 'siswa') return
    const t = setTimeout(loadStudents, 250)
    return () => clearTimeout(t)
  }, [tab, loadStudents])
  useEffect(() => { if (tab === 'ortu') { loadParents(); loadAllStudents() } }, [tab, loadParents, loadAllStudents])
  useEffect(() => { if (tab === 'admin') loadAdmins() }, [tab, loadAdmins])
  // Keep the active tab within this section and permitted; else jump to the first allowed one.
  useEffect(() => {
    if (!me) return
    if (!inSection(tab) || !canTab(tab)) {
      const first = SECTION_TABS[section].find(canTab)
      if (first) setTab(first)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, tab, section])

  // ── Password cell (shown in plaintext, with a copy button) ──
  const PwdCell = ({ user }: { user: User }) => {
    const pwd = user.passwordPlain || passwords[user.id] || ''
    if (!pwd) return <Text fontSize="12px" color={COLORS.muted} title="Belum tersimpan — Edit untuk mengatur ulang">– (reset dulu)</Text>
    return (
      <Flex gap="4px" align="center">
        <Text fontSize="12px" fontFamily="mono">{pwd}</Text>
        <Button size="xs" variant="ghost" p="2px" title="Salin"
          onClick={() => { navigator.clipboard?.writeText(pwd) }}>
          <Icon as={LuCopy} />
        </Button>
      </Flex>
    )
  }

  const inc = (v: string | undefined, q: string) => (v || '').toLowerCase().includes(q)
  const qGuru = guruSearch.trim().toLowerCase()
  const filteredTeachers = teachers.filter((u) => !qGuru || [u.fullName, u.username, u.email, u.mapel].some((v) => inc(v, qGuru)))
  const teachersPaged = usePaged(filteredTeachers, 10)
  const studentsPaged = usePaged(students, 10)
  // Filter parents by a child's class and/or a name/phone/child search.
  const qParent = parentSearch.trim().toLowerCase()
  const filteredParents = parents.filter((p) =>
    (!ortuFilterKelas || p.children.some((c) => c.kelas === ortuFilterKelas)) &&
    (!qParent || inc(p.namaOrtu, qParent) || inc(p.phone, qParent) || p.children.some((c) => inc(c.fullName, qParent))),
  )
  const parentsPaged = usePaged(filteredParents, 10)
  const qAdmin = adminSearch.trim().toLowerCase()
  const filteredAdmins = admins.filter((u) => !qAdmin || [u.fullName, u.username, u.email].some((v) => inc(v, qAdmin)))
  const adminsPaged = usePaged(filteredAdmins, 10)

  const TabBtn = ({ id, label }: { id: Tab; label: string }) => (
    inSection(id) && canTab(id) ? (
      <Button variant="ghost" borderRadius={0} borderBottom="2px solid"
        borderColor={tab === id ? COLORS.primary : 'transparent'}
        color={tab === id ? COLORS.primary : 'gray.600'} onClick={() => setTab(id)}>
        {label}
      </Button>
    ) : null
  )

  return (
    <AppLayout title={SECTION_TITLE[section]} subtitle={SECTION_SUB[section]}>
      <Stack gap="16px">
        {SECTION_TABS[section].length > 1 && (
          <Flex gap={0} borderBottom="2px solid" borderColor="gray.200">
            <TabBtn id="sekolah" label="Data Sekolah" />
            <TabBtn id="semester" label={`Semester (${semesters.length})`} />
            <TabBtn id="kelas" label={`Kelas (${classes.length})`} />
            <TabBtn id="jurusan" label={`Jurusan (${jurusans.length})`} />
            <TabBtn id="wali" label="Wali Kelas" />
          </Flex>
        )}

        {/* ── DATA SEKOLAH ── */}
        {tab === 'sekolah' && (
          <Card title={<><Icon as={LuBuilding} /> Data Sekolah</>}>
            <Stack gap="12px" maxW="560px">
              <Field.Root>
                <Field.Label>Nama Sekolah</Field.Label>
                <Input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="mis. SMK ISLAM 2 WLINGI" />
              </Field.Root>
              <Field.Root>
                <Field.Label>Alamat</Field.Label>
                <Textarea rows={3} value={schoolAddr} onChange={(e) => setSchoolAddr(e.target.value)} placeholder="Alamat sekolah" />
              </Field.Root>
              {schoolMsg && <Text fontSize="12px" color={schoolMsg.includes('tersimpan') ? COLORS.success : COLORS.danger}>{schoolMsg}</Text>}
              <Button alignSelf="flex-start" bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} loading={savingSchool} onClick={saveSchool}>
                <Icon as={LuSave} /> Simpan
              </Button>
            </Stack>
          </Card>
        )}

        {/* ── SEMESTER ── */}
        {tab === 'semester' && (
          <Stack gap="14px">
            <Card title={<><Icon as={LuPlus} /> Tambah Semester</>}>
              <Flex gap="8px" flexWrap="wrap" align="flex-end">
                <Field.Root maxW="140px"><Field.Label>Semester</Field.Label>
                  <NativeSelect.Root>
                    <NativeSelect.Field value={semSel} onChange={(e) => setSemSel(e.target.value)}>
                      <option value="ganjil">Ganjil</option>
                      <option value="genap">Genap</option>
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </Field.Root>
                <Field.Root maxW="160px"><Field.Label>Tahun Ajaran</Field.Label>
                  <Input value={semTahun} onChange={(e) => setSemTahun(e.target.value)} placeholder="2026/2027"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSemester() } }} />
                </Field.Root>
                <Button bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} onClick={addSemester}>Tambah</Button>
              </Flex>
              {semErr && <Text color={COLORS.danger} fontSize="12px" mt="6px">{semErr}</Text>}
            </Card>
            <Card>
              <Box overflowX="auto"><Table.Root size="sm">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader>Semester</Table.ColumnHeader>
                    <Table.ColumnHeader>Tahun Ajaran</Table.ColumnHeader>
                    <Table.ColumnHeader>Status</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="right">Aksi</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {semesters.length === 0 ? (
                    <Table.Row><Table.Cell colSpan={4} textAlign="center" color={COLORS.muted}>Belum ada semester</Table.Cell></Table.Row>
                  ) : semesters.map((s) => (
                    <Table.Row key={s.id} bg={s.isActive ? COLORS.primaryTint : undefined}>
                      <Table.Cell textTransform="capitalize" fontWeight="medium">{s.semester}</Table.Cell>
                      <Table.Cell>{s.tahunAjaran}</Table.Cell>
                      <Table.Cell>
                        {s.isActive
                          ? <Badge colorPalette="green"><Icon as={LuCircleCheck} /> Aktif</Badge>
                          : <Text fontSize="12px" color={COLORS.muted}>–</Text>}
                      </Table.Cell>
                      <Table.Cell textAlign="right">
                        <Flex gap="6px" justify="flex-end">
                          {!s.isActive && (
                            <IconButton size="xs" colorPalette="blue" variant="outline" aria-label="Jadikan aktif" title="Jadikan aktif"
                              onClick={() => activateSemester(s.id)}><Icon as={LuCircleCheck} /></IconButton>
                          )}
                          <IconButton size="xs" colorPalette="red" variant="outline" aria-label="Hapus" title="Hapus"
                            onClick={() => delSemester(s)}><Icon as={LuTrash2} /></IconButton>
                        </Flex>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root></Box>
            </Card>
          </Stack>
        )}

        {/* ── KELAS ── */}
        {tab === 'kelas' && (
          <Stack gap="14px">
            <Card title={<><Icon as={LuPlus} /> Tambah Kelas</>}>
              <Flex gap="8px" flexWrap="wrap" align="flex-end">
                <Field.Root maxW="110px"><Field.Label>Tingkat</Field.Label>
                  <NativeSelect.Root>
                    <NativeSelect.Field value={kTingkat} onChange={(e) => setKTingkat(e.target.value)}>
                      <option value="X">X</option>
                      <option value="XI">XI</option>
                      <option value="XII">XII</option>
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </Field.Root>
                <Field.Root maxW="150px"><Field.Label>Jurusan</Field.Label>
                  <NativeSelect.Root>
                    <NativeSelect.Field value={kJurusan} onChange={(e) => setKJurusan(e.target.value)}>
                      <option value="">— Pilih —</option>
                      {jurusans.map((j) => <option key={j.id} value={j.name}>{j.name}</option>)}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </Field.Root>
                <Field.Root maxW="90px"><Field.Label>Nomor</Field.Label>
                  <Input type="number" min={1} value={kNomor} onChange={(e) => setKNomor(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKelas() } }} />
                </Field.Root>
                <Box>
                  <Text fontSize="11px" color={COLORS.muted} mb="4px">Nama kelas</Text>
                  <Badge {...labelColor(kelasPreview)} fontSize="13px" px="10px" py="4px">{kelasPreview}</Badge>
                </Box>
                <Button bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} onClick={addKelas}>Tambah</Button>
              </Flex>
              {jurusans.length === 0 && <Text fontSize="12px" color={COLORS.warning} mt="6px">Buat jurusan dulu di tab "Jurusan".</Text>}
              {kelasErr && <Text color={COLORS.danger} fontSize="12px" mt="6px">{kelasErr}</Text>}
            </Card>
            <Card>
              <Box overflowX="auto"><Table.Root size="sm">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader>Nama Kelas</Table.ColumnHeader>
                    <Table.ColumnHeader>Jumlah Murid</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="right">Aksi</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {classes.length === 0 ? (
                    <Table.Row><Table.Cell colSpan={3} textAlign="center" color={COLORS.muted}>Belum ada kelas</Table.Cell></Table.Row>
                  ) : classes.map((c) => (
                    <Table.Row key={c.id}>
                      <Table.Cell><Badge {...labelColor(c.name)}>{c.name}</Badge></Table.Cell>
                      <Table.Cell>{c.studentCount} murid</Table.Cell>
                      <Table.Cell textAlign="right">
                        <Flex gap="6px" justify="flex-end">
                          <IconButton size="xs" colorPalette="blue" variant="outline" aria-label="Edit" title="Edit" onClick={() => startEditKelas(c)}><Icon as={LuPencil} /></IconButton>
                          <IconButton size="xs" colorPalette="red" variant="outline" aria-label="Hapus" title="Hapus" onClick={() => delKelas(c)}><Icon as={LuTrash2} /></IconButton>
                        </Flex>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root></Box>
            </Card>
          </Stack>
        )}

        {/* ── JURUSAN ── */}
        {tab === 'jurusan' && (
          <Stack gap="14px">
            <Card title={<><Icon as={LuPlus} /> Tambah Jurusan</>}>
              <Flex gap="8px" maxW="460px">
                <Input placeholder="Nama jurusan (mis. TKJ)" value={newJurusan}
                  onChange={(e) => setNewJurusan(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addJurusan() } }} />
                <Button bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} onClick={addJurusan}>Tambah</Button>
              </Flex>
              {jurusanErr && <Text color={COLORS.danger} fontSize="12px" mt="6px">{jurusanErr}</Text>}
            </Card>
            <Card>
              <Box overflowX="auto"><Table.Root size="sm">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader>Nama Jurusan</Table.ColumnHeader>
                    <Table.ColumnHeader>Jumlah Murid</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="right">Aksi</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {jurusans.length === 0 ? (
                    <Table.Row><Table.Cell colSpan={3} textAlign="center" color={COLORS.muted}>Belum ada jurusan</Table.Cell></Table.Row>
                  ) : jurusans.map((j) => (
                    <Table.Row key={j.id}>
                      <Table.Cell><Badge {...labelColor(j.name)}>{j.name}</Badge></Table.Cell>
                      <Table.Cell>{j.studentCount} murid</Table.Cell>
                      <Table.Cell textAlign="right">
                        <Flex gap="6px" justify="flex-end">
                          <IconButton size="xs" colorPalette="blue" variant="outline" aria-label="Edit" title="Edit" onClick={() => startEditJurusan(j)}><Icon as={LuPencil} /></IconButton>
                          <IconButton size="xs" colorPalette="red" variant="outline" aria-label="Hapus" title="Hapus" onClick={() => delJurusan(j)}><Icon as={LuTrash2} /></IconButton>
                        </Flex>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root></Box>
            </Card>
          </Stack>
        )}

        {/* ── WALI KELAS ── */}
        {tab === 'wali' && (
          <Stack gap="14px">
            <Card title={<><Icon as={LuUser} /> Atur Wali Kelas</>}>
              <form onSubmit={saveWali}>
                <Flex gap="10px" flexWrap="wrap" align="flex-end">
                  <Field.Root required maxW="180px"><Field.Label>Kelas</Field.Label>
                    <NativeSelect.Root>
                      <NativeSelect.Field value={waliKelas} onChange={(e) => pickWaliKelas(e.target.value)}>
                        <option value="">— Pilih Kelas —</option>
                        {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </NativeSelect.Field>
                      <NativeSelect.Indicator />
                    </NativeSelect.Root>
                  </Field.Root>
                  <Field.Root required maxW="220px"><Field.Label>Guru (Wali Kelas)</Field.Label>
                    <NativeSelect.Root>
                      <NativeSelect.Field value={waliGuru} onChange={(e) => pickWaliGuru(e.target.value)}>
                        <option value="">— Pilih Guru —</option>
                        {teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName || t.username}{t.mapel ? ` — ${t.mapel}` : ''}</option>)}
                      </NativeSelect.Field>
                      <NativeSelect.Indicator />
                    </NativeSelect.Root>
                  </Field.Root>
                  <Field.Root maxW="170px"><Field.Label>No. HP</Field.Label>
                    <Input value={waliPhone} onChange={(e) => setWaliPhone(e.target.value)} placeholder="otomatis / isi manual" /></Field.Root>
                  <Button type="submit" bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} loading={waliSaving}>Simpan</Button>
                </Flex>
                <Text fontSize="11px" color={COLORS.muted} mt="8px">No. HP terisi otomatis dari akun guru; bila kosong, isi manual di sini — nomor akan tersimpan ke akun guru tersebut.</Text>
                {waliErr && <Text color={COLORS.danger} fontSize="12px" mt="6px">{waliErr}</Text>}
              </form>
            </Card>

            <Card>
              <Box overflowX="auto"><Table.Root size="sm">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader>#</Table.ColumnHeader>
                    <Table.ColumnHeader>Kelas</Table.ColumnHeader>
                    <Table.ColumnHeader>Wali Kelas</Table.ColumnHeader>
                    <Table.ColumnHeader>No. HP</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="right">Aksi</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {classes.length === 0 ? (
                    <Table.Row><Table.Cell colSpan={5} textAlign="center" color={COLORS.muted}>Belum ada kelas</Table.Cell></Table.Row>
                  ) : classes.map((c, i) => (
                    <Table.Row key={c.id}>
                      <Table.Cell fontWeight="bold" color={COLORS.primary}>{i + 1}</Table.Cell>
                      <Table.Cell><Badge {...labelColor(c.name)}>{c.name}</Badge></Table.Cell>
                      <Table.Cell fontWeight="medium">{c.waliName || <Text as="span" color={COLORS.muted}>— belum diatur —</Text>}</Table.Cell>
                      <Table.Cell>{c.waliPhone || '-'}</Table.Cell>
                      <Table.Cell textAlign="right">
                        <Flex gap="6px" justify="flex-end">
                          <IconButton size="xs" colorPalette="blue" variant="outline" aria-label="Atur" title="Atur wali" onClick={() => { pickWaliKelas(c.id); window.scrollTo({ top: 0, behavior: 'smooth' }) }}><Icon as={LuPencil} /></IconButton>
                          {c.waliTeacherId && <IconButton size="xs" colorPalette="red" variant="outline" aria-label="Hapus wali" title="Hapus wali" onClick={() => removeWali(c)}><Icon as={LuTrash2} /></IconButton>}
                        </Flex>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root></Box>
            </Card>
          </Stack>
        )}

        {/* ── GURU ── */}
        {tab === 'guru' && (
          <Stack gap="14px">
            <Card title={<><Icon as={LuPlus} /> Tambah Guru</>}>
              <form onSubmit={addGuru}>
                <Flex gap="10px" flexWrap="wrap" align="flex-end">
                  <Field.Root required maxW="200px"><Field.Label>Nama Lengkap</Field.Label>
                    <Input value={guruForm.fullName} onChange={(e) => setGuruForm({ ...guruForm, fullName: e.target.value })} required /></Field.Root>
                  <Field.Root required maxW="150px"><Field.Label>Username</Field.Label>
                    <Input value={guruForm.username} onChange={(e) => setGuruForm({ ...guruForm, username: e.target.value })} required /></Field.Root>
                  <Field.Root required maxW="200px"><Field.Label>Email</Field.Label>
                    <Input type="email" value={guruForm.email} onChange={(e) => setGuruForm({ ...guruForm, email: e.target.value })} required /></Field.Root>
                  <Field.Root required maxW="150px"><Field.Label>Password</Field.Label>
                    <Input type="text" value={guruForm.password} onChange={(e) => setGuruForm({ ...guruForm, password: e.target.value })} required minLength={6} /></Field.Root>
                  <Field.Root maxW="170px"><Field.Label>Mata Pelajaran</Field.Label>
                    <Input value={guruForm.mapel} onChange={(e) => setGuruForm({ ...guruForm, mapel: e.target.value })} placeholder="mis. Matematika" /></Field.Root>
                  <Field.Root maxW="150px"><Field.Label>No. HP</Field.Label>
                    <Input value={guruForm.phone} onChange={(e) => setGuruForm({ ...guruForm, phone: e.target.value })} placeholder="08…" /></Field.Root>
                  <Field.Root maxW="150px"><Field.Label>Jenis Kelamin</Field.Label>
                    <NativeSelect.Root>
                      <NativeSelect.Field value={guruForm.gender} onChange={(e) => setGuruForm({ ...guruForm, gender: e.target.value })}>
                        <option value="">—</option>
                        <option value="L">Laki-laki</option>
                        <option value="P">Perempuan</option>
                      </NativeSelect.Field>
                      <NativeSelect.Indicator />
                    </NativeSelect.Root></Field.Root>
                  <Button type="submit" bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} loading={guruSaving}>Tambah Guru</Button>
                </Flex>
                <Box mt="10px">
                  <Flex align="center" justify="space-between" mb="6px" gap="8px" wrap="wrap">
                    <Text fontSize="12px" fontWeight="500">
                      Kelas yang diajar{' '}
                      <Text as="span" fontSize="11px" fontWeight="400" color={COLORS.muted}>(bisa pilih lebih dari satu)</Text>
                    </Text>
                    {classes.length > 0 && (
                      <Flex gap="6px">
                        <Button size="2xs" variant="ghost" type="button" onClick={() => setGuruKelas(classes.map((c) => c.name))}>Pilih semua</Button>
                        <Button size="2xs" variant="ghost" type="button" onClick={() => setGuruKelas([])}>Kosongkan</Button>
                      </Flex>
                    )}
                  </Flex>
                  {classes.length === 0 ? (
                    <Text fontSize="12px" color={COLORS.muted}>Belum ada kelas. Buat di tab "Kelas".</Text>
                  ) : (
                    <Flex gap="8px" wrap="wrap">
                      {classes.map((c) => (
                        <KelasChip key={c.id} name={c.name} on={guruKelas.includes(c.name)} onToggle={() => toggleGuruKelas(c.name)} />
                      ))}
                    </Flex>
                  )}
                </Box>
                {guruErr && <Text color={COLORS.danger} fontSize="12px" mt="6px">{guruErr}</Text>}
              </form>
            </Card>
            <Card>
              <Flex mb="10px" align="center" gap="8px" wrap="wrap">
                <Flex align="center" gap="6px" flex={1} minW="220px" maxW="360px">
                  <Icon as={LuSearch} color={COLORS.muted} />
                  <Input size="sm" value={guruSearch} onChange={(e) => setGuruSearch(e.target.value)} placeholder="Cari nama / username / email / mapel…" />
                </Flex>
                {guruSearch && <Text fontSize="12px" color={COLORS.muted}>{filteredTeachers.length} hasil</Text>}
              </Flex>
              <Box overflowX="auto"><Table.Root size="sm">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader>#</Table.ColumnHeader>
                    <Table.ColumnHeader>Nama</Table.ColumnHeader>
                    <Table.ColumnHeader>JK</Table.ColumnHeader>
                    <Table.ColumnHeader>Username</Table.ColumnHeader>
                    <Table.ColumnHeader>Email</Table.ColumnHeader>
                    <Table.ColumnHeader>No. HP</Table.ColumnHeader>
                    <Table.ColumnHeader>Mapel</Table.ColumnHeader>
                    <Table.ColumnHeader>Kelas</Table.ColumnHeader>
                    <Table.ColumnHeader>Password</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="right">Aksi</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {filteredTeachers.length === 0 ? (
                    <Table.Row><Table.Cell colSpan={10} textAlign="center" color={COLORS.muted}>{guruSearch ? 'Tidak ada guru yang cocok' : 'Belum ada guru'}</Table.Cell></Table.Row>
                  ) : teachersPaged.pageItems.map((u, i) => (
                    <Table.Row key={u.id}>
                      <Table.Cell fontWeight="bold" color={COLORS.primary}>{(teachersPaged.page - 1) * teachersPaged.pageSize + i + 1}</Table.Cell>
                      <Table.Cell fontWeight="medium">{u.fullName || '-'}</Table.Cell>
                      <Table.Cell><GenderBadge g={u.gender} /></Table.Cell>
                      <Table.Cell>{u.username}</Table.Cell>
                      <Table.Cell>{u.email}</Table.Cell>
                      <Table.Cell>{u.phone || '-'}</Table.Cell>
                      <Table.Cell>{u.mapel || '-'}</Table.Cell>
                      <Table.Cell>
                        <Flex gap="4px" wrap="wrap">
                          {u.kelas ? u.kelas.split(',').map((k) => k.trim()).filter(Boolean).map((k) => <Badge key={k} {...labelColor(k)}>{k}</Badge>) : '-'}
                        </Flex>
                      </Table.Cell>
                      <Table.Cell><PwdCell user={u} /></Table.Cell>
                      <Table.Cell textAlign="right">
                        <Flex gap="6px" justify="flex-end">
                          <IconButton size="xs" colorPalette="blue" variant="outline" aria-label="Edit" title="Edit" onClick={() => startEdit(u, 'guru')}><Icon as={LuPencil} /></IconButton>
                          <IconButton size="xs" colorPalette="red" variant="outline" aria-label="Hapus" title="Hapus" onClick={() => delGuru(u)}><Icon as={LuTrash2} /></IconButton>
                        </Flex>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root></Box>
              <Pagination page={teachersPaged.page} pageSize={teachersPaged.pageSize} total={teachersPaged.total} onPageChange={teachersPaged.setPage} />
            </Card>
          </Stack>
        )}

        {/* ── SISWA ── */}
        {tab === 'siswa' && (
          <Stack gap="14px">
            <Card title={<><Icon as={LuPlus} /> Tambah Murid</>}>
              <form onSubmit={addSiswa}>
                <Flex gap="10px" flexWrap="wrap" align="flex-end">
                  <Field.Root required maxW="180px"><Field.Label>Nama Lengkap</Field.Label>
                    <Input value={siswaForm.fullName} onChange={(e) => setSiswaForm({ ...siswaForm, fullName: e.target.value })} required /></Field.Root>
                  <Field.Root required maxW="140px"><Field.Label>Username</Field.Label>
                    <Input value={siswaForm.username} onChange={(e) => setSiswaForm({ ...siswaForm, username: e.target.value })} required /></Field.Root>
                  <Field.Root required maxW="180px"><Field.Label>Email</Field.Label>
                    <Input type="email" value={siswaForm.email} onChange={(e) => setSiswaForm({ ...siswaForm, email: e.target.value })} required /></Field.Root>
                  <Field.Root required maxW="140px"><Field.Label>Password</Field.Label>
                    <Input type="text" value={siswaForm.password} onChange={(e) => setSiswaForm({ ...siswaForm, password: e.target.value })} required minLength={6} /></Field.Root>
                  <Field.Root maxW="140px"><Field.Label>Kelas</Field.Label>
                    <NativeSelect.Root>
                      <NativeSelect.Field value={siswaForm.kelas} onChange={(e) => setSiswaForm({ ...siswaForm, kelas: e.target.value })}>
                        <option value="">— Pilih Kelas —</option>
                        {classes.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </NativeSelect.Field>
                      <NativeSelect.Indicator />
                    </NativeSelect.Root>
                  </Field.Root>
                  <Field.Root maxW="140px"><Field.Label>Jenis Kelamin</Field.Label>
                    <NativeSelect.Root>
                      <NativeSelect.Field value={siswaForm.gender} onChange={(e) => setSiswaForm({ ...siswaForm, gender: e.target.value })}>
                        <option value="">—</option>
                        <option value="L">Laki-laki</option>
                        <option value="P">Perempuan</option>
                      </NativeSelect.Field>
                      <NativeSelect.Indicator />
                    </NativeSelect.Root>
                  </Field.Root>
                  <Field.Root maxW="150px"><Field.Label>No. HP</Field.Label>
                    <Input value={siswaForm.phone} onChange={(e) => setSiswaForm({ ...siswaForm, phone: e.target.value })} placeholder="08…" /></Field.Root>
                  <Button type="submit" bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} loading={siswaSaving}>Tambah Murid</Button>
                </Flex>
                {siswaErr && <Text color={COLORS.danger} fontSize="12px" mt="6px">{siswaErr}</Text>}
              </form>
            </Card>

            <Card>
              {/* Toolbar: search + filter + import/export */}
              <Flex gap="8px" mb="12px" flexWrap="wrap" align="flex-end">
                <Box flex={1} minW="160px">
                  <Text fontSize="12px" fontWeight="500" mb="4px" display="flex" alignItems="center" gap="4px"><Icon as={LuSearch} /> Cari Murid</Text>
                  <Input size="sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nama / username / email…" />
                </Box>
                <Box minW="130px">
                  <Text fontSize="12px" fontWeight="500" mb="4px">Filter Kelas</Text>
                  <NativeSelect.Root size="sm">
                    <NativeSelect.Field value={filterKelas} onChange={(e) => setFilterKelas(e.target.value)}>
                      <option value="">— Semua —</option>
                      {classes.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </Box>
                <Flex gap="6px" align="flex-end" flexWrap="wrap">
                  <Button size="sm" variant="outline" colorPalette="teal"
                    onClick={() => importRef.current?.click()} loading={importing}>
                    <Icon as={LuUpload} /> Import CSV
                  </Button>
                  <input ref={importRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f) }} />
                  <Button size="sm" variant="outline" colorPalette="green"
                    onClick={handleExport} disabled={students.length === 0}>
                    <Icon as={LuDownload} /> Export CSV
                  </Button>
                  <Button size="sm" variant="outline"
                    onClick={() => downloadCSV(TEMPLATE_CSV, 'template-murid.csv')}>
                    <Icon as={LuFileText} /> Template
                  </Button>
                  <Button size="sm" bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }}
                    onClick={openMutasi}>
                    <Icon as={LuArrowRightLeft} /> Mutasi Kelas
                  </Button>
                </Flex>
              </Flex>

              {/* Selection action bar (per-student mutation) */}
              {selectedIds.length > 0 && (
                <Flex mb="10px" p="10px" borderRadius="8px" bg={COLORS.primaryTint} align="center" gap="10px" flexWrap="wrap">
                  <Text fontSize="13px" fontWeight="600">{selectedIds.length} murid dipilih</Text>
                  <Text fontSize="12px" color={COLORS.muted}>Mutasi ke:</Text>
                  <Box minW="150px">
                    <NativeSelect.Root size="sm">
                      <NativeSelect.Field value={bulkTo} onChange={(e) => setBulkTo(e.target.value)}>
                        <option value="">— Pilih Kelas —</option>
                        {classes.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </NativeSelect.Field>
                      <NativeSelect.Indicator />
                    </NativeSelect.Root>
                  </Box>
                  <Button size="sm" bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }}
                    disabled={!bulkTo} loading={mutSaving} onClick={doMutasiSelected}>
                    <Icon as={LuArrowRightLeft} /> Mutasi Terpilih
                  </Button>
                  <Button size="sm" colorPalette="red" variant="solid" loading={bulkDeleting} onClick={delSelectedMurid}>
                    <Icon as={LuTrash2} /> Hapus Terpilih
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelected({})}>Batal</Button>
                </Flex>
              )}

              {/* Import result */}
              {importResult && (
                <Box mb="10px" p="10px" borderRadius="8px" fontSize="13px"
                  bg={importResult.failed === 0 ? '#DCFCE7' : '#FEF3C7'}>
                  <Text fontWeight="600">
                    Hasil Import: {importResult.success} berhasil{importResult.failed > 0 ? `, ${importResult.failed} gagal` : ''}
                  </Text>
                  {importResult.errors.map((err, i) => (
                    <Text key={i} color={COLORS.danger} fontSize="12px">• {err}</Text>
                  ))}
                </Box>
              )}

              <Box overflowX="auto"><Table.Root size="sm">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader w="32px">
                      <Checkbox.Root aria-label="pilih semua di halaman ini"
                        checked={studentsPaged.pageItems.length > 0 && studentsPaged.pageItems.every((u) => selected[u.id])}
                        onCheckedChange={(e) => {
                          const on = !!e.checked
                          setSelected((s) => { const n = { ...s }; studentsPaged.pageItems.forEach((u) => { n[u.id] = on }); return n })
                        }}>
                        <Checkbox.HiddenInput />
                        <Checkbox.Control />
                      </Checkbox.Root>
                    </Table.ColumnHeader>
                    <Table.ColumnHeader>#</Table.ColumnHeader>
                    <Table.ColumnHeader>Nama</Table.ColumnHeader>
                    <Table.ColumnHeader>JK</Table.ColumnHeader>
                    <Table.ColumnHeader>Username</Table.ColumnHeader>
                    <Table.ColumnHeader>Email</Table.ColumnHeader>
                    <Table.ColumnHeader>No. HP</Table.ColumnHeader>
                    <Table.ColumnHeader>Kelas</Table.ColumnHeader>
                    <Table.ColumnHeader>Password</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="right">Aksi</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {students.length === 0 ? (
                    <Table.Row><Table.Cell colSpan={10} textAlign="center" color={COLORS.muted}>Tidak ada murid</Table.Cell></Table.Row>
                  ) : studentsPaged.pageItems.map((u, i) => (
                    <Table.Row key={u.id} bg={selected[u.id] ? COLORS.primaryTint : undefined}>
                      <Table.Cell>
                        <Checkbox.Root aria-label={`pilih ${u.fullName}`}
                          checked={!!selected[u.id]}
                          onCheckedChange={() => setSelected((s) => ({ ...s, [u.id]: !s[u.id] }))}>
                          <Checkbox.HiddenInput />
                          <Checkbox.Control />
                        </Checkbox.Root>
                      </Table.Cell>
                      <Table.Cell fontWeight="bold" color={COLORS.primary}>{(studentsPaged.page - 1) * studentsPaged.pageSize + i + 1}</Table.Cell>
                      <Table.Cell fontWeight="medium">{u.fullName || '-'}</Table.Cell>
                      <Table.Cell><GenderBadge g={u.gender} /></Table.Cell>
                      <Table.Cell>{u.username}</Table.Cell>
                      <Table.Cell>{u.email}</Table.Cell>
                      <Table.Cell>{u.phone || '-'}</Table.Cell>
                      <Table.Cell>{u.kelas ? <Badge {...labelColor(u.kelas)}>{u.kelas}</Badge> : '-'}</Table.Cell>
                      <Table.Cell><PwdCell user={u} /></Table.Cell>
                      <Table.Cell textAlign="right">
                        <Flex gap="6px" justify="flex-end">
                          <IconButton size="xs" colorPalette="blue" variant="outline" aria-label="Edit" title="Edit" onClick={() => startEdit(u, 'siswa')}><Icon as={LuPencil} /></IconButton>
                          <IconButton size="xs" colorPalette="red" variant="outline" aria-label="Hapus" title="Hapus" onClick={() => delSiswa(u)}><Icon as={LuTrash2} /></IconButton>
                        </Flex>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root></Box>
              <Pagination page={studentsPaged.page} pageSize={studentsPaged.pageSize} total={studentsPaged.total} onPageChange={studentsPaged.setPage} />
            </Card>
          </Stack>
        )}

        {/* ── ORANG TUA ── */}
        {tab === 'ortu' && (
          <Stack gap="14px">
            <Card title={<><Icon as={LuPlus} /> Tambah Orang Tua</>}>
              <form onSubmit={addOrtu}>
                <Flex gap="10px" flexWrap="wrap" align="flex-end">
                  <Field.Root required maxW="220px"><Field.Label>Nama Orang Tua</Field.Label>
                    <Input value={ortuForm.namaOrtu} onChange={(e) => setOrtuForm({ ...ortuForm, namaOrtu: e.target.value })} required /></Field.Root>
                  <Field.Root maxW="160px"><Field.Label>Hubungan</Field.Label>
                    <NativeSelect.Root>
                      <NativeSelect.Field value={ortuForm.hubungan} onChange={(e) => setOrtuForm({ ...ortuForm, hubungan: e.target.value })}>
                        <option value="">— Pilih —</option>
                        <option value="Ayah">Ayah</option>
                        <option value="Ibu">Ibu</option>
                        <option value="Wali">Wali</option>
                      </NativeSelect.Field>
                      <NativeSelect.Indicator />
                    </NativeSelect.Root>
                  </Field.Root>
                  <Field.Root maxW="160px"><Field.Label>No. HP / WA</Field.Label>
                    <Input value={ortuForm.phone} onChange={(e) => setOrtuForm({ ...ortuForm, phone: e.target.value })} placeholder="08…" /></Field.Root>
                  <Field.Root flex={1} minW="240px"><Field.Label>Alamat</Field.Label>
                    <Input value={ortuForm.alamat} onChange={(e) => setOrtuForm({ ...ortuForm, alamat: e.target.value })} /></Field.Root>
                </Flex>
                <Box mt="12px">
                  <Text fontSize="12px" fontWeight="500" mb="6px">Anak (murid) — bisa pilih lebih dari satu <Text as="span" fontWeight="400" color={COLORS.muted}>(hanya murid yang belum punya orang tua)</Text></Text>
                  <StudentPicker students={unassignedStudents} selected={ortuChildren} search={ortuSearch} kelasOptions={classes.map((c) => c.name)}
                    onSearch={setOrtuSearch} onToggle={(id) => setOrtuChildren((arr) => toggleId(arr, id))} />
                </Box>
                <Flex mt="12px" align="center" gap="10px">
                  <Button type="submit" bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} loading={ortuSaving}>Tambah Orang Tua</Button>
                  {ortuErr && <Text color={COLORS.danger} fontSize="12px">{ortuErr}</Text>}
                </Flex>
              </form>
            </Card>

            <Card>
              <Flex gap="8px" mb="12px" align="flex-end" wrap="wrap">
                <Box minW="220px">
                  <Text fontSize="12px" fontWeight="500" mb="4px" display="flex" alignItems="center" gap="4px"><Icon as={LuSearch} /> Cari Orang Tua</Text>
                  <Input size="sm" value={parentSearch} onChange={(e) => setParentSearch(e.target.value)} placeholder="Nama ortu / No. HP / nama anak…" />
                </Box>
                <Box minW="180px">
                  <Text fontSize="12px" fontWeight="500" mb="4px">Filter Kelas (anak)</Text>
                  <NativeSelect.Root size="sm">
                    <NativeSelect.Field value={ortuFilterKelas} onChange={(e) => setOrtuFilterKelas(e.target.value)}>
                      <option value="">— Semua Kelas —</option>
                      {classes.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </Box>
                {(ortuFilterKelas || parentSearch) && <Text fontSize="12px" color={COLORS.muted}>{filteredParents.length} hasil</Text>}
                <Flex gap="6px" align="flex-end" flexWrap="wrap" ml="auto">
                  <Button size="sm" variant="outline" colorPalette="teal" onClick={() => ortuImportRef.current?.click()} loading={ortuImporting}>
                    <Icon as={LuUpload} /> Import CSV
                  </Button>
                  <input ref={ortuImportRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportOrtu(f) }} />
                  <Button size="sm" variant="outline" colorPalette="green" onClick={handleExportOrtu} disabled={parents.length === 0}>
                    <Icon as={LuDownload} /> Export CSV
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadCSV(TEMPLATE_ORTU_CSV, 'template-orang-tua.csv')}>
                    <Icon as={LuFileText} /> Template
                  </Button>
                </Flex>
              </Flex>
              {ortuImportResult && (
                <Box mb="10px" p="10px" borderRadius="8px" fontSize="13px" bg={ortuImportResult.failed === 0 ? '#DCFCE7' : '#FEF3C7'}>
                  <Text fontWeight="600">Hasil Import: {ortuImportResult.success} berhasil{ortuImportResult.failed > 0 ? `, ${ortuImportResult.failed} gagal` : ''}</Text>
                  {ortuImportResult.errors.map((err, i) => (
                    <Text key={i} color={err.includes('tak ditemukan') ? COLORS.warning : COLORS.danger} fontSize="12px">• {err}</Text>
                  ))}
                </Box>
              )}
              {/* Selection action bar (bulk delete) */}
              {ortuSelectedIds.length > 0 && (
                <Flex mb="10px" p="10px" borderRadius="8px" bg={COLORS.primaryTint} align="center" gap="10px" flexWrap="wrap">
                  <Text fontSize="13px" fontWeight="600">{ortuSelectedIds.length} orang tua dipilih</Text>
                  <Button size="sm" colorPalette="red" variant="solid" loading={ortuBulkDeleting} onClick={delSelectedOrtu}>
                    <Icon as={LuTrash2} /> Hapus Terpilih
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setOrtuSelected({})}>Batal</Button>
                </Flex>
              )}
              <Box overflowX="auto"><Table.Root size="sm">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader w="32px">
                      <Checkbox.Root aria-label="pilih semua di halaman ini"
                        checked={parentsPaged.pageItems.length > 0 && parentsPaged.pageItems.every((p) => ortuSelected[p.id])}
                        onCheckedChange={(e) => {
                          const on = !!e.checked
                          setOrtuSelected((s) => { const n = { ...s }; parentsPaged.pageItems.forEach((p) => { n[p.id] = on }); return n })
                        }}>
                        <Checkbox.HiddenInput />
                        <Checkbox.Control />
                      </Checkbox.Root>
                    </Table.ColumnHeader>
                    <Table.ColumnHeader>#</Table.ColumnHeader>
                    <Table.ColumnHeader>Nama Orang Tua</Table.ColumnHeader>
                    <Table.ColumnHeader>Hubungan</Table.ColumnHeader>
                    <Table.ColumnHeader>No. HP</Table.ColumnHeader>
                    <Table.ColumnHeader>Alamat</Table.ColumnHeader>
                    <Table.ColumnHeader>Anak</Table.ColumnHeader>
                    <Table.ColumnHeader>Kelas</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="right">Aksi</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {filteredParents.length === 0 ? (
                    <Table.Row><Table.Cell colSpan={9} textAlign="center" color={COLORS.muted}>{(ortuFilterKelas || parentSearch) ? 'Tidak ada orang tua yang cocok' : 'Belum ada data orang tua'}</Table.Cell></Table.Row>
                  ) : parentsPaged.pageItems.map((p, i) => {
                    const kelasAnak = Array.from(new Set(p.children.map((c) => c.kelas).filter(Boolean)))
                    return (
                    <Table.Row key={p.id} bg={ortuSelected[p.id] ? COLORS.primaryTint : undefined}>
                      <Table.Cell>
                        <Checkbox.Root aria-label={`pilih ${p.namaOrtu}`}
                          checked={!!ortuSelected[p.id]}
                          onCheckedChange={(e) => setOrtuSelected((s) => ({ ...s, [p.id]: !!e.checked }))}>
                          <Checkbox.HiddenInput />
                          <Checkbox.Control />
                        </Checkbox.Root>
                      </Table.Cell>
                      <Table.Cell fontWeight="bold" color={COLORS.primary}>{(parentsPaged.page - 1) * parentsPaged.pageSize + i + 1}</Table.Cell>
                      <Table.Cell fontWeight="medium">{p.namaOrtu || '-'}</Table.Cell>
                      <Table.Cell>{p.hubungan || '-'}</Table.Cell>
                      <Table.Cell>{p.phone || '-'}</Table.Cell>
                      <Table.Cell>{p.alamat || '-'}</Table.Cell>
                      <Table.Cell>
                        <Flex gap="4px" wrap="wrap">
                          {p.children.length === 0 ? <Text color={COLORS.muted}>-</Text> : p.children.map((c) => <Badge key={c.studentId} {...labelColor(c.kelas || c.fullName)}>{c.fullName}{c.kelas ? ` · ${c.kelas}` : ''}</Badge>)}
                        </Flex>
                      </Table.Cell>
                      <Table.Cell>
                        <Flex gap="4px" wrap="wrap">
                          {kelasAnak.length === 0 ? <Text color={COLORS.muted}>-</Text> : kelasAnak.map((k) => <Badge key={k} {...labelColor(k)}>{k}</Badge>)}
                        </Flex>
                      </Table.Cell>
                      <Table.Cell textAlign="right">
                        <Flex gap="6px" justify="flex-end">
                          <IconButton size="xs" colorPalette="blue" variant="outline" aria-label="Edit" title="Edit" onClick={() => startEditOrtu(p)}><Icon as={LuPencil} /></IconButton>
                          <IconButton size="xs" colorPalette="red" variant="outline" aria-label="Hapus" title="Hapus" onClick={() => delOrtu(p)}><Icon as={LuTrash2} /></IconButton>
                        </Flex>
                      </Table.Cell>
                    </Table.Row>
                  )})}
                </Table.Body>
              </Table.Root></Box>
              <Pagination page={parentsPaged.page} pageSize={parentsPaged.pageSize} total={parentsPaged.total} onPageChange={parentsPaged.setPage} />
            </Card>
          </Stack>
        )}

        {/* ── ADMIN ── */}
        {tab === 'admin' && canTab('admin') && (
          <Stack gap="14px">
            <Card title={<><Icon as={LuPlus} /> Tambah Admin</>}>
              <form onSubmit={addAdmin}>
                <Flex gap="10px" flexWrap="wrap" align="flex-end">
                  <Field.Root required maxW="200px"><Field.Label>Nama Lengkap</Field.Label>
                    <Input value={adminForm.fullName} onChange={(e) => setAdminForm({ ...adminForm, fullName: e.target.value })} required /></Field.Root>
                  <Field.Root required maxW="150px"><Field.Label>Username</Field.Label>
                    <Input value={adminForm.username} onChange={(e) => setAdminForm({ ...adminForm, username: e.target.value })} required /></Field.Root>
                  <Field.Root required maxW="200px"><Field.Label>Email</Field.Label>
                    <Input type="email" value={adminForm.email} onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })} required /></Field.Root>
                  <Field.Root required maxW="150px"><Field.Label>Password</Field.Label>
                    <Input type="text" value={adminForm.password} onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })} required minLength={6} /></Field.Root>
                  <Field.Root maxW="150px"><Field.Label>No. HP</Field.Label>
                    <Input value={adminForm.phone} onChange={(e) => setAdminForm({ ...adminForm, phone: e.target.value })} placeholder="08…" /></Field.Root>
                  <Button type="submit" bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} loading={adminSaving}>Tambah Admin</Button>
                </Flex>
                <Text fontSize="12px" color={COLORS.muted} mt="8px">Admin adalah super-user: memiliki seluruh hak akses, termasuk mengelola akun & mengatur Hak Akses guru.</Text>
                {adminErr && <Text color={COLORS.danger} fontSize="12px" mt="6px">{adminErr}</Text>}
              </form>
            </Card>

            <Card>
              <Flex mb="10px" align="center" gap="8px" wrap="wrap">
                <Flex align="center" gap="6px" flex={1} minW="220px" maxW="360px">
                  <Icon as={LuSearch} color={COLORS.muted} />
                  <Input size="sm" value={adminSearch} onChange={(e) => setAdminSearch(e.target.value)} placeholder="Cari nama / username / email…" />
                </Flex>
                {adminSearch && <Text fontSize="12px" color={COLORS.muted}>{filteredAdmins.length} hasil</Text>}
              </Flex>
              <Box overflowX="auto"><Table.Root size="sm">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader>#</Table.ColumnHeader>
                    <Table.ColumnHeader>Nama</Table.ColumnHeader>
                    <Table.ColumnHeader>Username</Table.ColumnHeader>
                    <Table.ColumnHeader>Email</Table.ColumnHeader>
                    <Table.ColumnHeader>No. HP</Table.ColumnHeader>
                    <Table.ColumnHeader>Password</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="right">Aksi</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {filteredAdmins.length === 0 ? (
                    <Table.Row><Table.Cell colSpan={7} textAlign="center" color={COLORS.muted}>{adminSearch ? 'Tidak ada admin yang cocok' : 'Belum ada admin'}</Table.Cell></Table.Row>
                  ) : adminsPaged.pageItems.map((u, i) => (
                    <Table.Row key={u.id}>
                      <Table.Cell fontWeight="bold" color={COLORS.primary}>{(adminsPaged.page - 1) * adminsPaged.pageSize + i + 1}</Table.Cell>
                      <Table.Cell fontWeight="medium">{u.fullName || '-'}</Table.Cell>
                      <Table.Cell>{u.username}</Table.Cell>
                      <Table.Cell>{u.email}</Table.Cell>
                      <Table.Cell>{u.phone || '-'}</Table.Cell>
                      <Table.Cell><PwdCell user={u} /></Table.Cell>
                      <Table.Cell textAlign="right">
                        <Flex gap="6px" justify="flex-end">
                          <IconButton size="xs" colorPalette="blue" variant="outline" aria-label="Edit" title="Edit" onClick={() => startEdit(u, 'admin')}><Icon as={LuPencil} /></IconButton>
                          <IconButton size="xs" colorPalette="red" variant="outline" aria-label="Hapus" title="Hapus" disabled={u.id === me?.id} onClick={() => delAdmin(u)}><Icon as={LuTrash2} /></IconButton>
                        </Flex>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root></Box>
              <Pagination page={adminsPaged.page} pageSize={adminsPaged.pageSize} total={adminsPaged.total} onPageChange={adminsPaged.setPage} />
            </Card>
          </Stack>
        )}
      </Stack>

      {/* Edit Dialog */}
      <Dialog.Root open={!!editTarget} onOpenChange={(e) => { if (!e.open) cancelEdit() }}>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxW="440px">
            <Dialog.Header>
              <Dialog.Title>Edit {editTarget?.role === 'guru' ? 'Guru' : editTarget?.role === 'admin' ? 'Admin' : 'Murid'}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Stack gap="12px">
                <Field.Root>
                  <Field.Label>Nama Lengkap</Field.Label>
                  <Input value={editForm.fullName} onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })} />
                </Field.Root>
                <Field.Root>
                  <Field.Label>Username</Field.Label>
                  <Input value={editForm.username} onChange={(e) => setEditForm({ ...editForm, username: e.target.value })} />
                </Field.Root>
                <Field.Root>
                  <Field.Label>Email</Field.Label>
                  <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                </Field.Root>
                <Field.Root>
                  <Field.Label>Jenis Kelamin</Field.Label>
                  <NativeSelect.Root>
                    <NativeSelect.Field value={editForm.gender} onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}>
                      <option value="">—</option>
                      <option value="L">Laki-laki</option>
                      <option value="P">Perempuan</option>
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </Field.Root>
                <Field.Root>
                  <Field.Label>No. HP</Field.Label>
                  <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="08…" />
                </Field.Root>
                {editTarget?.role === 'siswa' && (
                  <Field.Root>
                    <Field.Label>Kelas</Field.Label>
                    <NativeSelect.Root>
                      <NativeSelect.Field value={editForm.kelas} onChange={(e) => setEditForm({ ...editForm, kelas: e.target.value })}>
                        <option value="">— Pilih Kelas —</option>
                        {classes.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </NativeSelect.Field>
                      <NativeSelect.Indicator />
                    </NativeSelect.Root>
                  </Field.Root>
                )}
                {editTarget?.role === 'guru' && (
                  <>
                    <Field.Root>
                      <Field.Label>Mata Pelajaran</Field.Label>
                      <Input value={editForm.mapel} onChange={(e) => setEditForm({ ...editForm, mapel: e.target.value })} placeholder="mis. Matematika" />
                    </Field.Root>
                    <Field.Root>
                      <Flex align="center" justify="space-between" w="100%" gap="8px" wrap="wrap" mb="4px">
                        <Field.Label mb="0">
                          Kelas yang diajar{' '}
                          <Text as="span" fontSize="11px" fontWeight="400" color={COLORS.muted}>(bisa pilih lebih dari satu)</Text>
                        </Field.Label>
                        {classes.length > 0 && (
                          <Flex gap="6px">
                            <Button size="2xs" variant="ghost" type="button" onClick={() => setEditGuruKelas(classes.map((c) => c.name))}>Pilih semua</Button>
                            <Button size="2xs" variant="ghost" type="button" onClick={() => setEditGuruKelas([])}>Kosongkan</Button>
                          </Flex>
                        )}
                      </Flex>
                      <Flex gap="8px" wrap="wrap">
                        {classes.length === 0 ? <Text fontSize="12px" color={COLORS.muted}>Belum ada kelas.</Text> : classes.map((c) => (
                          <KelasChip key={c.id} name={c.name} on={editGuruKelas.includes(c.name)}
                            onToggle={() => setEditGuruKelas((arr) => arr.includes(c.name) ? arr.filter((x) => x !== c.name) : [...arr, c.name])} />
                        ))}
                      </Flex>
                    </Field.Root>
                    {isAdmin(me) && (
                      <Field.Root>
                        <Flex align="center" justify="space-between" w="100%" gap="8px" wrap="wrap" mb="4px">
                          <Field.Label mb="0">Hak Akses <Text as="span" fontSize="11px" fontWeight="400" color={COLORS.muted}>(izin guru ini)</Text></Field.Label>
                          <Flex gap="6px">
                            <Button size="2xs" variant="ghost" type="button" onClick={() => setEditGuruPerms(PERMISSIONS.map((p) => p.key))}>Pilih semua</Button>
                            <Button size="2xs" variant="ghost" type="button" onClick={() => setEditGuruPerms([])}>Kosongkan</Button>
                          </Flex>
                        </Flex>
                        <Flex gap="8px" wrap="wrap">
                          {PERMISSIONS.map((p) => (
                            <KelasChip key={p.key} name={p.label} on={editGuruPerms.includes(p.key)}
                              onToggle={() => setEditGuruPerms((arr) => arr.includes(p.key) ? arr.filter((x) => x !== p.key) : [...arr, p.key])} />
                          ))}
                        </Flex>
                        <Text fontSize="11px" color={COLORS.muted} mt="4px">Perubahan hak akses berlaku saat guru login berikutnya.</Text>
                      </Field.Root>
                    )}
                  </>
                )}
                <Field.Root>
                  <Field.Label>
                    Password Baru{' '}
                    <Text as="span" fontSize="11px" color={COLORS.muted}>(kosongkan jika tidak diubah)</Text>
                  </Field.Label>
                  <Input type="text" value={editForm.password}
                    onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                    placeholder="Min. 6 karakter" />
                </Field.Root>
                {editError && <Text color={COLORS.danger} fontSize="12px">{editError}</Text>}
              </Stack>
            </Dialog.Body>
            <Dialog.Footer>
              <Flex gap="8px" justify="flex-end">
                <Button variant="outline" onClick={cancelEdit}>Batal</Button>
                <Button bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }}
                  loading={editSaving} onClick={saveEdit}>
                  Simpan
                </Button>
              </Flex>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>

      {/* Edit Orang Tua */}
      <Dialog.Root open={!!editOrtu} onOpenChange={(e) => { if (!e.open) setEditOrtu(null) }}>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxW="560px">
            <Dialog.Header>
              <Dialog.Title>Edit Orang Tua</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Stack gap="12px">
                <Flex gap="10px" wrap="wrap">
                  <Field.Root flex={1} minW="200px"><Field.Label>Nama Orang Tua</Field.Label>
                    <Input value={editOrtuForm.namaOrtu} onChange={(e) => setEditOrtuForm({ ...editOrtuForm, namaOrtu: e.target.value })} /></Field.Root>
                  <Field.Root maxW="150px"><Field.Label>Hubungan</Field.Label>
                    <NativeSelect.Root>
                      <NativeSelect.Field value={editOrtuForm.hubungan} onChange={(e) => setEditOrtuForm({ ...editOrtuForm, hubungan: e.target.value })}>
                        <option value="">— Pilih —</option>
                        <option value="Ayah">Ayah</option>
                        <option value="Ibu">Ibu</option>
                        <option value="Wali">Wali</option>
                      </NativeSelect.Field>
                      <NativeSelect.Indicator />
                    </NativeSelect.Root>
                  </Field.Root>
                </Flex>
                <Flex gap="10px" wrap="wrap">
                  <Field.Root flex={1} minW="150px"><Field.Label>No. HP / WA</Field.Label>
                    <Input value={editOrtuForm.phone} onChange={(e) => setEditOrtuForm({ ...editOrtuForm, phone: e.target.value })} /></Field.Root>
                  <Field.Root flex={1} minW="200px"><Field.Label>Alamat</Field.Label>
                    <Input value={editOrtuForm.alamat} onChange={(e) => setEditOrtuForm({ ...editOrtuForm, alamat: e.target.value })} /></Field.Root>
                </Flex>
                <Box>
                  <Text fontSize="12px" fontWeight="500" mb="6px">Anak (murid)</Text>
                  <StudentPicker students={editableStudents} selected={editOrtuChildren} search={editOrtuSearch} kelasOptions={classes.map((c) => c.name)}
                    onSearch={setEditOrtuSearch} onToggle={(id) => setEditOrtuChildren((arr) => toggleId(arr, id))} />
                </Box>
                {editOrtuErr && <Text color={COLORS.danger} fontSize="12px">{editOrtuErr}</Text>}
              </Stack>
            </Dialog.Body>
            <Dialog.Footer>
              <Flex gap="8px" justify="flex-end">
                <Button variant="outline" onClick={() => setEditOrtu(null)}>Batal</Button>
                <Button bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} loading={editOrtuSaving} onClick={saveEditOrtu}>Simpan</Button>
              </Flex>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>

      {/* Mutasi Kelas (massal antar-kelas) */}
      <Dialog.Root open={mutasiOpen} onOpenChange={(e) => { if (!e.open) setMutasiOpen(false) }}>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxW="460px">
            <Dialog.Header>
              <Dialog.Title><Icon as={LuArrowRightLeft} /> Mutasi Kelas (Massal)</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Stack gap="12px">
                <Text fontSize="12px" color={COLORS.muted}>
                  Pindahkan <b>semua murid</b> dari satu kelas ke kelas lain sekaligus — mis. kenaikan kelas X → XI.
                </Text>
                <Field.Root>
                  <Field.Label>Dari Kelas</Field.Label>
                  <NativeSelect.Root>
                    <NativeSelect.Field value={mutFrom} onChange={(e) => setMutFrom(e.target.value)}>
                      <option value="">— Pilih Kelas Asal —</option>
                      {classes.map((c) => <option key={c.id} value={c.name}>{c.name} ({c.studentCount} murid)</option>)}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </Field.Root>
                <Flex justify="center"><Icon as={LuArrowRightLeft} color={COLORS.primary} boxSize="20px" /></Flex>
                <Field.Root>
                  <Field.Label>Ke Kelas</Field.Label>
                  <NativeSelect.Root>
                    <NativeSelect.Field value={mutTo} onChange={(e) => setMutTo(e.target.value)}>
                      <option value="">— Pilih Kelas Tujuan —</option>
                      {classes.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </Field.Root>
                {mutFrom && (
                  <Text fontSize="12px" color={COLORS.muted}>
                    {classes.find((c) => c.name === mutFrom)?.studentCount ?? 0} murid akan dipindah.
                  </Text>
                )}
                {mutMsg && <Text fontSize="13px" color={mutMsg.startsWith('✓') ? COLORS.success : COLORS.danger}>{mutMsg}</Text>}
              </Stack>
            </Dialog.Body>
            <Dialog.Footer>
              <Flex gap="8px" justify="flex-end">
                <Button variant="outline" onClick={() => setMutasiOpen(false)}>Tutup</Button>
                <Button bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }}
                  loading={mutSaving} disabled={!mutFrom || !mutTo} onClick={doMutasiBulk}>
                  <Icon as={LuArrowRightLeft} /> Mutasi Semua
                </Button>
              </Flex>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>

      {/* Edit Kelas dialog */}
      <Dialog.Root open={!!editKelas} onOpenChange={(e) => { if (!e.open) setEditKelas(null) }}>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxW="420px">
            <Dialog.Header><Dialog.Title>Edit Kelas</Dialog.Title></Dialog.Header>
            <Dialog.Body>
              <Stack gap="10px">
                <Field.Root>
                  <Field.Label>Nama Kelas</Field.Label>
                  <Input value={editKelasName} onChange={(e) => setEditKelasName(e.target.value)}
                    placeholder="mis. X TKJ 1"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEditKelas() } }} />
                </Field.Root>
                <Text fontSize="11px" color={COLORS.muted}>
                  Mengganti nama akan otomatis memperbarui kelas semua murid di kelas ini.
                </Text>
                {editKelasErr && <Text color={COLORS.danger} fontSize="12px">{editKelasErr}</Text>}
              </Stack>
            </Dialog.Body>
            <Dialog.Footer>
              <Flex gap="8px" justify="flex-end">
                <Button variant="outline" onClick={() => setEditKelas(null)}>Batal</Button>
                <Button bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} loading={savingKelas} onClick={saveEditKelas}>
                  Simpan
                </Button>
              </Flex>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>

      {/* Edit Jurusan dialog */}
      <Dialog.Root open={!!editJurusan} onOpenChange={(e) => { if (!e.open) setEditJurusan(null) }}>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxW="420px">
            <Dialog.Header><Dialog.Title>Edit Jurusan</Dialog.Title></Dialog.Header>
            <Dialog.Body>
              <Stack gap="10px">
                <Field.Root>
                  <Field.Label>Nama Jurusan</Field.Label>
                  <Input value={editJurusanName} onChange={(e) => setEditJurusanName(e.target.value)}
                    placeholder="mis. TKJ"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEditJurusan() } }} />
                </Field.Root>
                <Text fontSize="11px" color={COLORS.muted}>
                  Mengganti nama akan otomatis memperbarui jurusan semua murid di jurusan ini.
                </Text>
                {editJurusanErr && <Text color={COLORS.danger} fontSize="12px">{editJurusanErr}</Text>}
              </Stack>
            </Dialog.Body>
            <Dialog.Footer>
              <Flex gap="8px" justify="flex-end">
                <Button variant="outline" onClick={() => setEditJurusan(null)}>Batal</Button>
                <Button bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} loading={savingJurusan} onClick={saveEditJurusan}>
                  Simpan
                </Button>
              </Flex>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </AppLayout>
  )
}
