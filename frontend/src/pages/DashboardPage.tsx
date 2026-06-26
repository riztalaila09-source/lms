import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Button,
  Card,
  Flex,
  Heading,
  HStack,
  Separator,
  Stack,
  Text,
} from '@chakra-ui/react'
import { useAuth } from '@/hooks/useAuth'
import { Role } from '@/gen/user/v1/user_pb'

const ROLE_LABELS: Record<number, string> = {
  [Role.ROLE_ADMIN]: 'Admin',
  [Role.ROLE_TEACHER]: 'Guru',
  [Role.ROLE_STUDENT]: 'Murid',
  [Role.ROLE_UNSPECIFIED]: '-',
}

export default function DashboardPage() {
  const { user, isAuthenticated, logout, loadProfile } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (isAuthenticated && !user) {
      loadProfile().catch(() => {
        logout()
        navigate('/login', { replace: true })
      })
    }
  }, [isAuthenticated, user, loadProfile, logout, navigate])

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <Box minH="100vh" bg="gray.50">
      {/* Navbar */}
      <Flex
        as="nav"
        bg="white"
        px={6}
        py={4}
        boxShadow="sm"
        alignItems="center"
        justifyContent="space-between"
      >
        <Heading size="md" color="blue.600">
          LMS
        </Heading>
        <HStack gap={4}>
          {user?.role === Role.ROLE_ADMIN && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/users')}
            >
              Manajemen User
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleLogout}>
            Keluar
          </Button>
        </HStack>
      </Flex>

      {/* Content */}
      <Box maxW="800px" mx="auto" mt={8} px={4}>
        <Stack gap={6}>
          <Heading size="lg">Dashboard</Heading>

          {user ? (
            <Card.Root>
              <Card.Header>
                <Heading size="md">Profil Saya</Heading>
              </Card.Header>
              <Separator />
              <Card.Body>
                <Stack gap={3}>
                  <HStack justify="space-between">
                    <Text fontWeight="medium" color="gray.600">Nama Lengkap</Text>
                    <Text>{user.fullName || '-'}</Text>
                  </HStack>
                  <HStack justify="space-between">
                    <Text fontWeight="medium" color="gray.600">Username</Text>
                    <Text>{user.username}</Text>
                  </HStack>
                  <HStack justify="space-between">
                    <Text fontWeight="medium" color="gray.600">Email</Text>
                    <Text>{user.email}</Text>
                  </HStack>
                  <HStack justify="space-between">
                    <Text fontWeight="medium" color="gray.600">Role</Text>
                    <Text>{ROLE_LABELS[user.role] ?? '-'}</Text>
                  </HStack>
                  <HStack justify="space-between">
                    <Text fontWeight="medium" color="gray.600">Status</Text>
                    <Text color={user.isActive ? 'green.500' : 'red.500'}>
                      {user.isActive ? 'Aktif' : 'Non-aktif'}
                    </Text>
                  </HStack>
                </Stack>
              </Card.Body>
            </Card.Root>
          ) : (
            <Text color="gray.500">Memuat profil...</Text>
          )}
        </Stack>
      </Box>
    </Box>
  )
}
