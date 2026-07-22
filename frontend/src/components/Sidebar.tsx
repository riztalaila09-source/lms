import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Box, Button, Flex, HStack, Icon, IconButton, Image, Stack, Text } from '@chakra-ui/react'
import type { IconType } from 'react-icons'
import {
  LuHouse, LuLibrary, LuBookOpen, LuClipboardList, LuInbox,
  LuTrophy, LuActivity, LuWrench, LuSchool, LuLogOut, LuUsers,
  LuLayoutGrid, LuChevronDown, LuChevronRight, LuQrCode, LuBriefcase,
  LuGraduationCap, LuUser, LuContact, LuShield,
  LuBuilding2, LuMegaphone,
  LuImages, LuNewspaper, LuCalendarDays,
  LuPanelLeftClose, LuPanelLeftOpen,
  LuMoon, LuSun, LuLanguages,
} from 'react-icons/lu'
import { useAuth } from '@/hooks/useAuth'
import { Role } from '@/gen/user/v1/user_pb'
import { can, canAny } from '@/lib/permissions'
import { COLORS, SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH } from '@/theme/tokens'
import { useLang } from '@/i18n'
import { useColorMode } from '@/components/ui/color-mode'

export { SIDEBAR_WIDTH }

interface NavLeaf {
  label: string
  path: string
  icon: IconType
  roles?: Role[]    // if set, only these roles see the item
  perm?: string     // if set, requires this access-right (admins always pass)
  anyPerm?: string[] // if set, requires at least one of these access-rights
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

// `label` holds an i18n key (see i18n.tsx); it is translated at render time and
// also serves as the stable identity for open/close group state.
const NAV: NavEntry[] = [
  { label: 'nav.home', path: '/dashboard', icon: LuHouse },
  { label: 'nav.attendance', path: '/absensi', icon: LuQrCode },
  {
    label: 'sb.learning',
    icon: LuLibrary,
    children: [
      { label: 'sb.courses', path: '/courses', icon: LuLayoutGrid },
      { label: 'nav.materials', path: '/materi', icon: LuBookOpen },
      { label: 'nav.tasks', path: '/tugas', icon: LuClipboardList },
      { label: 'sb.submissions', path: '/pengumpulan', icon: LuInbox, perm: 'kelola_nilai' },
      { label: 'nav.grades', path: '/nilai', icon: LuTrophy },
      { label: 'sb.log', path: '/log', icon: LuActivity, perm: 'kelola_log' },
    ],
  },
  { label: 'sb.academicData', path: '/akademik', icon: LuSchool, perm: 'kelola_sekolah' },
  {
    label: 'sb.schoolProfile',
    icon: LuBuilding2,
    children: [
      { label: 'sb.sp.home', path: '/profil-sekolah/beranda', icon: LuBuilding2, perm: 'kelola_sekolah' },
      { label: 'sb.sp.ppdb', path: '/profil-sekolah/ppdb', icon: LuMegaphone, perm: 'kelola_sekolah' },
      { label: 'sb.sp.gallery', path: '/profil-sekolah/galeri', icon: LuImages, perm: 'kelola_sekolah' },
      { label: 'sb.sp.news', path: '/profil-sekolah/berita', icon: LuNewspaper, perm: 'kelola_sekolah' },
      { label: 'sb.sp.academic', path: '/profil-sekolah/akademik', icon: LuCalendarDays, perm: 'kelola_sekolah' },
    ],
  },
  {
    label: 'sb.users',
    icon: LuUsers,
    children: [
      { label: 'sb.teachers', path: '/pengguna/guru', icon: LuGraduationCap, perm: 'kelola_guru' },
      { label: 'sb.students', path: '/pengguna/siswa', icon: LuUser, perm: 'kelola_siswa' },
      { label: 'sb.parents', path: '/pengguna/ortu', icon: LuContact, perm: 'kelola_ortu' },
      { label: 'sb.admins', path: '/pengguna/admin', icon: LuShield, roles: [Role.ADMIN] },
    ],
  },
  { label: 'nav.pkl', path: '/mitra-pkl', icon: LuBriefcase },
  { label: 'nav.settings', path: '/pengaturan', icon: LuWrench },
]

const ROLE_LABEL_KEY: Record<number, string> = {
  [Role.ADMIN]: 'role.admin',
  [Role.TEACHER]: 'role.teacher',
  [Role.STUDENT]: 'role.student',
  [Role.UNSPECIFIED]: '-',
}

const ROLE_PANEL_KEY: Record<number, string> = {
  [Role.ADMIN]: 'sb.panel.admin',
  [Role.TEACHER]: 'sb.panel.teacher',
  [Role.STUDENT]: 'sb.panel.student',
  [Role.UNSPECIFIED]: 'sb.panel.default',
}

interface SidebarProps {
  mobileOpen?: boolean
  onNavigate?: () => void
  collapsed?: boolean          // desktop: icon-only rail
  onToggleCollapse?: () => void
}

export default function Sidebar({ mobileOpen = false, onNavigate, collapsed = false, onToggleCollapse }: SidebarProps = {}) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const { t, lang, setLang } = useLang()
  const { colorMode, toggleColorMode } = useColorMode()
  const isDark = colorMode === 'dark'
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})

  const nav = (path: string) => { navigate(path); onNavigate?.() }

  const handleLogout = () => {
    if (!confirm(t('sb.logoutConfirm'))) return
    logout()
    navigate('/login', { replace: true })
  }

  const userInitials = (user?.fullName || user?.username || 'U')
    .trim().split(/\s+/).slice(0, 2).map((s) => s[0] || '').join('').toUpperCase()

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/')

  const canSee = (item: NavLeaf) => {
    if (item.roles && !(user != null && item.roles.includes(user.role))) return false
    if (item.perm && !can(user, item.perm)) return false
    if (item.anyPerm && !canAny(user, item.anyPerm)) return false
    return true
  }

  // When collapsed (desktop only) items become centered icons; labels stay for the
  // mobile drawer (base breakpoint). These responsive props express that.
  const labelDisplay = collapsed ? { base: 'inline', md: 'none' } : 'inline'
  const rowJustify = collapsed ? { base: 'flex-start', md: 'center' } : 'flex-start'

  // Leaf row (used for both top-level items and indented children).
  const Leaf = ({ item, indented }: { item: NavLeaf; indented?: boolean }) => {
    const active = isActive(item.path)
    return (
      <Flex
        as="button"
        title={collapsed ? t(item.label) : undefined}
        alignItems="center"
        gap="10px"
        justifyContent={rowJustify}
        pl={collapsed ? { base: indented ? '40px' : '15px', md: '0px' } : (indented ? '40px' : '15px')}
        pr={collapsed ? { base: '18px', md: '0px' } : '18px'}
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
        <Text as="span" display={labelDisplay} lineClamp={1}>{t(item.label)}</Text>
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
      w={{ base: `${SIDEBAR_WIDTH}px`, md: `${collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH}px` }}
      bg={COLORS.surface}
      color={COLORS.text}
      borderRight="1px solid"
      borderColor={COLORS.border}
      zIndex={100}
      overflowX="hidden"
      transform={{ base: mobileOpen ? 'translateX(0)' : 'translateX(-100%)', md: 'translateX(0)' }}
      transition="transform .2s ease, width .2s ease"
      boxShadow={{ base: mobileOpen ? '2xl' : 'none', md: 'none' }}
    >
      {/* Brand + collapse toggle */}
      <Box px={collapsed ? { base: '18px', md: '0px' } : '18px'} py="16px" borderBottom="1px solid" borderColor={COLORS.border}>
        <Flex align="center" gap="8px" justify={collapsed ? { base: 'space-between', md: 'center' } : 'space-between'}>
          <HStack gap={2} display={collapsed ? { base: 'flex', md: 'none' } : 'flex'}>
            <Icon as={LuSchool} boxSize="22px" color={COLORS.primary} />
            <Box>
              <Text fontWeight="bold" fontSize="16px" lineHeight="1.2">LMS Kelas</Text>
              <Text fontSize="11px" color={COLORS.muted} lineHeight="1.2">
                {t(user ? ROLE_PANEL_KEY[user.role] : 'sb.panel.default')}
              </Text>
            </Box>
          </HStack>
          <IconButton
            aria-label={collapsed ? t('sb.expand') : t('sb.collapse')}
            title={collapsed ? t('sb.expand') : t('sb.collapse')}
            onClick={onToggleCollapse}
            variant="ghost"
            size="sm"
            color={COLORS.muted}
            display={{ base: 'none', md: 'inline-flex' }}
          >
            <Icon as={collapsed ? LuPanelLeftOpen : LuPanelLeftClose} boxSize="18px" />
          </IconButton>
        </Flex>
      </Box>

      {/* Nav */}
      <Stack gap={0} py="10px" flex={1} overflowY="auto" overflowX="hidden">
        {NAV.map((entry) => {
          if (!isGroup(entry)) {
            return canSee(entry) ? <Leaf key={entry.path} item={entry} /> : null
          }
          // Group with children
          const children = entry.children.filter((c) => canSee(c))
          if (children.length === 0) return null
          const groupActive = children.some((c) => isActive(c.path))
          const open = openGroups[entry.label] ?? groupActive
          return (
            <Box key={entry.label}>
              <Flex
                as="button"
                title={collapsed ? t(entry.label) : undefined}
                alignItems="center"
                gap="10px"
                justifyContent={rowJustify}
                pl={collapsed ? { base: '15px', md: '0px' } : '15px'}
                pr={collapsed ? { base: '14px', md: '0px' } : '14px'}
                py="10px"
                w="full"
                textAlign="left"
                fontSize="13px"
                cursor="pointer"
                fontWeight={groupActive ? 'semibold' : 'medium'}
                color={groupActive ? COLORS.primary : COLORS.text}
                _hover={{ bg: COLORS.bg }}
                transition="background .15s"
                onClick={() => {
                  if (collapsed) { onToggleCollapse?.(); setOpenGroups((s) => ({ ...s, [entry.label]: true })) }
                  else setOpenGroups((s) => ({ ...s, [entry.label]: !open }))
                }}
              >
                <Icon as={entry.icon} boxSize="18px" flexShrink={0} />
                <Text as="span" flex={1} display={labelDisplay}>{t(entry.label)}</Text>
                <Icon as={open ? LuChevronDown : LuChevronRight} boxSize="15px" flexShrink={0} color={COLORS.muted}
                  display={labelDisplay} />
              </Flex>
              {open && (
                <Stack gap={0} display={collapsed ? { base: 'block', md: 'none' } : 'block'}>
                  {children.map((c) => <Leaf key={c.path} item={c} indented />)}
                </Stack>
              )}
            </Box>
          )
        })}
      </Stack>

      {/* Footer: foto di atas nama, kelas/role di bawah nama, lalu Keluar */}
      <Box px={collapsed ? { base: '14px', md: '8px' } : '14px'} py="14px" borderTop="1px solid" borderColor={COLORS.border}>
        <Flex direction="column" align="center" textAlign="center" gap="6px" mb="10px">
          {user?.photoUrl ? (
            <Image src={user.photoUrl} alt="foto" w={collapsed ? { base: '52px', md: '40px' } : '52px'} h={collapsed ? { base: '52px', md: '40px' } : '52px'} borderRadius="full" objectFit="cover" border={`2px solid ${COLORS.border}`} />
          ) : (
            <Flex w={collapsed ? { base: '52px', md: '40px' } : '52px'} h={collapsed ? { base: '52px', md: '40px' } : '52px'} borderRadius="full" bg={COLORS.primary} color="white"
              align="center" justify="center" fontSize={collapsed ? { base: '18px', md: '14px' } : '18px'} fontWeight="bold">
              {userInitials}
            </Flex>
          )}
          <Box maxW="full" display={collapsed ? { base: 'block', md: 'none' } : 'block'}>
            <Text fontWeight="semibold" fontSize="13px" color={COLORS.text} lineClamp={1}>
              {user?.fullName || user?.username || t('common.user')}
            </Text>
            {user?.kelas ? (
              <Text fontSize="11px" color={COLORS.primary} fontWeight="medium">{user.kelas}</Text>
            ) : (
              <Text fontSize="11px" color={COLORS.muted}>{user ? t(ROLE_LABEL_KEY[user.role] ?? '-') : ''}</Text>
            )}
          </Box>
        </Flex>

        {/* Appearance quick controls: theme toggle + language switch */}
        <Flex
          align="center"
          gap="6px"
          mb="10px"
          direction={collapsed ? { base: 'row', md: 'column' } : 'row'}
          justify={collapsed ? { base: 'center', md: 'center' } : 'center'}
        >
          <IconButton
            aria-label={isDark ? t('appear.light') : t('appear.dark')}
            title={isDark ? t('appear.light') : t('appear.dark')}
            size="sm"
            variant="outline"
            borderColor={COLORS.border}
            color={COLORS.text}
            _hover={{ bg: COLORS.bg }}
            onClick={toggleColorMode}
          >
            <Icon as={isDark ? LuSun : LuMoon} />
          </IconButton>
          {/* Expanded / mobile: full-width language toggle button */}
          <Button
            flex={1}
            size="sm"
            variant="outline"
            borderColor={COLORS.border}
            color={COLORS.text}
            _hover={{ bg: COLORS.bg }}
            onClick={() => setLang(lang === 'id' ? 'en' : 'id')}
            display={collapsed ? { base: 'inline-flex', md: 'none' } : 'inline-flex'}
          >
            <Icon as={LuLanguages} /> {lang === 'id' ? 'ID' : 'EN'}
          </Button>
          {/* Collapsed desktop rail: icon-only language toggle */}
          <IconButton
            aria-label={t('appear.language')}
            title={t('appear.language')}
            size="sm"
            variant="outline"
            borderColor={COLORS.border}
            color={COLORS.text}
            _hover={{ bg: COLORS.bg }}
            onClick={() => setLang(lang === 'id' ? 'en' : 'id')}
            display={collapsed ? { base: 'none', md: 'inline-flex' } : 'none'}
          >
            <Icon as={LuLanguages} />
          </IconButton>
        </Flex>
        {/* Full "Keluar" button (expanded / mobile drawer) */}
        <Button
          w="full"
          size="xs"
          fontSize="11px"
          variant="outline"
          color={COLORS.text}
          borderColor={COLORS.border}
          _hover={{ bg: COLORS.bg }}
          onClick={handleLogout}
          display={collapsed ? { base: 'flex', md: 'none' } : 'flex'}
        >
          <Icon as={LuLogOut} /> {t('nav.logout')}
        </Button>
        {/* Icon-only logout (collapsed desktop) */}
        <Flex justify="center" display={collapsed ? { base: 'none', md: 'flex' } : 'none'}>
          <IconButton aria-label={t('nav.logout')} title={t('nav.logout')} size="sm" variant="outline" borderColor={COLORS.border}
            color={COLORS.text} _hover={{ bg: COLORS.bg }} onClick={handleLogout}>
            <Icon as={LuLogOut} />
          </IconButton>
        </Flex>
      </Box>
    </Flex>
  )
}
