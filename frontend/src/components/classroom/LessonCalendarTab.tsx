import { useCallback, useEffect, useMemo, useState } from 'react'
import { Box, Button, Card, Dialog, Flex, Icon, IconButton, Input, NativeSelect, Stack, Text } from '@chakra-ui/react'
import { LuPlus, LuPencil, LuTrash2, LuX, LuChevronLeft, LuChevronRight, LuCalendarDays, LuBookOpen } from 'react-icons/lu'
import type { LessonPlan } from '@/gen/classroom/v1/classroom_pb'
import { classroomClient } from '@/lib/client'
import { COLORS } from '@/theme/tokens'
import { toaster } from '@/components/ui/toaster'

const WD = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const pad = (n: number) => String(n).padStart(2, '0')

interface MaterialOpt { id: string; title: string }
interface Form { editingId: string | null; title: string; materialId: string; note: string }
const EMPTY: Form = { editingId: null, title: '', materialId: '', note: '' }

export default function LessonCalendarTab({ courseId, canManage, materials }: { courseId: string; canManage: boolean; materials: MaterialOpt[] }) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth()) // 0-based
  const [plans, setPlans] = useState<LessonPlan[]>([])
  const [openDate, setOpenDate] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(EMPTY)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try { setPlans((await classroomClient.listLessonPlans({ courseId })).plans) }
    catch { setPlans([]) }
  }, [courseId])
  useEffect(() => { load() }, [load])

  const byDate = useMemo(() => {
    const m: Record<string, LessonPlan[]> = {}
    for (const p of plans) (m[p.tanggal] ||= []).push(p)
    return m
  }, [plans])

  // Sel kalender (mulai Senin).
  const cells = useMemo(() => {
    const startWd = (new Date(year, month, 1).getDay() + 6) % 7 // 0=Senin
    const days = new Date(year, month + 1, 0).getDate()
    const arr: (string | null)[] = Array(startWd).fill(null)
    for (let d = 1; d <= days; d++) arr.push(`${year}-${pad(month + 1)}-${pad(d)}`)
    while (arr.length % 7 !== 0) arr.push(null)
    return arr
  }, [year, month])

  const prevMonth = () => { const d = new Date(year, month - 1, 1); setYear(d.getFullYear()); setMonth(d.getMonth()) }
  const nextMonth = () => { const d = new Date(year, month + 1, 1); setYear(d.getFullYear()); setMonth(d.getMonth()) }
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

  const openDay = (date: string) => { setOpenDate(date); setForm(EMPTY) }
  const startEdit = (p: LessonPlan) => setForm({ editingId: p.id, title: p.title, materialId: p.materialId, note: p.note })

  const save = async () => {
    if (!openDate || !form.title.trim()) { toaster.create({ description: 'Judul rencana wajib diisi.', type: 'error' }); return }
    setSaving(true)
    try {
      if (form.editingId) {
        await classroomClient.updateLessonPlan({ id: form.editingId, tanggal: openDate, title: form.title, materialId: form.materialId, note: form.note })
      } else {
        await classroomClient.createLessonPlan({ courseId, tanggal: openDate, title: form.title, materialId: form.materialId, note: form.note })
      }
      setForm(EMPTY); await load()
    } catch (e) { toaster.create({ description: e instanceof Error ? e.message : 'Gagal menyimpan rencana', type: 'error' }) }
    finally { setSaving(false) }
  }
  const remove = async (id: string) => {
    try { await classroomClient.deleteLessonPlan({ id }); await load() }
    catch (e) { toaster.create({ description: e instanceof Error ? e.message : 'Gagal menghapus', type: 'error' }) }
  }

  const dayPlans = openDate ? (byDate[openDate] ?? []) : []

  return (
    <Card.Root>
      <Card.Body>
        <Flex align="center" gap="10px" mb="14px">
          <Icon as={LuCalendarDays} color={COLORS.primary} />
          <Text fontSize="16px" fontWeight="700" flex="1">Kalender Rencana Pembelajaran</Text>
          <IconButton aria-label="bulan sebelumnya" size="xs" variant="outline" onClick={prevMonth}><Icon as={LuChevronLeft} /></IconButton>
          <Text fontSize="14px" fontWeight="600" minW="130px" textAlign="center">{MONTHS[month]} {year}</Text>
          <IconButton aria-label="bulan berikutnya" size="xs" variant="outline" onClick={nextMonth}><Icon as={LuChevronRight} /></IconButton>
        </Flex>

        <Box display="grid" gridTemplateColumns="repeat(7, 1fr)" gap="4px">
          {WD.map((d) => <Text key={d} fontSize="11px" fontWeight="700" color={COLORS.muted} textAlign="center" py="2px">{d}</Text>)}
          {cells.map((date, i) => {
            if (!date) return <Box key={i} minH="72px" borderRadius="6px" bg={COLORS.bg} opacity={0.4} />
            const items = byDate[date] ?? []
            const dnum = Number(date.slice(8))
            const isToday = date === todayStr
            return (
              <Box key={i} minH="72px" p="4px" borderRadius="6px" border="1px solid"
                borderColor={isToday ? COLORS.primary : COLORS.border} bg={COLORS.surface}
                cursor={canManage || items.length ? 'pointer' : 'default'}
                _hover={canManage ? { borderColor: COLORS.primary } : undefined}
                onClick={() => { if (canManage || items.length) openDay(date) }}>
                <Text fontSize="11px" fontWeight="700" color={isToday ? COLORS.primary : COLORS.text}>{dnum}</Text>
                <Stack gap="2px" mt="2px">
                  {items.slice(0, 3).map((p) => (
                    <Text key={p.id} fontSize="10px" bg={COLORS.primaryTint} color={COLORS.primaryDark}
                      px="3px" py="1px" borderRadius="3px" lineClamp={1}>{p.title}</Text>
                  ))}
                  {items.length > 3 && <Text fontSize="9px" color={COLORS.muted}>+{items.length - 3} lagi</Text>}
                </Stack>
              </Box>
            )
          })}
        </Box>
        <Text fontSize="11px" color={COLORS.muted} mt="8px">
          {canManage ? 'Klik tanggal untuk menambah/mengubah rencana materi.' : 'Rencana pembelajaran dari guru (hanya lihat).'}
        </Text>

        {/* Dialog hari */}
        <Dialog.Root open={!!openDate} onOpenChange={(e) => { if (!e.open) { setOpenDate(null); setForm(EMPTY) } }} size="md">
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title fontSize="15px">Rencana — {openDate}</Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>
                <Stack gap="8px" mb={canManage ? '14px' : '0'}>
                  {dayPlans.length === 0 && <Text fontSize="13px" color={COLORS.muted}>Belum ada rencana untuk tanggal ini.</Text>}
                  {dayPlans.map((p) => (
                    <Flex key={p.id} align="flex-start" gap="8px" p="8px" border="1px solid" borderColor={COLORS.border} borderRadius="8px">
                      <Box flex="1" minW={0}>
                        <Text fontSize="14px" fontWeight="700">{p.title}</Text>
                        {p.materialTitle && <Flex align="center" gap="4px" mt="1px"><Icon as={LuBookOpen} boxSize="12px" color={COLORS.primary} /><Text fontSize="12px" color={COLORS.primary}>{p.materialTitle}</Text></Flex>}
                        {p.note && <Text fontSize="12px" color={COLORS.muted} mt="2px">{p.note}</Text>}
                      </Box>
                      {canManage && (
                        <Flex>
                          <IconButton aria-label="edit" size="2xs" variant="ghost" onClick={() => startEdit(p)}><Icon as={LuPencil} /></IconButton>
                          <IconButton aria-label="hapus" size="2xs" variant="ghost" colorPalette="red" onClick={() => remove(p.id)}><Icon as={LuTrash2} /></IconButton>
                        </Flex>
                      )}
                    </Flex>
                  ))}
                </Stack>

                {canManage && (
                  <Box borderTop="1px solid" borderColor={COLORS.border} pt="12px">
                    <Text fontSize="12px" fontWeight="700" mb="8px">{form.editingId ? 'Ubah rencana' : 'Tambah rencana'}</Text>
                    <Stack gap="8px">
                      <Input size="sm" placeholder="Judul / topik (mis. Bab 1: Pengenalan)" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
                      <NativeSelect.Root size="sm">
                        <NativeSelect.Field value={form.materialId} onChange={(e) => setForm((f) => ({ ...f, materialId: e.target.value }))}>
                          <option value="">— Tautkan materi (opsional) —</option>
                          {materials.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                        </NativeSelect.Field>
                        <NativeSelect.Indicator />
                      </NativeSelect.Root>
                      <Input size="sm" placeholder="Catatan (opsional)" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
                      <Flex gap="8px">
                        <Button size="sm" bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} loading={saving} onClick={save}>
                          <Icon as={form.editingId ? LuPencil : LuPlus} /> {form.editingId ? 'Simpan' : 'Tambah'}
                        </Button>
                        {form.editingId && <Button size="sm" variant="ghost" onClick={() => setForm(EMPTY)}><Icon as={LuX} /> Batal</Button>}
                      </Flex>
                    </Stack>
                  </Box>
                )}
              </Dialog.Body>
              <Dialog.Footer>
                <Button variant="outline" onClick={() => { setOpenDate(null); setForm(EMPTY) }}>Tutup</Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Dialog.Root>
      </Card.Body>
    </Card.Root>
  )
}
