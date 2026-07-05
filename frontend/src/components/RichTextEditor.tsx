import { useRef } from 'react'
import { Box, Flex, Icon } from '@chakra-ui/react'
import { useEditor, EditorContent } from '@tiptap/react'
import {
  LuBold, LuItalic, LuUnderline, LuBaseline, LuAlignLeft, LuAlignCenter,
  LuAlignRight, LuListOrdered, LuList, LuTable, LuImage, LuLink, LuUndo2, LuRedo2,
  LuListChecks,
} from 'react-icons/lu'
import { COLORS } from '@/theme/tokens'
import { fileToDataUrl } from '@/lib/image'
import { buildExtensions, CONTENT_CSS } from './tiptap'

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
}

const FONT_SIZES = ['12px', '14px', '16px', '18px', '24px', '32px']

/**
 * TipTap-based rich editor. Sticky toolbar (headings, font size, B/I/U, colour,
 * align, lists, table, image, link, undo/redo) + a button to insert an inline
 * multiple-choice question (MCQ) node anywhere in the text.
 */
export default function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  const imgInput = useRef<HTMLInputElement>(null)

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
    <button type="button" title={title}
      style={{ ...toolStyle, background: active ? COLORS.primaryTint : COLORS.surface, borderColor: active ? COLORS.primary : COLORS.border }}
      onMouseDown={(e) => e.preventDefault()} onClick={onClick}>{label}</button>
  )
  const selStyle: React.CSSProperties = {
    fontSize: 11, border: `1px solid ${COLORS.border}`, borderRadius: 4, background: COLORS.surface, padding: '2px 4px',
  }

  if (!editor) return null

  const insertImage = async (file?: File) => {
    if (!file) return
    try {
      const dataUrl = await fileToDataUrl(file, 900, 0.82)
      editor.chain().focus().setImage({ src: dataUrl }).run()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal menyisipkan gambar')
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

  return (
    <Box border="1px solid" borderColor={COLORS.border} borderRadius="8px" overflow="hidden">
      <Flex gap="3px" flexWrap="wrap" p="6px 8px" bg={COLORS.bg} align="center"
        borderBottom="1px solid" borderColor={COLORS.border}
        position="sticky" top="0" zIndex={2}>
        {/* heading / paragraph */}
        <select style={selStyle} value={
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
        </select>
        {/* font size */}
        <select style={selStyle} defaultValue=""
          title="Ukuran huruf"
          onChange={(e) => {
            const v = e.target.value
            if (v === 'reset') editor.chain().focus().unsetFontSize().run()
            else if (v) editor.chain().focus().setFontSize(v).run()
            e.target.value = ''
          }}>
          <option value="" disabled>Ukuran</option>
          {FONT_SIZES.map((s) => <option key={s} value={s}>{parseInt(s, 10)}</option>)}
          <option value="reset">Normal</option>
        </select>
        <Tool label={<Icon as={LuBold} />} title="Tebal" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
        <Tool label={<Icon as={LuItalic} />} title="Miring" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
        <Tool label={<Icon as={LuUnderline} />} title="Garis bawah" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} />
        {/* color */}
        <label title="Warna teks" style={toolStyle} onMouseDown={(e) => e.preventDefault()}>
          <Icon as={LuBaseline} />
          <input type="color" defaultValue="#1E293B" style={{ width: 18, height: 18, border: 'none', padding: 0, background: 'none' }}
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()} />
        </label>
        <Tool label={<Icon as={LuAlignLeft} />} title="Rata kiri" onClick={() => editor.chain().focus().setTextAlign('left').run()} />
        <Tool label={<Icon as={LuAlignCenter} />} title="Rata tengah" onClick={() => editor.chain().focus().setTextAlign('center').run()} />
        <Tool label={<Icon as={LuAlignRight} />} title="Rata kanan" onClick={() => editor.chain().focus().setTextAlign('right').run()} />
        <Tool label={<Icon as={LuListOrdered} />} title="List bernomor" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <Tool label={<Icon as={LuList} />} title="List poin" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <Tool label={<><Icon as={LuTable} /> Tabel</>} title="Sisip tabel" onClick={insertTable} />
        <Tool label={<><Icon as={LuImage} /> Gambar</>} title="Sisip gambar" onClick={() => imgInput.current?.click()} />
        <Tool label={<><Icon as={LuLink} /> Link</>} title="Sisip link" onClick={insertLink} />
        <Tool
          label={<><Icon as={LuListChecks} /> Soal PG</>}
          title="Sisip soal pilihan ganda di posisi kursor"
          onClick={insertMCQ}
        />
        <Tool label={<Icon as={LuUndo2} />} title="Undo" onClick={() => editor.chain().focus().undo().run()} />
        <Tool label={<Icon as={LuRedo2} />} title="Redo" onClick={() => editor.chain().focus().redo().run()} />
        <input ref={imgInput} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={(e) => { insertImage(e.target.files?.[0]); e.target.value = '' }} />
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
