import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Box, Button, Flex, Heading, Icon, SimpleGrid, Stack, Text } from '@chakra-ui/react'
import { LuBookOpen, LuGraduationCap, LuClipboardList, LuTrophy, LuInbox, LuClock, LuChevronLeft, LuChevronRight, LuQuote, LuFlame } from 'react-icons/lu'
import { timestampDate } from '@bufbuild/protobuf/wkt'
import { useAuth } from '@/hooks/useAuth'
import { Role } from '@/gen/user/v1/user_pb'
import type { TeacherDashboard } from '@/gen/dashboard/v1/dashboard_pb'
import type { Material, Category } from '@/gen/material/v1/material_pb'
import type { StoryEntry } from '@/gen/user/v1/user_pb'
import { dashboardClient, materialClient, userClient } from '@/lib/client'
import { useLang } from '@/i18n'
import AppLayout from '@/components/AppLayout'
import MaterialCard from '@/components/MaterialCard'
import MaterialViewer from '@/components/MaterialViewer'
import { Card } from '@/components/Card'
import { COLORS, UDEMY, courseGradient } from '@/theme/tokens'

function Stat({ num, label, accent }: { num: string | number; label: string; accent?: string }) {
  return (
    <Box bg={COLORS.surface} border="1px solid" borderColor={COLORS.border} borderRadius="10px" p="14px"
      textAlign="center" boxShadow="0 1px 4px rgba(0,0,0,.08)">
      <Text fontSize="26px" fontWeight="bold" color={accent ?? COLORS.primary} lineHeight="1.1">{num}</Text>
      <Text fontSize="11px" color={COLORS.muted} mt="2px">{label}</Text>
    </Box>
  )
}

function fmtDateTime(d?: Date) {
  return d ? d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-'
}

