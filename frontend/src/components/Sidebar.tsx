import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Box, Button, Flex, HStack, Icon, Stack, Text } from '@chakra-ui/react'
import type { IconType } from 'react-icons'
import {
  LuHouse, LuLibrary, LuBookOpen, LuClipboardList, LuInbox,
  LuTrophy, LuActivity, LuSettings, LuWrench, LuSchool, LuLogOut,
  LuLayoutGrid, LuChevronDown, LuChevronRight,
} from 'react-icons/lu'
import { useAuth } from '@/hooks/useAuth'
import { Role } from '@/gen/user/v1/user_pb'
import { COLORS, SIDEBAR_WIDTH } from '@/theme/tokens'

export { SIDEBAR_WIDTH }

interface NavLeaf {
  label: string
  path: string
  icon: IconType
  roles?: Role[] // if set, only these roles see the item
}
interface NavGroup {
  label: string
  icon: IconType
  children: NavLeaf[]
}
type NavEntry = NavLeaf | NavGroup

function isGroup(e: NavEntry): e is NavGroup {
  return (e as NavGroup).children !== undefined
}

const MANAGER = [Role.ADMIN, Role.TEACHER]

const NAV: NavEntry[] = [
  { label: 'Beranda', path: '/dashboard', icon: LuHouse },
  {
    label: 'Mata Pelajaran',
    icon: LuLibrary,
    children: [
      { label: 'Daftar Mapel', path: '/courses', icon: LuLayoutGrid },
      { label: 'Materi Umum', path: '/materi', icon: LuBookOpen },
      { label: 'Tugas', path: '/tugas', icon: LuClipboardList },
      { label: 'Pengumpulan', path: '/pengumpulan', icon: LuInbox, roles: MANAGER },
      { label: 'Nilai', path: '/nilai', icon: LuTrophy },
      { label: 'Log Aktivitas', path: '/log', icon: LuActivity, roles: MANAGER },
    ],
  },
  { label: 'Master Data', path: '/users', icon: LuSettings, roles: MANAGER },
  { label: 'Pengaturan', path: '/pengaturan', icon: LuWrench },
]

const ROLE_LABELS: Record<number, string> = {
  [Role.ADMIN]: 'Admin',
  [Role.TEACHER]: 'Guru',
  [Role.STUDENT]: 'Siswa',
  [Role.UNSPECIFIED]: '-',
}

const ROLE_PANEL: Record<number, string> = {
  [Role.ADMIN]: 'Panel Admin',
  [Role.TEACHER]: 'Panel Guru',
  [Role.STUDENT]: 'Panel Siswa',
  [Role.UNSPECIFIED]: 'Portal Belajar',
}

