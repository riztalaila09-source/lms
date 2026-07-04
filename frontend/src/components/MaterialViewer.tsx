import { useEffect, useState, useCallback, useRef } from 'react'
import { Badge, Box, Button, Dialog, Flex, Icon, Input, Stack, Text } from '@chakra-ui/react'
import {
  LuCircleCheck, LuPaperclip, LuLink, LuClipboardList, LuPartyPopper,
  LuCheck, LuPencil, LuLock,
} from 'react-icons/lu'
import { materialClient } from '@/lib/client'
import type { Material, Question, MaterialCompletion, EssayQuestion, EssayComment } from '@/gen/material/v1/material_pb'
import { Role } from '@/gen/user/v1/user_pb'
import { decodeLinks } from './MaterialFormDialog'
import { StarsDisplay, StarsInput } from '@/components/StarRating'
import { COLORS } from '@/theme/tokens'
import { useAuth } from '@/hooks/useAuth'

interface Props {
  open: boolean
  onClose: () => void
  material: Material | null
}

interface ShuffledOption { text: string; correct: boolean }
interface ShuffledQuestion { question: string; image: string; options: ShuffledOption[] }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildQuiz(questions: Question[]): ShuffledQuestion[] {
  return shuffle(questions)
    .filter((q) => q.options.length > 0)
    .map((q) => ({
      question: q.question,
      image: q.image,
      options: shuffle(q.options.map((text, i) => ({ text, correct: i === q.correctIndex }))),
    }))
}

// Parse HTML content into individual checkable sections
function parseSections(html: string): string[] {
  if (!html.trim()) return []
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const nodes = Array.from(doc.body.childNodes)
  const sections: string[] = []
  for (const n of nodes) {
    if (n.nodeType === Node.ELEMENT_NODE) {
      sections.push((n as Element).outerHTML)
    } else if (n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) {
      sections.push(`<p>${n.textContent}</p>`)
    }
  }
  return sections.length > 0 ? sections : [html]
}

interface ProgressState {
  checked: boolean[]
  locked: boolean[]
}

function loadProgress(materialId: string, count: number): ProgressState {
  try {
    const raw = localStorage.getItem(`lms_prog_${materialId}`)
    if (raw) {
      const p = JSON.parse(raw) as ProgressState
      if (p.checked?.length === count) return p
    }
  } catch { /* ignore */ }
  return { checked: Array(count).fill(false), locked: Array(count).fill(false) }
}

function saveProgress(materialId: string, state: ProgressState) {
  try { localStorage.setItem(`lms_prog_${materialId}`, JSON.stringify(state)) } catch { /* ignore */ }
}