export default function DashboardPage() {
  const { user, isAuthenticated, logout, loadProfile } = useAuth()
  const navigate = useNavigate()
  const isTeacher = user?.role === Role.TEACHER || user?.role === Role.ADMIN

  const [d, setD] = useState<TeacherDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  // Student home data (Materi Umum slideshow + categories)
  const [generalMats, setGeneralMats] = useState<Material[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [activeCat, setActiveCat] = useState<string>('')
  const [slide, setSlide] = useState(0)
  const [viewing, setViewing] = useState<Material | null>(null)
  const [stories, setStories] = useState<StoryEntry[]>([])
  const [catExpanded, setCatExpanded] = useState(false)
  const [popExpanded, setPopExpanded] = useState(false)
  const [storiesExpanded, setStoriesExpanded] = useState(false)
  const { t } = useLang()

  useEffect(() => {
    if (isAuthenticated && !user) {
      loadProfile().catch(() => { logout(); navigate('/login', { replace: true }) })
    }
  }, [isAuthenticated, user, loadProfile, logout, navigate])

  const loadDash = useCallback(async () => {
    setLoading(true)
    try {
      const res = await dashboardClient.getTeacherDashboard({})
      setD(res)
    } catch {
      setD(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user && isTeacher) loadDash()
    else setLoading(false)
  }, [user, isTeacher, loadDash])

  useEffect(() => {
    if (!user || isTeacher) return
    materialClient.listMaterials({ courseId: 'general', pagination: { page: 1, pageSize: 200 } })
      .then((r) => setGeneralMats(r.materials))
      .catch(() => setGeneralMats([]))
    materialClient.listCategories({})
      .then((r) => setCategories(r.categories))
      .catch(() => setCategories([]))
    userClient.listStories({})
      .then((r) => setStories(r.stories))
      .catch(() => setStories([]))
  }, [user, isTeacher])

  // Popular = most-rated first (count, then average).
  const popular = useMemo(() => {
    return [...generalMats].sort((a, b) =>
      (b.ratingCount - a.ratingCount) || (b.avgRating - a.avgRating))
  }, [generalMats])

  // Slideshow: top general materials, auto-advancing every 5s.
  const slides = useMemo(() => generalMats.slice(0, 6), [generalMats])
  useEffect(() => {
    if (slides.length < 2) return
    const t = setInterval(() => setSlide((s) => (s + 1) % slides.length), 5000)
    return () => clearInterval(t)
  }, [slides.length])

  // Categories that actually have materials, in the order they appear.
  const catTabs = useMemo(() => {
    const present = new Map<string, string>() // id -> name
    for (const m of generalMats) {
      if (m.categoryId && m.categoryName && !present.has(m.categoryId)) present.set(m.categoryId, m.categoryName)
    }
    const known = categories.filter((c) => present.has(c.id)).map((c) => ({ id: c.id, name: c.name }))
    // include any category present on materials but missing from the categories list
    for (const [id, name] of present) if (!known.some((k) => k.id === id)) known.push({ id, name })
    // materials without a category go under a virtual "Lainnya" tab
    if (generalMats.some((m) => !m.categoryId)) known.push({ id: '__none__', name: 'Lainnya' })
    return known
  }, [generalMats, categories])

  useEffect(() => {
    if (catTabs.length > 0 && !catTabs.some((c) => c.id === activeCat)) setActiveCat(catTabs[0].id)
  }, [catTabs, activeCat])

  const catMaterials = useMemo(() => {
    if (activeCat === '__none__') return generalMats.filter((m) => !m.categoryId)
    return generalMats.filter((m) => m.categoryId === activeCat)
  }, [generalMats, activeCat])
  const activeCatName = catTabs.find((c) => c.id === activeCat)?.name || 'kategori'

  // Show one row by default; reveal the rest with a "show all" toggle.
  const ROW_LIMIT = 5

  // ── Student view (Udemy-style) ──
  if (user && !isTeacher) {
    const current = slides[slide]
    return (
      <AppLayout title="">
        <Stack gap="22px">
          {/* Slideshow — Materi Umum */}
          {current && (
            <Box position="relative" borderRadius="14px" overflow="hidden" h={{ base: '260px', md: '380px' }}
              style={{ background: current.coverImage ? undefined : courseGradient(current.title) }}>
              {current.coverImage && (
                <>
                  <Box position="absolute" inset={0} bgImage={`url(${current.coverImage})`} bgSize="cover" bgPos="center" />
                  <Box position="absolute" inset={0} bg="blackAlpha.600" />
                </>
              )}
              <Flex position="relative" direction="column" justify="flex-end" h="full" p={{ base: '18px', md: '30px' }} color="white">
                <Text fontSize="12px" color="whiteAlpha.800" mb="2px">✦ {t('nav.materials')}</Text>
                <Heading fontSize={{ base: '20px', md: '30px' }} fontWeight="800" lineClamp={2} maxW="640px">{current.title}</Heading>
                {current.description && <Text fontSize="13px" color="whiteAlpha.900" mt="6px" lineClamp={2} maxW="560px" display={{ base: 'none', sm: 'block' }}>{current.description}</Text>}
                <Button size="sm" mt="14px" w="fit-content" bg="white" color={UDEMY.ink} _hover={{ bg: 'whiteAlpha.900' }} onClick={() => setViewing(current)}>
                  <Icon as={LuBookOpen} /> {t('home.readMaterial')}
                </Button>
              </Flex>
              {slides.length > 1 && (
                <>
                  <Flex as="button" position="absolute" top="50%" left="10px" transform="translateY(-50%)" w="34px" h="34px"
                    borderRadius="full" bg="whiteAlpha.800" align="center" justify="center" color={UDEMY.ink}
                    onClick={() => setSlide((s) => (s - 1 + slides.length) % slides.length)}><Icon as={LuChevronLeft} boxSize="20px" /></Flex>
                  <Flex as="button" position="absolute" top="50%" right="10px" transform="translateY(-50%)" w="34px" h="34px"
                    borderRadius="full" bg="whiteAlpha.800" align="center" justify="center" color={UDEMY.ink}
                    onClick={() => setSlide((s) => (s + 1) % slides.length)}><Icon as={LuChevronRight} boxSize="20px" /></Flex>
                  <Flex position="absolute" bottom="10px" left="50%" transform="translateX(-50%)" gap="6px">
                    {slides.map((_, i) => (
                      <Box key={i} as="button" w="8px" h="8px" borderRadius="full"
                        bg={i === slide ? 'white' : 'whiteAlpha.500'} onClick={() => setSlide(i)} />
                    ))}
                  </Flex>
                </>
              )}
            </Box>
          )}

          {/* Quick links */}
          <SimpleGrid columns={{ base: 1, md: 3 }} gap="12px">
            {[
              { icon: LuBookOpen, title: t('nav.courses'), desc: t('home.quick.subjects'), to: '/courses' },
              { icon: LuClipboardList, title: t('nav.tasks'), desc: t('home.quick.tasks'), to: '/tugas' },
              { icon: LuTrophy, title: t('nav.grades'), desc: t('home.quick.grades'), to: '/nilai' },
            ].map((q) => (
              <Card key={q.to}>
                <Flex gap="12px" align="center" cursor="pointer" onClick={() => navigate(q.to)}>
                  <Flex w="40px" h="40px" borderRadius="10px" bg={UDEMY.accentTint} align="center" justify="center">
                    <Icon as={q.icon} boxSize="22px" color={UDEMY.accent} />
                  </Flex>
                  <Box>
                    <Text fontWeight="semibold" color={UDEMY.ink}>{q.title}</Text>
                    <Text fontSize="12px" color={UDEMY.inkMuted}>{q.desc}</Text>
                  </Box>
                </Flex>
              </Card>
            ))}
          </SimpleGrid>

          {/* Category tabs + materials (Materi Umum) */}
          <Box>
            <Heading fontSize="18px" fontWeight="800" color={UDEMY.ink} mb="10px">{t('home.exploreGeneral')}</Heading>
            {catTabs.length === 0 ? (
              <Text fontSize="13px" color={UDEMY.inkMuted}>{t('home.noGeneral')}</Text>
            ) : (
              <>
                <Flex gap="18px" borderBottom="1px solid" borderColor={UDEMY.border} mb="16px" overflowX="auto">
                  {catTabs.map((c) => (
                    <Box key={c.id} as="button" pb="10px" whiteSpace="nowrap" flexShrink={0}
                      borderBottom="2px solid" borderColor={activeCat === c.id ? UDEMY.ink : 'transparent'}
                      color={activeCat === c.id ? UDEMY.ink : UDEMY.inkMuted}
                      fontWeight={activeCat === c.id ? 'bold' : 'medium'} fontSize="14px"
                      onClick={() => { setActiveCat(c.id); setCatExpanded(false) }}>{c.name}</Box>
                  ))}
                </Flex>
                {catMaterials.length === 0 ? (
                  <Text fontSize="13px" color={UDEMY.inkMuted}>{t('home.noneInCat')}</Text>
                ) : (
                  <>
                    <SimpleGrid columns={{ base: 2, md: 3, lg: 4, xl: 5 }} gap="16px">
                      {(catExpanded ? catMaterials : catMaterials.slice(0, ROW_LIMIT)).map((m) => (
                        <MaterialCard key={m.id} material={m} onClick={() => setViewing(m)} />
                      ))}
                    </SimpleGrid>
                    {catMaterials.length > ROW_LIMIT && (
                      <Button variant="outline" size="sm" mt="14px" borderColor={UDEMY.accent} color={UDEMY.accent}
                        _hover={{ bg: UDEMY.accentTint }} onClick={() => setCatExpanded((v) => !v)}>
                        {catExpanded ? t('home.hide') : `${t('home.showAll')} "${activeCatName}" (${catMaterials.length})`}
                      </Button>
                    )}
                  </>
                )}
              </>
            )}
          </Box>

          {/* Materi Populer */}
          {popular.length > 0 && (
            <Box>
              <Heading fontSize="18px" fontWeight="800" color={UDEMY.ink} mb="12px" display="flex" alignItems="center" gap="8px">
                <Icon as={LuFlame} color={UDEMY.accent} /> {t('home.popular')}
              </Heading>
              <SimpleGrid columns={{ base: 2, md: 3, lg: 4, xl: 5 }} gap="16px">
                {(popExpanded ? popular : popular.slice(0, ROW_LIMIT)).map((m) => (
                  <MaterialCard key={m.id} material={m} onClick={() => setViewing(m)} />
                ))}
              </SimpleGrid>
              {popular.length > ROW_LIMIT && (
                <Button variant="outline" size="sm" mt="14px" borderColor={UDEMY.accent} color={UDEMY.accent}
                  _hover={{ bg: UDEMY.accentTint }} onClick={() => setPopExpanded((v) => !v)}>
                  {popExpanded ? t('home.hide') : `${t('home.showAllPopular')} (${popular.length})`}
                </Button>
              )}
            </Box>
          )}

          {/* Cerita pengguna — tampil 2 baris, sisanya via "Lihat semua cerita" */}
          {stories.length > 0 && (
            <Box>
              <Heading fontSize="20px" fontWeight="800" color={UDEMY.ink} mb="4px">
                {t('home.storiesTitle')}
              </Heading>
              <Text fontSize="13px" color={UDEMY.inkMuted} mb="14px">{t('home.storiesSub')}</Text>
              <SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} gap="16px">
                {(storiesExpanded ? stories : stories.slice(0, 8)).map((s) => (
                  <Box key={s.userId} border="1px solid" borderColor={UDEMY.border} borderRadius="10px" p="16px" bg="white"
                    display="flex" flexDirection="column">
                    <Icon as={LuQuote} boxSize="22px" color={UDEMY.ink} mb="8px" />
                    <Text fontSize="13px" color={UDEMY.ink} flex={1} lineHeight="1.5">{s.story}</Text>
                    <Flex align="center" gap="10px" mt="14px">
                      {s.photoUrl ? (
                        <img src={s.photoUrl} alt="" style={{ width: 40, height: 40, borderRadius: '9999px', objectFit: 'cover' }} />
                      ) : (
                        <Flex w="40px" h="40px" borderRadius="full" bg={UDEMY.accentTint} color={UDEMY.accent} align="center" justify="center" fontWeight="bold" fontSize="14px">
                          {(s.fullName || '?').trim().charAt(0).toUpperCase()}
                        </Flex>
                      )}
                      <Box minW={0}>
                        <Text fontSize="13px" fontWeight="700" color={UDEMY.ink} lineClamp={1}>{s.fullName}</Text>
                        <Text fontSize="11px" color={UDEMY.inkMuted} lineClamp={1}>
                          {s.role === 'teacher' ? 'Guru' : s.role === 'admin' ? 'Admin' : 'Siswa'}{s.kelas ? ` · ${s.kelas}` : ''}
                        </Text>
                      </Box>
                    </Flex>
                  </Box>
                ))}
              </SimpleGrid>
              {stories.length > 8 && (
                <Button variant="ghost" size="sm" mt="14px" color={UDEMY.accent} fontWeight="bold"
                  onClick={() => setStoriesExpanded((v) => !v)}>
                  {storiesExpanded ? t('home.hide') : `${t('home.seeAllStories')} (${stories.length})`}
                </Button>
              )}
            </Box>
          )}

          {/* Promo sertifikasi (gaya Udemy) */}
          <Box borderRadius="14px" bg={UDEMY.ink} color="white" p={{ base: '22px', md: '34px' }}>
            <SimpleGrid columns={{ base: 1, md: 2 }} gap="24px" alignItems="center">
              <Box>
                <Heading fontSize={{ base: '22px', md: '26px' }} fontWeight="800" lineHeight="1.2">{t('promo.title')}</Heading>
                <Text fontSize="14px" color="whiteAlpha.800" mt="10px" maxW="440px">{t('promo.desc')}</Text>
                <Button mt="18px" variant="outline" color="white" borderColor="whiteAlpha.500"
                  _hover={{ bg: 'whiteAlpha.200' }} onClick={() => navigate('/materi')}>
                  {t('promo.cta')} <Icon as={LuChevronRight} />
                </Button>
              </Box>
              <SimpleGrid columns={{ base: 1, sm: 3 }} gap="12px">
                {[
                  { t: t('promo.c1.t'), d: t('promo.c1.d'), g: courseGradient('Jaringan') },
                  { t: t('promo.c2.t'), d: t('promo.c2.d'), g: courseGradient('Keamanan') },
                  { t: t('promo.c3.t'), d: t('promo.c3.d'), g: courseGradient('Server') },
                ].map((c) => (
                  <Box key={c.t} bg={UDEMY.inkSoft} borderRadius="10px" overflow="hidden">
                    <Flex h="70px" align="center" justify="center" style={{ background: c.g }}>
                      <Icon as={LuBookOpen} boxSize="26px" color="whiteAlpha.900" />
                    </Flex>
                    <Box p="12px">
                      <Text fontWeight="700" fontSize="14px">{c.t}</Text>
                      <Text fontSize="11px" color="whiteAlpha.700" mt="2px">{c.d}</Text>
                    </Box>
                  </Box>
                ))}
              </SimpleGrid>
            </SimpleGrid>
          </Box>
        </Stack>

        <MaterialViewer open={!!viewing} onClose={() => setViewing(null)} material={viewing} />
      </AppLayout>
    )
  }

  // ── Teacher view (full dashboard) ──
  return (
    <AppLayout
      title={`Selamat datang, ${user?.fullName || user?.username || ''}!`}
      subtitle="Ringkasan aktivitas kelas Anda"
    >
      {loading ? (
        <Text color={COLORS.muted}>Memuat statistik…</Text>
      ) : !d ? (
        <Text color={COLORS.danger}>Gagal memuat statistik.</Text>
      ) : (
        <Stack gap="16px">
          {/* Primary stats */}
          <SimpleGrid columns={{ base: 2, md: 4 }} gap="12px">
            <Stat num={d.totalKelas} label="Total Kelas" accent={COLORS.primary} />
            <Stat num={d.totalSiswa} label="Total Siswa" accent={COLORS.success} />
            <Stat num={d.totalMateri} label="Total Materi" accent="#7C3AED" />
            <Stat num={d.totalTugas} label="Total Tugas" accent={COLORS.warning} />
          </SimpleGrid>

          {/* Submission stats */}
          <SimpleGrid columns={{ base: 2, md: 4 }} gap="12px">
            <Stat num={d.totalPengumpulan} label="Tugas Terkumpul" accent={COLORS.success} />
            <Stat num={d.belumKumpul} label="Belum Kumpul" accent={COLORS.danger} />
            <Stat num={d.perluDinilai} label="Perlu Dinilai" accent={COLORS.warning} />
            <Stat num={d.rataRataNilai ? d.rataRataNilai.toFixed(1) : '–'} label="Rata-rata Nilai" accent={COLORS.primary} />
          </SimpleGrid>

          <SimpleGrid columns={{ base: 1, lg: 2 }} gap="16px">
            {/* Students per major */}
            <Card title={<><Icon as={LuGraduationCap} /> Siswa per Jurusan</>}>
              {d.siswaPerJurusan.length === 0 ? (
                <Text fontSize="13px" color={COLORS.muted}>Belum ada data.</Text>
              ) : (
                <Stack gap="8px">
                  {d.siswaPerJurusan.map((j) => {
                    const pct = d.totalSiswa ? (j.count / d.totalSiswa) * 100 : 0
                    return (
                      <Box key={j.jurusan}>
                        <Flex justify="space-between" fontSize="12px" mb="2px">
                          <Text fontWeight="medium">{j.jurusan}</Text>
                          <Text color={COLORS.muted}>{j.count} siswa</Text>
                        </Flex>
                        <Box h="8px" bg={COLORS.bg} borderRadius="99px" overflow="hidden">
                          <Box h="100%" bg={COLORS.primary} w={`${pct}%`} />
                        </Box>
                      </Box>
                    )
                  })}
                </Stack>
              )}
            </Card>

            {/* Materials status */}
            <Card title={<><Icon as={LuBookOpen} /> Status Materi</>}>
              <SimpleGrid columns={2} gap="12px">
                <Box textAlign="center" bg={COLORS.bg} borderRadius="8px" p="14px">
                  <Text fontSize="24px" fontWeight="bold" color={COLORS.success}>{d.materiPublikasi}</Text>
                  <Text fontSize="11px" color={COLORS.muted}>Dipublikasi</Text>
                </Box>
                <Box textAlign="center" bg={COLORS.bg} borderRadius="8px" p="14px">
                  <Text fontSize="24px" fontWeight="bold" color={COLORS.warning}>{d.materiDraft}</Text>
                  <Text fontSize="11px" color={COLORS.muted}>Draft</Text>
                </Box>
              </SimpleGrid>
            </Card>
          </SimpleGrid>

          {/* Recent lists */}
          <SimpleGrid columns={{ base: 1, lg: 2 }} gap="16px">
            <Card title={<><Icon as={LuClipboardList} /> Tugas Terbaru</>}>
              {d.tugasTerbaru.length === 0 ? (
                <Text fontSize="13px" color={COLORS.muted}>Belum ada tugas.</Text>
              ) : (
                <Stack gap="8px">
                  {d.tugasTerbaru.map((t) => {
                    const dl = t.deadline ? timestampDate(t.deadline) : undefined
                    return (
                      <Flex key={t.id} justify="space-between" align="center"
                        borderBottom="1px solid" borderColor={COLORS.border} pb="8px">
                        <Box>
                          <Text fontSize="13px" fontWeight="medium">{t.title}</Text>
                          <Text fontSize="11px" color={COLORS.muted} display="flex" alignItems="center" gap="3px">{t.courseName} · <Icon as={LuClock} /> {fmtDateTime(dl)}</Text>
                        </Box>
                        <Badge colorPalette="blue">{t.submissionCount} <Icon as={LuInbox} /></Badge>
                      </Flex>
                    )
                  })}
                </Stack>
              )}
            </Card>

            <Card title={<><Icon as={LuInbox} /> Pengumpulan Terbaru</>}>
              {d.pengumpulanTerbaru.length === 0 ? (
                <Text fontSize="13px" color={COLORS.muted}>Belum ada pengumpulan.</Text>
              ) : (
                <Stack gap="8px">
                  {d.pengumpulanTerbaru.map((p, i) => {
                    const at = p.submittedAt ? timestampDate(p.submittedAt) : undefined
                    return (
                      <Flex key={i} justify="space-between" align="center"
                        borderBottom="1px solid" borderColor={COLORS.border} pb="8px">
                        <Box>
                          <Text fontSize="13px" fontWeight="medium">
                            {p.studentName} {p.kelas && <Badge colorPalette="gray">{p.kelas}</Badge>}
                          </Text>
                          <Text fontSize="11px" color={COLORS.muted}>{p.assignmentTitle} · {fmtDateTime(at)}</Text>
                        </Box>
                        <Badge colorPalette={p.graded ? 'green' : 'yellow'}>{p.graded ? 'Dinilai' : 'Belum'}</Badge>
                      </Flex>
                    )
                  })}
                </Stack>
              )}
            </Card>
          </SimpleGrid>
        </Stack>
      )}
    </AppLayout>
  )
}
