import { Flex, Image } from '@chakra-ui/react'

const initials = (name: string) =>
  (name || '?').trim().split(/\s+/).slice(0, 2).map((s) => s[0] || '').join('').toUpperCase()

// Deterministic color from the nickname so each player's initials chip is distinct.
const hue = (s: string) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h % 360
}

/** A player's game avatar: their LMS profile photo, else a colored initials circle. */
export default function PlayerAvatar({ nickname, avatar, size = 40 }: { nickname: string; avatar?: string; size?: number }) {
  if (avatar) {
    return <Image src={avatar} alt={nickname} w={`${size}px`} h={`${size}px`} borderRadius="full" objectFit="cover" flexShrink={0} border="2px solid rgba(255,255,255,0.5)" />
  }
  return (
    <Flex w={`${size}px`} h={`${size}px`} borderRadius="full" bg={`hsl(${hue(nickname)}, 65%, 45%)`} color="white"
      align="center" justify="center" fontWeight="700" fontSize={`${Math.round(size * 0.4)}px`} flexShrink={0}>
      {initials(nickname)}
    </Flex>
  )
}