export default function MaterialViewer({ open, onClose, material }: Props) {
  const { user } = useAuth()

  const [quiz, setQuiz] = useState<ShuffledQuestion[]>([])
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [quizResult, setQuizResult] = useState<'idle' | 'pass'>('idle')
  const [loadingQuiz, setLoadingQuiz] = useState(false)

  // essay questions + comments
  const [essayQuestions, setEssayQuestions] = useState<EssayQuestion[]>([])
  const [essayComments, setEssayComments] = useState<Record<string, EssayComment[]>>({})
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({})
  const [submittingComment, setSubmittingComment] = useState<string | null>(null)
  const [loadingEssay, setLoadingEssay] = useState(false)

  // reading progress
  const [sections, setSections] = useState<string[]>([])
  const [links, setLinks] = useState<{ label: string; url: string }[]>([])
  const [checked, setChecked] = useState<boolean[]>([])
  const [locked, setLocked] = useState<boolean[]>([])
  const [marked, setMarked] = useState(false)
  const [completion, setCompletion] = useState<MaterialCompletion | null>(null)
  const [completing, setCompleting] = useState(false)

  // star ratings
  const [ratingAvg, setRatingAvg] = useState(0)
  const [ratingCount, setRatingCount] = useState(0)
  const [myRating, setMyRating] = useState(0)
  const [ratingSaving, setRatingSaving] = useState(false)
  const isStudent = user?.role === Role.STUDENT

  useEffect(() => {
    if (!material) return
    setRatingAvg(material.avgRating || 0)
    setRatingCount(material.ratingCount || 0)
    let mine = 0
    try { mine = parseInt(localStorage.getItem(`lms_rating_${material.id}`) || '0', 10) || 0 } catch { /* ignore */ }
    setMyRating(mine)
  }, [material])

  const rate = async (n: number) => {
    if (!material) return
    setRatingSaving(true)
    try {
      const r = await materialClient.rateMaterial({ materialId: material.id, stars: n })
      setRatingAvg(r.avgRating); setRatingCount(r.ratingCount); setMyRating(r.myRating || n)
      try { localStorage.setItem(`lms_rating_${material.id}`, String(r.myRating || n)) } catch { /* ignore */ }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Gagal memberi rating')
    } finally {
      setRatingSaving(false)
    }
  }

  const sectionRefs = useRef<(HTMLDivElement | null)[]>([])

  const quizPassed = quizResult === 'pass'

  const descSlot = material?.description ? 1 : 0
  const totalSlots = descSlot + sections.length + links.length // reading checkboxes
  const readingDone = checked.filter(Boolean).length

  const hasQuiz = quiz.length > 0
  const hasEssay = essayQuestions.length > 0

  // allEssaysAnswered: current user has commented on all essay questions
  const allEssaysAnswered = !hasEssay ||
    essayQuestions.every((eq) => (essayComments[eq.id] ?? []).some((c) => c.authorId === user?.id))

  // Progress counts reading + quiz (all answers correct) + essays (answered) as
  // units, so the percentage only reaches 100% when EVERYTHING is done — not
  // when only the reading checkboxes are ticked.
  const totalUnits = totalSlots + (hasQuiz ? 1 : 0) + (hasEssay ? 1 : 0)
  const doneUnits = readingDone + (hasQuiz && quizPassed ? 1 : 0) + (hasEssay && allEssaysAnswered ? 1 : 0)
  const readPercent = totalUnits === 0 ? 100 : Math.round(doneUnits / totalUnits * 100)

  const isComplete = !!completion
  const canComplete = readingDone === totalSlots && (!hasQuiz || quizPassed) && allEssaysAnswered && !isComplete

  // Mirror reading percent to localStorage so the material list (outside this
  // viewer) can show each material's progress without re-opening it.
  useEffect(() => {
    if (!material) return
    const pct = isComplete ? 100 : readPercent
    try { localStorage.setItem(`lms_pct_${material.id}`, String(pct)) } catch { /* ignore */ }
  }, [material, readPercent, isComplete])

  const reshuffle = useCallback((questions: Question[]) => {
    setQuiz(buildQuiz(questions))
    setAnswers({})
    setQuizResult('idle')
  }, [])

  const loadEssayComments = useCallback(async (questions: EssayQuestion[]) => {
    const map: Record<string, EssayComment[]> = {}
    await Promise.all(questions.map(async (eq) => {
      try {
        const res = await materialClient.listEssayComments({ essayQuestionId: eq.id })
        map[eq.id] = res.comments
      } catch {
        map[eq.id] = []
      }
    }))
    setEssayComments(map)
  }, [])

  // Reset + reload when material changes
  useEffect(() => {
    if (!open || !material) return

    const secs = parseSections(material.contentText)
    const lnks = decodeLinks(material.contentUrl).filter((l) => l.url)
    setSections(secs)
    setLinks(lnks)

    const totalSlots = (material.description ? 1 : 0) + secs.length + lnks.length
    const prog = loadProgress(material.id, totalSlots)
    setChecked(prog.checked)
    setLocked(prog.locked)
    setMarked(prog.locked.some(Boolean))
    setCompletion(null)
    setQuizResult('idle')
    setAnswers({})
    setEssayQuestions([])
    setEssayComments({})
    setCommentDraft({})

    // load quiz
    setLoadingQuiz(true)
    materialClient.listQuestions({ materialId: material.id })
      .then((res) => reshuffle(res.questions))
      .catch(() => setQuiz([]))
      .finally(() => setLoadingQuiz(false))

    // load essay questions + comments
    setLoadingEssay(true)
    materialClient.listEssayQuestions({ materialId: material.id })
      .then(async (res) => {
        setEssayQuestions(res.questions)
        await loadEssayComments(res.questions)
      })
      .catch(() => setEssayQuestions([]))
      .finally(() => setLoadingEssay(false))

    // hydrate completion from backend
    materialClient.getMyCompletion({ materialId: material.id })
      .then((c) => {
        setCompletion(c)
        if (c.readPercent === 100) {
          const full = Array(totalSlots).fill(true)
          setChecked(full)
          setLocked(full)
          setMarked(true)
        }
      })
      .catch(() => { /* not found = not completed yet */ })
  }, [open, material, reshuffle, loadEssayComments])

  const toggleCheck = (i: number) => {
    if (locked[i]) return
    const next = [...checked]
    next[i] = !next[i]
    setChecked(next)
    if (material) saveProgress(material.id, { checked: next, locked })
  }

  const autoCheck = (i: number) => {
    if (checked[i]) return
    const next = [...checked]
    next[i] = true
    setChecked(next)
    if (material) saveProgress(material.id, { checked: next, locked })
  }

  const handleMark = () => {
    const nextLocked = [...checked]
    setLocked(nextLocked)
    setMarked(true)
    if (material) saveProgress(material.id, { checked, locked: nextLocked })
  }

  const handleComplete = async () => {
    if (!material || completing) return
    setCompleting(true)
    try {
      const c = await materialClient.markComplete({
        materialId: material.id,
        readPercent: 100,
        quizPassed,
      })
      setCompletion(c)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal menyimpan penyelesaian')
    } finally {
      setCompleting(false)
    }
  }

  const handleAddComment = async (essayQuestionId: string) => {
    const content = (commentDraft[essayQuestionId] ?? '').trim()
    if (!content) return
    setSubmittingComment(essayQuestionId)
    try {
      await materialClient.addEssayComment({ essayQuestionId, content })
      // reload comments for this question
      const res = await materialClient.listEssayComments({ essayQuestionId })
      setEssayComments((prev) => ({ ...prev, [essayQuestionId]: res.comments }))
      setCommentDraft((prev) => ({ ...prev, [essayQuestionId]: '' }))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal mengirim komentar')
    } finally {
      setSubmittingComment(null)
    }
  }

  const submitQuiz = () => {
    if (Object.keys(answers).length < quiz.length) {
      alert('Jawab semua soal dulu ya.')
      return
    }
    let wrong = 0
    quiz.forEach((q, i) => {
      const picked = answers[i]
      if (picked === undefined || !q.options[picked]?.correct) wrong++
    })
    if (wrong === 0) {
      setQuizResult('pass')
    } else {
      alert(`Ada ${wrong} jawaban yang salah. Soal & jawaban akan diacak ulang, silakan coba lagi!`)
      if (material) {
        materialClient.listQuestions({ materialId: material.id })
          .then((res) => reshuffle(res.questions))
          .catch(() => {})
      }
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(e) => { if (!e.open) onClose() }} scrollBehavior="inside" size="full">
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>{material?.title}</Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            <Stack gap="14px" maxW="900px" mx="auto" w="full">
              {/* Completion badge */}
              {isComplete && (
                <Box bg="#DCFCE7" color="#166534" px="12px" py="8px" borderRadius="8px" display="flex" alignItems="center" gap="8px">
                  <Icon as={LuCircleCheck} boxSize="16px" />
                  <Text fontSize="13px" fontWeight="600">Materi ini sudah kamu selesaikan!</Text>
                </Box>
              )}

              {/* Rating */}
              <Flex justify="space-between" align="center" wrap="wrap" gap="10px"
                bg={COLORS.bg} px="12px" py="10px" borderRadius="8px">
                <Flex align="center" gap="8px" wrap="wrap">
                  <StarsDisplay value={ratingAvg} count={ratingCount} size={15} />
                  <Text fontSize="12px" color={COLORS.muted}>peringkat materi</Text>
                </Flex>
                {isStudent && (
                  <Flex align="center" gap="8px">
                    <Text fontSize="12px" color={COLORS.muted}>{myRating ? 'Ratingmu:' : 'Beri rating:'}</Text>
                    <StarsInput value={myRating} onRate={rate} size={24} disabled={ratingSaving} />
                  </Flex>
                )}
              </Flex>

              {/* Description — with checkbox */}
              {material?.description && (
                <Flex gap="8px" align="flex-start">
                  <input
                    type="checkbox"
                    checked={checked[0] ?? false}
                    onChange={() => toggleCheck(0)}
                    title="Tandai deskripsi sudah dibaca"
                    style={{ marginTop: 3, flexShrink: 0, cursor: locked[0] ? 'default' : 'pointer' }}
                    readOnly={locked[0]}
                  />
                  <Text fontSize="13px" color={COLORS.muted} flex={1}>{material.description}</Text>
                </Flex>
              )}

              {/* Rich content — parsed sections with checkboxes */}
              {sections.length > 0 && (
                <Box borderTop="1px solid" borderColor={COLORS.border} pt="10px">
                  <Stack gap="8px">
                    {sections.map((html, i) => {
                      const slotIdx = descSlot + i
                      const isChecked = checked[slotIdx] ?? false
                      const isLocked = locked[slotIdx] ?? false
                      return (
                        <Flex key={i} gap="8px" align="flex-start">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleCheck(slotIdx)}
                            title={isLocked ? 'Sudah dikunci' : 'Tandai sudah dibaca'}
                            style={{ marginTop: 4, flexShrink: 0, cursor: isLocked ? 'default' : 'pointer' }}
                            readOnly={isLocked}
                          />
                          <Box
                            ref={(el: HTMLDivElement | null) => { sectionRefs.current[i] = el }}
                            flex={1}
                            fontSize="14px"
                            lineHeight="1.7"
                            css={{
                              '& table td, & table th': { border: '1px solid #ccc', padding: '5px 9px' },
                              '& table': { borderCollapse: 'collapse', width: '100%' },
                              '& ul, & ol': { paddingLeft: '22px' },
                              '& img': { maxWidth: '100%', borderRadius: '6px' },
                              '& h1': { fontSize: '1.6em', fontWeight: 700, margin: '6px 0' },
                              '& h2': { fontSize: '1.35em', fontWeight: 700, margin: '6px 0' },
                              '& h3': { fontSize: '1.15em', fontWeight: 600, margin: '6px 0' },
                              '& a': { color: COLORS.primary, textDecoration: 'underline' },
                            }}
                            onClick={(e) => {
                              const target = e.target as HTMLElement
                              if (target.tagName === 'A') autoCheck(slotIdx)
                            }}
                            dangerouslySetInnerHTML={{ __html: html }}
                          />
                        </Flex>
                      )
                    })}
                  </Stack>
                </Box>
              )}

              {/* Links / Lampiran — each with its own checkbox */}
              {links.length > 0 && (
                <Box>
                  <Text fontSize="12px" fontWeight="600" color={COLORS.muted} mb="6px" display="flex" alignItems="center" gap="5px"><Icon as={LuPaperclip} /> LAMPIRAN / VIDEO</Text>
                  <Stack gap="6px">
                    {links.map((l, i) => {
                      const slotIdx = descSlot + sections.length + i
                      const isChecked = checked[slotIdx] ?? false
                      const isLocked = locked[slotIdx] ?? false
                      return (
                        <Flex key={i} gap="8px" align="center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleCheck(slotIdx)}
                            title={isLocked ? 'Sudah dikunci' : 'Tandai sudah dibuka'}
                            style={{ flexShrink: 0, cursor: isLocked ? 'default' : 'pointer' }}
                            readOnly={isLocked}
                          />
                          <a href={l.url} target="_blank" rel="noreferrer"
                            style={{ color: COLORS.primary, fontSize: 13, textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            onClick={() => autoCheck(slotIdx)}>
                            <Icon as={LuLink} /> {l.label || l.url}
                          </a>
                        </Flex>
                      )
                    })}
                  </Stack>
                </Box>
              )}

              {/* Progress bar */}
              {totalSlots > 0 && (
                <Box>
                  <Flex justify="space-between" mb="4px">
                    <Text fontSize="12px" color={COLORS.muted}>Progress Membaca</Text>
                    <Text fontSize="12px" fontWeight="600" color={readPercent === 100 ? COLORS.success : COLORS.primary}>
                      {readPercent}%
                    </Text>
                  </Flex>
                  <Box h="8px" bg={COLORS.border} borderRadius="4px">
                    <Box
                      h="8px"
                      bg={readPercent === 100 ? COLORS.success : COLORS.primary}
                      borderRadius="4px"
                      style={{ width: `${readPercent}%`, transition: 'width 0.3s' }}
                    />
                  </Box>
                </Box>
              )}

              {/* Quiz */}
              {loadingQuiz ? (
                <Text color={COLORS.muted} fontSize="13px">Memuat soal…</Text>
              ) : quiz.length > 0 && (
                <Box borderTop="1px solid" borderColor={COLORS.border} pt="12px">
                  <Text fontSize="14px" fontWeight="600" mb="10px" display="flex" alignItems="center" gap="6px"><Icon as={LuClipboardList} /> Latihan Soal ({quiz.length})</Text>
                  {quizResult === 'pass' ? (
                    <Box bg="#DCFCE7" color="#166534" p="14px" borderRadius="8px" textAlign="center">
                      <Text fontSize="16px" fontWeight="bold" display="flex" alignItems="center" justifyContent="center" gap="6px"><Icon as={LuPartyPopper} /> Selamat! Semua jawaban benar!</Text>
                      <Button mt="8px" size="sm" variant="outline"
                        onClick={() => { if (material) materialClient.listQuestions({ materialId: material.id }).then((r) => reshuffle(r.questions)) }}>
                        Coba lagi
                      </Button>
                    </Box>
                  ) : (
                    <Stack gap="14px">
                      {quiz.map((q, qi) => (
                        <Box key={qi}>
                          <Text fontSize="13px" fontWeight="medium" mb="6px">{qi + 1}. {q.question}</Text>
                          {q.image && <img src={q.image} alt="" style={{ maxHeight: 200, marginBottom: 6, borderRadius: 8, border: `1px solid ${COLORS.border}` }} />}
                          <Stack gap="5px">
                            {q.options.map((o, oi) => {
                              const picked = answers[qi] === oi
                              return (
                                <Flex key={oi} gap="8px" align="center" cursor="pointer"
                                  bg={picked ? '#DBEAFE' : COLORS.bg} px="10px" py="7px" borderRadius="6px"
                                  border="1px solid" borderColor={picked ? COLORS.primary : COLORS.border}
                                  onClick={() => setAnswers((a) => ({ ...a, [qi]: oi }))}>
                                  <input type="radio" name={`q-${qi}`} checked={picked} readOnly />
                                  <Text fontSize="13px">{String.fromCharCode(65 + oi)}. {o.text}</Text>
                                </Flex>
                              )
                            })}
                          </Stack>
                        </Box>
                      ))}
                      <Button bg={COLORS.success} color="white" _hover={{ opacity: 0.9 }} onClick={submitQuiz}>
                        <Icon as={LuCheck} /> Kumpulkan Jawaban
                      </Button>
                      <Text fontSize="11px" color={COLORS.muted} textAlign="center">
                        Jika ada 1 saja yang salah, semua soal & jawaban akan diacak ulang.
                      </Text>
                    </Stack>
                  )}
                </Box>
              )}

              {/* Soal Uraian */}
              {loadingEssay ? (
                <Text color={COLORS.muted} fontSize="13px">Memuat soal uraian…</Text>
              ) : essayQuestions.length > 0 && (
                <Box borderTop="1px solid" borderColor={COLORS.border} pt="12px">
                  <Text fontSize="14px" fontWeight="600" mb="10px" display="flex" alignItems="center" gap="6px"><Icon as={LuPencil} /> Soal Uraian ({essayQuestions.length})</Text>
                  <Stack gap="16px">
                    {essayQuestions.map((eq, qi) => {
                      const comments = essayComments[eq.id] ?? []
                      const myAnswer = comments.some((c) => c.authorId === user?.id)
                      return (
                        <Box key={eq.id} bg={COLORS.bg} p="12px" borderRadius="8px"
                          border="1px solid" borderColor={myAnswer ? COLORS.success : COLORS.border}>
                          <Text fontSize="13px" fontWeight="600" mb="8px">{qi + 1}. {eq.question}</Text>
                          {myAnswer && (
                            <Badge colorPalette="green" variant="subtle" mb="8px" fontSize="11px"><Icon as={LuCheck} /> Sudah dijawab</Badge>
                          )}
                          {/* List komentar */}
                          {comments.length > 0 && (
                            <Stack gap="8px" mb="10px">
                              {comments.map((c) => (
                                <Flex key={c.id} gap="8px" align="flex-start"
                                  bg={COLORS.surface} p="8px" borderRadius="6px" border="1px solid" borderColor={COLORS.border}>
                                  <Badge
                                    colorPalette={c.authorRole === 'teacher' || c.authorRole === 'admin' ? 'purple' : 'blue'}
                                    variant="subtle" fontSize="10px" flexShrink={0} mt="1px">
                                    {c.authorRole === 'teacher' || c.authorRole === 'admin' ? 'Guru' : 'Siswa'}
                                  </Badge>
                                  <Box flex={1}>
                                    <Text fontSize="12px" fontWeight="600" color={COLORS.text}>{c.authorName}</Text>
                                    <Text fontSize="13px" color={COLORS.text} mt="2px">{c.content}</Text>
                                  </Box>
                                </Flex>
                              ))}
                            </Stack>
                          )}
                          {/* Input komentar baru */}
                          <Flex gap="8px">
                            <Input
                              size="sm" flex={1}
                              placeholder={myAnswer ? 'Tambah komentar lagi…' : 'Tulis jawabanmu di sini…'}
                              value={commentDraft[eq.id] ?? ''}
                              onChange={(e) => setCommentDraft((prev) => ({ ...prev, [eq.id]: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(eq.id) } }}
                            />
                            <Button
                              size="sm" bg={COLORS.primary} color="white" _hover={{ opacity: 0.85 }}
                              loading={submittingComment === eq.id}
                              onClick={() => handleAddComment(eq.id)}>
                              Kirim
                            </Button>
                          </Flex>
                        </Box>
                      )
                    })}
                  </Stack>
                  {!allEssaysAnswered && (
                    <Text fontSize="11px" color={COLORS.muted} mt="8px">
                      * Jawab semua soal uraian di atas agar tombol Selesai bisa diklik.
                    </Text>
                  )}
                </Box>
              )}

              {!material?.isPublished && (
                <Badge colorPalette="yellow" alignSelf="flex-start">Draft — belum dipublikasi</Badge>
              )}
            </Stack>
          </Dialog.Body>
          <Dialog.Footer>
            <Flex gap="8px" align="center" w="full" justify="space-between">
              <Flex gap="8px">
                {/* Mark button — locks current checked state */}
                {totalSlots > 0 && !isComplete && (
                  <Button
                    size="sm"
                    variant="outline"
                    colorPalette="blue"
                    onClick={handleMark}
                    title="Kunci semua yang sudah dicentang"
                  >
                    <Icon as={LuLock} /> {marked ? 'Re-Mark' : 'Mark'}
                  </Button>
                )}
                {/* Complete button — active only when all conditions met */}
                {!isComplete && (
                  <Button
                    size="sm"
                    bg={canComplete ? COLORS.success : COLORS.border}
                    color={canComplete ? 'white' : COLORS.muted}
                    disabled={!canComplete}
                    loading={completing}
                    onClick={handleComplete}
                    title={
                      readingDone < totalSlots ? 'Centang semua bacaan dulu' :
                      (hasQuiz && !quizPassed) ? 'Jawab benar semua soal pilihan ganda dulu' :
                      !allEssaysAnswered ? 'Jawab semua soal uraian dulu' :
                      'Tandai materi sebagai selesai'
                    }
                  >
                    <Icon as={LuCircleCheck} /> Selesai
                  </Button>
                )}
              </Flex>
              <Button variant="outline" onClick={onClose}>Tutup</Button>
            </Flex>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  )
}
