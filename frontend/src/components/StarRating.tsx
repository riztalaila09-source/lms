import { useState } from 'react'
import { Flex, Icon, Text } from '@chakra-ui/react'
import { LuStar } from 'react-icons/lu'
import { UDEMY } from '@/theme/tokens'

/** Read-only rating: numeric average + 5 stars + optional rating count. */
export function StarsDisplay({ value, count, size = 13, showCount = true }: {
  value: number; count?: number; size?: number; showCount?: boolean
}) {
  const rounded = Math.round(value)
  return (
    <Flex align="center" gap="4px">
      <Text fontWeight="bold" fontSize={`${size}px`} color={UDEMY.star} lineHeight="1">
        {value > 0 ? value.toFixed(1) : '–'}
      </Text>
      <Flex>
        {[1, 2, 3, 4, 5].map((i) => (
          <Icon key={i} as={LuStar} boxSize={`${size}px`} color={UDEMY.star}
            fill={value > 0 && i <= rounded ? UDEMY.star : 'transparent'} />
        ))}
      </Flex>
      {showCount && count !== undefined && (
        <Text fontSize={`${Math.max(10, size - 2)}px`} color={UDEMY.inkMuted}>
          ({count.toLocaleString('id-ID')})
        </Text>
      )}
    </Flex>
  )
}

/** Interactive rating: hover + click to pick 1–5 stars. */
export function StarsInput({ value, onRate, size = 28, disabled }: {
  value: number; onRate: (n: number) => void; size?: number; disabled?: boolean
}) {
  const [hover, setHover] = useState(0)
  return (
    <Flex gap="2px">
      {[1, 2, 3, 4, 5].map((i) => (
        <Icon key={i} as={LuStar} boxSize={`${size}px`} color={UDEMY.star}
          cursor={disabled ? 'default' : 'pointer'}
          fill={i <= (hover || value) ? UDEMY.star : 'transparent'}
          onMouseEnter={() => !disabled && setHover(i)}
          onMouseLeave={() => setHover(0)}
          onClick={() => !disabled && onRate(i)} />
      ))}
    </Flex>
  )
}
