import { Badge, Box, Flex, Icon, Text } from '@chakra-ui/react'
import { LuBookOpen, LuCircleCheck } from 'react-icons/lu'
import type { Material } from '@/gen/material/v1/material_pb'
import { StarsDisplay } from '@/components/StarRating'
import { UDEMY, courseGradient } from '@/theme/tokens'

function readProgress(id: string): number {
  try { return parseInt(localStorage.getItem(`lms_pct_${id}`) || '0', 10) || 0 } catch { return 0 }
}

/** Udemy-style material card with cover, title, creator, star rating + student progress. */
export default function MaterialCard({ material, onClick }: { material: Material; onClick: () => void }) {
  const pct = readProgress(material.id)
  const done = pct >= 100
  return (
    <Box as="button" onClick={onClick} textAlign="left" w="full" display="flex" flexDirection="column"
      border="1px solid" borderColor={done ? UDEMY.accent : UDEMY.border} bg="white" overflow="hidden"
      transition="box-shadow .15s, transform .15s"
      _hover={{ boxShadow: '0 8px 20px rgba(0,0,0,.14)', transform: 'translateY(-2px)' }}>
      <Box position="relative" flexShrink={0}>
        {material.coverImage ? (
          <Box h="118px" bgImage={`url(${material.coverImage})`} bgSize="cover" bgPos="center" />
        ) : (
          <Flex h="118px" align="center" justify="center" color="whiteAlpha.900"
            style={{ background: courseGradient(material.title) }}>
            <Icon as={LuBookOpen} boxSize="34px" />
          </Flex>
        )}
        {done ? (
          <Badge position="absolute" top="8px" right="8px" colorPalette="green"><Icon as={LuCircleCheck} /> Selesai</Badge>
        ) : pct > 0 ? (
          <Badge position="absolute" top="8px" right="8px" bg="blackAlpha.700" color="white">{pct}%</Badge>
        ) : null}
      </Box>
      <Box p="10px" flex={1} display="flex" flexDirection="column" gap="3px">
        <Text fontWeight="bold" fontSize="14px" color={UDEMY.ink} lineClamp={2} lineHeight="1.25">{material.title}</Text>
        <Text fontSize="12px" color={UDEMY.inkMuted} lineClamp={1}>{material.createdByName || 'Pengajar'}</Text>
        <StarsDisplay value={material.avgRating} count={material.ratingCount} size={12} />
        {/* progress bar */}
        <Box mt="2px" h="5px" bg="#E5E7EB" borderRadius="full" overflow="hidden">
          <Box h="full" w={`${pct}%`} bg={done ? UDEMY.accent : '#60A5FA'} />
        </Box>
        <Text fontSize="10px" color={UDEMY.inkMuted}>{done ? 'Sudah selesai' : pct > 0 ? `${pct}% dibaca` : 'Belum dibaca'}</Text>
      </Box>
    </Box>
  )
}
