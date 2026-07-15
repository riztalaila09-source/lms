import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import {
  Badge, Box, Button, Card, Field, Flex, Heading, Icon, IconButton, Image, Input, Menu, NativeSelect, Portal, SimpleGrid, Spinner, Stack, Table, Text,
} from '@chakra-ui/react'
import { LuQrCode, LuRefreshCw, LuCamera, LuCircleCheck, LuClock, LuUsers, LuPlus, LuTrash2, LuDownload, LuMessageCircle } from 'react-icons/lu'
import QRCode from 'qrcode'
import { Html5Qrcode } from 'html5-qrcode'
import { ConnectError } from '@connectrpc/connect'
import { attendanceClient, courseClient, userClient, classClient, schoolClient, jurusanClient, parentClient } from '@/lib/client'
import { Role } from '@/gen/user/v1/user_pb'
import type { Session as AttSession, Record as AttRecord, TokenInfo, MyTodayResponse } from '@/gen/attendance/v1/attendance_pb'
import type { Course } from '@/gen/course/v1/course_pb'
import type { User } from '@/gen/user/v1/user_pb'
import { useAuth } from '@/hooks/useAuth'
import AppLayout from '@/components/AppLayout'
import ConfirmDialog, { type ConfirmState } from '@/components/ConfirmDialog'
import NotifikasiAbsenDialog, { type NotifTarget } from '@/components/absensi/NotifikasiAbsenDialog'
import { toaster } from '@/components/ui/toaster'
import { COLORS } from '@/theme/tokens'

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
// Default jam ke → waktu (bisa disesuaikan; guru tetap boleh menimpa manual).
const JAM_PELAJARAN: { ke: number; start: string; end: string }[] = [
  { ke: 1, start: '07:00', end: '07:45' },
  { ke: 2, start: '07:45', end: '08:30' },
  { ke: 3, start: '08:30', end: '09:15' },
  { ke: 4, start: '09:15', end: '10:00' },
  { ke: 5, start: '10:15', end: '11:00' },
  { ke: 6, start: '11:00', end: '11:45' },
  { ke: 7, start: '11:45', end: '12:30' },
  { ke: 8, start: '13:00', end: '13:45' },
  { ke: 9, start: '13:45', end: '14:30' },
  { ke: 10, start: '14:30', end: '15:15' },
]
const STATUSES = [
  { v: 'hadir', label: 'Hadir', color: 'green' },
  { v: 'telat', label: 'Telat', color: 'yellow' },
  { v: 'sakit', label: 'Sakit', color: 'orange' },
  { v: 'izin', label: 'Izin', color: 'blue' },
  { v: 'alpa', label: 'Alpa', color: 'red' },
] as const

const todayStr = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD (local)
const hariOf = (d: string) => { try { return HARI[new Date(d + 'T00:00:00').getDay()] } catch { return '' } }
const jamLabel = (s: { jamKe: number; jamKeAkhir?: number; startTime: string; endTime: string }) => {
  const time = `${s.startTime}–${s.endTime}`
  if (!s.jamKe) return time
  if (s.jamKeAkhir && s.jamKeAkhir > s.jamKe) return `Jam ke-${s.jamKe} s/d ${s.jamKeAkhir} · ${time}`
  return `Jam ke-${s.jamKe} · ${time}`
}
function StatusBadge({ s }: { s: string }) {
  const m = STATUSES.find((x) => x.v === s)
  return <Badge colorPalette={m?.color ?? 'gray'}>{m?.label ?? s}</Badge>
}
const errMsg = (e: unknown) => (e instanceof ConnectError ? e.rawMessage : e instanceof Error ? e.message : 'Terjadi kesalahan')

// "Tidak masuk" = tidak hadir (alpa/sakit/izin); telat tetap dianggap hadir.
const ABSENT = new Set(['alpa', 'sakit', 'izin'])
const statusMeta = (v: string) => STATUSES.find((x) => x.v === v)
// Normalisasi nomor Indonesia untuk WhatsApp (0→62, buang non-digit).
const waNormalize = (no: string) => {
  let n = (no || '').replace(/\D/g, '')
  if (n.startsWith('0')) n = '62' + n.slice(1)
  return n
}
// Susun teks pesan notifikasi ke orang tua.
function composeAbsenNotif(o: { namaSiswa: string; kelas: string; tanggal: string; detail: string; namaSekolah: string }): string {
  const tgl = `${hariOf(o.tanggal)}, ${o.tanggal}`
  return [
    `Yth. Bapak/Ibu Orang Tua/Wali dari ananda ${o.namaSiswa}${o.kelas ? ` (${o.kelas})` : ''},`,
    `kami informasikan pada ${tgl} ananda ${o.detail}.`,
    `Mohon perhatian dan konfirmasinya. Terima kasih.`,
    o.namaSekolah ? `— ${o.namaSekolah}` : '',
  ].filter(Boolean).join('\n')
}

// Data pendukung notifikasi: peta siswa→No. HP orang tua + nama sekolah.
function useNotifData() {
  const [parentMap, setParentMap] = useState<Map<string, { phone: string; nama: string }>>(new Map())
  const [schoolName, setSchoolName] = useState('')
  useEffect(() => {
    parentClient.listParents({ pagination: { page: 1, pageSize: 500 } }).then((r) => {
      const m = new Map<string, { phone: string; nama: string }>()
      r.parents.forEach((p) => {
        const nama = p.namaAyah || p.namaIbu || p.namaWali || 'Orang Tua/Wali'
        p.children.forEach((c) => m.set(c.studentId, { phone: waNormalize(p.phone), nama }))
      })
      setParentMap(m)
    }).catch(() => {})
    schoolClient.getSchool({}).then((s) => setSchoolName(s.name)).catch(() => {})
  }, [])
  const parentOf = useCallback((studentId: string) => {
    const v = parentMap.get(studentId)
    return v && v.phone ? v : null
  }, [parentMap])
  return { parentOf, schoolName }
}

// Renders a QR from arbitrary text.
function QRImage({ text, size = 220 }: { text: string; size?: number }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let ok = true
    QRCode.toDataURL(text, { width: size, margin: 1 }).then((u) => { if (ok) setUrl(u) }).catch(() => {})
    return () => { ok = false }
  }, [text, size])
  return url
    ? <Image src={url} alt="QR absensi" w={`${size}px`} h={`${size}px`} />
    : <Flex w={`${size}px`} h={`${size}px`} align="center" justify="center" bg={COLORS.bg}><Spinner /></Flex>
}

