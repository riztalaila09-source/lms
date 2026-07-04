import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Button, Field, Flex, Heading, Icon, Input, Stack, Text } from '@chakra-ui/react'
import { LuGraduationCap, LuPlay, LuAward, LuUsers } from 'react-icons/lu'
import { useAuth } from '@/hooks/useAuth'
import { UDEMY } from '@/theme/tokens'

const DEMO_ACCOUNTS = [
  { label: 'Guru', email: 'guru@lms.local', password: 'password123' },
  { label: 'Siswa', email: 'siswa@lms.local', password: 'password123' },
]

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

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
            <Icon as={LuGraduationCap} boxSize="34px" color={UDEMY.accent} />
            <Text fontWeight="bold" fontSize="22px">LMS Kelas</Text>
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
            <Box display={{ base: 'block', md: 'none' }} textAlign="center">
              <Icon as={LuGraduationCap} boxSize="36px" color={UDEMY.accent} />
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
                <Input
                  type="password"
                  size="lg"
                  borderColor={UDEMY.border}
                  borderRadius="8px"
                  _focus={{ borderColor: UDEMY.ink, boxShadow: `0 0 0 1px ${UDEMY.ink}` }}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
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

            {/* Demo accounts (no public sign-up) */}
            <Box borderTop="1px solid" borderColor={UDEMY.border} pt="16px">
              <Text fontSize="12px" color={UDEMY.inkMuted} mb="8px" textAlign="center">
                Akun demo — klik untuk mengisi otomatis
              </Text>
              <Flex gap="8px" justify="center">
                {DEMO_ACCOUNTS.map((a) => (
                  <Button
                    key={a.email}
                    size="sm"
                    variant="outline"
                    borderColor={UDEMY.ink}
                    color={UDEMY.ink}
                    fontSize="12px"
                    _hover={{ bg: UDEMY.accentTint }}
                    onClick={() => { setEmail(a.email); setPassword(a.password) }}
                  >
                    {a.label}
                  </Button>
                ))}
              </Flex>
              <Text fontSize="11px" color={UDEMY.inkMuted} mt="12px" textAlign="center">
                Belum punya akun? Hubungi guru / admin sekolah.
              </Text>
            </Box>
          </Stack>
        </Box>
      </Flex>
    </Flex>
  )
}
