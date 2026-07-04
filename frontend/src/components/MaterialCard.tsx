import { Box, Flex, Icon, Text } from '@chakra-ui/react'
import { LuBookOpen } from 'react-icons/lu'
import type { Material } from '@/gen/material/v1/material_pb'
import { StarsDisplay } from '@/components/StarRating'
import { UDEMY, courseGradient } from '@/theme/tokens'

/** Udemy-style material card with cover, title, creator, and star rating. */
export default function MaterialCard({ material, onClick }: { material: Material; onClick: () => void }) {
  return (
    <Box as="button" onClick={onClick} textAlign="left" w="full" display="flex" flexDirection="column"
      border="1px solid" borderColor={UDEMY.border} bg="white" overflow="hidden"
      transition="box-shadow .15s, transform .15s"
      _hover={{ boxShadow: '0 8px 20px rgba(0,0,0,.14)', transform: 'translateY(-2px)' }}>
      {material.coverImage ? (
        <Box h="118px" bgImage={`url(${material.coverImage})`} bgSize="cover" bgPos="center" flexShrink={0} />
      ) : (
        <Flex h="118px" align="center" justify="center" color="whiteAlpha.900" flexShrink={0}
          style={{ background: courseGradient(material.title) }}>
          <Icon as={LuBookOpen} boxSize="34px" />
        </Flex>
      )}
      <Box p="10px" flex={1} display="flex" flexDirection="column" gap="3px">
        <Text fontWeight="bold" fontSize="14px" color={UDEMY.ink} lineClamp={2} lineHeight="1.25">{material.title}</Text>
        <Text fontSize="12px" color={UDEMY.inkMuted} lineClamp={1}>{material.createdByName || 'Pengajar'}</Text>
        <StarsDisplay value={material.avgRating} count={material.ratingCount} size={12} />
      </Box>
    </Box>
  )
}
