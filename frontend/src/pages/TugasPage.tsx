import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import {
  Badge, Box, Button, Dialog, Field, Flex, Icon, IconButton, Input, NativeSelect, Stack, Table, Text, Textarea,
} from '@chakra-ui/react'
import {
  LuClipboardList, LuPlus, LuInbox, LuPencil, LuTrash2, LuSend, LuBan, LuMessageCircle, LuPower, LuX, LuSearch, LuImage,
} from 'react-icons/lu'
import { timestampDate, timestampFromDate } from '@bufbuild/protobuf/wkt'
import { assignmentClient, courseClient } from '@/lib/client'
import type { Assignment } from '@/gen/assignment/v1/assignment_pb'
import type { Course, Enrollment } from '@/gen/course/v1/course_pb'
import { Role } from '@/gen/user/v1/user_pb'
import { useAuth } from '@/hooks/useAuth'
import AppLayout from '@/components/AppLayout'
import { Card } from '@/components/Card'
import Pagination, { usePaged } from '@/components/Pagination'
import { encodeLinks } from '@/components/MaterialFormDialog'
import type { DraftQuestion } from '@/components/MaterialFormDialog'
import { fileToDataUrl } from '@/lib/image'
import { COLORS } from '@/theme/tokens'

interface LinkRow { label: string; url: string }

function fmtDateTime(d?: Date) {
  if (!d) return '-'
  return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
}

function fmtDuration(sec: number) {
  if (!sec) return '-'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m} mnt ${s} dtk` : `${s} dtk`
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// CSV helpers for question import/export.
function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const QUESTION_TEMPLATE = [
  'Pertanyaan,OpsiA,OpsiB,OpsiC,OpsiD,JawabanBenar(A-D)',
  '"Ibukota Indonesia?",Jakarta,Bandung,Surabaya,Medan,A',
  '"2 + 2 = ?",3,4,5,6,B',
].join('\n')
function questionsToCSV(qs: DraftQuestion[]): string {
  const rows = ['Pertanyaan,OpsiA,OpsiB,OpsiC,OpsiD,JawabanBenar(A-D)']
  qs.forEach((q) => {
    const o = [0, 1, 2, 3].map((i) => (q.options[i] ?? '').replace(/"/g, "'"))
    const letter = String.fromCharCode(65 + q.correctIndex)
    rows.push(`"${q.question.replace(/"/g, "'")}",${o.map((x) => `"${x}"`).join(',')},${letter}`)
  })
  return rows.join('\n')
}
function parseQuestionsCSV(text: string): DraftQuestion[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const split = (line: string) => {
    // simple CSV split honoring double quotes
    const out: string[] = []; let cur = ''; let inQ = false
    for (const ch of line) {
      if (ch === '"') inQ = !inQ
      else if (ch === ',' && !inQ) { out.push(cur); cur = '' }
      else cur += ch
    }
    out.push(cur)
    return out.map((s) => s.trim())
  }
  return lines.slice(1).map((line) => {
    const c = split(line)
    const options = [c[1] || '', c[2] || '', c[3] || '', c[4] || ''].filter((x) => x !== '')
    const letter = (c[5] || 'A').toUpperCase().charCodeAt(0) - 65
    return { question: c[0] || '', options: options.length ? options : ['', ''], correctIndex: Math.max(0, Math.min(letter, options.length - 1)) }
  }).filter((q) => q.question)
}

interface FormState {
  id: string
  courseId: string
  title: string
  description: string
  deadline: string // datetime-local value
  maxScore: number
  type: string // 'uraian' | 'pilihan_ganda'
  questions: DraftQuestion[]
}
const EMPTY: FormState = { id: '', courseId: '', title: '', description: '', deadline: '', maxScore: 100, type: 'uraian', questions: [] }

