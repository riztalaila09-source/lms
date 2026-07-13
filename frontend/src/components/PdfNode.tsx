import { useState } from 'react'
import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { Box, Button, Dialog, Flex, Icon, IconButton, Input, Text } from '@chakra-ui/react'
import { LuFileText, LuTrash2, LuGripVertical, LuExpand, LuExternalLink, LuX } from 'react-icons/lu'
import { COLORS } from '@/theme/tokens'

/**
 * Ubah link PDF menjadi URL yang bisa di-embed + URL "buka".
 * - Google Drive (paling andal untuk embed) → mode /preview.
 * - Google Docs/Slides → /preview.
 * - URL langsung berakhiran .pdf → dipakai apa adanya.
 * Mengembalikan null bila kosong.
 */
export function pdfEmbedUrl(raw: string): { embed: string; open: string } | null {
  const url = (raw || '').trim()
  if (!url) return null
  // Google Drive file id dari beberapa bentuk link
  const drive = url.match(/\/file\/d\/([\w-]+)/) || url.match(/[?&]id=([\w-]+)/)
  if (drive && /drive\.google\.com/.test(url)) {
    const id = drive[1]
    return { embed: `https://drive.google.com/file/d/${id}/preview`, open: `https://drive.google.com/file/d/${id}/view` }
  }
  // Google Docs/Slides/Sheets
  const gdoc = url.match(/docs\.google\.com\/(\w+)\/d\/([\w-]+)/)
  if (gdoc) {
    return { embed: `https://docs.google.com/${gdoc[1]}/d/${gdoc[2]}/preview`, open: url }
  }
  // URL publik langsung ke .pdf
  if (/^https?:\/\/.+\.pdf(\?.*)?(#.*)?$/i.test(url)) {
    return { embed: url, open: url }
  }
  // fallback: coba apa adanya (mis. sudah berupa /preview)
  return { embed: url, open: url }
}

interface PdfAttrs { src: string }

function PdfView(props: NodeViewProps) {
  const { src } = props.node.attrs as PdfAttrs
  const info = pdfEmbedUrl(src)
  const [full, setFull] = useState(false)

  // ── Editor: input link + pratinjau kecil + hapus ──
  if (props.editor.isEditable) {
    return (
      <NodeViewWrapper>
        <Box border="1px solid" borderColor={COLORS.primary} borderRadius="8px" bg={COLORS.primaryTint} p="10px" my="10px" contentEditable={false}>
          <Flex align="center" gap="6px" mb="8px">
            <Icon as={LuGripVertical} color={COLORS.muted} data-drag-handle style={{ cursor: 'grab' }} />
            <Icon as={LuFileText} color={COLORS.primary} />
            <Text fontSize="11px" fontWeight="700" color={COLORS.primary} flex="1">MODUL PDF</Text>
            <IconButton aria-label="hapus pdf" size="2xs" colorPalette="red" variant="outline" onClick={() => props.deleteNode()}>
              <Icon as={LuTrash2} />
            </IconButton>
          </Flex>
          <Input size="sm" bg="white" placeholder="Tempel link Google Drive (bagikan: siapa saja yang punya link) atau URL .pdf"
            value={src} onChange={(e) => props.updateAttributes({ src: e.target.value })} mb="8px" />
          {info ? (
            <Box border="1px solid" borderColor={COLORS.border} borderRadius="8px" overflow="hidden" bg="#fff">
              <iframe src={info.embed} title="Pratinjau PDF" style={{ width: '100%', height: '320px', border: 0 }} allow="autoplay" />
            </Box>
          ) : (
            <Text fontSize="11px" color={COLORS.muted}>Tempel link untuk melihat pratinjau. PDF Drive harus dibagikan “siapa saja yang punya link”.</Text>
          )}
        </Box>
      </NodeViewWrapper>
    )
  }

  // ── Reader: viewer inline + layar penuh + buka di tab baru ──
  if (!info) {
    return (
      <NodeViewWrapper>
        <Box border="1px solid" borderColor={COLORS.danger} borderRadius="8px" p="10px" my="12px" contentEditable={false}>
          <Text fontSize="13px" color={COLORS.danger}>Link PDF tidak valid.</Text>
        </Box>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper>
      <Box my="14px" contentEditable={false}>
        <Flex align="center" gap="8px" mb="8px">
          <Icon as={LuFileText} boxSize="18px" color={COLORS.primary} />
          <Text fontSize="14px" fontWeight="700" color={COLORS.text} flex="1">Modul PDF</Text>
          <Button size="xs" variant="outline" onClick={() => setFull(true)}><Icon as={LuExpand} /> Layar penuh</Button>
          <Button size="xs" variant="ghost" onClick={() => window.open(info.open, '_blank', 'noopener')}><Icon as={LuExternalLink} /> Buka di tab baru</Button>
        </Flex>
        <Box border="1px solid" borderColor={COLORS.border} borderRadius="10px" overflow="hidden" bg="#fff">
          <iframe src={info.embed} title="Modul PDF" style={{ width: '100%', height: '72vh', minHeight: '480px', border: 0 }} allow="autoplay" />
        </Box>

        <Dialog.Root open={full} onOpenChange={(e) => setFull(e.open)} size="full" scrollBehavior="inside">
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Flex align="center" gap="8px" w="full">
                  <Icon as={LuFileText} color={COLORS.primary} />
                  <Dialog.Title flex="1" fontSize="15px">Modul PDF</Dialog.Title>
                  <Button size="xs" variant="ghost" onClick={() => window.open(info.open, '_blank', 'noopener')}><Icon as={LuExternalLink} /> Tab baru</Button>
                  <IconButton aria-label="tutup" size="xs" variant="ghost" onClick={() => setFull(false)}><Icon as={LuX} /></IconButton>
                </Flex>
              </Dialog.Header>
              <Dialog.Body p="0">
                <iframe src={info.embed} title="Modul PDF (layar penuh)" style={{ width: '100%', height: '100%', minHeight: '80vh', border: 0 }} allow="autoplay" />
              </Dialog.Body>
            </Dialog.Content>
          </Dialog.Positioner>
        </Dialog.Root>
      </Box>
    </NodeViewWrapper>
  )
}

export const PdfNode = Node.create({
  name: 'pdf',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-src') || '',
        renderHTML: (attrs) => ({ 'data-src': attrs.src || '' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="pdf"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'pdf' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(PdfView)
  },
})
