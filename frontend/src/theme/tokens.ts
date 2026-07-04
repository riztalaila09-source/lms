// Design tokens for the LMS — Royal Blue (brand) on a slate neutral palette.
// Keep these hex values in sync with the Chakra theme in system.ts.
export const COLORS = {
  primary: '#2563EB', // brand.600
  primaryDark: '#1D4ED8', // brand.700
  primaryTint: '#EFF6FF', // brand.50 — active nav background
  success: '#16A34A',
  warning: '#D97706',
  danger: '#DC2626',
  bg: '#F8FAFC', // slate.50
  surface: '#FFFFFF',
  border: '#E2E8F0', // slate.200
  text: '#0F172A', // slate.900
  muted: '#64748B', // slate.500
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
