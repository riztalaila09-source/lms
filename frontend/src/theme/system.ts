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
    'html, body': {
      background: '#F8FAFC',
      color: '#0F172A',
    },
  },
})

export const system = createSystem(defaultConfig, config)
