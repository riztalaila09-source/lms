import { createContext, useContext, useEffect, useState } from 'react'
import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react'
import { Badge, Box, Button, Flex, Icon, IconButton, Input, NativeSelect, Stack, Text } from '@chakra-ui/react'
import {
  LuBookOpen, LuSunrise, LuZap, LuMessageCircle, LuLightbulb, LuTarget, LuClipboardCheck,
  LuBookText, LuMonitorPlay, LuMessagesSquare, LuUsers, LuWrench, LuPresentation, LuClipboardList,
  LuFileCheck, LuFlagTriangleRight, LuListChecks, LuNotebookPen, LuCircleArrowRight, LuHeartHandshake,
  LuTrash2, LuGripVertical, LuSend,
} from 'react-icons/lu'
import { COLORS } from '@/theme/tokens'
import { materialClient } from '@/lib/client'
import { toaster } from '@/components/ui/toaster'
import CommentAvatar from './CommentAvatar'

/**
 * Katalog fase pembelajaran (Kurikulum Merdeka). Urutan = urutan sintaks
 * pembelajaran; `interactive` menandai fase yang punya kotak diskusi (siswa
 * posting, guru membalas).
 */
export interface PhaseMeta {
  key: string
  no: number
  label: string
  hint: string
  icon: React.ElementType
  color: string
  interactive?: boolean
}

export const PHASES: PhaseMeta[] = [
  { key: 'pendahuluan', no: 1, label: 'Pendahuluan', hint: 'Materi singkat pembuka', icon: LuBookOpen, color: '#2563EB' },
  { key: 'observasi', no: 2, label: 'Observasi', hint: 'Salam dan doa', icon: LuSunrise, color: '#0891B2' },
  { key: 'motivasi', no: 3, label: 'Motivasi', hint: 'Ice breaking (soft/hard)', icon: LuZap, color: '#D97706' },
  { key: 'refleksi_awal', no: 4, label: 'Refleksi', hint: 'Review atau tanya jawab', icon: LuMessageCircle, color: '#0D9488' },
  { key: 'apersepsi', no: 5, label: 'Apersepsi', hint: 'Kaitan dengan kehidupan sehari-hari', icon: LuLightbulb, color: '#CA8A04' },
  { key: 'acuan', no: 6, label: 'Pemberian Acuan', hint: 'Elemen, CP, tujuan pembelajaran', icon: LuTarget, color: '#4F46E5' },
  { key: 'pretest', no: 7, label: 'Pretest', hint: 'Ukur pengetahuan awal peserta didik', icon: LuClipboardCheck, color: '#7C3AED' },
  { key: 'inti', no: 8, label: 'Materi Inti', hint: 'Isi utama materi', icon: LuBookText, color: '#16A34A' },
  { key: 'demonstrasi', no: 9, label: 'Demonstrasi', hint: 'Langkah-langkah yang terlihat jelas & langsung', icon: LuMonitorPlay, color: '#059669' },
  { key: 'tanyajawab', no: 10, label: 'Tanya Jawab', hint: 'Siswa bertanya / menjawab di sini', icon: LuMessagesSquare, color: '#0EA5E9', interactive: true },
  { key: 'diskusi', no: 11, label: 'Diskusi', hint: 'Diskusi kelompok / kelas', icon: LuUsers, color: '#2563EB', interactive: true },
  { key: 'praktek', no: 12, label: 'Praktek', hint: 'Kegiatan praktik peserta didik', icon: LuWrench, color: '#EA580C' },
  { key: 'presentasi', no: 13, label: 'Presentasi', hint: 'Siswa menyampaikan materi yang dipelajari', icon: LuPresentation, color: '#DB2777', interactive: true },
  { key: 'evaluasi', no: 14, label: 'Evaluasi', hint: 'Sikap, pengetahuan, keterampilan / umpan balik', icon: LuClipboardList, color: '#65A30D' },
  { key: 'postest', no: 15, label: 'Postest', hint: 'Ukur pengetahuan pasca pembelajaran', icon: LuFileCheck, color: '#9333EA' },
  { key: 'penutup', no: 16, label: 'Penutup', hint: 'Bagian penutup pembelajaran', icon: LuFlagTriangleRight, color: '#7C3AED' },
  { key: 'simpulan', no: 17, label: 'Simpulan', hint: 'Siswa memberikan simpulan / berkomentar', icon: LuListChecks, color: '#0891B2', interactive: true },
  { key: 'refleksi_akhir', no: 18, label: 'Refleksi', hint: 'Rangkuman materi', icon: LuNotebookPen, color: '#4F46E5' },
  { key: 'tindaklanjut', no: 19, label: 'Tindak Lanjut', hint: 'Pembahasan, latihan/tugas, referensi materi', icon: LuCircleArrowRight, color: '#DB2777' },
  { key: 'doa', no: 20, label: 'Doa', hint: 'Doa penutup', icon: LuHeartHandshake, color: '#DC2626' },
]

