import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import {
  Badge, Box, Button, Card, Flex, Heading, HStack, Icon, IconButton, Input, NativeSelect, SimpleGrid, Stack, Table, Text,
} from '@chakra-ui/react'
import {
  LuPlus, LuBookOpen, LuPencil, LuTrash2, LuSearch, LuRefreshCw, LuChevronUp, LuChevronDown, LuCircleCheck, LuEye, LuEyeOff,
  LuPlay, LuChevronRight, LuGraduationCap,
} from 'react-icons/lu'
import { timestampDate } from '@bufbuild/protobuf/wkt'
import { courseClient, materialClient, userClient } from '@/lib/client'
import type { Course, Enrollment } from '@/gen/course/v1/course_pb'
import type { Material, StudentCompletionSummary, Category } from '@/gen/material/v1/material_pb'
import { Role } from '@/gen/user/v1/user_pb'
import { useAuth } from '@/hooks/useAuth'
import AppLayout from '@/components/AppLayout'
import MaterialFormDialog from '@/components/MaterialFormDialog'
import MaterialViewer from '@/components/MaterialViewer'
import ConfirmDialog, { type ConfirmState } from '@/components/ConfirmDialog'
import Pagination, { usePaged } from '@/components/Pagination'
import { StarsDisplay } from '@/components/StarRating'
import { COLORS, UDEMY, courseGradient } from '@/theme/tokens'

type ActiveTab = 'materials' | 'students' | 'completions' | 'categories'

