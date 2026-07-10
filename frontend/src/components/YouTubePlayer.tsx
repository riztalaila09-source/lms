import { useEffect, useRef } from 'react'
import { Badge, Box } from '@chakra-ui/react'
import { LuCircleCheck } from 'react-icons/lu'
import { COLORS } from '@/theme/tokens'

// Fraction of the video that must be watched before it counts as "done".
const WATCH_FRACTION = 0.9

/** Extract a YouTube video id from the common URL shapes. Returns '' if none. */
export function parseYouTubeId(raw: string): string {
  const url = (raw || '').trim()
  if (!url) return ''
  // Bare id (11 chars)
  if (/^[\w-]{11}$/.test(url)) return url
  const patterns = [
    /(?:youtube\.com\/watch\?[^#]*\bv=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/embed\/)([\w-]{11})/,
    /(?:youtube\.com\/shorts\/)([\w-]{11})/,
    /(?:youtube\.com\/live\/)([\w-]{11})/,
  ]
  for (const re of patterns) {
    const m = url.match(re)
    if (m) return m[1]
  }
  return ''
}

// Toleransi lompatan (detik) sebelum dianggap menyeret maju. Cukup besar untuk
// menyerap jeda buffering/polling, cukup kecil untuk mencegah skip.
const SEEK_TOLERANCE = 2

// ── YouTube IFrame API loader (singleton) ──
interface YTPlayer {
  getCurrentTime: () => number
  getDuration: () => number
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  setPlaybackRate: (rate: number) => void
  destroy: () => void
}
interface YTNamespace {
  Player: new (el: HTMLElement, opts: unknown) => YTPlayer
  PlayerState: { PLAYING: number; ENDED: number }
}
declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiPromise: Promise<YTNamespace> | null = null
function loadYouTubeAPI(): Promise<YTNamespace> {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT)
  if (apiPromise) return apiPromise
  apiPromise = new Promise<YTNamespace>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      if (window.YT) resolve(window.YT)
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
  })
  return apiPromise
}

interface Props {
  videoId: string
  /** When true, watch progress is tracked and reported via onWatched. */
  interactive?: boolean
  /** Called once the video has been watched enough (>= WATCH_FRACTION or ended). */
  onWatched?: () => void
  /** Already-watched flag (shows the badge and skips tracking). */
  watched?: boolean
}

/** Responsive 16:9 embedded YouTube player with optional watch tracking. */
export default function YouTubePlayer({ videoId, interactive, onWatched, watched }: Props) {
  const holderRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const reportedRef = useRef(false)
  const onWatchedRef = useRef(onWatched)
  onWatchedRef.current = onWatched

  useEffect(() => {
    if (!videoId) return
    let cancelled = false
    let guard: ReturnType<typeof setInterval> | null = null
    // Furthest point the student has legitimately watched (can't seek past it).
    let maxTime = 0
    const track = interactive && !watched

    const stopGuard = () => { if (guard) { clearInterval(guard); guard = null } }

    loadYouTubeAPI().then((YT) => {
      if (cancelled || !holderRef.current) return
      // Fresh child element so re-mounts don't clash.
      const mount = document.createElement('div')
      holderRef.current.innerHTML = ''
      holderRef.current.appendChild(mount)

      const report = () => {
        if (reportedRef.current) return
        reportedRef.current = true
        stopGuard() // sudah selesai → boleh menggeser bebas
        onWatchedRef.current?.()
      }

      const startGuard = () => {
        if (guard) return
        guard = setInterval(() => {
          const p = playerRef.current
          if (!p) return
          let t = 0, dur = 0
          try { t = p.getCurrentTime(); dur = p.getDuration() } catch { return }
          if (t > maxTime + SEEK_TOLERANCE) {
            // Menyeret maju melewati bagian yang belum ditonton → kembalikan.
            try { p.seekTo(maxTime, true) } catch { /* ignore */ }
          } else if (t > maxTime) {
            maxTime = t // kemajuan wajar / mundur diperbolehkan
          }
          if (dur > 0 && maxTime / dur >= WATCH_FRACTION) report()
        }, 500)
      }

      playerRef.current = new YT.Player(mount, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: () => { if (track) startGuard() },
          onStateChange: (e: { data: number }) => {
            if (track && e.data === YT.PlayerState.ENDED) report()
          },
          // Cegah mempercepat pemutaran (>1x) agar tak bisa "skip" dengan kecepatan.
          onPlaybackRateChange: (e: { data: number }) => {
            if (track && e.data > 1) { try { playerRef.current?.setPlaybackRate(1) } catch { /* ignore */ } }
          },
        },
      })
    })

    return () => {
      cancelled = true
      stopGuard()
      try { playerRef.current?.destroy() } catch { /* ignore */ }
      playerRef.current = null
    }
  }, [videoId, interactive, watched])

  return (
    <Box position="relative">
      {interactive && watched && (
        <Badge position="absolute" top="8px" right="8px" zIndex={1} colorPalette="green">
          <LuCircleCheck /> Sudah ditonton
        </Badge>
      )}
      <Box position="relative" w="full" borderRadius="10px" overflow="hidden" bg="#000"
        css={{ aspectRatio: '16 / 9' }} border="1px solid" borderColor={COLORS.border}>
        <Box ref={holderRef} position="absolute" inset={0} css={{ '& iframe': { width: '100%', height: '100%', border: 0 } }} />
      </Box>
    </Box>
  )
}