const PHASE_MAP: Record<string, PhaseMeta> = Object.fromEntries(PHASES.map((p) => [p.key, p]))
export const PHASE_KEYS = PHASES.map((p) => p.key)
function phaseMeta(key: string): PhaseMeta {
  return PHASE_MAP[key] ?? PHASES[0]
}

/**
 * Context supplied by the reader (MaterialViewer). When `interactive` is true and
 * a phase is a discussion phase, the node view renders a live comment box keyed
 * by (materialId, blockId). The editor doesn't provide it → node stays edit mode.
 */
export interface PhaseContextValue {
  interactive: boolean
  materialId: string
}
export const PhaseContext = createContext<PhaseContextValue | null>(null)

// ── Kotak diskusi per-fase (mirror komentar Soal Uraian) ──
interface PComment { id: string; authorName: string; authorRole: string; authorPhoto: string; content: string }

function PhaseDiscussion({ materialId, blockId, accent }: { materialId: string; blockId: string; accent: string }) {
  const [comments, setComments] = useState<PComment[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const load = async () => {
    try {
      const res = await materialClient.listPhaseComments({ materialId, blockId })
      setComments(res.comments.map((c) => ({ id: c.id, authorName: c.authorName, authorRole: c.authorRole, authorPhoto: c.authorPhoto, content: c.content })))
    } catch { /* biarkan kosong */ }
  }
  useEffect(() => { if (materialId && blockId) load() }, [materialId, blockId]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    const content = draft.trim()
    if (!content) return
    setSending(true)
    try {
      await materialClient.addPhaseComment({ materialId, blockId, content })
      setDraft('')
      await load()
    } catch (e) { toaster.create({ description: e instanceof Error ? e.message : 'Gagal mengirim komentar', type: 'error' }) }
    finally { setSending(false) }
  }

  if (!blockId) {
    return (
      <Text fontSize="11px" color={COLORS.muted} mt="8px" fontStyle="italic" contentEditable={false}>
        Simpan ulang materi untuk mengaktifkan kotak diskusi pada fase ini.
      </Text>
    )
  }

  return (
    <Box mt="10px" pt="10px" borderTop="1px dashed" borderColor={COLORS.border} contentEditable={false}>
      {comments.length > 0 && (
        <Stack gap="6px" mb="8px">
          {comments.map((c) => {
            const isGuru = c.authorRole === 'teacher' || c.authorRole === 'admin'
            return (
              <Flex key={c.id} gap="8px" align="flex-start" bg={COLORS.surface} p="8px" borderRadius="6px" border="1px solid" borderColor={COLORS.border}>
                <CommentAvatar name={c.authorName} photo={c.authorPhoto} size={30} />
                <Box flex="1" minW={0}>
                  <Flex align="center" gap="5px">
                    <Text fontSize="12px" fontWeight="600" color={COLORS.text}>{c.authorName}</Text>
                    <Badge colorPalette={isGuru ? 'purple' : 'blue'} variant="subtle" fontSize="10px" flexShrink={0}>
                      {isGuru ? 'Guru' : 'Siswa'}
                    </Badge>
                  </Flex>
                  <Text fontSize="13px" color={COLORS.text} mt="1px">{c.content}</Text>
                </Box>
              </Flex>
            )
          })}
        </Stack>
      )}
      <Flex gap="6px">
        <Input size="sm" bg="white" flex="1" placeholder="Tulis di kotak diskusi ini…" value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
        <Button size="sm" bg={accent} color="white" _hover={{ opacity: 0.88 }} loading={sending} onClick={send}>
          <Icon as={LuSend} /> Kirim
        </Button>
      </Flex>
    </Box>
  )
}

// ── Node view: kotak fase (edit + baca) ──
function PhaseView(props: NodeViewProps) {
  const attrs = props.node.attrs as { phase: string; blockId: string }
  const meta = phaseMeta(attrs.phase)
  const ctx = useContext(PhaseContext)
  const editable = props.editor.isEditable
  const tint = meta.color + '12' // hex8 alpha untuk latar header lembut

  return (
    <NodeViewWrapper>
      <Box border="1px solid" borderColor={meta.color + '55'} borderLeft={`4px solid ${meta.color}`}
        borderRadius="10px" my="14px" overflow="hidden" bg={COLORS.surface}>
        {/* Header fase */}
        <Flex align="center" gap="8px" px="12px" py="9px" bg={tint} contentEditable={false}
          borderBottom="1px solid" borderColor={meta.color + '22'}>
          {editable && <Icon as={LuGripVertical} color={COLORS.muted} data-drag-handle style={{ cursor: 'grab' }} />}
          <Flex align="center" justify="center" boxSize="26px" borderRadius="full" bg={meta.color} color="white" flexShrink={0}>
            <Icon as={meta.icon} boxSize="15px" />
          </Flex>
          <Box flex="1" minW={0}>
            <Text fontSize="13px" fontWeight="800" color={meta.color} lineHeight="1.2">
              {meta.no}. {meta.label.toUpperCase()}
            </Text>
            <Text fontSize="10.5px" color={COLORS.muted} lineClamp={1}>{meta.hint}</Text>
          </Box>
          {editable && (
            <>
              <NativeSelect.Root size="xs" width="auto" title="Ganti fase">
                <NativeSelect.Field value={attrs.phase} onChange={(e) => props.updateAttributes({ phase: e.target.value })}>
                  {PHASES.map((p) => <option key={p.key} value={p.key}>{p.no}. {p.label}</option>)}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
              <IconButton aria-label="hapus fase" size="2xs" colorPalette="red" variant="outline" onClick={() => props.deleteNode()}>
                <Icon as={LuTrash2} />
              </IconButton>
            </>
          )}
          {meta.interactive && <Badge colorPalette="cyan" variant="subtle" fontSize="9px" flexShrink={0}>Diskusi</Badge>}
        </Flex>

        {/* Isi fase (rich, editable; bisa memuat Soal PG / gambar / video) */}
        <Box px="14px" py="10px">
          <NodeViewContent />
          {/* Kotak diskusi hanya di reader untuk fase interaktif */}
          {!editable && meta.interactive && ctx?.interactive && (
            <PhaseDiscussion materialId={ctx.materialId} blockId={attrs.blockId} accent={meta.color} />
          )}
        </Box>
      </Box>
    </NodeViewWrapper>
  )
}

export const PhaseNode = Node.create({
  name: 'phase',
  group: 'block',
  content: 'block+',
  draggable: true,
  selectable: true,
  defining: true,

  addAttributes() {
    return {
      phase: {
        default: 'pendahuluan',
        parseHTML: (el) => el.getAttribute('data-phase') || 'pendahuluan',
        renderHTML: (attrs) => ({ 'data-phase': attrs.phase || 'pendahuluan' }),
      },
      blockId: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-block-id') || '',
        renderHTML: (attrs) => ({ 'data-block-id': attrs.blockId || '' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="phase"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'phase' }), 0]
  },

  addNodeView() {
    return ReactNodeViewRenderer(PhaseView)
  },
})
