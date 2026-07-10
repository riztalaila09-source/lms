import { createContext, useContext, useEffect, useRef } from 'react'
import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { Box, Flex, Icon, IconButton, Text } from '@chakra-ui/react'
import { LuYoutube, LuTrash2, LuGripVertical } from 'react-icons/lu'
import { COLORS } from '@/theme/tokens'
import YouTubePlayer, { parseYouTubeId } from './YouTubePlayer'

/**
 * Context supplied by the reader (MaterialViewer) so embedded videos can report
 * whether they've been watched (for "wajib ditonton" completion gating). The
 * editor doesn't provide it, so node views fall back to edit mode.
 */
export interface VideoContextValue {
  interactive: boolean
  onRegister: (key: string) => void
  onWatched: (key: string) => void
  watchedKeys: Set<string>
}
export const VideoContext = createContext<VideoContextValue | null>(null)

interface YTAttrs { src: string }

function YouTubeView(props: NodeViewProps) {
  const { src } = props.node.attrs as YTAttrs
  const videoId = parseYouTubeId(src)
  const ctx = useContext(VideoContext)
  const registered = useRef(false)

  // Reader: register this video so the viewer can require it to be watched.
  useEffect(() => {
    if (!props.editor.isEditable && ctx?.interactive && videoId && !registered.current) {
      registered.current = true
      ctx.onRegister(videoId)
    }
  }, [ctx, videoId, props.editor.isEditable])

  if (!videoId) {
    return (
      <NodeViewWrapper>
        <Box border="1px solid" borderColor={COLORS.danger} borderRadius="8px" p="10px" my="10px" contentEditable={false}>
          <Text fontSize="13px" color={COLORS.danger}>URL YouTube tidak valid.</Text>
        </Box>
      </NodeViewWrapper>
    )
  }

  // Teacher edit mode: show the player (no tracking) + a delete control.
  if (props.editor.isEditable) {
    return (
      <NodeViewWrapper>
        <Box border="1px solid" borderColor={COLORS.primary} borderRadius="8px" bg={COLORS.primaryTint} p="10px" my="10px" contentEditable={false}>
          <Flex align="center" gap="6px" mb="8px">
            <Icon as={LuGripVertical} color={COLORS.muted} data-drag-handle style={{ cursor: 'grab' }} />
            <Icon as={LuYoutube} color="#FF0000" />
            <Text fontSize="11px" fontWeight="700" color={COLORS.primary} flex="1">VIDEO YOUTUBE</Text>
            <IconButton aria-label="hapus video" size="2xs" colorPalette="red" variant="outline" onClick={() => props.deleteNode()}>
              <Icon as={LuTrash2} />
            </IconButton>
          </Flex>
          <YouTubePlayer videoId={videoId} />
        </Box>
      </NodeViewWrapper>
    )
  }

  // Reader (interactive): tracked player that reports when watched.
  if (ctx?.interactive) {
    return (
      <NodeViewWrapper>
        <Box my="14px" contentEditable={false}>
          <YouTubePlayer videoId={videoId} interactive watched={ctx.watchedKeys.has(videoId)}
            onWatched={() => ctx.onWatched(videoId)} />
        </Box>
      </NodeViewWrapper>
    )
  }

  // Read-only without a context (shouldn't happen): plain player.
  return (
    <NodeViewWrapper>
      <Box my="14px" contentEditable={false}><YouTubePlayer videoId={videoId} /></Box>
    </NodeViewWrapper>
  )
}

export const YouTubeNode = Node.create({
  name: 'youtube',
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
    return [{ tag: 'div[data-type="youtube"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'youtube' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(YouTubeView)
  },
})
