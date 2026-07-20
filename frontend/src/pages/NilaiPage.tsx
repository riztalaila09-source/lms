import { useEffect, useState, useCallback } from 'react'
import { Badge, Box, Button, Flex, Icon, Input, NativeSelect, Stack, Table, Text } from '@chakra-ui/react'
import { LuTrophy, LuSearch, LuDownload } from 'react-icons/lu'
import { assignmentClient, courseClient } from '@/lib/client'
import type { GradeRow, GradeCell, SubjectGrade } from '@/gen/assignment/v1/assignment_pb'
import type { Course } from '@/gen/course/v1/course_pb'
import { Role } from '@/gen/user/v1/user_pb'
import { useAuth } from '@/hooks/useAuth'
import AppLayout from '@/components/AppLayout'
import { Card } from '@/components/Card'
import Pagination, { usePaged } from '@/components/Pagination'
import { COLORS } from '@/theme/tokens'

// Role-aware: students see their own per-subject grades; staff see the full grid.
export default function NilaiPage() {
  const { user } = useAuth()
  const isManager = user?.role === Role.ADMIN || user?.role === Role.TEACHER
  return isManager ? <TeacherNilai /> : <StudentNilai />
}

function gradeColor(avg: number) {
  return avg >= 75 ? COLORS.success : avg >= 60 ? '#D97706' : COLORS.danger
}

