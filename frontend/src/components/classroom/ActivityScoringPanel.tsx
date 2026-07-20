import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Box, Button, Flex, Icon, Input, NativeSelect, Spinner, Table, Text } from '@chakra-ui/react'
import { LuCalendarDays, LuPlus, LuSearch } from 'react-icons/lu'
import { classroomClient } from '@/lib/client'
import { COLORS } from '@/theme/tokens'
import { toaster } from '@/components/ui/toaster'

interface Row { studentId: string; studentName: string; studentKelas: string; dayPoints: number; add: number }

function todayWIB(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
}

/**
 * Penilaian keaktifan (poin kumulatif) saat guru "baca materi": klik nama → beri
 * nilai 1–10; boleh berkali-kali untuk murid yang sama. Ada pencarian nama &
 * filter per kelas. Guru saja.
 */
export default function ActivityScoringPanel({ courseId }: { courseId: string }) {
  const [tanggal, setTanggal] = useState(todayWIB())
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [kelas, setKelas] = useState('')

  const load = useCallback(async () => {
    if (!courseId || !tanggal) return
    setLoading(true)
    try {
      const res = await classroomClient.listLeaderboard({ courseId, tanggal })
      setRows(res.entries
        .map((e) => ({ studentId: e.studentId, studentName: e.studentName, studentKelas: e.studentKelas, dayPoints: e.points, add: 10 }))
        .sort((a, b) => a.studentName.localeCompare(b.studentName)))
    } catch (e) {
      toaster.create({ description: e instanceof Error ? e.message : 'Gagal memuat data', type: 'error' })
      setRows([])
    } finally { setLoading(false) }
  }, [courseId, tanggal])
  useEffect(() => { load() }, [load])

  const kelasOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.studentKelas).filter(Boolean))).sort(),
    [rows])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) =>
      (!q || r.studentName.toLowerCase().includes(q)) &&
      (!kelas || r.studentKelas === kelas))
  }, [rows, search, kelas])

  const setRowById = (id: string, patch: Partial<Row>) =>
    setRows((arr) => arr.map((r) => (r.studentId === id ? { ...r, ...patch } : r)))

  const give = async (r: Row) => {
    const points = Math.max(1, Math.min(10, r.add || 0))
    setSavingId(r.studentId)
    try {
      const res = await classroomClient.addActivityPoint({ courseId, studentId: r.studentId, tanggal, points })
      setRowById(r.studentId, { dayPoints: res.dayPoints })
      toaster.create({ description: `+${points} untuk ${r.studentName} (hari ini: ${res.dayPoints})`, type: 'success' })
    } catch (e) {
      toaster.create({ description: e instanceof Error ? e.message : 'Gagal memberi nilai', type: 'error' })
    } finally { setSavingId(null) }
  }

  return (
    <Box>
      <Flex align="center" gap="10px" mb="10px" wrap="wrap">
        <Flex align="center" gap="6px"><Icon as={LuCalendarDays} color={COLORS.primary} /><Text fontSize="13px" fontWeight="600" color={COLORS.muted}>Tanggal:</Text></Flex>
        <Input type="date" size="sm" w="160px" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
        <Text fontSize="11px" color={COLORS.muted}>Klik “Beri” untuk menambah poin — bisa berkali-kali.</Text>
      </Flex>

      <Flex align="center" gap="8px" mb="12px" wrap="wrap">
        <Flex align="center" gap="6px" flex="1" minW="180px" border="1px solid" borderColor={COLORS.border} borderRadius="6px" px="8px">
          <Icon as={LuSearch} color={COLORS.muted} />
          <Input size="sm" variant="outline" border="none" px="0" placeholder="Cari nama murid…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </Flex>
        <NativeSelect.Root size="sm" w="170px">
          <NativeSelect.Field value={kelas} onChange={(e) => setKelas(e.target.value)}>
            <option value="">Semua kelas</option>
            {kelasOptions.map((k) => <option key={k} value={k}>{k}</option>)}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </Flex>

      {loading ? (
        <Flex justify="center" py="24px"><Spinner color={COLORS.primary} /></Flex>
      ) : rows.length === 0 ? (
        <Text fontSize="13px" color={COLORS.muted} py="12px">Belum ada murid terdaftar di mapel ini.</Text>
      ) : filtered.length === 0 ? (
        <Text fontSize="13px" color={COLORS.muted} py="12px">Tidak ada murid yang cocok dengan pencarian/filter.</Text>
      ) : (
        <Box overflowX="auto">
          <Table.Root size="sm">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>Nama</Table.ColumnHeader>
                <Table.ColumnHeader>Kelas</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="center">Poin hari ini</Table.ColumnHeader>
                <Table.ColumnHeader w="180px">Beri nilai</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {filtered.map((r) => (
                <Table.Row key={r.studentId}>
                  <Table.Cell fontWeight="600">{r.studentName}</Table.Cell>
                  <Table.Cell><Badge variant="subtle">{r.studentKelas || '-'}</Badge></Table.Cell>
                  <Table.Cell textAlign="center">
                    <Badge colorPalette={r.dayPoints > 0 ? 'green' : 'gray'} fontSize="12px">{r.dayPoints}</Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <Flex gap="6px" align="center">
                      <NativeSelect.Root size="xs" w="64px">
                        <NativeSelect.Field value={String(r.add)} onChange={(e) => setRowById(r.studentId, { add: Number(e.target.value) })}>
                          {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                        </NativeSelect.Field>
                        <NativeSelect.Indicator />
                      </NativeSelect.Root>
                      <Button size="xs" bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }}
                        loading={savingId === r.studentId} onClick={() => give(r)}>
                        <Icon as={LuPlus} /> Beri
                      </Button>
                    </Flex>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      )}
    </Box>
  )
}
