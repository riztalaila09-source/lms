import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Badge, Box, Button, Dialog, Field, Flex, Icon, Input, NativeSelect, Stack, Table, Text,
} from '@chakra-ui/react'
import {
  LuPlus, LuTrash2, LuPencil, LuSearch, LuUpload, LuDownload, LuFileText, LuCopy, LuArrowRightLeft,
} from 'react-icons/lu'
import { userClient, classClient, jurusanClient } from '@/lib/client'
import type { User } from '@/gen/user/v1/user_pb'
import { Role } from '@/gen/user/v1/user_pb'
import type { Class } from '@/gen/class/v1/class_pb'
import type { Jurusan } from '@/gen/jurusan/v1/jurusan_pb'
import AppLayout from '@/components/AppLayout'
import { Card } from '@/components/Card'
import ConfirmDialog, { type ConfirmState } from '@/components/ConfirmDialog'
import Pagination, { usePaged } from '@/components/Pagination'
import { COLORS, labelColor } from '@/theme/tokens'

type Tab = 'kelas' | 'jurusan' | 'guru' | 'siswa'

interface EditForm {
  fullName: string
  username: string
  email: string
  kelas: string
  jurusan: string
  password: string
}

interface ImportRow {
  fullName: string; username: string; email: string; password: string; kelas: string; jurusan: string
}

const TEMPLATE_CSV = [
  'Nama Lengkap,Username,Email,Password,Kelas,Jurusan',
  'Andi Pratama,andi.pratama,andi@sekolah.com,Password123,X-TKJ1,TKJ',
  'Budi Santoso,budi.santoso,budi@sekolah.com,Password123,X-TKR1,TKR',
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
    jurusan: headers.findIndex(h => h === 'jurusan'),
  }
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''))
    const get = (i: number) => (i >= 0 ? vals[i] || '' : '')
    return { fullName: get(idx.fullName), username: get(idx.username), email: get(idx.email), password: get(idx.password), kelas: get(idx.kelas), jurusan: get(idx.jurusan) }
  }).filter(r => r.fullName || r.username || r.email)
}