// ───────────────────────── Teacher ─────────────────────────
function TeacherAbsensi() {
  const [tab, setTab] = useState<'buat' | 'perhari' | 'hasil' | 'export'>('buat')
  const [courses, setCourses] = useState<Course[]>([])
  const [classNames, setClassNames] = useState<string[]>([])
  useEffect(() => { courseClient.listCourses({}).then((r) => setCourses(r.courses)).catch(() => setCourses([])) }, [])
  useEffect(() => { classClient.listClasses({}).then((r) => setClassNames(r.classes.map((c) => c.name))).catch(() => setClassNames([])) }, [])

  // ── Buat ──
  const [form, setForm] = useState({ tanggal: todayStr(), courseId: '', mapel: '', jamKe: 1, jamKeAkhir: 0, start: '07:00', end: '07:45', kelas: '', ruang: '' })
  const [session, setSession] = useState<AttSession | null>(null)
  const [token, setToken] = useState<TokenInfo | null>(null)
  const [countdown, setCountdown] = useState(0)
  const [records, setRecords] = useState<AttRecord[]>([])
  const [creating, setCreating] = useState(false)

  // Recompute start/end from the selected lesson-hour range.
  const applyJam = (jamKe: number, jamKeAkhir: number) => {
    setForm((f) => {
      if (!jamKe) return { ...f, jamKe, jamKeAkhir }
      const startSlot = JAM_PELAJARAN.find((j) => j.ke === jamKe)
      const endKe = jamKeAkhir && jamKeAkhir >= jamKe ? jamKeAkhir : jamKe
      const endSlot = JAM_PELAJARAN.find((j) => j.ke === endKe)
      return { ...f, jamKe, jamKeAkhir, start: startSlot?.start ?? f.start, end: endSlot?.end ?? f.end }
    })
  }
  const pickCourse = (id: string) => setForm((f) => ({ ...f, courseId: id, mapel: courses.find((c) => c.id === id)?.name || f.mapel }))

  const create = async () => {
    if (!form.kelas.trim()) { toaster.create({ description: 'Kelas wajib dipilih.', type: 'warning' }); return }
    setCreating(true)
    try {
      const res = await attendanceClient.createSession({
        courseId: form.courseId, mapel: form.mapel, kelas: form.kelas, ruang: form.ruang, tanggal: form.tanggal,
        jamKe: form.jamKe, jamKeAkhir: form.jamKeAkhir, startTime: form.start, endTime: form.end,
      })
      setSession(res.session ?? null)
      setToken(res.token ?? null)
      setCountdown(res.token?.expiresInSeconds ?? 60)
      setRecords([])
    } catch (e) { toaster.create({ description: errMsg(e), type: 'error' }) }
    finally { setCreating(false) }
  }
  const regen = useCallback(async () => {
    if (!session) return
    try {
      const res = await attendanceClient.regenerateToken({ sessionId: session.id })
      setToken(res.token ?? null)
      setCountdown(res.token?.expiresInSeconds ?? 60)
    } catch (e) { toaster.create({ description: errMsg(e), type: 'error' }) }
  }, [session])

  // Countdown; auto-regenerate when it hits 0 so the barcode stays live.
  useEffect(() => {
    if (!session) return
    const t = setInterval(() => setCountdown((c) => (c <= 1 ? (regen(), 0) : c - 1)), 1000)
    return () => clearInterval(t)
  }, [session, regen])

  // Poll who has checked in.
  useEffect(() => {
    if (!session) return
    let stop = false
    const load = () => attendanceClient.getSessionRecords({ sessionId: session.id })
      .then((r) => { if (!stop) setRecords(r.records) }).catch(() => {})
    load()
    const t = setInterval(load, 4000)
    return () => { stop = true; clearInterval(t) }
  }, [session])

  return (
    <Stack gap="16px">
      <Flex gap="4px" borderBottom="2px solid" borderColor="gray.200">
        {([['buat', 'Buat Absensi'], ['perhari', 'Per Hari'], ['hasil', 'Hasil Absensi'], ['export', 'Export']] as const).map(([k, label]) => (
          <Button key={k} variant="ghost" borderRadius={0} borderBottom="2px solid"
            borderColor={tab === k ? COLORS.primary : 'transparent'} color={tab === k ? COLORS.primary : 'gray.600'}
            onClick={() => setTab(k)}>{label}</Button>
        ))}
      </Flex>

      {tab === 'buat' && (
        <SimpleGrid columns={{ base: 1, lg: 2 }} gap="16px">
          <Card.Root><Card.Body>
            <Heading size="sm" mb="12px">Buat Sesi Absensi</Heading>
            <Stack gap="10px">
              <Flex gap="10px" wrap="wrap">
                <Field.Root maxW="180px"><Field.Label>Tanggal</Field.Label>
                  <Input type="date" value={form.tanggal} onChange={(e) => setForm({ ...form, tanggal: e.target.value })} />
                </Field.Root>
                <Field.Root maxW="140px"><Field.Label>Hari</Field.Label>
                  <Input value={hariOf(form.tanggal)} readOnly bg={COLORS.bg} />
                </Field.Root>
              </Flex>
              <Field.Root><Field.Label>Mata Pelajaran</Field.Label>
                <NativeSelect.Root>
                  <NativeSelect.Field value={form.courseId} onChange={(e) => pickCourse(e.target.value)}>
                    <option value="">— Pilih Mapel —</option>
                    {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
              </Field.Root>
              <Field.Root><Field.Label>Kelas</Field.Label>
                <NativeSelect.Root>
                  <NativeSelect.Field value={form.kelas} onChange={(e) => setForm({ ...form, kelas: e.target.value })}>
                    <option value="">— Pilih Kelas —</option>
                    {classNames.map((n) => <option key={n} value={n}>{n}</option>)}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
              </Field.Root>
              <Flex gap="10px" wrap="wrap" align="flex-end">
                <Field.Root maxW="120px"><Field.Label>Jam ke</Field.Label>
                  <NativeSelect.Root>
                    <NativeSelect.Field value={String(form.jamKe)} onChange={(e) => applyJam(Number(e.target.value), form.jamKeAkhir)}>
                      <option value="0">Manual</option>
                      {JAM_PELAJARAN.map((j) => <option key={j.ke} value={j.ke}>Jam ke-{j.ke}</option>)}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </Field.Root>
                <Field.Root maxW="120px"><Field.Label>s/d Jam ke</Field.Label>
                  <NativeSelect.Root disabled={!form.jamKe}>
                    <NativeSelect.Field value={String(form.jamKeAkhir)} onChange={(e) => applyJam(form.jamKe, Number(e.target.value))}>
                      <option value="0">— sama —</option>
                      {JAM_PELAJARAN.filter((j) => j.ke > form.jamKe).map((j) => <option key={j.ke} value={j.ke}>Jam ke-{j.ke}</option>)}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </Field.Root>
                <Field.Root maxW="110px"><Field.Label>Mulai</Field.Label>
                  <Input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value, jamKe: 0, jamKeAkhir: 0 })} />
                </Field.Root>
                <Field.Root maxW="110px"><Field.Label>Selesai</Field.Label>
                  <Input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value, jamKe: 0, jamKeAkhir: 0 })} />
                </Field.Root>
              </Flex>
              <Field.Root><Field.Label>Ruang</Field.Label>
                <Input value={form.ruang} onChange={(e) => setForm({ ...form, ruang: e.target.value })} placeholder="mis. Lab 1 / Ruang 12 (opsional)" />
              </Field.Root>
              <Button bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} loading={creating} onClick={create}>
                <Icon as={LuQrCode} /> Tampilkan Barcode
              </Button>
            </Stack>
          </Card.Body></Card.Root>

          <Card.Root><Card.Body>
            {!session || !token ? (
              <Flex direction="column" align="center" justify="center" h="full" minH="240px" color={COLORS.muted} gap="8px">
                <Icon as={LuQrCode} boxSize="40px" />
                <Text fontSize="14px">Isi form lalu tampilkan barcode.</Text>
              </Flex>
            ) : (
              <Stack gap="10px" align="center">
                <Text fontSize="13px" color={COLORS.muted}>{session.mapel || '—'} · {session.kelas}{session.ruang ? ` · ${session.ruang}` : ''} · {jamLabel(session)}</Text>
                <QRImage text={token.token} />
                <Text fontSize="12px" color={COLORS.muted}>atau ketik kode:</Text>
                <Text fontSize="30px" fontWeight="900" letterSpacing="4px" fontFamily="mono" color={COLORS.text}>{token.code}</Text>
                <Flex align="center" gap="8px">
                  <Icon as={LuClock} color={countdown <= 10 ? COLORS.danger : COLORS.warning} />
                  <Text fontWeight="700" color={countdown <= 10 ? COLORS.danger : COLORS.text}>Berlaku {countdown} detik</Text>
                  <Button size="xs" variant="outline" onClick={regen}><Icon as={LuRefreshCw} /> Regenerate</Button>
                </Flex>
                <Box w="full" mt="6px">
                  <Flex align="center" gap="6px" mb="6px"><Icon as={LuUsers} color={COLORS.success} /><Text fontSize="13px" fontWeight="700">Sudah absen ({records.length})</Text></Flex>
                  {records.length === 0 ? <Text fontSize="12px" color={COLORS.muted}>Belum ada yang absen.</Text> : (
                    <Stack gap="4px" maxH="160px" overflowY="auto">
                      {records.map((r) => (
                        <Flex key={r.studentId} justify="space-between" fontSize="13px" borderBottom="1px solid" borderColor={COLORS.border} pb="3px">
                          <Text>{r.studentName}{r.studentKelas ? ` · ${r.studentKelas}` : ''}</Text>
                          <StatusBadge s={r.status} />
                        </Flex>
                      ))}
                    </Stack>
                  )}
                </Box>
              </Stack>
            )}
          </Card.Body></Card.Root>
        </SimpleGrid>
      )}

      {tab === 'perhari' && <PerHariAbsensi />}
      {tab === 'hasil' && <HasilAbsensi />}
      {tab === 'export' && <ExportAbsensi />}
    </Stack>
  )
}

