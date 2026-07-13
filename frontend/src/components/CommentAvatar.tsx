import { Flex, Image } from '@chakra-ui/react'
import { labelColor } from '@/theme/tokens'

/**
 * Foto profil bulat untuk komentar. Menampilkan foto penulis bila ada,
 * jika tidak → inisial nama di lingkaran berwarna (deterministik per nama).
 */
export default function CommentAvatar({ name, photo, size = 30 }: { name: string; photo?: string; size?: number }) {
  const px = `${size}px`
  if (photo) {
    return <Image src={photo} alt={name} w={px} h={px} borderRadius="full" objectFit="cover" flexShrink={0} />
  }
  const initials = (name || '?').trim().split(/\s+/).slice(0, 2).map((s) => s[0] || '').join('').toUpperCase() || '?'
  const c = labelColor(name || '?')
  return (
    <Flex w={px} h={px} borderRadius="full" flexShrink={0} align="center" justify="center"
      fontSize={`${Math.round(size * 0.4)}px`} fontWeight="700" bg={c.bg} color={c.color}>
      {initials}
    </Flex>
  )
}
