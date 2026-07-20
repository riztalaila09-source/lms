import { useRef } from 'react'
import { Box, Button, Flex, Icon, NativeSelect } from '@chakra-ui/react'
import { useEditor, EditorContent } from '@tiptap/react'
import {
  LuBold, LuItalic, LuUnderline, LuBaseline, LuAlignLeft, LuAlignCenter,
  LuAlignRight, LuAlignJustify, LuListOrdered, LuList, LuTable, LuImage, LuLink, LuUndo2, LuRedo2,
  LuListChecks, LuYoutube, LuCode, LuLayoutList, LuFileText, LuPresentation, LuFileUp,
} from 'react-icons/lu'
import { COLORS } from '@/theme/tokens'
import { fileToDataUrl } from '@/lib/image'
import { importDocxToHtml } from '@/lib/docx'
import { buildExtensions, CONTENT_CSS } from './tiptap'
import { PHASES } from './PhaseNode'
import { pdfEmbedUrl } from './PdfNode'
import { slideEmbedUrl } from './SlideNode'
import { parseYouTubeId } from './YouTubePlayer'
import { toaster } from '@/components/ui/toaster'

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
}

const FONT_SIZES = ['12px', '14px', '16px', '18px', '24px', '32px']

// Beberapa emoji yang relevan dengan pembelajaran (disisipkan sebagai teks).
const EDU_EMOJIS: [string, string][] = [
  ['📚', 'Buku'], ['📖', 'Baca'], ['✏️', 'Pensil'], ['📝', 'Catatan'], ['💡', 'Ide'],
  ['🎯', 'Target'], ['✅', 'Benar'], ['❌', 'Salah'], ['⭐', 'Bintang'], ['🏆', 'Juara'],
  ['❓', 'Tanya'], ['⚠️', 'Penting'], ['🧠', 'Berpikir'], ['🔬', 'Riset'], ['🧮', 'Hitung'],
  ['👍', 'Bagus'],
]

/**
 * TipTap-based rich editor. Sticky toolbar (headings, font size, B/I/U, colour,
 * align, lists, table, image, link, undo/redo) + a button to insert an inline
 * multiple-choice question (MCQ) node anywhere in the text.
 */
