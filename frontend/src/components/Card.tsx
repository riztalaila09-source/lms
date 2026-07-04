import type { ReactNode } from 'react'
import { Box, Text } from '@chakra-ui/react'
import { COLORS } from '@/theme/tokens'

export function Card({
  children,
  title,
  ...rest
}: {
  children: ReactNode
  title?: ReactNode
  [key: string]: unknown
}) {
  return (
    <Box
      bg={COLORS.surface}
      border="1px solid"
      borderColor={COLORS.border}
      borderRadius="10px"
      p="16px"
      boxShadow="0 1px 4px rgba(0,0,0,.08)"
      {...rest}
    >
      {title && (
        <Text fontSize="14px" fontWeight="semibold" mb="12px">
          {title}
        </Text>
      )}
      {children}
    </Box>
  )
}