export default function CourseDetailPage({ forcedCourseId }: { forcedCourseId?: string }) {
  const params = useParams<{ id: string }>()
  const id = forcedCourseId ?? params.id
  const isGeneral = id === 'general'
  const { user } = useAuth()
  const canManage = user?.role === Role.TEACHER || user?.role === Role.ADMIN

  const [course, setCourse] = useState<Course | null>(null)
  const [materials, setMaterials] = useState<Material[]>([])
  // per-material reading progress for the current user (percent + completed flag)
  const [myProg, setMyProg] = useState<Record<string, { percent: number; complete: boolean }>>({})
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [completions, setCompletions] = useState<StudentCompletionSummary[]>([])
  const [activeTab, setActiveTab] = useState<ActiveTab>('materials')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Material | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewing, setViewing] = useState<Material | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [reordering, setReordering] = useState(false)
  const [studentSearch, setStudentSearch] = useState('')
  const [studentKelas, setStudentKelas] = useState('')
  const [compKelas, setCompKelas] = useState('')
  const [materialSearch, setMaterialSearch] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [newCatCode, setNewCatCode] = useState('')
  const [newCatName, setNewCatName] = useState('')
  const [catError, setCatError] = useState('')

  const loadCourse = useCallback(async () => {
    if (!id) return
    try { setCourse(await courseClient.getCourse({ id })) }
    catch (err: unknown) { setError(err instanceof Error ? err.message : 'Gagal memuat data kelas') }
  }, [id])

  // Per-material progress read from localStorage (written by MaterialViewer).
  // Local-only so the list doesn't fire one getMyCompletion request per material
  // (which made Materi Umum very slow). The viewer keeps lms_pct in sync.
  const loadMyProgress = useCallback((mats: Material[]) => {
    const entries = mats.map((m) => {
      let percent = 0
      try {
        const raw = localStorage.getItem(`lms_pct_${m.id}`)
        if (raw) percent = parseInt(raw, 10) || 0
      } catch { /* ignore */ }
      return [m.id, { percent, complete: percent >= 100 }] as const
    })
    setMyProg(Object.fromEntries(entries))
  }, [])

  const loadMaterials = useCallback(async () => {
    if (!id) return
    try {
      const res = await materialClient.listMaterials({ courseId: id, pagination: { page: 1, pageSize: 200 } })
      setMaterials(res.materials)
      loadMyProgress(res.materials)
    } catch { setMaterials([]) }
  }, [id, loadMyProgress])

  const loadStudents = useCallback(async () => {
    if (!id || !canManage) return
    try {
      const res = await courseClient.getCourseStudents({ courseId: id, pagination: { page: 1, pageSize: 200 } })
      setEnrollments(res.enrollments)
    } catch { setEnrollments([]) }
  }, [id, canManage])

  const loadCompletions = useCallback(async () => {
    if (!id || !canManage) return
    try {
      const res = await materialClient.listCompletions({ courseId: id })
      setCompletions(res.students)
    } catch { setCompletions([]) }
  }, [id, canManage])

  const loadCategories = useCallback(async () => {
    try { const r = await materialClient.listCategories({}); setCategories(r.categories) } catch { setCategories([]) }
  }, [])

  const addCategory = async () => {
    const code = newCatCode.trim(); const name = newCatName.trim()
    if (!code || !name) { setCatError('Kode dan nama kategori wajib diisi.'); return }
    setCatError('')
    try {
      await materialClient.createCategory({ code, name })
      setNewCatCode(''); setNewCatName(''); await loadCategories()
    } catch (e: unknown) { setCatError(e instanceof Error ? e.message : 'Gagal membuat kategori') }
  }
  const delCategory = (c: Category) => setConfirm({
    title: 'Hapus Kategori', message: `Hapus kategori "${c.code} — ${c.name}"? Materi yang memakainya akan kehilangan kategori.`,
    variant: 'danger', confirmLabel: 'Ya, Hapus',
    onConfirm: async () => { try { await materialClient.deleteCategory({ id: c.id }); await loadCategories() } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Gagal') } },
  })

  useEffect(() => {
    setLoading(true)
    Promise.all([loadCourse(), loadMaterials()]).finally(() => setLoading(false))
  }, [loadCourse, loadMaterials])

  useEffect(() => { if (activeTab === 'students') loadStudents() }, [activeTab, loadStudents])
  useEffect(() => { if (activeTab === 'completions') loadCompletions() }, [activeTab, loadCompletions])
  useEffect(() => { if (activeTab === 'categories') loadCategories() }, [activeTab, loadCategories])

  const openCreate = () => { setEditing(null); setFormOpen(true) }
  const openEdit = (m: Material) => {
    setConfirm({
      title: 'Edit Materi',
      message: `Anda akan mengubah materi "${m.title}". Lanjutkan?`,
      variant: 'primary',
      confirmLabel: 'Ya, Edit',
      onConfirm: () => { setEditing(m); setFormOpen(true) },
    })
  }
  const askDelete = (m: Material) => {
    setConfirm({
      title: 'Hapus Materi',
      message: `Yakin ingin menghapus materi "${m.title}"? Soal di dalamnya ikut terhapus.`,
      variant: 'danger',
      confirmLabel: 'Ya, Hapus',
      onConfirm: async () => {
        try { await materialClient.deleteMaterial({ id: m.id }); await loadMaterials() }
        catch (err: unknown) { alert(err instanceof Error ? err.message : 'Gagal menghapus materi') }
      },
    })
  }
  const togglePublish = async (m: Material) => {
    try { await materialClient.updateMaterial({ id: m.id, isPublished: !m.isPublished }); await loadMaterials() }
    catch (err: unknown) { alert(err instanceof Error ? err.message : 'Gagal mengubah status') }
  }

  const moveTo = async (from: number, to: number) => {
    if (to < 0 || to >= materials.length || from === to) return
    const arr = [...materials]
    const [item] = arr.splice(from, 1)
    arr.splice(to, 0, item)
    setMaterials(arr)
    setReordering(true)
    try {
      await Promise.all(arr.map((m, i) => (m.orderIndex === i
        ? Promise.resolve()
        : materialClient.updateMaterial({ id: m.id, orderIndex: i }))))
      await loadMaterials()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal mengubah urutan')
      await loadMaterials()
    } finally {
      setReordering(false)
    }
  }

  const openViewer = (m: Material) => { setViewing(m); setViewerOpen(true) }

  const handleToggleStudentActive = async (e: Enrollment) => {
    const student = e.student
    if (!student) return
    const nextActive = !student.isActive
    try {
      await userClient.updateUser({ id: student.id, isActive: nextActive })
      await loadStudents()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal mengubah status siswa')
    }
  }

  const handleResetProgress = (s: StudentCompletionSummary) => setConfirm({
    title: 'Reset Progress Siswa',
    message: `Reset semua progress "${s.studentName}" di mata pelajaran ini? Semua jawaban kuis & uraian akan dihapus dan siswa harus mengerjakan ulang.`,
    variant: 'danger', confirmLabel: 'Ya, Reset',
    onConfirm: async () => {
      try { await materialClient.resetStudentProgress({ courseId: id ?? '', studentId: s.studentId }); await loadCompletions() }
      catch (e: unknown) { alert(e instanceof Error ? e.message : 'Gagal reset progress') }
    },
  })

  const visibleMaterials = canManage ? materials : materials.filter((m) => m.isPublished)

  // Filtered lists computed at top level so the pagination hooks below run
  // unconditionally (rules of hooks) — before the early returns.
  const studentKelasOpts = useMemo(
    () => Array.from(new Set(enrollments.map((e) => e.student?.kelas).filter(Boolean))) as string[],
    [enrollments])
  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase()
    return enrollments.filter((e) => {
      const okSearch = !q || (e.student?.fullName || '').toLowerCase().includes(q) || (e.student?.email || '').toLowerCase().includes(q)
      const okKelas = !studentKelas || e.student?.kelas === studentKelas
      return okSearch && okKelas
    })
  }, [enrollments, studentSearch, studentKelas])
  const compKelasOpts = useMemo(
    () => Array.from(new Set(completions.map((s) => s.studentKelas).filter(Boolean))),
    [completions])
  const filteredCompletions = useMemo(
    () => (compKelas ? completions.filter((s) => s.studentKelas === compKelas) : completions),
    [completions, compKelas])

  // Materi Belajar search — by title or category (code/name).
  const searchedMaterials = useMemo(() => {
    const q = materialSearch.trim().toLowerCase()
    if (!q) return visibleMaterials
    return visibleMaterials.filter((m) =>
      m.title.toLowerCase().includes(q) ||
      m.categoryName.toLowerCase().includes(q) ||
      m.categoryCode.toLowerCase().includes(q))
  }, [visibleMaterials, materialSearch])

  const matPaged = usePaged(searchedMaterials, isGeneral ? 15 : 8)
  const studentPaged = usePaged(filteredStudents, 10)
  const compPaged = usePaged(filteredCompletions, 10)

  if (loading) return <AppLayout title="Detail Kelas"><Text color={COLORS.muted}>Memuat...</Text></AppLayout>
  if (error || !course) return <AppLayout title="Detail Kelas"><Text color={COLORS.danger}>{error || 'Kelas tidak ditemukan'}</Text></AppLayout>

  return (
    <AppLayout title={isGeneral ? 'Materi Umum' : ''}>
      <Box pb={10}>
        <Stack gap={6}>
          {/* Student header — Udemy-style dark banner */}
          {!isGeneral && !canManage && (() => {
            const done = visibleMaterials.filter((m) => myProg[m.id]?.complete).length
            const pct = visibleMaterials.length ? Math.round((done / visibleMaterials.length) * 100) : 0
            return (
              <Box borderRadius="12px" overflow="hidden" color="white"
                style={{ background: course.backgroundImage ? undefined : courseGradient(course.code || course.name) }}
                position="relative">
                {course.backgroundImage && (
                  <>
                    <Box position="absolute" inset={0} bgImage={`url(${course.backgroundImage})`} bgSize="cover" bgPos="center" />
                    <Box position="absolute" inset={0} bg="blackAlpha.700" />
                  </>
                )}
                <Box position="relative" p={{ base: '20px', md: '28px' }}>
                  <Flex gap="6px" align="center" mb="6px">
                    <Text fontFamily="mono" fontSize="12px" color="whiteAlpha.800">{course.code}</Text>
                  </Flex>
                  <Heading fontSize={{ base: '22px', md: '28px' }} fontWeight="800">{course.name}</Heading>
                  {course.description && <Text fontSize="14px" color="whiteAlpha.800" mt="6px" maxW="640px">{course.description}</Text>}
                  <Flex gap="16px" mt="12px" wrap="wrap" fontSize="13px" color="whiteAlpha.900" align="center">
                    <Flex gap="5px" align="center"><Icon as={LuGraduationCap} /> {course.teacher?.fullName || 'Pengajar'}</Flex>
                    <Flex gap="5px" align="center"><Icon as={LuBookOpen} /> {visibleMaterials.length} materi</Flex>
                  </Flex>
                  {visibleMaterials.length > 0 && (
                    <Box mt="14px" maxW="360px">
                      <Flex justify="space-between" fontSize="12px" color="whiteAlpha.900" mb="4px">
                        <Text>Progres belajar</Text><Text fontWeight="bold">{pct}%</Text>
                      </Flex>
                      <Box h="8px" bg="whiteAlpha.300" borderRadius="full" overflow="hidden">
                        <Box h="full" w={`${pct}%`} bg={UDEMY.accent} />
                      </Box>
                    </Box>
                  )}
                </Box>
              </Box>
            )
          })()}

          {/* Teacher header — info di kiri, foto di kanan (disembunyikan untuk Materi Umum) */}
          {!isGeneral && canManage && (
          <Box
            borderRadius="12px"
            overflow="hidden"
            border="1px solid"
            borderColor={COLORS.border}
            boxShadow="0 1px 4px rgba(0,0,0,.08)"
            bg={COLORS.surface}
          >
            <Flex>
              {/* Info kiri */}
              <Box flex={1} p={5}>
                <Stack gap={2}>
                  <HStack>
                    <Text fontFamily="mono" fontWeight="bold" fontSize="sm" color={COLORS.primary}>{course.code}</Text>
                    <Badge colorPalette={course.isActive ? 'green' : 'gray'}>{course.isActive ? 'Aktif' : 'Nonaktif'}</Badge>
                  </HStack>
                  <Heading size="lg">{course.name}</Heading>
                  {course.description && (
                    <Text fontSize="sm" color="gray.600">{course.description}</Text>
                  )}
                  <Flex gap="16px" align="center" wrap="wrap" mt={1}>
                    <Text fontSize="sm" color="gray.500">
                      Guru: <Text as="span" fontWeight="medium" color="gray.700">{course.teacher?.fullName || '-'}</Text>
                    </Text>
                    {isGeneral ? (
                      <Badge colorPalette="purple" variant="subtle">Untuk semua siswa &amp; guru</Badge>
                    ) : (
                      <>
                        <Flex gap="5px" align="center" wrap="wrap">
                          <Text fontSize="sm" color="gray.500">Kelas:</Text>
                          {course.kelas?.length > 0
                            ? course.kelas.map((k) => <Badge key={k} colorPalette="blue" variant="subtle">{k}</Badge>)
                            : <Text fontSize="sm" color="gray.400">—</Text>
                          }
                        </Flex>
                        <Text fontSize="sm" color="gray.500">{course.studentCount} murid terdaftar</Text>
                      </>
                    )}
                  </Flex>
                </Stack>
              </Box>
              {/* Foto kanan — thumbnail kecil */}
              {course.backgroundImage && (
                <Box
                  flexShrink={0}
                  w="120px"
                  h="96px"
                  m="12px"
                  ml="0"
                  bg="#0F172A"
                  borderRadius="8px"
                  overflow="hidden"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  <img
                    src={course.backgroundImage}
                    alt="Foto mata pelajaran"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      display: 'block',
                    }}
                  />
                </Box>
              )}
            </Flex>
          </Box>
          )}

          {/* Tabs */}
          <HStack gap={0} borderBottom="2px solid" borderColor="gray.200">
            <Button variant="ghost" borderRadius={0} borderBottom="2px solid"
              borderColor={activeTab === 'materials' ? COLORS.primary : 'transparent'}
              color={activeTab === 'materials' ? COLORS.primary : 'gray.600'}
              onClick={() => setActiveTab('materials')}>
              Materi Belajar ({visibleMaterials.length})
            </Button>
            {canManage && !isGeneral && (
              <Button variant="ghost" borderRadius={0} borderBottom="2px solid"
                borderColor={activeTab === 'students' ? COLORS.primary : 'transparent'}
                color={activeTab === 'students' ? COLORS.primary : 'gray.600'}
                onClick={() => setActiveTab('students')}>
                Daftar Murid ({enrollments.length})
              </Button>
            )}
            {canManage && (
              <Button variant="ghost" borderRadius={0} borderBottom="2px solid"
                borderColor={activeTab === 'completions' ? COLORS.primary : 'transparent'}
                color={activeTab === 'completions' ? COLORS.primary : 'gray.600'}
                onClick={() => setActiveTab('completions')}>
                Siswa Selesai
              </Button>
            )}
            {canManage && isGeneral && (
              <Button variant="ghost" borderRadius={0} borderBottom="2px solid"
                borderColor={activeTab === 'categories' ? COLORS.primary : 'transparent'}
                color={activeTab === 'categories' ? COLORS.primary : 'gray.600'}
                onClick={() => setActiveTab('categories')}>
                Kategori
              </Button>
            )}
          </HStack>

          {/* Materials */}
          {activeTab === 'materials' && (
            <Stack gap={3}>
              {canManage && (
                <Flex justify="space-between" align="center">
                  <Text fontSize="12px" color={COLORS.muted}>
                    {isGeneral ? '' : reordering ? 'Menyimpan urutan…' : 'Gunakan tombol naik/turun atau dropdown nomor untuk menggeser urutan materi.'}
                  </Text>
                  <Button bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} onClick={openCreate}>
                    <Icon as={LuPlus} /> Tambah Materi
                  </Button>
                </Flex>
              )}

              <Flex align="center" gap="8px" maxW="420px">
                <Icon as={LuSearch} color={COLORS.muted} />
                <Input size="sm" value={materialSearch} onChange={(e) => setMaterialSearch(e.target.value)}
                  placeholder="Cari judul atau kategori (mis. Informatika)…" />
              </Flex>

              {searchedMaterials.length === 0 ? (
                <Text color={COLORS.muted} textAlign="center" py={8}>{materialSearch ? 'Tidak ada materi yang cocok' : 'Belum ada materi'}</Text>
              ) : isGeneral ? (
                <SimpleGrid columns={{ base: 2, sm: 3, md: 4, lg: 5 }} gap="10px">
                  {matPaged.pageItems.map((m) => (
                    <Card.Root key={m.id} overflow="hidden">
                      {m.coverImage ? (
                        <Box h="80px" bgImage={`url(${m.coverImage})`} bgSize="cover" bgPos="center" />
                      ) : (
                        <Flex h="80px" bg={COLORS.bg} align="center" justify="center">
                          <Icon as={LuBookOpen} boxSize="24px" color={COLORS.muted} />
                        </Flex>
                      )}
                      <Card.Body p="8px">
                        <Stack gap={1}>
                          <HStack wrap="wrap" gap="6px">
                            {m.categoryName && <Badge colorPalette="purple" variant="subtle">{m.categoryCode ? `${m.categoryCode} · ` : ''}{m.categoryName}</Badge>}
                            {!m.isPublished && <Badge colorPalette="yellow" size="sm">Draft</Badge>}
                            {(() => {
                              const p = myProg[m.id]
                              if (!p) return null
                              if (p.complete) return <Badge colorPalette="green"><Icon as={LuCircleCheck} /> 100%</Badge>
                              if (p.percent > 0) return <Badge colorPalette="blue" variant="subtle">{p.percent}%</Badge>
                              return <Badge colorPalette="gray" variant="subtle">Belum dibaca</Badge>
                            })()}
                          </HStack>
                          <Text fontSize="13px" fontWeight="semibold" lineClamp={2}>{m.title}</Text>
                          {(m.ratingCount > 0 || m.avgRating > 0) && <StarsDisplay value={m.avgRating} count={m.ratingCount} size={11} />}
                          {/* Shown to everyone (guru & siswa) */}
                          <Text fontSize="10px" color={COLORS.muted}>
                            Dibuat oleh: {m.createdByName || '—'}
                          </Text>
                          {m.updatedByName && m.updatedByName !== m.createdByName && (
                            <Text fontSize="10px" color={COLORS.muted}>
                              Diedit oleh: {m.updatedByName}
                            </Text>
                          )}
                          <Button size="xs" variant="outline" w="full" mt="1" onClick={() => openViewer(m)}>
                            <Icon as={LuBookOpen} /> Baca
                          </Button>
                        </Stack>
                      </Card.Body>
                      {canManage && (
                        <Flex borderTop="1px solid" borderColor={COLORS.border} px="6px" py="6px" gap="4px" justify="center">
                          <IconButton size="xs" variant="outline" colorPalette={m.isPublished ? 'yellow' : 'green'}
                            aria-label="sembunyikan" title={m.isPublished ? 'Sembunyikan (jadikan draft)' : 'Publikasikan'} onClick={() => togglePublish(m)}>
                            <Icon as={m.isPublished ? LuEyeOff : LuEye} />
                          </IconButton>
                          <IconButton size="xs" variant="outline" colorPalette="blue" aria-label="edit" title="Edit" onClick={() => openEdit(m)}>
                            <Icon as={LuPencil} />
                          </IconButton>
                          <IconButton size="xs" variant="outline" colorPalette="red" aria-label="hapus" title="Hapus" onClick={() => askDelete(m)}>
                            <Icon as={LuTrash2} />
                          </IconButton>
                        </Flex>
                      )}
                    </Card.Root>
                  ))}
                </SimpleGrid>
              ) : !canManage ? (
                <Card.Root>
                  <Card.Body p="0">
                    {matPaged.pageItems.map((m, i) => {
                      const idx = (matPaged.page - 1) * matPaged.pageSize + i
                      const p = myProg[m.id]
                      const done = p?.complete
                      return (
                        <Flex key={m.id} as="button" onClick={() => openViewer(m)} w="full" textAlign="left"
                          align="center" gap="12px" px="16px" py="12px"
                          borderBottom="1px solid" borderColor={COLORS.border}
                          _hover={{ bg: UDEMY.accentTint }}>
                          <Flex w="34px" h="34px" borderRadius="full" flexShrink={0}
                            bg={done ? UDEMY.accent : '#E5E7EB'} color={done ? 'white' : UDEMY.inkMuted}
                            align="center" justify="center">
                            <Icon as={done ? LuCircleCheck : LuPlay} boxSize="15px" />
                          </Flex>
                          <Box flex={1} minW={0}>
                            <Text fontWeight="semibold" fontSize="14px" color={UDEMY.ink} lineClamp={1}>T{idx + 1}. {m.title}</Text>
                            <Flex gap="8px" align="center" mt="2px" wrap="wrap">
                              {m.categoryName && <Badge colorPalette="purple" variant="subtle">{m.categoryName}</Badge>}
                              {done ? <Text fontSize="11px" color={UDEMY.accent} fontWeight="medium">Selesai</Text>
                                : p && p.percent > 0 ? <Text fontSize="11px" color={UDEMY.inkMuted}>{p.percent}% dibaca</Text>
                                : <Text fontSize="11px" color={UDEMY.inkMuted}>Belum dibaca</Text>}
                            </Flex>
                          </Box>
                          <Icon as={LuChevronRight} color={UDEMY.inkMuted} />
                        </Flex>
                      )
                    })}
                  </Card.Body>
                </Card.Root>
              ) : (
                matPaged.pageItems.map((m, i) => {
                  const idx = (matPaged.page - 1) * matPaged.pageSize + i
                  return (
                  <Card.Root key={m.id}>
                    <Card.Body>
                      <Flex justify="space-between" align="flex-start" gap={3}>
                        <HStack align="flex-start" gap={3} flex={1}>
                          <Stack gap={1} align="center" minW="44px">
                            <Box minW="30px" h="24px" px="7px" borderRadius="999px" bg={COLORS.primary} color="white"
                              display="flex" alignItems="center" justifyContent="center" fontSize="12px" fontWeight="bold">
                              T{idx + 1}
                            </Box>
                            {canManage && (
                              <HStack gap="1">
                                <button disabled={idx === 0} onClick={() => moveTo(idx, idx - 1)} title="Naik"
                                  style={{ display: 'inline-flex', background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', opacity: idx === 0 ? 0.3 : 1 }}><Icon as={LuChevronUp} /></button>
                                <button disabled={idx === visibleMaterials.length - 1} onClick={() => moveTo(idx, idx + 1)} title="Turun"
                                  style={{ display: 'inline-flex', background: 'none', border: 'none', cursor: idx === visibleMaterials.length - 1 ? 'default' : 'pointer', opacity: idx === visibleMaterials.length - 1 ? 0.3 : 1 }}><Icon as={LuChevronDown} /></button>
                              </HStack>
                            )}
                          </Stack>

                          <Stack gap={1} flex={1}>
                            <HStack wrap="wrap">
                              <Text fontWeight="semibold">{m.title}</Text>
                              {m.categoryName && <Badge colorPalette="purple" variant="subtle">{m.categoryCode ? `${m.categoryCode} · ` : ''}{m.categoryName}</Badge>}
                              {!m.isPublished && <Badge colorPalette="yellow" size="sm">Draft</Badge>}
                              {(() => {
                                const p = myProg[m.id]
                                if (!p) return null
                                if (p.complete) return <Badge colorPalette="green"><Icon as={LuCircleCheck} /> Selesai 100%</Badge>
                                if (p.percent > 0) return <Badge colorPalette="blue" variant="subtle">{p.percent}% dibaca</Badge>
                                return <Badge colorPalette="gray" variant="subtle">Belum dibaca</Badge>
                              })()}
                            </HStack>
                            {m.description && <Text fontSize="sm" color="gray.600">{m.description}</Text>}
                            <Text fontSize="11px" color={COLORS.muted}>
                              Dibuat oleh: {m.createdByName || '—'}
                              {m.updatedByName && m.updatedByName !== m.createdByName ? ` · Diedit oleh: ${m.updatedByName}` : ''}
                            </Text>
                            <Button size="xs" variant="outline" alignSelf="flex-start" mt={1} onClick={() => openViewer(m)}>
                              <Icon as={LuBookOpen} /> Baca Materi
                            </Button>
                          </Stack>
                        </HStack>

                        {canManage && (
                          <Stack gap={2} align="flex-end">
                            <NativeSelect.Root size="xs" w="100px">
                              <NativeSelect.Field
                                value={String(idx)}
                                onChange={(e) => moveTo(idx, Number(e.target.value))}
                                title="Pindah ke posisi"
                              >
                                {visibleMaterials.map((_, i) => (
                                  <option key={i} value={i}>ke #{i + 1}</option>
                                ))}
                              </NativeSelect.Field>
                              <NativeSelect.Indicator />
                            </NativeSelect.Root>
                            <HStack gap={2}>
                              <Button size="xs" colorPalette={m.isPublished ? 'yellow' : 'green'} variant="outline" onClick={() => togglePublish(m)}>
                                {m.isPublished ? 'Sembunyikan' : 'Publikasi'}
                              </Button>
                              <Button size="xs" colorPalette="blue" variant="outline" onClick={() => openEdit(m)}><Icon as={LuPencil} /> Edit</Button>
                              <Button size="xs" colorPalette="red" variant="outline" onClick={() => askDelete(m)}><Icon as={LuTrash2} /></Button>
                            </HStack>
                          </Stack>
                        )}
                      </Flex>
                    </Card.Body>
                  </Card.Root>
                  )
                })
              )}
              <Pagination page={matPaged.page} pageSize={matPaged.pageSize} total={matPaged.total} onPageChange={matPaged.setPage} />
            </Stack>
          )}

          {/* Students */}
          {activeTab === 'students' && canManage && (
              <Card.Root><Card.Body>
                <Flex gap="10px" mb="12px" flexWrap="wrap" align="flex-end">
                  <Box flex={1} minW="200px">
                    <Text fontSize="12px" fontWeight="500" mb="4px" display="flex" alignItems="center" gap="4px"><Icon as={LuSearch} /> Cari Murid</Text>
                    <Input size="sm" value={studentSearch} onChange={(ev) => setStudentSearch(ev.target.value)} placeholder="Nama / email…" />
                  </Box>
                  <Box minW="160px">
                    <Text fontSize="12px" fontWeight="500" mb="4px">Filter Kelas</Text>
                    <NativeSelect.Root size="sm">
                      <NativeSelect.Field value={studentKelas} onChange={(ev) => setStudentKelas(ev.target.value)}>
                        <option value="">— Semua Kelas —</option>
                        {studentKelasOpts.map((k) => <option key={k} value={k}>{k}</option>)}
                      </NativeSelect.Field>
                      <NativeSelect.Indicator />
                    </NativeSelect.Root>
                  </Box>
                  <Text fontSize="12px" color={COLORS.muted}>{filteredStudents.length} dari {enrollments.length} murid</Text>
                </Flex>
                <Box overflowX="auto">
                  <Table.Root size="sm">
                    <Table.Header>
                      <Table.Row>
                        <Table.ColumnHeader>Nama</Table.ColumnHeader>
                        <Table.ColumnHeader>Kelas</Table.ColumnHeader>
                        <Table.ColumnHeader>Email</Table.ColumnHeader>
                        <Table.ColumnHeader>Terdaftar</Table.ColumnHeader>
                        <Table.ColumnHeader>Aksi</Table.ColumnHeader>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {filteredStudents.length === 0 ? (
                        <Table.Row><Table.Cell colSpan={5} textAlign="center" color={COLORS.muted}>Tidak ada murid</Table.Cell></Table.Row>
                      ) : studentPaged.pageItems.map((e) => (
                        <Table.Row key={e.id}>
                          <Table.Cell>{e.student?.fullName || '-'}</Table.Cell>
                          <Table.Cell>{e.student?.kelas ? <Badge colorPalette="blue">{e.student.kelas}</Badge> : '-'}</Table.Cell>
                          <Table.Cell>{e.student?.email || '-'}</Table.Cell>
                          <Table.Cell>{e.enrolledAt ? timestampDate(e.enrolledAt).toLocaleDateString('id-ID') : '-'}</Table.Cell>
                          <Table.Cell>
                            <Button
                              size="xs"
                              colorPalette={e.student?.isActive ? 'orange' : 'green'}
                              variant="outline"
                              onClick={() => handleToggleStudentActive(e)}>
                              {e.student?.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                            </Button>
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Root>
                </Box>
                <Pagination page={studentPaged.page} pageSize={studentPaged.pageSize} total={studentPaged.total} onPageChange={studentPaged.setPage} />
              </Card.Body></Card.Root>
          )}

          {/* Siswa Selesai */}
          {activeTab === 'completions' && canManage && (
              <Card.Root><Card.Body>
                <Flex gap="10px" mb="12px" flexWrap="wrap" align="flex-end">
                  <Box minW="160px">
                    <Text fontSize="12px" fontWeight="500" mb="4px">Filter Kelas</Text>
                    <NativeSelect.Root size="sm">
                      <NativeSelect.Field value={compKelas} onChange={(ev) => setCompKelas(ev.target.value)}>
                        <option value="">— Semua Kelas —</option>
                        {compKelasOpts.map((k) => <option key={k} value={k}>{k}</option>)}
                      </NativeSelect.Field>
                      <NativeSelect.Indicator />
                    </NativeSelect.Root>
                  </Box>
                  <Button size="sm" variant="outline" onClick={loadCompletions}><Icon as={LuRefreshCw} /> Refresh</Button>
                </Flex>
                <Box overflowX="auto">
                  <Table.Root size="sm">
                    <Table.Header>
                      <Table.Row>
                        <Table.ColumnHeader>Nama</Table.ColumnHeader>
                        <Table.ColumnHeader>Kelas</Table.ColumnHeader>
                        <Table.ColumnHeader>Selesai</Table.ColumnHeader>
                        <Table.ColumnHeader>Total Materi</Table.ColumnHeader>
                        <Table.ColumnHeader minW="160px">Progress</Table.ColumnHeader>
                        <Table.ColumnHeader>Aksi</Table.ColumnHeader>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {filteredCompletions.length === 0 ? (
                        <Table.Row><Table.Cell colSpan={6} textAlign="center" color={COLORS.muted}>Belum ada data</Table.Cell></Table.Row>
                      ) : compPaged.pageItems.map((s) => (
                        <Table.Row key={s.studentId}>
                          <Table.Cell fontWeight="medium">{s.studentName || '-'}</Table.Cell>
                          <Table.Cell>{s.studentKelas ? <Badge colorPalette="blue">{s.studentKelas}</Badge> : '-'}</Table.Cell>
                          <Table.Cell>{s.completedCount}</Table.Cell>
                          <Table.Cell>{s.totalMaterials}</Table.Cell>
                          <Table.Cell>
                            <Flex align="center" gap="8px">
                              <Box flex={1} h="8px" bg={COLORS.border} borderRadius="4px" minW="80px">
                                <Box
                                  h="8px"
                                  bg={s.percent === 100 ? COLORS.success : COLORS.primary}
                                  borderRadius="4px"
                                  style={{ width: `${s.percent}%`, transition: 'width 0.3s' }}
                                />
                              </Box>
                              <Text fontSize="12px" color={COLORS.muted} minW="36px">{s.percent}%</Text>
                            </Flex>
                          </Table.Cell>
                          <Table.Cell>
                            <Button size="xs" colorPalette="red" variant="outline" onClick={() => handleResetProgress(s)}>
                              <Icon as={LuRefreshCw} /> Reset
                            </Button>
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Root>
                </Box>
                <Pagination page={compPaged.page} pageSize={compPaged.pageSize} total={compPaged.total} onPageChange={compPaged.setPage} />
              </Card.Body></Card.Root>
          )}

          {/* Kategori (Materi Umum) */}
          {activeTab === 'categories' && canManage && isGeneral && (
            <Stack gap="14px">
              <Card.Root><Card.Body>
                <Text fontSize="14px" fontWeight="600" mb="10px">➕ Tambah Kategori</Text>
                <Flex gap="8px" flexWrap="wrap" align="flex-end">
                  <Box w="120px">
                    <Text fontSize="12px" fontWeight="500" mb="4px">Kode</Text>
                    <Input size="sm" value={newCatCode} onChange={(e) => setNewCatCode(e.target.value)} placeholder="mis. 01"
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory() } }} />
                  </Box>
                  <Box flex={1} minW="200px">
                    <Text fontSize="12px" fontWeight="500" mb="4px">Nama Kategori</Text>
                    <Input size="sm" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="mis. Informatika"
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory() } }} />
                  </Box>
                  <Button size="sm" bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} onClick={addCategory}>
                    <Icon as={LuPlus} /> Tambah
                  </Button>
                </Flex>
                {catError && <Text color={COLORS.danger} fontSize="12px" mt="6px">{catError}</Text>}
              </Card.Body></Card.Root>

              <Card.Root><Card.Body>
                <Box overflowX="auto">
                  <Table.Root size="sm">
                    <Table.Header>
                      <Table.Row>
                        <Table.ColumnHeader>Kode</Table.ColumnHeader>
                        <Table.ColumnHeader>Nama Kategori</Table.ColumnHeader>
                        <Table.ColumnHeader>Aksi</Table.ColumnHeader>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {categories.length === 0 ? (
                        <Table.Row><Table.Cell colSpan={3} textAlign="center" color={COLORS.muted}>Belum ada kategori</Table.Cell></Table.Row>
                      ) : categories.map((c) => (
                        <Table.Row key={c.id}>
                          <Table.Cell><Badge colorPalette="purple">{c.code}</Badge></Table.Cell>
                          <Table.Cell fontWeight="medium">{c.name}</Table.Cell>
                          <Table.Cell>
                            <Button size="xs" colorPalette="red" variant="outline" onClick={() => delCategory(c)}>
                              <Icon as={LuTrash2} /> Hapus
                            </Button>
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Root>
                </Box>
              </Card.Body></Card.Root>
            </Stack>
          )}
        </Stack>
      </Box>

      <MaterialFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        courseId={id ?? ''}
        courseName={`${course.code} — ${course.name}`}
        material={editing}
        defaultOrderIndex={materials.length}
        onSaved={loadMaterials}
      />
      <MaterialViewer open={viewerOpen} onClose={() => { setViewerOpen(false); loadMyProgress(materials) }} material={viewing} />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </AppLayout>
  )
}
