import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Badge, Box, Button, Field, Flex, Heading, Icon, IconButton, Image, Input, SimpleGrid, Spinner, Stack, Text } from '@chakra-ui/react'
import {
  LuGraduationCap, LuLogIn, LuBuilding2, LuTarget, LuListChecks, LuUserRound, LuMail, LuMessageCircle,
  LuMapPin, LuCalendar, LuBadgeCheck, LuHash, LuBookOpen, LuClipboardList, LuQrCode, LuTrophy, LuCheck,
  LuVideo, LuMegaphone, LuFileText, LuExternalLink, LuUsers, LuUser,
  LuImages, LuNewspaper, LuCalendarDays, LuPlay, LuEye, LuEyeOff,
} from 'react-icons/lu'
import { schoolClient } from '@/lib/client'
import type { School, Staff, ContentItem } from '@/gen/school/v1/school_pb'
import { useAuth } from '@/hooks/useAuth'
import LandingSlideshow, { type Slide } from '@/components/LandingSlideshow'
import { COLORS, UDEMY } from '@/theme/tokens'

const waLink = (no: string) => {
  let n = (no || '').replace(/\D/g, '')
  if (n.startsWith('0')) n = '62' + n.slice(1)
  return n ? `https://wa.me/${n}` : ''
}
const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
// Convert a YouTube watch/short link to an embeddable URL ('' if not YouTube).
const ytEmbed = (url: string) => {
  const m = (url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([\w-]{11})/)
  return m ? `https://www.youtube.com/embed/${m[1]}` : ''
}
const isUrl = (v: string) => /^https?:\/\//i.test((v || '').trim())

const FEATURES = [
  { icon: LuBookOpen, label: 'Materi' },
  { icon: LuClipboardList, label: 'Tugas & Kuis' },
  { icon: LuQrCode, label: 'Absensi' },
  { icon: LuTrophy, label: 'Nilai' },
]

