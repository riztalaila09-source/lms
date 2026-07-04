import { useEffect, useRef, useCallback } from 'react'
import { Box, Flex, Icon } from '@chakra-ui/react'
import {
  LuBold, LuItalic, LuUnderline, LuBaseline, LuAlignLeft, LuAlignCenter,
  LuAlignRight, LuListOrdered, LuList, LuTable, LuImage, LuLink, LuUndo2, LuRedo2, LuCheck,
} from 'react-icons/lu'
import { COLORS } from '@/theme/tokens'
import { fileToDataUrl } from '@/lib/image'

interface RichTextEditorProps {
  /** Initial HTML (used once on mount). */
  value: string
  onChange: (html: string) => void
}

/**
 * WYSIWYG editor (contentEditable + document.execCommand). Stores HTML.
 * Toolbar mendekati Word: heading, ukuran, B/I/U, warna, rata, list, tabel,
 * gambar, link, undo/redo. Area teks bisa di-resize (tarik sudut bawah).
 */
export default function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null)
  const imgInput = useRef<HTMLInputElement>(null)
  const sizeRef = useRef<HTMLInputElement>(null)
  // Remembers the last text selection inside the editor. Needed because clicking
  // the font-size number input moves focus out of the editor and collapses the
  // selection — we restore this range before applying the size.
  const savedRange = useRef<Range | null>(null)

  const saveSelection = () => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    // only remember selections that live inside this editor
    if (ref.current && ref.current.contains(range.commonAncestorContainer)) {
      savedRange.current = range.cloneRange()
    }
  }

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sync = () => { if (ref.current) onChange(ref.current.innerHTML) }
  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus()
    document.execCommand(cmd, false, arg)
    sync()
  }

  const insertTable = () => {
    const rows = parseInt(prompt('Jumlah baris:', '3') || '3', 10) || 3
    const cols = parseInt(prompt('Jumlah kolom:', '3') || '3', 10) || 3
    let html = '<table style="border-collapse:collapse;width:100%;font-size:13px;margin:4px 0">'
    for (let i = 0; i < rows; i++) {
      html += '<tr>'
      for (let j = 0; j < cols; j++) {
        html += i === 0
          ? `<th style="padding:5px 9px;background:#f0f0f0;border:1px solid #ccc">Kolom ${j + 1}</th>`
          : '<td style="padding:5px 9px;border:1px solid #ccc">&nbsp;</td>'
      }
      html += '</tr>'
    }
    html += '</table><p></p>'
    exec('insertHTML', html)
  }

  const applyFontSize = useCallback((px: number) => {
    const sel = window.getSelection()
    // Prefer a live, non-collapsed selection; otherwise fall back to the range
    // we saved before focus moved to the size input.
    let range: Range | null = null
    if (sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed &&
        ref.current?.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      range = sel.getRangeAt(0)
    } else if (savedRange.current && !savedRange.current.collapsed) {
      range = savedRange.current
    }
    if (!range) return

    ref.current?.focus()
    if (sel) { sel.removeAllRanges(); sel.addRange(range) }

    const span = document.createElement('span')
    span.style.fontSize = `${px}px`
    try {
      range.surroundContents(span)
    } catch {
      const frag = range.extractContents()
      span.appendChild(frag)
      range.insertNode(span)
    }
    sel?.removeAllRanges()
    savedRange.current = null
    sync()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const insertLink = () => {
    const url = prompt('Masukkan URL:', 'https://')
    if (url) exec('createLink', url)
  }

  const insertImage = async (file?: File) => {
    if (!file) return
    try {
      const dataUrl = await fileToDataUrl(file, 900, 0.82)
      exec('insertHTML', `<img src="${dataUrl}" style="max-width:100%;border-radius:6px;margin:4px 0" /><p></p>`)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal menyisipkan gambar')
    }
  }

  const toolStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '4px 8px', fontSize: 12, border: `1px solid ${COLORS.border}`,
    borderRadius: 4, background: COLORS.surface, cursor: 'pointer', lineHeight: 1.4,
  }
  const Tool = ({ label, title, onClick }: { label: React.ReactNode; title: string; onClick: () => void }) => (
    <button type="button" title={title} style={toolStyle}
      onMouseDown={(e) => e.preventDefault()} onClick={onClick}>{label}</button>
  )
  const selStyle: React.CSSProperties = {
    fontSize: 11, border: `1px solid ${COLORS.border}`, borderRadius: 4, background: COLORS.surface, padding: '0 4px',
  }

  return (
    <Box>
      <Flex gap="3px" flexWrap="wrap" p="5px 8px" bg={COLORS.bg}
        border="1px solid" borderColor={COLORS.border} borderBottom="none" borderTopRadius="8px">
        {/* heading / paragraph */}
        <select style={selStyle} defaultValue=""
          onChange={(e) => { exec('formatBlock', e.target.value); e.target.value = '' }}>
          <option value="" disabled>Gaya</option>
          <option value="<h1>">Judul 1</option>
          <option value="<h2>">Judul 2</option>
          <option value="<h3>">Judul 3</option>
          <option value="<p>">Paragraf</option>
        </select>
        {/* font size — px input + apply button */}
        <input
          ref={sizeRef}
          type="number"
          min={8}
          max={72}
          defaultValue={13}
          title="Ukuran font (px) — pilih teks lalu klik terapkan"
          style={{ width: 50, fontSize: 11, border: `1px solid ${COLORS.border}`, borderRadius: 4, padding: '0 4px', background: COLORS.surface }}
        />
        <button
          type="button"
          title="Terapkan ukuran font ke teks terpilih"
          style={toolStyle}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyFontSize(Number(sizeRef.current?.value || 13))}
        >px <Icon as={LuCheck} /></button>
        <Tool label={<Icon as={LuBold} />} title="Tebal" onClick={() => exec('bold')} />
        <Tool label={<Icon as={LuItalic} />} title="Miring" onClick={() => exec('italic')} />
        <Tool label={<Icon as={LuUnderline} />} title="Garis bawah" onClick={() => exec('underline')} />
        {/* text color */}
        <label title="Warna teks" style={{ ...toolStyle }}
          onMouseDown={(e) => e.preventDefault()}>
          <Icon as={LuBaseline} />
          <input type="color" defaultValue="#1E293B" style={{ width: 18, height: 18, border: 'none', padding: 0, background: 'none' }}
            onChange={(e) => exec('foreColor', e.target.value)} />
        </label>
        <Tool label={<Icon as={LuAlignLeft} />} title="Rata kiri" onClick={() => exec('justifyLeft')} />
        <Tool label={<Icon as={LuAlignCenter} />} title="Rata tengah" onClick={() => exec('justifyCenter')} />
        <Tool label={<Icon as={LuAlignRight} />} title="Rata kanan" onClick={() => exec('justifyRight')} />
        <Tool label={<Icon as={LuListOrdered} />} title="List bernomor" onClick={() => exec('insertOrderedList')} />
        <Tool label={<Icon as={LuList} />} title="List poin" onClick={() => exec('insertUnorderedList')} />
        <Tool label={<><Icon as={LuTable} /> Tabel</>} title="Sisip tabel/kolom" onClick={insertTable} />
        <Tool label={<><Icon as={LuImage} /> Gambar</>} title="Sisip gambar" onClick={() => imgInput.current?.click()} />
        <Tool label={<><Icon as={LuLink} /> Link</>} title="Sisip link" onClick={insertLink} />
        <Tool label={<Icon as={LuUndo2} />} title="Undo" onClick={() => exec('undo')} />
        <Tool label={<Icon as={LuRedo2} />} title="Redo" onClick={() => exec('redo')} />
        <input ref={imgInput} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={(e) => { insertImage(e.target.files?.[0]); e.target.value = '' }} />
      </Flex>
      <Box
        ref={ref}
        contentEditable
        onInput={sync}
        onMouseUp={saveSelection}
        onKeyUp={saveSelection}
        onBlur={saveSelection}
        p="10px"
        fontSize="13px"
        lineHeight="1.7"
        border="1px solid"
        borderColor={COLORS.border}
        borderBottomRadius="8px"
        outline="none"
        style={{ minHeight: 200, height: 240, width: '100%', resize: 'both', overflow: 'auto' }}
        css={{
          '& table td, & table th': { border: '1px solid #ccc' },
          '& img': { maxWidth: '100%' },
          '& h1': { fontSize: '1.6em', fontWeight: 700, margin: '6px 0' },
          '& h2': { fontSize: '1.35em', fontWeight: 700, margin: '6px 0' },
          '& h3': { fontSize: '1.15em', fontWeight: 600, margin: '6px 0' },
          '& ul, & ol': { paddingLeft: '22px' },
          '& a': { color: COLORS.primary, textDecoration: 'underline' },
        }}
      />
    </Box>
  )
}