export default function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  const imgInput = useRef<HTMLInputElement>(null)
  const docxInput = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    extensions: buildExtensions(),
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: { class: 'lms-editor', style: 'min-height: 340px; padding: 14px; outline: none;' },
    },
  })

  const toolStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '4px 8px', fontSize: 12, border: `1px solid ${COLORS.border}`,
    borderRadius: 4, background: COLORS.surface, cursor: 'pointer', lineHeight: 1.4,
  }
  const Tool = ({ label, title, onClick, active }: { label: React.ReactNode; title: string; onClick: () => void; active?: boolean }) => (
    <Button type="button" title={title} variant="outline" gap="4px" px="8px" py="4px" h="auto" minH="0"
      fontSize="12px" lineHeight="1.4" color={COLORS.text}
      bg={active ? COLORS.primaryTint : COLORS.surface}
      borderColor={active ? COLORS.primary : COLORS.border}
      _hover={{ bg: active ? COLORS.primaryTint : COLORS.bg }}
      onMouseDown={(e) => e.preventDefault()} onClick={onClick}>{label}</Button>
  )

  if (!editor) return null

  const insertImage = async (file?: File) => {
    if (!file) return
    try {
      const dataUrl = await fileToDataUrl(file, 900, 0.82)
      editor.chain().focus().setImage({ src: dataUrl }).run()
    } catch (e) {
      toaster.create({ description: e instanceof Error ? e.message : 'Gagal menyisipkan gambar', type: 'error' })
    }
  }
  const insertLink = () => {
    const url = prompt('Masukkan URL:', 'https://')
    if (url) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }
  const insertTable = () => {
    const rows = parseInt(prompt('Jumlah baris:', '3') || '3', 10) || 3
    const cols = parseInt(prompt('Jumlah kolom:', '3') || '3', 10) || 3
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
  }
  const insertMCQ = () => {
    editor.chain().focus().insertContent({ type: 'mcq', attrs: { question: '', options: ['', '', '', ''], correct: 0 } }).run()
  }
  const insertYoutube = () => {
    const url = prompt('Tempel URL video YouTube:', 'https://')
    if (!url) return
    if (!parseYouTubeId(url)) { toaster.create({ description: 'URL YouTube tidak valid.', type: 'error' }); return }
    editor.chain().focus().insertContent({ type: 'youtube', attrs: { src: url } }).run()
  }
  const insertPdf = () => {
    const url = prompt('Tempel link Google Drive PDF (bagikan: siapa saja yang punya link) atau URL .pdf:', 'https://')
    if (!url || url.trim() === 'https://') return
    if (!pdfEmbedUrl(url)) { toaster.create({ description: 'Link PDF tidak dikenali.', type: 'error' }); return }
    editor.chain().focus().insertContent({ type: 'pdf', attrs: { src: url.trim() } }).run()
  }
  const insertSlide = () => {
    const url = prompt('Tempel link Canva (bagikan: siapa saja yang punya link) / Google Slides / .pptx:', 'https://')
    if (!url || url.trim() === 'https://') return
    if (!slideEmbedUrl(url)) { toaster.create({ description: 'Link presentasi tidak dikenali.', type: 'error' }); return }
    editor.chain().focus().insertContent({ type: 'slide', attrs: { src: url.trim() } }).run()
  }
  const importWord = async (file?: File) => {
    if (!file) return
    if (!/\.docx$/i.test(file.name)) {
      toaster.create({ description: 'Hanya file .docx (Word modern) yang didukung.', type: 'error' }); return
    }
    try {
      const { html, warnings } = await importDocxToHtml(file)
      if (!html) { toaster.create({ description: 'Dokumen kosong atau tidak terbaca.', type: 'warning' }); return }
      editor.chain().focus().insertContent(html).run()
      toaster.create({
        description: `Materi dari Word diimpor.${warnings.length ? ' Sebagian format tidak didukung & dilewati.' : ''}`,
        type: 'success',
      })
    } catch {
      toaster.create({ description: 'Gagal membaca file Word. Pastikan formatnya .docx.', type: 'error' })
    }
  }
  const phaseNode = (phase: string) => ({
    type: 'phase', attrs: { phase, blockId: crypto.randomUUID() }, content: [{ type: 'paragraph' }],
  })
  const insertPhase = (phase: string) => {
    editor.chain().focus().insertContent(phaseNode(phase)).run()
  }
  const insertAllPhases = () => {
    editor.chain().focus().insertContent(PHASES.map((p) => phaseNode(p.key))).run()
  }

  return (
    <Box border="1px solid" borderColor={COLORS.border} borderRadius="8px" overflow="hidden">
      <Flex gap="3px" flexWrap="wrap" p="6px 8px" bg={COLORS.bg} align="center"
        borderBottom="1px solid" borderColor={COLORS.border}
        position="sticky" top="0" zIndex={2}>
        {/* heading / paragraph */}
        <NativeSelect.Root size="xs" width="auto">
          <NativeSelect.Field fontSize="11px" value={
            editor.isActive('heading', { level: 1 }) ? 'h1'
              : editor.isActive('heading', { level: 2 }) ? 'h2'
              : editor.isActive('heading', { level: 3 }) ? 'h3' : 'p'
          }
            onChange={(e) => {
              const v = e.target.value
              if (v === 'p') editor.chain().focus().setParagraph().run()
              else editor.chain().focus().toggleHeading({ level: Number(v[1]) as 1 | 2 | 3 }).run()
            }}>
            <option value="p">Paragraf</option>
            <option value="h1">Judul 1</option>
            <option value="h2">Judul 2</option>
            <option value="h3">Judul 3</option>
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
        {/* font size */}
        <NativeSelect.Root size="xs" width="auto" title="Ukuran huruf">
          <NativeSelect.Field fontSize="11px" defaultValue=""
            onChange={(e) => {
              const v = e.target.value
              if (v === 'reset') editor.chain().focus().unsetFontSize().run()
              else if (v) editor.chain().focus().setFontSize(v).run()
              e.target.value = ''
            }}>
            <option value="" disabled>Ukuran</option>
            {FONT_SIZES.map((s) => <option key={s} value={s}>{parseInt(s, 10)}</option>)}
            <option value="reset">Normal</option>
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
        <Tool label={<Icon as={LuBold} />} title="Tebal" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
        <Tool label={<Icon as={LuItalic} />} title="Miring" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
        <Tool label={<Icon as={LuUnderline} />} title="Garis bawah" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} />
        {/* color (native color input — no Chakra equivalent) */}
        <Box as="label" title="Warna teks" style={toolStyle} onMouseDown={(e: React.MouseEvent) => e.preventDefault()}>
          <Icon as={LuBaseline} />
          <input type="color" defaultValue="#1E293B" style={{ width: 18, height: 18, border: 'none', padding: 0, background: 'none' }}
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()} />
        </Box>
        <Tool label={<Icon as={LuAlignLeft} />} title="Rata kiri" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} />
        <Tool label={<Icon as={LuAlignCenter} />} title="Rata tengah" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} />
        <Tool label={<Icon as={LuAlignRight} />} title="Rata kanan" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} />
        <Tool label={<Icon as={LuAlignJustify} />} title="Rata kanan-kiri (justify)" active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()} />
        <Tool label={<Icon as={LuListOrdered} />} title="List bernomor" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <Tool label={<Icon as={LuList} />} title="List poin" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <Tool label={<><Icon as={LuCode} /> Kode</>} title="Blok kode (untuk contoh koding)" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
        <Tool label={<><Icon as={LuTable} /> Tabel</>} title="Sisip tabel" onClick={insertTable} />
        <Tool label={<><Icon as={LuImage} /> Gambar</>} title="Sisip gambar" onClick={() => imgInput.current?.click()} />
        <Tool label={<><Icon as={LuYoutube} /> Video</>} title="Sisip video YouTube (tertanam)" onClick={insertYoutube} />
        <Tool label={<><Icon as={LuFileText} /> PDF</>} title="Sisip modul PDF (Google Drive / URL) tanpa upload" onClick={insertPdf} />
        <Tool label={<><Icon as={LuPresentation} /> Slide</>} title="Sisip presentasi (Canva / Google Slides / PowerPoint) tanpa upload" onClick={insertSlide} />
        <Tool label={<><Icon as={LuFileUp} /> Impor Word</>} title="Impor materi dari file Word (.docx) — heading, daftar & tabel ikut" onClick={() => docxInput.current?.click()} />
        <Tool label={<><Icon as={LuLink} /> Link</>} title="Sisip link" onClick={insertLink} />
        <Tool
          label={<><Icon as={LuListChecks} /> Soal PG</>}
          title="Sisip soal pilihan ganda di posisi kursor"
          onClick={insertMCQ}
        />
        {/* Fase Pembelajaran (Kurikulum Merdeka) */}
        <NativeSelect.Root size="xs" width="auto" title="Sisip fase pembelajaran">
          <NativeSelect.Field fontSize="11px" value=""
            onChange={(e) => { if (e.target.value) insertPhase(e.target.value); e.target.value = '' }}>
            <option value="">＋ Fase</option>
            {PHASES.map((p) => <option key={p.key} value={p.key}>{p.no}. {p.label}</option>)}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
        <Tool label={<><Icon as={LuLayoutList} /> Kerangka</>}
          title="Sisip kerangka lengkap 20 fase pembelajaran" onClick={insertAllPhases} />
        {/* Emoji pembelajaran — disisipkan sebagai teks di posisi kursor */}
        <NativeSelect.Root size="xs" width="auto" title="Sisip emoji pembelajaran">
          <NativeSelect.Field fontSize="11px" value=""
            onChange={(e) => { const v = e.target.value; if (v) editor.chain().focus().insertContent(v).run(); e.currentTarget.value = '' }}>
            <option value="">＋ Emoji</option>
            {EDU_EMOJIS.map(([em, label]) => <option key={em} value={em}>{em} {label}</option>)}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
        <Tool label={<Icon as={LuUndo2} />} title="Undo" onClick={() => editor.chain().focus().undo().run()} />
        <Tool label={<Icon as={LuRedo2} />} title="Redo" onClick={() => editor.chain().focus().redo().run()} />
        <input ref={imgInput} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={(e) => { insertImage(e.target.files?.[0]); e.target.value = '' }} />
        <input ref={docxInput} type="file" accept=".docx" style={{ display: 'none' }}
          onChange={(e) => { importWord(e.target.files?.[0]); e.target.value = '' }} />
      </Flex>

      <Box
        bg={COLORS.surface}
        maxH="60vh"
        overflowY="auto"
        fontSize="15px"
        lineHeight="1.75"
        css={{ '& .ProseMirror': { minHeight: '340px', outline: 'none' }, ...CONTENT_CSS }}
      >
        <EditorContent editor={editor} />
      </Box>
    </Box>
  )
}
