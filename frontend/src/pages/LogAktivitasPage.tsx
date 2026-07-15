import { useEffect, useState, useCallback } from 'react'
import { Badge, Box, Button, Flex, Icon, Table, Text } from '@chakra-ui/react'
import { LuActivity, LuRefreshCw, LuTrash2 } from 'react-icons/lu'
import { timestampDate } from '@bufbuild/protobuf/wkt'
import { userClient } from '@/lib/client'
import type { ActivityLogEntry } from '@/gen/user/v1/user_pb'
import AppLayout from '@/components/AppLayout'
import { Card } from '@/components/Card'
import Pagination, { usePaged } from '@/components/Pagination'
import ConfirmDialog, { type ConfirmState } from '@/components/ConfirmDialog'
import { COLORS } from '@/theme/tokens'
import { toaster } from '@/components/ui/toaster'

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin', teacher: 'Guru', student: 'Siswa',
}

export default function LogAktivitasPage() {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await userClient.listActivityLogs({ pagination: { page: 1, pageSize: 200 } })
      setEntries(res.entries)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memuat log')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const askResetAll = () => setConfirm({
    title: 'Reset Semua Log Aktivitas',
    message: 'Seluruh catatan login (semua siswa & guru) akan dihapus dan tidak bisa dikembalikan. Lanjutkan?',
    variant: 'danger',
    confirmLabel: 'Ya, Reset Semua',
    onConfirm: async () => {
      try {
        await userClient.resetActivityLogs({})
        toaster.create({ description: 'Semua log aktivitas telah direset.', type: 'success' })
        await load()
      } catch (err: unknown) {
        toaster.create({ description: err instanceof Error ? err.message : 'Gagal mereset log', type: 'error' })
      }
    },
  })

  const maxCount = Math.max(1, ...entries.map((e) => e.loginCount))
  const fmt = (d?: Date) => (d ? d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-')
  const entriesPaged = usePaged(entries, 15)

  return (
    <AppLayout
      title={<><Icon as={LuActivity} /> Log Aktivitas</>}
      subtitle="Jumlah login & waktu kunjungan pengguna"
      actions={
        <Flex gap="8px">
          <Button size="sm" variant="outline" colorPalette="red" onClick={askResetAll} disabled={entries.length === 0}>
            <Icon as={LuTrash2} /> Reset Semua
          </Button>
          <Button size="sm" variant="outline" onClick={load}><Icon as={LuRefreshCw} /> Refresh</Button>
        </Flex>
      }
    >
      {error && <Text color={COLORS.danger} mb="10px">{error}</Text>}
      <Card>
        <Box overflowX="auto">
          <Table.Root size="sm">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>#</Table.ColumnHeader>
                <Table.ColumnHeader>Nama</Table.ColumnHeader>
                <Table.ColumnHeader>Peran</Table.ColumnHeader>
                <Table.ColumnHeader>Kelas</Table.ColumnHeader>
                <Table.ColumnHeader>Jumlah Login</Table.ColumnHeader>
                <Table.ColumnHeader>Login Terakhir</Table.ColumnHeader>
                <Table.ColumnHeader>Pertama Kali</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {loading ? (
                <Table.Row><Table.Cell colSpan={7} textAlign="center" color={COLORS.muted}>Memuat…</Table.Cell></Table.Row>
              ) : entries.length === 0 ? (
                <Table.Row><Table.Cell colSpan={7} textAlign="center" color={COLORS.muted}>Belum ada aktivitas login tercatat</Table.Cell></Table.Row>
              ) : entriesPaged.pageItems.map((e, i) => (
                <Table.Row key={e.userId}>
                  <Table.Cell fontWeight="bold" color={COLORS.primary}>{(entriesPaged.page - 1) * entriesPaged.pageSize + i + 1}</Table.Cell>
                  <Table.Cell fontWeight="medium">{e.fullName || e.username}</Table.Cell>
                  <Table.Cell><Badge colorPalette={e.role === 'admin' ? 'red' : e.role === 'teacher' ? 'blue' : 'green'}>{ROLE_LABEL[e.role] ?? e.role}</Badge></Table.Cell>
                  <Table.Cell>{e.kelas || '-'}</Table.Cell>
                  <Table.Cell>
                    <Flex align="center" gap="8px">
                      <Text fontWeight="bold" minW="24px">{e.loginCount}×</Text>
                      <Box flex={1} minW="60px" h="8px" bg={COLORS.bg} borderRadius="99px" overflow="hidden">
                        <Box h="100%" bg={COLORS.primary} w={`${(e.loginCount / maxCount) * 100}%`} />
                      </Box>
                    </Flex>
                  </Table.Cell>
                  <Table.Cell fontSize="12px">{fmt(e.lastLogin ? timestampDate(e.lastLogin) : undefined)}</Table.Cell>
                  <Table.Cell fontSize="12px" color={COLORS.muted}>{fmt(e.firstLogin ? timestampDate(e.firstLogin) : undefined)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
        <Pagination page={entriesPaged.page} pageSize={entriesPaged.pageSize} total={entriesPaged.total} onPageChange={entriesPaged.setPage} />
      </Card>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </AppLayout>
  )
}
