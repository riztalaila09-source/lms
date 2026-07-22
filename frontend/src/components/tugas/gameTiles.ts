import { LuTriangle, LuDiamond, LuCircle, LuSquare } from 'react-icons/lu'
import type { IconType } from 'react-icons'

// Kahoot-style answer tiles: red triangle, blue diamond, yellow circle, green
// square. Options beyond four cycle through the same set.
export const TILES: { color: string; dark: string; icon: IconType }[] = [
  { color: '#E21B3C', dark: '#B2142F', icon: LuTriangle },
  { color: '#1368CE', dark: '#0F52A3', icon: LuDiamond },
  { color: '#D89E00', dark: '#A87C00', icon: LuCircle },
  { color: '#26890C', dark: '#1C6B08', icon: LuSquare },
]

export const tile = (i: number) => TILES[i % TILES.length]