function StudentNilai() {
  const [subjects, setSubjects] = useState<SubjectGrade[]>([])
  const [overall, setOverall] = useState(0)
  const [hasGrade, setHasGrade] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    assignmentClient.listMyGrades({})
      .then((r) => { setSubjects(r.subjects); setOverall(r.overallAverage); setHasGrade(r.hasGrade) })
      .catch(() => { setSubjects([]) })
      .finally(() => setLoading(false))
  }, [])

  return (
    <AppLayout title={<><Icon as={LuTrophy} /> Nilai Saya</>} subtitle="Rata-rata nilai per mata pelajaran">
      <Stack gap="14px" maxW="760px">
        <Card>
          <Flex align="center" justify="space-between" gap="12px">
            <Box>
              <Text fontSize="13px" color={COLORS.muted}>Rata-rata Keseluruhan</Text>
              <Text fontSize="34px" fontWeight="bold" color={hasGrade ? gradeColor(overall) : COLORS.muted} lineHeight="1.1">
                {hasGrade ? overall.toFixed(1) : '–'}
              </Text>
              <Text fontSize="11px" color={COLORS.muted}>dari skala 100</Text>
            </Box>
            <Flex w="64px" h="64px" borderRadius="full" bg={COLORS.primaryTint} align="center" justify="center">
              <Icon as={LuTrophy} boxSize="30px" color={COLORS.primary} />
            </Flex>
          </Flex>
        </Card>

        <Card>
          <Table.Root size="sm">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>Mata Pelajaran</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="center">Tugas Dinilai</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="center">Nilai Rata-rata</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {loading ? (
                <Table.Row><Table.Cell colSpan={3} textAlign="center" color={COLORS.muted}>Memuat…</Table.Cell></Table.Row>
              ) : subjects.length === 0 ? (
                <Table.Row><Table.Cell colSpan={3} textAlign="center" color={COLORS.muted}>Belum ada mata pelajaran</Table.Cell></Table.Row>
              ) : subjects.map((s) => (
                <Table.Row key={s.courseId}>
                  <Table.Cell fontWeight="medium">{s.courseName}</Table.Cell>
                  <Table.Cell textAlign="center" color={COLORS.muted}>{s.gradedCount} / {s.assignmentCount}</Table.Cell>
                  <Table.Cell textAlign="center">
                    {s.hasGrade ? (
                      <Badge colorPalette={s.average >= 75 ? 'green' : s.average >= 60 ? 'orange' : 'red'} fontSize="13px" px="8px">
                        {s.average.toFixed(1)}
                      </Badge>
                    ) : <Text color={COLORS.muted}>belum dinilai</Text>}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Card>
        <Text fontSize="11px" color={COLORS.muted}>Nilai dihitung sebagai persen (skor ÷ nilai maksimal × 100), dirata-rata per mata pelajaran.</Text>
      </Stack>
    </AppLayout>
  )
}

function TeacherNilai() {
  const [courses, setCourses] = useState<Course[]>([])
  const [columns, setColumns] = useState<GradeCell[]>([])
  const [rows, setRows] = useState<GradeRow[]>([])
  const [loading, setLoading] = useState(false)

  const [courseId, setCourseId] = useState('')
  const [kelas, setKelas] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    courseClient.listCourses({ pagination: { page: 1, pageSize: 200 } })
      .then((r) => setCourses(r.courses)).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await assignmentClient.listGrades({
        courseId: courseId || undefined,
        kelas: kelas || undefined,
        search: search || undefined,
      })
      setColumns(res.columns)
      setRows(res.rows)
    } catch {
      setColumns([])
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [courseId, kelas, search])

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  const kelasOptions = Array.from(new Set(rows.map((r) => r.kelas).filter(Boolean))).sort()
  const rowsPaged = usePaged(rows, 12)

  const exportCsv = (groupBy: 'none' | 'kelas' | 'jurusan') => {
    const header = ['Nama', 'Kelas', 'Jurusan', ...columns.map((c) => c.assignmentTitle), 'Rata-rata']
    let data = [...rows]
    if (groupBy === 'kelas') data.sort((a, b) => a.kelas.localeCompare(b.kelas))
    if (groupBy === 'jurusan') data.sort((a, b) => a.jurusan.localeCompare(b.jurusan))

    const lines = [header.join(',')]
    for (const r of data) {
      const cells = r.cells.map((c) => (c.hasScore ? String(c.score) : '0'))
      const avg = r.average.toFixed(1)
      lines.push([csv(r.studentName), csv(r.kelas), csv(r.jurusan), ...cells, avg].join(','))
    }
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nilai${groupBy !== 'none' ? '-per-' + groupBy : ''}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <AppLayout title={<><Icon as={LuTrophy} /> Nilai Murid</>} subtitle="Rekap nilai per tugas + export CSV">
      <Stack gap="14px">
        <Card>
          <Flex gap="10px" flexWrap="wrap" align="flex-end">
            <Box minW="170px">
              <Text fontSize="12px" fontWeight="500" mb="4px">Mata Pelajaran</Text>
              <NativeSelect.Root size="sm">
                <NativeSelect.Field value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                  <option value="">— Semua —</option>
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </Box>
            <Box minW="130px">
              <Text fontSize="12px" fontWeight="500" mb="4px">Kelas</Text>
              <NativeSelect.Root size="sm">
                <NativeSelect.Field value={kelas} onChange={(e) => setKelas(e.target.value)}>
                  <option value="">— Semua —</option>
                  {kelasOptions.map((k) => <option key={k} value={k}>{k}</option>)}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </Box>
            <Box flex={1} minW="160px">
              <Text fontSize="12px" fontWeight="500" mb="4px" display="flex" alignItems="center" gap="4px"><Icon as={LuSearch} /> Cari Murid</Text>
              <Input size="sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nama murid…" />
            </Box>
            <Flex gap="6px" flexWrap="wrap">
              <Button size="sm" bg={COLORS.success} color="white" onClick={() => exportCsv('none')}><Icon as={LuDownload} /> CSV</Button>
              <Button size="sm" variant="outline" onClick={() => exportCsv('kelas')}>per Kelas</Button>
              <Button size="sm" variant="outline" onClick={() => exportCsv('jurusan')}>per Jurusan</Button>
            </Flex>
          </Flex>
        </Card>

        <Card>
          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader position="sticky" left={0} bg={COLORS.bg}>Nama</Table.ColumnHeader>
                  <Table.ColumnHeader>Kelas</Table.ColumnHeader>
                  {columns.map((c, i) => (
                    <Table.ColumnHeader key={c.assignmentId} title={c.assignmentTitle} textAlign="center">
                      {i + 1}
                    </Table.ColumnHeader>
                  ))}
                  <Table.ColumnHeader>Rata²</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {loading ? (
                  <Table.Row><Table.Cell colSpan={columns.length + 3} textAlign="center" color={COLORS.muted}>Memuat…</Table.Cell></Table.Row>
                ) : rows.length === 0 ? (
                  <Table.Row><Table.Cell colSpan={columns.length + 3} textAlign="center" color={COLORS.muted}>Belum ada data nilai</Table.Cell></Table.Row>
                ) : rowsPaged.pageItems.map((r) => (
                  <Table.Row key={r.studentId}>
                    <Table.Cell position="sticky" left={0} bg={COLORS.surface} fontWeight="medium">{r.studentName}</Table.Cell>
                    <Table.Cell>
                      {r.kelas && <Badge colorPalette="blue">{r.kelas}</Badge>}
                      {r.jurusan && <Badge ml="1" colorPalette="purple">{r.jurusan}</Badge>}
                    </Table.Cell>
                    {r.cells.map((c) => (
                      <Table.Cell key={c.assignmentId} textAlign="center">
                        {c.hasScore ? (
                          <Text color={c.score >= c.maxScore * 0.6 ? COLORS.success : COLORS.danger} fontWeight="medium">
                            {c.score}
                          </Text>
                        ) : (
                          <Text color={COLORS.muted}>0</Text>
                        )}
                      </Table.Cell>
                    ))}
                    <Table.Cell textAlign="center" fontWeight="bold" color={COLORS.primary}>
                      {r.average.toFixed(1)}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Box>
          <Pagination page={rowsPaged.page} pageSize={rowsPaged.pageSize} total={rowsPaged.total} onPageChange={rowsPaged.setPage} />

          {columns.length > 0 && (
            <Box mt="14px" pt="12px" borderTop="1px solid" borderColor={COLORS.border}>
              <Text fontSize="12px" fontWeight="700" mb="8px" color={COLORS.text}>Keterangan Nomor Tugas</Text>
              <Stack gap="3px">
                {columns.map((c, i) => (
                  <Flex key={c.assignmentId} gap="6px" align="baseline">
                    <Text fontSize="12px" fontWeight="700" color={COLORS.primary} minW="20px">{i + 1}.</Text>
                    <Text fontSize="12px" color={COLORS.text}>
                      {c.assignmentTitle} <Text as="span" color={COLORS.muted}>(nilai maksimal {c.maxScore})</Text>
                    </Text>
                  </Flex>
                ))}
              </Stack>
            </Box>
          )}
        </Card>
      </Stack>
    </AppLayout>
  )
}

function csv(s: string) {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}