export default function UsersPage() {
  const [tab, setTab] = useState<Tab>('kelas')
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  // plain passwords typed this session (fallback before the list reloads)
  const [passwords, setPasswords] = useState<Record<string, string>>({})

  // edit dialog
  const [editTarget, setEditTarget] = useState<{ user: User; role: 'guru' | 'siswa' } | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ fullName: '', username: '', email: '', kelas: '', jurusan: '', password: '' })
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

  // ── Kelas ──
  const [newKelas, setNewKelas] = useState('')
  const [kelasErr, setKelasErr] = useState('')
  const [editKelas, setEditKelas] = useState<Class | null>(null)
  const [editKelasName, setEditKelasName] = useState('')
  const [editKelasErr, setEditKelasErr] = useState('')
  const [savingKelas, setSavingKelas] = useState(false)
  const addKelas = async () => {
    const name = newKelas.trim()
    if (!name) return
    setKelasErr('')
    try { await classClient.createClass({ name }); setNewKelas(''); await loadClasses() }
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
    title: 'Hapus Jurusan', message: `Hapus jurusan "${j.name}"? Siswa yang memakai jurusan ini tetap ada, tapi opsinya hilang.`,
    variant: 'danger', confirmLabel: 'Ya, Hapus',
    onConfirm: async () => { try { await jurusanClient.deleteJurusan({ id: j.id }); await loadJurusans() } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Gagal') } },
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
    onConfirm: async () => { try { await classClient.deleteClass({ id: c.id }); await loadClasses() } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Gagal') } },
  })

  // ── Guru ──
  const emptyGuru = { fullName: '', username: '', email: '', password: '' }
  const [guruForm, setGuruForm] = useState(emptyGuru)
  const [guruErr, setGuruErr] = useState('')
  const [guruSaving, setGuruSaving] = useState(false)
  const addGuru = async (e: React.FormEvent) => {
    e.preventDefault(); setGuruErr(''); setGuruSaving(true)
    try {
      const u = await userClient.createUser({ ...guruForm, role: Role.TEACHER, kelas: '', jurusan: '' })
      if (guruForm.password) setPasswords(p => ({ ...p, [u.id]: guruForm.password }))
      setGuruForm(emptyGuru); await loadTeachers()
    } catch (err: unknown) { setGuruErr(err instanceof Error ? err.message : 'Gagal menambah guru') }
    finally { setGuruSaving(false) }
  }
  const delGuru = (u: User) => setConfirm({
    title: 'Hapus Guru', message: `Hapus akun guru "${u.fullName || u.username}"?`,
    variant: 'danger', confirmLabel: 'Ya, Hapus',
    onConfirm: async () => { try { await userClient.deleteUser({ id: u.id }); await loadTeachers() } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Gagal') } },
  })

  // ── Siswa ──
  const emptySiswa = { fullName: '', username: '', email: '', password: '', kelas: '', jurusan: '' }
  const [siswaForm, setSiswaForm] = useState(emptySiswa)
  const [siswaErr, setSiswaErr] = useState('')
  const [siswaSaving, setSiswaSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filterKelas, setFilterKelas] = useState('')

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
    } catch (err: unknown) { setSiswaErr(err instanceof Error ? err.message : 'Gagal menambah siswa') }
    finally { setSiswaSaving(false) }
  }
  const delSiswa = (u: User) => setConfirm({
    title: 'Hapus Siswa', message: `Hapus akun siswa "${u.fullName || u.username}"?`,
    variant: 'danger', confirmLabel: 'Ya, Hapus',
    onConfirm: async () => { try { await userClient.deleteUser({ id: u.id }); await loadStudents() } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Gagal') } },
  })

  // ── Edit ──
  const startEdit = (user: User, role: 'guru' | 'siswa') => {
    setEditTarget({ user, role })
    setEditForm({ fullName: user.fullName, username: user.username, email: user.email, kelas: user.kelas, jurusan: user.jurusan, password: '' })
    setEditError('')
  }
  const cancelEdit = () => { setEditTarget(null); setEditError('') }
  const saveEdit = async () => {
    if (!editTarget) return
    setEditSaving(true); setEditError('')
    try {
      await userClient.updateUser({
        id: editTarget.user.id,
        fullName: editForm.fullName || undefined,
        email: editForm.email || undefined,
        username: editForm.username || undefined,
        kelas: editTarget.role === 'siswa' ? editForm.kelas : undefined,
        jurusan: editTarget.role === 'siswa' ? editForm.jurusan : undefined,
        password: editForm.password || undefined,
      })
      if (editForm.password) setPasswords(p => ({ ...p, [editTarget.user.id]: editForm.password }))
      setEditTarget(null)
      if (editTarget.role === 'guru') await loadTeachers()
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
      message: `Pindahkan semua ${count} siswa dari kelas "${mutFrom}" ke "${mutTo}"? Kelas semua siswa tersebut akan berubah.`,
      variant: 'primary', confirmLabel: 'Ya, Mutasi',
      onConfirm: async () => {
        setMutMsg(''); setMutSaving(true)
        try {
          const r = await userClient.mutateClass({ fromKelas: mutFrom, toKelas: mutTo })
          setMutMsg(`✓ ${r.moved} siswa dipindah dari ${mutFrom} ke ${mutTo}.`)
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
      message: `Pindahkan ${selectedIds.length} siswa terpilih ke kelas "${bulkTo}"?`,
      variant: 'primary', confirmLabel: 'Ya, Mutasi',
      onConfirm: async () => {
        setMutSaving(true)
        try {
          const r = await userClient.mutateClass({ toKelas: bulkTo, studentIds: selectedIds })
          setSelected({}); setBulkTo('')
          await Promise.all([loadStudents(), loadClasses()])
          alert(`${r.moved} siswa dipindah ke ${bulkTo}.`)
        } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Gagal mutasi') }
        finally { setMutSaving(false) }
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
            password: row.password || 'Password123', kelas: row.kelas, jurusan: row.jurusan,
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
    const rows = [
      'Nama Lengkap,Username,Email,Kelas,Jurusan',
      ...students.map(s => `"${s.fullName}","${s.username}","${s.email}","${s.kelas}","${s.jurusan}"`),
    ]
    downloadCSV(rows.join('\n'), 'data-siswa.csv')
  }

  // ── Load per tab ──
  useEffect(() => { loadClasses(); loadJurusans() }, [loadClasses, loadJurusans])
  useEffect(() => { if (tab === 'guru') loadTeachers() }, [tab, loadTeachers])
  useEffect(() => {
    if (tab !== 'siswa') return
    const t = setTimeout(loadStudents, 250)
    return () => clearTimeout(t)
  }, [tab, loadStudents])

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

  const teachersPaged = usePaged(teachers, 10)
  const studentsPaged = usePaged(students, 10)

  const TabBtn = ({ id, label }: { id: Tab; label: string }) => (
    <Button variant="ghost" borderRadius={0} borderBottom="2px solid"
      borderColor={tab === id ? COLORS.primary : 'transparent'}
      color={tab === id ? COLORS.primary : 'gray.600'} onClick={() => setTab(id)}>
      {label}
    </Button>
  )

  return (
    <AppLayout title="Kelola Akun" subtitle="Kelola data Kelas, Jurusan, Guru, dan Siswa">
      <Stack gap="16px">
        <Flex gap={0} borderBottom="2px solid" borderColor="gray.200">
          <TabBtn id="kelas" label={`Kelas (${classes.length})`} />
          <TabBtn id="jurusan" label={`Jurusan (${jurusans.length})`} />
          <TabBtn id="guru" label="Guru" />
          <TabBtn id="siswa" label="Siswa" />
        </Flex>

        {/* ── KELAS ── */}
        {tab === 'kelas' && (
          <Stack gap="14px">
            <Card title={<><Icon as={LuPlus} /> Tambah Kelas</>}>
              <Flex gap="8px" maxW="460px">
                <Input placeholder="Nama kelas (mis. X TKJ 1)" value={newKelas}
                  onChange={(e) => setNewKelas(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKelas() } }} />
                <Button bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} onClick={addKelas}>Tambah</Button>
              </Flex>
              {kelasErr && <Text color={COLORS.danger} fontSize="12px" mt="6px">{kelasErr}</Text>}
            </Card>
            <Card>
              <Box overflowX="auto"><Table.Root size="sm">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader>Nama Kelas</Table.ColumnHeader>
                    <Table.ColumnHeader>Jumlah Siswa</Table.ColumnHeader>
                    <Table.ColumnHeader>Aksi</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {classes.length === 0 ? (
                    <Table.Row><Table.Cell colSpan={3} textAlign="center" color={COLORS.muted}>Belum ada kelas</Table.Cell></Table.Row>
                  ) : classes.map((c) => (
                    <Table.Row key={c.id}>
                      <Table.Cell><Badge {...labelColor(c.name)}>{c.name}</Badge></Table.Cell>
                      <Table.Cell>{c.studentCount} siswa</Table.Cell>
                      <Table.Cell>
                        <Flex gap="6px">
                          <Button size="xs" colorPalette="blue" variant="outline" onClick={() => startEditKelas(c)}><Icon as={LuPencil} /> Edit</Button>
                          <Button size="xs" colorPalette="red" variant="outline" onClick={() => delKelas(c)}><Icon as={LuTrash2} /> Hapus</Button>
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
                    <Table.ColumnHeader>Jumlah Siswa</Table.ColumnHeader>
                    <Table.ColumnHeader>Aksi</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {jurusans.length === 0 ? (
                    <Table.Row><Table.Cell colSpan={3} textAlign="center" color={COLORS.muted}>Belum ada jurusan</Table.Cell></Table.Row>
                  ) : jurusans.map((j) => (
                    <Table.Row key={j.id}>
                      <Table.Cell><Badge {...labelColor(j.name)}>{j.name}</Badge></Table.Cell>
                      <Table.Cell>{j.studentCount} siswa</Table.Cell>
                      <Table.Cell>
                        <Flex gap="6px">
                          <Button size="xs" colorPalette="blue" variant="outline" onClick={() => startEditJurusan(j)}><Icon as={LuPencil} /> Edit</Button>
                          <Button size="xs" colorPalette="red" variant="outline" onClick={() => delJurusan(j)}><Icon as={LuTrash2} /> Hapus</Button>
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
                  <Button type="submit" bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} loading={guruSaving}>Tambah Guru</Button>
                </Flex>
                {guruErr && <Text color={COLORS.danger} fontSize="12px" mt="6px">{guruErr}</Text>}
              </form>
            </Card>
            <Card>
              <Box overflowX="auto"><Table.Root size="sm">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader>Nama</Table.ColumnHeader>
                    <Table.ColumnHeader>Username</Table.ColumnHeader>
                    <Table.ColumnHeader>Email</Table.ColumnHeader>
                    <Table.ColumnHeader>Password</Table.ColumnHeader>
                    <Table.ColumnHeader>Aksi</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {teachers.length === 0 ? (
                    <Table.Row><Table.Cell colSpan={5} textAlign="center" color={COLORS.muted}>Belum ada guru</Table.Cell></Table.Row>
                  ) : teachersPaged.pageItems.map((u) => (
                    <Table.Row key={u.id}>
                      <Table.Cell fontWeight="medium">{u.fullName || '-'}</Table.Cell>
                      <Table.Cell>{u.username}</Table.Cell>
                      <Table.Cell>{u.email}</Table.Cell>
                      <Table.Cell><PwdCell user={u} /></Table.Cell>
                      <Table.Cell>
                        <Flex gap="6px">
                          <Button size="xs" colorPalette="blue" variant="outline" onClick={() => startEdit(u, 'guru')}><Icon as={LuPencil} /> Edit</Button>
                          <Button size="xs" colorPalette="red" variant="outline" onClick={() => delGuru(u)}><Icon as={LuTrash2} /> Hapus</Button>
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
            <Card title={<><Icon as={LuPlus} /> Tambah Siswa</>}>
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
                  <Field.Root maxW="140px"><Field.Label>Jurusan</Field.Label>
                    <NativeSelect.Root>
                      <NativeSelect.Field value={siswaForm.jurusan} onChange={(e) => setSiswaForm({ ...siswaForm, jurusan: e.target.value })}>
                        <option value="">— Pilih Jurusan —</option>
                        {jurusans.map((j) => <option key={j.id} value={j.name}>{j.name}</option>)}
                      </NativeSelect.Field>
                      <NativeSelect.Indicator />
                    </NativeSelect.Root>
                  </Field.Root>
                  <Button type="submit" bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} loading={siswaSaving}>Tambah Siswa</Button>
                </Flex>
                {siswaErr && <Text color={COLORS.danger} fontSize="12px" mt="6px">{siswaErr}</Text>}
              </form>
            </Card>

            <Card>
              {/* Toolbar: search + filter + import/export */}
              <Flex gap="8px" mb="12px" flexWrap="wrap" align="flex-end">
                <Box flex={1} minW="160px">
                  <Text fontSize="12px" fontWeight="500" mb="4px" display="flex" alignItems="center" gap="4px"><Icon as={LuSearch} /> Cari Siswa</Text>
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
                    onClick={() => downloadCSV(TEMPLATE_CSV, 'template-siswa.csv')}>
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
                  <Text fontSize="13px" fontWeight="600">{selectedIds.length} siswa dipilih</Text>
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
                      <input type="checkbox" aria-label="pilih semua di halaman ini"
                        checked={studentsPaged.pageItems.length > 0 && studentsPaged.pageItems.every((u) => selected[u.id])}
                        onChange={(e) => {
                          const on = e.target.checked
                          setSelected((s) => { const n = { ...s }; studentsPaged.pageItems.forEach((u) => { n[u.id] = on }); return n })
                        }} />
                    </Table.ColumnHeader>
                    <Table.ColumnHeader>Nama</Table.ColumnHeader>
                    <Table.ColumnHeader>Username</Table.ColumnHeader>
                    <Table.ColumnHeader>Email</Table.ColumnHeader>
                    <Table.ColumnHeader>Kelas</Table.ColumnHeader>
                    <Table.ColumnHeader>Jurusan</Table.ColumnHeader>
                    <Table.ColumnHeader>Password</Table.ColumnHeader>
                    <Table.ColumnHeader>Aksi</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {students.length === 0 ? (
                    <Table.Row><Table.Cell colSpan={8} textAlign="center" color={COLORS.muted}>Tidak ada siswa</Table.Cell></Table.Row>
                  ) : studentsPaged.pageItems.map((u) => (
                    <Table.Row key={u.id} bg={selected[u.id] ? COLORS.primaryTint : undefined}>
                      <Table.Cell>
                        <input type="checkbox" aria-label={`pilih ${u.fullName}`}
                          checked={!!selected[u.id]}
                          onChange={() => setSelected((s) => ({ ...s, [u.id]: !s[u.id] }))} />
                      </Table.Cell>
                      <Table.Cell fontWeight="medium">{u.fullName || '-'}</Table.Cell>
                      <Table.Cell>{u.username}</Table.Cell>
                      <Table.Cell>{u.email}</Table.Cell>
                      <Table.Cell>{u.kelas ? <Badge {...labelColor(u.kelas)}>{u.kelas}</Badge> : '-'}</Table.Cell>
                      <Table.Cell>{u.jurusan ? <Badge {...labelColor(u.jurusan)}>{u.jurusan}</Badge> : '-'}</Table.Cell>
                      <Table.Cell><PwdCell user={u} /></Table.Cell>
                      <Table.Cell>
                        <Flex gap="6px">
                          <Button size="xs" colorPalette="blue" variant="outline" onClick={() => startEdit(u, 'siswa')}><Icon as={LuPencil} /> Edit</Button>
                          <Button size="xs" colorPalette="red" variant="outline" onClick={() => delSiswa(u)}><Icon as={LuTrash2} /> Hapus</Button>
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
      </Stack>

      {/* Edit Dialog */}
      <Dialog.Root open={!!editTarget} onOpenChange={(e) => { if (!e.open) cancelEdit() }}>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxW="440px">
            <Dialog.Header>
              <Dialog.Title>Edit {editTarget?.role === 'guru' ? 'Guru' : 'Siswa'}</Dialog.Title>
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
                {editTarget?.role === 'siswa' && (
                  <>
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
                    <Field.Root>
                      <Field.Label>Jurusan</Field.Label>
                      <NativeSelect.Root>
                        <NativeSelect.Field value={editForm.jurusan} onChange={(e) => setEditForm({ ...editForm, jurusan: e.target.value })}>
                          <option value="">— Pilih Jurusan —</option>
                          {jurusans.map((j) => <option key={j.id} value={j.name}>{j.name}</option>)}
                        </NativeSelect.Field>
                        <NativeSelect.Indicator />
                      </NativeSelect.Root>
                    </Field.Root>
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
                  Pindahkan <b>semua siswa</b> dari satu kelas ke kelas lain sekaligus — mis. kenaikan kelas X → XI.
                </Text>
                <Field.Root>
                  <Field.Label>Dari Kelas</Field.Label>
                  <NativeSelect.Root>
                    <NativeSelect.Field value={mutFrom} onChange={(e) => setMutFrom(e.target.value)}>
                      <option value="">— Pilih Kelas Asal —</option>
                      {classes.map((c) => <option key={c.id} value={c.name}>{c.name} ({c.studentCount} siswa)</option>)}
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
                    {classes.find((c) => c.name === mutFrom)?.studentCount ?? 0} siswa akan dipindah.
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
                  Mengganti nama akan otomatis memperbarui kelas semua siswa di kelas ini.
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
                  Mengganti nama akan otomatis memperbarui jurusan semua siswa di jurusan ini.
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
