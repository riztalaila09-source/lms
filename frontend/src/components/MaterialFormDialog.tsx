import { useEffect, useState } from 'react'
import {
  Box, Button, Dialog, Field, Flex, Icon, IconButton, Input, NativeSelect, Stack, Switch, Text,
} from '@chakra-ui/react'
import { LuX, LuTrash2, LuPencil, LuPlus, LuImage } from 'react-icons/lu'
import { materialClient } from '@/lib/client'
import type { Material, Category } from '@/gen/material/v1/material_pb'
import { ContentType } from '@/gen/material/v1/material_pb'
import RichTextEditor from './RichTextEditor'
import { fileToDataUrl } from '@/lib/image'
import { COLORS } from '@/theme/tokens'

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

export default function MaterialFormDialog({ open, onClose, courseId, material, defaultOrderIndex, onSaved }: Props) {
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

  useEffect(() => {
    if (!open) return
    materialClient.listCategories({}).then((r) => setCategories(r.categories)).catch(() => setCategories([]))
    if (material) {
      setTitle(material.title)
      setDescription(material.description)
      setContent(material.contentText)
      setLinks(decodeLinks(material.contentUrl))
      setPublish(material.isPublished)
      setCategoryId(material.categoryId)
      setCoverImage(material.coverImage) // a /covers/{id} URL for preview
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
  }, [open, material])

  const handleCoverUpload = async (file?: File) => {
    if (!file) return
    setUploadingCover(true)
    try {
      // Small thumbnail — cards are small, so keep covers light for fast lists.
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
          // only send cover when changed, else keep existing (avoid overwriting with the URL)
          coverImage: coverChanged ? coverImage : undefined,
        })
        materialId = material.id
        // wipe & recreate MCQ + essay questions
        for (const qid of serverQuestionIds) {
          await materialClient.deleteQuestion({ id: qid })
        }
        for (const eid of serverEssayIds) {
          await materialClient.deleteEssayQuestion({ id: eid })
        }
      } else {
        const created = await materialClient.createMaterial({
          courseId, title, description, contentType: ContentType.TEXT,
          contentText: content, contentUrl, orderIndex: defaultOrderIndex, categoryId, coverImage,
        })
        materialId = created.id
        if (publish) await materialClient.updateMaterial({ id: materialId, isPublished: true })
      }
      // create MCQ questions (skip empty)
      for (const q of questions) {
        if (!q.question.trim()) continue
        const options = q.options.map((o) => o.trim()).filter(Boolean)
        await materialClient.createQuestion({
          materialId, question: q.question, options,
          correctIndex: options.length ? Math.min(q.correctIndex, options.length - 1) : 0,
          image: q.image || '',
        })
      }
      // create essay questions (skip empty)
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

  return (
    <Dialog.Root open={open} onOpenChange={(e) => { if (!e.open) onClose() }} size="full" scrollBehavior="inside">
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content>
          <Dialog.Header><Dialog.Title>{material ? 'Edit Materi' : 'Tambah Materi'}</Dialog.Title></Dialog.Header>
          <Dialog.Body>
            <form id="material-form" onSubmit={save}>
              <Stack gap="14px" maxW="1100px" mx="auto" w="full">
                <Field.Root>
                  <Field.Label>Kategori</Field.Label>
                  <NativeSelect.Root>
                    <NativeSelect.Field value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                      <option value="">— Tanpa kategori —</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </Field.Root>

                <Box>
                  <Text fontSize="13px" fontWeight="600" mb="6px">Foto Sampul (opsional)</Text>
                  {coverImage ? (
                    <Box position="relative" borderRadius="8px" overflow="hidden" mb="6px" maxW="320px">
                      <Box h="150px" bgImage={`url(${coverImage})`} bgSize="cover" bgPos="center" />
                      <Button size="2xs" colorPalette="red" position="absolute" top="6px" right="6px"
                        onClick={() => { setCoverImage(''); setCoverChanged(true) }}><Icon as={LuX} /> Hapus</Button>
                    </Box>
                  ) : (
                    <Text fontSize="12px" color={COLORS.muted} mb="6px">Belum ada foto. Tampil sebagai sampul kartu di Materi Umum.</Text>
                  )}
                  <input type="file" accept="image/*" disabled={uploadingCover}
                    onChange={(e) => handleCoverUpload(e.target.files?.[0])} style={{ fontSize: 12 }} />
                  {uploadingCover && <Text fontSize="11px" color={COLORS.muted}>Memproses gambar…</Text>}
                </Box>

                <Field.Root required>
                  <Field.Label>Judul *</Field.Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Judul materi" />
                </Field.Root>

                <Field.Root>
                  <Field.Label>Deskripsi</Field.Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Deskripsi singkat" />
                </Field.Root>

                <Field.Root>
                  <Field.Label>Konten / Isi Materi</Field.Label>
                  <RichTextEditor key={`${material?.id ?? 'new'}-${open}`} value={content} onChange={setContent} />
                </Field.Root>

                {/* Links */}
                <Box>
                  <Text fontSize="13px" fontWeight="600" mb="6px">Link File / Video — isi Judul lalu URL</Text>
                  <Stack gap="6px">
                    {links.map((l, i) => (
                      <Flex key={i} gap="6px">
                        <Input flex="1" size="sm" placeholder="Judul (mis. PPT Bab 1)"
                          value={l.label} onChange={(e) => setLink(i, { label: e.target.value })} />
                        <Input flex="2" size="sm" placeholder="https://…"
                          value={l.url} onChange={(e) => setLink(i, { url: e.target.value })} />
                        <IconButton aria-label="hapus link" size="sm" colorPalette="red" variant="outline"
                          onClick={() => setLinks((arr) => arr.filter((_, idx) => idx !== i))}><Icon as={LuX} /></IconButton>
                      </Flex>
                    ))}
                  </Stack>
                  <Button size="xs" variant="outline" mt="6px"
                    onClick={() => setLinks((arr) => [...arr, { label: '', url: '' }])}><Icon as={LuPlus} /> Tambah Link</Button>
                </Box>

                {/* Quiz */}
                <Box borderTop="1px solid" borderColor={COLORS.border} pt="12px">
                  <Flex justify="space-between" align="center" mb="8px">
                    <Text fontSize="13px" fontWeight="600">Soal Pilihan Ganda ({questions.length})</Text>
                    <Button size="xs" variant="outline"
                      onClick={() => setQuestions((arr) => [...arr, { question: '', options: ['', '', '', ''], correctIndex: 0 }])}>
                      <Icon as={LuPlus} /> Tambah Soal
                    </Button>
                  </Flex>
                  <Stack gap="12px">
                    {questions.map((q, qi) => (
                      <Box key={qi} bg={COLORS.bg} p="10px" borderRadius="8px">
                        <Flex gap="6px" mb="6px">
                          <Input size="sm" flex="1" placeholder={`Soal ${qi + 1}`} value={q.question}
                            onChange={(e) => setQ(qi, { question: e.target.value })} />
                          <IconButton aria-label="hapus soal" size="sm" colorPalette="red" variant="outline"
                            onClick={() => setQuestions((arr) => arr.filter((_, idx) => idx !== qi))}><Icon as={LuTrash2} /></IconButton>
                        </Flex>
                        <Flex gap="8px" align="center" mb="6px" wrap="wrap">
                          {q.image && <img src={q.image} alt="" style={{ maxHeight: 80, borderRadius: 6, border: `1px solid ${COLORS.border}` }} />}
                          <label style={{ fontSize: 11, cursor: 'pointer', color: COLORS.primary }}>
                            <Icon as={LuImage} /> {q.image ? 'Ganti gambar' : 'Tambah gambar (opsional)'}
                            <input type="file" accept="image/*" style={{ display: 'none' }}
                              onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { setQ(qi, { image: await fileToDataUrl(f, 600, 0.6) }) } catch { alert('Gagal memuat gambar') } } }} />
                          </label>
                          {q.image && <Button size="2xs" variant="ghost" colorPalette="red" onClick={() => setQ(qi, { image: '' })}><Icon as={LuX} /> Hapus gambar</Button>}
                        </Flex>
                        <Text fontSize="11px" color={COLORS.muted} mb="4px">Pilih jawaban benar (titik radio):</Text>
                        <Stack gap="4px">
                          {q.options.map((o, oi) => (
                            <Flex key={oi} gap="6px" align="center">
                              <input type="radio" name={`correct-${qi}`} checked={q.correctIndex === oi}
                                onChange={() => setQ(qi, { correctIndex: oi })} />
                              <Input size="sm" placeholder={`Opsi ${String.fromCharCode(65 + oi)}`} value={o}
                                onChange={(e) => setOpt(qi, oi, e.target.value)} />
                              {q.options.length > 2 && (
                                <IconButton aria-label="hapus opsi" size="xs" variant="ghost"
                                  onClick={() => setQ(qi, { options: q.options.filter((_, j) => j !== oi), correctIndex: 0 })}><Icon as={LuX} /></IconButton>
                              )}
                            </Flex>
                          ))}
                        </Stack>
                        {q.options.length < 5 && (
                          <Button size="2xs" variant="ghost" mt="4px"
                            onClick={() => setQ(qi, { options: [...q.options, ''] })}><Icon as={LuPlus} /> opsi</Button>
                        )}
                      </Box>
                    ))}
                  </Stack>
                </Box>

                {/* Soal Uraian */}
                <Box borderTop="1px solid" borderColor={COLORS.border} pt="12px">
                  <Flex justify="space-between" align="center" mb="8px">
                    <Text fontSize="13px" fontWeight="600" display="flex" alignItems="center" gap="6px"><Icon as={LuPencil} /> Soal Uraian ({essayQuestions.length})</Text>
                    <Button size="xs" variant="outline"
                      onClick={() => setEssayQuestions((arr) => [...arr, { question: '' }])}>
                      <Icon as={LuPlus} /> Tambah Soal Uraian
                    </Button>
                  </Flex>
                  {essayQuestions.length === 0 ? (
                    <Text fontSize="12px" color={COLORS.muted}>Belum ada soal uraian. Siswa bisa jawab di kolom komentar saat membaca materi.</Text>
                  ) : (
                    <Stack gap="8px">
                      {essayQuestions.map((eq, i) => (
                        <Flex key={i} gap="6px" align="center">
                          <Text fontSize="12px" color={COLORS.muted} minW="22px">{i + 1}.</Text>
                          <Input size="sm" flex="1" placeholder={`Tulis soal uraian ${i + 1}…`} value={eq.question}
                            onChange={(e) => setEssayQuestions((arr) => arr.map((x, j) => j === i ? { question: e.target.value } : x))} />
                          <IconButton aria-label="hapus soal uraian" size="sm" colorPalette="red" variant="outline"
                            onClick={() => setEssayQuestions((arr) => arr.filter((_, j) => j !== i))}><Icon as={LuX} /></IconButton>
                        </Flex>
                      ))}
                    </Stack>
                  )}
                </Box>

                <Flex align="center" gap="10px" borderTop="1px solid" borderColor={COLORS.border} pt="12px">
                  <Switch.Root checked={publish} onCheckedChange={(e) => setPublish(e.checked)}>
                    <Switch.HiddenInput />
                    <Switch.Control />
                  </Switch.Root>
                  <Text fontSize="13px">Publikasikan (siswa bisa membaca)</Text>
                </Flex>

                {error && <Text color={COLORS.danger} fontSize="12px">{error}</Text>}
              </Stack>
            </form>
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
