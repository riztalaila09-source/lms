import { Box, Flex, Icon, NativeSelect, SimpleGrid, Stack, Text } from '@chakra-ui/react'
import { useNavigate } from 'react-router-dom'
import { LuGraduationCap } from 'react-icons/lu'
import { useLang, type Lang } from '@/i18n'
import { UDEMY } from '@/theme/tokens'

export default function Footer() {
  const navigate = useNavigate()
  const { t, lang, setLang } = useLang()

  const links = [
    { label: t('nav.home'), to: '/dashboard' },
    { label: t('nav.courses'), to: '/courses' },
    { label: t('nav.materials'), to: '/materi' },
    { label: t('nav.tasks'), to: '/tugas' },
    { label: t('nav.grades'), to: '/nilai' },
  ]

  return (
    <Box as="footer" bg={UDEMY.ink} color="white" mt="46px">
      <Box maxW="1600px" mx="auto" px={{ base: '20px', md: '40px' }} py="40px">
        <SimpleGrid columns={{ base: 2, md: 4 }} gap="28px">
          <Stack gap="10px">
            <Text fontWeight="700" fontSize="14px">{t('footer.explore')}</Text>
            {links.map((l) => (
              <Text key={l.to} as="button" textAlign="left" fontSize="13px" color="whiteAlpha.800"
                _hover={{ color: 'white', textDecoration: 'underline' }} onClick={() => navigate(l.to)}>
                {l.label}
              </Text>
            ))}
          </Stack>
          <Stack gap="10px">
            <Text fontWeight="700" fontSize="14px">{t('footer.about')}</Text>
            <Text fontSize="13px" color="whiteAlpha.800">{t('footer.aboutSchool')}</Text>
            <Text fontSize="13px" color="whiteAlpha.800">{t('footer.contact')}</Text>
          </Stack>
          <Stack gap="10px">
            <Text fontWeight="700" fontSize="14px">{t('footer.help')}</Text>
            <Text fontSize="13px" color="whiteAlpha.800">{t('footer.privacy')}</Text>
            <Text fontSize="13px" color="whiteAlpha.800">{t('footer.terms')}</Text>
          </Stack>
          <Stack gap="10px">
            <Flex align="center" gap="8px">
              <Icon as={LuGraduationCap} boxSize="24px" color={UDEMY.accent} />
              <Text fontWeight="800" fontSize="18px">LMS Kelas</Text>
            </Flex>
            <Text fontSize="12px" color="whiteAlpha.700">Learning Management System — SMK TKJ</Text>
          </Stack>
        </SimpleGrid>
      </Box>

      <Box borderTop="1px solid" borderColor="whiteAlpha.300">
        <Flex maxW="1600px" mx="auto" px={{ base: '20px', md: '40px' }} py="16px"
          align="center" justify="space-between" wrap="wrap" gap="12px">
          <Flex align="center" gap="10px">
            <Icon as={LuGraduationCap} boxSize="22px" />
            <Text fontSize="13px" color="whiteAlpha.900">© 2026 Lucky Ardiansyah</Text>
          </Flex>
          <Flex align="center" gap="8px">
            <Text fontSize="12px" color="whiteAlpha.700">{t('footer.lang')}:</Text>
            <NativeSelect.Root size="sm" w="180px">
              <NativeSelect.Field value={lang} onChange={(e) => setLang(e.target.value as Lang)}
                bg="whiteAlpha.200" color="white" borderColor="whiteAlpha.400">
                <option value="id" style={{ color: '#111' }}>Bahasa Indonesia</option>
                <option value="en" style={{ color: '#111' }}>English</option>
              </NativeSelect.Field>
              <NativeSelect.Indicator color="white" />
            </NativeSelect.Root>
          </Flex>
        </Flex>
      </Box>
    </Box>
  )
}
