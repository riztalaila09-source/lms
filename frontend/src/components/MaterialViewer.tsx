import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Badge, Box, Button, Dialog, Flex, Heading, Icon, Image, Input, Spinner, Stack, Text, useBreakpointValue } from '@chakra-ui/react'
import {
  LuCircleCheck, LuPaperclip, LuPencil, LuCheck, LuClock, LuExternalLink,
  LuGraduationCap, LuCalendar, LuList, LuChevronDown, LuPlay,
} from 'react-icons/lu'
import { timestampDate } from '@bufbuild/protobuf/wkt'
import { useEditor, EditorContent } from '@tiptap/react'
import { materialClient } from '@/lib/client'
import type { Material, Question, MaterialCompletion, EssayQuestion, EssayComment } from '@/gen/material/v1/material_pb'
import { Role } from '@/gen/user/v1/user_pb'
import { decodeLinks } from './MaterialFormDialog'
import { StarsDisplay, StarsInput } from '@/components/StarRating'
import { buildExtensions, READER_CSS } from './tiptap'
import { MCQContext } from './MCQNode'
import { VideoContext } from './YouTubeNode'
import YouTubePlayer, { parseYouTubeId } from './YouTubePlayer'
import { COLORS, courseGradient, labelColor } from '@/theme/tokens'
import { useAuth } from '@/hooks/useAuth'
import { toaster } from '@/components/ui/toaster'

interface Props {
  open: boolean
  onClose: () => void
  material: Material | null
}

const LINK_WAIT = 120 // detik: siswa harus membuka link lalu tunggu 2 menit → auto-centang

interface ShuffledOption { text: string; correct: boolean }
interface ShuffledQuestion { question: string; image: string; options: ShuffledOption[] }
interface TocItem { level: number; text: string }

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
function parseDoc(html: string): Document { return new DOMParser().parseFromString(html || '', 'text/html') }
function parseHeadings(html: string): TocItem[] {
  try {
    return Array.from(parseDoc(html).querySelectorAll('h1,h2,h3'))
      .map((h) => ({ level: Number(h.tagName[1]) || 1, text: h.textContent?.trim() || '' }))
      .filter((h) => h.text)
  } catch { return [] }
}
function readingMinutes(html: string): number {
  const text = parseDoc(html).body.textContent || ''
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}