export default function Sidebar({ mobileOpen = false, onNavigate }: { mobileOpen?: boolean; onNavigate?: () => void } = {}) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})

  const nav = (path: string) => { navigate(path); onNavigate?.() }

  const handleLogout = () => {
    if (!confirm('Yakin ingin keluar?')) return
    logout()
    navigate('/login', { replace: true })
  }

  const userInitials = (user?.fullName || user?.username || 'U')
    .trim().split(/\s+/).slice(0, 2).map((s) => s[0] || '').join('').toUpperCase()

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/')

  const canSee = (roles?: Role[]) => !roles || (user != null && roles.includes(user.role))

  // Leaf row (used for both top-level items and indented children).
  const Leaf = ({ item, indented }: { item: NavLeaf; indented?: boolean }) => {
    const active = isActive(item.path)
    return (
      <Flex
        as="button"
        alignItems="center"
        gap="10px"
        pl={indented ? '40px' : '15px'}
        pr="18px"
        py="9px"
        w="full"
        textAlign="left"
        fontSize="13px"
        cursor="pointer"
        fontWeight={active ? 'semibold' : 'normal'}
        color={active ? COLORS.primary : COLORS.muted}
        bg={active ? COLORS.primaryTint : 'transparent'}
        borderLeftWidth="3px"
        borderLeftColor={active ? COLORS.primary : 'transparent'}
        _hover={{ bg: active ? COLORS.primaryTint : COLORS.bg, color: active ? COLORS.primary : COLORS.text }}
        transition="background .15s, color .15s"
        onClick={() => nav(item.path)}
      >
        <Icon as={item.icon} boxSize={indented ? '15px' : '18px'} flexShrink={0} />
        <Text as="span">{item.label}</Text>
      </Flex>
    )
  }

  return (
    <Flex
      direction="column"
      position="fixed"
      left={0}
      top={0}
      h="100vh"
      w={`${SIDEBAR_WIDTH}px`}
      bg={COLORS.surface}
      color={COLORS.text}
      borderRight="1px solid"
      borderColor={COLORS.border}
      zIndex={100}
      transform={{ base: mobileOpen ? 'translateX(0)' : 'translateX(-100%)', md: 'translateX(0)' }}
      transition="transform .2s ease"
      boxShadow={{ base: mobileOpen ? '2xl' : 'none', md: 'none' }}
    >
      {/* Brand */}
      <Box px="18px" py="16px" borderBottom="1px solid" borderColor={COLORS.border}>
        <HStack gap={2}>
          <Icon as={LuSchool} boxSize="22px" color={COLORS.primary} />
          <Box>
            <Text fontWeight="bold" fontSize="16px" lineHeight="1.2">
              LMS Kelas
            </Text>
            <Text fontSize="11px" color={COLORS.muted} lineHeight="1.2">
              {user ? ROLE_PANEL[user.role] : 'Portal Belajar'}
            </Text>
          </Box>
        </HStack>
      </Box>

      {/* Nav */}
      <Stack gap={0} py="10px" flex={1} overflowY="auto">
        {NAV.map((entry) => {
          if (!isGroup(entry)) {
            return canSee(entry.roles) ? <Leaf key={entry.path} item={entry} /> : null
          }
          // Group with children
          const children = entry.children.filter((c) => canSee(c.roles))
          if (children.length === 0) return null
          const groupActive = children.some((c) => isActive(c.path))
          const open = openGroups[entry.label] ?? groupActive
          return (
            <Box key={entry.label}>
              <Flex
                as="button"
                alignItems="center"
                gap="10px"
                pl="15px"
                pr="14px"
                py="10px"
                w="full"
                textAlign="left"
                fontSize="13px"
                cursor="pointer"
                fontWeight={groupActive ? 'semibold' : 'medium'}
                color={groupActive ? COLORS.primary : COLORS.text}
                _hover={{ bg: COLORS.bg }}
                transition="background .15s"
                onClick={() => setOpenGroups((s) => ({ ...s, [entry.label]: !open }))}
              >
                <Icon as={entry.icon} boxSize="18px" flexShrink={0} />
                <Text as="span" flex={1}>{entry.label}</Text>
                <Icon as={open ? LuChevronDown : LuChevronRight} boxSize="15px" flexShrink={0} color={COLORS.muted} />
              </Flex>
              {open && (
                <Stack gap={0}>
                  {children.map((c) => <Leaf key={c.path} item={c} indented />)}
                </Stack>
              )}
            </Box>
          )
        })}
      </Stack>

      {/* Footer: foto di atas nama, kelas/role di bawah nama, lalu Keluar */}
      <Box px="14px" py="14px" borderTop="1px solid" borderColor={COLORS.border}>
        <Flex direction="column" align="center" textAlign="center" gap="6px" mb="10px">
          {user?.photoUrl ? (
            <img src={user.photoUrl} alt="foto"
              style={{ width: 52, height: 52, borderRadius: '9999px', objectFit: 'cover', border: `2px solid ${COLORS.border}` }} />
          ) : (
            <Flex w="52px" h="52px" borderRadius="full" bg={COLORS.primary} color="white"
              align="center" justify="center" fontSize="18px" fontWeight="bold">
              {userInitials}
            </Flex>
          )}
          <Box maxW="full">
            <Text fontWeight="semibold" fontSize="13px" color={COLORS.text} lineClamp={1}>
              {user?.fullName || user?.username || 'Pengguna'}
            </Text>
            {user?.kelas ? (
              <Text fontSize="11px" color={COLORS.primary} fontWeight="medium">{user.kelas}</Text>
            ) : (
              <Text fontSize="11px" color={COLORS.muted}>{user ? ROLE_LABELS[user.role] ?? '-' : ''}</Text>
            )}
          </Box>
        </Flex>
        <Button
          w="full"
          size="xs"
          fontSize="11px"
          variant="outline"
          color={COLORS.text}
          borderColor={COLORS.border}
          _hover={{ bg: COLORS.bg }}
          onClick={handleLogout}
        >
          <Icon as={LuLogOut} /> Keluar
        </Button>
      </Box>
    </Flex>
  )
}
