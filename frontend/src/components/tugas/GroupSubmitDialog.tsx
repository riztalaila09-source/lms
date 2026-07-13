import { useEffect, useState } from 'react'
import { Badge, Box, Button, Dialog, Field, Flex, Icon, IconButton, Input, Stack, Text, Textarea } from '@chakra-ui/react'
import { LuUsers, LuSend, LuPlus, LuX, LuCrown } from 'react-icons/lu'
import type { Assignment } from '@/gen/assignment/v1/assignment_pb'
import type { AssignmentGroup, GroupSubmission } from '@/gen/assignment/v1/assignment_pb'
import { assignmentClient } from '@/lib/client'
import { encodeLinks, decodeLinks } from '@/components/MaterialFormDialog'
import { useAuth } from '@/hooks/useAuth'
import { COLORS } from '@/theme/tokens'
import { toaster } from '@/components/ui/toaster'

interface LinkRow { label: string; url: string }

/** Pengumpulan tugas kelompok (praktikum) untuk siswa anggota. */
export default function GroupSubmitDialog({ assignment, open, onClose, onDone }: {
  assignment: Assignment | null; open: boolean; onClose: () => void; onDone: () => void
}) {
  const { user } = useAuth()
  const [myGroup, setMyGroup] = useState<AssignmentGroup | null>(null)
  const [sub, setSub] = useState<GroupSubmission | null>(null)
  const [content, setContent] = useState('')
  const [links, setLinks] = useState<LinkRow[]>([{ label: '', url: '' }])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    if (!assignment) return
    setLoading(true)
    try {
      const [g, s] = await Promise.all([
        assignmentClient.listAssignmentGroups({ assignmentId: assignment.id }),
        assignmentClient.listGroupSubmissions({ assignmentId: assignment.id }),
      ])
      const mine = g.groups.find((x) => x.id === g.myGroupId) ?? null
      setMyGroup(mine)
      const gs = s.submissions[0] ?? null
      setSub(gs)
      setContent(gs?.content ?? '')
      setLinks(gs?.fileUrl ? decodeLinks(gs.fileUrl) : [{ label: '', url: '' }])
    } catch { /* ignore */ } finally { setLoading(false) }
  }
  useEffect(() => { if (open) load() }, [open, assignment]) // eslint-disable-line react-hooks/exhaustive-deps

  const setLink = (i: number, patch: Partial<LinkRow>) => setLinks((a) => a.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))

  const submit = async () => {
    if (!assignment) return
    setSaving(true)
    try {
      await assignmentClient.submitGroupAssignment({ assignmentId: assignment.id, content, fileUrl: encodeLinks(links) })
      toaster.create({ description: 'Pengumpulan kelompok tersimpan.', type: 'success' })
      onClose(); onDone()
    } catch (e) { toaster.create({ description: e instanceof Error ? e.message : 'Gagal mengumpulkan', type: 'error' }) }
    finally { setSaving(false) }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(e) => { if (!e.open) onClose() }} scrollBehavior="inside">
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content>
          <Dialog.Header><Dialog.Title><Icon as={LuUsers} /> Praktikum: {assignment?.title}</Dialog.Title></Dialog.Header>
          <Dialog.Body>
            {loading ? <Text color={COLORS.muted}>Memuat…</Text> : !myGroup ? (
              <Text fontSize="13px" color={COLORS.danger}>Anda belum dimasukkan ke kelompok mana pun untuk tugas ini. Hubungi guru Anda.</Text>
            ) : (() => {
              const leader = myGroup.members.find((m) => m.isLeader)
              const iAmLeader = !!leader && leader.studentId === user?.id
              return (
                <Stack gap="12px">
                  <Box bg={COLORS.bg} p="10px" borderRadius="8px">
                    <Text fontSize="13px" fontWeight="700" mb="4px">{myGroup.name}</Text>
                    <Flex gap="5px" wrap="wrap">
                      {myGroup.members.map((m) => (
                        <Badge key={m.studentId} colorPalette={m.isLeader ? 'yellow' : 'blue'} variant={m.isLeader ? 'solid' : 'subtle'}>
                          {m.isLeader && <Icon as={LuCrown} boxSize="11px" mr="2px" />}{m.studentName}{m.isLeader ? ' (ketua)' : ''}
                        </Badge>
                      ))}
                    </Flex>
                  </Box>
                  {sub?.graded && (
                    <Box bg="#F0FDF4" border="1px solid" borderColor={COLORS.success} p="10px" borderRadius="8px">
                      <Text fontSize="13px" fontWeight="700" color={COLORS.success}>Nilai kelompok: {sub.score}</Text>
                      {sub.feedback && <Text fontSize="12px" color={COLORS.text} mt="2px">Catatan guru: {sub.feedback}</Text>}
                    </Box>
                  )}
                  {sub?.submitted && (
                    <Box bg={COLORS.bg} p="8px" borderRadius="6px">
                      <Text fontSize="12px" fontWeight="600">Sudah dikumpulkan oleh {sub.submittedByName || 'ketua'}.</Text>
                      {sub.content && <Text fontSize="12px" color={COLORS.text} mt="2px">{sub.content}</Text>}
                    </Box>
                  )}
                  {iAmLeader ? (
                    <>
                      {sub?.submitted && <Text fontSize="11px" color={COLORS.muted}>Mengirim lagi akan menimpa pengumpulan kelompok.</Text>}
                      <Field.Root>
                        <Field.Label>Jawaban / Keterangan</Field.Label>
                        <Textarea rows={5} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Tulis hasil kerja kelompok…" />
                      </Field.Root>
                      <Box>
                        <Text fontSize="13px" fontWeight="600" mb="6px">Link File (opsional)</Text>
                        <Stack gap="6px">
                          {links.map((l, i) => (
                            <Flex key={i} gap="6px">
                              <Input flex="1" size="sm" placeholder="Judul" value={l.label} onChange={(e) => setLink(i, { label: e.target.value })} />
                              <Input flex="2" size="sm" placeholder="https://… (Google Drive, dll)" value={l.url} onChange={(e) => setLink(i, { url: e.target.value })} />
                              {links.length > 1 && <IconButton aria-label="hapus" size="sm" colorPalette="red" variant="outline" onClick={() => setLinks((a) => a.filter((_, idx) => idx !== i))}><Icon as={LuX} /></IconButton>}
                            </Flex>
                          ))}
                        </Stack>
                        <Button size="xs" variant="outline" mt="6px" onClick={() => setLinks((a) => [...a, { label: '', url: '' }])}><Icon as={LuPlus} /> Tambah Link</Button>
                      </Box>
                    </>
                  ) : (
                    <Box bg="#FEF3C7" color="#92400E" p="10px" borderRadius="8px" fontSize="12px">
                      <Icon as={LuCrown} /> Pengumpulan hanya dilakukan oleh <b>ketua kelompok{leader ? ` (${leader.studentName})` : ''}</b>. Anda dapat melihat kelompok & status di sini.
                    </Box>
                  )}
                </Stack>
              )
            })()}
          </Dialog.Body>
          <Dialog.Footer>
            <Button variant="outline" onClick={onClose}>Tutup</Button>
            {myGroup && (myGroup.members.find((m) => m.isLeader)?.studentId === user?.id) && (
              <Button bg={COLORS.success} color="white" loading={saving} onClick={submit}><Icon as={LuSend} /> Kumpulkan</Button>
            )}
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  )
}
