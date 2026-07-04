import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Badge, Box, Button, Flex, Icon, Input, Text } from '@chakra-ui/react'
import {
  LuGraduationCap, LuSearch, LuMenu, LuX, LuBookOpen, LuHouse, LuLibrary,
  LuClipboardList, LuTrophy, LuSettings, LuLogOut,
} from 'react-icons/lu'
import type { IconType } from 'react-icons'
import { useAuth } from '@/hooks/useAuth'
import { useLang } from '@/i18n'
import { materialClient } from '@/lib/client'
import type { MaterialSearchHit } from '@/gen/material/v1/material_pb'
import type { Material } from '@/gen/material/v1/material_pb'
import MaterialViewer from '@/components/MaterialViewer'
import { UDEMY } from '@/theme/tokens'

const LINKS: { key: string; path: string; icon: IconType }[] = [
  { key: 'nav.home', path: '/dashboard', icon: LuHouse },
  { key: 'nav.courses', path: '/courses', icon: LuLibrary },
  { key: 'nav.materials', path: '/materi', icon: LuBookOpen },
  { key: 'nav.tasks', path: '/tugas', icon: LuClipboardList },
  { key: 'nav.grades', path: '/nilai', icon: LuTrophy },
]

export default function TopNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const { t } = useLang()

  const [q, setQ] = useState('')
  const [hits, setHits] = useState<MaterialSearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [viewing, setViewing] = useState<Material | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/')

  // Debounced global material search.
  useEffect(() => {
    const term = q.trim()
    if (!term) { setHits([]); setSearching(false); return }
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const r = await materialClient.searchMaterials({ query: term })
        setHits(r.hits)
      } catch { setHits([]) }
      finally { setSearching(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  // Close search dropdown on outside click.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const go = (path: string) => { setMenuOpen(false); setAvatarOpen(false); navigate(path) }
  const openHit = (h: MaterialSearchHit) => {
    setSearchOpen(false); setMenuOpen(false); setQ('')
    if (h.material) setViewing(h.material)
  }

  const initials = (user?.fullName || user?.username || 'U').trim().split(/\s+/).slice(0, 2).map((s) => s[0] || '').join('').toUpperCase()

  return (
    <>
      <Box as="header" position="sticky" top={0} zIndex={200} bg="white" borderBottom="1px solid" borderColor={UDEMY.border}
        boxShadow="0 1px 3px rgba(0,0,0,.06)">
        <Flex align="center" gap={{ base: '8px', md: '16px' }} maxW="1600px" mx="auto" px={{ base: '12px', md: '20px', xl: '40px' }} h="60px">
          {/* Brand */}
          <Flex as="button" align="center" gap="8px" flexShrink={0} onClick={() => go('/dashboard')}>
            <Icon as={LuGraduationCap} boxSize="26px" color={UDEMY.accent} />
            <Text fontWeight="800" fontSize="18px" color={UDEMY.ink} display={{ base: 'none', sm: 'block' }}>LMS Kelas</Text>
          </Flex>

          {/* Search */}
          <Box ref={searchRef} position="relative" flex={1} maxW={{ base: '560px', xl: '720px' }}>
            <Flex align="center" gap="8px" border="1px solid" borderColor={UDEMY.ink} borderRadius="full"
              px="14px" h="42px" bg="#F7F9FA" _focusWithin={{ bg: 'white' }}>
              <Icon as={LuSearch} color={UDEMY.ink} />
              <Input variant="subtle" border="none" bg="transparent" px="0" _focus={{ boxShadow: 'none' }}
                placeholder={t('search.placeholder')} value={q}
                onChange={(e) => { setQ(e.target.value); setSearchOpen(true) }}
                onFocus={() => setSearchOpen(true)} />
              {q && <Icon as={LuX} color={UDEMY.inkMuted} cursor="pointer" onClick={() => { setQ(''); setHits([]) }} />}
            </Flex>

            {searchOpen && q.trim() && (
              <Box position="absolute" top="48px" left={0} right={0} bg="white" border="1px solid" borderColor={UDEMY.border}
                borderRadius="10px" boxShadow="0 12px 28px rgba(0,0,0,.16)" maxH="60vh" overflowY="auto" zIndex={50}>
                {searching ? (
                  <Text p="14px" fontSize="13px" color={UDEMY.inkMuted}>Mencari…</Text>
                ) : hits.length === 0 ? (
                  <Text p="14px" fontSize="13px" color={UDEMY.inkMuted}>Tidak ada materi yang cocok.</Text>
                ) : hits.map((h) => (
                  <Flex key={h.material?.id} as="button" w="full" textAlign="left" align="flex-start" gap="10px"
                    px="14px" py="10px" borderBottom="1px solid" borderColor={UDEMY.border}
                    _hover={{ bg: UDEMY.accentTint }} onClick={() => openHit(h)}>
                    <Icon as={LuBookOpen} color={UDEMY.accent} mt="2px" flexShrink={0} />
                    <Box minW={0}>
                      <Text fontSize="13px" fontWeight="600" color={UDEMY.ink} lineClamp={1}>{h.material?.title}</Text>
                      <Flex gap="6px" align="center" mt="2px" wrap="wrap">
                        <Text fontSize="11px" color={UDEMY.inkMuted}>{h.courseName || 'Materi Umum'}</Text>
                        {h.material?.categoryName && <Badge colorPalette="purple" variant="subtle" size="sm">{h.material.categoryName}</Badge>}
                      </Flex>
                    </Box>
                  </Flex>
                ))}
              </Box>
            )}
          </Box>

          {/* Desktop nav */}
          <Flex display={{ base: 'none', lg: 'flex' }} align="center" gap="4px" flexShrink={0}>
            {LINKS.map((l) => (
              <Button key={l.path} variant="ghost" size="sm" fontSize="13px"
                color={isActive(l.path) ? UDEMY.accent : UDEMY.ink}
                fontWeight={isActive(l.path) ? 'bold' : 'medium'}
                _hover={{ bg: UDEMY.accentTint }} onClick={() => go(l.path)}>
                {t(l.key)}
              </Button>
            ))}
          </Flex>

          {/* Avatar (desktop) */}
          <Box position="relative" display={{ base: 'none', lg: 'block' }} flexShrink={0}>
            <Flex as="button" align="center" onClick={() => setAvatarOpen((v) => !v)}>
              <Avatar user={user} initials={initials} />
            </Flex>
            {avatarOpen && (
              <>
                <Box position="fixed" inset={0} zIndex={40} onClick={() => setAvatarOpen(false)} />
                <Box position="absolute" right={0} top="46px" w="200px" bg="white" border="1px solid" borderColor={UDEMY.border}
                  borderRadius="10px" boxShadow="0 12px 28px rgba(0,0,0,.16)" zIndex={50} overflow="hidden">
                  <Box px="14px" py="10px" borderBottom="1px solid" borderColor={UDEMY.border}>
                    <Text fontSize="13px" fontWeight="700" color={UDEMY.ink} lineClamp={1}>{user?.fullName || user?.username}</Text>
                    {user?.kelas && <Text fontSize="11px" color={UDEMY.inkMuted}>Kelas {user.kelas}</Text>}
                  </Box>
                  <MenuItem icon={LuSettings} label={t('nav.settings')} onClick={() => go('/pengaturan')} />
                  <MenuItem icon={LuLogOut} label={t('nav.logout')} danger onClick={() => { if (confirm('Yakin ingin keluar?')) { logout(); navigate('/login', { replace: true }) } }} />
                </Box>
              </>
            )}
          </Box>

          {/* Hamburger (mobile/tablet) */}
          <Button display={{ base: 'inline-flex', lg: 'none' }} variant="ghost" size="sm" flexShrink={0}
            onClick={() => setMenuOpen((v) => !v)} aria-label="menu">
            <Icon as={menuOpen ? LuX : LuMenu} boxSize="22px" color={UDEMY.ink} />
          </Button>
        </Flex>

        {/* Mobile drawer */}
        {menuOpen && (
          <Box display={{ base: 'block', lg: 'none' }} borderTop="1px solid" borderColor={UDEMY.border} bg="white" px="12px" py="10px">
            <Flex align="center" gap="10px" px="6px" py="8px" mb="6px" borderBottom="1px solid" borderColor={UDEMY.border}>
              <Avatar user={user} initials={initials} />
              <Box>
                <Text fontSize="14px" fontWeight="700" color={UDEMY.ink}>{user?.fullName || user?.username}</Text>
                {user?.kelas && <Text fontSize="11px" color={UDEMY.inkMuted}>Kelas {user.kelas}</Text>}
              </Box>
            </Flex>
            {LINKS.map((l) => (
              <Flex key={l.path} as="button" w="full" textAlign="left" align="center" gap="10px" px="8px" py="10px" borderRadius="8px"
                color={isActive(l.path) ? UDEMY.accent : UDEMY.ink} fontWeight={isActive(l.path) ? 'bold' : 'medium'}
                _hover={{ bg: UDEMY.accentTint }} onClick={() => go(l.path)}>
                <Icon as={l.icon} /> <Text fontSize="14px">{t(l.key)}</Text>
              </Flex>
            ))}
            <MenuItem icon={LuSettings} label={t('nav.settings')} onClick={() => go('/pengaturan')} />
            <MenuItem icon={LuLogOut} label={t('nav.logout')} danger onClick={() => { if (confirm('Yakin ingin keluar?')) { logout(); navigate('/login', { replace: true }) } }} />
          </Box>
        )}
      </Box>

      <MaterialViewer open={!!viewing} onClose={() => setViewing(null)} material={viewing} />
    </>
  )
}

function Avatar({ user, initials }: { user: { photoUrl?: string } | null; initials: string }) {
  if (user?.photoUrl) {
    return <img src={user.photoUrl} alt="foto" style={{ width: 36, height: 36, borderRadius: '9999px', objectFit: 'cover' }} />
  }
  return (
    <Flex w="36px" h="36px" borderRadius="full" bg={UDEMY.ink} color="white" align="center" justify="center" fontSize="13px" fontWeight="bold">
      {initials}
    </Flex>
  )
}

function MenuItem({ icon, label, onClick, danger }: { icon: IconType; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <Flex as="button" w="full" textAlign="left" align="center" gap="10px" px="14px" py="10px"
      color={danger ? '#DC2626' : UDEMY.ink} _hover={{ bg: danger ? '#FEE2E2' : UDEMY.accentTint }} onClick={onClick}>
      <Icon as={icon} /> <Text fontSize="14px">{label}</Text>
    </Flex>
  )
}
