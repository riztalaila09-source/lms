import { useState } from 'react'
import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { Box, Button, Dialog, Flex, Icon, IconButton, Input, Text } from '@chakra-ui/react'
import { LuPresentation, LuTrash2, LuGripVertical, LuExpand, LuExternalLink, LuX } from 'react-icons/lu'
import { COLORS } from '@/theme/tokens'

/**
 * Ubah link presentasi menjadi URL embed 16:9 + URL "buka".
 * - Canva: link "Bagikan → tautan publik" → mode ?embed.
 * - Google Slides → /embed.
 * - Google Drive (pptx diupload ke Drive) → /preview.
 * - URL .pptx publik / OneDrive / SharePoint → Office Online viewer.
 * Mengembalikan null bila kosong.
 */
export function slideEmbedUrl(raw: string): { embed: string; open: string } | null {
  const url = (raw || '').trim()
  if (!url) return null

  // Canva
  if (/canva\.com\/design\//i.test(url)) {
    const base = url.split('?')[0].replace(/\/(watch|edit|present)\/?$/, '/view').replace(/\/+$/, '')
    const view = /\/view$/.test(base) ? base : `${base}/view`
    return { embed: `${view}?embed`, open: view }
  }
  // Google Slides
  const gs = url.match(/docs\.google\.com\/presentation\/d\/([\w-]+)/)
  if (gs) {
    return { embed: `https://docs.google.com/presentation/d/${gs[1]}/embed?start=false&loop=false&delayms=5000`, open: url }
  }
  // Google Drive file (pptx yang diunggah ke Drive)
  if (/drive\.google\.com/.test(url)) {
    const m = url.match(/\/file\/d\/([\w-]+)/) || url.match(/[?&]id=([\w-]+)/)
    if (m) return { embed: `https://drive.google.com/file/d/${m[1]}/preview`, open: `https://drive.google.com/file/d/${m[1]}/view` }
  }
  // URL .pptx publik → Office Online viewer
  if (/\.pptx?(\?.*)?(#.*)?$/i.test(url)) {
    return { embed: `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`, open: url }
  }
  // OneDrive / SharePoint
  if (/(1drv\.ms|onedrive\.live\.com|sharepoint\.com)/i.test(url)) {
    const embed = /action=embedview/i.test(url) ? url : `${url}${url.includes('?') ? '&' : '?'}action=embedview`
    return { embed, open: url }
  }
  // fallback: pakai apa adanya (mis. sudah berupa link embed)
  return { embed: url, open: url }
}

interface SlideAttrs { src: string }

function SlideFrame({ embed, radius = '10px' }: { embed: string; radius?: string }) {
  return (
    <Box position="relative" w="full" borderRadius={radius} overflow="hidden" bg="#fff"
      border="1px solid" borderColor={COLORS.border} css={{ aspectRatio: '16 / 9' }}>
      <iframe src={embed} title="Presentasi" allowFullScreen
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
    </Box>
  )
}

function SlideView(props: NodeViewProps) {
  const { src } = props.node.attrs as SlideAttrs
  const info = slideEmbedUrl(src)
  const [full, setFull] = useState(false)

  // ── Editor: input link + pratinjau + hapus ──
  if (props.editor.isEditable) {
    return (
      <NodeViewWrapper>
        <Box border="1px solid" borderColor={COLORS.primary} borderRadius="8px" bg={COLORS.primaryTint} p="10px" my="10px" contentEditable={false}>
          <Flex align="center" gap="6px" mb="8px">
            <Icon as={LuGripVertical} color={COLORS.muted} data-drag-handle style={{ cursor: 'grab' }} />
            <Icon as={LuPresentation} color={COLORS.primary} />
            <Text fontSize="11px" fontWeight="700" color={COLORS.primary} flex="1">PRESENTASI / SLIDE</Text>
            <IconButton aria-label="hapus slide" size="2xs" colorPalette="red" variant="outline" onClick={() => props.deleteNode()}>
              <Icon as={LuTrash2} />
            </IconButton>
          </Flex>
          <Input size="sm" bg="white" placeholder="Tempel link Canva (bagikan: siapa saja yang punya link) / Google Slides / .pptx"
            value={src} onChange={(e) => props.updateAttributes({ src: e.target.value })} mb="8px" />
          {info
            ? <SlideFrame embed={info.embed} radius="8px" />
            : <Text fontSize="11px" color={COLORS.muted}>Tempel link untuk melihat pratinjau. Di Canva: Bagikan → “siapa saja yang punya link”.</Text>}
        </Box>
      </NodeViewWrapper>
    )
  }

  // ── Reader: viewer inline 16:9 + layar penuh + buka di tab baru ──
  if (!info) {
    return (
      <NodeViewWrapper>
        <Box border="1px solid" borderColor={COLORS.danger} borderRadius="8px" p="10px" my="12px" contentEditable={false}>
          <Text fontSize="13px" color={COLORS.danger}>Link presentasi tidak valid.</Text>
        </Box>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper>
      <Box my="14px" contentEditable={false}>
        <Flex align="center" gap="8px" mb="8px">
          <Icon as={LuPresentation} boxSize="18px" color={COLORS.primary} />
          <Text fontSize="14px" fontWeight="700" color={COLORS.text} flex="1">Presentasi</Text>
          <Button size="xs" variant="outline" onClick={() => setFull(true)}><Icon as={LuExpand} /> Layar penuh</Button>
          <Button size="xs" variant="ghost" onClick={() => window.open(info.open, '_blank', 'noopener')}><Icon as={LuExternalLink} /> Buka di tab baru</Button>
        </Flex>
        <SlideFrame embed={info.embed} />

        <Dialog.Root open={full} onOpenChange={(e) => setFull(e.open)} size="full" scrollBehavior="inside">
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Flex align="center" gap="8px" w="full">
                  <Icon as={LuPresentation} color={COLORS.primary} />
                  <Dialog.Title flex="1" fontSize="15px">Presentasi</Dialog.Title>
                  <Button size="xs" variant="ghost" onClick={() => window.open(info.open, '_blank', 'noopener')}><Icon as={LuExternalLink} /> Tab baru</Button>
                  <IconButton aria-label="tutup" size="xs" variant="ghost" onClick={() => setFull(false)}><Icon as={LuX} /></IconButton>
                </Flex>
              </Dialog.Header>
              <Dialog.Body>
                <Box maxW="1200px" mx="auto" w="full">
                  <SlideFrame embed={info.embed} />
                </Box>
              </Dialog.Body>
            </Dialog.Content>
          </Dialog.Positioner>
        </Dialog.Root>
      </Box>
    </NodeViewWrapper>
  )
}

export const SlideNode = Node.create({
  name: 'slide',
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
    return [{ tag: 'div[data-type="slide"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'slide' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(SlideView)
  },
})
