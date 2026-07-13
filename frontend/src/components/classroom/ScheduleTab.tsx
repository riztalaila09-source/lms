import { useCallback, useEffect, useState } from 'react'
import { Badge, Box, Button, Card, Flex, Icon, IconButton, Input, NativeSelect, Spinner, Table, Text } from '@chakra-ui/react'
import { LuPlus, LuPencil, LuTrash2, LuX, LuCalendarClock } from 'react-icons/lu'
import type { ScheduleEntry } from '@/gen/classroom/v1/classroom_pb'
import { classroomClient } from '@/lib/client'
import { COLORS } from '@/theme/tokens'
import { toaster } from '@/components/ui/toaster'

const DAYS = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']

interface FormState { day: number; mulai: number; akhir: number; kelas: string; ruang: string }
const EMPTY: FormState = { day: 1, mulai: 1, akhir: 2, kelas: '', ruang: '' }

export default function ScheduleTab({ courseId, canManage }: { courseId: string; canManage: boolean }) {
  const [items, setItems] = useState<ScheduleEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setItems((await classroomClient.listSchedules({ courseId })).entries) }
    catch { setItems([]) }
    finally { setLoading(false) }
  }, [courseId])
  useEffect(() => { load() }, [load])

  const reset = () => { setForm(EMPTY); setEditingId(null) }
  const startEdit = (s: ScheduleEntry) => {
    setEditingId(s.id)
    setForm({ day: s.dayOfWeek, mulai: s.jamKeMulai, akhir: s.jamKeAkhir, kelas: s.kelas, ruang: s.ruang })
  }
  const save = async () => {
    if (form.akhir < form.mulai) { toaster.create({ description: 'Jam ke akhir tidak boleh sebelum jam mulai.', type: 'error' }); return }
    setSaving(true)
    try {
      if (editingId) {
        await classroomClient.updateSchedule({ id: editingId, dayOfWeek: form.day, jamKeMulai: form.mulai, jamKeAkhir: form.akhir, kelas: form.kelas, ruang: form.ruang })
      } else {
        await classroomClient.createSchedule({ courseId, dayOfWeek: form.day, jamKeMulai: form.mulai, jamKeAkhir: form.akhir, kelas: form.kelas, ruang: form.ruang })
      }
      reset(); await load()
    } catch (e) { toaster.create({ description: e instanceof Error ? e.message : 'Gagal menyimpan jadwal', type: 'error' }) }
    finally { setSaving(false) }
  }
  const remove = async (id: string) => {
    try { await classroomClient.deleteSchedule({ id }); await load() }
    catch (e) { toaster.create({ description: e instanceof Error ? e.message : 'Gagal menghapus', type: 'error' }) }
  }

  return (
    <Card.Root>
      <Card.Body>
        <Flex align="center" gap="8px" mb="14px">
          <Icon as={LuCalendarClock} color={COLORS.primary} />
          <Text fontSize="16px" fontWeight="700">Jadwal Mingguan</Text>
        </Flex>

        {canManage && (
          <Flex gap="8px" mb="14px" wrap="wrap" align="flex-end" p="10px" bg={COLORS.bg} borderRadius="8px">
            <Box>
              <Text fontSize="11px" color={COLORS.muted} mb="2px">Hari</Text>
              <NativeSelect.Root size="sm" w="120px">
                <NativeSelect.Field value={String(form.day)} onChange={(e) => setForm((f) => ({ ...f, day: Number(e.target.value) }))}>
                  {DAYS.slice(1).map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </Box>
            <Box>
              <Text fontSize="11px" color={COLORS.muted} mb="2px">Jam ke (mulai)</Text>
              <Input type="number" size="sm" w="90px" min={1} max={12} value={form.mulai} onChange={(e) => setForm((f) => ({ ...f, mulai: Number(e.target.value) || 1 }))} />
            </Box>
            <Box>
              <Text fontSize="11px" color={COLORS.muted} mb="2px">s/d</Text>
              <Input type="number" size="sm" w="90px" min={1} max={12} value={form.akhir} onChange={(e) => setForm((f) => ({ ...f, akhir: Number(e.target.value) || 1 }))} />
            </Box>
            <Box>
              <Text fontSize="11px" color={COLORS.muted} mb="2px">Kelas</Text>
              <Input size="sm" w="130px" placeholder="X-TKJ-1" value={form.kelas} onChange={(e) => setForm((f) => ({ ...f, kelas: e.target.value }))} />
            </Box>
            <Box>
              <Text fontSize="11px" color={COLORS.muted} mb="2px">Ruang</Text>
              <Input size="sm" w="130px" placeholder="Lab TKJ" value={form.ruang} onChange={(e) => setForm((f) => ({ ...f, ruang: e.target.value }))} />
            </Box>
            <Button size="sm" bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} loading={saving} onClick={save}>
              <Icon as={editingId ? LuPencil : LuPlus} /> {editingId ? 'Simpan' : 'Tambah'}
            </Button>
            {editingId && <Button size="sm" variant="ghost" onClick={reset}><Icon as={LuX} /> Batal</Button>}
          </Flex>
        )}

        {loading ? (
          <Flex justify="center" py="24px"><Spinner color={COLORS.primary} /></Flex>
        ) : items.length === 0 ? (
          <Text fontSize="13px" color={COLORS.muted} py="10px">Belum ada jadwal.</Text>
        ) : (
          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader>Hari</Table.ColumnHeader>
                  <Table.ColumnHeader>Jam ke</Table.ColumnHeader>
                  <Table.ColumnHeader>Kelas</Table.ColumnHeader>
                  <Table.ColumnHeader>Ruang</Table.ColumnHeader>
                  {canManage && <Table.ColumnHeader textAlign="right">Aksi</Table.ColumnHeader>}
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {items.map((s) => (
                  <Table.Row key={s.id}>
                    <Table.Cell fontWeight="600">{DAYS[s.dayOfWeek] || '-'}</Table.Cell>
                    <Table.Cell>{s.jamKeMulai}{s.jamKeAkhir !== s.jamKeMulai ? `–${s.jamKeAkhir}` : ''}</Table.Cell>
                    <Table.Cell>{s.kelas ? <Badge variant="subtle">{s.kelas}</Badge> : '-'}</Table.Cell>
                    <Table.Cell>{s.ruang || '-'}</Table.Cell>
                    {canManage && (
                      <Table.Cell textAlign="right">
                        <IconButton aria-label="edit" size="xs" variant="ghost" onClick={() => startEdit(s)}><Icon as={LuPencil} /></IconButton>
                        <IconButton aria-label="hapus" size="xs" variant="ghost" colorPalette="red" onClick={() => remove(s.id)}><Icon as={LuTrash2} /></IconButton>
                      </Table.Cell>
                    )}
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Box>
        )}
      </Card.Body>
    </Card.Root>
  )
}
