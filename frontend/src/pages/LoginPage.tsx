import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Button, Field, Flex, Heading, Icon, IconButton, Image, Input, Stack, Text } from '@chakra-ui/react'
import { LuGraduationCap, LuPlay, LuAward, LuUsers, LuArrowLeft, LuEye, LuEyeOff } from 'react-icons/lu'
import { useAuth } from '@/hooks/useAuth'
import { schoolClient } from '@/lib/client'
import { UDEMY } from '@/theme/tokens'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [logo, setLogo] = useState('')
  const [appName, setAppName] = useState('')
  const { login } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    schoolClient.getSchool({}).then((s) => { setLogo(s.logo); setAppName(s.appName || s.name) }).catch(() => {})
  }, [])

  const submit = async (em: string, pw: string) => {
    setError('')
    setLoading(true)
    try {
      await login(em, pw)
      navigate('/dashboard', { replace: true })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login gagal. Periksa email dan password Anda.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    submit(email, password)
  }

  return (
    <Flex minH="100vh" bg={UDEMY.bg}>
      {/* Left brand panel (hidden on small screens) */}
      <Box
        display={{ base: 'none', md: 'flex' }}
        flex="1"
        flexDirection="column"
        justifyContent="center"
        px="56px"
        color="white"
        position="relative"
        overflow="hidden"
        style={{ background: `linear-gradient(135deg, ${UDEMY.ink} 0%, #3b1f63 55%, ${UDEMY.accentDark} 100%)` }}
      >
        <Stack gap="20px" maxW="440px">
          <Flex align="center" gap="10px">
            {logo ? <Image src={logo} alt="logo" boxSize="38px" objectFit="contain" /> : <Icon as={LuGraduationCap} boxSize="34px" color={UDEMY.accent} />}
            <Text fontWeight="bold" fontSize="22px">{appName || 'LMS Kelas'}</Text>
          </Flex>
          <Heading fontSize="40px" lineHeight="1.15" fontWeight="800">
            Belajar tanpa batas, kapan saja.
          </Heading>
          <Text fontSize="16px" color="whiteAlpha.800">
            Akses materi, kerjakan tugas, dan pantau nilaimu — semua di satu tempat untuk SMK TKJ.
          </Text>
          <Stack gap="12px" mt="6px">
            {[
              { icon: LuPlay, text: 'Materi terstruktur per mata pelajaran' },
              { icon: LuAward, text: 'Kuis & tugas dengan penilaian otomatis' },
              { icon: LuUsers, text: 'Pantau progres belajar setiap saat' },
            ].map((f) => (
              <Flex key={f.text} align="center" gap="10px">
                <Flex w="32px" h="32px" borderRadius="full" bg="whiteAlpha.200" align="center" justify="center">
                  <Icon as={f.icon} boxSize="16px" />
                </Flex>
                <Text fontSize="14px" color="whiteAlpha.900">{f.text}</Text>
              </Flex>
            ))}
          </Stack>
        </Stack>
      </Box>

      {/* Right login form */}
      <Flex flex="1" align="center" justify="center" px="20px" py="40px">
        <Box as="form" onSubmit={handleSubmit} w="full" maxW="400px">
          <Stack gap="22px">
            <Button variant="ghost" size="sm" alignSelf="flex-start" color={UDEMY.inkMuted} onClick={() => navigate('/')}>
              <Icon as={LuArrowLeft} /> Beranda
            </Button>
            <Box display={{ base: 'block', md: 'none' }} textAlign="center">
              {logo ? <Image src={logo} alt="logo" boxSize="40px" objectFit="contain" mx="auto" /> : <Icon as={LuGraduationCap} boxSize="36px" color={UDEMY.accent} />}
            </Box>
            <Box>
              <Heading fontSize="26px" fontWeight="800" color={UDEMY.ink}>Masuk ke akunmu</Heading>
              <Text fontSize="14px" color={UDEMY.inkMuted} mt="4px">
                Gunakan akun yang diberikan sekolah.
              </Text>
            </Box>

            {error && (
              <Box bg="#FEE2E2" color="#991B1B" px="12px" py="10px" borderRadius="8px" fontSize="13px">
                {error}
              </Box>
            )}

            <Stack gap="14px">
              <Field.Root>
                <Field.Label fontSize="13px" color={UDEMY.ink}>Email</Field.Label>
                <Input
                  type="email"
                  size="lg"
                  borderColor={UDEMY.border}
                  borderRadius="8px"
                  _focus={{ borderColor: UDEMY.ink, boxShadow: `0 0 0 1px ${UDEMY.ink}` }}
                  placeholder="nama@sekolah.sch.id"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </Field.Root>

              <Field.Root>
                <Field.Label fontSize="13px" color={UDEMY.ink}>Password</Field.Label>
                <Box position="relative" w="full">
                  <Input
                    type={showPass ? 'text' : 'password'}
                    size="lg"
                    pr="44px"
                    borderColor={UDEMY.border}
                    borderRadius="8px"
                    _focus={{ borderColor: UDEMY.ink, boxShadow: `0 0 0 1px ${UDEMY.ink}` }}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                  <IconButton type="button" aria-label={showPass ? 'Sembunyikan password' : 'Tampilkan password'}
                    onClick={() => setShowPass((v) => !v)} variant="ghost" size="sm"
                    position="absolute" top="50%" right="6px" transform="translateY(-50%)"
                    color={UDEMY.inkMuted} _hover={{ color: UDEMY.ink, bg: 'transparent' }}>
                    <Icon as={showPass ? LuEyeOff : LuEye} boxSize="18px" />
                  </IconButton>
                </Box>
              </Field.Root>
            </Stack>

            <Button
              type="submit"
              loading={loading}
              w="full"
              size="lg"
              borderRadius="8px"
              bg={UDEMY.ink}
              color="white"
              fontWeight="bold"
              _hover={{ bg: UDEMY.inkSoft }}
            >
              Masuk
            </Button>

            <Text fontSize="11px" color={UDEMY.inkMuted} textAlign="center">
              Belum punya akun? Hubungi guru / admin sekolah.
            </Text>
          </Stack>
        </Box>
      </Flex>
    </Flex>
  )
}
