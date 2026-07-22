import { useState, type ComponentProps } from 'react'
import { Box, Icon, IconButton, Input } from '@chakra-ui/react'
import { LuEye, LuEyeOff } from 'react-icons/lu'
import { COLORS } from '@/theme/tokens'

// A password field masked by default with an eye button to reveal/hide it.
// Accepts all the usual Input props (value, onChange, size, required, …).
export default function PasswordInput(props: ComponentProps<typeof Input>) {
  const [show, setShow] = useState(false)
  return (
    <Box position="relative" w="full">
      <Input {...props} type={show ? 'text' : 'password'} pr="40px" />
      <IconButton type="button" aria-label={show ? 'Sembunyikan password' : 'Tampilkan password'}
        onClick={() => setShow((v) => !v)} variant="ghost" size="xs"
        position="absolute" top="50%" right="4px" transform="translateY(-50%)"
        color={COLORS.muted} _hover={{ color: COLORS.text, bg: 'transparent' }}>
        <Icon as={show ? LuEyeOff : LuEye} boxSize="16px" />
      </IconButton>
    </Box>
  )
}
