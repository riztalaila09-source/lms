import { useEffect, useState } from 'react'
import { Badge, Box, Button, Flex, Icon, Input, Stack, Text } from '@chakra-ui/react'
import { LuMessageSquare, LuSend, LuCornerDownRight } from 'react-icons/lu'
import { materialClient } from '@/lib/client'
import { COLORS } from '@/theme/tokens'
import { toaster } from '@/components/ui/toaster'
import CommentAvatar from './CommentAvatar'

// blockId khusus untuk utas komentar level-materi (bukan per-fase).
const MATERIAL_BLOCK = '__material__'

interface PC { id: string; authorName: string; authorRole: string; authorPhoto: string; content: string; parentId: string }

function isGuru(role: string) { return role === 'teacher' || role === 'admin' }

function CommentRow({ c, reply }: { c: PC; reply?: boolean }) {
  const guru = isGuru(c.authorRole)
  return (
    <Flex gap="6px" align="flex-start" bg={reply ? COLORS.bg : COLORS.surface} p="7px"
      borderRadius="6px" border="1px solid" borderColor={COLORS.border}>
      {reply && <Icon as={LuCornerDownRight} boxSize="13px" color={COLORS.muted} mt="2px" flexShrink={0} />}
      <CommentAvatar name={c.authorName} photo={c.authorPhoto} size={reply ? 24 : 28} />
      <Box flex="1" minW={0}>
        <Flex align="center" gap="5px" mb="1px" wrap="wrap">
          <Badge colorPalette={guru ? 'purple' : 'blue'} variant="subtle" fontSize="9px">{guru ? 'Guru' : 'Siswa'}</Badge>
          <Text fontSize="11px" fontWeight="700" color={COLORS.text} lineClamp={1}>{c.authorName}</Text>
        </Flex>
        <Text fontSize="12.5px" color={COLORS.text} lineHeight="1.4">{c.content}</Text>
      </Box>
    </Flex>
  )
}

export default function MaterialComments({ materialId }: { materialId: string }) {
  const [comments, setComments] = useState<PC[]>([])
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [sending, setSending] = useState(false)

  const load = async () => {
    try {
      const res = await materialClient.listPhaseComments({ materialId, blockId: MATERIAL_BLOCK })
      setComments(res.comments.map((c) => ({
        id: c.id, authorName: c.authorName, authorRole: c.authorRole, authorPhoto: c.authorPhoto, content: c.content, parentId: c.parentId,
      })))
    } catch { /* biarkan kosong */ }
  }
  useEffect(() => { if (materialId) load() }, [materialId]) // eslint-disable-line react-hooks/exhaustive-deps

  const post = async (content: string, parentId: string): Promise<boolean> => {
    const text = content.trim()
    if (!text) return false
    setSending(true)
    try {
      await materialClient.addPhaseComment({ materialId, blockId: MATERIAL_BLOCK, content: text, parentId })
      await load()
      return true
    } catch (e) {
      toaster.create({ description: e instanceof Error ? e.message : 'Gagal mengirim komentar', type: 'error' })
      return false
    } finally { setSending(false) }
  }

  const sendTop = async () => { if (await post(draft, '')) setDraft('') }
  const sendReply = async (parentId: string) => {
    if (await post(replyDraft, parentId)) { setReplyDraft(''); setReplyTo(null) }
  }

  const tops = comments.filter((c) => !c.parentId)
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id)

  return (
    <Box border="1px solid" borderColor={COLORS.border} borderRadius="10px" p="12px" bg={COLORS.surface}>
      <Flex align="center" gap="6px" mb="10px">
        <Icon as={LuMessageSquare} boxSize="15px" color={COLORS.primary} />
        <Text fontSize="13px" fontWeight="700" color={COLORS.text} flex="1">Komentar &amp; Diskusi</Text>
        {tops.length > 0 && <Text fontSize="11px" color={COLORS.muted}>{tops.length}</Text>}
      </Flex>

      {tops.length === 0 ? (
        <Text fontSize="11px" color={COLORS.muted} mb="10px">Belum ada komentar. Jadilah yang pertama bertanya / berkomentar.</Text>
      ) : (
        <Stack gap="8px" mb="10px" maxH={{ lg: '340px' }} overflowY="auto">
          {tops.map((c) => (
            <Box key={c.id}>
              <CommentRow c={c} />
              {/* Balasan (menjorok) */}
              {repliesOf(c.id).length > 0 && (
                <Stack gap="5px" mt="5px" pl="12px">
                  {repliesOf(c.id).map((r) => <CommentRow key={r.id} c={r} reply />)}
                </Stack>
              )}
              {/* Aksi balas */}
              {replyTo === c.id ? (
                <Flex gap="5px" mt="5px" pl="12px">
                  <Input size="xs" bg="white" flex="1" autoFocus placeholder="Tulis balasan…"
                    value={replyDraft} onChange={(e) => setReplyDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(c.id) } }} />
                  <Button size="xs" bg={COLORS.primary} color="white" _hover={{ opacity: 0.88 }} loading={sending} onClick={() => sendReply(c.id)}>
                    <Icon as={LuSend} />
                  </Button>
                </Flex>
              ) : (
                <Button size="2xs" variant="ghost" mt="3px" ml="8px" color={COLORS.muted}
                  onClick={() => { setReplyTo(c.id); setReplyDraft('') }}>
                  <Icon as={LuCornerDownRight} /> Balas
                </Button>
              )}
            </Box>
          ))}
        </Stack>
      )}

      {/* Komentar baru (utama) */}
      <Flex gap="5px">
        <Input size="sm" bg="white" flex="1" placeholder="Tulis komentar…" value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTop() } }} />
        <Button size="sm" bg={COLORS.primary} color="white" _hover={{ opacity: 0.88 }} loading={sending} onClick={sendTop}>
          <Icon as={LuSend} />
        </Button>
      </Flex>
    </Box>
  )
}