// ── Per-day recap grid ──
type DayGrid = Awaited<ReturnType<typeof attendanceClient.dayGrid>>

// A clickable status badge that lets the teacher change a cell's status.
function CellStatus({ status, onSet }: { status: string; onSet: (s: string) => void }) {
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <Box as="button" cursor="pointer"><StatusBadge s={status} /></Box>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content>
            {STATUSES.map((x) => (
              <Menu.Item key={x.v} value={x.v} onClick={() => onSet(x.v)}><StatusBadge s={x.v} /></Menu.Item>
            ))}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  )
}

function PerHariAbsensi() {
  const [tanggal, setTanggal] = useState(todayStr())
  const [classNames, setClassNames] = useState<string[]>([])
  const [kelas, setKelas] = useState('')
  const [mode, setMode] = useState<'grid' | 'ringkas'>('grid')
  const [data, setData] = useState<DayGrid | null>(null)
  const [loading, setLoading] = useState(false)
  const { parentOf, schoolName } = useNotifData()
  const [notif, setNotif] = useState<{ open: boolean; targets: NotifTarget[]; judul: string }>({ open: false, targets: [], judul: '' })

  useEffect(() => { classClient.listClasses({}).then((r) => setClassNames(r.classes.map((c) => c.name))).catch(() => {}) }, [])

  const load = useCallback(async () => {
    if (!kelas) { setData(null); return }
    setLoading(true)
    try { setData(await attendanceClient.dayGrid({ tanggal, kelas })) }
    catch (e) { toaster.create({ description: errMsg(e), type: 'error' }); setData(null) }
    finally { setLoading(false) }
  }, [tanggal, kelas])
  useEffect(() => { load() }, [load])

  // status of (session,student): recorded, else 'alpa'.
  const cellMap = useMemo(() => {
    const m = new Map<string, string>()
    data?.cells.forEach((c) => m.set(`${c.sessionId}|${c.studentId}`, c.status))
    return m
  }, [data])
  const statusOf = (sessionId: string, studentId: string) => cellMap.get(`${sessionId}|${studentId}`) ?? 'alpa'

  const setStatus = async (sessionId: string, studentId: string, status: string) => {
    try { await attendanceClient.setRecordStatus({ sessionId, studentId, status }); await load() }
    catch (e) { toaster.create({ description: errMsg(e), type: 'error' }) }
  }

  // Per-student daily absence: count non-hadir statuses across sessions.
  const absentCounts = (studentId: string) => {
    const c: Record<string, number> = { alpa: 0, sakit: 0, izin: 0 }
    data?.sessions.forEach((s) => { const v = statusOf(s.id, studentId); if (ABSENT.has(v)) c[v]++ })
    return c
  }
  const isAbsent = (studentId: string) => {
    const c = absentCounts(studentId)
    return c.alpa + c.sakit + c.izin > 0
  }
  const buildDayTarget = (st: { id: string; name: string }): NotifTarget => {
    const c = absentCounts(st.id)
    const rincian = STATUSES.filter((x) => ABSENT.has(x.v) && c[x.v] > 0).map((x) => `${x.label} ${c[x.v]}×`).join(', ')
    const p = parentOf(st.id)
    return {
      studentId: st.id, nama: st.name, kelas,
      statusLabel: 'Tidak Hadir', statusColor: 'red',
      phone: p?.phone ?? '', namaOrtu: p?.nama ?? '',
      message: composeAbsenNotif({
        namaSiswa: st.name, kelas, tanggal,
        detail: `tercatat tidak hadir: ${rincian}`,
        namaSekolah: schoolName,
      }),
    }
  }
  const absentStudents = useMemo(
    () => (data?.students ?? []).filter((st) => isAbsent(st.id)),
    [data, cellMap], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const notifyOneDay = (st: { id: string; name: string }) => setNotif({ open: true, targets: [buildDayTarget(st)], judul: 'Notifikasi ke Orang Tua' })
  const notifyBulkDay = () => setNotif({ open: true, targets: absentStudents.map(buildDayTarget), judul: 'Notifikasi Siswa Tidak Hadir' })

  // Daily report: per student, status per session + summary counts.
  const download = () => {
    if (!data || data.students.length === 0) return
    const label = (st: string) => STATUSES.find((x) => x.v === st)?.label ?? st
    const sessLabels = data.sessions.map((s) =>
      `${jamLabel({ jamKe: s.jamKe, jamKeAkhir: s.jamKeAkhir, startTime: s.startTime, endTime: s.endTime })}${s.mapel ? ' ' + s.mapel : ''}`)
    const head = ['Nama', ...sessLabels, ...STATUSES.map((x) => x.label)]
    const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
    const lines = data.students.map((st) => {
      const counts: Record<string, number> = { hadir: 0, telat: 0, sakit: 0, izin: 0, alpa: 0 }
      const perSess = data.sessions.map((s) => { const v = statusOf(s.id, st.id); counts[v]++; return label(v) })
      return [st.name, ...perSess, ...STATUSES.map((x) => counts[x.v])]
    })
    const csv = [head, ...lines].map((row) => row.map(cell).join(',')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `laporan_absen_${kelas}_${tanggal}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <Card.Root><Card.Body>
      <Flex gap="10px" wrap="wrap" align="flex-end" mb="12px">
        <Field.Root maxW="170px"><Field.Label>Tanggal</Field.Label>
          <Input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
        </Field.Root>
        <Field.Root maxW="140px"><Field.Label>Hari</Field.Label>
          <Input value={hariOf(tanggal)} readOnly bg={COLORS.bg} />
        </Field.Root>
        <Field.Root maxW="170px"><Field.Label>Kelas</Field.Label>
          <NativeSelect.Root>
            <NativeSelect.Field value={kelas} onChange={(e) => setKelas(e.target.value)}>
              <option value="">— Pilih Kelas —</option>
              {classNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </Field.Root>
        <Flex gap="0" border="1px solid" borderColor={COLORS.border} borderRadius="8px" overflow="hidden">
          {(['grid', 'ringkas'] as const).map((m) => (
            <Button key={m} size="sm" variant={mode === m ? 'solid' : 'ghost'} borderRadius="0"
              bg={mode === m ? COLORS.primary : 'transparent'} color={mode === m ? 'white' : COLORS.muted}
              _hover={{ bg: mode === m ? COLORS.primaryDark : COLORS.bg }} onClick={() => setMode(m)}>
              {m === 'grid' ? 'Grid' : 'Ringkas'}
            </Button>
          ))}
        </Flex>
        {data && data.students.length > 0 && (
          <Button bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} onClick={download}>
            <Icon as={LuDownload} /> Unduh Laporan CSV
          </Button>
        )}
        {absentStudents.length > 0 && (
          <Button size="sm" colorPalette="green" variant="outline" onClick={notifyBulkDay}>
            <Icon as={LuMessageCircle} /> Notifikasi tidak hadir ({absentStudents.length})
          </Button>
        )}
      </Flex>

      {loading ? <Flex align="center" gap="8px" color={COLORS.muted} py="20px"><Spinner size="sm" /> Memuat…</Flex>
        : !kelas ? <Text fontSize="13px" color={COLORS.muted}>Pilih kelas untuk melihat rekap harian.</Text>
        : !data || data.students.length === 0 ? <Text fontSize="13px" color={COLORS.muted}>Tidak ada siswa/sesi untuk filter ini.</Text>
        : mode === 'grid' ? (
          <Box overflowX="auto"><Table.Root size="sm">
            <Table.Header><Table.Row>
              <Table.ColumnHeader position="sticky" left={0} bg={COLORS.surface}>Siswa</Table.ColumnHeader>
              {data.sessions.map((s) => (
                <Table.ColumnHeader key={s.id} whiteSpace="nowrap">
                  <Text fontSize="11px">{jamLabel({ jamKe: s.jamKe, jamKeAkhir: s.jamKeAkhir, startTime: s.startTime, endTime: s.endTime })}</Text>
                  <Text fontSize="11px" color={COLORS.muted}>{s.mapel || '—'}{s.ruang ? ` · ${s.ruang}` : ''}</Text>
                </Table.ColumnHeader>
              ))}
              <Table.ColumnHeader textAlign="center">Notif</Table.ColumnHeader>
            </Table.Row></Table.Header>
            <Table.Body>
              {data.students.map((st) => (
                <Table.Row key={st.id}>
                  <Table.Cell fontWeight="medium" position="sticky" left={0} bg={COLORS.surface}>{st.name}</Table.Cell>
                  {data.sessions.map((s) => (
                    <Table.Cell key={s.id}><CellStatus status={statusOf(s.id, st.id)} onSet={(v) => setStatus(s.id, st.id, v)} /></Table.Cell>
                  ))}
                  <Table.Cell textAlign="center">
                    {isAbsent(st.id) ? (
                      <IconButton size="xs" variant="outline" colorPalette="green"
                        aria-label="Notifikasi orang tua" title={parentOf(st.id) ? 'Notifikasi orang tua via WhatsApp' : 'No. HP orang tua belum ada'}
                        disabled={!parentOf(st.id)} onClick={() => notifyOneDay(st)}>
                        <Icon as={LuMessageCircle} />
                      </IconButton>
                    ) : null}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root></Box>
        ) : (
          <Box overflowX="auto"><Table.Root size="sm">
            <Table.Header><Table.Row>
              <Table.ColumnHeader>Siswa</Table.ColumnHeader>
              {STATUSES.map((x) => <Table.ColumnHeader key={x.v}>{x.label}</Table.ColumnHeader>)}
              <Table.ColumnHeader textAlign="center">Notif</Table.ColumnHeader>
            </Table.Row></Table.Header>
            <Table.Body>
              {data.students.map((st) => {
                const counts: Record<string, number> = { hadir: 0, telat: 0, sakit: 0, izin: 0, alpa: 0 }
                data.sessions.forEach((s) => { counts[statusOf(s.id, st.id)]++ })
                return (
                  <Table.Row key={st.id}>
                    <Table.Cell fontWeight="medium">{st.name}</Table.Cell>
                    {STATUSES.map((x) => <Table.Cell key={x.v}>{counts[x.v]}</Table.Cell>)}
                    <Table.Cell textAlign="center">
                      {isAbsent(st.id) ? (
                        <IconButton size="xs" variant="outline" colorPalette="green"
                          aria-label="Notifikasi orang tua" title={parentOf(st.id) ? 'Notifikasi orang tua via WhatsApp' : 'No. HP orang tua belum ada'}
                          disabled={!parentOf(st.id)} onClick={() => notifyOneDay(st)}>
                          <Icon as={LuMessageCircle} />
                        </IconButton>
                      ) : null}
                    </Table.Cell>
                  </Table.Row>
                )
              })}
            </Table.Body>
          </Table.Root></Box>
        )}
      <NotifikasiAbsenDialog open={notif.open} onClose={() => setNotif((n) => ({ ...n, open: false }))} targets={notif.targets} judul={notif.judul} />
    </Card.Body></Card.Root>
  )
}

// Type of a row returned by ExportAttendance.
type ExportRow = Awaited<ReturnType<typeof attendanceClient.exportAttendance>>['rows'][number]

function ExportAbsensi() {
  const [tahunOpts, setTahunOpts] = useState<string[]>([])
  const [classNames, setClassNames] = useState<string[]>([])
  const [jurusans, setJurusans] = useState<string[]>([])
  const [tahun, setTahun] = useState('')
  const [semester, setSemester] = useState('ganjil')
  const [by, setBy] = useState<'kelas' | 'jurusan'>('kelas')
  const [val, setVal] = useState('')
  const [rows, setRows] = useState<ExportRow[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    schoolClient.listSemesters({}).then((r) => {
      setTahunOpts(Array.from(new Set(r.semesters.map((s) => s.tahunAjaran))))
      const act = r.semesters.find((s) => s.isActive)
      if (act) { setTahun(act.tahunAjaran); setSemester(act.semester) }
      else if (r.semesters[0]) setTahun(r.semesters[0].tahunAjaran)
    }).catch(() => {})
    classClient.listClasses({}).then((r) => setClassNames(r.classes.map((c) => c.name))).catch(() => {})
    jurusanClient.listJurusans({}).then((r) => setJurusans(r.jurusans.map((j) => j.name))).catch(() => {})
  }, [])

  const options = by === 'kelas' ? classNames : jurusans
  // Indonesian school year: e.g. "2026/2027" → Ganjil = Jul–Dec 2026, Genap = Jan–Jun 2027.
  const range = () => {
    const [p0, p1] = (tahun || '').split('/')
    return semester === 'ganjil'
      ? { start: `${p0}-07-01`, end: `${p0}-12-31` }
      : { start: `${p1}-01-01`, end: `${p1}-06-30` }
  }
  const show = async () => {
    if (!tahun || !val) { toaster.create({ description: 'Pilih tahun ajaran & kelas/jurusan.', type: 'warning' }); return }
    setLoading(true)
    try {
      const { start, end } = range()
      const res = await attendanceClient.exportAttendance(by === 'kelas' ? { start, end, kelas: val } : { start, end, jurusan: val })
      setRows(res.rows)
      if (res.rows.length === 0) toaster.create({ description: 'Tidak ada data untuk filter ini.', type: 'info' })
    } catch (e) { toaster.create({ description: errMsg(e), type: 'error' }) }
    finally { setLoading(false) }
  }
  const download = () => {
    if (!rows || rows.length === 0) return
    const head = ['Nama', 'Kelas', 'Jurusan', 'Hadir', 'Telat', 'Sakit', 'Izin', 'Alpa', 'Total']
    const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
    const csv = [head, ...rows.map((r) => [r.studentName, r.kelas, r.jurusan, r.hadir, r.telat, r.sakit, r.izin, r.alpa, r.total])]
      .map((row) => row.map(cell).join(',')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `absensi_${by}_${val}_${semester}_${(tahun || '').replace('/', '-')}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <Card.Root><Card.Body>
      <Heading size="sm" mb="12px">Export Rekap Absensi</Heading>
      <Flex gap="10px" wrap="wrap" align="flex-end" mb="12px">
        <Field.Root maxW="150px"><Field.Label>Tahun Ajaran</Field.Label>
          <NativeSelect.Root>
            <NativeSelect.Field value={tahun} onChange={(e) => setTahun(e.target.value)}>
              <option value="">— Pilih —</option>
              {tahunOpts.map((t) => <option key={t} value={t}>{t}</option>)}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </Field.Root>
        <Field.Root maxW="130px"><Field.Label>Semester</Field.Label>
          <NativeSelect.Root>
            <NativeSelect.Field value={semester} onChange={(e) => setSemester(e.target.value)}>
              <option value="ganjil">Ganjil</option>
              <option value="genap">Genap</option>
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </Field.Root>
        <Field.Root maxW="130px"><Field.Label>Berdasarkan</Field.Label>
          <NativeSelect.Root>
            <NativeSelect.Field value={by} onChange={(e) => { setBy(e.target.value as 'kelas' | 'jurusan'); setVal(''); setRows(null) }}>
              <option value="kelas">Kelas</option>
              <option value="jurusan">Jurusan</option>
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </Field.Root>
        <Field.Root maxW="180px"><Field.Label>{by === 'kelas' ? 'Kelas' : 'Jurusan'}</Field.Label>
          <NativeSelect.Root>
            <NativeSelect.Field value={val} onChange={(e) => setVal(e.target.value)}>
              <option value="">— Pilih —</option>
              {options.map((o) => <option key={o} value={o}>{o}</option>)}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </Field.Root>
        <Button variant="outline" loading={loading} onClick={show}>Tampilkan</Button>
        {rows && rows.length > 0 && (
          <Button bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} onClick={download}>
            <Icon as={LuDownload} /> Unduh CSV
          </Button>
        )}
      </Flex>
      {rows && rows.length > 0 && (
        <Box overflowX="auto"><Table.Root size="sm">
          <Table.Header><Table.Row>
            <Table.ColumnHeader>Nama</Table.ColumnHeader><Table.ColumnHeader>Kelas</Table.ColumnHeader>
            <Table.ColumnHeader>Jurusan</Table.ColumnHeader>
            <Table.ColumnHeader>Hadir</Table.ColumnHeader><Table.ColumnHeader>Telat</Table.ColumnHeader><Table.ColumnHeader>Sakit</Table.ColumnHeader>
            <Table.ColumnHeader>Izin</Table.ColumnHeader><Table.ColumnHeader>Alpa</Table.ColumnHeader>
            <Table.ColumnHeader>Total</Table.ColumnHeader>
          </Table.Row></Table.Header>
          <Table.Body>
            {rows.map((r, i) => (
              <Table.Row key={i}>
                <Table.Cell fontWeight="medium">{r.studentName}</Table.Cell>
                <Table.Cell>{r.kelas}</Table.Cell><Table.Cell>{r.jurusan}</Table.Cell>
                <Table.Cell>{r.hadir}</Table.Cell><Table.Cell>{r.telat}</Table.Cell><Table.Cell>{r.sakit}</Table.Cell>
                <Table.Cell>{r.izin}</Table.Cell><Table.Cell>{r.alpa}</Table.Cell>
                <Table.Cell fontWeight="700">{r.total}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root></Box>
      )}
    </Card.Body></Card.Root>
  )
}

function HasilAbsensi() {
  const [tanggal, setTanggal] = useState(todayStr())
  const [sessions, setSessions] = useState<AttSession[]>([])
  const [sel, setSel] = useState<AttSession | null>(null)
  const [records, setRecords] = useState<AttRecord[]>([])
  const [students, setStudents] = useState<User[]>([])
  const [addStudent, setAddStudent] = useState('')
  const [addStatus, setAddStatus] = useState('izin')
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const { parentOf, schoolName } = useNotifData()
  const [notif, setNotif] = useState<{ open: boolean; targets: NotifTarget[]; judul: string }>({ open: false, targets: [], judul: '' })

  const load = useCallback(() => {
    attendanceClient.listSessions({ tanggal }).then((r) => setSessions(r.sessions)).catch(() => setSessions([]))
  }, [tanggal])
  useEffect(() => { load() }, [load])
  useEffect(() => { userClient.listUsers({ roleFilter: Role.STUDENT, pagination: { page: 1, pageSize: 500 } }).then((r) => setStudents(r.users)).catch(() => setStudents([])) }, [])

  const openSession = async (s: AttSession) => {
    setSel(s)
    try { const r = await attendanceClient.getSessionRecords({ sessionId: s.id }); setRecords(r.records) } catch { setRecords([]) }
  }
  const setStatus = async (studentId: string, status: string) => {
    if (!sel) return
    try {
      await attendanceClient.setRecordStatus({ sessionId: sel.id, studentId, status })
      const r = await attendanceClient.getSessionRecords({ sessionId: sel.id }); setRecords(r.records)
      load()
    } catch (e) { toaster.create({ description: errMsg(e), type: 'error' }) }
  }
  const doAdd = async () => {
    if (!addStudent) return
    await setStatus(addStudent, addStatus)
    setAddStudent('')
  }
  const askDelete = (s: AttSession) => setConfirm({
    title: 'Hapus Sesi Absensi',
    message: `Hapus sesi "${s.mapel || 'Absensi'} · ${s.kelas}" (${s.tanggal})? Semua data absen di sesi ini ikut terhapus.`,
    variant: 'danger', confirmLabel: 'Ya, Hapus',
    onConfirm: async () => {
      try {
        await attendanceClient.deleteSession({ sessionId: s.id })
        if (sel?.id === s.id) { setSel(null); setRecords([]) }
        load()
      } catch (e) { toaster.create({ description: errMsg(e), type: 'error' }) }
    },
  })
  const recordedIds = useMemo(() => new Set(records.map((r) => r.studentId)), [records])

  // Build a notification target for a record in the current session.
  const buildTarget = useCallback((r: AttRecord): NotifTarget => {
    const p = parentOf(r.studentId)
    const m = statusMeta(r.status)
    const kelas = r.studentKelas || (sel?.kelas ?? '')
    return {
      studentId: r.studentId, nama: r.studentName, kelas,
      statusLabel: m?.label ?? r.status, statusColor: m?.color ?? 'gray',
      phone: p?.phone ?? '', namaOrtu: p?.nama ?? '',
      message: composeAbsenNotif({
        namaSiswa: r.studentName, kelas, tanggal: sel?.tanggal ?? todayStr(),
        detail: `tercatat *${(m?.label ?? r.status).toUpperCase()}* pada mata pelajaran ${sel?.mapel || '—'}`,
        namaSekolah: schoolName,
      }),
    }
  }, [parentOf, schoolName, sel])
  const absentRecords = useMemo(() => records.filter((r) => ABSENT.has(r.status)), [records])
  const notifyOne = (r: AttRecord) => setNotif({ open: true, targets: [buildTarget(r)], judul: 'Notifikasi ke Orang Tua' })
  const notifyBulk = () => setNotif({ open: true, targets: absentRecords.map(buildTarget), judul: 'Notifikasi Siswa Tidak Hadir' })

  return (
    <>
    <SimpleGrid columns={{ base: 1, lg: 2 }} gap="16px">
      <Card.Root><Card.Body>
        <Flex align="center" gap="10px" mb="10px">
          <Heading size="sm" flex="1">Sesi Absensi</Heading>
          <Input type="date" size="sm" maxW="170px" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
        </Flex>
        <Box overflowX="auto"><Table.Root size="sm">
          <Table.Header><Table.Row>
            <Table.ColumnHeader>Jam</Table.ColumnHeader><Table.ColumnHeader>Mapel</Table.ColumnHeader>
            <Table.ColumnHeader>Kelas / Ruang</Table.ColumnHeader><Table.ColumnHeader>Hadir</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="right">Aksi</Table.ColumnHeader>
          </Table.Row></Table.Header>
          <Table.Body>
            {sessions.length === 0 ? (
              <Table.Row><Table.Cell colSpan={5} textAlign="center" color={COLORS.muted}>Tidak ada sesi</Table.Cell></Table.Row>
            ) : sessions.map((s) => (
              <Table.Row key={s.id} cursor="pointer" bg={sel?.id === s.id ? COLORS.primaryTint : undefined} _hover={{ bg: 'gray.50' }} onClick={() => openSession(s)}>
                <Table.Cell fontSize="12px">{jamLabel(s)}</Table.Cell>
                <Table.Cell>{s.mapel || '—'}</Table.Cell>
                <Table.Cell><Badge colorPalette="blue">{s.kelas}</Badge>{s.ruang ? <Text as="span" fontSize="11px" color={COLORS.muted}> · {s.ruang}</Text> : null}</Table.Cell>
                <Table.Cell>{s.hadirCount}</Table.Cell>
                <Table.Cell textAlign="right" onClick={(e) => e.stopPropagation()}>
                  <IconButton aria-label="Hapus sesi" title="Hapus sesi" size="xs" variant="ghost" colorPalette="red" onClick={() => askDelete(s)}>
                    <Icon as={LuTrash2} />
                  </IconButton>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root></Box>
      </Card.Body></Card.Root>

      <Card.Root><Card.Body>
        {!sel ? (
          <Flex align="center" justify="center" minH="200px" color={COLORS.muted}><Text fontSize="14px">Pilih sesi untuk melihat & mengatur status.</Text></Flex>
        ) : (
          <Stack gap="10px">
            <Flex align="flex-start" gap="10px" wrap="wrap">
              <Box flex="1" minW="200px">
                <Heading size="sm">{sel.mapel || '—'} · {sel.kelas}{sel.ruang ? ` · ${sel.ruang}` : ''}</Heading>
                <Text fontSize="12px" color={COLORS.muted}>{hariOf(sel.tanggal)}, {sel.tanggal} · {jamLabel(sel)}</Text>
              </Box>
              {absentRecords.length > 0 && (
                <Button size="sm" colorPalette="green" variant="outline" onClick={notifyBulk}>
                  <Icon as={LuMessageCircle} /> Notifikasi tidak hadir ({absentRecords.length})
                </Button>
              )}
            </Flex>
            <Box overflowX="auto"><Table.Root size="sm">
              <Table.Header><Table.Row>
                <Table.ColumnHeader>Siswa</Table.ColumnHeader><Table.ColumnHeader>Kelas</Table.ColumnHeader><Table.ColumnHeader>Status</Table.ColumnHeader><Table.ColumnHeader textAlign="right">Notifikasi</Table.ColumnHeader>
              </Table.Row></Table.Header>
              <Table.Body>
                {records.length === 0 ? (
                  <Table.Row><Table.Cell colSpan={4} textAlign="center" color={COLORS.muted}>Belum ada</Table.Cell></Table.Row>
                ) : records.map((r) => (
                  <Table.Row key={r.studentId}>
                    <Table.Cell fontWeight="medium">{r.studentName}</Table.Cell>
                    <Table.Cell>{r.studentKelas || '—'}</Table.Cell>
                    <Table.Cell>
                      <NativeSelect.Root size="xs" width="auto">
                        <NativeSelect.Field value={r.status} onChange={(e) => setStatus(r.studentId, e.target.value)}>
                          {STATUSES.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}
                        </NativeSelect.Field>
                        <NativeSelect.Indicator />
                      </NativeSelect.Root>
                    </Table.Cell>
                    <Table.Cell textAlign="right">
                      {ABSENT.has(r.status) ? (
                        <IconButton size="xs" variant="outline" colorPalette="green"
                          aria-label="Notifikasi orang tua" title={parentOf(r.studentId) ? 'Notifikasi orang tua via WhatsApp' : 'No. HP orang tua belum ada'}
                          disabled={!parentOf(r.studentId)} onClick={() => notifyOne(r)}>
                          <Icon as={LuMessageCircle} />
                        </IconButton>
                      ) : null}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root></Box>

            <Box borderTop="1px solid" borderColor={COLORS.border} pt="10px">
              <Text fontSize="12px" fontWeight="700" mb="6px">Tandai siswa lain (Sakit/Izin/Alpa)</Text>
              <Flex gap="6px" wrap="wrap" align="flex-end">
                <NativeSelect.Root size="sm" maxW="220px">
                  <NativeSelect.Field value={addStudent} onChange={(e) => setAddStudent(e.target.value)}>
                    <option value="">— Pilih siswa —</option>
                    {students.filter((u) => u.kelas === sel.kelas && !recordedIds.has(u.id)).map((u) => (
                      <option key={u.id} value={u.id}>{u.fullName || u.username}</option>
                    ))}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
                <NativeSelect.Root size="sm" maxW="120px">
                  <NativeSelect.Field value={addStatus} onChange={(e) => setAddStatus(e.target.value)}>
                    {STATUSES.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
                <Button size="sm" variant="outline" onClick={doAdd}><Icon as={LuPlus} /> Tandai</Button>
              </Flex>
            </Box>
          </Stack>
        )}
      </Card.Body></Card.Root>
    </SimpleGrid>
    <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    <NotifikasiAbsenDialog open={notif.open} onClose={() => setNotif((n) => ({ ...n, open: false }))} targets={notif.targets} judul={notif.judul} />
    </>
  )
}

// ───────────────────────── Student ─────────────────────────
function StudentAbsensi() {
  const [today, setToday] = useState<MyTodayResponse | null>(null)
  const [code, setCode] = useState('')
  const [scanning, setScanning] = useState(false)
  const [busy, setBusy] = useState(false)
  const scannerRef = useRef<Html5Qrcode | null>(null)

  const loadToday = useCallback(() => {
    attendanceClient.myToday({ tanggal: todayStr() }).then(setToday).catch(() => setToday(null))
  }, [])
  useEffect(() => { loadToday() }, [loadToday])

  const handleResult = (already: boolean, mapel: string) => {
    toaster.create({
      description: already ? `Kamu sudah absen di sesi ${mapel || 'ini'}` : `Sudah absen ✓ Hadir${mapel ? ` · ${mapel}` : ''}`,
      type: already ? 'info' : 'success',
    })
    loadToday()
  }
  const submit = async (payload: { token?: string; code?: string }) => {
    setBusy(true)
    try {
      const res = await attendanceClient.scan(payload)
      handleResult(res.already, res.session?.mapel ?? '')
      setCode('')
    } catch (e) { toaster.create({ description: errMsg(e), type: 'error' }) }
    finally { setBusy(false) }
  }

  const stopScan = useCallback(async () => {
    const s = scannerRef.current
    scannerRef.current = null
    if (s) { try { await s.stop() } catch { /* ignore */ } try { s.clear() } catch { /* ignore */ } }
    setScanning(false)
  }, [])
  const startScan = async () => {
    setScanning(true)
    try {
      const inst = new Html5Qrcode('abs-scanner')
      scannerRef.current = inst
      await inst.start({ facingMode: 'environment' }, { fps: 10, qrbox: 240 }, (decoded) => {
        stopScan(); submit({ token: decoded })
      }, () => {})
    } catch {
      toaster.create({ description: 'Kamera tidak tersedia (butuh HTTPS). Gunakan kode.', type: 'warning' })
      await stopScan()
    }
  }
  useEffect(() => () => { void stopScan() }, [stopScan])

  return (
    <SimpleGrid columns={{ base: 1, lg: 2 }} gap="16px">
      <Card.Root><Card.Body>
        <Heading size="sm" mb="10px">Absen Sekarang</Heading>
        <Box id="abs-scanner" display={scanning ? 'block' : 'none'} borderRadius="10px" overflow="hidden" mb="10px" />
        <Stack gap="10px">
          {!scanning
            ? <Button variant="outline" onClick={startScan}><Icon as={LuCamera} /> Scan QR dengan Kamera</Button>
            : <Button variant="outline" colorPalette="red" onClick={stopScan}>Berhenti Scan</Button>}
          <Text fontSize="12px" color={COLORS.muted} textAlign="center">atau ketik kode dari layar guru</Text>
          <Flex gap="8px">
            <Input value={code} textTransform="uppercase" placeholder="Kode 6 karakter" maxLength={6}
              onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === 'Enter' && code) submit({ code }) }} />
            <Button bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} loading={busy}
              disabled={!code} onClick={() => submit({ code })}>Absen</Button>
          </Flex>
        </Stack>
      </Card.Body></Card.Root>

      <Card.Root><Card.Body>
        <Heading size="sm" mb="10px">Hari Ini — {today ? `${hariOf(today.tanggal)}, ${today.tanggal}` : todayStr()}</Heading>
        <SimpleGrid columns={{ base: 3, sm: 5 }} gap="8px" mb="12px">
          {STATUSES.map((s) => {
            const n = today ? (today[s.v as 'hadir' | 'telat' | 'sakit' | 'izin' | 'alpa']) : 0
            return (
              <Box key={s.v} textAlign="center" border="1px solid" borderColor={COLORS.border} borderRadius="8px" py="10px">
                <Text fontSize="22px" fontWeight="800" color={`${s.color}.500`}>{n}</Text>
                <Text fontSize="11px" color={COLORS.muted}>{s.label}</Text>
              </Box>
            )
          })}
        </SimpleGrid>
        {!today || today.entries.length === 0 ? (
          <Text fontSize="13px" color={COLORS.muted}>Belum ada absensi hari ini.</Text>
        ) : (
          <Stack gap="6px">
            {today.entries.map((e) => (
              <Flex key={e.sessionId} justify="space-between" align="center" borderBottom="1px solid" borderColor={COLORS.border} pb="6px">
                <Box>
                  <Text fontSize="13px" fontWeight="600">{e.mapel || '—'} · {e.kelas}{e.ruang ? ` · ${e.ruang}` : ''}</Text>
                  <Text fontSize="11px" color={COLORS.muted}>{jamLabel({ jamKe: e.jamKe, jamKeAkhir: e.jamKeAkhir, startTime: e.startTime, endTime: e.endTime })}</Text>
                </Box>
                <StatusBadge s={e.status} />
              </Flex>
            ))}
          </Stack>
        )}
      </Card.Body></Card.Root>
    </SimpleGrid>
  )
}

export default function AbsensiPage() {
  const { user } = useAuth()
  const isTeacher = user?.role === Role.TEACHER || user?.role === Role.ADMIN
  return (
    <AppLayout title="Absensi">
      <Flex align="center" gap="10px" mb="16px">
        <Icon as={LuCircleCheck} boxSize="24px" color={COLORS.primary} />
        <Heading size="lg">Absensi</Heading>
      </Flex>
      {isTeacher ? <TeacherAbsensi /> : <StudentAbsensi />}
    </AppLayout>
  )
}
