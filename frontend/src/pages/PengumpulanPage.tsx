import { useEffect, useState, useCallback } from 'react'
import {
  Badge, Box, Button, Dialog, Field, Flex, Icon, IconButton, Input, NativeSelect, SimpleGrid, Stack, Table, Text, Textarea,
} from '@chakra-ui/react'
import { LuInbox, LuCircleCheck, LuCheck, LuCircleX, LuPartyPopper, LuLink, LuClock, LuPencil, LuUsers } from 'react-icons/lu'
import { timestampDate } from '@bufbuild/protobuf/wkt'
import { assignmentClient, courseClient } from '@/lib/client'
import type { Assignment, Submission, GroupSubmission } from '@/gen/assignment/v1/assignment_pb'
import type { Course } from '@/gen/course/v1/course_pb'
import AppLayout from '@/components/AppLayout'
import { Card } from '@/components/Card'
import { decodeLinks } from '@/components/MaterialFormDialog'
import { COLORS } from '@/theme/tokens'

function fmtDuration(sec: number) {
  if (!sec) return '-'
  const m = Math.floor(sec / 60), s = sec % 60
  return m > 0 ? `${m} mnt ${s} dtk` : `${s} dtk`
}

export default function PengumpulanPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [courseId, setCourseId] = useState('')
  const [assignmentId, setAssignmentId] = useState('')
  const [subs, setSubs] = useState<Submission[]>([])
  const [groupSubs, setGroupSubs] = useState<GroupSubmission[]>([])
  const [loading, setLoading] = useState(false)

  const [gradeOpen, setGradeOpen] = useState(false)
  const [target, setTarget] = useState<Submission | null>(null)
  const [groupTarget, setGroupTarget] = useState<GroupSubmission | null>(null)
  const [score, setScore] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [saving, setSaving] = useState(false)
  const [gradeErr, setGradeErr] = useState('')

  useEffect(() => {
    courseClient.listCourses({ pagination: { page: 1, pageSize: 200 } })
      .then((r) => setCourses(r.courses)).catch(() => {})
  }, [])

  const loadAssignments = useCallback(async (cid: string) => {
    setAssignments([])
    setAssignmentId('')
    setSubs([])
    try {
      const res = await assignmentClient.listAssignments({
        courseId: cid || undefined, pagination: { page: 1, pageSize: 200 },
      })
      setAssignments(res.assignments)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadAssignments(courseId) }, [courseId, loadAssignments])

  const reload = useCallback(async () => {
    if (!assignmentId) { setSubs([]); setGroupSubs([]); return }
    setLoading(true)
    try {
      const a = assignments.find((x) => x.id === assignmentId)
      if (a?.type === 'praktikum') {
        const res = await assignmentClient.listGroupSubmissions({ assignmentId })
        setGroupSubs(res.submissions); setSubs([])
      } else {
        const res = await assignmentClient.listSubmissions({ assignmentId })
        setSubs(res.submissions); setGroupSubs([])
      }
    } catch { setSubs([]); setGroupSubs([]) } finally { setLoading(false) }
  }, [assignmentId, assignments])

  useEffect(() => { reload() }, [reload])

  const openGrade = (s: Submission) => {
    setTarget(s); setGroupTarget(null)
    setScore(s.graded ? s.score : 0)
    setFeedback(s.feedback)
    setGradeErr('')
    setGradeOpen(true)
  }
  const openGradeGroup = (gs: GroupSubmission) => {
    setGroupTarget(gs); setTarget(null)
    setScore(gs.graded ? gs.score : 0)
    setFeedback(gs.feedback)
    setGradeErr('')
    setGradeOpen(true)
  }

  const saveGrade = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setGradeErr('')
    try {
      if (groupTarget) {
        await assignmentClient.gradeGroupSubmission({ groupId: groupTarget.groupId, score, feedback })
      } else if (target) {
        await assignmentClient.gradeSubmission({ submissionId: target.id, score, feedback })
      }
      setGradeOpen(false)
      await reload()
    } catch (err: unknown) {
      setGradeErr(err instanceof Error ? err.message : 'Gagal menyimpan nilai')
    } finally {
      setSaving(false)
    }
  }

  const submitted = subs.filter((s) => s.submitted)
  const notSubmitted = subs.filter((s) => !s.submitted)
  const currentAssignment = assignments.find((a) => a.id === assignmentId)
  const isPraktikum = currentAssignment?.type === 'praktikum'

  return (
    <AppLayout title={<><Icon as={LuInbox} /> Pengumpulan Tugas</>} subtitle="Lihat pengumpulan siswa dan beri nilai">
      <Stack gap="14px">
        <Card>
          <Flex gap="10px" flexWrap="wrap" align="flex-end">
            <Box minW="180px">
              <Text fontSize="12px" fontWeight="500" mb="4px">Filter Mata Pelajaran</Text>
              <NativeSelect.Root size="sm">
                <NativeSelect.Field value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                  <option value="">— Semua Kelas —</option>
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </Box>
            <Box flex={1} minW="220px">
              <Text fontSize="12px" fontWeight="500" mb="4px">Pilih Tugas</Text>
              <NativeSelect.Root size="sm">
                <NativeSelect.Field value={assignmentId} onChange={(e) => setAssignmentId(e.target.value)}>
                  <option value="">— Pilih Tugas —</option>
                  {assignments.map((a) => <option key={a.id} value={a.id}>{a.title} ({a.courseName})</option>)}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </Box>
          </Flex>
        </Card>

        {!assignmentId ? (
          <Card><Text color={COLORS.muted} textAlign="center" py="20px">Pilih tugas untuk melihat pengumpulan.</Text></Card>
        ) : loading ? (
          <Card><Text color={COLORS.muted}>Memuat…</Text></Card>
        ) : isPraktikum ? (
          <Card title={<><Icon as={LuUsers} /> Pengumpulan per Kelompok ({groupSubs.length})</>}>
            {groupSubs.length === 0 ? (
              <Text color={COLORS.muted} py="10px" fontSize="13px">Belum ada kelompok. Atur kelompok dulu di menu Tugas → Praktikum.</Text>
            ) : (
              <Stack gap="10px">
                {groupSubs.map((gs) => {
                  const lnks = gs.fileUrl ? decodeLinks(gs.fileUrl).filter((l) => l.url) : []
                  return (
                    <Box key={gs.groupId} border="1px solid" borderColor={COLORS.border} borderRadius="8px" p="10px">
                      <Flex align="center" gap="8px" mb="4px" wrap="wrap">
                        <Text fontSize="13px" fontWeight="700" flex="1">{gs.groupName}</Text>
                        {gs.submitted ? <Badge colorPalette="green"><Icon as={LuCircleCheck} /> Terkumpul</Badge> : <Badge colorPalette="gray">Belum</Badge>}
                        {gs.graded ? <Badge colorPalette="green">Nilai: {gs.score}</Badge> : gs.submitted && <Badge colorPalette="yellow">Belum dinilai</Badge>}
                        <Button size="xs" bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} onClick={() => openGradeGroup(gs)}>
                          <Icon as={gs.graded ? LuPencil : LuCheck} /> {gs.graded ? 'Ubah Nilai' : 'Nilai'}
                        </Button>
                      </Flex>
                      {gs.submittedByName && <Text fontSize="11px" color={COLORS.muted}>Dikumpulkan oleh ketua: {gs.submittedByName}</Text>}
                      {gs.content && <Text fontSize="12px" color={COLORS.text} mt="4px" whiteSpace="pre-wrap">{gs.content}</Text>}
                      {lnks.length > 0 && (
                        <Flex gap="6px" wrap="wrap" mt="6px">
                          {lnks.map((l, i) => (
                            <a key={i} href={l.url} target="_blank" rel="noreferrer" style={{ color: COLORS.primary, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Icon as={LuLink} /> {l.label || 'Link'}
                            </a>
                          ))}
                        </Flex>
                      )}
                    </Box>
                  )
                })}
              </Stack>
            )}
          </Card>
        ) : (
          <SimpleGrid columns={{ base: 1, lg: 2 }} gap="14px">
            {/* Submitted */}
            <Card title={<><Icon as={LuCircleCheck} /> Sudah Mengerjakan ({submitted.length})</>}>
              <Box overflowX="auto">
                <Table.Root size="sm">
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeader>Siswa</Table.ColumnHeader>
                      <Table.ColumnHeader>Waktu</Table.ColumnHeader>
                      <Table.ColumnHeader>Nilai</Table.ColumnHeader>
                      <Table.ColumnHeader textAlign="right">Aksi</Table.ColumnHeader>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {submitted.length === 0 ? (
                      <Table.Row><Table.Cell colSpan={4} textAlign="center" color={COLORS.muted}>Belum ada</Table.Cell></Table.Row>
                    ) : submitted.map((s) => (
                      <Table.Row key={s.id}>
                        <Table.Cell>
                          {s.studentName}
                          {s.studentKelas && <Badge ml="1" colorPalette="blue">{s.studentKelas}</Badge>}
                        </Table.Cell>
                        <Table.Cell fontSize="11px" color={COLORS.muted}>
                          {s.submittedAt ? timestampDate(s.submittedAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                        </Table.Cell>
                        <Table.Cell>
                          {s.graded ? <Badge colorPalette="green">{s.score}</Badge> : <Badge colorPalette="yellow">Belum dinilai</Badge>}
                        </Table.Cell>
                        <Table.Cell textAlign="right">
                          <IconButton size="xs" bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }}
                            aria-label={s.graded ? 'Ubah nilai' : 'Nilai'} title={s.graded ? 'Ubah nilai' : 'Nilai'}
                            onClick={() => openGrade(s)}>
                            <Icon as={s.graded ? LuPencil : LuCheck} />
                          </IconButton>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Root>
              </Box>
            </Card>

            {/* Not submitted */}
            <Card title={<><Icon as={LuCircleX} /> Belum Mengerjakan ({notSubmitted.length})</>}>
              {notSubmitted.length === 0 ? (
                <Text color={COLORS.success} fontSize="13px" display="flex" alignItems="center" gap="4px">Semua siswa sudah mengumpulkan <Icon as={LuPartyPopper} /></Text>
              ) : (
                <Stack gap="6px">
                  {notSubmitted.map((s) => (
                    <Flex key={s.studentId} justify="space-between" align="center"
                      bg={COLORS.bg} px="10px" py="7px" borderRadius="6px">
                      <Text fontSize="13px">{s.studentName}</Text>
                      {s.studentKelas && <Badge colorPalette="gray">{s.studentKelas}</Badge>}
                    </Flex>
                  ))}
                </Stack>
              )}
            </Card>
          </SimpleGrid>
        )}
      </Stack>

      {/* Grade dialog */}
      <Dialog.Root open={gradeOpen} onOpenChange={(e) => setGradeOpen(e.open)}>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header><Dialog.Title>Beri Nilai — {groupTarget ? groupTarget.groupName : target?.studentName}</Dialog.Title></Dialog.Header>
            <Dialog.Body>
              <Stack gap="12px">
                {!!target?.timeTakenSeconds && (
                  <Box bg="#EFF6FF" color="#1E40AF" p="10px" borderRadius="7px" fontSize="13px" display="flex" alignItems="center" gap="6px">
                    <Icon as={LuClock} />
                    <Text>Kuis pilihan ganda • Waktu pengerjaan: <b>{fmtDuration(target.timeTakenSeconds)}</b> • Nilai otomatis: <b>{target.score}</b></Text>
                  </Box>
                )}
                <Box>
                  <Text fontSize="11px" fontWeight="600" color={COLORS.muted} mb="4px">{groupTarget ? 'JAWABAN KELOMPOK' : 'JAWABAN SISWA'}</Text>
                  <Box bg={COLORS.bg} p="10px" borderRadius="7px" fontSize="13px" whiteSpace="pre-wrap" maxH="180px" overflowY="auto">
                    {(groupTarget?.content ?? target?.content) || <Text color={COLORS.muted}>{target?.timeTakenSeconds ? '(kuis pilihan ganda — dinilai otomatis)' : '(tidak ada teks)'}</Text>}
                  </Box>
                </Box>
                {(groupTarget?.fileUrl || target?.fileUrl) && (
                  <Box>
                    <Text fontSize="11px" fontWeight="600" color={COLORS.muted} mb="4px">LAMPIRAN</Text>
                    <Stack gap="4px">
                      {decodeLinks(groupTarget?.fileUrl ?? target?.fileUrl ?? '').filter((l) => l.url).map((l, i) => (
                        <a key={i} href={l.url} target="_blank" rel="noreferrer" style={{ color: COLORS.primary, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Icon as={LuLink} /> {l.label || l.url}
                        </a>
                      ))}
                    </Stack>
                  </Box>
                )}
                <form id="grade-form" onSubmit={saveGrade}>
                  <Stack gap="12px">
                    <Field.Root>
                      <Field.Label>Nilai (0–{currentAssignment?.maxScore ?? 100})</Field.Label>
                      <Input type="number" min={0} max={currentAssignment?.maxScore ?? 100}
                        value={score} onChange={(e) => setScore(Number(e.target.value))} />
                    </Field.Root>
                    <Field.Root>
                      <Field.Label>Catatan / Feedback</Field.Label>
                      <Textarea rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
                    </Field.Root>
                    {gradeErr && <Text color={COLORS.danger} fontSize="12px">{gradeErr}</Text>}
                  </Stack>
                </form>
              </Stack>
            </Dialog.Body>
            <Dialog.Footer>
              <Button variant="outline" onClick={() => setGradeOpen(false)}>Batal</Button>
              <Button type="submit" form="grade-form" loading={saving} bg={COLORS.success} color="white">Simpan Nilai</Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>
    </AppLayout>
  )
}
