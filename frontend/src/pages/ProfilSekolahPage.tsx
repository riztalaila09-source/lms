import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Box, Button, Field, Flex, Icon, IconButton, Image, Input, NativeSelect, SimpleGrid, Stack, Tabs, Text, Textarea } from '@chakra-ui/react'
import { LuSave, LuUpload, LuBuilding2, LuImage, LuVideo, LuTarget, LuMapPin, LuMegaphone, LuUsers, LuUser, LuPlus, LuTrash2, LuImages, LuGraduationCap, LuNewspaper, LuCalendarDays } from 'react-icons/lu'
import { schoolClient } from '@/lib/client'
import AppLayout from '@/components/AppLayout'
import { Card } from '@/components/Card'
import ContentListEditor from '@/components/ContentListEditor'
import { COLORS } from '@/theme/tokens'

type StaffRow = { nama: string; jabatan: string; foto: string }

export type PSSection = 'beranda' | 'profil' | 'visimisi' | 'kontak' | 'ppdb' | 'galeri' | 'jurusan' | 'berita' | 'akademik'

const fileToDataURL = (file: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result))
  r.onerror = reject
  r.readAsDataURL(file)
})

const empty = {
  appName: '', logo: '', name: '', npsn: '', status: '', akreditasi: '', jenjang: '', tahunBerdiri: '', address: '',
  profil: '', profilImage: '', profilVideo: '', kepalaSekolah: '', kepalaSekolahFoto: '', visi: '', misi: '', email: '', whatsapp: '', mapsUrl: '',
  ppdbAktif: '', ppdbInfo: '', ppdbBrosur: '', ppdbDaftarUrl: '', ppdbPengumuman: '',
}
type SchoolForm = typeof empty

const META: Record<PSSection, { title: string; sub: string; icon: typeof LuBuilding2 }> = {
  beranda: { title: 'Beranda', sub: 'Identitas, profil, visi & misi, kontak, dan jurusan sekolah', icon: LuBuilding2 },
  profil: { title: 'Profil Sekolah', sub: 'Deskripsi, gambar, video, & kepala sekolah', icon: LuImage },
  visimisi: { title: 'Visi & Misi', sub: 'Visi dan poin-poin misi sekolah', icon: LuTarget },
  kontak: { title: 'Kontak & Lokasi', sub: 'Email, WhatsApp, peta lokasi', icon: LuMapPin },
  ppdb: { title: 'PPDB', sub: 'Informasi Penerimaan Peserta Didik Baru', icon: LuMegaphone },
  galeri: { title: 'Galeri', sub: 'Galeri foto & video (link saja)', icon: LuImages },
  jurusan: { title: 'Jurusan Smekisda', sub: 'Daftar jurusan: nama, deskripsi, foto', icon: LuGraduationCap },
  berita: { title: 'Berita', sub: 'Artikel/berita sekolah', icon: LuNewspaper },
  akademik: { title: 'Akademik', sub: 'Pengumuman, agenda, dan kelulusan', icon: LuCalendarDays },
}