export default function TugasPage() {
  const { user } = useAuth()
  const canManage = user?.role === Role.ADMIN || user?.role === Role.TEACHER

  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [courseFilter, setCourseFilter] = useState('')

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [formErr, setFormErr] = useState('')
  const [saving, setSaving] = useState(false)

  // student submission modal
  const [subOpen, setSubOpen] = useState(false)
  const [subTarget, setSubTarget] = useState<Assignment | null>(null)
  const [subContent, setSubContent] = useState('')
  const [subLinks, setSubLinks] = useState<LinkRow[]>([{ label: '', url: '' }])
  const [subErr, setSubErr] = useState('')
  const [subSaving, setSubSaving] = useState(false)

  // teacher "blokir siswa" modal
  const [blockOpen, setBlockOpen] = useState(false)
  const [blockTarget, setBlockTarget] = useState<Assignment | null>(null)
  const [blockStudents, setBlockStudents] = useState<Enrollment[]>([])
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set())
  const [blockSearch, setBlockSearch] = useState('')
  const [blockKelas, setBlockKelas] = useState('')

  // student quiz (pilihan ganda) modal
  const [quizOpen, setQuizOpen] = useState(false)
  const [quizTarget, setQuizTarget] = useState<Assignment | null>(null)
  // each question keeps its id + shuffled options carrying their original index
  const [quizQs, setQuizQs] = useState<{ id: string; question: string; image: string; opts: { text: string; orig: number }[] }[]>([])
  const [quizAns, setQuizAns] = useState<Record<string, number>>({}) // qid -> original option index
  const [quizStart, setQuizStart] = useState(0)
  const [quizMsg, setQuizMsg] = useState('')
  const [quizSaving, setQuizSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await assignmentClient.listAssignments({ pagination: { page: 1, pageSize: 200 } })
      setAssignments(res.assignments)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memuat tugas')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadCourses = useCallback(async () => {
    try {
      const res = await courseClient.listCourses({ pagination: { page: 1, pageSize: 200 } })
      setCourses(res.courses)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    load()
    if (canManage) loadCourses()
  }, [load, loadCourses, canManage])

  const openCreate = () => {
    setForm({ ...EMPTY, courseId: courses[0]?.id ?? '' })
    setFormErr('')
    setOpen(true)
  }

  const openEdit = async (a: Assignment) => {
    let questions: DraftQuestion[] = []
    if (a.type === 'pilihan_ganda') {
      try {
        const r = await assignmentClient.listAssignmentQuestions({ assignmentId: a.id })
        questions = r.questions.map((q) => ({ question: q.question, options: q.options.length ? q.options : ['', ''], correctIndex: Math.max(0, q.correctIndex), image: q.image }))
      } catch { /* ignore */ }
    }
    setForm({
      id: a.id,
      courseId: a.courseId,
      title: a.title,
      description: a.description,
      deadline: a.deadline ? toLocalInput(timestampDate(a.deadline)) : '',
      maxScore: a.maxScore,
      type: a.type || 'uraian',
      questions,
    })
    setFormErr('')
    setOpen(true)
  }

  // MCQ editor helpers
  const setQ = (i: number, patch: Partial<DraftQuestion>) =>
    setForm((f) => ({ ...f, questions: f.questions.map((q, idx) => (idx === i ? { ...q, ...patch } : q)) }))
  const setOpt = (qi: number, oi: number, val: string) =>
    setForm((f) => ({ ...f, questions: f.questions.map((q, idx) => idx === qi ? { ...q, options: q.options.map((o, j) => (j === oi ? val : o)) } : q) }))
  const addQuestion = () => setForm((f) => ({ ...f, questions: [...f.questions, { question: '', options: ['', '', '', ''], correctIndex: 0 }] }))
  const setQImage = async (qi: number, file?: File) => {
    if (!file) return
    try { setQ(qi, { image: await fileToDataUrl(file, 600, 0.6) }) } // small thumbnail
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'Gagal memuat gambar') }
  }
  const importQuestions = async (file?: File) => {
    if (!file) return
    try {
      const parsed = parseQuestionsCSV(await file.text())
      if (parsed.length) setForm((f) => ({ ...f, questions: [...f.questions, ...parsed] }))
      else alert('CSV kosong atau format tidak sesuai template.')
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Gagal impor') }
    finally { if (fileRef.current) fileRef.current.value = '' }
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormErr('')
    if (!form.courseId) { setFormErr('Pilih kelas/mata pelajaran.'); return }
    if (!form.title.trim()) { setFormErr('Judul wajib diisi.'); return }
    if (form.type === 'pilihan_ganda' && form.questions.filter((q) => q.question.trim()).length === 0) {
      setFormErr('Tugas pilihan ganda butuh minimal 1 soal.'); return
    }
    setSaving(true)
    try {
      const deadline = form.deadline ? timestampFromDate(new Date(form.deadline)) : undefined
      let assignmentId = form.id
      if (form.id) {
        await assignmentClient.updateAssignment({
          id: form.id, title: form.title, description: form.description,
          deadline, maxScore: form.maxScore,
        })
      } else {
        const created = await assignmentClient.createAssignment({
          courseId: form.courseId, title: form.title, description: form.description,
          deadline, maxScore: form.maxScore, type: form.type,
        })
        assignmentId = created.id
      }
      if (form.type === 'pilihan_ganda') {
        const questions = form.questions
          .filter((q) => q.question.trim())
          .map((q) => {
            const options = q.options.map((o) => o.trim()).filter(Boolean)
            return { question: q.question, options, correctIndex: options.length ? Math.min(q.correctIndex, options.length - 1) : 0, image: q.image || '' }
          })
        await assignmentClient.setAssignmentQuestions({ assignmentId, questions })
      }
      setOpen(false)
      await load()
    } catch (err: unknown) {
      setFormErr(err instanceof Error ? err.message : 'Gagal menyimpan tugas')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (a: Assignment) => {
    if (!confirm(`Hapus tugas "${a.title}"?`)) return
    try {
      await assignmentClient.deleteAssignment({ id: a.id })
      await load()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal menghapus')
    }
  }

  const openSubmit = (a: Assignment) => {
    setSubTarget(a)
    setSubContent('')
    setSubLinks([{ label: '', url: '' }])
    setSubErr('')
    setSubOpen(true)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subTarget) return
    setSubErr('')
    setSubSaving(true)
    try {
      await assignmentClient.submitAssignment({
        assignmentId: subTarget.id, content: subContent, fileUrl: encodeLinks(subLinks),
      })
      setSubOpen(false)
      await load()
      alert('Tugas berhasil dikumpulkan! Tugas hanya bisa dikumpulkan satu kali.')
    } catch (err: unknown) {
      setSubErr(err instanceof Error ? err.message : 'Gagal mengumpulkan tugas')
    } finally {
      setSubSaving(false)
    }
  }

  // ── Teacher actions ──
  const toggleActive = async (a: Assignment) => {
    try {
      await assignmentClient.updateAssignment({ id: a.id, isActive: !a.isActive })
      await load()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal mengubah status')
    }
  }

  const openBlock = async (a: Assignment) => {
    setBlockTarget(a)
    setBlockSearch(''); setBlockKelas('')
    setBlockStudents([]); setBlockedIds(new Set())
    setBlockOpen(true)
    try {
      const [stu, blk] = await Promise.all([
        courseClient.getCourseStudents({ courseId: a.courseId, pagination: { page: 1, pageSize: 500 } }),
        assignmentClient.listBlockedStudents({ assignmentId: a.id }),
      ])
      setBlockStudents(stu.enrollments)
      setBlockedIds(new Set(blk.studentIds))
    } catch { /* ignore */ }
  }

  const toggleBlock = async (studentId: string) => {
    if (!blockTarget) return
    const isBlocked = blockedIds.has(studentId)
    try {
      if (isBlocked) await assignmentClient.unblockStudent({ assignmentId: blockTarget.id, studentId })
      else await assignmentClient.blockStudent({ assignmentId: blockTarget.id, studentId })
      setBlockedIds((prev) => {
        const next = new Set(prev)
        if (isBlocked) next.delete(studentId); else next.add(studentId)
        return next
      })
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal')
    }
  }

  const kirimWA = (a: Assignment) => {
    const dl = a.deadline ? fmtDateTime(timestampDate(a.deadline)) : '-'
    const msg = [
      `Tugas: ${a.title}`,
      `Mapel: ${a.courseName}`,
      `Deadline: ${dl}`,
      a.description ? `Instruksi: ${a.description}` : '',
      `Buka di: ${window.location.origin}/tugas`,
    ].filter(Boolean).join('\n')
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  const setSubLink = (i: number, patch: Partial<LinkRow>) =>
    setSubLinks((arr) => arr.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))

  // ── Student quiz (pilihan ganda) ──
  type QuizQ = { id: string; question: string; image: string; opts: { text: string; orig: number }[] }
  const buildShuffled = (qs: { id: string; question: string; image: string; options: string[] }[]): QuizQ[] =>
    shuffle(qs).map((q) => ({
      id: q.id, question: q.question, image: q.image,
      opts: shuffle(q.options.map((text, orig) => ({ text, orig }))),
    }))

  const openQuiz = async (a: Assignment) => {
    setQuizTarget(a); setQuizAns({}); setQuizMsg(''); setQuizQs([])
    setQuizOpen(true)
    try {
      const r = await assignmentClient.listAssignmentQuestions({ assignmentId: a.id })
      setQuizQs(buildShuffled(r.questions))
      setQuizStart(Date.now())
    } catch (err: unknown) {
      setQuizMsg(err instanceof Error ? err.message : 'Gagal memuat soal')
    }
  }

  const submitQuiz = async () => {
    if (!quizTarget) return
    if (Object.keys(quizAns).length < quizQs.length) { setQuizMsg('Jawab semua soal dulu ya.'); return }
    setQuizSaving(true)
    try {
      const answers = Object.entries(quizAns).map(([questionId, optionIndex]) => ({ questionId, optionIndex }))
      const timeTakenSeconds = Math.max(1, Math.round((Date.now() - quizStart) / 1000))
      const res = await assignmentClient.submitQuiz({ assignmentId: quizTarget.id, answers, timeTakenSeconds })
      if (res.accepted) {
        setQuizOpen(false)
        await load()
        alert(`Selesai! Benar ${res.correct}/${res.total}. Nilai: ${res.score}. (waktu ${fmtDuration(timeTakenSeconds)})`)
      } else {
        setQuizMsg(`Benar ${res.correct} dari ${res.total} — salah melebihi 5%. Soal & jawaban diacak ulang, coba lagi!`)
        // reshuffle questions + options (keep their original indices for grading)
        setQuizQs((prev) => shuffle(prev).map((q) => ({ ...q, opts: shuffle(q.opts) })))
        setQuizAns({})
      }
    } catch (err: unknown) {
      setQuizMsg(err instanceof Error ? err.message : 'Gagal mengirim')
    } finally {
      setQuizSaving(false)
    }
  }

  // distinct courses present in the assignments (works for guru & siswa)
  const courseOpts = useMemo(() => {
    const m = new Map<string, string>()
    assignments.forEach((a) => { if (a.courseId) m.set(a.courseId, a.courseName) })
    return Array.from(m, ([id, name]) => ({ id, name }))
  }, [assignments])
  const filteredAssignments = useMemo(() => {
    const q = search.trim().toLowerCase()
    return assignments.filter((a) => {
      const okSearch = !q || a.title.toLowerCase().includes(q) ||
        a.courseName.toLowerCase().includes(q) || (a.createdByName || '').toLowerCase().includes(q)
      const okCourse = !courseFilter || a.courseId === courseFilter
      return okSearch && okCourse
    })
  }, [assignments, search, courseFilter])

  const assignmentsPaged = usePaged(filteredAssignments, 10)

  return (
    <AppLayout
      title={<><Icon as={LuClipboardList} /> Tugas</>}
      subtitle={canManage ? 'Kelola tugas untuk siswa' : 'Daftar tugas Anda'}
      actions={canManage ? <Button bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} onClick={openCreate}><Icon as={LuPlus} /> Buat Tugas</Button> : undefined}
    >
      {error && <Text color={COLORS.danger} mb="10px">{error}</Text>}

      <Card>
        <Flex gap="10px" mb="12px" flexWrap="wrap" align="flex-end">
          <Box flex={1} minW="200px">
            <Text fontSize="12px" fontWeight="500" mb="4px" display="flex" alignItems="center" gap="4px"><Icon as={LuSearch} /> Cari Tugas</Text>
            <Input size="sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Judul / mapel / guru…" />
          </Box>
          <Box minW="180px">
            <Text fontSize="12px" fontWeight="500" mb="4px">Filter Mata Pelajaran</Text>
            <NativeSelect.Root size="sm">
              <NativeSelect.Field value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
                <option value="">— Semua —</option>
                {courseOpts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Box>
          <Text fontSize="12px" color={COLORS.muted}>{filteredAssignments.length} dari {assignments.length} tugas</Text>
        </Flex>
        <Box overflowX="auto">
          <Table.Root size="sm">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>Judul</Table.ColumnHeader>
                <Table.ColumnHeader>Mata Pelajaran</Table.ColumnHeader>
                <Table.ColumnHeader>Deadline</Table.ColumnHeader>
                <Table.ColumnHeader>Nilai Maks</Table.ColumnHeader>
                {canManage && <Table.ColumnHeader>Terkumpul</Table.ColumnHeader>}
                <Table.ColumnHeader>Aksi</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {loading ? (
                <Table.Row><Table.Cell colSpan={6} textAlign="center" color={COLORS.muted}>Memuat…</Table.Cell></Table.Row>
              ) : filteredAssignments.length === 0 ? (
                <Table.Row><Table.Cell colSpan={6} textAlign="center" color={COLORS.muted}>{assignments.length ? 'Tidak ada tugas yang cocok' : 'Belum ada tugas'}</Table.Cell></Table.Row>
              ) : (
                assignmentsPaged.pageItems.map((a) => {
                  const dl = a.deadline ? timestampDate(a.deadline) : undefined
                  const over = dl ? dl < new Date() : false
                  return (
                    <Table.Row key={a.id}>
                      <Table.Cell fontWeight="medium">
                        <Flex align="center" gap="6px" wrap="wrap">
                          {a.title}
                          <Badge colorPalette={a.type === 'pilihan_ganda' ? 'purple' : 'teal'} variant="subtle">
                            {a.type === 'pilihan_ganda' ? 'Pilihan Ganda' : 'Uraian'}
                          </Badge>
                          {!a.isActive && <Badge colorPalette="gray">Nonaktif</Badge>}
                        </Flex>
                        {a.description && <Text fontSize="11px" color={COLORS.muted}>{a.description.slice(0, 50)}</Text>}
                        <Text fontSize="11px" color={COLORS.muted}>Dibuat oleh: {a.createdByName || '—'}</Text>
                      </Table.Cell>
                      <Table.Cell><Badge colorPalette="blue">{a.courseName}</Badge></Table.Cell>
                      <Table.Cell>
                        <Text color={over ? COLORS.danger : undefined} fontSize="12px">{fmtDateTime(dl)}</Text>
                      </Table.Cell>
                      <Table.Cell>{a.maxScore}</Table.Cell>
                      {canManage && <Table.Cell>{a.submissionCount} <Icon as={LuInbox} /></Table.Cell>}
                      <Table.Cell>
                        <Flex gap="6px" wrap="wrap">
                          {canManage ? (
                            <>
                              <IconButton size="xs" variant="outline" colorPalette={a.isActive ? 'green' : 'gray'}
                                aria-label="aktif" title={a.isActive ? 'Nonaktifkan tugas' : 'Aktifkan tugas'} onClick={() => toggleActive(a)}>
                                <Icon as={LuPower} />
                              </IconButton>
                              <IconButton size="xs" variant="outline" colorPalette="orange"
                                aria-label="blokir" title="Blokir siswa" onClick={() => openBlock(a)}>
                                <Icon as={LuBan} />
                              </IconButton>
                              <IconButton size="xs" variant="outline" colorPalette="green"
                                aria-label="wa" title="Kirim ke WhatsApp" onClick={() => kirimWA(a)}>
                                <Icon as={LuMessageCircle} />
                              </IconButton>
                              <IconButton size="xs" variant="outline" colorPalette="blue" aria-label="edit" title="Edit" onClick={() => openEdit(a)}>
                                <Icon as={LuPencil} />
                              </IconButton>
                              <IconButton size="xs" colorPalette="red" variant="outline" aria-label="hapus" title="Hapus" onClick={() => remove(a)}>
                                <Icon as={LuTrash2} />
                              </IconButton>
                            </>
                          ) : a.blocked ? (
                            <Badge colorPalette="red"><Icon as={LuBan} /> Diblokir</Badge>
                          ) : a.submitted ? (
                            <Badge colorPalette="green"><Icon as={LuSend} /> Sudah dikumpulkan</Badge>
                          ) : !a.isActive ? (
                            <Badge colorPalette="gray">Belum dibuka</Badge>
                          ) : over ? (
                            <Badge colorPalette="gray">Ditutup (lewat deadline)</Badge>
                          ) : a.type === 'pilihan_ganda' ? (
                            <Button size="xs" bg={COLORS.primary} color="white" onClick={() => openQuiz(a)}>
                              <Icon as={LuClipboardList} /> Kerjakan Kuis
                            </Button>
                          ) : (
                            <Button size="xs" bg={COLORS.success} color="white" onClick={() => openSubmit(a)}>
                              <Icon as={LuSend} /> Kumpulkan
                            </Button>
                          )}
                        </Flex>
                      </Table.Cell>
                    </Table.Row>
                  )
                })
              )}
            </Table.Body>
          </Table.Root>
        </Box>
        <Pagination page={assignmentsPaged.page} pageSize={assignmentsPaged.pageSize} total={assignmentsPaged.total} onPageChange={assignmentsPaged.setPage} />
      </Card>

      {/* Create/Edit dialog */}
      <Dialog.Root open={open} onOpenChange={(e) => setOpen(e.open)} scrollBehavior="inside" size="full">
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header><Dialog.Title>{form.id ? 'Edit Tugas' : 'Buat Tugas'}</Dialog.Title></Dialog.Header>
            <Dialog.Body>
              <form id="tugas-form" onSubmit={save}>
                <Stack gap="12px" maxW="820px" mx="auto" w="full">
                  <Field.Root required>
                    <Field.Label>Mata Pelajaran / Kelas</Field.Label>
                    <NativeSelect.Root disabled={!!form.id}>
                      <NativeSelect.Field
                        value={form.courseId}
                        onChange={(e) => setForm({ ...form, courseId: e.target.value })}
                      >
                        <option value="">— Pilih —</option>
                        {courses.map((c) => (
                          <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                        ))}
                      </NativeSelect.Field>
                      <NativeSelect.Indicator />
                    </NativeSelect.Root>
                    {(() => {
                      const sc = courses.find((c) => c.id === form.courseId)
                      if (!sc) return null
                      return (
                        <Flex gap="5px" align="center" wrap="wrap" mt="6px">
                          <Text fontSize="11px" color={COLORS.muted}>Diberikan ke kelas:</Text>
                          {sc.kelas?.length > 0
                            ? sc.kelas.map((k) => <Badge key={k} colorPalette="blue" variant="subtle">{k}</Badge>)
                            : <Text fontSize="11px" color={COLORS.danger}>Belum ada kelas — atur dulu di Daftar Mapel</Text>}
                          <Text fontSize="11px" color={COLORS.muted}>(hanya kelas ini yang melihat tugas)</Text>
                        </Flex>
                      )
                    })()}
                  </Field.Root>
                  <Field.Root required>
                    <Field.Label>Judul Tugas</Field.Label>
                    <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                  </Field.Root>
                  <Field.Root>
                    <Field.Label>Tipe Tugas</Field.Label>
                    <NativeSelect.Root disabled={!!form.id}>
                      <NativeSelect.Field value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                        <option value="uraian">Soal Uraian (jawaban teks + link)</option>
                        <option value="pilihan_ganda">Soal Pilihan Ganda (kuis otomatis)</option>
                      </NativeSelect.Field>
                      <NativeSelect.Indicator />
                    </NativeSelect.Root>
                    {!!form.id && <Text fontSize="10px" color={COLORS.muted} mt="2px">Tipe tidak bisa diubah setelah dibuat.</Text>}
                  </Field.Root>
                  <Field.Root>
                    <Field.Label>Deskripsi / Instruksi</Field.Label>
                    <Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </Field.Root>
                  <Field.Root>
                    <Field.Label>Deadline</Field.Label>
                    <Input type="datetime-local" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
                  </Field.Root>
                  <Field.Root>
                    <Field.Label>Nilai Maksimal</Field.Label>
                    <Input type="number" min={1} max={100} value={form.maxScore} onChange={(e) => setForm({ ...form, maxScore: Number(e.target.value) })} />
                  </Field.Root>

                  {form.type === 'pilihan_ganda' && (
                    <Box borderTop="1px solid" borderColor={COLORS.border} pt="12px">
                      <Flex justify="space-between" align="center" mb="8px" wrap="wrap" gap="6px">
                        <Text fontSize="13px" fontWeight="600">Soal Pilihan Ganda ({form.questions.length})</Text>
                        <Flex gap="6px" wrap="wrap">
                          <Button size="2xs" variant="outline" onClick={() => fileRef.current?.click()}>Import CSV</Button>
                          <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }}
                            onChange={(e) => importQuestions(e.target.files?.[0])} />
                          <Button size="2xs" variant="outline" onClick={() => downloadCSV(questionsToCSV(form.questions), 'soal.csv')} disabled={form.questions.length === 0}>Export CSV</Button>
                          <Button size="2xs" variant="outline" onClick={() => downloadCSV(QUESTION_TEMPLATE, 'template-soal.csv')}>Template</Button>
                        </Flex>
                      </Flex>
                      <Text fontSize="11px" color={COLORS.muted} mb="8px">Saat dikerjakan: soal &amp; jawaban diacak; salah &gt;5% otomatis diulang. Skor = benar/total × nilai maksimal.</Text>
                      <Stack gap="10px">
                        {form.questions.map((q, qi) => (
                          <Box key={qi} bg={COLORS.bg} p="10px" borderRadius="8px">
                            <Flex gap="6px" mb="6px">
                              <Input size="sm" flex="1" placeholder={`Soal ${qi + 1}`} value={q.question}
                                onChange={(e) => setQ(qi, { question: e.target.value })} />
                              <IconButton aria-label="hapus soal" size="sm" colorPalette="red" variant="outline"
                                onClick={() => setForm((f) => ({ ...f, questions: f.questions.filter((_, idx) => idx !== qi) }))}><Icon as={LuTrash2} /></IconButton>
                            </Flex>
                            <Flex gap="8px" align="center" mb="6px" wrap="wrap">
                              {q.image && <img src={q.image} alt="" style={{ maxHeight: 80, borderRadius: 6, border: `1px solid ${COLORS.border}` }} />}
                              <label style={{ fontSize: 11, cursor: 'pointer', color: COLORS.primary }}>
                                <Icon as={LuImage} /> {q.image ? 'Ganti gambar' : 'Tambah gambar (opsional)'}
                                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => setQImage(qi, e.target.files?.[0])} />
                              </label>
                              {q.image && <Button size="2xs" variant="ghost" colorPalette="red" onClick={() => setQ(qi, { image: '' })}><Icon as={LuX} /> Hapus gambar</Button>}
                            </Flex>
                            <Text fontSize="11px" color={COLORS.muted} mb="4px">Pilih jawaban benar (radio):</Text>
                            <Stack gap="4px">
                              {q.options.map((o, oi) => (
                                <Flex key={oi} gap="6px" align="center">
                                  <input type="radio" name={`q-${qi}`} checked={q.correctIndex === oi} onChange={() => setQ(qi, { correctIndex: oi })} />
                                  <Input size="sm" placeholder={`Opsi ${String.fromCharCode(65 + oi)}`} value={o}
                                    onChange={(e) => setOpt(qi, oi, e.target.value)} />
                                  {q.options.length > 2 && (
                                    <IconButton aria-label="hapus opsi" size="xs" variant="ghost"
                                      onClick={() => setQ(qi, { options: q.options.filter((_, j) => j !== oi), correctIndex: 0 })}><Icon as={LuX} /></IconButton>
                                  )}
                                </Flex>
                              ))}
                            </Stack>
                            {q.options.length < 5 && (
                              <Button size="2xs" variant="ghost" mt="4px" onClick={() => setQ(qi, { options: [...q.options, ''] })}><Icon as={LuPlus} /> opsi</Button>
                            )}
                          </Box>
                        ))}
                      </Stack>
                      <Button size="xs" variant="outline" mt="8px" onClick={addQuestion}><Icon as={LuPlus} /> Tambah Soal</Button>
                    </Box>
                  )}

                  {formErr && <Text color={COLORS.danger} fontSize="12px">{formErr}</Text>}
                </Stack>
              </form>
            </Dialog.Body>
            <Dialog.Footer>
              <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button type="submit" form="tugas-form" loading={saving} bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }}>
                Simpan
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>

      {/* Student submit dialog */}
      <Dialog.Root open={subOpen} onOpenChange={(e) => setSubOpen(e.open)}>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header><Dialog.Title>Kumpulkan: {subTarget?.title}</Dialog.Title></Dialog.Header>
            <Dialog.Body>
              <form id="submit-form" onSubmit={submit}>
                <Stack gap="12px">
                  {subTarget?.description && (
                    <Box bg={COLORS.bg} p="10px" borderRadius="7px" fontSize="12px" color={COLORS.muted}>
                      {subTarget.description}
                    </Box>
                  )}
                  <Field.Root>
                    <Field.Label>Jawaban</Field.Label>
                    <Textarea rows={5} value={subContent} onChange={(e) => setSubContent(e.target.value)} placeholder="Tulis jawaban Anda…" />
                  </Field.Root>
                  <Box>
                    <Text fontSize="13px" fontWeight="600" mb="6px">Link File (opsional)</Text>
                    <Stack gap="6px">
                      {subLinks.map((l, i) => (
                        <Flex key={i} gap="6px">
                          <Input flex="1" size="sm" placeholder="Judul (mis. Tugas Bab 1)"
                            value={l.label} onChange={(e) => setSubLink(i, { label: e.target.value })} />
                          <Input flex="2" size="sm" placeholder="https://… (Google Drive, dll)"
                            value={l.url} onChange={(e) => setSubLink(i, { url: e.target.value })} />
                          {subLinks.length > 1 && (
                            <IconButton aria-label="hapus link" size="sm" colorPalette="red" variant="outline"
                              onClick={() => setSubLinks((arr) => arr.filter((_, idx) => idx !== i))}><Icon as={LuX} /></IconButton>
                          )}
                        </Flex>
                      ))}
                    </Stack>
                    <Button size="xs" variant="outline" mt="6px"
                      onClick={() => setSubLinks((arr) => [...arr, { label: '', url: '' }])}><Icon as={LuPlus} /> Tambah Link</Button>
                  </Box>
                  {subErr && <Text color={COLORS.danger} fontSize="12px">{subErr}</Text>}
                </Stack>
              </form>
            </Dialog.Body>
            <Dialog.Footer>
              <Button variant="outline" onClick={() => setSubOpen(false)}>Batal</Button>
              <Button type="submit" form="submit-form" loading={subSaving} bg={COLORS.success} color="white">
                <Icon as={LuSend} /> Kumpulkan
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>

      {/* Teacher: Blokir Siswa dialog */}
      <Dialog.Root open={blockOpen} onOpenChange={(e) => setBlockOpen(e.open)} scrollBehavior="inside">
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxW="560px">
            <Dialog.Header><Dialog.Title><Icon as={LuBan} /> Blokir Siswa — {blockTarget?.title}</Dialog.Title></Dialog.Header>
            <Dialog.Body>
              {(() => {
                const kelasOpts = Array.from(new Set(blockStudents.map((e) => e.student?.kelas).filter(Boolean))) as string[]
                const q = blockSearch.trim().toLowerCase()
                const filtered = blockStudents.filter((e) => {
                  const okSearch = !q || (e.student?.fullName || '').toLowerCase().includes(q) || (e.student?.email || '').toLowerCase().includes(q)
                  const okKelas = !blockKelas || e.student?.kelas === blockKelas
                  return okSearch && okKelas
                })
                return (
                  <Stack gap="10px">
                    <Text fontSize="12px" color={COLORS.muted}>Siswa yang diblokir tidak bisa mengumpulkan tugas ini.</Text>
                    <Flex gap="8px" flexWrap="wrap" align="flex-end">
                      <Box flex={1} minW="180px">
                        <Text fontSize="12px" fontWeight="500" mb="4px">Cari siswa</Text>
                        <Input size="sm" value={blockSearch} onChange={(e) => setBlockSearch(e.target.value)} placeholder="Nama / email…" />
                      </Box>
                      <Box minW="140px">
                        <Text fontSize="12px" fontWeight="500" mb="4px">Filter kelas</Text>
                        <NativeSelect.Root size="sm">
                          <NativeSelect.Field value={blockKelas} onChange={(e) => setBlockKelas(e.target.value)}>
                            <option value="">— Semua —</option>
                            {kelasOpts.map((k) => <option key={k} value={k}>{k}</option>)}
                          </NativeSelect.Field>
                          <NativeSelect.Indicator />
                        </NativeSelect.Root>
                      </Box>
                    </Flex>
                    <Box overflowX="auto">
                      <Table.Root size="sm">
                        <Table.Header>
                          <Table.Row>
                            <Table.ColumnHeader>Nama</Table.ColumnHeader>
                            <Table.ColumnHeader>Kelas</Table.ColumnHeader>
                            <Table.ColumnHeader>Status</Table.ColumnHeader>
                          </Table.Row>
                        </Table.Header>
                        <Table.Body>
                          {filtered.length === 0 ? (
                            <Table.Row><Table.Cell colSpan={3} textAlign="center" color={COLORS.muted}>Tidak ada siswa</Table.Cell></Table.Row>
                          ) : filtered.map((e) => {
                            const sid = e.student?.id ?? ''
                            const blocked = blockedIds.has(sid)
                            return (
                              <Table.Row key={e.id}>
                                <Table.Cell fontWeight="medium">{e.student?.fullName || '-'}</Table.Cell>
                                <Table.Cell>{e.student?.kelas ? <Badge colorPalette="blue">{e.student.kelas}</Badge> : '-'}</Table.Cell>
                                <Table.Cell>
                                  <Button size="xs" variant="outline" colorPalette={blocked ? 'green' : 'red'} onClick={() => toggleBlock(sid)}>
                                    {blocked ? 'Buka Blokir' : <><Icon as={LuBan} /> Blokir</>}
                                  </Button>
                                </Table.Cell>
                              </Table.Row>
                            )
                          })}
                        </Table.Body>
                      </Table.Root>
                    </Box>
                  </Stack>
                )
              })()}
            </Dialog.Body>
            <Dialog.Footer>
              <Button variant="outline" onClick={() => setBlockOpen(false)}>Tutup</Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>

      {/* Student: kerjakan kuis pilihan ganda */}
      <Dialog.Root open={quizOpen} onOpenChange={(e) => { if (!e.open) setQuizOpen(false) }} scrollBehavior="inside" size="full">
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title><Icon as={LuClipboardList} /> Kuis: {quizTarget?.title}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Stack gap="14px" maxW="640px" mx="auto" w="full">
                {quizMsg && (
                  <Box bg="#FEF3C7" color="#92400E" p="10px" borderRadius="8px" fontSize="13px">{quizMsg}</Box>
                )}
                {quizQs.length === 0 ? (
                  <Text color={COLORS.muted} fontSize="13px">{quizMsg ? '' : 'Memuat soal…'}</Text>
                ) : quizQs.map((q, qi) => (
                  <Box key={q.id} borderBottom="1px solid" borderColor={COLORS.border} pb="10px">
                    <Text fontSize="14px" fontWeight="600" mb="8px">{qi + 1}. {q.question}</Text>
                    {q.image && <img src={q.image} alt="" style={{ maxHeight: 220, marginBottom: 8, borderRadius: 8, border: `1px solid ${COLORS.border}` }} />}
                    <Stack gap="6px">
                      {q.opts.map((o, oi) => {
                        const picked = quizAns[q.id] === o.orig
                        return (
                          <Flex key={oi} gap="8px" align="center" cursor="pointer"
                            bg={picked ? '#DBEAFE' : COLORS.bg} px="10px" py="8px" borderRadius="6px"
                            border="1px solid" borderColor={picked ? COLORS.primary : COLORS.border}
                            onClick={() => setQuizAns((a) => ({ ...a, [q.id]: o.orig }))}>
                            <input type="radio" name={`quiz-${q.id}`} checked={picked} readOnly />
                            <Text fontSize="13px">{String.fromCharCode(65 + oi)}. {o.text}</Text>
                          </Flex>
                        )
                      })}
                    </Stack>
                  </Box>
                ))}
                {quizQs.length > 0 && (
                  <Text fontSize="11px" color={COLORS.muted} textAlign="center">
                    Jika salah melebihi 5% dari jumlah soal, kuis otomatis diacak ulang. Waktu pengerjaan dicatat.
                  </Text>
                )}
              </Stack>
            </Dialog.Body>
            <Dialog.Footer>
              <Button variant="outline" onClick={() => setQuizOpen(false)}>Tutup</Button>
              <Button bg={COLORS.success} color="white" loading={quizSaving} disabled={quizQs.length === 0} onClick={submitQuiz}>
                <Icon as={LuSend} /> Kumpulkan Jawaban
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>
    </AppLayout>
  )
}

// Convert a Date to the value format expected by <input type="datetime-local">.
function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
