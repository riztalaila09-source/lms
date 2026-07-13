import { useEffect, useState } from 'react'
import { Box, Button, Dialog, Flex, Icon, Image, Stack, Text } from '@chakra-ui/react'
import { LuClipboardCheck, LuSend, LuCheck } from 'react-icons/lu'
import type { Assignment } from '@/gen/assignment/v1/assignment_pb'
import { assignmentClient } from '@/lib/client'
import { COLORS } from '@/theme/tokens'
import { toaster } from '@/components/ui/toaster'

interface Q { id: string; question: string; image: string; options: string[] }

/** Pengerjaan Kuis (Benar/Salah/Mungkin, boleh centang >1). Partial credit. */
export default function KuisRunner({ assignment, open, onClose, onDone }: {
  assignment: Assignment | null; open: boolean; onClose: () => void; onDone: () => void
}) {
  const [qs, setQs] = useState<Q[]>([])
  const [ans, setAns] = useState<Record<string, number[]>>({})
  const [start, setStart] = useState(0)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!open || !assignment) return
    setQs([]); setAns({}); setMsg('')
    assignmentClient.listAssignmentQuestions({ assignmentId: assignment.id })
      .then((r) => { setQs(r.questions.map((q) => ({ id: q.id, question: q.question, image: q.image, options: q.options }))); setStart(Date.now()) })
      .catch((e) => setMsg(e instanceof Error ? e.message : 'Gagal memuat soal'))
  }, [open, assignment])

  const toggle = (qid: string, idx: number) => setAns((a) => {
    const cur = a[qid] ?? []
    return { ...a, [qid]: cur.includes(idx) ? cur.filter((x) => x !== idx) : [...cur, idx] }
  })

  const submit = async () => {
    if (!assignment) return
    const unanswered = qs.some((q) => (ans[q.id] ?? []).length === 0)
    if (unanswered) { setMsg('Centang minimal satu jawaban untuk setiap soal.'); return }
    setSaving(true)
    try {
      const answers = qs.map((q) => ({ questionId: q.id, optionIndices: ans[q.id] ?? [] }))
      const timeTakenSeconds = Math.max(1, Math.round((Date.now() - start) / 1000))
      const res = await assignmentClient.submitKuis({ assignmentId: assignment.id, answers, timeTakenSeconds })
      onClose(); onDone()
      toaster.create({ description: `Kuis selesai! Poin benar ${res.earned}/${res.total} → Nilai ${res.score}.`, type: 'success' })
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Gagal mengirim kuis') }
    finally { setSaving(false) }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(e) => { if (!e.open) onClose() }} scrollBehavior="inside" size="full">
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content>
          <Dialog.Header><Dialog.Title><Icon as={LuClipboardCheck} /> Kuis: {assignment?.title}</Dialog.Title></Dialog.Header>
          <Dialog.Body>
            <Stack gap="14px" maxW="640px" mx="auto" w="full">
              {msg && <Box bg="#FEF3C7" color="#92400E" p="10px" borderRadius="8px" fontSize="13px">{msg}</Box>}
              <Text fontSize="12px" color={COLORS.muted}>Boleh mencentang lebih dari satu jawaban. Nilai dihitung dari jumlah jawaban benar.</Text>
              {qs.length === 0 ? <Text color={COLORS.muted} fontSize="13px">{msg ? '' : 'Memuat soal…'}</Text> : qs.map((q, qi) => (
                <Box key={q.id} borderBottom="1px solid" borderColor={COLORS.border} pb="10px">
                  <Text fontSize="14px" fontWeight="600" mb="8px">{qi + 1}. {q.question}</Text>
                  {q.image && <Image src={q.image} alt="" maxH="200px" mb="8px" borderRadius="8px" border={`1px solid ${COLORS.border}`} />}
                  <Stack gap="6px">
                    {q.options.map((o, oi) => {
                      const picked = (ans[q.id] ?? []).includes(oi)
                      return (
                        <Flex key={oi} w="full" textAlign="left" gap="8px" align="center" cursor="pointer"
                          bg={picked ? '#DBEAFE' : COLORS.bg} px="10px" py="8px" borderRadius="6px"
                          border="1px solid" borderColor={picked ? COLORS.primary : COLORS.border}
                          onClick={() => toggle(q.id, oi)}>
                          <Flex align="center" justify="center" boxSize="18px" borderRadius="4px" border="2px solid"
                            borderColor={picked ? COLORS.primary : COLORS.border} bg={picked ? COLORS.primary : 'white'} color="white">
                            {picked && <Icon as={LuCheck} boxSize="13px" />}
                          </Flex>
                          <Text fontSize="13px">{o}</Text>
                        </Flex>
                      )
                    })}
                  </Stack>
                </Box>
              ))}
            </Stack>
          </Dialog.Body>
          <Dialog.Footer>
            <Button variant="outline" onClick={onClose}>Tutup</Button>
            <Button bg={COLORS.success} color="white" loading={saving} disabled={qs.length === 0} onClick={submit}>
              <Icon as={LuSend} /> Kumpulkan Jawaban
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  )
}
