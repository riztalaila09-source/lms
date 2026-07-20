import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Badge, Box, Button, Dialog, Flex, Heading, Icon, IconButton, Image, Input, NativeSelect, RadioGroup, Stack, Switch, Text,
} from '@chakra-ui/react'
import {
  LuX, LuTrash2, LuPencil, LuPlus, LuImage, LuImagePlus, LuChevronDown, LuEye, LuGlobe, LuTag, LuPaperclip, LuListChecks, LuUpload, LuFileText,
} from 'react-icons/lu'
import { useEditor, EditorContent } from '@tiptap/react'
import { materialClient } from '@/lib/client'
import type { Material, Category } from '@/gen/material/v1/material_pb'
import { ContentType } from '@/gen/material/v1/material_pb'
import RichTextEditor from './RichTextEditor'
import { buildExtensions, READER_CSS } from './tiptap'
import { MCQContext } from './MCQNode'
import { VideoContext } from './YouTubeNode'
import { PhaseContext } from './PhaseNode'
import { fileToDataUrl } from '@/lib/image'
import { COLORS, courseGradient, labelColor } from '@/theme/tokens'
import { toaster } from '@/components/ui/toaster'

export interface LinkRow { label: string; url: string }
export interface DraftQuestion { question: string; options: string[]; correctIndex: number; image?: string }
export interface DraftEssayQuestion { question: string }

export function encodeLinks(links: LinkRow[]): string {
  return links.filter((l) => l.url.trim()).map((l) => `${l.label.trim() || l.url.trim()}||${l.url.trim()}`).join('\n')
}
export function decodeLinks(s: string): LinkRow[] {
  const rows = (s || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const p = l.split('||')
    return p.length > 1 ? { label: p[0], url: p[1] } : { label: '', url: p[0] }
  })
  return rows.length ? rows : [{ label: '', url: '' }]
}

