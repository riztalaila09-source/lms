import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Badge, Box, Button, Dialog, Field, Flex, Icon, Input, NativeSelect, SimpleGrid, Stack, Table, Text, Wrap,
} from '@chakra-ui/react'
import { LuEye, LuPencil, LuTrash2, LuX, LuPlus, LuSearch } from 'react-icons/lu'
import { courseClient, userClient, classClient } from '@/lib/client'
import type { Course } from '@/gen/course/v1/course_pb'
import type { User } from '@/gen/user/v1/user_pb'
import { Role } from '@/gen/user/v1/user_pb'
import type { Class } from '@/gen/class/v1/class_pb'
import { useAuth } from '@/hooks/useAuth'
import AppLayout from '@/components/AppLayout'
import CourseCard from '@/components/CourseCard'
import ConfirmDialog, { type ConfirmState } from '@/components/ConfirmDialog'
import Pagination, { usePaged } from '@/components/Pagination'
import { COLORS, UDEMY } from '@/theme/tokens'
import { fileToDataUrl } from '@/lib/image'

interface CourseForm {
  id: string
  code: string
  name: string
  description: string
  teacherId: string
  backgroundImage: string
}
const DEFAULT_FORM: CourseForm = { id: '', code: '', name: '', description: '', teacherId: '', backgroundImage: '' }