export default function MaterialViewer({ open, onClose, material }: Props) {
  const { user } = useAuth()
  const isStudent = user?.role === Role.STUDENT
  const isDesktop = useBreakpointValue({ base: false, lg: true }) ?? false

  const [fontScale, setFontScale] = useState(() => {
    try { return parseFloat(localStorage.getItem('lms_fontscale') || '1') || 1 } catch { return 1 }
  })
  const bumpScale = (d: number) => setFontScale((s) => {
    const n = Math.min(1.6, Math.max(0.85, Math.round((s + d) * 100) / 100))
    try { localStorage.setItem('lms_fontscale', String(n)) } catch { /* ignore */ }
    return n
  })

  // ── MCQ grading (inline + bottom digabung) ──
  const [phase, setPhase] = useState<'answer' | 'pass'>('answer')
  const [resetNonce, setResetNonce] = useState(0)
  const [mcqKeys, setMcqKeys] = useState<Set<string>>(new Set())
  const [mcqReports, setMcqReports] = useState<Map<string, { picked: number | null; correct: boolean }>>(new Map())
  const onRegister = useCallback((key: string) => setMcqKeys((s) => (s.has(key) ? s : new Set(s).add(key))), [])
  const onReport = useCallback((key: string, picked: number | null, correct: boolean) =>
    setMcqReports((m) => { const n = new Map(m); n.set(key, { picked, correct }); return n }), [])
  const mcqCtx = useMemo(
    () => ({ interactive: true, phase, resetNonce, onRegister, onReport }),
    [phase, resetNonce, onRegister, onReport])

  const contentEditor = useEditor({
    editable: false,
    extensions: buildExtensions(),
    content: material?.contentText || '',
    editorProps: { attributes: { class: 'lms-reader' } },
  })
  useEffect(() => {
    if (contentEditor && material) contentEditor.commands.setContent(material.contentText || '')
  }, [contentEditor, material])

  // reading meta + TOC
  const [toc, setToc] = useState<TocItem[]>([])
  const readMin = useMemo(() => readingMinutes(material?.contentText || ''), [material?.contentText])
  const dateStr = material?.createdAt ? timestampDate(material.createdAt).toLocaleDateString('id-ID', { dateStyle: 'medium' }) : ''

  // scroll progress + active TOC
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [scrollPct, setScrollPct] = useState(0)
  const [activeToc, setActiveToc] = useState(0)
  const [tocOpenMobile, setTocOpenMobile] = useState(false)
  const tocVisible = isDesktop || tocOpenMobile

  const onBodyScroll = () => {
    const el = bodyRef.current
    if (!el) return
    const max = el.scrollHeight - el.clientHeight
    setScrollPct(max > 0 ? Math.min(100, Math.round((el.scrollTop / max) * 100)) : 0)
    const heads = contentRef.current?.querySelectorAll('h1,h2,h3')
    if (heads && heads.length) {
      const threshold = el.getBoundingClientRect().top + 100
      let idx = 0
      heads.forEach((h, i) => { if ((h as HTMLElement).getBoundingClientRect().top <= threshold) idx = i })
      setActiveToc(idx)
    }
  }
  const scrollToHeading = (i: number) => {
    const heads = contentRef.current?.querySelectorAll('h1,h2,h3')
    ;(heads?.[i] as HTMLElement | undefined)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setTocOpenMobile(false)
  }

  // bottom quiz (material_questions)
  const [rawQuestions, setRawQuestions] = useState<Question[]>([])
  const [quiz, setQuiz] = useState<ShuffledQuestion[]>([])
  const [quizPick, setQuizPick] = useState<Record<number, number>>({})

  // essays
  const [essayQuestions, setEssayQuestions] = useState<EssayQuestion[]>([])
  const [essayComments, setEssayComments] = useState<Record<string, EssayComment[]>>({})
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({})
  const [submittingComment, setSubmittingComment] = useState<string | null>(null)

  // lampiran + timer
  const [links, setLinks] = useState<{ label: string; url: string }[]>([])
  const [linkStart, setLinkStart] = useState<(number | null)[]>([])
  const [linkDone, setLinkDone] = useState<boolean[]>([])
  const [now, setNow] = useState(Date.now())

  // Inline (content) YouTube videos that must be watched to complete the material.
  const [registeredVideos, setRegisteredVideos] = useState<Set<string>>(new Set())
  const [watchedVideos, setWatchedVideos] = useState<Set<string>>(new Set())

  const [completion, setCompletion] = useState<MaterialCompletion | null>(null)
  const [completing, setCompleting] = useState(false)
  const [readNoInteractive, setReadNoInteractive] = useState(false)

  // ratings
  const [ratingAvg, setRatingAvg] = useState(0)
  const [ratingCount, setRatingCount] = useState(0)
  const [myRating, setMyRating] = useState(0)
  const [ratingSaving, setRatingSaving] = useState(false)

  const isComplete = !!completion
  const hasMCQ = mcqKeys.size + quiz.length > 0
  const mcqPassed = !hasMCQ || phase === 'pass'

  const hasEssay = essayQuestions.length > 0
  const essaysAnswered = essayQuestions.filter((eq) => (essayComments[eq.id] ?? []).some((c) => c.authorId === user?.id)).length
  const allEssaysAnswered = !hasEssay || essaysAnswered === essayQuestions.length

  const lampiranDoneCount = linkDone.filter(Boolean).length
  const allLampiranDone = links.length === 0 || linkDone.every(Boolean)

  // Inline videos (registered by content YouTube nodes). LAMPIRAN YouTube videos
  // are tracked via linkDone, so they are NOT counted again here.
  const registerVideo = useCallback((key: string) => {
    setRegisteredVideos((s) => (s.has(key) ? s : new Set(s).add(key)))
    try {
      if (material && localStorage.getItem(`lms_video_${material.id}_${key}`) === '1') {
        setWatchedVideos((w) => (w.has(key) ? w : new Set(w).add(key)))
      }
    } catch { /* ignore */ }
  }, [material])
  const watchVideo = useCallback((key: string) => {
    setWatchedVideos((w) => (w.has(key) ? w : new Set(w).add(key)))
    try { if (material) localStorage.setItem(`lms_video_${material.id}_${key}`, '1') } catch { /* ignore */ }
  }, [material])
  const videoCtx = useMemo(() => ({
    interactive: true, onRegister: registerVideo, onWatched: watchVideo, watchedKeys: watchedVideos,
  }), [registerVideo, watchVideo, watchedVideos])

  const videosTotal = registeredVideos.size
  const videosDone = [...registeredVideos].filter((k) => watchedVideos.has(k)).length
  const allVideosWatched = videosDone === videosTotal

  const interactiveTotal = links.length + essayQuestions.length + (hasMCQ ? 1 : 0) + videosTotal
  const interactiveDone = lampiranDoneCount + essaysAnswered + (hasMCQ && mcqPassed ? 1 : 0) + videosDone
  const readPercent = interactiveTotal === 0
    ? (isComplete || readNoInteractive ? 100 : 0)
    : Math.round((interactiveDone / interactiveTotal) * 100)
  const canComplete = !isComplete && mcqPassed && allEssaysAnswered && allLampiranDone && allVideosWatched

  useEffect(() => {
    if (!material) return
    try { localStorage.setItem(`lms_pct_${material.id}`, String(isComplete ? 100 : readPercent)) } catch { /* ignore */ }
  }, [material, readPercent, isComplete])

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
    } catch (e: unknown) { toaster.create({ description: e instanceof Error ? e.message : 'Gagal memberi rating', type: 'error' }) }
    finally { setRatingSaving(false) }
  }

  const loadEssayComments = useCallback(async (questions: EssayQuestion[]) => {
    const map: Record<string, EssayComment[]> = {}
    await Promise.all(questions.map(async (eq) => {
      try { map[eq.id] = (await materialClient.listEssayComments({ essayQuestionId: eq.id })).comments }
      catch { map[eq.id] = [] }
    }))
    setEssayComments(map)
  }, [])

  // Reset + reload when material changes
  useEffect(() => {
    if (!open || !material) return
    const mid = material.id
    setToc(parseHeadings(material.contentText))
    setScrollPct(0); setActiveToc(0); setTocOpenMobile(false)
    const lnks = decodeLinks(material.contentUrl).filter((l) => l.url)
    setLinks(lnks)
    const starts: (number | null)[] = []
    const dones: boolean[] = []
    lnks.forEach((_, i) => {
      let done = false, start: number | null = null
      try {
        done = localStorage.getItem(`lms_linkdone_${mid}_${i}`) === '1'
        const s = localStorage.getItem(`lms_link_${mid}_${i}`)
        start = s ? parseInt(s, 10) : null
        if (!done && start && (Date.now() - start) / 1000 >= LINK_WAIT) { done = true; localStorage.setItem(`lms_linkdone_${mid}_${i}`, '1') }
      } catch { /* ignore */ }
      starts.push(start); dones.push(done)
    })
    setLinkStart(starts); setLinkDone(dones)

    setPhase('answer'); setResetNonce(0)
    setMcqKeys(new Set()); setMcqReports(new Map())
    setQuizPick({}); setReadNoInteractive(false); setCompletion(null)
    setEssayQuestions([]); setEssayComments({}); setCommentDraft({})

    materialClient.listQuestions({ materialId: mid })
      .then((res) => { setRawQuestions(res.questions); setQuiz(buildQuiz(res.questions)) })
      .catch(() => { setRawQuestions([]); setQuiz([]) })
    materialClient.listEssayQuestions({ materialId: mid })
      .then(async (res) => { setEssayQuestions(res.questions); await loadEssayComments(res.questions) })
      .catch(() => setEssayQuestions([]))
    materialClient.getMyCompletion({ materialId: mid })
      .then((c) => { setCompletion(c); setPhase('pass') })
      .catch(() => { /* not completed */ })
  }, [open, material, loadEssayComments])

  useEffect(() => {
    if (!open) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [open])
  useEffect(() => {
    if (!material) return
    linkStart.forEach((st, i) => {
      if (st && !linkDone[i] && (now - st) / 1000 >= LINK_WAIT) {
        setLinkDone((d) => { const n = [...d]; n[i] = true; return n })
        try { localStorage.setItem(`lms_linkdone_${material.id}_${i}`, '1') } catch { /* ignore */ }
      }
    })
  }, [now, linkStart, linkDone, material])

  const openLink = (i: number, url: string) => {
    window.open(url, '_blank', 'noopener')
    if (linkDone[i] || !material) return
    const st = Date.now()
    setLinkStart((s) => { const n = [...s]; n[i] = st; return n })
    try { localStorage.setItem(`lms_link_${material.id}_${i}`, String(st)) } catch { /* ignore */ }
  }

  // A LAMPIRAN YouTube video is marked done once watched (no 120s timer needed).
  const markLinkWatched = (i: number) => {
    if (!material || linkDone[i]) return
    setLinkDone((d) => { const n = [...d]; n[i] = true; return n })
    try { localStorage.setItem(`lms_linkdone_${material.id}_${i}`, '1') } catch { /* ignore */ }
  }

  const checkAnswers = () => {
    const inline = [...mcqKeys].map((k) => mcqReports.get(k) ?? { picked: null, correct: false })
    const inlineUnanswered = inline.some((r) => r.picked === null)
    const bottomUnanswered = quiz.some((_, qi) => quizPick[qi] === undefined)
    if (inlineUnanswered || bottomUnanswered) { toaster.create({ description: 'Jawab semua soal dulu ya.', type: 'warning' }); return }
    const total = inline.length + quiz.length
    let wrong = inline.filter((r) => !r.correct).length
    quiz.forEach((q, qi) => { if (!q.options[quizPick[qi]]?.correct) wrong++ })
    if (total > 0 && wrong * 100 > total * 10) {
      toaster.create({ description: `Ada ${wrong} jawaban salah (lebih dari 10%). Semua soal & jawaban diacak ulang — silakan coba lagi!`, type: 'warning' })
      setResetNonce((n) => n + 1)
      setMcqReports(new Map())
      setQuiz(buildQuiz(rawQuestions))
      setQuizPick({})
      setPhase('answer')
    } else {
      setPhase('pass')
    }
  }

  const handleComplete = async () => {
    if (!material || completing) return
    setCompleting(true)
    try {
      const c = await materialClient.markComplete({ materialId: material.id, readPercent: 100, quizPassed: mcqPassed })
      setCompletion(c)
    } catch (err) { toaster.create({ description: err instanceof Error ? err.message : 'Gagal menyimpan penyelesaian', type: 'error' }) }
    finally { setCompleting(false) }
  }

  const handleAddComment = async (essayQuestionId: string) => {
    const content = (commentDraft[essayQuestionId] ?? '').trim()
    if (!content) return
    setSubmittingComment(essayQuestionId)
    try {
      await materialClient.addEssayComment({ essayQuestionId, content })
      const res = await materialClient.listEssayComments({ essayQuestionId })
      setEssayComments((prev) => ({ ...prev, [essayQuestionId]: res.comments }))
      setCommentDraft((prev) => ({ ...prev, [essayQuestionId]: '' }))
    } catch (err) { toaster.create({ description: err instanceof Error ? err.message : 'Gagal mengirim komentar', type: 'error' }) }
    finally { setSubmittingComment(null) }
  }

  const chooseQuiz = (qi: number, oi: number) => {
    if (phase === 'pass') return
    setQuizPick((p) => ({ ...p, [qi]: oi }))
  }

  return (
    <Dialog.Root open={open} onOpenChange={(e) => { if (!e.open) onClose() }} scrollBehavior="inside" size="full">
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content>
          <Dialog.Header position="relative">
            <Flex align="center" justify="space-between" gap="10px" w="full" pr="30px">
              <Dialog.Title fontSize="14px" color={COLORS.muted} lineClamp={1}>{material?.title}</Dialog.Title>
              <Flex align="center" gap="4px" flexShrink={0}>
                <Button size="xs" variant="outline" onClick={() => bumpScale(-0.1)} title="Perkecil huruf" fontSize="12px">A−</Button>
                <Button size="xs" variant="outline" onClick={() => setFontScale(1)} title="Ukuran normal" fontSize="15px" fontWeight="bold">A</Button>
                <Button size="xs" variant="outline" onClick={() => bumpScale(0.1)} title="Perbesar huruf" fontSize="18px">A+</Button>
              </Flex>
            </Flex>
            {/* scroll progress bar */}
            <Box position="absolute" bottom="0" left="0" h="3px" bg={COLORS.primary} style={{ width: `${scrollPct}%`, transition: 'width .1s linear' }} />
          </Dialog.Header>

          <Dialog.Body ref={bodyRef} onScroll={onBodyScroll}>
            <Box w="full" px={{ base: '12px', md: '32px' }}>
              {/* HERO */}
              {material && (
                <Box position="relative" borderRadius="14px" overflow="hidden"
                  minH={{ base: '160px', md: '210px' }}
                  style={{ background: material.coverImage ? undefined : courseGradient(material.title) }}>
                  {material.coverImage && (
                    <>
                      <Box position="absolute" inset={0} bgImage={`url(${material.coverImage})`} bgSize="cover" bgPos="center" />
                      <Box position="absolute" inset={0} bg="blackAlpha.600" />
                    </>
                  )}
                  <Flex position="relative" direction="column" justify="flex-end" minH={{ base: '160px', md: '210px' }}
                    p={{ base: '16px', md: '26px' }} color="white">
                    <Flex gap="8px" mb="8px" wrap="wrap">
                      {material.categoryName && <Badge {...labelColor(material.categoryName)}>{material.categoryName}</Badge>}
                      {!material.isPublished && <Badge colorPalette="yellow">Draft</Badge>}
                      {isComplete && <Badge colorPalette="green"><Icon as={LuCircleCheck} /> Selesai</Badge>}
                    </Flex>
                    <Heading fontSize={{ base: '22px', md: '32px' }} fontWeight="800" lineHeight="1.15" lineClamp={3}>{material.title}</Heading>
                    <Flex gap={{ base: '12px', md: '18px' }} mt="12px" wrap="wrap" fontSize="12px" color="whiteAlpha.900" align="center">
                      <Flex gap="5px" align="center"><Icon as={LuGraduationCap} /> {material.createdByName || 'Pengajar'}</Flex>
                      {dateStr && <Flex gap="5px" align="center"><Icon as={LuCalendar} /> {dateStr}</Flex>}
                      <Flex gap="5px" align="center"><Icon as={LuClock} /> {readMin} menit baca</Flex>
                      <StarsDisplay value={ratingAvg} count={ratingCount} size={13} />
                    </Flex>
                  </Flex>
                </Box>
              )}

              {/* BODY: main + rail */}
              <Flex direction={{ base: 'column', lg: 'row' }} gap={{ base: '18px', lg: '28px' }} align="flex-start" mt="18px">
                {/* MAIN */}
                <Box flex="1" minW={0} w="full">
                  <Stack gap="16px" maxW={{ lg: '1000px' }}>
                    {material?.description && (
                      <Text fontSize={`${17 * fontScale}px`} color={COLORS.text} fontWeight="500" lineHeight="1.7"
                        borderLeft="3px solid" borderColor={COLORS.primary} pl="14px">{material.description}</Text>
                    )}

                    <MCQContext.Provider value={mcqCtx}>
                      <VideoContext.Provider value={videoCtx}>
                        <Box ref={contentRef} fontSize={`${16 * fontScale}px`} lineHeight="1.9" color={COLORS.text}
                          css={{ '& .ProseMirror': { outline: 'none' }, ...READER_CSS }}>
                          <EditorContent editor={contentEditor} />
                        </Box>
                      </VideoContext.Provider>
                    </MCQContext.Provider>

                    {/* LAMPIRAN / VIDEO */}
                    {links.length > 0 && (
                      <Box border="2px solid" borderColor={allLampiranDone ? COLORS.success : COLORS.warning} borderRadius="10px"
                        bg={allLampiranDone ? '#F0FDF4' : '#FFFBEB'} p="14px" mt="4px">
                        <Flex align="center" gap="8px" mb="10px">
                          <Icon as={LuPaperclip} boxSize="20px" color={allLampiranDone ? COLORS.success : COLORS.warning} />
                          <Text fontSize="15px" fontWeight="800" color={COLORS.text}>LAMPIRAN / VIDEO — wajib dikunjungi</Text>
                        </Flex>
                        <Text fontSize="12px" color={COLORS.muted} mb="10px">
                          Tonton video sampai selesai; untuk tautan lain, klik lalu <b>pelajari minimal 2 menit</b> (centang otomatis setelah 120 detik).
                        </Text>
                        <Stack gap="10px">
                          {links.map((l, i) => {
                            const done = linkDone[i]
                            const ytId = parseYouTubeId(l.url)
                            // YouTube attachment → embedded player, marked done when watched.
                            if (ytId) {
                              return (
                                <Box key={i} bg="white" border="1px solid" borderColor={done ? COLORS.success : COLORS.border} borderRadius="8px" p="10px">
                                  <Flex align="center" gap="8px" mb="8px">
                                    {done
                                      ? <Icon as={LuCircleCheck} boxSize="18px" color={COLORS.success} flexShrink={0} />
                                      : <Icon as={LuPlay} boxSize="18px" color={COLORS.warning} flexShrink={0} />}
                                    <Text fontSize="14px" fontWeight="700" flex="1" lineClamp={1}>{l.label || 'Video'}</Text>
                                    {!done && <Text fontSize="11px" color={COLORS.warning}>Tonton sampai selesai</Text>}
                                  </Flex>
                                  <YouTubePlayer videoId={ytId} interactive watched={done} onWatched={() => markLinkWatched(i)} />
                                </Box>
                              )
                            }
                            const st = linkStart[i]
                            const remain = st && !done ? Math.max(0, LINK_WAIT - Math.floor((now - st) / 1000)) : null
                            return (
                              <Flex key={i} align="center" gap="10px" bg="white" border="1px solid" borderColor={done ? COLORS.success : COLORS.border}
                                borderRadius="8px" px="12px" py="10px">
                                {done ? (
                                  <Icon as={LuCircleCheck} boxSize="20px" color={COLORS.success} flexShrink={0} />
                                ) : remain !== null ? (
                                  <Spinner size="sm" color={COLORS.warning} flexShrink={0} />
                                ) : (
                                  <Box w="20px" h="20px" borderRadius="full" border="2px solid" borderColor={COLORS.border} flexShrink={0} />
                                )}
                                <Box flex="1" minW={0}>
                                  <Flex as="button" align="center" gap="6px" onClick={() => openLink(i, l.url)} color={COLORS.primary}>
                                    <Icon as={LuExternalLink} /> <Text fontSize="14px" fontWeight="600" textDecoration="underline" lineClamp={1}>{l.label || l.url}</Text>
                                  </Flex>
                                  {done ? (
                                    <Text fontSize="11px" color={COLORS.success} mt="1px">Selesai dipelajari ✓</Text>
                                  ) : remain !== null ? (
                                    <Text fontSize="11px" color={COLORS.warning} mt="1px" display="flex" alignItems="center" gap="4px"><Icon as={LuClock} /> Tunggu {remain} detik lagi… (biarkan tab terbuka)</Text>
                                  ) : (
                                    <Text fontSize="11px" color={COLORS.muted} mt="1px">Belum dikunjungi — klik untuk membuka.</Text>
                                  )}
                                </Box>
                              </Flex>
                            )
                          })}
                        </Stack>
                      </Box>
                    )}

                    {/* Latihan Soal (bawah) */}
                    {quiz.length > 0 && (
                      <Box borderTop="1px solid" borderColor={COLORS.border} pt="12px">
                        <Text fontSize="15px" fontWeight="700" mb="10px">Latihan Soal ({quiz.length})</Text>
                        <Stack gap="14px">
                          {quiz.map((q, qi) => {
                            const picked = quizPick[qi]
                            const pass = phase === 'pass'
                            const answeredWrong = pass && picked !== undefined && !q.options[picked].correct
                            return (
                              <Box key={qi} border="1px solid" borderColor={pass && !answeredWrong ? COLORS.success : COLORS.border} borderRadius="8px" p="12px" bg={COLORS.bg}>
                                <Flex align="flex-start" gap="8px" mb="8px">
                                  <Icon as={LuCircleCheck} boxSize="18px" color={pass && !answeredWrong ? COLORS.success : COLORS.border} mt="1px" />
                                  <Text fontSize="14px" fontWeight="600" flex="1">{qi + 1}. {q.question}</Text>
                                </Flex>
                                {q.image && <Image src={q.image} alt="" maxH="200px" mb="8px" borderRadius="8px" border={`1px solid ${COLORS.border}`} />}
                                <Stack gap="5px" pl="26px">
                                  {q.options.map((o, oi) => {
                                    const isPicked = picked === oi
                                    const showGreen = pass && o.correct
                                    const showRed = pass && isPicked && !o.correct
                                    return (
                                      <Flex key={oi} as="button" w="full" textAlign="left" gap="8px" align="center"
                                        px="10px" py="8px" borderRadius="6px" border="1px solid" cursor={pass ? 'default' : 'pointer'}
                                        borderColor={showGreen ? COLORS.success : showRed ? COLORS.danger : isPicked ? COLORS.primary : COLORS.border}
                                        bg={showGreen ? '#DCFCE7' : showRed ? '#FEE2E2' : isPicked ? '#EEF2FF' : 'white'}
                                        onClick={() => chooseQuiz(qi, oi)}>
                                        <Text fontSize="13px" fontWeight="600" color={COLORS.muted}>{String.fromCharCode(65 + oi)}.</Text>
                                        <Text fontSize="13px" flex="1">{o.text}</Text>
                                        {showGreen && <Icon as={LuCircleCheck} color={COLORS.success} />}
                                      </Flex>
                                    )
                                  })}
                                </Stack>
                              </Box>
                            )
                          })}
                        </Stack>
                      </Box>
                    )}

                    {/* Soal Uraian */}
                    {essayQuestions.length > 0 && (
                      <Box borderTop="1px solid" borderColor={COLORS.border} pt="12px">
                        <Text fontSize="15px" fontWeight="700" mb="10px" display="flex" alignItems="center" gap="6px"><Icon as={LuPencil} /> Soal Uraian ({essayQuestions.length})</Text>
                        <Stack gap="16px">
                          {essayQuestions.map((eq, qi) => {
                            const comments = essayComments[eq.id] ?? []
                            const myAnswer = comments.some((c) => c.authorId === user?.id)
                            return (
                              <Box key={eq.id} bg={COLORS.bg} p="12px" borderRadius="8px" border="1px solid" borderColor={myAnswer ? COLORS.success : COLORS.border}>
                                <Text fontSize="13px" fontWeight="600" mb="8px">{qi + 1}. {eq.question}</Text>
                                {myAnswer && <Badge colorPalette="green" variant="subtle" mb="8px" fontSize="11px"><Icon as={LuCheck} /> Sudah dijawab</Badge>}
                                {comments.length > 0 && (
                                  <Stack gap="8px" mb="10px">
                                    {comments.map((c) => (
                                      <Flex key={c.id} gap="8px" align="flex-start" bg={COLORS.surface} p="8px" borderRadius="6px" border="1px solid" borderColor={COLORS.border}>
                                        <Badge colorPalette={c.authorRole === 'teacher' || c.authorRole === 'admin' ? 'purple' : 'blue'} variant="subtle" fontSize="10px" flexShrink={0} mt="1px">
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
                                <Flex gap="8px">
                                  <Input size="sm" flex={1} placeholder={myAnswer ? 'Tambah komentar lagi…' : 'Tulis jawabanmu di sini…'}
                                    value={commentDraft[eq.id] ?? ''}
                                    onChange={(e) => setCommentDraft((prev) => ({ ...prev, [eq.id]: e.target.value }))}
                                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(eq.id) } }} />
                                  <Button size="sm" bg={COLORS.primary} color="white" _hover={{ opacity: 0.85 }}
                                    loading={submittingComment === eq.id} onClick={() => handleAddComment(eq.id)}>Kirim</Button>
                                </Flex>
                              </Box>
                            )
                          })}
                        </Stack>
                      </Box>
                    )}
                  </Stack>
                </Box>

                {/* RAIL */}
                <Box w={{ base: 'full', lg: '260px' }} flexShrink={0} order={{ base: -1, lg: 0 }}
                  position={{ lg: 'sticky' }} top={{ lg: '4px' }} alignSelf="flex-start">
                  <Stack gap="14px">
                    {toc.length > 0 && (
                      <Box border="1px solid" borderColor={COLORS.border} borderRadius="10px" p="12px" bg={COLORS.surface}>
                        <Flex as="button" w="full" align="center" justify="space-between"
                          onClick={() => !isDesktop && setTocOpenMobile((o) => !o)} cursor={isDesktop ? 'default' : 'pointer'}>
                          <Text fontSize="13px" fontWeight="700" display="flex" alignItems="center" gap="6px" color={COLORS.text}><Icon as={LuList} /> Daftar Isi</Text>
                          {!isDesktop && <Icon as={LuChevronDown} transform={tocOpenMobile ? 'rotate(180deg)' : undefined} transition="transform .2s" />}
                        </Flex>
                        {tocVisible && (
                          <Stack gap="1px" mt="10px" maxH={{ lg: '50vh' }} overflowY="auto">
                            {toc.map((h, i) => (
                              <Text as="button" key={i} textAlign="left" fontSize="12.5px" py="3px"
                                pl={`${8 + (h.level - 1) * 12}px`} lineClamp={2}
                                borderLeft="2px solid" borderColor={activeToc === i ? COLORS.primary : 'transparent'}
                                color={activeToc === i ? COLORS.primary : COLORS.muted}
                                fontWeight={activeToc === i ? '700' : '400'}
                                _hover={{ color: COLORS.primary }}
                                onClick={() => scrollToHeading(i)}>{h.text}</Text>
                            ))}
                          </Stack>
                        )}
                      </Box>
                    )}

                    {interactiveTotal > 0 && (
                      <Box border="1px solid" borderColor={COLORS.border} borderRadius="10px" p="12px" bg={COLORS.surface}>
                        <Flex justify="space-between" mb="6px">
                          <Text fontSize="12px" fontWeight="600" color={COLORS.muted}>Progres</Text>
                          <Text fontSize="12px" fontWeight="700" color={readPercent === 100 ? COLORS.success : COLORS.primary}>{readPercent}%</Text>
                        </Flex>
                        <Box h="8px" bg={COLORS.border} borderRadius="4px">
                          <Box h="8px" bg={readPercent === 100 ? COLORS.success : COLORS.primary} borderRadius="4px"
                            style={{ width: `${readPercent}%`, transition: 'width .3s' }} />
                        </Box>
                      </Box>
                    )}

                    {isStudent && (
                      <Box border="1px solid" borderColor={COLORS.border} borderRadius="10px" p="12px" bg={COLORS.surface}>
                        <Text fontSize="12px" color={COLORS.muted} mb="6px">{myRating ? 'Ratingmu' : 'Beri rating materi'}</Text>
                        <StarsInput value={myRating} onRate={rate} size={26} disabled={ratingSaving} />
                      </Box>
                    )}
                  </Stack>
                </Box>
              </Flex>
            </Box>
          </Dialog.Body>

          <Dialog.Footer>
            <Flex gap="8px" align="center" w="full" justify="space-between" wrap="wrap">
              <Flex gap="8px" align="center">
                {hasMCQ && phase === 'answer' && (
                  <Button size="sm" bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }} onClick={checkAnswers}>
                    <Icon as={LuCheck} /> Periksa Jawaban
                  </Button>
                )}
                {!isComplete && (
                  <Button size="sm"
                    bg={(canComplete || interactiveTotal === 0) ? COLORS.success : COLORS.border}
                    color={(canComplete || interactiveTotal === 0) ? 'white' : COLORS.muted}
                    disabled={interactiveTotal > 0 && !canComplete}
                    loading={completing}
                    onClick={() => { if (interactiveTotal === 0) setReadNoInteractive(true); handleComplete() }}
                    title={
                      interactiveTotal === 0 ? 'Tandai sudah dibaca'
                        : !mcqPassed ? 'Klik "Periksa Jawaban" dan lulus dulu'
                        : !allVideosWatched ? 'Tonton semua video dulu'
                        : !allLampiranDone ? 'Kunjungi & pelajari semua lampiran dulu'
                        : !allEssaysAnswered ? 'Jawab semua soal uraian dulu'
                        : 'Tandai materi selesai'
                    }>
                    <Icon as={LuCircleCheck} /> {interactiveTotal === 0 ? 'Selesai membaca' : 'Selesai'}
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
