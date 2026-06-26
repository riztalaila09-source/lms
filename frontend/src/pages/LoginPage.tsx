import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Button,
  Field,
  Heading,
  Input,
  Stack,
  Text,
} from '@chakra-ui/react'
import { useAuth } from '@/hooks/useAuth'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/dashboard', { replace: true })
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Login gagal. Periksa email dan password Anda.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box minH="100vh" display="flex" alignItems="center" justifyContent="center" bg="gray.50">
      <Box
        as="form"
        onSubmit={handleSubmit}
        bg="white"
        p={8}
        borderRadius="xl"
        boxShadow="lg"
        w="full"
        maxW="400px"
      >
        <Stack gap={6}>
          <Stack gap={1} textAlign="center">
            <Heading size="xl">LMS</Heading>
            <Text color="gray.500" fontSize="sm">
              Learning Management System
            </Text>
          </Stack>

          <Stack gap={4}>
            <Field.Root invalid={!!error}>
              <Field.Label>Email</Field.Label>
              <Input
                type="email"
                placeholder="admin@lms.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </Field.Root>

            <Field.Root invalid={!!error}>
              <Field.Label>Password</Field.Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              {error && <Field.ErrorText>{error}</Field.ErrorText>}
            </Field.Root>
          </Stack>

          <Button type="submit" colorPalette="blue" loading={loading} w="full">
            Masuk
          </Button>
        </Stack>
      </Box>
    </Box>
  )
}