export default function LandingPage() {
  const { isAuthenticated, login } = useAuth()
  const navigate = useNavigate()
  const [s, setS] = useState<School | null>(null)
  const [staff, setStaff] = useState<Staff[]>([])
  const [galFoto, setGalFoto] = useState<ContentItem[]>([])
  const [galVideo, setGalVideo] = useState<ContentItem[]>([])
  const [jurusan, setJurusan] = useState<ContentItem[]>([])
  const [berita, setBerita] = useState<ContentItem[]>([])
  const [pengumuman, setPengumuman] = useState<ContentItem[]>([])
  const [agenda, setAgenda] = useState<ContentItem[]>([])
  const [kelulusan, setKelulusan] = useState<ContentItem[]>([])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const load = (t: string, set: (v: ContentItem[]) => void) =>
      schoolClient.listContent({ type: t }).then((r) => set(r.items)).catch(() => {})
    // Wait for the initial reads to settle before revealing the page, so a
    // refresh shows a loader instead of the empty "no data" fallback flashing in.
    Promise.allSettled([
      schoolClient.getSchool({}).then(setS),
      schoolClient.listStaff({}).then((r) => setStaff(r.staff)),
      load('galeri_foto', setGalFoto),
      load('galeri_video', setGalVideo),
      load('jurusan', setJurusan),
      load('berita', setBerita),
      load('pengumuman', setPengumuman),
      load('agenda', setAgenda),
      load('kelulusan', setKelulusan),
    ]).finally(() => setLoaded(true))
  }, [])

  // Slideshow: pengumuman & berita terbaru (maks 6). State/timer live inside
  // <LandingSlideshow> so advancing a slide doesn't re-render this whole page.
  const slides = useMemo<Slide[]>(() => {
    const b = berita.map((x) => ({ kind: 'Berita', icon: LuNewspaper, anchor: 'berita', title: x.title, body: x.body, meta: '', image: x.image }))
    const p = pengumuman.map((x) => ({ kind: 'Pengumuman', icon: LuMegaphone, anchor: 'akademik', title: x.title, body: x.body, meta: x.subtitle, image: x.image }))
    return [...p, ...b].slice(0, 6)
  }, [pengumuman, berita])

  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  if (!loaded) return (
    <Flex minH="100vh" align="center" justify="center" bg={COLORS.bg}><Spinner size="xl" color={UDEMY.accent} /></Flex>
  )

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true)
    try { await login(email, password); navigate('/dashboard', { replace: true }) }
    catch (err: unknown) { setError(err instanceof Error ? err.message : 'Login gagal. Periksa email dan password.') }
    finally { setLoading(false) }
  }

  const title = s?.appName || s?.name || 'LMS Sekolah'
  const misiList = (s?.misi || '').split('\n').map((m) => m.trim()).filter(Boolean)
  const identitas = [
    { icon: LuHash, label: 'NPSN', value: s?.npsn },
    { icon: LuBadgeCheck, label: 'Status', value: s?.status },
    { icon: LuBadgeCheck, label: 'Akreditasi', value: s?.akreditasi },
    { icon: LuGraduationCap, label: 'Jenjang', value: s?.jenjang },
    { icon: LuCalendar, label: 'Tahun Berdiri', value: s?.tahunBerdiri },
  ].filter((x) => x.value)
  const hasProfil = !!(s?.profil || s?.profilImage || s?.profilVideo)
  const hasVisiMisi = !!s?.visi || misiList.length > 0
  const hasKontak = !!(s?.email || s?.whatsapp || s?.address || s?.mapsUrl)
  const ppdbAktif = s?.ppdbAktif === '1'
  const mapQuery = (s?.mapsUrl || s?.address || '').trim()
  const mapClick = s?.mapsUrl || (mapQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}` : '')
  const hasGaleri = galFoto.length > 0 || galVideo.length > 0
  const hasAkademik = pengumuman.length > 0 || agenda.length > 0 || kelulusan.length > 0

  const navLinks = [
    { id: 'top', label: 'Beranda' },
    ...(hasProfil ? [{ id: 'profil', label: 'Profil' }] : []),
    ...(jurusan.length ? [{ id: 'jurusan', label: 'Jurusan' }] : []),
    ...(staff.length ? [{ id: 'staf', label: 'Guru & Staf' }] : []),
    ...(hasGaleri ? [{ id: 'galeri', label: 'Galeri' }] : []),
    ...(berita.length ? [{ id: 'berita', label: 'Berita' }] : []),
    ...(hasAkademik ? [{ id: 'akademik', label: 'Akademik' }] : []),
    ...(hasVisiMisi ? [{ id: 'visimisi', label: 'Visi & Misi' }] : []),
    ...(ppdbAktif ? [{ id: 'ppdb', label: 'PPDB' }] : []),
    ...(hasKontak ? [{ id: 'kontak', label: 'Kontak' }] : []),
  ]

  const SectionHead = ({ icon, kicker, title: t }: { icon: typeof LuMail; kicker: string; title: string }) => (
    <Stack gap="4px" mb="20px">
      <Flex align="center" gap="6px" color={UDEMY.accent}><Icon as={icon} boxSize="16px" /><Text fontSize="12px" fontWeight="700" letterSpacing="1px" textTransform="uppercase">{kicker}</Text></Flex>
      <Heading size="lg" color={COLORS.text}>{t}</Heading>
    </Stack>
  )
  const Section = ({ id, children, alt }: { id?: string; children: React.ReactNode; alt?: boolean }) => (
    <Box id={id} bg={alt ? COLORS.surface : 'transparent'} borderY={alt ? '1px solid' : undefined} borderColor={COLORS.border} py={{ base: '44px', md: '64px' }}>
      <Box w="full" px={{ base: '20px', md: '40px', xl: '64px' }}>{children}</Box>
    </Box>
  )

  return (
    <Box minH="100vh" bg={COLORS.bg}>
      {/* Sticky nav */}
      <Flex align="center" px={{ base: '20px', md: '40px', xl: '64px' }} h="64px" bg="rgba(255,255,255,0.9)" backdropFilter="blur(8px)"
        borderBottom="1px solid" borderColor={COLORS.border} position="sticky" top={0} zIndex={20}>
        <Flex align="center" gap="10px" flex={1} cursor="pointer" onClick={() => scrollTo('top')}>
          {s?.logo ? <Image src={s.logo} alt="logo" boxSize="32px" objectFit="contain" /> : <Icon as={LuGraduationCap} boxSize="26px" color={UDEMY.accent} />}
          <Text fontWeight="800" fontSize="17px" color={COLORS.text}>{title}</Text>
        </Flex>
        <Flex gap="4px" display={{ base: 'none', md: 'flex' }} mr="10px">
          {navLinks.map((l) => (
            <Button key={l.id} variant="ghost" size="sm" color={COLORS.muted} _hover={{ color: COLORS.text, bg: COLORS.bg }} onClick={() => scrollTo(l.id)}>{l.label}</Button>
          ))}
        </Flex>
        <Button size="sm" bg={UDEMY.accent} color="white" fontWeight="bold" _hover={{ bg: UDEMY.accentDark }} onClick={() => scrollTo('masuk')}>
          <Icon as={LuLogIn} /> Masuk
        </Button>
      </Flex>

      {/* Slideshow — pengumuman & berita terbaru */}
      <LandingSlideshow slides={slides} />

      {/* Hero + login menyatu */}
      <Box id="top" position="relative" overflow="hidden"
        style={{ background: `linear-gradient(160deg, ${COLORS.bg} 0%, ${UDEMY.accentTint} 100%)` }}>
        <Box w="full" px={{ base: '20px', md: '40px', xl: '64px' }} py={{ base: '40px', md: '72px' }}>
          <Flex gap={{ base: '32px', md: '48px' }} direction={{ base: 'column', lg: 'row' }} align="center">
            {/* Left: pitch */}
            <Stack gap="18px" flex={1.2}>
              <Flex gap="8px" wrap="wrap">
                {s?.jenjang && <Badge colorPalette="purple">{s.jenjang}</Badge>}
                {s?.status && <Badge variant="outline">{s.status}</Badge>}
                {s?.akreditasi && <Badge colorPalette="green"><Icon as={LuCheck} /> Akreditasi {s.akreditasi}</Badge>}
              </Flex>
              <Heading fontSize={{ base: '34px', md: '52px' }} fontWeight="800" lineHeight="1.05" color={COLORS.text}>
                {s?.name || title}
              </Heading>
              <Text fontSize={{ base: '16px', md: '18px' }} color={COLORS.muted} maxW="520px">
                {s?.appName ? `${s.appName} — ` : ''}Portal belajar sekolah: materi, tugas, kuis, absensi, dan nilai dalam satu tempat.
              </Text>
              {s?.address && <Flex align="center" gap="6px" color={COLORS.muted} fontSize="14px"><Icon as={LuMapPin} /> {s.address}</Flex>}
              <SimpleGrid columns={{ base: 2, sm: 4 }} gap="10px" maxW="520px" mt="6px">
                {FEATURES.map((f) => (
                  <Flex key={f.label} align="center" gap="8px" bg={COLORS.surface} border="1px solid" borderColor={COLORS.border} borderRadius="10px" px="10px" py="8px">
                    <Icon as={f.icon} color={UDEMY.accent} boxSize="16px" /><Text fontSize="12px" fontWeight="600" color={COLORS.text}>{f.label}</Text>
                  </Flex>
                ))}
              </SimpleGrid>
            </Stack>

            {/* Right: login card */}
            <Box id="masuk" as="form" onSubmit={submit} w="full" maxW="380px"
              bg={COLORS.surface} border="1px solid" borderColor={COLORS.border} borderRadius="16px" p="24px" boxShadow="0 12px 40px rgba(0,0,0,0.08)">
              <Stack gap="16px">
                <Box>
                  <Heading size="md" color={COLORS.text}>Masuk ke akunmu</Heading>
                  <Text fontSize="13px" color={COLORS.muted} mt="2px">Gunakan akun yang diberikan sekolah.</Text>
                </Box>
                {error && <Box bg="#FEE2E2" color="#991B1B" px="12px" py="9px" borderRadius="8px" fontSize="13px">{error}</Box>}
                <Field.Root>
                  <Field.Label fontSize="13px">Email</Field.Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@sekolah.sch.id" required autoComplete="email" />
                </Field.Root>
                <Field.Root>
                  <Field.Label fontSize="13px">Password</Field.Label>
                  <Box position="relative" w="full">
                    <Input type={showPass ? 'text' : 'password'} pr="44px" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password" />
                    <IconButton type="button" aria-label={showPass ? 'Sembunyikan password' : 'Tampilkan password'}
                      onClick={() => setShowPass((v) => !v)} variant="ghost" size="sm"
                      position="absolute" top="50%" right="6px" transform="translateY(-50%)"
                      color={COLORS.muted} _hover={{ color: COLORS.text, bg: 'transparent' }}>
                      <Icon as={showPass ? LuEyeOff : LuEye} boxSize="18px" />
                    </IconButton>
                  </Box>
                </Field.Root>
                <Button type="submit" loading={loading} w="full" bg={UDEMY.accent} color="white" fontWeight="bold" _hover={{ bg: UDEMY.accentDark }}>
                  <Icon as={LuLogIn} /> Masuk
                </Button>
                <Text fontSize="11px" color={COLORS.muted} textAlign="center">Belum punya akun? Hubungi guru / admin sekolah.</Text>
              </Stack>
            </Box>
          </Flex>
        </Box>
      </Box>

      {/* Identitas */}
      {identitas.length > 0 && (
        <Section id="identitas">
          <SectionHead icon={LuBadgeCheck} kicker="Profil Singkat" title="Identitas Sekolah" />
          <SimpleGrid columns={{ base: 2, md: identitas.length > 4 ? 5 : identitas.length }} gap="12px">
            {identitas.map((x) => (
              <Box key={x.label} bg={COLORS.surface} border="1px solid" borderColor={COLORS.border} borderRadius="12px" p="16px" textAlign="center">
                <Icon as={x.icon} boxSize="20px" color={UDEMY.accent} />
                <Text fontSize="11px" color={COLORS.muted} mt="6px">{x.label}</Text>
                <Text fontSize="15px" fontWeight="700" color={COLORS.text}>{x.value}</Text>
              </Box>
            ))}
          </SimpleGrid>
        </Section>
      )}

      {/* Profil */}
      {hasProfil && (
        <Section id="profil" alt>
          <SectionHead icon={LuBuilding2} kicker="Tentang" title="Profil Sekolah" />
          <Flex gap="24px" direction={{ base: 'column', md: 'row' }} align="flex-start">
            <Stack gap="18px" flex={1}>
              {s?.profil && <Text color={COLORS.text} whiteSpace="pre-wrap" lineHeight="1.8">{s.profil}</Text>}
              {s?.kepalaSekolah && (
                <Flex align="center" gap="14px" bg={COLORS.bg} border="1px solid" borderColor={COLORS.border} borderRadius="14px" p="16px" maxW="440px">
                  {s.kepalaSekolahFoto
                    ? <Image src={s.kepalaSekolahFoto} alt="Kepala Sekolah" boxSize="56px" borderRadius="full" objectFit="cover" border="1px solid" borderColor={COLORS.border} />
                    : <Flex boxSize="48px" borderRadius="full" bg={UDEMY.accentTint} align="center" justify="center"><Icon as={LuUserRound} boxSize="24px" color={UDEMY.accentDark} /></Flex>}
                  <Box><Text fontSize="12px" color={COLORS.muted}>Kepala Sekolah</Text><Text fontSize="17px" fontWeight="700" color={COLORS.text}>{s.kepalaSekolah}</Text></Box>
                </Flex>
              )}
            </Stack>
            {(s?.profilImage || s?.profilVideo) && (
              <Stack gap="14px" w={{ base: 'full', md: '400px' }} flexShrink={0}>
                {s?.profilImage && <Image src={s.profilImage} alt="foto sekolah" w="full" maxH="260px" objectFit="cover" borderRadius="14px" border="1px solid" borderColor={COLORS.border} />}
                {ytEmbed(s?.profilVideo || '') ? (
                  <Box position="relative" pb="56.25%" h={0} borderRadius="14px" overflow="hidden" border="1px solid" borderColor={COLORS.border}>
                    <iframe src={ytEmbed(s!.profilVideo)} title="Video Profil" allowFullScreen
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
                  </Box>
                ) : s?.profilVideo ? (
                  <Button as="a" variant="outline" {...{ href: s.profilVideo, target: '_blank', rel: 'noopener' }}><Icon as={LuVideo} /> Tonton Video</Button>
                ) : null}
              </Stack>
            )}
          </Flex>
        </Section>
      )}

      {/* Guru & Tata Usaha */}
      {staff.length > 0 && (
        <Section id="staf">
          <SectionHead icon={LuUsers} kicker="Tenaga Pendidik & Kependidikan" title="Guru & Tata Usaha" />
          <SimpleGrid columns={{ base: 2, sm: 3, md: 4, lg: 5 }} gap="16px">
            {staff.map((st) => (
              <Box key={st.id} bg={COLORS.surface} border="1px solid" borderColor={COLORS.border} borderRadius="14px" p="16px" textAlign="center">
                {st.foto
                  ? <Image src={st.foto} alt={st.nama} boxSize="80px" mx="auto" borderRadius="full" objectFit="cover" border="2px solid" borderColor={COLORS.border} />
                  : <Flex boxSize="80px" mx="auto" borderRadius="full" bg={UDEMY.accentTint} align="center" justify="center"><Icon as={LuUser} boxSize="34px" color={UDEMY.accentDark} /></Flex>}
                <Text fontSize="14px" fontWeight="700" color={COLORS.text} mt="10px" lineHeight="1.2">{st.nama}</Text>
                {st.jabatan && <Text fontSize="12px" color={COLORS.muted} mt="2px">{st.jabatan}</Text>}
              </Box>
            ))}
          </SimpleGrid>
        </Section>
      )}

      {/* Jurusan */}
      {jurusan.length > 0 && (
        <Section id="jurusan" alt>
          <SectionHead icon={LuGraduationCap} kicker="Kompetensi Keahlian" title="Jurusan Smekisda" />
          <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} gap="20px">
            {jurusan.map((j) => (
              <Box key={j.id} bg={COLORS.surface} border="1px solid" borderColor={COLORS.border} borderRadius="14px" overflow="hidden">
                {j.image
                  ? <Image src={j.image} alt={j.title} w="full" h="160px" objectFit="cover" />
                  : <Flex w="full" h="160px" bg={UDEMY.accentTint} align="center" justify="center"><Icon as={LuGraduationCap} boxSize="40px" color={UDEMY.accentDark} /></Flex>}
                <Box p="16px">
                  <Heading size="sm" color={COLORS.text}>{j.title}</Heading>
                  {j.body && <Text fontSize="13px" color={COLORS.muted} mt="6px" lineHeight="1.6" whiteSpace="pre-wrap">{j.body}</Text>}
                </Box>
              </Box>
            ))}
          </SimpleGrid>
        </Section>
      )}

      {/* Galeri */}
      {hasGaleri && (
        <Section id="galeri">
          <SectionHead icon={LuImages} kicker="Dokumentasi" title="Galeri" />
          {galFoto.length > 0 && (
            <SimpleGrid columns={{ base: 2, sm: 3, md: 4 }} gap="12px" mb={galVideo.length ? '28px' : '0'}>
              {galFoto.map((g) => (
                <Box key={g.id} borderRadius="12px" overflow="hidden" border="1px solid" borderColor={COLORS.border} position="relative">
                  <Image src={g.image} alt={g.title || 'Foto'} w="full" h="150px" objectFit="cover" />
                  {g.title && <Box position="absolute" bottom={0} left={0} right={0} bg="rgba(0,0,0,0.55)" color="white" fontSize="11px" px="8px" py="5px">{g.title}</Box>}
                </Box>
              ))}
            </SimpleGrid>
          )}
          {galVideo.length > 0 && (
            <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} gap="16px">
              {galVideo.map((v) => {
                const emb = ytEmbed(v.url)
                return (
                  <Box key={v.id} borderRadius="12px" overflow="hidden" border="1px solid" borderColor={COLORS.border} bg={COLORS.surface}>
                    {emb
                      ? <Box position="relative" pt="56.25%"><iframe src={emb} title={v.title || 'Video'} allowFullScreen style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} /></Box>
                      : <Flex as="a" h="180px" align="center" justify="center" direction="column" gap="8px" color={UDEMY.accent} {...{ href: v.url, target: '_blank', rel: 'noopener' }}><Icon as={LuPlay} boxSize="34px" /><Text fontSize="12px">Buka Video</Text></Flex>}
                    {v.title && <Text fontSize="13px" fontWeight="600" color={COLORS.text} px="12px" py="10px">{v.title}</Text>}
                  </Box>
                )
              })}
            </SimpleGrid>
          )}
        </Section>
      )}

      {/* Berita */}
      {berita.length > 0 && (
        <Section id="berita" alt>
          <SectionHead icon={LuNewspaper} kicker="Kabar Terbaru" title="Berita" />
          <Stack gap="20px">
            {berita.map((b) => (
              <Flex key={b.id} gap="18px" direction={{ base: 'column', sm: 'row' }} bg={COLORS.surface} border="1px solid" borderColor={COLORS.border} borderRadius="14px" overflow="hidden">
                {b.image && <Image src={b.image} alt={b.title} w={{ base: 'full', sm: '220px' }} h={{ base: '180px', sm: 'auto' }} objectFit="cover" flexShrink={0} />}
                <Box p="18px">
                  <Heading size="md" color={COLORS.text}>{b.title}</Heading>
                  {b.body && <Text fontSize="14px" color={COLORS.muted} mt="8px" lineHeight="1.8" whiteSpace="pre-wrap">{b.body}</Text>}
                </Box>
              </Flex>
            ))}
          </Stack>
        </Section>
      )}

      {/* PPDB */}
      {ppdbAktif && (
        <Section id="ppdb">
          <SectionHead icon={LuMegaphone} kicker="Penerimaan Peserta Didik Baru" title="PPDB" />
          <Flex gap="24px" direction={{ base: 'column', md: 'row' }} align="flex-start">
            <Stack gap="16px" flex={1}>
              {s?.ppdbInfo && <Text color={COLORS.text} whiteSpace="pre-wrap" lineHeight="1.8">{s.ppdbInfo}</Text>}
              <Flex gap="10px" wrap="wrap">
                {s?.ppdbDaftarUrl && <Button as="a" bg={UDEMY.accent} color="white" _hover={{ bg: UDEMY.accentDark }} {...{ href: s.ppdbDaftarUrl, target: '_blank', rel: 'noopener' }}><Icon as={LuExternalLink} /> Daftar Sekarang</Button>}
                {s?.ppdbBrosur && <Button as="a" variant="outline" {...{ href: s.ppdbBrosur, target: '_blank', rel: 'noopener' }}><Icon as={LuFileText} /> Lihat Brosur</Button>}
                {s?.ppdbPengumuman && isUrl(s.ppdbPengumuman) && <Button as="a" variant="outline" colorPalette="green" {...{ href: s.ppdbPengumuman, target: '_blank', rel: 'noopener' }}><Icon as={LuMegaphone} /> Pengumuman Penerimaan</Button>}
              </Flex>
              {s?.ppdbPengumuman && !isUrl(s.ppdbPengumuman) && (
                <Box bg={COLORS.surface} border="1px solid" borderColor={COLORS.border} borderRadius="12px" p="16px">
                  <Flex align="center" gap="8px" mb="6px" color={UDEMY.accent}><Icon as={LuMegaphone} boxSize="16px" /><Text fontWeight="700" fontSize="13px">Pengumuman Penerimaan</Text></Flex>
                  <Text color={COLORS.text} whiteSpace="pre-wrap" fontSize="14px">{s.ppdbPengumuman}</Text>
                </Box>
              )}
            </Stack>
            {s?.ppdbBrosur && (
              <Box w={{ base: 'full', md: '320px' }} flexShrink={0}>
                <a href={s.ppdbBrosur} target="_blank" rel="noopener noreferrer">
                  <Image src={s.ppdbBrosur} alt="Brosur PPDB" w="full" borderRadius="14px" border="1px solid" borderColor={COLORS.border} cursor="pointer" />
                </a>
                <Text fontSize="11px" color={COLORS.muted} mt="6px" textAlign="center">Klik brosur untuk memperbesar</Text>
              </Box>
            )}
          </Flex>
        </Section>
      )}

      {/* Visi & Misi */}
      {hasVisiMisi && (
        <Section id="visimisi">
          <SectionHead icon={LuTarget} kicker="Arah & Tujuan" title="Visi & Misi" />
          <SimpleGrid columns={{ base: 1, md: 2 }} gap="20px">
            {s?.visi && (
              <Box bg={COLORS.surface} border="1px solid" borderColor={COLORS.border} borderRadius="14px" p="22px">
                <Flex align="center" gap="8px" mb="10px"><Icon as={LuTarget} color={UDEMY.accent} boxSize="20px" /><Heading size="md" color={COLORS.text}>Visi</Heading></Flex>
                <Text color={COLORS.text} whiteSpace="pre-wrap" lineHeight="1.7">{s.visi}</Text>
              </Box>
            )}
            {misiList.length > 0 && (
              <Box bg={COLORS.surface} border="1px solid" borderColor={COLORS.border} borderRadius="14px" p="22px">
                <Flex align="center" gap="8px" mb="12px"><Icon as={LuListChecks} color={UDEMY.accent} boxSize="20px" /><Heading size="md" color={COLORS.text}>Misi</Heading></Flex>
                <Stack gap="10px">
                  {misiList.map((m, i) => (
                    <Flex key={i} gap="10px" align="flex-start">
                      <Flex minW="24px" h="24px" borderRadius="full" bg={UDEMY.accent} color="white" align="center" justify="center" fontSize="12px" fontWeight="700">{i + 1}</Flex>
                      <Text color={COLORS.text} lineHeight="1.5" pt="1px">{m}</Text>
                    </Flex>
                  ))}
                </Stack>
              </Box>
            )}
          </SimpleGrid>
        </Section>
      )}

      {/* Akademik */}
      {hasAkademik && (
        <Section id="akademik">
          <SectionHead icon={LuCalendarDays} kicker="Informasi Akademik" title="Akademik" />
          <SimpleGrid columns={{ base: 1, md: 3 }} gap="20px" alignItems="flex-start">
            {[
              { title: 'Pengumuman', icon: LuMegaphone, items: pengumuman },
              { title: 'Agenda', icon: LuCalendarDays, items: agenda },
              { title: 'Kelulusan', icon: LuGraduationCap, items: kelulusan },
            ].filter((c) => c.items.length > 0).map((col) => (
              <Box key={col.title} bg={COLORS.surface} border="1px solid" borderColor={COLORS.border} borderRadius="14px" p="18px">
                <Flex align="center" gap="8px" mb="14px"><Icon as={col.icon} color={UDEMY.accent} boxSize="18px" /><Heading size="sm" color={COLORS.text}>{col.title}</Heading></Flex>
                <Stack gap="14px">
                  {col.items.map((it) => (
                    <Box key={it.id} borderLeft="3px solid" borderColor={UDEMY.accent} pl="12px">
                      <Text fontSize="14px" fontWeight="700" color={COLORS.text}>{it.title}</Text>
                      {it.subtitle && <Text fontSize="11px" color={UDEMY.accent} fontWeight="600" mt="1px">{it.subtitle}</Text>}
                      {it.body && <Text fontSize="13px" color={COLORS.muted} mt="4px" lineHeight="1.6" whiteSpace="pre-wrap">{it.body}</Text>}
                      {it.url && <Button as="a" size="xs" variant="ghost" color={UDEMY.accent} mt="4px" px="0" {...{ href: it.url, target: '_blank', rel: 'noopener' }}><Icon as={LuExternalLink} /> Selengkapnya</Button>}
                    </Box>
                  ))}
                </Stack>
              </Box>
            ))}
          </SimpleGrid>
        </Section>
      )}

      {/* Kontak + Peta */}
      {hasKontak && (
        <Section id="kontak" alt>
          <SectionHead icon={LuMail} kicker="Hubungi Kami" title="Kontak" />
          <Flex gap="24px" direction={{ base: 'column', md: 'row' }} align="flex-start">
            <Stack gap="12px" flex={1}>
              {s?.email && <Button as="a" variant="outline" justifyContent="flex-start" {...{ href: `mailto:${s.email}` }}><Icon as={LuMail} /> {s.email}</Button>}
              {s?.whatsapp && <Button as="a" colorPalette="green" variant="outline" justifyContent="flex-start" {...{ href: waLink(s.whatsapp), target: '_blank', rel: 'noopener' }}><Icon as={LuMessageCircle} /> {s.whatsapp}</Button>}
              {s?.address && <Flex align="flex-start" gap="8px" color={COLORS.text} fontSize="14px" px="4px"><Icon as={LuMapPin} mt="2px" /> {s.address}</Flex>}
              {mapClick && <Button as="a" variant="ghost" size="sm" color={UDEMY.accent} justifyContent="flex-start" {...{ href: mapClick, target: '_blank', rel: 'noopener' }}><Icon as={LuExternalLink} /> Buka di Google Maps</Button>}
            </Stack>
            {mapQuery && (
              <Box position="relative" w={{ base: 'full', md: '520px' }} h="300px" borderRadius="14px" overflow="hidden" border="1px solid" borderColor={COLORS.border} flexShrink={0}>
                <iframe title="Peta Lokasi" src={`https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`}
                  loading="lazy" style={{ width: '100%', height: '100%', border: 0 }} />
                {mapClick && <a href={mapClick} target="_blank" rel="noopener noreferrer" aria-label="Buka di Google Maps" style={{ position: 'absolute', inset: 0 }} />}
              </Box>
            )}
          </Flex>
        </Section>
      )}

      {/* Footer */}
      <Box bg={UDEMY.ink} color="whiteAlpha.800" py="28px">
        <Box w="full" px={{ base: '20px', md: '40px', xl: '64px' }}>
          <Flex align="center" justify="space-between" gap="12px" wrap="wrap">
            <Flex align="center" gap="10px">
              {s?.logo ? <Image src={s.logo} alt="logo" boxSize="28px" objectFit="contain" /> : <Icon as={LuGraduationCap} boxSize="22px" color={UDEMY.accent} />}
              <Text fontWeight="700" color="white">{title}</Text>
            </Flex>
            <Text fontSize="13px">© {new Date().getFullYear()} {s?.name || title}. Semua hak dilindungi.</Text>
          </Flex>
        </Box>
      </Box>
    </Box>
  )
}
