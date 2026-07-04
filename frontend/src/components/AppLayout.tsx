import { useState, type ReactNode } from 'react'
import { Box, Flex, Heading, Icon, Text } from '@chakra-ui/react'
import { LuMenu, LuGraduationCap } from 'react-icons/lu'
import { useAuth } from '@/hooks/useAuth'
import { Role } from '@/gen/user/v1/user_pb'
import Sidebar from './Sidebar'
import TopNav from './TopNav'
import Footer from './Footer'
import { COLORS, SIDEBAR_WIDTH } from '@/theme/tokens'

interface AppLayoutProps {
  title: ReactNode
  subtitle?: ReactNode
  /** Optional actions rendered on the right side of the page header (e.g. buttons) */
  actions?: ReactNode
  children: ReactNode
}

function PageHeader({ title, subtitle, actions }: Pick<AppLayoutProps, 'title' | 'subtitle' | 'actions'>) {
  if (!title && !actions) return null
  return (
    <Flex mb="20px" alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" gap="10px">
      <Box>
        {title && <Heading fontSize={{ base: '17px', md: '18px' }} fontWeight="bold">{title}</Heading>}
        {subtitle && <Text color={COLORS.muted} fontSize="12px" mt="2px">{subtitle}</Text>}
      </Box>
      {actions && <Flex alignItems="center" gap="8px" flexWrap="wrap">{actions}</Flex>}
    </Flex>
  )
}

/**
 * App shell. Students get a Udemy-style top navigation; teachers/admins keep the
 * left sidebar, which collapses into a hamburger drawer on phones & tablets.
 */
export default function AppLayout({ title, subtitle, actions, children }: AppLayoutProps) {
  const { user, token, loadingProfile } = useAuth()
  const [open, setOpen] = useState(false)

  // Wait until the profile is known before choosing a layout, otherwise a
  // refresh briefly flashes the teacher sidebar before the student top-nav.
  if (token && (loadingProfile || !user)) {
    return (
      <Flex minH="100vh" align="center" justify="center" bg={COLORS.bg}>
        <Text color={COLORS.muted} fontSize="14px">Memuat…</Text>
      </Flex>
    )
  }

  const isStudent = user != null && user.role === Role.STUDENT

  // ── Student: top navbar ──
  if (isStudent) {
    return (
      <Flex direction="column" minH="100vh" bg={COLORS.bg} color={COLORS.text}>
        <TopNav />
        <Box flex="1" w="full" maxW="1600px" mx="auto" px={{ base: '14px', md: '24px', xl: '40px' }} py={{ base: '18px', md: '26px' }}>
          <PageHeader title={title} subtitle={subtitle} actions={actions} />
          {children}
        </Box>
        <Footer />
      </Flex>
    )
  }

  // ── Teacher/admin: responsive sidebar ──
  return (
    <Box minH="100vh" bg={COLORS.bg} color={COLORS.text}>
      <Sidebar mobileOpen={open} onNavigate={() => setOpen(false)} />

      {/* Mobile backdrop */}
      {open && (
        <Box display={{ base: 'block', md: 'none' }} position="fixed" inset={0} bg="blackAlpha.500" zIndex={99}
          onClick={() => setOpen(false)} />
      )}

      <Box ml={{ base: 0, md: `${SIDEBAR_WIDTH}px` }}>
        {/* Mobile top bar with hamburger */}
        <Flex display={{ base: 'flex', md: 'none' }} align="center" gap="10px" h="52px" px="14px"
          bg={COLORS.surface} borderBottom="1px solid" borderColor={COLORS.border}
          position="sticky" top={0} zIndex={90}>
          <Box as="button" onClick={() => setOpen(true)} aria-label="menu">
            <Icon as={LuMenu} boxSize="24px" />
          </Box>
          <Flex align="center" gap="6px">
            <Icon as={LuGraduationCap} boxSize="20px" color={COLORS.primary} />
            <Text fontWeight="bold" fontSize="15px">LMS Kelas</Text>
          </Flex>
        </Flex>

        <Box p={{ base: '16px', md: '24px' }}>
          <PageHeader title={title} subtitle={subtitle} actions={actions} />
          {children}
        </Box>
      </Box>
    </Box>
  )
}
