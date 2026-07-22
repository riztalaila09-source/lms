import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react'

/**
 * Standardized Chakra UI theme for the LMS.
 *
 * `brand` is a Royal Blue scale (Tailwind Blue family). The semantic tokens
 * under `colors.brand.*` wire the scale into Chakra's `colorPalette` system, so
 * `colorPalette="brand"` works on Button/Badge/etc. Neutral page chrome
 * (background, text) is set via globalCss to match the slate palette.
 *
 * Keep the raw hex values here in sync with the COLORS object in tokens.ts.
 */
const config = defineConfig({
  theme: {
    tokens: {
      colors: {
        brand: {
          50: { value: '#EFF6FF' },
          100: { value: '#DBEAFE' },
          200: { value: '#BFDBFE' },
          300: { value: '#93C5FD' },
          400: { value: '#60A5FA' },
          500: { value: '#3B82F6' },
          600: { value: '#2563EB' },
          700: { value: '#1D4ED8' },
          800: { value: '#1E40AF' },
          900: { value: '#1E3A8A' },
          950: { value: '#172554' },
        },
      },
    },
    semanticTokens: {
      colors: {
        brand: {
          solid: { value: '{colors.brand.600}' },
          contrast: { value: 'white' },
          fg: { value: '{colors.brand.700}' },
          muted: { value: '{colors.brand.100}' },
          subtle: { value: '{colors.brand.50}' },
          emphasized: { value: '{colors.brand.700}' },
          focusRing: { value: '{colors.brand.500}' },
        },
      },
    },
  },
  globalCss: {
    // Light-mode values for the design tokens consumed via COLORS (tokens.ts).
    ':root': {
      '--c-primary': '#2563EB',
      '--c-primary-dark': '#1D4ED8',
      '--c-primary-tint': '#EFF6FF',
      '--c-success': '#16A34A',
      '--c-warning': '#D97706',
      '--c-danger': '#DC2626',
      '--c-bg': '#F8FAFC',
      '--c-surface': '#FFFFFF',
      '--c-border': '#E2E8F0',
      '--c-text': '#0F172A',
      '--c-muted': '#64748B',
    },
    // Dark-mode overrides. next-themes puts `class="dark"` on <html>, so these
    // win and every COLORS.* usage re-themes automatically.
    '.dark': {
      '--c-primary': '#3B82F6', // brand.500 — brighter for contrast on dark
      '--c-primary-dark': '#2563EB',
      '--c-primary-tint': 'rgba(59, 130, 246, 0.16)', // translucent active-nav wash
      '--c-success': '#22C55E',
      '--c-warning': '#F59E0B',
      '--c-danger': '#F87171',
      '--c-bg': '#0B1220', // slate-950-ish page background
      '--c-surface': '#111827', // panels / sidebar / cards
      '--c-border': '#1F2937',
      '--c-text': '#E5E7EB',
      '--c-muted': '#94A3B8',
    },
    'html, body': {
      background: 'var(--c-bg)',
      color: 'var(--c-text)',
    },
  },
})

export const system = createSystem(defaultConfig, config)
