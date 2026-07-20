import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { Box, Button, Flex, Icon, IconButton, Input, RadioGroup, Text } from '@chakra-ui/react'
import { LuPlus, LuTrash2, LuX, LuCircleCheck, LuGripVertical } from 'react-icons/lu'
import { COLORS } from '@/theme/tokens'

/**
 * Context supplied by the reader (MaterialViewer) so interactive MCQ blocks can
 * report their answered-correct state for progress tracking. The editor doesn't
 * provide it, so node views fall back to edit mode.
 */
export interface MCQContextValue {
  interactive: boolean
  /** 'answer' = murid memilih (belum ada centang); 'pass' = sudah lulus periksa (tampil hijau, terkunci). */
  phase: 'answer' | 'pass'
  /** Naik nilainya untuk memaksa acak ulang + hapus pilihan (saat reset karena >10% salah). */
  resetNonce: number
  onRegister: (key: string) => void
  /** Lapor pilihan murid + benar/salah ke viewer (untuk grading gabungan). */
  onReport: (key: string, picked: number | null, correct: boolean) => void
}
export const MCQContext = createContext<MCQContextValue | null>(null)

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

interface MCQAttrs { question: string; options: string[]; correct: number }

// ── Teacher edit UI ──
function MCQEdit({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const { question, options, correct } = node.attrs as MCQAttrs
  const setOpt = (i: number, val: string) =>
    updateAttributes({ options: options.map((o, j) => (j === i ? val : o)) })
  return (
    <NodeViewWrapper>
      <Box border="1px solid" borderColor={COLORS.primary} borderRadius="8px" bg={COLORS.primaryTint} p="10px" my="10px" contentEditable={false}>
        <Flex align="center" gap="6px" mb="6px">
          <Icon as={LuGripVertical} color={COLORS.muted} data-drag-handle style={{ cursor: 'grab' }} />
          <Text fontSize="11px" fontWeight="700" color={COLORS.primary} flex="1">SOAL PILIHAN GANDA</Text>
          <IconButton aria-label="hapus soal" size="2xs" colorPalette="red" variant="outline" onClick={() => deleteNode()}>
            <Icon as={LuTrash2} />
          </IconButton>
        </Flex>
        <Input size="sm" bg="white" placeholder="Tulis pertanyaan…" value={question}
          onChange={(e) => updateAttributes({ question: e.target.value })} mb="6px" />
        <Text fontSize="11px" color={COLORS.muted} mb="4px">Pilih jawaban benar (radio):</Text>
        <RadioGroup.Root size="sm" value={String(correct)} onValueChange={(e) => e.value !== null && updateAttributes({ correct: Number(e.value) })}>
          <Box>
            {options.map((o, i) => (
              <Flex key={i} gap="6px" align="center" mb="4px">
                <RadioGroup.Item value={String(i)}>
                  <RadioGroup.ItemHiddenInput />
                  <RadioGroup.ItemIndicator />
                </RadioGroup.Item>
                <Input size="sm" bg="white" placeholder={`Opsi ${String.fromCharCode(65 + i)}`} value={o}
                  onChange={(e) => setOpt(i, e.target.value)} />
                {options.length > 2 && (
                  <IconButton aria-label="hapus opsi" size="xs" variant="ghost"
                    onClick={() => updateAttributes({ options: options.filter((_, j) => j !== i), correct: 0 })}>
                    <Icon as={LuX} />
                  </IconButton>
                )}
              </Flex>
            ))}
          </Box>
        </RadioGroup.Root>
        {options.length < 6 && (
          <Button size="2xs" variant="ghost" onClick={() => updateAttributes({ options: [...options, ''] })}>
            <Icon as={LuPlus} /> opsi
          </Button>
        )}
      </Box>
    </NodeViewWrapper>
  )
}

// ── Student interactive UI ──
// Tidak ada centang instan. Murid memilih; grading dilakukan lewat tombol
// "Periksa Jawaban" di viewer. Saat phase 'pass' baru tampil hijau/merah & terkunci.
function MCQPlay({ node, ctx }: { node: NodeViewProps['node']; ctx: MCQContextValue }) {
  const { question, options, correct } = node.attrs as MCQAttrs
  const key = useMemo(() => `${question}::${options.join('|')}`, [question, options])

  // Acak opsi; acak ulang saat resetNonce berubah.
  const shuffled = useMemo(
    () => shuffle(options.map((text, i) => ({ text, correct: i === correct }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [question, options.join('|'), correct, ctx.resetNonce],
  )
  const [picked, setPicked] = useState<number | null>(null)
  const registered = useRef(false)

  useEffect(() => { if (!registered.current) { ctx.onRegister(key); registered.current = true } }, [key, ctx])
  // Reset pilihan saat diacak ulang.
  useEffect(() => { setPicked(null); ctx.onReport(key, null, false) }, [ctx.resetNonce]) // eslint-disable-line react-hooks/exhaustive-deps

  const locked = ctx.phase === 'pass'
  const choose = (i: number) => {
    if (locked) return
    setPicked(i)
    ctx.onReport(key, i, shuffled[i].correct)
  }
  const correctAfterPass = locked && picked !== null && !shuffled[picked].correct

  return (
    <NodeViewWrapper>
      <Box border="1px solid" borderColor={locked ? COLORS.success : COLORS.border} borderRadius="8px"
        bg={locked ? '#F8FAFC' : COLORS.bg} p="12px" my="12px" contentEditable={false}>
        <Flex align="flex-start" gap="8px" mb="8px">
          <Icon as={LuCircleCheck} boxSize="18px" color={locked && picked !== null && shuffled[picked].correct ? COLORS.success : COLORS.border} mt="1px" flexShrink={0} />
          <Text fontSize="14px" fontWeight="600" flex="1">{question || '(soal kosong)'}</Text>
        </Flex>
        <Box pl="26px">
          {shuffled.map((o, i) => {
            const isPicked = picked === i
            const showGreen = locked && o.correct
            const showRed = locked && isPicked && !o.correct
            return (
              <Flex key={i} as="button" w="full" textAlign="left" gap="8px" align="center"
                px="10px" py="8px" mb="5px" borderRadius="6px" border="1px solid"
                cursor={locked ? 'default' : 'pointer'}
                borderColor={showGreen ? COLORS.success : showRed ? COLORS.danger : isPicked ? COLORS.primary : COLORS.border}
                bg={showGreen ? '#DCFCE7' : showRed ? '#FEE2E2' : isPicked ? '#EEF2FF' : 'white'}
                onClick={() => choose(i)}>
                <Text fontSize="13px" fontWeight="600" color={COLORS.muted}>{String.fromCharCode(65 + i)}.</Text>
                <Text fontSize="13px" flex="1">{o.text}</Text>
                {showGreen && <Icon as={LuCircleCheck} color={COLORS.success} />}
              </Flex>
            )
          })}
        </Box>
        {correctAfterPass && <Text fontSize="12px" color={COLORS.danger} pl="26px" mt="4px">Jawabanmu kurang tepat (yang benar ditandai hijau).</Text>}
      </Box>
    </NodeViewWrapper>
  )
}

function MCQView(props: NodeViewProps) {
  const ctx = useContext(MCQContext)
  if (props.editor.isEditable || !ctx?.interactive) {
    // Teacher editing, or read-only render without an interactive context.
    if (props.editor.isEditable) return <MCQEdit {...props} />
  }
  if (ctx?.interactive) return <MCQPlay node={props.node} ctx={ctx} />
  // read-only, no context (shouldn't happen) — plain display
  return (
    <NodeViewWrapper>
      <Box border="1px solid" borderColor={COLORS.border} borderRadius="8px" p="12px" my="12px">
        <Text fontSize="14px" fontWeight="600">{(props.node.attrs as MCQAttrs).question}</Text>
      </Box>
    </NodeViewWrapper>
  )
}

export const MCQNode = Node.create({
  name: 'mcq',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      question: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-question') || '',
        renderHTML: (attrs) => ({ 'data-question': attrs.question || '' }),
      },
      options: {
        default: ['', ''],
        parseHTML: (el) => {
          try { return JSON.parse(el.getAttribute('data-options') || '["",""]') } catch { return ['', ''] }
        },
        renderHTML: (attrs) => ({ 'data-options': JSON.stringify(attrs.options || []) }),
      },
      correct: {
        default: 0,
        parseHTML: (el) => parseInt(el.getAttribute('data-correct') || '0', 10) || 0,
        renderHTML: (attrs) => ({ 'data-correct': String(attrs.correct ?? 0) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="mcq"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'mcq' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MCQView)
  },
})