export default function CoursesPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const canManage = user?.role === Role.TEACHER || user?.role === Role.ADMIN

  const [courses, setCourses] = useState<Course[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<CourseForm>(DEFAULT_FORM)
  const [formError, setFormError] = useState('')
  const [formLoading, setFormLoading] = useState(false)
  const [teachers, setTeachers] = useState<User[]>([])

  const [classes, setClasses] = useState<Class[]>([])
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([])
  const [newClassName, setNewClassName] = useState('')
  const [creatingClass, setCreatingClass] = useState(false)
  const [uploadingBg, setUploadingBg] = useState(false)

  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [catalogSearch, setCatalogSearch] = useState('')

  const loadCourses = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await courseClient.listCourses({ pagination: { page: 1, pageSize: 50 } })
      setCourses(res.courses)
      setTotal(res.pagination?.total ?? 0)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data kelas')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadTeachers = useCallback(async () => {
    try {
      const res = await userClient.listUsers({ roleFilter: Role.TEACHER, pagination: { page: 1, pageSize: 100 } })
      setTeachers(res.users)
    } catch { /* ignore */ }
  }, [])

  const loadClasses = useCallback(async () => {
    try {
      const res = await classClient.listClasses({})
      setClasses(res.classes)
      return res.classes
    } catch { return [] as Class[] }
  }, [])

  useEffect(() => { loadCourses() }, [loadCourses])

  const openCreate = () => {
    setForm({ ...DEFAULT_FORM, teacherId: user?.id ?? '' })
    setSelectedClassIds([])
    setNewClassName('')
    setFormError('')
    loadTeachers()
    loadClasses()
    setDialogOpen(true)
  }

  const openEdit = (c: Course) => {
    setConfirm({
      title: 'Edit Mata Pelajaran',
      message: `Anda akan mengubah data "${c.name}". Lanjutkan?`,
      variant: 'primary',
      confirmLabel: 'Ya, Edit',
      onConfirm: async () => {
        setNewClassName('')
        setFormError('')
        loadTeachers()
        const cls = await loadClasses()
        // List doesn't return the background image; fetch the full course for it.
        let bg = ''
        try { bg = (await courseClient.getCourse({ id: c.id })).backgroundImage } catch { /* ignore */ }
        setForm({ id: c.id, code: c.code, name: c.name, description: c.description, teacherId: c.teacher?.id ?? '', backgroundImage: bg })
        setSelectedClassIds(cls.filter((k) => c.kelas.includes(k.name)).map((k) => k.id))
        setDialogOpen(true)
      },
    })
  }

  const handleToggleActive = async (c: Course) => {
    try {
      await courseClient.updateCourse({ id: c.id, isActive: !c.isActive })
      await loadCourses()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal mengubah status kelas')
    }
  }

  const askDelete = (c: Course) => {
    setConfirm({
      title: 'Hapus Mata Pelajaran',
      message: `Yakin ingin menghapus "${c.name}"? Semua materi & tugas di dalamnya ikut terhapus dan tidak bisa dikembalikan.`,
      variant: 'danger',
      confirmLabel: 'Ya, Hapus',
      onConfirm: async () => {
        try { await courseClient.deleteCourse({ id: c.id }); await loadCourses() }
        catch (err: unknown) { alert(err instanceof Error ? err.message : 'Gagal menghapus kelas') }
      },
    })
  }

  const toggleClass = (id: string) =>
    setSelectedClassIds((arr) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]))
  const selectAllClasses = () => setSelectedClassIds(classes.map((c) => c.id))
  const clearClasses = () => setSelectedClassIds([])

  const createClassInline = async () => {
    const name = newClassName.trim()
    if (!name) return
    setCreatingClass(true)
    try {
      const c = await classClient.createClass({ name })
      setNewClassName('')
      await loadClasses()
      setSelectedClassIds((arr) => [...arr, c.id]) // auto-check the new class
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal membuat kelas')
    } finally {
      setCreatingClass(false)
    }
  }

  const handleBgUpload = async (file?: File) => {
    if (!file) return
    setUploadingBg(true)
    try {
      const dataUrl = await fileToDataUrl(file, 1280, 0.8)
      setForm((f) => ({ ...f, backgroundImage: dataUrl }))
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal memuat gambar')
    } finally {
      setUploadingBg(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setFormLoading(true)
    try {
      if (form.id) {
        await courseClient.updateCourse({
          id: form.id, code: form.code, name: form.name,
          description: form.description, teacherId: form.teacherId, classIds: selectedClassIds,
          backgroundImage: form.backgroundImage,
        })
      } else {
        await courseClient.createCourse({
          code: form.code, name: form.name, description: form.description,
          teacherId: form.teacherId, classIds: selectedClassIds, backgroundImage: form.backgroundImage,
        })
      }
      setDialogOpen(false)
      await loadCourses()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Gagal menyimpan kelas')
    } finally {
      setFormLoading(false)
    }
  }

  const coursesPaged = usePaged(courses, 10)

  const filteredCourses = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase()
    if (!q) return courses
    return courses.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      (c.teacher?.fullName || '').toLowerCase().includes(q))
  }, [courses, catalogSearch])
  const catalogPaged = usePaged(filteredCourses, 12)

  // ── Student catalog (Udemy-style cards) ──
  if (!canManage) {
    return (
      <AppLayout title="Mata Pelajaran" subtitle="Kelas yang Anda ikuti">
        <Stack gap="18px">
          {error && <Text color="red.500" fontSize="sm">{error}</Text>}
          <Flex align="center" gap="8px" maxW="420px"
            border="1px solid" borderColor={UDEMY.border} borderRadius="8px" px="12px" py="2px">
            <Icon as={LuSearch} color={UDEMY.inkMuted} />
            <Input variant="subtle" border="none" _focus={{ boxShadow: 'none' }} px="0"
              placeholder="Cari mata pelajaran…" value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)} />
          </Flex>

          {loading ? (
            <Text color={UDEMY.inkMuted}>Memuat…</Text>
          ) : filteredCourses.length === 0 ? (
            <Text color={UDEMY.inkMuted} py={6}>{catalogSearch ? 'Tidak ada mata pelajaran yang cocok.' : 'Belum ada mata pelajaran yang diikuti.'}</Text>
          ) : (
            <>
              <SimpleGrid columns={{ base: 2, md: 3, lg: 4, xl: 5 }} gap="16px">
                {catalogPaged.pageItems.map((c) => (
                  <CourseCard key={c.id} course={c} onClick={() => navigate(`/courses/${c.id}`)} />
                ))}
              </SimpleGrid>
              <Pagination page={catalogPaged.page} pageSize={catalogPaged.pageSize} total={catalogPaged.total} onPageChange={catalogPaged.setPage} />
            </>
          )}
        </Stack>
      </AppLayout>
    )
  }

  return (
    <AppLayout
      title="Mata Pelajaran"
      subtitle={`Total: ${total} mata pelajaran`}
      actions={canManage ? <Button bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} onClick={openCreate}><Icon as={LuPlus} /> Tambah Mata Pelajaran</Button> : undefined}
    >
      <Stack gap={6}>
        {error && <Text color="red.500" fontSize="sm">{error}</Text>}

        <Box overflowX="auto"><Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Kode</Table.ColumnHeader>
              <Table.ColumnHeader>Nama Mapel</Table.ColumnHeader>
              <Table.ColumnHeader>Kelas</Table.ColumnHeader>
              <Table.ColumnHeader>Guru</Table.ColumnHeader>
              <Table.ColumnHeader>Murid</Table.ColumnHeader>
              <Table.ColumnHeader>Aksi</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {loading ? (
              <Table.Row><Table.Cell colSpan={6} textAlign="center" color="gray.500">Memuat...</Table.Cell></Table.Row>
            ) : courses.length === 0 ? (
              <Table.Row><Table.Cell colSpan={6} textAlign="center" color="gray.500">Belum ada mata pelajaran</Table.Cell></Table.Row>
            ) : (
              coursesPaged.pageItems.map((course) => (
                <Table.Row key={course.id} cursor="pointer" _hover={{ bg: 'gray.50' }}
                  onClick={() => navigate(`/courses/${course.id}`)}>
                  <Table.Cell fontFamily="mono" fontWeight="medium" color={COLORS.primary}>{course.code}</Table.Cell>
                  <Table.Cell>{course.name}</Table.Cell>
                  <Table.Cell>
                    {course.kelas.length === 0 ? <Text color="gray.400" fontSize="xs">—</Text> : (
                      <Wrap gap="1">
                        {course.kelas.map((k) => <Badge key={k} colorPalette="blue">{k}</Badge>)}
                      </Wrap>
                    )}
                  </Table.Cell>
                  <Table.Cell>{course.teacher?.fullName || '-'}</Table.Cell>
                  <Table.Cell>{course.studentCount} murid</Table.Cell>
                  <Table.Cell onClick={(e) => e.stopPropagation()}>
                    <Flex gap="6px">
                      <Button size="xs" variant="outline" onClick={() => navigate(`/courses/${course.id}`)}><Icon as={LuEye} /> Buka</Button>
                      {canManage && (
                        <>
                          <Button size="xs" colorPalette={course.isActive ? 'orange' : 'green'} variant="outline"
                            onClick={() => handleToggleActive(course)}>
                            {course.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                          </Button>
                          <Button size="xs" colorPalette="blue" variant="outline" onClick={() => openEdit(course)}><Icon as={LuPencil} /> Edit</Button>
                          <Button size="xs" colorPalette="red" variant="outline" onClick={() => askDelete(course)}><Icon as={LuTrash2} /> Hapus</Button>
                        </>
                      )}
                    </Flex>
                  </Table.Cell>
                </Table.Row>
              ))
            )}
          </Table.Body>
        </Table.Root></Box>
        <Pagination page={coursesPaged.page} pageSize={coursesPaged.pageSize} total={coursesPaged.total} onPageChange={coursesPaged.setPage} />
      </Stack>

      {/* Create/Edit dialog */}
      <Dialog.Root open={dialogOpen} onOpenChange={(e) => setDialogOpen(e.open)} scrollBehavior="inside">
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxW="560px">
            <Dialog.Header><Dialog.Title>{form.id ? 'Edit Mata Pelajaran' : 'Tambah Mata Pelajaran'}</Dialog.Title></Dialog.Header>
            <Dialog.Body>
              <form id="course-form" onSubmit={handleSave}>
                <Stack gap={4}>
                  <Field.Root required>
                    <Field.Label>Kode</Field.Label>
                    <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="MTK-10" required />
                  </Field.Root>
                  <Field.Root required>
                    <Field.Label>Nama Mata Pelajaran</Field.Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Matematika" required />
                  </Field.Root>
                  <Field.Root>
                    <Field.Label>Deskripsi</Field.Label>
                    <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Deskripsi singkat" />
                  </Field.Root>

                  {/* Background image */}
                  <Box>
                    <Text fontSize="13px" fontWeight="600" mb="6px">Foto Latar (opsional)</Text>
                    {form.backgroundImage ? (
                      <Box position="relative" borderRadius="8px" overflow="hidden" mb="6px">
                        <Box h="110px" bgImage={`url(${form.backgroundImage})`} bgSize="cover" bgPos="center" />
                        <Button size="2xs" colorPalette="red" position="absolute" top="6px" right="6px"
                          onClick={() => setForm({ ...form, backgroundImage: '' })}><Icon as={LuX} /> Hapus</Button>
                      </Box>
                    ) : (
                      <Text fontSize="12px" color={COLORS.muted} mb="6px">Belum ada foto. Tampil sebagai banner di halaman mapel (guru & siswa).</Text>
                    )}
                    <input type="file" accept="image/*" disabled={uploadingBg}
                      onChange={(e) => handleBgUpload(e.target.files?.[0])} style={{ fontSize: 12 }} />
                    {uploadingBg && <Text fontSize="11px" color={COLORS.muted}>Memproses gambar…</Text>}
                  </Box>

                  <Field.Root required>
                    <Field.Label>Guru Pengampu</Field.Label>
                    <NativeSelect.Root>
                      <NativeSelect.Field value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })}>
                        <option value="">-- Pilih Guru --</option>
                        {teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName || t.username}</option>)}
                      </NativeSelect.Field>
                      <NativeSelect.Indicator />
                    </NativeSelect.Root>
                  </Field.Root>

                  {/* Kelas multi-select */}
                  <Box>
                    <Flex justify="space-between" align="center" mb="6px">
                      <Text fontSize="13px" fontWeight="600">Diberikan ke Kelas</Text>
                      <Flex gap="6px">
                        <Button size="2xs" variant="ghost" onClick={selectAllClasses}>Pilih Semua</Button>
                        <Button size="2xs" variant="ghost" onClick={clearClasses}>Kosongkan</Button>
                      </Flex>
                    </Flex>
                    {classes.length === 0 ? (
                      <Text fontSize="12px" color={COLORS.muted}>Belum ada kelas. Buat di bawah atau di menu "Kelola Akun".</Text>
                    ) : (
                      <Wrap gap="8px">
                        {classes.map((c) => {
                          const checked = selectedClassIds.includes(c.id)
                          return (
                            <Flex key={c.id} as="label" align="center" gap="6px" px="10px" py="6px"
                              borderRadius="7px" border="1px solid" cursor="pointer"
                              borderColor={checked ? COLORS.primary : COLORS.border}
                              bg={checked ? '#DBEAFE' : COLORS.surface}>
                              <input type="checkbox" checked={checked} onChange={() => toggleClass(c.id)} />
                              <Text fontSize="13px">{c.name}</Text>
                            </Flex>
                          )
                        })}
                      </Wrap>
                    )}
                    {/* inline create */}
                    <Flex gap="6px" mt="8px">
                      <Input size="sm" placeholder="Nama kelas baru (mis. X TKJ 1)" value={newClassName}
                        onChange={(e) => setNewClassName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createClassInline() } }} />
                      <Button size="sm" variant="outline" loading={creatingClass} onClick={createClassInline}><Icon as={LuPlus} /> Buat Kelas</Button>
                    </Flex>
                  </Box>

                  {formError && <Text color="red.500" fontSize="sm">{formError}</Text>}
                </Stack>
              </form>
            </Dialog.Body>
            <Dialog.Footer>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
              <Button type="submit" form="course-form" bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} loading={formLoading}>
                Simpan
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </AppLayout>
  )
}
