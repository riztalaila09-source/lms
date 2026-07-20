import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Box, Button, Card, Flex, Icon, Input, NativeSelect, Spinner, Table, Text } from '@chakra-ui/react'
import { LuTrophy, LuMedal, LuCalendarDays, LuSearch } from 'react-icons/lu'
import type { LeaderboardEntry } from '@/gen/classroom/v1/classroom_pb'
import { classroomClient } from '@/lib/client'
import { useAuth } from '@/hooks/useAuth'
import { COLORS } from '@/theme/tokens'

function todayWIB(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
}
const RANK_COLOR = ['#F59E0B', '#94A3B8', '#B45309'] // emas, perak, perunggu

/**
 * Papan peringkat keaktifan (total poin, tertinggi→terendah).
 * - Guru: 10 besar, dengan pilihan Total / Per Hari.
 * - Murid: daftar penuh (total), baris sendiri disorot.
 */
export default function ActivityLeaderboard({ courseId, canManage }: { courseId: string; canManage: boolean }) {
  const { user } = useAuth()
  const [mode, setMode] = useState<'total' | 'day'>('total')
  const [tanggal, setTanggal] = useState(todayWIB())
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [kelas, setKelas] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await classroomClient.listLeaderboard({ courseId, tanggal: mode === 'day' ? tanggal : '' })
      setEntries(res.entries)
    } catch { setEntries([]) }
    finally { setLoading(false) }
  }, [courseId, mode, tanggal])
  useEffect(() => { load() }, [load])

  const kelasOptions = useMemo(
    () => Array.from(new Set(entries.map((e) => e.studentKelas).filter(Boolean))).sort(),
    [entries])
  // Hanya tampilkan yang punya poin; filter nama & kelas; guru dibatasi 10 besar.
  const ranked = useMemo(() => {
    const q = search.trim().toLowerCase()
    const f = entries.filter((e) => e.points > 0
      && (!q || e.studentName.toLowerCase().includes(q))
      && (!kelas || e.studentKelas === kelas))
    return canManage ? f.slice(0, 10) : f
  }, [entries, canManage, search, kelas])

  return (
    <Card.Root>
      <Card.Body>
        <Flex align="center" gap="10px" mb="14px" wrap="wrap">
          <Icon as={LuTrophy} color="#F59E0B" boxSize="20px" />
          <Text fontSize="16px" fontWeight="700" flex="1">
            Papan Peringkat Keaktifan{canManage ? ' — 10 Besar' : ''}
          </Text>
          {canManage && (
            <Flex gap="6px" align="center" wrap="wrap">
              <Button size="xs" variant={mode === 'total' ? 'solid' : 'outline'}
                bg={mode === 'total' ? COLORS.primary : undefined} color={mode === 'total' ? 'white' : undefined}
                onClick={() => setMode('total')}>Total</Button>
              <Button size="xs" variant={mode === 'day' ? 'solid' : 'outline'}
                bg={mode === 'day' ? COLORS.primary : undefined} color={mode === 'day' ? 'white' : undefined}
                onClick={() => setMode('day')}><Icon as={LuCalendarDays} /> Per Hari</Button>
              {mode === 'day' && <Input type="date" size="xs" w="150px" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />}
            </Flex>
          )}
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
        ) : ranked.length === 0 ? (
          <Text fontSize="13px" color={COLORS.muted} py="10px">
            {search || kelas ? 'Tidak ada murid yang cocok dengan pencarian/filter.' : `Belum ada poin keaktifan${mode === 'day' ? ' pada tanggal ini' : ''}.`}
          </Text>
        ) : (
          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader w="60px" textAlign="center">Peringkat</Table.ColumnHeader>
                  <Table.ColumnHeader>Nama</Table.ColumnHeader>
                  <Table.ColumnHeader>Kelas</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Poin</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {ranked.map((e, i) => {
                  const isMe = e.studentId === user?.id
                  return (
                    <Table.Row key={e.studentId} bg={isMe ? COLORS.primaryTint : undefined}>
                      <Table.Cell textAlign="center">
                        {i < 3 ? (
                          <Flex align="center" justify="center" boxSize="26px" mx="auto" borderRadius="full" bg={RANK_COLOR[i]} color="white">
                            <Icon as={LuMedal} boxSize="15px" />
                          </Flex>
                        ) : (
                          <Text fontWeight="700" color={COLORS.muted}>{i + 1}</Text>
                        )}
                      </Table.Cell>
                      <Table.Cell fontWeight={isMe ? '800' : '600'}>{e.studentName}{isMe ? ' (Anda)' : ''}</Table.Cell>
                      <Table.Cell><Badge variant="subtle">{e.studentKelas || '-'}</Badge></Table.Cell>
                      <Table.Cell textAlign="right"><Text fontWeight="800" color={COLORS.primary}>{e.points}</Text></Table.Cell>
                    </Table.Row>
                  )
                })}
              </Table.Body>
            </Table.Root>
          </Box>
        )}
      </Card.Body>
    </Card.Root>
  )
}
