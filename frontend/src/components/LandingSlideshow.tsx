import { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Button, Flex, Heading, Icon, Text } from '@chakra-ui/react'
import type { IconType } from 'react-icons'
import { LuChevronLeft, LuChevronRight } from 'react-icons/lu'
import { UDEMY } from '@/theme/tokens'

export interface Slide {
  kind: string
  icon: IconType
  anchor: string
  title: string
  body: string
  meta: string
  image: string
}

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

// Isolated slideshow: keeps its own slide state + timer so advancing a slide
// re-renders ONLY this banner, not the whole (image-heavy) landing page.
export default function LandingSlideshow({ slides }: { slides: Slide[] }) {
  const [i, setI] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const n = slides.length

  const stop = useCallback(() => { if (timer.current) { clearInterval(timer.current); timer.current = null } }, [])
  const start = useCallback(() => {
    stop()
    if (n > 1) timer.current = setInterval(() => setI((v) => (v + 1) % n), 5000)
  }, [n, stop])

  useEffect(() => { start(); return stop }, [start, stop])

  // Manual navigation restarts the auto-advance timer so it doesn't jump right after a click.
  const go = (next: number) => { setI(((next % n) + n) % n); start() }

  if (n === 0) return null
  const cur = slides[i] || slides[0]

  return (
    <Box w="full" px={{ base: '20px', md: '40px', xl: '64px' }} pt={{ base: '20px', md: '28px' }}>
      <Box position="relative" borderRadius="16px" overflow="hidden" h={{ base: '230px', md: '340px' }}
        onMouseEnter={stop} onMouseLeave={start}
        style={{ background: cur.image ? undefined : `linear-gradient(135deg, ${UDEMY.accent} 0%, ${UDEMY.accentDark} 100%)` }}>
        {cur.image && (<>
          <Box position="absolute" inset={0} bgImage={`url(${cur.image})`} bgSize="cover" bgPos="center" />
          <Box position="absolute" inset={0} bg="blackAlpha.600" />
        </>)}
        <Flex position="relative" zIndex={1} direction="column" justify="flex-end" h="full" p={{ base: '18px', md: '30px' }} pr={{ base: '54px', md: '64px' }} pl={{ base: '54px', md: '64px' }} color="white">
          <Flex align="center" gap="6px" mb="4px">
            <Icon as={cur.icon} boxSize="15px" />
            <Text fontSize="12px" fontWeight="700" letterSpacing="0.5px" textTransform="uppercase">{cur.kind}{cur.meta ? ` · ${cur.meta}` : ''}</Text>
          </Flex>
          <Heading fontSize={{ base: '20px', md: '30px' }} fontWeight="800" lineClamp={2} maxW="680px">{cur.title}</Heading>
          {cur.body && <Text fontSize="13px" color="whiteAlpha.900" mt="6px" lineClamp={2} maxW="600px" display={{ base: 'none', sm: 'block' }} whiteSpace="pre-wrap">{cur.body}</Text>}
          <Button size="sm" mt="14px" w="fit-content" bg="white" color={UDEMY.ink} _hover={{ bg: 'whiteAlpha.900' }} onClick={() => scrollTo(cur.anchor)}>
            <Icon as={cur.icon} /> Selengkapnya
          </Button>
        </Flex>
        {n > 1 && (<>
          <Flex as="button" aria-label="Sebelumnya" position="absolute" zIndex={2} top="50%" left="12px" transform="translateY(-50%)" w="40px" h="40px"
            borderRadius="full" bg="whiteAlpha.900" align="center" justify="center" color={UDEMY.ink} cursor="pointer" boxShadow="md"
            _hover={{ bg: 'white' }} onClick={() => go(i - 1)}><Icon as={LuChevronLeft} boxSize="22px" /></Flex>
          <Flex as="button" aria-label="Berikutnya" position="absolute" zIndex={2} top="50%" right="12px" transform="translateY(-50%)" w="40px" h="40px"
            borderRadius="full" bg="whiteAlpha.900" align="center" justify="center" color={UDEMY.ink} cursor="pointer" boxShadow="md"
            _hover={{ bg: 'white' }} onClick={() => go(i + 1)}><Icon as={LuChevronRight} boxSize="22px" /></Flex>
          <Flex position="absolute" zIndex={2} bottom="12px" left="50%" transform="translateX(-50%)" gap="7px">
            {slides.map((_, k) => (
              <Box key={k} as="button" aria-label={`Slide ${k + 1}`} w="9px" h="9px" borderRadius="full" cursor="pointer"
                bg={k === i ? 'white' : 'whiteAlpha.500'} onClick={() => go(k)} />
            ))}
          </Flex>
        </>)}
      </Box>
    </Box>
  )
}