// ── CSV bulk-import of questions (blok soal) ──
// Reuse pola dari UsersPage; BOM agar Excel membaca UTF-8 dengan benar.
function downloadCSV(content: string, filename: string) {
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Parse satu baris CSV dengan hormat tanda kutip ganda (koma boleh di dalam
// field, "" = kutip literal) — teks soal hampir pasti mengandung koma.
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else inQuotes = false
      } else cur += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

export const TEMPLATE_PG_CSV = [
  'Soal,Opsi A,Opsi B,Opsi C,Opsi D,Opsi E,Jawaban Benar',
  '"Ibu kota Indonesia adalah, secara resmi?",Jakarta,Bandung,Surabaya,Medan,,A',
  'Hasil dari 2 + 3 adalah,3,4,5,6,,C',
].join('\n')

export const TEMPLATE_URAIAN_CSV = [
  'Soal',
  'Jelaskan pengertian jaringan komputer beserta contohnya.',
  'Sebutkan langkah-langkah instalasi sistem operasi.',
].join('\n')

// Ambil baris CSV (buang header + baris kosong) sebagai array kolom.
function csvRows(text: string): string[][] {
  const lines = (text || '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  return lines.slice(1).map(parseCsvLine)
}

export function parsePgCsv(text: string): DraftQuestion[] {
  const lines = (text || '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase())
  const findOpt = (letter: string) => headers.findIndex((h) => h.includes('opsi') && h.includes(letter))
  const idx = {
    question: headers.findIndex((h) => h.includes('soal')),
    opts: ['a', 'b', 'c', 'd', 'e'].map(findOpt),
    answer: headers.findIndex((h) => h.includes('jawaban')),
  }
  return lines.slice(1).map(parseCsvLine).map((vals) => {
    const get = (i: number) => (i >= 0 ? (vals[i] || '').trim() : '')
    const question = get(idx.question) || vals[0] || ''
    const options = idx.opts.map(get).filter(Boolean)
    // "Jawaban Benar" sebagai huruf A–E → index; fallback 0.
    const ans = get(idx.answer).toUpperCase()
    let correctIndex = ans ? ans.charCodeAt(0) - 65 : 0
    if (correctIndex < 0 || correctIndex >= options.length) correctIndex = 0
    return { question, options: options.length ? options : ['', ''], correctIndex }
  }).filter((q) => q.question.trim())
}

export function parseUraianCsv(text: string): DraftEssayQuestion[] {
  const headers = parseCsvLine(((text || '').replace(/^﻿/, '').split(/\r?\n/)[0]) || '').map((h) => h.toLowerCase())
  const qi = headers.findIndex((h) => h.includes('soal'))
  return csvRows(text).map((vals) => ({ question: (qi >= 0 ? vals[qi] : vals[0]) || '' })).filter((q) => q.question.trim())
}

interface Props {
  open: boolean
  onClose: () => void
  courseId: string
  /** Deprecated — no longer shown in the form. Kept for call-site compatibility. */
  courseName?: string
  material: Material | null
  defaultOrderIndex: number
  onSaved: () => void
}

// ── Preview (how students will read it) ──
function MaterialPreview({ title, description, content, coverImage, categoryName }: {
  title: string; description: string; content: string; coverImage: string; categoryName: string
}) {
  const editor = useEditor({ editable: false, extensions: buildExtensions(), content })
  useEffect(() => { if (editor) editor.commands.setContent(content || '') }, [editor, content])
  const ctx = useMemo(() => ({
    interactive: true, phase: 'answer' as const, resetNonce: 0,
    onRegister: () => {}, onReport: () => {},
  }), [])
  const videoCtx = useMemo(() => ({
    interactive: true, onRegister: () => {}, onWatched: () => {}, watchedKeys: new Set<string>(),
  }), [])
  return (
    <Box maxW="1000px" mx="auto" w="full">
      <Box position="relative" borderRadius="14px" overflow="hidden" minH="160px" mb="18px"
        style={{ background: coverImage ? undefined : courseGradient(title || 'Materi') }}>
        {coverImage && (
          <>
            <Box position="absolute" inset={0} bgImage={`url(${coverImage})`} bgSize="cover" bgPos="center" />
            <Box position="absolute" inset={0} bg="blackAlpha.600" />
          </>
        )}
        <Flex position="relative" direction="column" justify="flex-end" minH="160px" p="24px" color="white">
          {categoryName && <Badge {...labelColor(categoryName)} mb="8px" w="fit-content">{categoryName}</Badge>}
          <Heading fontSize="28px" fontWeight="800" lineClamp={3}>{title || 'Judul materi'}</Heading>
          {description && <Text fontSize="14px" color="whiteAlpha.900" mt="6px">{description}</Text>}
        </Flex>
      </Box>
      <MCQContext.Provider value={ctx}>
        <VideoContext.Provider value={videoCtx}>
          <PhaseContext.Provider value={{ interactive: false, materialId: '' }}>
            <Box fontSize="16px" lineHeight="1.9" color={COLORS.text} css={{ '& .ProseMirror': { outline: 'none' }, ...READER_CSS }}>
              <EditorContent editor={editor} />
            </Box>
          </PhaseContext.Provider>
        </VideoContext.Provider>
      </MCQContext.Provider>
      <Text fontSize="11px" color={COLORS.muted} mt="16px" fontStyle="italic">
        * Lampiran, soal, rating & progres tampil saat murid membaca materi yang sudah tersimpan.
      </Text>
    </Box>
  )
}

function SettingCard({ title, icon, action, children }: { title: string; icon: React.ElementType; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Box border="1px solid" borderColor={COLORS.border} borderRadius="10px" bg={COLORS.surface} overflow="hidden">
      <Flex align="center" gap="6px" px="12px" py="9px" borderBottom="1px solid" borderColor={COLORS.border} bg={COLORS.bg}>
        <Icon as={icon} boxSize="15px" color={COLORS.primary} />
        <Text fontSize="12px" fontWeight="700" flex="1" color={COLORS.text}>{title}</Text>
        {action}
      </Flex>
      <Box p="12px">{children}</Box>
    </Box>
  )
}

export default function MaterialFormDialog({ open, onClose, courseId, material, defaultOrderIndex, onSaved }: Props) {
  const [mode, setMode] = useState<'write' | 'preview'>('write')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  // Bumped once per open/material-load AFTER content state is set, so the keyed
  // RichTextEditor remounts on the render where `content` already holds the
  // correct value (mencegah konten materi lama bocor / editor mount dgn konten basi).
  const [loadNonce, setLoadNonce] = useState(0)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')
  const [links, setLinks] = useState<LinkRow[]>([{ label: '', url: '' }])
  const [questions, setQuestions] = useState<DraftQuestion[]>([])
  const [essayQuestions, setEssayQuestions] = useState<DraftEssayQuestion[]>([])
  const [serverQuestionIds, setServerQuestionIds] = useState<string[]>([])
  const [serverEssayIds, setServerEssayIds] = useState<string[]>([])
  const [publish, setPublish] = useState(true)
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [coverImage, setCoverImage] = useState('') // URL (existing) or data URL (new)
  const [coverChanged, setCoverChanged] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const categoryName = categories.find((c) => c.id === categoryId)?.name || ''

  useEffect(() => {
    if (!open) return
    setMode('write'); setAdvancedOpen(false)
    materialClient.listCategories({}).then((r) => setCategories(r.categories)).catch(() => setCategories([]))
    if (material) {
      setTitle(material.title)
      setDescription(material.description)
      setContent(material.contentText)
      setLinks(decodeLinks(material.contentUrl))
      setPublish(material.isPublished)
      setCategoryId(material.categoryId)
      setCoverImage(material.coverImage)
      setCoverChanged(false)
      Promise.all([
        materialClient.listQuestions({ materialId: material.id }),
        materialClient.listEssayQuestions({ materialId: material.id }),
      ]).then(([qRes, eqRes]) => {
        setQuestions(qRes.questions.map((q) => ({
          question: q.question,
          options: q.options.length ? q.options : ['', ''],
          correctIndex: q.correctIndex,
          image: q.image,
        })))
        setServerQuestionIds(qRes.questions.map((q) => q.id))
        setEssayQuestions(eqRes.questions.map((q) => ({ question: q.question })))
        setServerEssayIds(eqRes.questions.map((q) => q.id))
        if (qRes.questions.length || eqRes.questions.length) setAdvancedOpen(true)
      }).catch(() => {
        setQuestions([]); setServerQuestionIds([])
        setEssayQuestions([]); setServerEssayIds([])
      })
    } else {
      setTitle(''); setDescription(''); setContent('')
      setLinks([{ label: '', url: '' }])
      setQuestions([]); setServerQuestionIds([])
      setEssayQuestions([]); setServerEssayIds([])
      setPublish(true)
      setCategoryId('')
      setCoverImage('')
      setCoverChanged(false)
    }
    setError('')
    // Remount editor now that `content` is set for this open (batched together).
    setLoadNonce((n) => n + 1)
  }, [open, material])

  const handleCoverUpload = async (file?: File) => {
    if (!file) return
    setUploadingCover(true)
    try {
      setCoverImage(await fileToDataUrl(file, 480, 0.6))
      setCoverChanged(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat gambar')
    } finally {
      setUploadingCover(false)
    }
  }

  const setLink = (i: number, patch: Partial<LinkRow>) =>
    setLinks((arr) => arr.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  const setQ = (i: number, patch: Partial<DraftQuestion>) =>
    setQuestions((arr) => arr.map((q, idx) => (idx === i ? { ...q, ...patch } : q)))
  const setOpt = (qi: number, oi: number, val: string) =>
    setQuestions((arr) => arr.map((q, idx) => idx === qi
      ? { ...q, options: q.options.map((o, j) => (j === oi ? val : o)) } : q))

  // ── Import soal dari CSV (append ke draft) ──
  const pgImportRef = useRef<HTMLInputElement>(null)
  const uraianImportRef = useRef<HTMLInputElement>(null)
  const importPg = async (file?: File) => {
    if (!file) return
    try {
      const rows = parsePgCsv(await file.text())
      if (!rows.length) { toaster.create({ description: 'File kosong atau format tidak sesuai template.', type: 'error' }); return }
      setQuestions((arr) => [...arr, ...rows])
      toaster.create({ description: `${rows.length} soal pilihan ganda diimpor.`, type: 'success' })
    } catch { toaster.create({ description: 'Gagal membaca file CSV.', type: 'error' }) }
  }
  const importUraian = async (file?: File) => {
    if (!file) return
    try {
      const rows = parseUraianCsv(await file.text())
      if (!rows.length) { toaster.create({ description: 'File kosong atau format tidak sesuai template.', type: 'error' }); return }
      setEssayQuestions((arr) => [...arr, ...rows])
      toaster.create({ description: `${rows.length} soal uraian diimpor.`, type: 'success' })
    } catch { toaster.create({ description: 'Gagal membaca file CSV.', type: 'error' }) }
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) { setError('Judul wajib diisi.'); return }
    setSaving(true)
    setError('')
    try {
      const contentUrl = encodeLinks(links)
      let materialId: string
      if (material) {
        await materialClient.updateMaterial({
          id: material.id, title, description, contentText: content,
          contentUrl, contentType: ContentType.TEXT, isPublished: publish, categoryId,
          coverImage: coverChanged ? coverImage : undefined,
        })
        materialId = material.id
        for (const qid of serverQuestionIds) await materialClient.deleteQuestion({ id: qid })
        for (const eid of serverEssayIds) await materialClient.deleteEssayQuestion({ id: eid })
      } else {
        const created = await materialClient.createMaterial({
          courseId, title, description, contentType: ContentType.TEXT,
          contentText: content, contentUrl, orderIndex: defaultOrderIndex, categoryId, coverImage,
        })
        materialId = created.id
        if (publish) await materialClient.updateMaterial({ id: materialId, isPublished: true })
      }
      for (const q of questions) {
        if (!q.question.trim()) continue
        const options = q.options.map((o) => o.trim()).filter(Boolean)
        await materialClient.createQuestion({
          materialId, question: q.question, options,
          correctIndex: options.length ? Math.min(q.correctIndex, options.length - 1) : 0,
          image: q.image || '',
        })
      }
      for (let i = 0; i < essayQuestions.length; i++) {
        const eq = essayQuestions[i]
        if (!eq.question.trim()) continue
        await materialClient.createEssayQuestion({ materialId, question: eq.question, orderIndex: i })
      }
      onSaved()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan materi')
    } finally {
      setSaving(false)
    }
  }

  const SegBtn = ({ id, icon, label }: { id: 'write' | 'preview'; icon: React.ElementType; label: string }) => (
    <Button size="xs" variant={mode === id ? 'solid' : 'ghost'}
      bg={mode === id ? COLORS.primary : 'transparent'} color={mode === id ? 'white' : COLORS.muted}
      _hover={{ bg: mode === id ? COLORS.primaryDark : COLORS.bg }} onClick={() => setMode(id)}>
      <Icon as={icon} /> {label}
    </Button>
  )

  return (
    <Dialog.Root open={open} onOpenChange={(e) => { if (!e.open) onClose() }} size="full" scrollBehavior="inside">
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content>
          <Dialog.Header>
            <Flex align="center" justify="space-between" gap="10px" w="full" pr="30px" wrap="wrap">
              <Dialog.Title>{material ? 'Edit Materi' : 'Tambah Materi'}</Dialog.Title>
              <Flex gap="4px" border="1px solid" borderColor={COLORS.border} borderRadius="8px" p="2px">
                <SegBtn id="write" icon={LuPencil} label="Tulis" />
                <SegBtn id="preview" icon={LuEye} label="Pratinjau" />
              </Flex>
            </Flex>
          </Dialog.Header>

          <Dialog.Body>
            {/* WRITE (kept mounted; hidden in preview so editor content persists) */}
            <Box display={mode === 'write' ? 'block' : 'none'}>
              <form id="material-form" onSubmit={save}>
                <Flex direction={{ base: 'column', lg: 'row' }} gap="20px" align="flex-start" w="full" px={{ base: '12px', md: '28px' }}>
                  {/* MAIN — composer */}
                  <Box flex="1" minW={0} w="full">
                    <Input variant="flushed" px="0" fontSize={{ base: '22px', md: '27px' }} fontWeight="800"
                      placeholder="Judul materi…" value={title} onChange={(e) => setTitle(e.target.value)} mb="6px" />
                    <Input variant="flushed" px="0" fontSize="15px" color={COLORS.muted}
                      placeholder="Deskripsi singkat (opsional)" value={description} onChange={(e) => setDescription(e.target.value)} mb="14px" />
                    <RichTextEditor key={`${material?.id ?? 'new'}-${loadNonce}`} value={content} onChange={setContent} />
                    {error && <Text color={COLORS.danger} fontSize="12px" mt="8px">{error}</Text>}
                  </Box>

                  {/* SIDEBAR — settings */}
                  <Box w={{ base: 'full', lg: '320px' }} flexShrink={0} position={{ lg: 'sticky' }} top={{ lg: '4px' }} alignSelf="flex-start">
                    <Stack gap="12px">
                      <SettingCard title="Publikasi" icon={LuGlobe}>
                        <Flex align="center" gap="10px">
                          <Switch.Root checked={publish} onCheckedChange={(e) => setPublish(e.checked)}>
                            <Switch.HiddenInput />
                            <Switch.Control />
                          </Switch.Root>
                          <Text fontSize="13px" color={publish ? COLORS.success : COLORS.muted} fontWeight="600">
                            {publish ? 'Tampil ke murid' : 'Draft (tersembunyi)'}
                          </Text>
                        </Flex>
                      </SettingCard>

                      <SettingCard title="Kategori" icon={LuTag}>
                        <NativeSelect.Root size="sm">
                          <NativeSelect.Field value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                            <option value="">— Tanpa kategori —</option>
                            {categories.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                          </NativeSelect.Field>
                          <NativeSelect.Indicator />
                        </NativeSelect.Root>
                      </SettingCard>

                      <SettingCard title="Foto Sampul" icon={LuImage}>
                        {coverImage && (
                          <Box position="relative" borderRadius="8px" overflow="hidden" mb="8px">
                            <Box h="120px" bgImage={`url(${coverImage})`} bgSize="cover" bgPos="center" />
                            <Button size="2xs" colorPalette="red" position="absolute" top="6px" right="6px"
                              onClick={() => { setCoverImage(''); setCoverChanged(true) }}><Icon as={LuX} /> Hapus</Button>
                          </Box>
                        )}
                        <Box as="label" display="block" textAlign="center" cursor="pointer"
                          border="2px dashed" borderColor={dragOver ? COLORS.primary : COLORS.border}
                          borderRadius="10px" p="14px" bg={dragOver ? COLORS.primaryTint : COLORS.bg}
                          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                          onDragLeave={() => setDragOver(false)}
                          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleCoverUpload(e.dataTransfer.files?.[0]) }}>
                          <Icon as={LuImagePlus} boxSize="22px" color={COLORS.muted} />
                          <Text fontSize="12px" color={COLORS.muted} mt="4px">
                            {uploadingCover ? 'Memproses gambar…' : coverImage ? 'Klik / seret untuk ganti' : 'Klik atau seret gambar ke sini'}
                          </Text>
                          <input type="file" accept="image/*" hidden disabled={uploadingCover}
                            onChange={(e) => handleCoverUpload(e.target.files?.[0])} />
                        </Box>
                      </SettingCard>

                      <SettingCard title="Lampiran / Video" icon={LuPaperclip}
                        action={<Button size="2xs" variant="ghost" onClick={() => setLinks((arr) => [...arr, { label: '', url: '' }])}><Icon as={LuPlus} /></Button>}>
                        <Stack gap="6px">
                          {links.map((l, i) => (
                            <Box key={i} border="1px solid" borderColor={COLORS.border} borderRadius="7px" p="7px">
                              <Flex gap="6px" mb="5px">
                                <Input flex="1" size="xs" placeholder="Judul (mis. PPT Bab 1)"
                                  value={l.label} onChange={(e) => setLink(i, { label: e.target.value })} />
                                <IconButton aria-label="hapus link" size="xs" colorPalette="red" variant="ghost"
                                  onClick={() => setLinks((arr) => arr.filter((_, idx) => idx !== i))}><Icon as={LuX} /></IconButton>
                              </Flex>
                              <Input size="xs" placeholder="https://…" value={l.url} onChange={(e) => setLink(i, { url: e.target.value })} />
                            </Box>
                          ))}
                          {links.length === 0 && <Text fontSize="11px" color={COLORS.muted}>Belum ada lampiran.</Text>}
                        </Stack>
                      </SettingCard>

                      {/* Lanjutan (collapsible) */}
                      <Box border="1px solid" borderColor={COLORS.border} borderRadius="10px" bg={COLORS.surface} overflow="hidden">
                        <Button type="button" onClick={() => setAdvancedOpen((o) => !o)} variant="plain"
                          w="full" justifyContent="flex-start" gap="6px" px="12px" py="9px" h="auto" borderRadius="0"
                          bg={COLORS.bg} _hover={{ bg: COLORS.bg }}>
                          <Icon as={LuListChecks} boxSize="15px" color={COLORS.primary} />
                          <Text fontSize="12px" fontWeight="700" flex="1" textAlign="left" color={COLORS.text}>Lanjutan — Soal blok</Text>
                          <Icon as={LuChevronDown} transform={advancedOpen ? 'rotate(180deg)' : undefined} transition="transform .2s" color={COLORS.muted} />
                        </Button>
                        {advancedOpen && (
                          <Box p="12px">
                            <Text fontSize="11px" color={COLORS.muted} mb="10px">
                              Soal di sini tampil sebagai blok di <b>akhir</b> materi. Untuk soal <b>di tengah teks</b>, pakai tombol <b>Soal PG</b> di toolbar editor.
                              Bisa juga <b>Import</b> dari CSV (unduh <b>Template</b> dulu) — soal ditambahkan ke daftar; gambar & jawaban bisa disunting setelah impor.
                            </Text>

                            {/* Soal Pilihan Ganda (blok) */}
                            <Flex justify="space-between" align="center" mb="8px" gap="6px" wrap="wrap">
                              <Text fontSize="12px" fontWeight="700">Soal Pilihan Ganda ({questions.length})</Text>
                              <Flex gap="4px">
                                <Button size="2xs" variant="ghost" onClick={() => downloadCSV(TEMPLATE_PG_CSV, 'template-soal-pg.csv')}>
                                  <Icon as={LuFileText} /> Template
                                </Button>
                                <Button size="2xs" variant="ghost" onClick={() => pgImportRef.current?.click()}>
                                  <Icon as={LuUpload} /> Import
                                </Button>
                                <input ref={pgImportRef} type="file" accept=".csv,text/csv" hidden
                                  onChange={(e) => { importPg(e.target.files?.[0]); e.target.value = '' }} />
                                <Button size="2xs" variant="outline"
                                  onClick={() => setQuestions((arr) => [...arr, { question: '', options: ['', '', '', ''], correctIndex: 0 }])}>
                                  <Icon as={LuPlus} /> Soal
                                </Button>
                              </Flex>
                            </Flex>
                            <Stack gap="10px" mb="14px">
                              {questions.map((q, qi) => (
                                <Box key={qi} bg={COLORS.bg} p="10px" borderRadius="8px">
                                  <Flex gap="6px" mb="6px">
                                    <Input size="xs" flex="1" placeholder={`Soal ${qi + 1}`} value={q.question}
                                      onChange={(e) => setQ(qi, { question: e.target.value })} />
                                    <IconButton aria-label="hapus soal" size="xs" colorPalette="red" variant="ghost"
                                      onClick={() => setQuestions((arr) => arr.filter((_, idx) => idx !== qi))}><Icon as={LuTrash2} /></IconButton>
                                  </Flex>
                                  <Flex gap="8px" align="center" mb="6px" wrap="wrap">
                                    {q.image && <Image src={q.image} alt="" maxH="60px" borderRadius="6px" border={`1px solid ${COLORS.border}`} />}
                                    <Box as="label" fontSize="11px" cursor="pointer" color={COLORS.primary} display="inline-flex" alignItems="center" gap="4px">
                                      <Icon as={LuImage} /> {q.image ? 'Ganti gambar' : '+ gambar'}
                                      <input type="file" accept="image/*" style={{ display: 'none' }}
                                        onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { setQ(qi, { image: await fileToDataUrl(f, 600, 0.6) }) } catch { toaster.create({ description: 'Gagal memuat gambar', type: 'error' }) } } }} />
                                    </Box>
                                    {q.image && <Button size="2xs" variant="ghost" colorPalette="red" onClick={() => setQ(qi, { image: '' })}><Icon as={LuX} /></Button>}
                                  </Flex>
                                  <Text fontSize="10px" color={COLORS.muted} mb="4px">Pilih jawaban benar (radio):</Text>
                                  <RadioGroup.Root size="sm" value={String(q.correctIndex)} onValueChange={(e) => e.value !== null && setQ(qi, { correctIndex: Number(e.value) })}>
                                    <Stack gap="4px">
                                      {q.options.map((o, oi) => (
                                        <Flex key={oi} gap="6px" align="center">
                                          <RadioGroup.Item value={String(oi)}>
                                            <RadioGroup.ItemHiddenInput />
                                            <RadioGroup.ItemIndicator />
                                          </RadioGroup.Item>
                                          <Input size="xs" placeholder={`Opsi ${String.fromCharCode(65 + oi)}`} value={o} onChange={(e) => setOpt(qi, oi, e.target.value)} />
                                          {q.options.length > 2 && (
                                            <IconButton aria-label="hapus opsi" size="2xs" variant="ghost"
                                              onClick={() => setQ(qi, { options: q.options.filter((_, j) => j !== oi), correctIndex: 0 })}><Icon as={LuX} /></IconButton>
                                          )}
                                        </Flex>
                                      ))}
                                    </Stack>
                                  </RadioGroup.Root>
                                  {q.options.length < 5 && (
                                    <Button size="2xs" variant="ghost" mt="4px" onClick={() => setQ(qi, { options: [...q.options, ''] })}><Icon as={LuPlus} /> opsi</Button>
                                  )}
                                </Box>
                              ))}
                            </Stack>

                            {/* Soal Uraian */}
                            <Flex justify="space-between" align="center" mb="8px" gap="6px" wrap="wrap">
                              <Text fontSize="12px" fontWeight="700" display="flex" alignItems="center" gap="5px"><Icon as={LuPencil} /> Soal Uraian ({essayQuestions.length})</Text>
                              <Flex gap="4px">
                                <Button size="2xs" variant="ghost" onClick={() => downloadCSV(TEMPLATE_URAIAN_CSV, 'template-soal-uraian.csv')}>
                                  <Icon as={LuFileText} /> Template
                                </Button>
                                <Button size="2xs" variant="ghost" onClick={() => uraianImportRef.current?.click()}>
                                  <Icon as={LuUpload} /> Import
                                </Button>
                                <input ref={uraianImportRef} type="file" accept=".csv,text/csv" hidden
                                  onChange={(e) => { importUraian(e.target.files?.[0]); e.target.value = '' }} />
                                <Button size="2xs" variant="outline" onClick={() => setEssayQuestions((arr) => [...arr, { question: '' }])}>
                                  <Icon as={LuPlus} /> Soal
                                </Button>
                              </Flex>
                            </Flex>
                            {essayQuestions.length === 0 ? (
                              <Text fontSize="11px" color={COLORS.muted}>Belum ada. Murid menjawab lewat kolom komentar.</Text>
                            ) : (
                              <Stack gap="6px">
                                {essayQuestions.map((eq, i) => (
                                  <Flex key={i} gap="6px" align="center">
                                    <Text fontSize="11px" color={COLORS.muted} minW="18px">{i + 1}.</Text>
                                    <Input size="xs" flex="1" placeholder={`Soal uraian ${i + 1}…`} value={eq.question}
                                      onChange={(e) => setEssayQuestions((arr) => arr.map((x, j) => j === i ? { question: e.target.value } : x))} />
                                    <IconButton aria-label="hapus" size="xs" colorPalette="red" variant="ghost"
                                      onClick={() => setEssayQuestions((arr) => arr.filter((_, j) => j !== i))}><Icon as={LuX} /></IconButton>
                                  </Flex>
                                ))}
                              </Stack>
                            )}
                          </Box>
                        )}
                      </Box>
                    </Stack>
                  </Box>
                </Flex>
              </form>
            </Box>

            {/* PREVIEW */}
            {mode === 'preview' && (
              <MaterialPreview title={title} description={description} content={content} coverImage={coverImage} categoryName={categoryName} />
            )}
          </Dialog.Body>

          <Dialog.Footer>
            <Button variant="outline" onClick={onClose}>Batal</Button>
            <Button type="submit" form="material-form" loading={saving}
              bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }}>
              Simpan Materi
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  )
}