export default function ProfilSekolahPage({ section }: { section: PSSection }) {
  const [f, setForm] = useState<SchoolForm>(empty)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const logoRef = useRef<HTMLInputElement>(null)
  const imgRef = useRef<HTMLInputElement>(null)
  const brosurRef = useRef<HTMLInputElement>(null)
  const kepalaRef = useRef<HTMLInputElement>(null)
  const [staff, setStaff] = useState<StaffRow[]>([])

  // The Beranda page now hosts the Profil tab too, so it needs the staff list.
  const withProfil = section === 'beranda' || section === 'profil'

  useEffect(() => {
    schoolClient.getSchool({}).then((s) => setForm({
      appName: s.appName, logo: s.logo, name: s.name, npsn: s.npsn, status: s.status, akreditasi: s.akreditasi,
      jenjang: s.jenjang, tahunBerdiri: s.tahunBerdiri, address: s.address, profil: s.profil, profilImage: s.profilImage,
      profilVideo: s.profilVideo, kepalaSekolah: s.kepalaSekolah, kepalaSekolahFoto: s.kepalaSekolahFoto, visi: s.visi, misi: s.misi, email: s.email,
      whatsapp: s.whatsapp, mapsUrl: s.mapsUrl, ppdbAktif: s.ppdbAktif, ppdbInfo: s.ppdbInfo, ppdbBrosur: s.ppdbBrosur,
      ppdbDaftarUrl: s.ppdbDaftarUrl, ppdbPengumuman: s.ppdbPengumuman,
    })).catch(() => {})
  }, [])
  useEffect(() => {
    if (!withProfil) return
    schoolClient.listStaff({}).then((r) => setStaff(r.staff.map((x) => ({ nama: x.nama, jabatan: x.jabatan, foto: x.foto })))).catch(() => {})
  }, [withProfil])

  const set = (k: keyof SchoolForm, v: string) => setForm((p) => ({ ...p, [k]: v }))
  const upload = async (file: File, key: keyof SchoolForm) => {
    if (file.size > 512 * 1024) { setErr('Ukuran gambar maksimal 512 KB.'); return }
    try { set(key, await fileToDataURL(file)); setErr('') } catch { setErr('Gagal membaca file.') }
  }
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(''); setErr(''); setSaving(true)
    try {
      await schoolClient.updateSchool({ ...f })
      if (withProfil) await schoolClient.setStaff({ staff: staff.filter((x) => x.nama.trim()) })
      setMsg('Tersimpan.')
    } catch (er: unknown) { setErr(er instanceof Error ? er.message : 'Gagal menyimpan') }
    finally { setSaving(false) }
  }
  // Staff (guru & tata usaha) row helpers.
  const addStaff = () => setStaff((p) => [...p, { nama: '', jabatan: '', foto: '' }])
  const setStaffField = (i: number, k: keyof StaffRow, v: string) => setStaff((p) => p.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const removeStaff = (i: number) => setStaff((p) => p.filter((_, j) => j !== i))
  const uploadStaffFoto = async (i: number, file: File) => {
    if (file.size > 512 * 1024) { setErr('Foto maksimal 512 KB.'); return }
    try { setStaffField(i, 'foto', await fileToDataURL(file)); setErr('') } catch { setErr('Gagal membaca foto.') }
  }

  const meta = META[section]
  const ImgField = ({ label, k, r }: { label: string; k: keyof SchoolForm; r: React.RefObject<HTMLInputElement> }) => (
    <Box>
      <Text fontSize="12px" fontWeight="500" mb="6px">{label}</Text>
      <Flex align="center" gap="10px" wrap="wrap">
        {f[k] ? <Image src={f[k]} alt={label} maxH="90px" maxW="160px" objectFit="contain" borderRadius="8px" border="1px solid" borderColor={COLORS.border} bg="white" />
          : <Flex boxSize="72px" borderRadius="8px" border="1px dashed" borderColor={COLORS.border} align="center" justify="center" color={COLORS.muted}><Icon as={LuImage} boxSize="24px" /></Flex>}
        <Stack gap="6px">
          <Button size="xs" variant="outline" onClick={() => r.current?.click()}><Icon as={LuUpload} /> Unggah</Button>
          {f[k] && <Button size="xs" variant="ghost" colorPalette="red" onClick={() => set(k, '')}>Hapus</Button>}
          <input ref={r} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={(e) => { const file = e.target.files?.[0]; if (file) upload(file, k); if (r.current) r.current.value = '' }} />
        </Stack>
      </Flex>
      <Text fontSize="10px" color={COLORS.muted} mt="4px">Atau tempel URL:</Text>
      <Input size="sm" value={f[k].startsWith('data:') ? '' : f[k]} onChange={(e) => set(k, e.target.value)} placeholder="https://…" mt="2px" />
    </Box>
  )

  // ── School-field section bodies (share the same form state + Save) ──
  const berandaBody = (<>
    <Flex gap="16px" wrap="wrap" align="flex-start">
      <ImgField label="Logo Sekolah" k="logo" r={logoRef} />
      <Field.Root flex={1} minW="220px"><Field.Label fontSize="12px">Nama Aplikasi</Field.Label>
        <Input value={f.appName} onChange={(e) => set('appName', e.target.value)} placeholder="mis. e-Learning SMK …" />
        <Text fontSize="10px" color={COLORS.muted} mt="4px">Tampil di halaman depan & login.</Text></Field.Root>
    </Flex>
    <SimpleGrid columns={{ base: 1, md: 2 }} gap="12px">
      <Field.Root><Field.Label fontSize="12px">Nama Sekolah</Field.Label><Input value={f.name} onChange={(e) => set('name', e.target.value)} /></Field.Root>
      <Field.Root><Field.Label fontSize="12px">NPSN</Field.Label><Input value={f.npsn} onChange={(e) => set('npsn', e.target.value)} /></Field.Root>
      <Field.Root><Field.Label fontSize="12px">Status</Field.Label>
        <NativeSelect.Root><NativeSelect.Field value={f.status} onChange={(e) => set('status', e.target.value)}>
          <option value="">—</option><option value="Negeri">Negeri</option><option value="Swasta">Swasta</option>
        </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root></Field.Root>
      <Field.Root><Field.Label fontSize="12px">Akreditasi</Field.Label><Input value={f.akreditasi} onChange={(e) => set('akreditasi', e.target.value)} placeholder="A / B / C" /></Field.Root>
      <Field.Root><Field.Label fontSize="12px">Jenjang</Field.Label><Input value={f.jenjang} onChange={(e) => set('jenjang', e.target.value)} placeholder="SD / SMP / SMA / SMK" /></Field.Root>
      <Field.Root><Field.Label fontSize="12px">Tahun Berdiri</Field.Label><Input value={f.tahunBerdiri} onChange={(e) => set('tahunBerdiri', e.target.value)} placeholder="mis. 1998" /></Field.Root>
      <Field.Root><Field.Label fontSize="12px">Alamat</Field.Label><Input value={f.address} onChange={(e) => set('address', e.target.value)} /></Field.Root>
    </SimpleGrid>
  </>)

  const profilBody = (<>
    <Field.Root><Field.Label fontSize="12px">Profil Sekolah</Field.Label>
      <Textarea rows={6} value={f.profil} onChange={(e) => set('profil', e.target.value)} placeholder="Deskripsi sekolah…" /></Field.Root>
    <ImgField label="Gambar Profil" k="profilImage" r={imgRef} />
    <Field.Root><Field.Label fontSize="12px"><Icon as={LuVideo} /> Video (link YouTube/embed)</Field.Label>
      <Input value={f.profilVideo} onChange={(e) => set('profilVideo', e.target.value)} placeholder="https://youtube.com/watch?v=…" /></Field.Root>
    <Flex gap="16px" wrap="wrap" align="flex-start">
      <ImgField label="Foto Kepala Sekolah" k="kepalaSekolahFoto" r={kepalaRef} />
      <Field.Root flex={1} minW="220px"><Field.Label fontSize="12px">Nama Kepala Sekolah</Field.Label>
        <Input value={f.kepalaSekolah} onChange={(e) => set('kepalaSekolah', e.target.value)} /></Field.Root>
    </Flex>

    {/* Daftar Guru & Tata Usaha */}
    <Box borderTop="1px solid" borderColor={COLORS.border} pt="14px">
      <Flex align="center" gap="8px" mb="4px"><Icon as={LuUsers} color={COLORS.primary} /><Text fontWeight="700">Daftar Guru & Tata Usaha</Text></Flex>
      <Text fontSize="11px" color={COLORS.muted} mb="10px">Foto, nama, dan jabatan (mis. "Guru Matematika", "Kepala TU"). Tampil di halaman depan.</Text>
      <Stack gap="8px">
        {staff.length === 0 && <Text fontSize="12px" color={COLORS.muted}>Belum ada. Klik "Tambah" untuk menambah.</Text>}
        {staff.map((row, i) => (
          <Flex key={i} gap="8px" align="center" wrap="wrap">
            <Box as="label" cursor="pointer" flexShrink={0}>
              <input type="file" accept="image/*" style={{ display: 'none' }}
                onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadStaffFoto(i, file); e.currentTarget.value = '' }} />
              {row.foto
                ? <Image src={row.foto} alt="foto" boxSize="44px" borderRadius="full" objectFit="cover" border="1px solid" borderColor={COLORS.border} />
                : <Flex boxSize="44px" borderRadius="full" border="1px dashed" borderColor={COLORS.border} align="center" justify="center" color={COLORS.muted}><Icon as={LuUser} /></Flex>}
            </Box>
            <Input flex={1} minW="140px" size="sm" placeholder="Nama" value={row.nama} onChange={(e) => setStaffField(i, 'nama', e.target.value)} />
            <Input flex={1} minW="160px" size="sm" placeholder="Jabatan (mis. Guru Matematika)" value={row.jabatan} onChange={(e) => setStaffField(i, 'jabatan', e.target.value)} />
            <IconButton size="sm" variant="outline" colorPalette="red" aria-label="Hapus" onClick={() => removeStaff(i)}><Icon as={LuTrash2} /></IconButton>
          </Flex>
        ))}
      </Stack>
      <Button size="sm" variant="outline" mt="10px" onClick={addStaff}><Icon as={LuPlus} /> Tambah</Button>
    </Box>
  </>)

  const visimisiBody = (<>
    <Field.Root><Field.Label fontSize="12px">Visi</Field.Label><Textarea rows={4} value={f.visi} onChange={(e) => set('visi', e.target.value)} /></Field.Root>
    <Field.Root><Field.Label fontSize="12px">Misi <Text as="span" color={COLORS.muted} fontSize="10px">(satu poin per baris)</Text></Field.Label>
      <Textarea rows={6} value={f.misi} onChange={(e) => set('misi', e.target.value)} placeholder={'Misi 1\nMisi 2\nMisi 3'} /></Field.Root>
  </>)

  const kontakBody = (<>
    <SimpleGrid columns={{ base: 1, md: 2 }} gap="12px">
      <Field.Root><Field.Label fontSize="12px">Email</Field.Label><Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field.Root>
      <Field.Root><Field.Label fontSize="12px">WhatsApp</Field.Label><Input value={f.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} placeholder="08…" /></Field.Root>
      <Field.Root><Field.Label fontSize="12px">Alamat</Field.Label><Input value={f.address} onChange={(e) => set('address', e.target.value)} /></Field.Root>
      <Field.Root><Field.Label fontSize="12px"><Icon as={LuMapPin} /> Link Google Maps</Field.Label>
        <Input value={f.mapsUrl} onChange={(e) => set('mapsUrl', e.target.value)} placeholder="https://maps.app.goo.gl/… atau alamat" /></Field.Root>
    </SimpleGrid>
    <Text fontSize="11px" color={COLORS.muted}>Peta ditampilkan di halaman depan; klik peta membuka Google Maps. Jika kosong, alamat dipakai untuk peta.</Text>
  </>)

  const ppdbBody = (<>
    <Field.Root maxW="220px"><Field.Label fontSize="12px">Status PPDB</Field.Label>
      <NativeSelect.Root><NativeSelect.Field value={f.ppdbAktif} onChange={(e) => set('ppdbAktif', e.target.value)}>
        <option value="">Nonaktif (sembunyikan)</option><option value="1">Aktif (tampilkan di depan)</option>
      </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root></Field.Root>
    <Field.Root><Field.Label fontSize="12px">Informasi PPDB</Field.Label>
      <Textarea rows={5} value={f.ppdbInfo} onChange={(e) => set('ppdbInfo', e.target.value)} placeholder="Jadwal, jalur pendaftaran, syarat…" /></Field.Root>
    <ImgField label="Brosur PPDB (gambar)" k="ppdbBrosur" r={brosurRef} />
    <Field.Root><Field.Label fontSize="12px">Link Daftar Sekarang</Field.Label>
      <Input value={f.ppdbDaftarUrl} onChange={(e) => set('ppdbDaftarUrl', e.target.value)} placeholder="https://form pendaftaran…" /></Field.Root>
    <Field.Root><Field.Label fontSize="12px">Pengumuman Penerimaan</Field.Label>
      <Textarea rows={4} value={f.ppdbPengumuman} onChange={(e) => set('ppdbPengumuman', e.target.value)} placeholder="Teks pengumuman, atau tempel link pengumuman…" /></Field.Root>
  </>)

  const saveRow = (
    <Flex align="center" gap="12px">
      <Button type="submit" loading={saving} bg={COLORS.primary} color="white" _hover={{ bg: COLORS.primaryDark }}><Icon as={LuSave} /> Simpan</Button>
      {err && <Text color={COLORS.danger} fontSize="12px">{err}</Text>}
      {msg && <Text color={COLORS.success} fontSize="12px">{msg}</Text>}
    </Flex>
  )
  // Wrap a school-field body in its own Card + form (used both standalone and inside the Beranda tabs).
  const formCard = (body: ReactNode) => (
    <Card>
      <form onSubmit={save}><Stack gap="14px" maxW="820px">{body}{saveRow}</Stack></form>
    </Card>
  )

  const jurusanEditor = (
    <Stack gap="16px" maxW="860px">
      <ContentListEditor type="jurusan" title="Jurusan Smekisda" icon={LuGraduationCap} addLabel="Tambah Jurusan"
        fields={[
          { key: 'image', label: 'Foto Jurusan', kind: 'image-upload' },
          { key: 'title', label: 'Nama Jurusan', kind: 'text', placeholder: 'mis. Teknik Komputer & Jaringan' },
          { key: 'body', label: 'Deskripsi', kind: 'textarea', placeholder: 'Deskripsi jurusan…' },
        ]} />
    </Stack>
  )

  const contentSections: Record<string, ReactNode> = {
    galeri: (
      <Stack gap="16px" maxW="860px">
        <ContentListEditor type="galeri_foto" title="Galeri Foto" icon={LuImage} addLabel="Tambah Foto"
          note="Tempel URL/link gambar (tidak mengunggah file). Bisa lebih dari satu."
          fields={[
            { key: 'image', label: 'Link Foto', kind: 'image-link', placeholder: 'https://…/foto.jpg' },
            { key: 'title', label: 'Keterangan (opsional)', kind: 'text', placeholder: 'mis. Upacara HUT RI' },
          ]} />
        <ContentListEditor type="galeri_video" title="Galeri Video" icon={LuVideo} addLabel="Tambah Video"
          note="Tempel link video (YouTube dll). Bisa lebih dari satu."
          fields={[
            { key: 'url', label: 'Link Video', kind: 'url', placeholder: 'https://youtube.com/watch?v=…' },
            { key: 'title', label: 'Judul (opsional)', kind: 'text', placeholder: 'mis. Profil Sekolah' },
          ]} />
      </Stack>
    ),
    berita: (
      <Stack gap="16px" maxW="860px">
        <ContentListEditor type="berita" title="Berita" icon={LuNewspaper} addLabel="Tambah Berita"
          note="Tulis artikel/berita sekolah. Gambar cover opsional."
          fields={[
            { key: 'image', label: 'Gambar Cover (opsional)', kind: 'image-upload' },
            { key: 'title', label: 'Judul Berita', kind: 'text', placeholder: 'Judul…' },
            { key: 'body', label: 'Artikel', kind: 'textarea', placeholder: 'Tulis isi artikel di sini…' },
          ]} />
      </Stack>
    ),
    akademik: (
      <Stack gap="16px" maxW="860px">
        <ContentListEditor type="pengumuman" title="Pengumuman" icon={LuMegaphone} addLabel="Tambah Pengumuman"
          fields={[
            { key: 'title', label: 'Judul', kind: 'text' },
            { key: 'subtitle', label: 'Tanggal', kind: 'text', placeholder: 'mis. 17 Juli 2026' },
            { key: 'body', label: 'Isi', kind: 'textarea' },
          ]} />
        <ContentListEditor type="agenda" title="Agenda" icon={LuCalendarDays} addLabel="Tambah Agenda"
          fields={[
            { key: 'title', label: 'Judul', kind: 'text' },
            { key: 'subtitle', label: 'Tanggal / Waktu', kind: 'text', placeholder: 'mis. 20 Juli 2026, 08.00' },
            { key: 'body', label: 'Keterangan', kind: 'textarea' },
          ]} />
        <ContentListEditor type="kelulusan" title="Kelulusan" icon={LuGraduationCap} addLabel="Tambah Info Kelulusan"
          fields={[
            { key: 'title', label: 'Judul', kind: 'text', placeholder: 'mis. Pengumuman Kelulusan 2026' },
            { key: 'body', label: 'Isi / Informasi', kind: 'textarea' },
            { key: 'url', label: 'Link Pengumuman (opsional)', kind: 'url', placeholder: 'https://…' },
          ]} />
      </Stack>
    ),
  }

  // Beranda now hosts tabs: Beranda / Profil / Visi & Misi / Kontak / Jurusan Smekisda.
  if (section === 'beranda') {
    return (
      <AppLayout title={<><Icon as={meta.icon} /> {meta.title}</>} subtitle={meta.sub}>
        <Tabs.Root defaultValue="beranda" maxW="900px">
          <Tabs.List flexWrap="wrap">
            <Tabs.Trigger value="beranda"><Icon as={LuBuilding2} /> Beranda</Tabs.Trigger>
            <Tabs.Trigger value="profil"><Icon as={LuImage} /> Profil</Tabs.Trigger>
            <Tabs.Trigger value="visimisi"><Icon as={LuTarget} /> Visi & Misi</Tabs.Trigger>
            <Tabs.Trigger value="kontak"><Icon as={LuMapPin} /> Kontak</Tabs.Trigger>
            <Tabs.Trigger value="jurusan"><Icon as={LuGraduationCap} /> Jurusan Smekisda</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="beranda">{formCard(berandaBody)}</Tabs.Content>
          <Tabs.Content value="profil">{formCard(profilBody)}</Tabs.Content>
          <Tabs.Content value="visimisi">{formCard(visimisiBody)}</Tabs.Content>
          <Tabs.Content value="kontak">{formCard(kontakBody)}</Tabs.Content>
          <Tabs.Content value="jurusan">{jurusanEditor}</Tabs.Content>
        </Tabs.Root>
      </AppLayout>
    )
  }

  if (section === 'jurusan') {
    return <AppLayout title={<><Icon as={meta.icon} /> {meta.title}</>} subtitle={meta.sub}>{jurusanEditor}</AppLayout>
  }
  if (contentSections[section]) {
    return (
      <AppLayout title={<><Icon as={meta.icon} /> {meta.title}</>} subtitle={meta.sub}>
        {contentSections[section]}
      </AppLayout>
    )
  }

  // Standalone school-field sections (ppdb, plus profil/visimisi/kontak if opened directly).
  const body = section === 'profil' ? profilBody
    : section === 'visimisi' ? visimisiBody
    : section === 'kontak' ? kontakBody
    : ppdbBody
  return (
    <AppLayout title={<><Icon as={meta.icon} /> {meta.title}</>} subtitle={meta.sub}>
      {formCard(body)}
    </AppLayout>
  )
}
