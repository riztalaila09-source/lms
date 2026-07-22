// Synthesized game audio for the live quiz (Kahoot-style) — no asset files, all
// generated with the Web Audio API so it stays self-contained in the embedded
// build and carries no licensing. Must be initialised from a user gesture
// (browsers block autoplay): call gameAudio.init() on the Start/Join click.

type LoopHandle = { stop: () => void }

const MUTE_KEY = 'lms_game_muted'

class GameAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private loop: LoopHandle | null = null
  private _muted = false
  private musicSrc: string | null = null       // custom uploaded soundtrack URL
  private musicEl: HTMLAudioElement | null = null

  constructor() {
    try { this._muted = localStorage.getItem(MUTE_KEY) === '1' } catch { /* ignore */ }
  }

  /** Create/resume the AudioContext. Safe to call repeatedly; needs a gesture. */
  init() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        this.ctx = new AC()
        this.master = this.ctx.createGain()
        this.master.gain.value = this._muted ? 0 : 0.5
        this.master.connect(this.ctx.destination)
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume()
    } catch { /* audio unavailable — silently no-op */ }
  }

  get muted() { return this._muted }

  setMuted(m: boolean) {
    this._muted = m
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0') } catch { /* ignore */ }
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02)
    }
    if (this.musicEl) this.musicEl.muted = m
  }

  /**
   * Point background music at a custom uploaded track (or null to fall back to
   * the synthesized loops). The track plays continuously through lobby/question
   * and pauses on reveal/end; SFX stay synthesized.
   */
  setMusicSrc(url: string | null) {
    if (url === this.musicSrc) return
    this.pauseMusic()
    this.musicEl = null
    this.musicSrc = url
  }

  private playMusic() {
    if (!this.musicSrc) return
    if (!this.musicEl) {
      this.musicEl = new Audio(this.musicSrc)
      this.musicEl.loop = true
      this.musicEl.volume = 0.5
    }
    this.musicEl.muted = this._muted
    void this.musicEl.play().catch(() => { /* needs a gesture / not ready */ })
  }

  private pauseMusic() { if (this.musicEl) this.musicEl.pause() }

  toggleMute() { this.setMuted(!this._muted); return this._muted }

  // ── one-shot note ──
  private note(freq: number, start: number, dur: number, type: OscillatorType = 'sine', peak = 0.6) {
    if (!this.ctx || !this.master) return
    const t = this.ctx.currentTime + start
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(g); g.connect(this.master)
    osc.start(t); osc.stop(t + dur + 0.02)
  }

  // ── SFX ──
  tap() { this.init(); this.note(520, 0, 0.08, 'square', 0.3) }
  join() { this.init(); this.note(660, 0, 0.12, 'sine', 0.4); this.note(880, 0.06, 0.12, 'sine', 0.35) }
  correct() {
    this.init()
    ;[523, 659, 784, 1046].forEach((f, i) => this.note(f, i * 0.09, 0.18, 'sine', 0.5)) // C-E-G-C
  }
  wrong() {
    this.init()
    this.note(196, 0, 0.35, 'sawtooth', 0.4)
    this.note(146, 0.05, 0.35, 'sawtooth', 0.35)
  }
  reveal() { this.init(); this.note(880, 0, 0.1, 'triangle', 0.4); this.note(1174, 0.08, 0.14, 'triangle', 0.4) }
  podium() {
    this.init()
    ;[523, 587, 659, 784, 1046].forEach((f, i) => this.note(f, i * 0.12, 0.25, 'triangle', 0.5))
  }

  // ── loops ──
  private startLoop(intervalMs: number, tick: (bar: number) => void): LoopHandle {
    this.stopLoop()
    let bar = 0
    tick(bar)
    const id = window.setInterval(() => { bar++; tick(bar) }, intervalMs)
    const handle: LoopHandle = { stop: () => window.clearInterval(id) }
    this.loop = handle
    return handle
  }

  stopLoop() { if (this.loop) { this.loop.stop(); this.loop = null } this.pauseMusic() }

  /** Gentle pentatonic arpeggio for the lobby / waiting screens. */
  lobby() {
    this.init()
    if (this.musicSrc) { this.playMusic(); return }
    const scale = [523, 587, 659, 784, 880] // C D E G A (pentatonic)
    this.startLoop(320, (bar) => {
      const f = scale[bar % scale.length]
      this.note(f, 0, 0.28, 'sine', 0.28)
      if (bar % 4 === 0) this.note(f / 2, 0, 0.4, 'triangle', 0.18) // soft bass
    })
  }

  /** Urgent ticking pulse while a question is being answered. */
  question() {
    this.init()
    if (this.musicSrc) { this.playMusic(); return }
    this.startLoop(500, (bar) => {
      this.note(bar % 2 === 0 ? 300 : 240, 0, 0.12, 'triangle', 0.22) // heartbeat
      this.note(1600, 0.02, 0.03, 'square', 0.12)                     // tick
    })
  }
}

export const gameAudio = new GameAudio()
