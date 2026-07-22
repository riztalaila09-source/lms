'use client'

import type { IconButtonProps } from '@chakra-ui/react'
import { IconButton, Skeleton } from '@chakra-ui/react'
import { useTheme } from 'next-themes'
import * as React from 'react'
import { LuMoon, LuSun } from 'react-icons/lu'

export type ColorMode = 'light' | 'dark'

export interface UseColorModeReturn {
  colorMode: ColorMode
  setColorMode: (colorMode: ColorMode) => void
  toggleColorMode: () => void
}

export function useColorMode(): UseColorModeReturn {
  const { resolvedTheme, setTheme } = useTheme()
  const colorMode = (resolvedTheme as ColorMode) ?? 'light'
  const toggleColorMode = () => setTheme(colorMode === 'dark' ? 'light' : 'dark')
  return {
    colorMode,
    setColorMode: setTheme,
    toggleColorMode,
  }
}

export function useColorModeValue<T>(light: T, dark: T): T {
  const { colorMode } = useColorMode()
  return colorMode === 'dark' ? dark : light
}

export function ColorModeIcon() {
  const { colorMode } = useColorMode()
  return colorMode === 'dark' ? <LuMoon /> : <LuSun />
}

interface ColorModeButtonProps extends Omit<IconButtonProps, 'aria-label'> {}

export const ColorModeButton = React.forwardRef<HTMLButtonElement, ColorModeButtonProps>(
  function ColorModeButton(props, ref) {
    const { toggleColorMode, colorMode } = useColorMode()
    return (
      <ClientOnly fallback={<Skeleton boxSize="8" />}>
        <IconButton
          onClick={toggleColorMode}
          variant="ghost"
          aria-label={colorMode === 'dark' ? 'Mode terang' : 'Mode gelap'}
          title={colorMode === 'dark' ? 'Mode terang' : 'Mode gelap'}
          size="sm"
          ref={ref}
          {...props}
        >
          <ColorModeIcon />
        </IconButton>
      </ClientOnly>
    )
  },
)

// Small helper so the toggle doesn't flash the wrong icon before hydration.
function ClientOnly({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  return <>{mounted ? children : fallback}</>
}
