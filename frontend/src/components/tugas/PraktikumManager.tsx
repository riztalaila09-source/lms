import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Box, Button, Dialog, Flex, Icon, Input, NativeSelect, Stack, Table, Text, Textarea } from '@chakra-ui/react'
import { LuUsers, LuShuffle, LuSave, LuClipboardCheck, LuCrown } from 'react-icons/lu'
import type { Assignment, GroupSubmission } from '@/gen/assignment/v1/assignment_pb'
import { assignmentClient, courseClient } from '@/lib/client'
import { decodeLinks } from '@/components/MaterialFormDialog'
import { COLORS } from '@/theme/tokens'
import { toaster } from '@/components/ui/toaster'

interface Stu { id: string; name: string; kelas: string }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

/**
 * Guru: atur kelompok (manual/acak) + nilai per kelompok untuk tugas praktikum.
 * Kelompok dibuat PER KELAS — satu kelompok pasti berisi murid satu kelas
 * (mapel bisa lintas kelas). Ada filter kelas untuk menyusun tiap kelas.
 */
export default function PraktikumManager({ assignment, open, onClose }: {
  assignment: Assignment | null; open: boolean; onClose: () => void
}) {
  const [tab, setTab] = useState<'kelompok' | 'nilai'>('kelompok')
  const [students, setStudents] = useState<Stu[]>([])
  const [kelas, setKelas] = useState('')
  const [numByKelas, setNumByKelas] = useState<Record<string, number>>({})
  const [assign, setAssign] = useState<Record<string, number>>({}) // studentId -> group idx dalam kelasnya (0-based), -1 kosong
  const [leaders, setLeaders] = useState<Record<string, string>>({}) // `${kelas}#${idx}` -> studentId ketua
  const [saving, setSaving] = useState(false)
  const [subs, setSubs] = useState<GroupSubmission[]>([])
  const [grades, setGrades] = useState<Record<string, { score: number; feedback: string }>>({})

  const loadBuilder = useCallback(async () => {
    if (!assignment) return
    try {
      const [stu, grp] = await Promise.all([
        courseClient.getCourseStudents({ courseId: assignment.courseId, pagination: { page: 1, pageSize: 500 } }),
        assignmentClient.listAssignmentGroups({ assignmentId: assignment.id }),
      ])
      const list: Stu[] = stu.enrollments.map((e) => ({ id: e.student?.id ?? '', name: e.student?.fullName ?? '-', kelas: e.student?.kelas ?? '' }))
      setStudents(list)
      const kelasList = Array.from(new Set(list.map((s) => s.kelas).filter(Boolean))).sort()
      setKelas((k) => k && kelasList.includes(k) ? k : (kelasList[0] ?? ''))

      // Rekonstruksi kelompok yang sudah ada, per-kelas (nama grup diawali "<kelas> -").
      const a: Record<string, number> = {}
      const num: Record<string, number> = {}
      const ld: Record<string, string> = {}
      const perKelasCount: Record<string, number> = {}
      grp.groups.forEach((g) => {
        const gk = g.members[0]?.studentKelas ?? ''
        if (!gk) return
        const idx = perKelasCount[gk] ?? 0
        perKelasCount[gk] = idx + 1
        num[gk] = perKelasCount[gk]
        g.members.forEach((m) => { a[m.studentId] = idx })
        const leader = g.members.find((m) => m.isLeader)
        if (leader) ld[`${gk}#${idx}`] = leader.studentId
      })
      kelasList.forEach((k) => { if (num[k] === undefined) num[k] = 2 })
      setNumByKelas(num)
      setAssign(a)
      setLeaders(ld)
    } catch { /* ignore */ }
  }, [assignment])

  const loadGrades = useCallback(async () => {
    if (!assignment) return
    try {
      const r = await assignmentClient.listGroupSubmissions({ assignmentId: assignment.id })
      setSubs(r.submissions)
      const g: Record<string, { score: number; feedback: string }> = {}
      r.submissions.forEach((s) => { g[s.groupId] = { score: s.graded ? s.score : 0, feedback: s.feedback } })
      setGrades(g)
    } catch { /* ignore */ }
  }, [assignment])

  useEffect(() => { if (open) { setTab('kelompok'); loadBuilder() } }, [open, loadBuilder])
  useEffect(() => { if (open && tab === 'nilai') loadGrades() }, [open, tab, loadGrades])

  const kelasList = useMemo(() => Array.from(new Set(students.map((s) => s.kelas).filter(Boolean))).sort(), [students])
  const classStudents = useMemo(() => students.filter((s) => s.kelas === kelas), [students, kelas])
  const numGroups = numByKelas[kelas] ?? 2
  const clampGroup = (g: number) => (g >= numGroups ? -1 : g)

  const setNumGroups = (n: number) => setNumByKelas((m) => ({ ...m, [kelas]: Math.max(1, n) }))

  const acak = () => {
    const ids = shuffle(classStudents.map((s) => s.id))
    setAssign((prev) => {
      const next = { ...prev }
      ids.forEach((id, i) => { next[id] = i % numGroups })
      return next
    })
  }
  const kosongkan = () => setAssign((prev) => {
    const next = { ...prev }
    classStudents.forEach((s) => { delete next[s.id] })
    return next
  })

  const groupsPreview = useMemo(() => {
    const arr: Stu[][] = Array.from({ length: numGroups }, () => [])
    classStudents.forEach((s) => { const g = clampGroup(assign[s.id] ?? -1); if (g >= 0) arr[g].push(s) })
    return arr
  }, [classStudents, assign, numGroups]) // eslint-disable-line react-hooks/exhaustive-deps

  const setLeader = (gi: number, studentId: string) => setLeaders((p) => ({ ...p, [`${kelas}#${gi}`]: studentId }))
  const acakKetua = () => setLeaders((prev) => {
    const next = { ...prev }
    groupsPreview.forEach((members, gi) => {
      if (members.length) next[`${kelas}#${gi}`] = members[Math.floor(Math.random() * members.length)].id
    })
    return next
  })

  const saveGroups = async () => {
    if (!assignment) return
    setSaving(true)
    try {
      // Bangun kelompok untuk SEMUA kelas (bukan hanya yang sedang difilter).
      const groups: { name: string; studentIds: string[]; leaderId: string }[] = []
      kelasList.forEach((k) => {
        const n = numByKelas[k] ?? 2
        const buckets: string[][] = Array.from({ length: n }, () => [])
        students.filter((s) => s.kelas === k).forEach((s) => {
          const g = assign[s.id] ?? -1
          if (g >= 0 && g < n) buckets[g].push(s.id)
        })
        buckets.forEach((ids, gi) => {
          if (!ids.length) return
          const chosen = leaders[`${k}#${gi}`]
          const leaderId = chosen && ids.includes(chosen) ? chosen : ids[0]
          groups.push({ name: `${k} - Kelompok ${gi + 1}`, studentIds: ids, leaderId })
        })
      })
      await assignmentClient.setAssignmentGroups({ assignmentId: assignment.id, groups })
      toaster.create({ description: 'Kelompok tersimpan.', type: 'success' })
    } catch (e) { toaster.create({ description: e instanceof Error ? e.message : 'Gagal menyimpan kelompok', type: 'error' }) }
    finally { setSaving(false) }
  }

  const grade = async (groupId: string) => {
    const g = grades[groupId] ?? { score: 0, feedback: '' }
    try {
      await assignmentClient.gradeGroupSubmission({ groupId, score: g.score, feedback: g.feedback })
      toaster.create({ description: 'Nilai kelompok tersimpan (berlaku untuk semua anggota).', type: 'success' })
      await loadGrades()
    } catch (e) { toaster.create({ description: e instanceof Error ? e.message : 'Gagal menilai', type: 'error' }) }
  }

  const TabBtn = ({ id, label }: { id: 'kelompok' | 'nilai'; label: string }) => (
    <Button size="sm" variant={tab === id ? 'solid' : 'outline'} bg={tab === id ? COLORS.primary : undefined}
      color={tab === id ? 'white' : undefined} onClick={() => setTab(id)}>{label}</Button>
  )

  return (
    <Dialog.Root open={open} onOpenChange={(e) => { if (!e.open) onClose() }} scrollBehavior="inside" size="xl">
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content>
          <Dialog.Header>
            <Flex align="center" gap="10px" w="full">
              <Icon as={LuUsers} color={COLORS.primary} />
              <Dialog.Title flex="1" fontSize="15px">Praktikum: {assignment?.title}</Dialog.Title>
              <TabBtn id="kelompok" label="Kelompok" />
              <TabBtn id="nilai" label="Penilaian" />
            </Flex>
          </Dialog.Header>
          <Dialog.Body>
            {tab === 'kelompok' ? (
              <Stack gap="12px">
                <Text fontSize="11px" color={COLORS.muted}>
                  Mapel ini bisa lintas kelas — susun kelompok per kelas. Anggota satu kelompok pasti dari kelas yang sama.
                </Text>
                <Flex gap="10px" align="flex-end" wrap="wrap">
                  <Box>
                    <Text fontSize="12px" color={COLORS.muted} mb="2px">Kelas</Text>
                    <NativeSelect.Root size="sm" w="150px">
                      <NativeSelect.Field value={kelas} onChange={(e) => setKelas(e.target.value)}>
                        {kelasList.length === 0 && <option value="">—</option>}
                        {kelasList.map((k) => <option key={k} value={k}>{k}</option>)}
                      </NativeSelect.Field>
                      <NativeSelect.Indicator />
                    </NativeSelect.Root>
                  </Box>
                  <Box>
                    <Text fontSize="12px" color={COLORS.muted} mb="2px">Jumlah kelompok</Text>
                    <Input type="number" size="sm" w="90px" min={1} max={classStudents.length || 1} value={numGroups}
                      onChange={(e) => setNumGroups(Number(e.target.value) || 1)} />
                  </Box>
                  <Button size="sm" variant="outline" onClick={acak} disabled={!kelas}><Icon as={LuShuffle} /> Acak Anggota</Button>
                  <Button size="sm" variant="outline" onClick={acakKetua} disabled={!kelas}><Icon as={LuCrown} /> Acak Ketua</Button>
                  <Button size="sm" variant="ghost" onClick={kosongkan} disabled={!kelas}>Kosongkan</Button>
                  <Box flex="1" />
                  <Button size="sm" bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} loading={saving} onClick={saveGroups}>
                    <Icon as={LuSave} /> Simpan Semua
                  </Button>
                </Flex>

                <Flex gap="8px" wrap="wrap">
                  {groupsPreview.map((members, gi) => {
                    const leaderId = leaders[`${kelas}#${gi}`]
                    return (
                      <Box key={gi} flex="1" minW="160px" border="1px solid" borderColor={COLORS.border} borderRadius="8px" p="8px">
                        <Text fontSize="12px" fontWeight="700" mb="4px">{kelas} · Kelompok {gi + 1} <Badge variant="subtle">{members.length}</Badge></Text>
                        <Stack gap="2px">
                          {members.map((m) => {
                            const isLeader = leaderId === m.id
                            return (
                              <Flex key={m.id} align="center" gap="4px" cursor="pointer" title="Klik untuk jadikan ketua"
                                onClick={() => setLeader(gi, m.id)} w="full">
                                <Icon as={LuCrown} boxSize="12px" color={isLeader ? '#F59E0B' : COLORS.border} />
                                <Text fontSize="11px" lineClamp={1} fontWeight={isLeader ? '700' : '400'}
                                  color={isLeader ? COLORS.text : COLORS.muted}>{m.name}{isLeader ? ' (ketua)' : ''}</Text>
                              </Flex>
                            )
                          })}
                          {members.length === 0 && <Text fontSize="10px" color={COLORS.muted}>—</Text>}
                        </Stack>
                      </Box>
                    )
                  })}
                </Flex>

                <Box overflowX="auto" maxH="40vh" overflowY="auto">
                  <Table.Root size="sm">
                    <Table.Header><Table.Row>
                      <Table.ColumnHeader>Nama</Table.ColumnHeader>
                      <Table.ColumnHeader>Kelas</Table.ColumnHeader>
                      <Table.ColumnHeader w="130px">Kelompok</Table.ColumnHeader>
                    </Table.Row></Table.Header>
                    <Table.Body>
                      {classStudents.length === 0 ? (
                        <Table.Row><Table.Cell colSpan={3} textAlign="center" color={COLORS.muted}>Tidak ada murid di kelas ini.</Table.Cell></Table.Row>
                      ) : classStudents.map((s) => (
                        <Table.Row key={s.id}>
                          <Table.Cell fontWeight="600">{s.name}</Table.Cell>
                          <Table.Cell><Badge variant="subtle">{s.kelas || '-'}</Badge></Table.Cell>
                          <Table.Cell>
                            <NativeSelect.Root size="xs" w="110px">
                              <NativeSelect.Field value={String(clampGroup(assign[s.id] ?? -1))}
                                onChange={(e) => setAssign((a) => ({ ...a, [s.id]: Number(e.target.value) }))}>
                                <option value="-1">—</option>
                                {Array.from({ length: numGroups }, (_, i) => <option key={i} value={i}>Kelompok {i + 1}</option>)}
                              </NativeSelect.Field>
                              <NativeSelect.Indicator />
                            </NativeSelect.Root>
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Root>
                </Box>
              </Stack>
            ) : (
              <Stack gap="12px">
                <Flex align="center" gap="6px"><Icon as={LuClipboardCheck} color={COLORS.primary} /><Text fontSize="13px" color={COLORS.muted}>Nilai berlaku untuk semua anggota kelompok.</Text></Flex>
                {subs.length === 0 ? <Text fontSize="13px" color={COLORS.muted}>Belum ada kelompok. Atur kelompok dulu.</Text> : subs.map((s) => {
                  const g = grades[s.groupId] ?? { score: 0, feedback: '' }
                  const lnks = s.fileUrl ? decodeLinks(s.fileUrl).filter((l) => l.url) : []
                  return (
                    <Box key={s.groupId} border="1px solid" borderColor={COLORS.border} borderRadius="8px" p="10px">
                      <Flex align="center" gap="8px" mb="4px">
                        <Text fontSize="13px" fontWeight="700">{s.groupName}</Text>
                        {s.submitted ? <Badge colorPalette="green">Terkumpul</Badge> : <Badge colorPalette="gray">Belum</Badge>}
                        {s.graded && <Badge colorPalette="blue">Nilai: {s.score}</Badge>}
                      </Flex>
                      {s.content && <Text fontSize="12px" color={COLORS.text} mb="4px">{s.content}</Text>}
                      {lnks.length > 0 && <Flex gap="6px" wrap="wrap" mb="6px">{lnks.map((l, i) => <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"><Badge colorPalette="purple" variant="subtle">{l.label || 'Link'}</Badge></a>)}</Flex>}
                      <Flex gap="8px" align="flex-end" wrap="wrap">
                        <Box>
                          <Text fontSize="11px" color={COLORS.muted} mb="2px">Nilai (0–100)</Text>
                          <Input type="number" size="sm" w="90px" min={0} max={100} value={g.score}
                            onChange={(e) => setGrades((gg) => ({ ...gg, [s.groupId]: { ...g, score: Math.max(0, Math.min(100, Number(e.target.value) || 0)) } }))} />
                        </Box>
                        <Box flex="1" minW="160px">
                          <Text fontSize="11px" color={COLORS.muted} mb="2px">Catatan</Text>
                          <Textarea rows={1} size="sm" value={g.feedback}
                            onChange={(e) => setGrades((gg) => ({ ...gg, [s.groupId]: { ...g, feedback: e.target.value } }))} />
                        </Box>
                        <Button size="sm" bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} onClick={() => grade(s.groupId)}>Simpan Nilai</Button>
                      </Flex>
                    </Box>
                  )
                })}
              </Stack>
            )}
          </Dialog.Body>
          <Dialog.Footer><Button variant="outline" onClick={onClose}>Tutup</Button></Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  )
}
