// Design tokens for the LMS — Royal Blue (brand) on a slate neutral palette.
// Each value points to a CSS variable (with the light hex as fallback). The
// variables — and their dark-mode overrides — are declared once in the Chakra
// `globalCss` in system.ts, so toggling the `.dark` class re-themes every one of
// the ~900 `COLORS.*` call sites automatically without touching them.
export const COLORS = {
  primary: 'var(--c-primary, #2563EB)', // brand.600
  primaryDark: 'var(--c-primary-dark, #1D4ED8)', // brand.700
  primaryTint: 'var(--c-primary-tint, #EFF6FF)', // brand.50 — active nav background
  success: 'var(--c-success, #16A34A)',
  warning: 'var(--c-warning, #D97706)',
  danger: 'var(--c-danger, #DC2626)',
  bg: 'var(--c-bg, #F8FAFC)', // slate.50
  surface: 'var(--c-surface, #FFFFFF)',
  border: 'var(--c-border, #E2E8F0)', // slate.200
  text: 'var(--c-text, #0F172A)', // slate.900
  muted: 'var(--c-muted, #64748B)', // slate.500
} as const

// Udemy-flavoured palette — used only on the login page and student-facing
// views (dashboard, course catalog, learning page). Teacher/admin pages keep
// the royal-blue COLORS above.
export const UDEMY = {
  accent: '#A435F0', // signature purple
  accentDark: '#8710D8',
  accentTint: '#F3E8FF',
  ink: '#1C1D1F', // near-black text / buttons
  inkSoft: '#2D2F31',
  inkMuted: '#6A6F73',
  star: '#B4690E',
  border: '#D1D7DC',
  bg: '#FFFFFF',
} as const

// Deterministic thumbnail gradient per course (so cards look like distinct
// Udemy course covers without needing an uploaded image).
const COURSE_GRADIENTS = [
  ['#5022C3', '#A435F0'],
  ['#0F766E', '#14B8A6'],
  ['#9A3412', '#F97316'],
  ['#1E3A8A', '#3B82F6'],
  ['#9D174D', '#EC4899'],
  ['#3F6212', '#84CC16'],
  ['#0C4A6E', '#0EA5E9'],
  ['#4C1D95', '#8B5CF6'],
] as const

export function courseGradient(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const [a, b] = COURSE_GRADIENTS[h % COURSE_GRADIENTS.length]
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`
}

// Deterministic, distinct badge color per label (class/major name). Two names
// that differ at all (e.g. "X TKJ 1" vs "X TKJ 2") get different hues.
export function labelColor(seed: string): { bg: string; color: string } {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const hue = h % 360
  return { bg: `hsl(${hue}, 80%, 92%)`, color: `hsl(${hue}, 65%, 30%)` }
}

export const SIDEBAR_WIDTH = 240
// Width of the collapsed (icon-only) sidebar rail on desktop.
export const SIDEBAR_COLLAPSED_WIDTH = 64
