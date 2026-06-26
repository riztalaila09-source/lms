import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Badge,
  Box,
  Button,
  Dialog,
  Field,
  Flex,
  Heading,
  HStack,
  Input,
  NativeSelect,
  Stack,
  Table,
  Text,
} from '@chakra-ui/react'
import { userClient } from '@/lib/client'
import type { User } from '@/gen/user/v1/user_pb'
import { Role } from '@/gen/user/v1/user_pb'

const ROLE_LABELS: Record<number, string> = {
  [Role.ROLE_ADMIN]: 'Admin',
  [Role.ROLE_TEACHER]: 'Guru',
  [Role.ROLE_STUDENT]: 'Murid',
}

const ROLE_COLORS: Record<number, string> = {
  [Role.ROLE_ADMIN]: 'red',
  [Role.ROLE_TEACHER]: 'blue',
  [Role.ROLE_STUDENT]: 'green',
}

interface CreateUserForm {
  username: string
  email: string
  password: string
  fullName: string
  role: Role
}

const DEFAULT_FORM: CreateUserForm = {
  username: '',
  email: '',
  password: '',
  fullName: '',
  role: Role.ROLE_STUDENT,
}

export default function UsersPage() {
  const navigate = useNavigate()
  const [users, setUsers] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<CreateUserForm>(DEFAULT_FORM)
  const [formError, setFormError] = useState('')
  const [formLoading, setFormLoading] = useState(false)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await userClient.listUsers({
        pagination: { page: 1, pageSize: 50 },
      })
      setUsers(res.users)
      setTotal(res.pagination?.total ?? 0)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data user')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setFormLoading(true)
    try {
      await userClient.createUser({
        username: form.username,
        email: form.email,
        password: form.password,
        fullName: form.fullName,
        role: form.role,
      })
      setDialogOpen(false)
      setForm(DEFAULT_FORM)
      await loadUsers()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Gagal membuat user')
    } finally {
      setFormLoading(false)
    }
  }

  const handleDeleteUser = async (id: string, username: string) => {
    if (!confirm(`Hapus user "${username}"?`)) return
    try {
      await userClient.deleteUser({ id })
      await loadUsers()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal menghapus user')
    }
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
        <Heading size="md" color="blue.600">LMS</Heading>
        <HStack gap={4}>
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
            Dashboard
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/login')}>
            Keluar
          </Button>
        </HStack>
      </Flex>

      {/* Content */}
      <Box maxW="1200px" mx="auto" mt={8} px={4}>
        <Stack gap={6}>
          <Flex justifyContent="space-between" alignItems="center">
            <Stack gap={0}>
              <Heading size="lg">Manajemen User</Heading>
              <Text color="gray.500" fontSize="sm">Total: {total} user</Text>
            </Stack>
            <Button colorPalette="blue" onClick={() => setDialogOpen(true)}>
              + Tambah User
            </Button>
          </Flex>

          {error && (
            <Text color="red.500" fontSize="sm">{error}</Text>
          )}

          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>Nama</Table.ColumnHeader>
                <Table.ColumnHeader>Username</Table.ColumnHeader>
                <Table.ColumnHeader>Email</Table.ColumnHeader>
                <Table.ColumnHeader>Role</Table.ColumnHeader>
                <Table.ColumnHeader>Status</Table.ColumnHeader>
                <Table.ColumnHeader>Aksi</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {loading ? (
                <Table.Row>
                  <Table.Cell colSpan={6} textAlign="center" color="gray.500">
                    Memuat...
                  </Table.Cell>
                </Table.Row>
              ) : users.length === 0 ? (
                <Table.Row>
                  <Table.Cell colSpan={6} textAlign="center" color="gray.500">
                    Belum ada user
                  </Table.Cell>
                </Table.Row>
              ) : (
                users.map((user) => (
                  <Table.Row key={user.id}>
                    <Table.Cell>{user.fullName || '-'}</Table.Cell>
                    <Table.Cell>{user.username}</Table.Cell>
                    <Table.Cell>{user.email}</Table.Cell>
                    <Table.Cell>
                      <Badge colorPalette={ROLE_COLORS[user.role] ?? 'gray'}>
                        {ROLE_LABELS[user.role] ?? 'Unknown'}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge colorPalette={user.isActive ? 'green' : 'red'}>
                        {user.isActive ? 'Aktif' : 'Non-aktif'}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>
                      <Button
                        size="xs"
                        colorPalette="red"
                        variant="outline"
                        onClick={() => handleDeleteUser(user.id, user.username)}
                      >
                        Hapus
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                ))
              )}
            </Table.Body>
          </Table.Root>
        </Stack>
      </Box>

      {/* Create User Dialog */}
      <Dialog.Root open={dialogOpen} onOpenChange={(e) => setDialogOpen(e.open)}>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Tambah User Baru</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <form id="create-user-form" onSubmit={handleCreateUser}>
                <Stack gap={4}>
                  <Field.Root>
                    <Field.Label>Nama Lengkap</Field.Label>
                    <Input
                      value={form.fullName}
                      onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                      placeholder="Nama lengkap"
                    />
                  </Field.Root>

                  <Field.Root required>
                    <Field.Label>Username</Field.Label>
                    <Input
                      value={form.username}
                      onChange={(e) => setForm({ ...form, username: e.target.value })}
                      placeholder="username"
                      required
                    />
                  </Field.Root>

                  <Field.Root required>
                    <Field.Label>Email</Field.Label>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="user@example.com"
                      required
                    />
                  </Field.Root>

                  <Field.Root required>
                    <Field.Label>Password</Field.Label>
                    <Input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="••••••••"
                      required
                      minLength={6}
                    />
                  </Field.Root>

                  <Field.Root required>
                    <Field.Label>Role</Field.Label>
                    <NativeSelect.Root>
                      <NativeSelect.Field
                        value={String(form.role)}
                        onChange={(e) => setForm({ ...form, role: Number(e.target.value) as Role })}
                      >
                        <option value={String(Role.ROLE_STUDENT)}>Murid</option>
                        <option value={String(Role.ROLE_TEACHER)}>Guru</option>
                        <option value={String(Role.ROLE_ADMIN)}>Admin</option>
                      </NativeSelect.Field>
                      <NativeSelect.Indicator />
                    </NativeSelect.Root>
                  </Field.Root>

                  {formError && (
                    <Text color="red.500" fontSize="sm">{formError}</Text>
                  )}
                </Stack>
              </form>
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.ActionTrigger asChild>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Batal
                </Button>
              </Dialog.ActionTrigger>
              <Button
                type="submit"
                form="create-user-form"
                colorPalette="blue"
                loading={formLoading}
              >
                Simpan
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>
    </Box>
  )
}
