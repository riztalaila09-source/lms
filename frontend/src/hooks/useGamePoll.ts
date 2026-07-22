import { useEffect, useRef, useState } from 'react'
import { timestampDate } from '@bufbuild/protobuf/wkt'
import { gameClient } from '@/lib/client'
import type { GetGameStateResponse } from '@/gen/game/v1/game_pb'

/**
 * Polls GetGameState (~1s) while a session is active and stops once the game
 * ends. Tracks server/client clock skew so callers can compute an accurate
 * per-question countdown from `current_started_at`.
 */
export function useGamePoll(sessionId: string | null, intervalMs = 1000) {
  const [state, setState] = useState<GetGameStateResponse | null>(null)
  const [error, setError] = useState('')
  const skew = useRef(0) // serverTime - clientNow (ms)

  useEffect(() => {
    if (!sessionId) { setState(null); return }
    let active = true
    let timer: number | undefined
    const poll = async () => {
      try {
        const s = await gameClient.getGameState({ sessionId })
        if (!active) return
        if (s.serverTime) skew.current = timestampDate(s.serverTime).getTime() - Date.now()
        setState(s)
        setError('')
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Gagal memuat status game')
      } finally {
        if (active) timer = window.setTimeout(poll, intervalMs)
      }
    }
    poll()
    return () => { active = false; if (timer) window.clearTimeout(timer) }
  }, [sessionId, intervalMs])

  /** Best estimate of the server's current time (ms epoch). */
  const serverNow = () => Date.now() + skew.current
  return { state, error, serverNow }
}
